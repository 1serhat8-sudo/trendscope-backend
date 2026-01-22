const path = require('path');
const dotenv = require('dotenv');
const express = require('express');
const cors = require('cors');
const { MongoClient } = require('mongodb');
const { startRefreshScheduler } = require('./services/refresh');

// 🔑 .env dosyasını yükle
dotenv.config({ path: path.resolve(__dirname, '.env') });

// Router importları
const feedRoutes = require('./api/feed');
const accessRoutes = require('./api/access');
const resolveRoutes = require('./api/resolve');
const playRoutes = require('./api/play');
const proxyRoutes = require('./api/proxy');
const statsRoutes = require('./api/stats');
const youtubeRoutes = require('./routes/youtube');
const userActionsRoutes = require('./routes/userActions'); // ✅ Yeni eklendi

const app = express();
app.use(cors());
app.use(express.json());

// Mongo bağlantısı
const uri = process.env.MONGO_URI || "mongodb://localhost:27017";
const dbName = "trendscope";
const client = new MongoClient(uri, { ignoreUndefined: true });

async function initDb() {
  await client.connect();
  const db = client.db(dbName);
  app.locals.db = db;
  console.log(`🗄️ MongoDB bağlandı: ${dbName}`);

  // ✅ Benzersiz index tanımları (duplicate kaydı engeller)
  await db.collection('liked_items').createIndex(
    { userId: 1, itemId: 1 },
    { unique: true, name: 'uniq_user_item_like' }
  );
  await db.collection('saved_items').createIndex(
    { userId: 1, itemId: 1 },
    { unique: true, name: 'uniq_user_item_save' }
  );
}

// Routes
app.use('/api', feedRoutes);
app.use('/api', accessRoutes);
app.use('/api', resolveRoutes);
app.use('/api', playRoutes);
app.use('/api', statsRoutes);
app.use('/api', youtubeRoutes);
app.use('/api', userActionsRoutes); // ✅ Yeni route mount edildi

// ⚠️ Proxy mount düzeltildi
app.use('/api', proxyRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: "ok" });
});

const PORT = process.env.PORT || 5000; // sen zaten 5000 kullanıyorsun

initDb().then(() => {
  startRefreshScheduler(app);

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Backend çalışıyor: http://0.0.0.0:${PORT}`);
    console.log(`📡 LAN erişimi için: http://172.20.10.2:${PORT}`);
  });
}).catch(err => {
  console.error('❌ Mongo bağlantı hatası:', err);
  process.exit(1);
});
