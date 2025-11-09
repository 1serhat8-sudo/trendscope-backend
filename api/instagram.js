const express = require('express');
const router = express.Router();

// Geçici veri – ileride gerçek API ile değiştirilecek
router.get('/instagram/trending', async (req, res) => {
  try {
    const data = [
      {
        id: 'insta_1',
        platform: 'instagram',
        title: 'Örnek Instagram Reels',
        thumbnail: 'https://via.placeholder.com/480x270.png?text=Instagram+Reels',
        videoUrl: 'https://www.instagram.com/reel/XXXXXXXXX/',
        channel: 'Test Kanalı',
        views: 12345,
        publishedAt: new Date().toISOString()
      }
    ];
    res.json({ data });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Instagram verisi alınamadı' });
  }
});

module.exports = router;
