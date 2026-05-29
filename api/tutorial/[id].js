import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
  const { id } = req.query;

  try {
    const { data: tutorial, error } = await supabase
      .from('tutorials')
      .select('*, profiles(full_name, avatar_url)')
      .eq('id', id)
      .single();

    if (error || !tutorial) {
      return res.redirect(302, '/tutorials.html');
    }

    const title = tutorial.title
      ? `${tutorial.title} – CampusTrend UEW`
      : 'CampusTrend UEW Tutorial';
    const description = tutorial.description
      ? tutorial.description.slice(0, 200)
      : 'Watch this tutorial on CampusTrend UEW';
    const image = 'https://campustrend-uew.vercel.app/icons/icon-512.png';
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
  <meta http-equiv="refresh" content="0;url=/tutorials.html?tutorial=${id}">
</head>
<body>Redirecting...</body>
</html>`);
  } catch (err) {
    return res.redirect(302, '/tutorials.html');
  }
}
