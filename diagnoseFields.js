const { MongoClient } = require('mongodb');
const uri = "mongodb://localhost:27017";
const client = new MongoClient(uri);

async function run() {
  try {
    await client.connect();
    const db = client.db("TrendScope");
    const videos = db.collection("videos");

    // platform alanındaki tüm farklı değerleri listele
    const platforms = await videos.distinct("platform");
    console.log("Platform alanındaki farklı değerler:");
    console.log(platforms);

    // örnek olarak ilk 3 youtube kaydını getir
    const docs = await videos.find({ platform: /youtube/i }).limit(3).toArray();
    console.log("Örnek YouTube kayıtları:");
    console.log(JSON.stringify(docs, null, 2));
  } catch (err) {
    console.error("Hata:", err);
  } finally {
    await client.close();
  }
}

run();
