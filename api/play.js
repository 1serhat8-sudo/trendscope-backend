const express = require('express');
const router = express.Router();

// /api/play/:platform/:id
router.get('/play/:platform/:id', async (req, res) => {
  const { platform, id } = req.params;
  const db = req.app.locals.db;

  try {
    const col = db.collection(`${platform}_videos`);
    const doc = await col.findOne({ id: id.toString() });

    if (!doc) {
      return res.status(404).json({ error: 'Video bulunamadı' });
    }

    // Öncelik sırası: play_addr > video_url > download_addr
    const url = doc.play_addr || doc.video_url || doc.download_addr;

    if (!url) {
      return res.status(404).json({ error: 'Video URL mevcut değil' });
    }

    // JSON döndür → Flutter parse edebilsin
    return res.json({ playbackUrl: url });

  } catch (err) {
    console.error('Play route hatası:', err);
    res.status(500).json({ error: 'Sunucu hatası' });
  }
});

module.exports = router;
