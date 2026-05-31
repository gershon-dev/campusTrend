import webpush from 'web-push';

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { subscription, title, body, icon } = req.body;

  try {
    await webpush.sendNotification(
      subscription,
      JSON.stringify({
        title: title || 'CampusTrend UEW',
        body:  body  || 'You have a new notification',
        icon:  icon  || '/icons/icon-192.png',
        badge: '/icons/icon-96.png',
        url:   '/'
      })
    );
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Push error:', err);
    return res.status(500).json({ error: err.message });
  }
}
