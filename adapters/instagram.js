const fetch = require('node-fetch');

function headers(hostname = 'www.instagram.com', cookie = '') {
  return {
    'User-Agent': 'Mozilla/5.0 (Linux; Android 10; Mobile) Chrome/90.0 Safari/537.36',
    'Accept': '*/*',
    'Referer': `https://${hostname}/`,
    'Origin': `https://${hostname}`,
    'sec-fetch-mode': 'navigate',
    'sec-fetch-site': 'same-origin',
    'accept-language': 'en-US,en;q=0.9',
    ...(cookie ? { 'Cookie': cookie } : {})
  };
}

async function resolveInstagramPlayback(doc) {
  const candidate = doc.video_url || doc.playback_url;

  // ✅ Orijinal URL fallback — normalize ile uyumlu
  let originalUrl = doc.originalUrl || doc.permalink;
  if (!originalUrl && doc.shortcode) {
    originalUrl = `https://www.instagram.com/reel/${doc.shortcode}/`;
  }

  if (candidate) {
    return {
      url: candidate,
      originalUrl,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // ✅ 24 saat
      status: 'ok',
      thumbnail: doc.thumbnail || doc.cover || "https://yourdomain.com/default_thumbnail.jpg",
      caption: doc.caption || doc.title || "Başlık yok",
      user: doc.user || doc.author || "Unknown",
      musicTitle: doc.musicTitle || "Bilinmiyor"
    };
  }

  console.warn(`[Instagram] playback URL bulunamadı shortcode=${doc.shortcode || doc.id}`);
  return {
    url: null,
    originalUrl,
    expiresAt: null,
    status: 'error',
    thumbnail: doc.thumbnail || "https://yourdomain.com/default_thumbnail.jpg",
    caption: doc.caption || "Başlık yok",
    user: doc.user || "Unknown",
    musicTitle: doc.musicTitle || "Bilinmiyor"
  };
}

module.exports = { resolveInstagramPlayback, headers };
