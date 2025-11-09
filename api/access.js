const express = require('express');
const router = express.Router();

const FREE_MAX = 80;
const AD_GRANT_SIZE = 40;
const AD_GRANT_MAX = 3;

// Üyelik kontrolü
async function isMember(db, userId) {
  const u = await db.collection('users').findOne({ userId });
  if (!u || !u.membership) return false;
  if (u.membership === 'none') return false;
  if (!u.membershipExpiresAt) return true;
  return new Date(u.membershipExpiresAt) > new Date();
}

// AccessState getir/oluştur + reset kontrolü
async function getAccessState(db, userId, resetMode = 'midnight') {
  const col = db.collection('access_state');
  let state = await col.findOne({ userId });
  const now = new Date();

  if (!state) {
    state = {
      userId,
      freeQuotaUsed: 0,
      adQuotaUsed: 0,
      adGrantCount: 0,
      periodStart: now.toISOString(),
      lastAdAt: null,
      updatedAt: now.toISOString(),
    };
    await col.insertOne(state);
    return state;
  }

  if (resetMode === 'midnight') {
    const start = new Date(state.periodStart);
    const changedDay = start.getDate() !== now.getDate() ||
      start.getMonth() !== now.getMonth() ||
      start.getFullYear() !== now.getFullYear();
    if (changedDay) {
      state.freeQuotaUsed = 0;
      state.adQuotaUsed = 0;
      state.adGrantCount = 0;
      state.periodStart = now.toISOString();
      await col.updateOne({ userId }, { $set: state });
    }
  } else if (resetMode === 'rolling12h') {
    const start = new Date(state.periodStart);
    if (now - start >= 12 * 60 * 60 * 1000) {
      state.freeQuotaUsed = 0;
      state.adQuotaUsed = 0;
      state.adGrantCount = 0;
      state.periodStart = now.toISOString();
      await col.updateOne({ userId }, { $set: state });
    }
  }

  return state;
}

// /access/state → kalan hakları döner
router.get('/access/state', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const resetMode = req.app.locals.ACCESS_RESET_MODE || 'midnight';

    const userId = (req.query.userId || 'guest').toString();
    const member = await isMember(db, userId);
    const state = await getAccessState(db, userId, resetMode);

    const freeRemaining = Math.max(FREE_MAX - (state.freeQuotaUsed || 0), 0);
    const adTotalCap = AD_GRANT_SIZE * Math.min(state.adGrantCount || 0, AD_GRANT_MAX);
    const adRemaining = Math.max(adTotalCap - (state.adQuotaUsed || 0), 0);
    const canGrant = (state.adGrantCount || 0) < AD_GRANT_MAX;

    res.json({
      userId,
      membership: member ? 'active' : 'none',
      freeRemaining,
      adRemaining,
      grantCount: state.adGrantCount || 0,
      canGrant,
      periodStart: state.periodStart,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Access state alınamadı' });
  }
});

// /access/ad-grant → reklam ödülü: +40 içerik grant (max 3)
router.post('/access/ad-grant', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const userId = (req.body.userId || 'guest').toString();

    const userIsMember = await isMember(db, userId);
    if (userIsMember) {
      return res.json({ ok: true, message: 'Üyelik aktif, grant gereksiz' });
    }

    const col = db.collection('access_state');
    const state = await col.findOne({ userId }) || {
      userId,
      freeQuotaUsed: 0,
      adQuotaUsed: 0,
      adGrantCount: 0,
      periodStart: new Date().toISOString(),
      lastAdAt: null,
      updatedAt: new Date().toISOString(),
    };

    if ((state.adGrantCount || 0) >= AD_GRANT_MAX) {
      return res.status(400).json({ error: 'Günlük grant limiti doldu' });
    }

    // Not: Burada gerçek reklam doğrulaması (receipt/verifier) entegre edilebilir.
    const newGrantCount = (state.adGrantCount || 0) + 1;

    await col.updateOne(
      { userId },
      {
        $set: {
          adGrantCount: newGrantCount,
          // Grant verildiğinde adQuotaUsed sıfırlamayız; tüketim kümülatiftir.
          lastAdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }
      },
      { upsert: true }
    );

    res.json({ ok: true, grantCount: newGrantCount, grantSize: AD_GRANT_SIZE });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Ad grant başarısız' });
  }
});

module.exports = router;
