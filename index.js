require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// ROUTES
const youtubeRoutes = require('./api/youtube'); // YouTube arama endpointleri
const feedRoutes = require('./api/feed');       // Trend puanı feed endpointleri
const instagramRoutes = require('./api/instagram'); // Instagram trend endpointleri

app.use('/api', youtubeRoutes);
app.use('/api', feedRoutes);
app.use('/api', instagramRoutes);

// Sağlık testi endpoint'i
app.get('/health', (req, res) => {
  res.json({ status: 'OK', time: new Date().toISOString() });
});

const PORT = process.env.PORT || 5000;

// 🔹 Eski hali: sadece localhost'ta dinler
app.listen(PORT, () => {
  console.log(`API Gateway ${PORT} portunda çalışıyor`);
});
