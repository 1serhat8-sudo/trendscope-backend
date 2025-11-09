const express = require('express');
const router = express.Router();

/** --- Metriği normalize et (string -> integer) --- */
function parseMetric(value) {
  if (value === null || value === undefined) return 0;
  const str = value.toString().toLowerCase().trim();

  if (str.endsWith('k')) return Math.round(parseFloat(str) * 1_000);
  if (str.endsWith('m')) return Math.round(parseFloat(str) * 1_000_000);
  if (str.endsWith('b')) return Math.round(parseFloat(str) * 1_000_000_000);

  const cleaned = str.replace(/[^\d.]/g, '');
  const num = cleaned.includes('.') ? parseFloat(cleaned) : parseInt(cleaned, 10);
  return Number.isFinite(num) ? Math.round(num) : 0;
}

/** --- Thumbnail normalize --- */
function pickThumbnail(doc) {
  const candidates = [
    doc.thumbnail,
    doc.thumb,
    doc.cover,
    doc.origin_cover,
    doc.dynamic_cover,
    doc.thumbnail_url,
    doc.preview_image_url,
    doc.images?.cover,
    doc.thumbnails?.medium?.url,
    doc.thumbnails?.high?.url,
    doc.snippet?.thumbnails?.medium?.url,
    doc.snippet?.thumbnails?.high?.url,
  ].filter(Boolean);

  const t = (candidates[0] || '').toString();
  return t && t.length > 0 ? t : '';
}

/** --- Video URL normalize (öncelik: playback > preview > raw) --- */
function pickVideoUrl(doc) {
  const playback = (doc.playback_url || doc.playbackUrl || '').toString();
  const preview = (doc.preview_url || doc.previewUrl || '').toString();
  const raw = (doc.videoUrl || doc.video_url || doc.play_addr || doc.download_addr || '').toString();

  if (playback) return { playbackUrl: playback, previewUrl: preview, videoUrl: raw };
  if (preview)  return { playbackUrl: '',        previewUrl: preview, videoUrl: raw };
  return { playbackUrl: '', previewUrl: '', videoUrl: raw };
}

/** --- Doküman normalize edici --- */
function normalize(doc) {
  const id =
    (doc.id ?? doc.video_id ?? doc.aweme_id ?? doc._id)?.toString();
  const platform =
    (doc.platform ?? doc.source ?? 'unknown').toString();
  const caption =
    (doc.caption ?? doc.desc ?? doc.title ?? '').toString();
  const user =
    (doc.user ?? doc.author ?? doc.channel ?? doc.owner ?? '').toString();

  const { playbackUrl, previewUrl, videoUrl } = pickVideoUrl(doc);
  const thumbnail = pickThumbnail(doc);

  const playCount = parseMetric(
    doc.playCount ?? doc.play_count ?? doc.plays ?? doc.tiles ?? doc.viewCount ?? doc.views ?? 0
  );
  const likeCount = parseMetric(doc.likeCount ?? doc.like_count ?? doc.likes ?? 0);
  const commentCount = parseMetric(doc.commentCount ?? doc.comment_count ?? doc.comments ?? 0);
  const shareCount = parseMetric(doc.shareCount ?? doc.share_count ?? doc.shares ?? 0);

  const mediaType = (doc.mediaType ?? doc.media_type ?? 'video').toString();

  const collectedAt =
    (doc.collectedAt ?? doc.collected_at ?? doc.created_at ?? doc.created ?? doc.publishedAt ?? '').toString();
  const createdAt =
    (doc.created_at ?? doc.created ?? '').toString();
  const publishedAt =
    (doc.publishedAt ?? '').toString();

  const country = (doc.country ?? 'Unknown').toString();

  return {
    id,
    platform,
    caption,
    user,
    thumbnailUrl: thumbnail,
    previewUrl,
    playbackUrl,
    videoUrl,
    metrics: {
      views: playCount,
      likes: likeCount,
      comments: commentCount,
      shares: shareCount,
    },
    mediaType,
    collectedAt,
    createdAt,
    publishedAt,
    country,
  };
}

/** --- TEST MODU: Üyelik ve kota bypass --- */
async function isMember(db, userId) {
  return true; // testte herkesi üye say
}
function computeAllowance(_access, _isMember) {
  return { freeRemaining: Infinity, adRemaining: Infinity, canGrant: false, totalCap: Infinity };
}

/** --- Sıralama spesifikasyonu --- */
function buildSortSpec(order) {
  // Tarih alanlarından herhangi biri varsa ona göre sırala; yoksa _id fallback
  // Mongo’da yok alanlar sıralamayı bozmaz ama birden çok alan ekleyerek tutarlılık sağlarız
  return {
    collected_at: order,
    collectedAt: order,
    created_at: order,
    createdAt: order,
    publishedAt: order,
    _id: order, // fallback
  };
}

/** --- Projection: gereksiz ağır alanları at --- */
const projection = {
  // büyük blob veya gereksiz nested alanlar varsa burada kapat
  images: 0,
  snippet: 0,
  thumbnails: 0,
  // metin gövdesi çok uzunsa istersen truncate edebilirsin (burada bırakıyoruz)
};

/** --- Ortak feed handler --- */
async function serveFeed(req, res, collectionName) {
  try {
    const db = req.app.locals.db;
    const userId = (req.query.userId || 'guest').toString();
    const order = (req.query.order === 'asc') ? 1 : -1;
    const limitRequestedRaw = parseInt(req.query.limit, 10);
    const skipRequestedRaw = parseInt(req.query.skip, 10);

    const limitRequested = Number.isFinite(limitRequestedRaw) ? limitRequestedRaw : 20;
    const skipRequested = Number.isFinite(skipRequestedRaw) ? skipRequestedRaw : 0;

    const limit = Math.min(Math.max(limitRequested, 1), 100);
    const skip = Math.max(skipRequested, 0);

    const member = await isMember(db, userId);
    const allowance = computeAllowance({}, member);

    const coll = db.collection(collectionName);

    const sortSpec = buildSortSpec(order);

    const cursor = coll
      .find({}, { projection })
      .sort(sortSpec)
      .skip(skip)
      .limit(limit);

    const docs = await cursor.toArray();
    if (!docs.length) {
      console.log(`[Feed] Boş sonuç: ${collectionName}`);
    }

    const items = docs.map(normalize);
    const total = await coll.countDocuments({});

    res.json({
      total,
      limitServed: limit,
      skipRequested: skip,
      items,
      allowance: { ...allowance, member },
    });
  } catch (e) {
    console.error('[Feed] error', e);
    res.status(500).json({ error: 'Feed alınamadı', details: e.message });
  }
}

/** --- Global feed --- */
router.get('/feed', async (req, res) => {
  await serveFeed(req, res, 'videos');
});

/** --- TikTok feed --- */
router.get('/feed/tiktok', async (req, res) => {
  await serveFeed(req, res, 'tiktok_videos');
});

/** --- Instagram feed --- */
router.get('/feed/instagram', async (req, res) => {
  await serveFeed(req, res, 'instagram_videos');
});

/** --- YouTube feed --- */
router.get('/feed/youtube', async (req, res) => {
  await serveFeed(req, res, 'youtube_videos');
});

module.exports = router;
