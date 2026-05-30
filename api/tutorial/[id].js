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
  <script>window.location.href = '/tutorials.html?tutorial=${id}';</script>
</head>
<body>Redirecting...</body>
</html>`);
  } catch (err) {
    return res.redirect(302, '/tutorials.html');
  }
}
