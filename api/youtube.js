const express = require('express');
const router = express.Router();
const { fetchYouTubeVideos } = require('../adapters/youtube');
const { normalizeYouTubeData } = require('../core/normalize');

router.get('/search/youtube', async (req, res) => {
  const { q, region } = req.query;
  if (!q) return res.status(400).json({ error: 'q parametresi gerekli' });

  const raw = await fetchYouTubeVideos({ query: q, regionCode: region || 'TR' });

  // DEBUG: Kaç sonuç geldiğini terminale yaz
  console.log(`Ham veri uzunluğu: ${raw.length}`);

  const normalized = normalizeYouTubeData(raw);

  res.json(normalized);
});

module.exports = router;
