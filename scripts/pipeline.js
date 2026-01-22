/**
 * TrendScope Pipeline (final)
 * Ham havuz (raw_*) → Uygulama havuzu (*_videos)
 * İnkremenatl: lastSyncAt sonrası gelenleri işler
 * Filtre: playCount >= MIN_VIEWS ve gerekli alanlar dolu
 * Extractor: playback_url/type/expiry + akıllı thumbnail + originalUrl + appLaunchUrl
 */

const { MongoClient } = require('mongodb');
const fetch = require('node-fetch');

// Adapters
const { resolveTikTokPlayback } = require('../adapters/tiktok');
const { resolveInstagramPlayback } = require('../adapters/instagram');

// Config
const uri = process.env.MONGO_URI || "mongodb://localhost:27017";
const dbName = process.env.DB_NAME || "trendscope";
const client = new MongoClient(uri, { ignoreUndefined: true });

const MIN_VIEWS = 50_000;

// ------------------------
// Index Ensurer
// ------------------------

async function ensureIndexes(db) {
  await db.collection('tiktok_videos').createIndex({ id: 1 }, { unique: true });
  await db.collection('instagram_videos').createIndex({ id: 1 }, { unique: true });
  await db.collection('youtube_videos').createIndex({ id: 1 }, { unique: true });
  await db.collection('sync_meta').createIndex({ key: 1 }, { unique: true });
}


// ------------------------
// Utilities
// ------------------------

function nowIso() { return new Date().toISOString(); }

function parseMetric(value) {
  if (value === null || value === undefined) return 0;
  const str = value.toString().toLowerCase().trim();
  if (str.endsWith('k')) return Math.round(parseFloat(str) * 1_000);
  if (str.endsWith('m')) return Math.round(parseFloat(str) * 1_000_000);
  if (str.endsWith('b')) return Math.round(parseFloat(str) * 1_000_000_000);
  const cleaned = str.replace(/[^\d.]/g, '');
  const num = cleaned.includes('.') ? parseFloat(cleaned) : parseInt(cleaned, 10);
  return Number.isFinite(num) ? Math.round(num) : 0;
}

async function withTimeout(promise, ms = 4000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await promise(ctrl.signal);
    clearTimeout(t);
    return res;
  } catch (e) {
    clearTimeout(t);
    throw e;
  }
}

// ------------------------
// Raw normalize (platform-agnostic)
// ------------------------

