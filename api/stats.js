const express = require('express');
const router = express.Router();

router.get('/stats/resolve', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const logs = db.collection('resolve_logs');

    // Genel toplam
    const total = await logs.countDocuments({});
    const success = await logs.countDocuments({ status: 'success' });
    const fail = await logs.countDocuments({ status: 'fail' });

    // Ortalama süre
    const avgAgg = await logs.aggregate([
      { $match: { status: 'success', durationMs: { $exists: true } } },
      { $group: { _id: null, avg: { $avg: "$durationMs" } } }
    ]).toArray();
    const avgDurationMs = avgAgg.length ? Math.round(avgAgg[0].avg) : 0;

    // Platform bazlı dağılım
    const byPlatformAgg = await logs.aggregate([
      {
        $group: {
          _id: "$platform",
          total: { $sum: 1 },
          success: { $sum: { $cond: [{ $eq: ["$status", "success"] }, 1, 0] } },
          fail: { $sum: { $cond: [{ $eq: ["$status", "fail"] }, 1, 0] } },
          avgDurationMs: { $avg: "$durationMs" }
        }
      }
    ]).toArray();

    const byPlatform = {};
    byPlatformAgg.forEach(p => {
      byPlatform[p._id] = {
        total: p.total,
        success: p.success,
        fail: p.fail,
        avgDurationMs: Math.round(p.avgDurationMs || 0)
      };
    });

    res.json({
      total,
      success,
      fail,
      successRate: total > 0 ? success / total : 0,
      avgDurationMs,
      byPlatform
    });
  } catch (e) {
    console.error('[stats] error', e);
    res.status(500).json({ error: 'Stats alınamadı', details: e.message });
  }
});

module.exports = router;
