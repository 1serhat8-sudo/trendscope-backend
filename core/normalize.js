function normalizeYouTubeData(items) {
  console.log('Normalize öncesi ham veri uzunluğu:', items?.length || 0);

  return (items || [])
    .filter(item => item && item.snippet) // sadece snippet kontrolü
    .map(item => ({
      id: item.id?.videoId || item.id, // videoId yoksa id'yi direkt yaz
      title: item.snippet.title || '',
      channel: item.snippet.channelTitle || '',
      thumbnail: item.snippet.thumbnails?.medium?.url || '',
      publishedAt: item.snippet.publishedAt || '',
      platform: 'youtube'
    }));
}

module.exports = { normalizeYouTubeData };
