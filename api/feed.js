const express = require('express');
const router = express.Router();
const { normalize } = require('../core/normalize');

// ✅ MongoDB projection — normalize için gerekli tüm alanlar
const projection = {
  _id: 1,
  platform: 1,
  title: 1,
  thumbnailUrl: 1,
  originalUrl: 1,
  appLaunchUrl: 1,
  playbackUrl: 1,
  playbackStatus: 1,
  playbackType: 1,

  // ✅ Metrikler
  playCount: 1,
  likeCount: 1,
  commentCount: 1,
  shareCount: 1,

  createdAt: 1,
  metrics: 1,
  durationSec: 1,
  musicTitle: 1,
  hashtags: 1,

  // ✅ Kullanıcı
  user: 1,

  // ✅ Deeplink için kritik alanlar
  video_id: 1,
  aweme_id: 1,
  youtube_id: 1,
  shortcode: 1,
  code: 1
};

// ✅ Sıralama fonksiyonu (geriye uyumlu + alias + kombinasyon)
function buildSortSpec(field, order) {
  const dir = order === 'asc' ? 1 : -1;

  // Alias: viewCount -> playCount
  if (field === 'playCount' || field === 'viewCount') {
    return { playCount: dir, _id: dir };
  }

  // Zaman bazlı
  if (field === 'createdAt') {
    return { createdAt: dir, _id: dir };
  }

  // Kombinasyon: önce en çok izlenen, sonra en yeni
  // Flutter tarafı sort=combo_mostViewed_newest gönderdiğinde çalışır
  if (field === 'combo_mostViewed_newest') {
    return { playCount: -1, createdAt: -1 };
  }

  // Kombinasyon: önce en az izlenen, sonra en eski
  if (field === 'combo_leastViewed_oldest') {
    return { playCount: 1, createdAt: 1 };
  }

  // Varsayılan
  return { _id: dir };
}

// ✅ Ortak feed servisi (TikTok / Instagram / YouTube)
async function serveFeed(req, res, collectionName, defaultSortField) {
  try {
    const db = req.app.locals.db;

    const order = req.query.order === 'asc' ? 'asc' : 'desc';
    const sortField = (req.query.sort || defaultSortField).toString();
    const limit = parseInt(req.query.limit, 10) || 20;
    const skip = parseInt(req.query.skip, 10) || 0;

    const coll = db.collection(collectionName);
    const sortSpec = buildSortSpec(sortField, order);

    const platform = collectionName.replace('_videos', '');
    const query = { platform };

    const cursor = coll
      .find(query, { projection })
      .sort(sortSpec)
      .skip(skip)
      .limit(limit);

    const docs = await cursor.toArray();
    const items = docs.map(normalize);
    const total = await coll.countDocuments(query);

    items.forEach(i => {
      console.log(`▶️ FEED ITEM: id=${i.id}, platform=${i.platform}, originalUrl=${i.originalUrl}, appLaunchUrl=${i.appLaunchUrl}`);
    });

    res.json({
      total,
      limitServed: limit,
      skipRequested: skip,
      items
    });
  } catch (e) {
    console.error('[Feed] error', e);
    res.status(500).json({
      error: 'Feed alınamadı',
      details: e.message
    });
  }
}

// ✅ Anasayfa (karma feed)
router.get('/feed/home', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const order = req.query.order === 'asc' ? 1 : -1;
    const limit = parseInt(req.query.limit, 10) || 50;

    const tiktokDocs = await db.collection('tiktok_videos')
      .find({ platform: 'tiktok' }, { projection })
      .sort({ playCount: order })
      .limit(Math.floor(limit / 3))
      .toArray();

    const instaDocs = await db.collection('instagram_videos')
      .find({ platform: 'instagram' }, { projection })
      .sort({ playCount: order })
      .limit(Math.floor(limit / 3))
      .toArray();

    const ytDocs = await db.collection('youtube_videos')
      .find({ platform: 'youtube' }, { projection })
      .sort({ playCount: order })
      .limit(Math.floor(limit / 3))
      .toArray();

    const docs = [...tiktokDocs, ...instaDocs, ...ytDocs];
    const items = docs.map(normalize);

    items.forEach(i => {
      console.log(`▶️ HOME ITEM: id=${i.id}, platform=${i.platform}, originalUrl=${i.originalUrl}, appLaunchUrl=${i.appLaunchUrl}`);
    });

    res.json({
      total: items.length,
      items
    });
  } catch (e) {
    console.error('[Feed Home] error', e);
    res.status(500).json({
      error: 'Anasayfa feed alınamadı',
      details: e.message
    });
  }
});

// ✅ TikTok feed
router.get('/feed/tiktok', async (req, res) => {
  await serveFeed(req, res, 'tiktok_videos', 'createdAt');
});

// ✅ Instagram feed
router.get('/feed/instagram', async (req, res) => {
  await serveFeed(req, res, 'instagram_videos', 'createdAt');
});

// ✅ YouTube feed
router.get('/feed/youtube', async (req, res) => {
  await serveFeed(req, res, 'youtube_videos', 'createdAt');
});

module.exports = router;
