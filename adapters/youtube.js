const axios = require('axios');

async function fetchYouTubeVideos({ query, regionCode = 'TR', maxResults = 50 }) {
  const API_KEY = process.env.YOUTUBE_API_KEY;

  // 1) Arama isteği
  const searchUrl = 'https://www.googleapis.com/youtube/v3/search';
  const searchRes = await axios.get(searchUrl, {
    params: {
      key: API_KEY,
      part: 'snippet',
      q: query,
      regionCode,
      maxResults,
      type: 'video',
      order: 'date'
    }
  });

  const items = searchRes.data.items || [];
  const videoIds = items.map(item => item.id.videoId).filter(Boolean).join(',');
  if (!videoIds) return [];

  // 2) İstatistik isteği
  const statsUrl = 'https://www.googleapis.com/youtube/v3/videos';
  const statsRes = await axios.get(statsUrl, {
    params: {
      key: API_KEY,
      part: 'statistics',
      id: videoIds
    }
  });

  const statsMap = {};
  (statsRes.data.items || []).forEach(statItem => {
    statsMap[statItem.id] = statItem.statistics;
  });

  // 3) Snippet + istatistikleri birleştir
  const merged = items.map(item => {
    const rawId = item.id.videoId;
    const cleanId = (rawId || '').toString().replace(/^yt_/, '');

    // ✅ Varsayılan Shorts formatı
    let originalUrl = `https://www.youtube.com/shorts/${cleanId}`;
    let playbackUrl = originalUrl;

    // Eğer ileride playbackType sinyali gelirse watch?v= kullanılabilir
    if (item.playbackType === 'video') {
      originalUrl = `https://www.youtube.com/watch?v=${cleanId}`;
      playbackUrl = originalUrl;
    }

    return {
      id: cleanId, // ✅ normalize için doğru ID
      youtube_id: cleanId, // ✅ normalize.js için ek alan
      title: item.snippet.title,
      channel: item.snippet.channelTitle,
      thumbnailUrl: item.snippet.thumbnails?.medium?.url || '',
      publishedAt: item.snippet.publishedAt,
      platform: 'youtube',

      // ✅ playback/original alanları
      originalUrl,
      playbackUrl,

      // ✅ metrikler
      viewCount: Number(statsMap[cleanId]?.viewCount || 0),
      likeCount: Number(statsMap[cleanId]?.likeCount || 0),
      dislikeCount: Number(statsMap[cleanId]?.dislikeCount || 0)
    };
  });

  return merged;
}

module.exports = { fetchYouTubeVideos };
