import webpush from 'web-push';

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Comma-separated list in the ADMIN_EMAILS env var; falls back to your admin email.
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '5251170066@st.uew.edu.gh')
  .split(',').map(e => e.trim().toLowerCase()).filter(Boolean);

const dbHeaders = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };

// Only a logged-in admin may broadcast.
async function isAdmin(req) {
  const auth  = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return false;
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${token}` }
  });
  if (!r.ok) return false;
  const user = await r.json();
  return ADMIN_EMAILS.includes(String(user.email || '').toLowerCase());
}

// Read every row (Supabase returns at most 1000 per request).
async function fetchAllSubs(table) {
  const rows = [];
  const PAGE = 1000;
  for (let offset = 0; ; offset += PAGE) {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/${table}?select=subscription&order=created_at.asc&limit=${PAGE}&offset=${offset}`,
      { headers: dbHeaders }
    );
    if (!r.ok) {
      // guest table may not exist yet — don't break broadcasts to account users
      if (table === 'guest_push_subscriptions') return rows;
      throw new Error(`Failed to read ${table}: ${r.status}`);
    }
    const page = await r.json();
    rows.push(...page);
    if (page.length < PAGE) break;
  }
  return rows;
}

async function removeDead(endpoint) {
  const enc = encodeURIComponent(endpoint);
  await Promise.allSettled([
    fetch(`${SUPABASE_URL}/rest/v1/guest_push_subscriptions?endpoint=eq.${enc}`,
      { method: 'DELETE', headers: dbHeaders }),
    fetch(`${SUPABASE_URL}/rest/v1/push_subscriptions?subscription->>endpoint=eq.${enc}`,
      { method: 'DELETE', headers: dbHeaders })
  ]);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    if (!(await isAdmin(req))) return res.status(401).json({ error: 'Admin login required' });

    const { title, body, url } = req.body || {};
    if (!title || !body) {
      return res.status(400).json({ error: 'Title and body are required' });
    }

    const [users, guests] = await Promise.all([
      fetchAllSubs('push_subscriptions'),
      fetchAllSubs('guest_push_subscriptions')
    ]);

    // One push per device, even if someone is both a guest row and an account row.
    const byEndpoint = new Map();
    users.forEach(r => r.subscription?.endpoint && byEndpoint.set(r.subscription.endpoint, { sub: r.subscription, guest: false }));
    guests.forEach(r => r.subscription?.endpoint && !byEndpoint.has(r.subscription.endpoint) &&
      byEndpoint.set(r.subscription.endpoint, { sub: r.subscription, guest: true }));

    const targets = [...byEndpoint.values()];
    if (targets.length === 0) {
      return res.status(200).json({ success: true, sent: 0, failed: 0, guests: 0, message: 'No subscribers found' });
    }

    const payload = JSON.stringify({
      title,
      body,
      icon:  '/icons/icon-192.png',
      badge: '/icons/icon-96.png',
      url:   url || '/'
    });

    let sent = 0, failed = 0, guestsSent = 0;
    const dead = [];

    // Send in batches so thousands of subscribers don't open thousands of connections at once.
    const BATCH = 50;
    for (let i = 0; i < targets.length; i += BATCH) {
      await Promise.allSettled(
        targets.slice(i, i + BATCH).map(async (t) => {
          try {
            await webpush.sendNotification(t.sub, payload);
            sent++;
            if (t.guest) guestsSent++;
          } catch (err) {
            failed++;
            if (err.statusCode === 404 || err.statusCode === 410) dead.push(t.sub.endpoint);
            else console.error('Push failed:', err.statusCode, err.message);
          }
        })
      );
    }

    // Clean out subscriptions the browser says no longer exist.
    await Promise.allSettled(dead.map(removeDead));

    return res.status(200).json({ success: true, sent, failed, guests: guestsSent, removed: dead.length });

  } catch (err) {
    console.error('push-all error:', err);
    return res.status(500).json({ error: err.message });
  }
}