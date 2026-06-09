import webpush from 'web-push';

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { title, body, url } = req.body;

  if (!title || !body) {
    return res.status(400).json({ error: 'Title and body are required' });
  }

  try {
    // Fetch all push subscriptions using service role key
    const response = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/push_subscriptions?select=subscription`,
      {
        headers: {
          'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        }
      }
    );

    const subscriptions = await response.json();

    if (!subscriptions || subscriptions.length === 0) {
      return res.status(200).json({ success: true, sent: 0, message: 'No subscribers found' });
    }

    const payload = JSON.stringify({
      title: title,
      body:  body,
      icon:  '/icons/icon-192.png',
      badge: '/icons/icon-96.png',
      url:   url || '/'
    });

    let sent = 0;
    let failed = 0;

    await Promise.allSettled(
      subscriptions.map(async (row) => {
        try {
          await webpush.sendNotification(row.subscription, payload);
          sent++;
        } catch (err) {
          failed++;
          console.error('Push failed:', err.message);
        }
      })
    );

    return res.status(200).json({ success: true, sent, failed });

  } catch (err) {
    console.error('push-all error:', err);
    return res.status(500).json({ error: err.message });
  }
}
