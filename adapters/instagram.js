const fetch = require('node-fetch');

function headers() {
  return {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    'Accept': '*/*',
    'Referer': 'https://www.instagram.com/',
  };
}

async function resolveInstagramPlayback(doc) {
  const candidate = doc.video_url || doc.playback_url;
  if (candidate) {
    return { url: candidate, expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(), status: 'ok' };
  }

  // TODO: post id üzerinden yeni url çıkarma
  return { url: null, expiresAt: null, status: 'error' };
}

module.exports = { resolveInstagramPlayback };
