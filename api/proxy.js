const express = require("express");
const fetch = require("node-fetch");

const router = express.Router();

// /api/proxy/stream?url=<encoded upstream>
router.get("/proxy/stream", async (req, res) => {
  try {
    const targetUrl = req.query.url;
    if (!targetUrl) {
      return res.status(400).send("url parametresi gerekli");
    }

    const allowedDomains = ["tiktok.com", "instagram.com", "youtube.com"];
    if (!allowedDomains.some(domain => targetUrl.includes(domain))) {
      return res.status(403).send("İzin verilmeyen domain");
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const headers = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Referer": "https://www.tiktok.com/",
      "Accept": "*/*",
      "Connection": "keep-alive",
      ...(req.headers.range ? { Range: req.headers.range } : {}),
    };

    const response = await fetch(targetUrl, { headers, signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok && response.status !== 206) {
      return res.status(response.status).send("Proxy isteği başarısız");
    }

    // Header’ları aynen aktar
    if (response.headers.get("content-type"))
      res.setHeader("Content-Type", response.headers.get("content-type"));
    if (response.headers.get("content-length"))
      res.setHeader("Content-Length", response.headers.get("content-length"));
    if (response.headers.get("accept-ranges"))
      res.setHeader("Accept-Ranges", response.headers.get("accept-ranges"));

    res.status(response.status);
    response.body.pipe(res);
    response.body.on("error", (err) => {
      console.error("Proxy stream error:", err);
      res.end();
    });
  } catch (err) {
    console.error("Proxy hata:", err);
    res.status(500).send("Proxy hata");
  }
});

module.exports = router;
