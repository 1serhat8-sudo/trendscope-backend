const fetch = require('node-fetch');

// Not: Gerçek dünyada burada sayfa veya JSON config’ten playable URL çıkarılır.
// Header’larla 403/geo-block azaltılır.

function headers() {
  return {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    'Accept': '*/*',
    'Referer': 'https://www.tiktok.com/',
  };
}

async function resolveTikTokPlayback(doc) {
  // Eğer mevcut video_url çalışıyorsa onu kullan; değilse yenisini dene
  const candidate = doc.video_url || doc.playback_url;
  if (candidate) {
    // Basit doğrulama: sadece döndür (ileride HEAD isteği ile 200 kontrolü yapılır)
    return { url: candidate, expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(), status: 'ok' };
  }

  // TODO: platform ID’den yeni playable URL çıkarma mantığı
  // Şimdilik stub: yoksa error
  return { url: null, expiresAt: null, status: 'error' };
}

module.exports = { resolveTikTokPlayback };
