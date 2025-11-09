const { MongoClient } = require('mongodb');
const uri = "mongodb://localhost:27017";
const client = new MongoClient(uri);

function normalize(doc) {
  return {
    id: doc.id ?? doc._id?.toString(),
    platform: "youtube",
    caption: doc.caption ?? "",
    user: doc.user ?? "",
    videoUrl: doc.video_url ?? "",
    playCount: doc.play_count ?? "0",
    likeCount: doc.like_count ?? "0",
    commentCount: doc.comment_count ?? "0",
    shareCount: doc.share_count ?? "0",
    mediaType: doc.media_type ?? "video",
    collectedAt: doc.collected_at ?? new Date().toISOString()
  };
}

async function run() {
  try {
    await client.connect();
    const db = client.db("TrendScope");
    const videos = db.collection("videos");
    const youtubeCol = db.collection("youtube_videos");

    const query = {
      $or: [
        { source: "youtube.com" },
        { video_url: { $regex: /youtube\.com|youtu\.be/i } }
      ]
    };

    const docs = await videos.find(query).toArray();
    console.log("Bulunan YouTube kayıtları:", docs.length);

    if (docs.length > 0) {
      const normalized = docs.map(normalize);
      await youtubeCol.insertMany(normalized, { ordered: false });
      await videos.deleteMany({ _id: { $in: docs.map(d => d._id) } });
      console.log(`Taşındı: ${normalized.length} kayıt.`);
    } else {
      console.log("Hiç YouTube kaydı bulunamadı.");
    }
  } catch (err) {
    console.error("Hata:", err);
  } finally {
    await client.close();
  }
}

run();
