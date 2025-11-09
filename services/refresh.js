const { resolveTikTokPlayback } = require('../adapters/tiktok');
const { resolveInstagramPlayback } = require('../adapters/instagram');

function nowIso() { return new Date().toISOString(); }

// Tahmini TTL: 3 saat (platforma göre ayarlayacağız)
function ttlHours(hours = 3) {
  const d = new Date();
  d.setHours(d.getHours() + hours);
  return d.toISOString();
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
    let resolved;
    if (platform === 'tiktok') {
      resolved = await resolveTikTokPlayback(doc);
    } else if (platform === 'instagram') {
      resolved = await resolveInstagramPlayback(doc);
    } else {
      // YouTube için ayrı akış (ileride)
      resolved = { url: doc.video_url || doc.playback_url, expiresAt: ttlHours(12), status: 'ok' };
    }

    const payload = {
      playback_url: resolved?.url || null,
      playback_expires_at: resolved?.expiresAt || ttlHours(2),
      playback_last_checked: nowIso(),
      playback_status: resolved?.status || (resolved?.url ? 'ok' : 'error'),
    };

    await coll.updateOne({ id: id.toString() }, { $set: payload });
    return { ...doc, ...payload };
  } catch (e) {
    await coll.updateOne(
      { id: id.toString() },
      {
        $set: {
          playback_last_checked: nowIso(),
          playback_status: 'error',
        }
      }
    );
    return null;
  }
}

// Pre-refresh: büyük havuz için batch yenileme
async function preRefreshBatch(db, options = {}) {
  const {
    platform = 'tiktok', // veya 'instagram'
    limit = 2000,        // binlerce video için artırılabilir
    ttlThresholdMinutes = 30, // “yakında bitecek” eşiği
    sortField = 'collected_at',
    order = -1, // descending
  } = options;

  const collName =
    platform === 'tiktok' ? 'tiktok_videos' :
    platform === 'instagram' ? 'instagram_videos' : null;

  if (!collName) return { refreshed: 0 };

  const coll = db.collection(collName);
  const now = Date.now();

  const cursor = coll.find({})
    .sort({ [sortField]: order })
    .limit(limit);

  let refreshed = 0;

  while (await cursor.hasNext()) {
    const doc = await cursor.next();
    const exp = doc.playback_expires_at ? new Date(doc.playback_expires_at).getTime() : 0;
    const minutesLeft = exp > 0 ? (exp - now) / (60 * 1000) : -1;

    // Yoksa veya az kaldıysa yenile
    if (minutesLeft < ttlThresholdMinutes) {
      const r = await refreshPlaybackForOne(db, platform, doc.id?.toString() || doc._id?.toString());
      if (r && r.playback_url) refreshed++;
    }
  }

  return { refreshed };
}

// Cron scheduler: belirli aralıklarla iki platformu da yenile
function startRefreshScheduler(app) {
  const db = app.locals.db;

  // Her 30 dakikada bir TikTok ve Instagram batch çalıştır
  setInterval(async () => {
    try {
      const t = await preRefreshBatch(db, { platform: 'tiktok', limit: 5000, ttlThresholdMinutes: 45 });
      const i = await preRefreshBatch(db, { platform: 'instagram', limit: 5000, ttlThresholdMinutes: 45 });
      console.log(`[preRefresh] TikTok refreshed=${t.refreshed}, Instagram refreshed=${i.refreshed}`);
    } catch (e) {
      console.error('[preRefresh] error', e);
    }
  }, 30 * 60 * 1000); // 30 dakika
}

module.exports = {
  refreshPlaybackForOne,
  preRefreshBatch,
  startRefreshScheduler,
};