function normalizeRaw(doc) {
  const playCount = parseMetric(doc.playCount ?? doc.play_count ?? doc.views ?? "0");
  const likeCount = parseMetric(doc.likeCount ?? doc.like_count ?? doc.likes ?? "0");
  const commentCount = parseMetric(doc.commentCount ?? doc.comment_count ?? doc.comments ?? "0");
  const shareCount = parseMetric(doc.shareCount ?? doc.share_count ?? doc.shares ?? "0");

  const durationSec = parseMetric(doc.duration ?? doc.durationSec ?? doc.video_duration ?? 0);
  const musicTitle = (doc.musicTitle ?? doc.music?.title ?? doc.sound?.title ?? "").toString();
  const originalUrl = (doc.originalUrl ?? doc.shareUrl ?? doc.permalink ?? doc.link ?? "").toString();

  const captionText = (doc.caption ?? doc.desc ?? doc.title ?? "").toString();
  const hashtags = (captionText.match(/#\w+/g) || []).map(t => t.toLowerCase());

  const createdAt =
    doc.publishedAt ?? doc.createdAt ?? doc.created_at ?? null;

  const thumbnailCandidate =
    doc.thumbnail ??
    doc.thumb ??
    doc.cover ??
    doc.origin_cover ??
    doc.thumbnail_url ??
    doc.display_url ??
    doc.thumbnails?.high?.url ??
    doc.thumbnails?.medium?.url ??
    doc.thumbnails?.default?.url ??
    "";

  const videoUrlCandidate =
    doc.videoUrl ??
    doc.video_url ??
    doc.play_addr ??
    doc.download_addr ??
    doc.playback_url ??
    "";

  return {
    id: (doc.id ?? doc.video_id ?? doc._id)?.toString(),
    platform: (doc.platform ?? "unknown").toString(),
    caption: captionText,
    title: (doc.title ?? captionText ?? "Başlık yok").toString(),
    user: (doc.user ?? doc.author ?? doc.channel ?? doc.owner ?? "Unknown").toString(),
    durationSec,
    musicTitle,
    originalUrl,
    hashtags,
    createdAt: createdAt ? new Date(createdAt).toISOString() : null,
    thumbnailCandidate: thumbnailCandidate.toString(),
    videoUrlCandidate: videoUrlCandidate.toString(),
    metrics: {
      views: playCount,
      likes: likeCount,
      comments: commentCount,
      shares: shareCount,
    },
    collected_at: (
      doc.collectedAt ??
      doc.collected_at ??
      doc.created_at ??
      doc.createdAt ??
      new Date()
    ),
    country: (doc.country ?? "Unknown").toString(),
    raw_source: doc
  };
}

// ------------------------
// Smart thumbnail resolver
// ------------------------

async function getOgImage(urlStr) {
  if (!urlStr) return null;
  try {
    const res = await withTimeout(
      (signal) => fetch(urlStr, { method: 'GET', signal, headers: { 'User-Agent': 'Mozilla/5.0' } }),
      3000
    );
    if (!res.ok) return null;
    const html = await res.text();
    const m = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

async function resolveBestThumbnail(doc) {
  const ig =
    doc.raw_source?.video_versions?.[0]?.thumbnail_url ||
    doc.raw_source?.image_versions2?.candidates?.[0]?.url ||
    doc.raw_source?.cover_frame_url ||
    doc.raw_source?.display_resources?.[0]?.src;

  const tt =
    doc.raw_source?.thumbnail ||
    doc.raw_source?.cover ||
    doc.raw_source?.video?.cover ||
    doc.raw_source?.video?.dynamicCover ||
    doc.raw_source?.video?.originCover;

  const yt =
    doc.raw_source?.snippet?.thumbnails?.high?.url ||
    doc.raw_source?.snippet?.thumbnails?.medium?.url ||
    doc.raw_source?.snippet?.thumbnails?.default?.url;

  const picked = ig || tt || yt || doc.thumbnailCandidate || null;
  if (picked) return picked;

  const og = await getOgImage(doc.originalUrl);
  return og || "https://yourdomain.com/default_thumbnail.jpg";
}

// ------------------------
// Token expiry prediction (HEAD)
// ------------------------

async function predictExpiry(urlStr) {
  if (!urlStr) return { expiresAt: null };
  try {
    const res = await withTimeout(
      (signal) => fetch(urlStr, { method: 'HEAD', signal, headers: { 'User-Agent': 'Mozilla/5.0' } }),
      2500
    );
    const cc = res.headers.get('cache-control');
    const expHeader = res.headers.get('expires');
    if (cc) {
      const m = cc.match(/max-age=(\d+)/);
      if (m) {
        const ms = parseInt(m[1], 10) * 1000;
        return { expiresAt: new Date(Date.now() + ms).toISOString() };
      }
    }
    if (expHeader) {
      const d = new Date(expHeader);
      if (!isNaN(d.getTime())) return { expiresAt: d.toISOString() };
    }
    return { expiresAt: null };
  } catch {
    return { expiresAt: null };
  }
}

// ------------------------
// Playable resolver (per platform)
// ------------------------

async function resolvePlayable(doc) {
  const platform = doc.platform;
  if (platform === 'tiktok') {
    const r = await resolveTikTokPlayback({
      id: doc.id,
      video_url: doc.videoUrlCandidate,
      playback_url: null,
      thumbnail: doc.thumbnailCandidate,
      caption: doc.caption,
      user: doc.user,
      musicTitle: doc.musicTitle,
      originalUrl: doc.originalUrl
    });
    const type = r?.url?.includes('.m3u8') ? 'hls' : (r?.url ? 'mp4' : null);
    return {
      url: r?.url || null,
      type,
      originalUrl: r?.originalUrl || doc.originalUrl || null,
      status: r?.status || (r?.url ? 'ok' : 'error')
    };
  }

  if (platform === 'instagram') {
    const r = await resolveInstagramPlayback({
      id: doc.id,
      video_url: doc.videoUrlCandidate,
      playback_url: null,
      thumbnail: doc.thumbnailCandidate,
      caption: doc.caption,
      user: doc.user,
      musicTitle: doc.musicTitle,
      originalUrl: doc.originalUrl
    });
    const type = r?.url?.includes('.m3u8') ? 'hls' : (r?.url ? 'mp4' : null);
    return {
      url: r?.url || null,
      type,
      originalUrl: r?.originalUrl || doc.originalUrl || null,
      status: r?.status || (r?.url ? 'ok' : 'error')
    };
  }

    if (platform === 'youtube') {
    const url = doc.videoUrlCandidate || null;
    const type = url?.includes('.m3u8') ? 'hls' : (url ? 'mp4' : null);
    const originalUrl = doc.originalUrl || (doc.id ? `https://youtube.com/watch?v=${doc.id.replace(/^yt_/, "")}` : null);
    return {
      url,
      type,
      originalUrl,
      status: url ? 'ok' : 'error'
    };
  }

  return {
    url: null,
    type: null,
    originalUrl: doc.originalUrl || null,
    status: 'error'
  };
}

// ------------------------
// Platform runner
// ------------------------

async function runPlatform(db, platform) {
  const rawName = `raw_${platform}`;
  const destName = platform === 'youtube' ? 'youtube_videos' : `${platform}_videos`;
  const metaKey = `pipeline_${platform}_lastSyncAt`;

  const metaCol = db.collection('sync_meta');
  const rawCol = db.collection(rawName);
  const destCol = db.collection(destName);

  const meta = await metaCol.findOne({ key: metaKey });
  const lastSyncAt = meta?.value ? new Date(meta.value) : new Date(0);

  console.log(`\n[${platform.toUpperCase()}] lastSyncAt: ${lastSyncAt.toISOString()}`);

  const cursor = rawCol.find({
    $or: [
      { collected_at: { $gt: lastSyncAt } },
      { collectedAt: { $gt: lastSyncAt } },
      { created_at: { $gt: lastSyncAt } },
      { createdAt: { $gt: lastSyncAt } },
    ]
  }).sort({ collected_at: -1, created_at: -1 });

  let processed = 0, accepted = 0, skipped = 0;

  while (await cursor.hasNext()) {
    const raw = await cursor.next();
    processed++;

    const n = normalizeRaw(raw);

    const valid =
      n.metrics.views >= MIN_VIEWS &&
      (n.videoUrlCandidate?.length || 0) > 0 &&
      (n.caption?.length || 0) > 0 &&
      (n.user?.length || 0) > 0;

    if (!valid) {
      skipped++;
      continue;
    }

    try {
      const playable = await resolvePlayable(n);
      const { expiresAt } = await predictExpiry(playable.url);
      const bestThumb = await resolveBestThumbnail(n);

      const cleanId = n.id?.replace(/^tt_/, "").replace(/^yt_/, "").replace(/^ig_/, "") || n.id;
      let appLaunchUrl = null;
      if (n.platform === "tiktok" && cleanId) {
        appLaunchUrl = `tiktok://v/${cleanId}`;
      } else if (n.platform === "youtube" && cleanId) {
        appLaunchUrl = `vnd.youtube:${cleanId}`;
      } else if (n.platform === "instagram" && cleanId) {
        appLaunchUrl = `instagram://reel/${cleanId}`;
      }

      // Platforma göre originalUrl fallback üret
      let originalUrl = playable.originalUrl;
      if ((!originalUrl || originalUrl === "") && cleanId) {
        if (n.platform === "instagram") {
          originalUrl = `https://www.instagram.com/reel/${cleanId}`;
        } else if (n.platform === "tiktok") {
          originalUrl = `https://www.tiktok.com/@${n.user}/video/${cleanId}`;
        } else if (n.platform === "youtube") {
          originalUrl = `https://youtube.com/watch?v=${cleanId}`;
        } else {
          originalUrl = n.originalUrl || "";
        }
      }

      const payload = {
        id: n.id,
        platform: n.platform,
        caption: n.caption,
        title: n.title,
        user: n.user,

        thumbnailUrl: bestThumb || "https://yourdomain.com/default_thumbnail.jpg",
        originalUrl, // <-- değişiklik burada

        appLaunchUrl,

        playback_url: playable.url || null,
        playback_type: playable.type || (playable.url?.includes('.m3u8') ? 'hls' : (playable.url ? 'mp4' : null)),
        playback_expires_at: expiresAt || null,
        playback_status: playable.status || (playable.url ? 'ok' : 'error'),
        playback_last_checked: nowIso(),

        playCount: n.metrics.views,
        likeCount: n.metrics.likes,
        commentCount: n.metrics.comments,
        shareCount: n.metrics.shares,

        durationSec: n.durationSec,
        musicTitle: n.musicTitle || null,
        hashtags: n.hashtags || [],

        createdAt: n.createdAt || n.collected_at.toISOString?.() || nowIso(),
        collected_at: n.collected_at,
        updated_at: new Date(),

        raw_source: n.raw_source,
        country: n.country
      };

      await destCol.updateOne(
        { id: n.id },
        { $set: payload },
        { upsert: true }
      );
      accepted++;
    } catch (e) {
      if (!String(e.message).includes('duplicate key')) {
        console.error(`[${platform}] upsert hatası:`, e.message);
      }
    }
  }

  const now = new Date();
  await metaCol.updateOne(
    { key: metaKey },
    { $set: { key: metaKey, value: now, updatedAt: now } },
    { upsert: true }
  );

  console.log(`[${platform.toUpperCase()}] processed=${processed}, accepted=${accepted}, skipped=${skipped}`);
}

// ------------------------
// Main
// ------------------------

async function main() {
  try {
    await client.connect();
    const db = client.db(dbName);
    console.log(`🗄️ Pipeline bağlı: ${dbName}`);

    await ensureIndexes(db);

    await runPlatform(db, 'tiktok');
    await runPlatform(db, 'instagram');
    await runPlatform(db, 'youtube');

    console.log('\n✅ Pipeline bitti.');
  } catch (e) {
    console.error('Pipeline hatası:', e);
    process.exitCode = 1;
  } finally {
    await client.close();
  }
}

main();
