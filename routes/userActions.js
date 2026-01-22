const express = require('express');
const router = express.Router();

// Like ekle
router.post('/like', async (req, res) => {
  const db = req.app.locals.db;
  const payload = {
    userId: req.body.userId,
    itemId: req.body.itemId,
    platform: req.body.platform,
    title: req.body.title,
    username: req.body.username,
    thumbnailUrl: req.body.thumbnailUrl,
    playbackUrl: req.body.playbackUrl,
    originalUrl: req.body.originalUrl,
    viewCount: req.body.viewCount,
    likeCount: req.body.likeCount,
    commentCount: req.body.commentCount,
    shareCount: req.body.shareCount,
    durationSec: req.body.durationSec,
    hashtags: req.body.hashtags || [],
    uploadDate: req.body.uploadDate ? new Date(req.body.uploadDate) : new Date(),
    timestamp: new Date()
  };

  try {
    await db.collection('liked_items').insertOne(payload);
    res.json({ success: true, inserted: true });
  } catch (err) {
    if (err.code === 11000) return res.json({ success: true, inserted: false });
    res.status(500).json({ success: false, error: err.message });
  }
});

// Like kaldır (parametreli)
router.delete('/like/:userId/:itemId', async (req, res) => {
  const db = req.app.locals.db;
  const { userId, itemId } = req.params;
  try {
    const r = await db.collection('liked_items').deleteOne({ userId, itemId });
    res.json({ success: true, deleted: r.deletedCount }); // ✅ deletedCount döndürülüyor
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Save ekle
router.post('/save', async (req, res) => {
  const db = req.app.locals.db;
  const payload = {
    userId: req.body.userId,
    itemId: req.body.itemId,
    platform: req.body.platform,
    title: req.body.title,
    username: req.body.username,
    thumbnailUrl: req.body.thumbnailUrl,
    playbackUrl: req.body.playbackUrl,
    originalUrl: req.body.originalUrl,
    viewCount: req.body.viewCount,
    likeCount: req.body.likeCount,
    commentCount: req.body.commentCount,
    shareCount: req.body.shareCount,
    durationSec: req.body.durationSec,
    hashtags: req.body.hashtags || [],
    uploadDate: req.body.uploadDate ? new Date(req.body.uploadDate) : new Date(),
    timestamp: new Date()
  };

  try {
    await db.collection('saved_items').insertOne(payload);
    res.json({ success: true, inserted: true });
  } catch (err) {
    if (err.code === 11000) return res.json({ success: true, inserted: false });
    res.status(500).json({ success: false, error: err.message });
  }
});

// Save kaldır (parametreli)
router.delete('/save/:userId/:itemId', async (req, res) => {
  const db = req.app.locals.db;
  const { userId, itemId } = req.params;
  try {
    const r = await db.collection('saved_items').deleteOne({ userId, itemId });
    res.json({ success: true, deleted: r.deletedCount }); // ✅ deletedCount döndürülüyor
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Kullanıcının beğenileri
router.get('/likes/:userId', async (req, res) => {
  const db = req.app.locals.db;
  try {
    const items = await db.collection('liked_items').find({ userId: req.params.userId }).toArray();
    res.json(items);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Kullanıcının kaydettikleri
router.get('/saves/:userId', async (req, res) => {
  const db = req.app.locals.db;
  try {
    const items = await db.collection('saved_items').find({ userId: req.params.userId }).toArray();
    res.json(items);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Like durum kontrol
router.get('/like/status/:userId/:itemId', async (req, res) => {
  const db = req.app.locals.db;
  try {
    const exists = await db.collection('liked_items').findOne({ userId: req.params.userId, itemId: req.params.itemId });
    res.json({ liked: !!exists });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Save durum kontrol
router.get('/save/status/:userId/:itemId', async (req, res) => {
  const db = req.app.locals.db;
  try {
    const exists = await db.collection('saved_items').findOne({ userId: req.params.userId, itemId: req.params.itemId });
    res.json({ saved: !!exists });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
