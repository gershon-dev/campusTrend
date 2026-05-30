export default async function handler(req, res) {
  const { id } = req.query;

  try {
    const response = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/tutorials?id=eq.${id}&select=title,description,video_url,thumbnail_url,profiles(full_name)&limit=1`,
      {
        headers: {
          'apikey': process.env.SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`,
        }
      }
    );

    const data = await response.json();
    const tutorial = data[0];

    if (!tutorial) return res.redirect(302, '/tutorials.html');

    const title = tutorial.title
      ? `${tutorial.title} – CampusTrend UEW`
      : 'CampusTrend UEW Tutorial';
    const description = tutorial.description
      ? tutorial.description.slice(0, 200)
      : 'Watch this tutorial on CampusTrend UEW';

    let image = 'https://campustrend-uew.vercel.app/icons/icon-512.png';
if (tutorial.thumbnail_url && !tutorial.thumbnail_url.includes('drive.google.com')) {
  image = tutorial.thumbnail_url;
} else if (tutorial.video_url && tutorial.video_url.includes('res.cloudinary.com')) {
  image = tutorial.video_url.replace('/video/upload/', '/video/upload/so_0/').replace(/\.(mp4|webm|mov)$/, '.jpg');
}
    if (image && image.includes('res.cloudinary.com') && (image.endsWith('.mp4') || image.endsWith('.webm') || image.includes('/video/upload/'))) {
      image = image.replace('/video/upload/', '/video/upload/so_0/').replace(/\.(mp4|webm|mov)$/, '.jpg');
    }

    const url = `https://campustrend-uew.vercel.app/api/tutorial/${id}`;

   res.setHeader('Content-Type', 'text/html');
return res.send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <meta property="og:type" content="video.other">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${description}">
  <meta property="og:image" content="${image}">
  <meta property="og:url" content="${url}">
  <meta property="og:site_name" content="CampusTrend UEW">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${description}">
  <meta name="twitter:image" content="${image}">
</head>
<body style="margin:0;font-family:sans-serif;background:#f0f2f5;display:flex;align-items:center;justify-content:center;min-height:100vh;">
  <div style="background:#fff;border-radius:12px;padding:32px;max-width:480px;width:90%;text-align:center;box-shadow:0 2px 12px rgba(0,0,0,0.1);">
    <div style="font-size:48px;margin-bottom:16px;">🎓</div>
    <div style="font-size:11px;color:#1877f2;font-weight:600;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">CampusTrend UEW</div>
    <h1 style="font-size:20px;margin:0 0 12px;color:#1c1e21;">${title}</h1>
    <p style="color:#65676b;font-size:14px;margin:0 0 24px;">${description}</p>
    <a href="/tutorials.html?tutorial=${id}" style="display:inline-block;background:#1877f2;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;">▶ Watch Tutorial</a>
  </div>
</body>
</html>`);
  } catch (err) {
    return res.redirect(302, '/tutorials.html');
  }
}
