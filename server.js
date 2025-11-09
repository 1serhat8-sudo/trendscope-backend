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
}

// Routes
app.use('/api', feedRoutes);
app.use('/api', accessRoutes);
app.use('/api', resolveRoutes);
app.use('/api', playRoutes);
app.use('/api', statsRoutes);
app.use('/api', youtubeRoutes);

// ⚠️ Proxy mount düzeltildi
// api/proxy.js içinde /proxy/stream tanımlı → burada /api mount edelim
app.use('/api', proxyRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: "ok" });
});

const PORT = process.env.PORT || 3000;

initDb().then(() => {
  startRefreshScheduler(app);

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Backend çalışıyor: http://0.0.0.0:${PORT}`);
    console.log(`📡 LAN erişimi için: http://<PC_IP>:${PORT}`);
  });
}).catch(err => {
  console.error('❌ Mongo bağlantı hatası:', err);
  process.exit(1);
});
