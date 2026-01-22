function normalize(doc) {
  const m = doc.metrics || {};
  const mongoId = doc._id ? doc._id.toString() : '';
  const platform = (doc.platform || 'unknown').toLowerCase();

  const igId = doc.shortcode || doc.code || null;
  const rawTikTokId = doc.video_id || doc.aweme_id || doc.id || "";
  const rawYtId = doc.video_id || doc.youtube_id || doc.id || "";

  let originalUrl = (doc.originalUrl || doc.video_url || '').trim();
  let appLaunchUrl = '';

  if (platform === 'instagram') {
    const reelFromUrl = (originalUrl.includes('/reel/'))
      ? originalUrl.split('/reel/')[1]?.split('/')[0]
      : null;
    const reelId = reelFromUrl || igId;
    if (reelId) {
      appLaunchUrl = `instagram://reel/${reelId}`;
      originalUrl = `https://www.instagram.com/reel/${reelId}`;
    }
  } else if (platform === 'tiktok') {
    const cleanId = rawTikTokId.replace(/^tt_/, "");
    if (cleanId) {
      appLaunchUrl = `tiktok://v/${cleanId}`;
      const username = doc.user || "unknown";
      originalUrl = `https://www.tiktok.com/@${username}/video/${cleanId}`;
    }
  } else if (platform === 'youtube') {
    const cleanId = rawYtId.replace(/^yt_/, "");
    if (cleanId) {
      appLaunchUrl = `vnd.youtube:${cleanId}`;
      // ✅ Shorts formatı kullanılıyor
      originalUrl = `https://www.youtube.com/shorts/${cleanId}`;
    }
  }

  return {
    id: mongoId,
    platform,
    title: doc.title || doc.caption || 'Başlık yok',
    thumbnailUrl: doc.thumbnailUrl || doc.image_url || 'https://yourdomain.com/default_thumbnail.jpg',
    playbackUrl: doc.playbackUrl || doc.playback_url || null,
    originalUrl,
    appLaunchUrl,
    createdAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : new Date().toISOString(),
    views: doc.views || doc.playCount || m.views || m.play_count || 0,
    likes: doc.likes || doc.likeCount || m.likes || m.like_count || 0,
    comments: doc.comments || doc.commentCount || m.comments || m.comment_count || 0,
    shares: doc.shares || doc.shareCount || m.shares || m.share_count || 0,
    durationSec: doc.durationSec || doc.duration || null,
    musicTitle: doc.musicTitle || null,
    hashtags: doc.hashtags || [],
    playbackStatus: doc.playbackStatus || doc.playback_status || null,
    playbackType: doc.playbackType || doc.playback_type || null,
    user: doc.user || doc.author || doc.username || 'Unknown'
  };
}

module.exports = { normalize };
