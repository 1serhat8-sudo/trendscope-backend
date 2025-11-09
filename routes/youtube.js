// File: api/youtube.js
const express = require('express');
const router = express.Router();

router.get('/youtube_videos', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const col = db.collection('youtube_videos');

    const items = await col
      .find({})
      .sort({ collected_at: -1 })
      .limit(50)
      .toArray();

    res.json(items);
  } catch (err) {
    console.error('youtube_videos route error:', err);
    res.status(500).json({ error: 'server_error' });
  }
});

module.exports = router;
