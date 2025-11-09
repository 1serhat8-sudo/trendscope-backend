const express = require('express');
const router = express.Router();

const { resolveTikTokPlayback } = require('../adapters/tiktok');
const { resolveInstagramPlayback } = require('../adapters/instagram');

router.post('/play/resolve', async (req, res) => {
  const start = Date.now();
  const { id, platform } = req.body;

  if (!id || !platform) {
    return res.status(400).json({ error: 'id ve platform gerekli' });
  }

  const db = req.app.locals.db;
  const logs = db.collection('resolve_logs'); // 👈 log koleksiyonu
  const collName =
    platform === 'tiktok' ? 'tiktok_videos' :
    platform === 'instagram' ? 'instagram_videos' :
    platform === 'youtube' ? 'youtube_videos' : null;

  if (!collName) {
    return res.status(400).json({ error: 'Desteklenmeyen platform' });
  }

  try {
    const coll = db.collection(collName);
    const doc = await coll.findOne({ id: id.toString() });
    if (!doc) {
      return res.status(404).json({ error: 'Video bulunamadı' });
    }

    let resolved;
    if (platform === 'tiktok') {
      resolved = await resolveTikTokPlayback(doc);
    } else if (platform === 'instagram') {
      resolved = await resolveInstagramPlayback(doc);
    } else {
      resolved = { url: doc.video_url || doc.playback_url, expiresAt: null, status: 'ok' };
    }

    const duration = Date.now() - start;

    if (!resolved?.url) {
      await logs.insertOne({
        id, platform, status: 'fail', durationMs: duration,
        error: 'no_url', timestamp: new Date().toISOString()
      });
      return res.status(500).json({ error: 'Playback URL çözülemedi' });
    }

    await coll.updateOne(
      { id: id.toString() },
      {
        $set: {
          playback_url: resolved.url,
          playback_expires_at: resolved.expiresAt || null,
          playback_last_checked: new Date().toISOString(),
          playback_status: resolved.status || 'ok',
        },
      }
    );

    await logs.insertOne({
      id, platform, status: 'success', durationMs: duration,
      error: null, timestamp: new Date().toISOString()
    });

    res.json({
      id,
      platform,
      playbackUrl: resolved.url,
      expiresAt: resolved.expiresAt,
      status: resolved.status || 'ok',
      durationMs: duration,
    });
  } catch (e) {
    const duration = Date.now() - start;
    await db.collection('resolve_logs').insertOne({
      id, platform, status: 'fail', durationMs: duration,
      error: e.message, timestamp: new Date().toISOString()
    });
    res.status(500).json({ error: 'Resolve sırasında hata', details: e.message });
  }
});

module.exports = router;
