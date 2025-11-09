/**
 * TrendScope Pipeline (final)
 * Ham havuz (raw_*) → Uygulama havuzu (*_videos)
 * Filtre: playCount >= 50_000, videoUrl/caption dolu
 * İnkremenatl: lastSyncAt sonrası gelenleri işler
 */

const { MongoClient } = require('mongodb');

const uri = "mongodb://localhost:27017";
const dbName = "trendscope";
const client = new MongoClient(uri, { ignoreUndefined: true });

const MIN_VIEWS = 50_000;

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

function normalize(doc) {
  const playCount = parseMetric(doc.playCount ?? doc.play_count ?? "0");
  const likeCount = parseMetric(doc.likeCount ?? doc.like_count ?? "0");
  const commentCount = parseMetric(doc.commentCount ?? doc.comment_count ?? "0");
  const shareCount = parseMetric(doc.shareCount ?? doc.share_count ?? "0");

  const durationSec = parseMetric(doc.duration ?? doc.durationSec ?? doc.video_duration ?? 0);
  const musicTitle = (doc.musicTitle ?? doc.music?.title ?? doc.sound?.title ?? "").toString();
  const shareUrl = (doc.shareUrl ?? doc.permalink ?? doc.link ?? "").toString();

  const captionText = (doc.caption ?? doc.desc ?? doc.title ?? "").toString();
  const hashtags = (captionText.match(/#\w+/g) || []).map(t => t.toLowerCase());

  return {
    id: (doc.id ?? doc.video_id ?? doc._id)?.toString(),
    platform: doc.platform ?? "unknown",
    caption: captionText,
    user: (doc.user ?? doc.author ?? doc.channel ?? "").toString(),

    // Video URL öncelikleri
    videoUrl: (
      doc.videoUrl ??
      doc.video_url ??
      doc.play_addr ??
      doc.download_addr ??
      ""
    ).toString(),

    // Preview (kısa video) varsa
    previewUrl: (
      doc.preview_video_url ??
      doc.play_addr_lowbr ??
      ""
    ).toString(),

    // Thumbnail öncelikleri
    thumbnail: (
      doc.thumbnail ??
      doc.thumb ??
      doc.cover ??
      doc.origin_cover ??
      doc.thumbnail_url ??
      doc.display_url ??
      doc.thumbnails?.medium?.url ??
      doc.thumbnails?.high?.url ??
      ""
    ).toString(),

    // Metrikler
    playCount,
    likeCount,
    commentCount,
    shareCount,
    durationSec,

    // Ek alanlar
    musicTitle,
    shareUrl,
    hashtags,

    mediaType: (doc.mediaType ?? doc.media_type ?? "video").toString(),
    collectedAt: (
      doc.collectedAt ??
      doc.collected_at ??
      doc.created_at ??
      doc.createdAt ??
      new Date()
    ),
    country: doc.country ?? "Unknown",
  };
}

async function ensureIndexes(db) {
  // RAW koleksiyonları (inkremental tarama için zaman alanlarına indeks)
  await db.collection('raw_tiktok').createIndex({ collected_at: -1 });
  await db.collection('raw_instagram').createIndex({ collected_at: -1 });
  await db.collection('raw_youtube').createIndex({ collected_at: -1 });

  // Uygulama koleksiyonları (sıralama ve benzersizlik)
  await db.collection('tiktok_videos').createIndex({ collected_at: -1 });
  await db.collection('instagram_videos').createIndex({ collected_at: -1 });
  await db.collection('youtube_videos').createIndex({ collected_at: -1 });

  await db.collection('tiktok_videos').createIndex({ id: 1 }, { unique: true });
  await db.collection('instagram_videos').createIndex({ id: 1 }, { unique: true });
  await db.collection('youtube_videos').createIndex({ id: 1 }, { unique: true });

  // Trend analizi için hızlı sorgular
  await db.collection('tiktok_videos').createIndex({ playCount: -1 });
  await db.collection('instagram_videos').createIndex({ playCount: -1 });
  await db.collection('youtube_videos').createIndex({ playCount: -1 });

  await db.collection('sync_meta').createIndex({ key: 1 }, { unique: true });
}

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
    const doc = await cursor.next();
    processed++;

    const n = normalize(doc);

    // Filtre koşulları (thumbnail zorunlu değil)
    const valid =
      n.playCount >= MIN_VIEWS &&
      n.videoUrl.length > 0 &&
      n.caption.length > 0;

    if (!valid) {
      skipped++;
      continue;
    }

    try {
      await destCol.updateOne(
        { id: n.id },
        {
          $set: {
            ...n,
            collected_at: n.collectedAt
          }
        },
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
