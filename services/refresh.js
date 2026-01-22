const { resolveTikTokPlayback } = require('../adapters/tiktok');
const { resolveInstagramPlayback } = require('../adapters/instagram');

function nowIso() { return new Date().toISOString(); }

function ttlHours(hours = 3) {
  const d = new Date();
  d.setHours(d.getHours() + hours);
  return d.toISOString();
}

function ttlMinutes(minutes = 45) {
  const d = new Date();
  d.setMinutes(d.getMinutes() + minutes);
  return d.toISOString();
}

async function withRetry(fn, { retries = 2, delayMs = 500 } = {}) {
  let attempt = 0;
  let lastErr;
  while (attempt <= retries) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      attempt++;
      if (attempt > retries) break;
      await new Promise(res => setTimeout(res, delayMs));
    }
  }
  throw lastErr;
}

async function refreshPlaybackForOne(db, platform, id) {
  const collName =
    platform === 'tiktok' ? 'tiktok_videos' :
    platform === 'instagram' ? 'instagram_videos' :
    platform === 'youtube' ? 'youtube_videos' : null;

  if (!collName) return null;

  const coll = db.collection(collName);
  const doc = await coll.findOne({ id: id.toString() });
  if (!doc) return null;

  try {
    const resolved = await withRetry(async () => {
      if (platform === 'tiktok') return resolveTikTokPlayback(doc);
      if (platform === 'instagram') return resolveInstagramPlayback(doc);
      // YouTube fallback
      const ytUrl = doc.videoUrl || doc.video_url || doc.playback_url || null;
      return {
        url: ytUrl,
        originalUrl: `https://youtube.com/watch?v=${doc.id}`,
        expiresAt: ttlHours(12),
        status: ytUrl ? 'ok' : 'error'
      };
    });

    const playbackUrl = resolved?.url || null;
    const playbackStatus = resolved?.status || (playbackUrl ? 'ok' : 'error');
    const expiresAt = resolved?.expiresAt || ttlHours(platform === 'youtube' ? 12 : 2);

    if (!playbackUrl) {
      await coll.updateOne(
        { id: id.toString() },
        {
          $set: {
            playback_last_checked: nowIso(),
            playback_status: 'error',
            playback_expires_at: ttlMinutes(15),
          }
        }
      );
      console.warn(`[refresh] ${platform} id=${id} playback URL bulunamadı`);
      return null;
    }

    const payload = {
      playback_url: playbackUrl,
      playback_original_url: resolved.originalUrl || doc.originalUrl || '',
      playback_expires_at: expiresAt,
      playback_last_checked: nowIso(),
      playback_status: playbackStatus,
    };

    await coll.updateOne({ id: id.toString() }, { $set: payload });
    return { ...doc, ...payload };
  } catch (e) {
    console.error(`[refresh] ${platform} id=${id} hata:`, e.message);
    await coll.updateOne(
      { id: id.toString() },
      {
        $set: {
          playback_last_checked: nowIso(),
          playback_status: 'error',
          playback_expires_at: ttlMinutes(15),
        }
      }
    );
    return null;
  }
}

async function preRefreshBatch(db, options = {}) {
  const {
    platform = 'tiktok',
    limit = 2000,
    ttlThresholdMinutes = 30,
    sortField = 'collected_at',
    order = -1,
  } = options;

  const collName =
    platform === 'tiktok' ? 'tiktok_videos' :
    platform === 'instagram' ? 'instagram_videos' : null;

  if (!collName) return { refreshed: 0 };

  const coll = db.collection(collName);
  const nowMs = Date.now();

  const cursor = coll.find({})
    .sort({ [sortField]: order })
    .limit(limit);

  let refreshed = 0;

  while (await cursor.hasNext()) {
    const doc = await cursor.next();
    const expMs = doc.playback_expires_at ? new Date(doc.playback_expires_at).getTime() : 0;
    const minutesLeft = expMs > 0 ? (expMs - nowMs) / (60 * 1000) : -1;

    if (minutesLeft < ttlThresholdMinutes) {
      const r = await refreshPlaybackForOne(db, platform, doc.id?.toString() || doc._id?.toString());
      if (r && r.playback_url) refreshed++;
    }
  }

  return { refreshed };
}

function startRefreshScheduler(app) {
  const db = app.locals.db;

  setInterval(async () => {
    try {
      const t = await preRefreshBatch(db, { platform: 'tiktok', limit: 5000, ttlThresholdMinutes: 45 });
      const i = await preRefreshBatch(db, { platform: 'instagram', limit: 5000, ttlThresholdMinutes: 45 });
      console.log(`[preRefresh] TikTok refreshed=${t.refreshed}, Instagram refreshed=${i.refreshed}`);
    } catch (e) {
      console.error('[preRefresh] error', e);
    }
  }, 30 * 60 * 1000);
}

module.exports = {
  refreshPlaybackForOne,
  preRefreshBatch,
  startRefreshScheduler,
};
