const fetch = require('node-fetch');

// Header setleri: 403/geo-block azaltmak için
function headers(hostname = 'www.tiktok.com', cookie = '') {
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

async function resolveTikTokPlayback(doc) {
  const candidate = doc.video_url || doc.playback_url;

  // ✅ TikTok video ID doğru alanlardan alınmalı ve tt_ prefix temizlenmeli
  const rawId = doc.video_id || doc.aweme_id || doc.id || null;
  const cleanId = rawId ? rawId.toString().replace(/^tt_/, '') : null;

  // ✅ Orijinal URL fallback
  let originalUrl = doc.originalUrl || doc.shareUrl;
  if (!originalUrl && cleanId) {
    originalUrl = `https://www.tiktok.com/@${doc.user || 'unknown'}/video/${cleanId}`;
  }

  if (candidate) {
    return {
      url: candidate,
      originalUrl,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // ✅ 24 saat
      status: 'ok',
      thumbnail: doc.thumbnail || doc.cover || "https://yourdomain.com/default_thumbnail.jpg",
      caption: doc.caption || doc.desc || "Başlık yok",
      user: doc.user || doc.author || "Unknown",
      musicTitle: doc.musicTitle || doc.sound?.title || "Bilinmiyor"
    };
  }

  console.warn(`[TikTok] playback URL bulunamadı videoId=${cleanId || doc.id}`);
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

module.exports = { resolveTikTokPlayback, headers };
