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
      maxResults,        // 50'ye kadar artırdık
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
  const merged = items.map(item => ({
    id: item.id.videoId,
    title: item.snippet.title,
    channel: item.snippet.channelTitle,
    thumbnail: item.snippet.thumbnails?.medium?.url || '',
    publishedAt: item.snippet.publishedAt,
    platform: 'youtube',
    viewCount: Number(statsMap[item.id.videoId]?.viewCount || 0),
    likeCount: Number(statsMap[item.id.videoId]?.likeCount || 0),
    dislikeCount: Number(statsMap[item.id.videoId]?.dislikeCount || 0)
  }));

  // DEBUG (isteğe bağlı): console.log(`YouTube birleşik sonuç: ${merged.length}`);
  return merged;
}

module.exports = { fetchYouTubeVideos };
