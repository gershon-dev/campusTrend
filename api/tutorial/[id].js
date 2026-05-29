export default async function handler(req, res) {
  const { id } = req.query;

  try {
    const response = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/posts?id=eq.${id}&select=content,media_url,image_url,profiles(full_name)&limit=1`,
      {
        headers: {
          'apikey': process.env.SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`,
        }
      }
    );

    const data = await response.json();
    const post = data[0];

    if (!post) return res.redirect(302, '/index.html');

    const title = post.profiles?.full_name
      ? `${post.profiles.full_name} on CampusTrend UEW`
      : 'CampusTrend UEW';
    const description = post.content ? post.content.slice(0, 200) : 'Check out this post on CampusTrend UEW';
    const image = post.media_url || post.image_url || 'https://campustrend-uew.vercel.app/icons/icon-512.png';
    const url = `https://campustrend-uew.vercel.app/api/post/${id}`;

    res.setHeader('Content-Type', 'text/html');
    return res.send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <meta property="og:type" content="article">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${description}">
  <meta property="og:image" content="${image}">
  <meta property="og:url" content="${url}">
  <meta property="og:site_name" content="CampusTrend UEW">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${description}">
  <meta name="twitter:image" content="${image}">
  <meta http-equiv="refresh" content="0;url=/index.html?post=${id}">
</head>
<body>Redirecting...</body>
</html>`);
  } catch (err) {
    return res.redirect(302, '/index.html');
  }
}
