const express = require("express");
const fetch = require("node-fetch");
const { buildProxyUrl } = require("../services/proxy");

const router = express.Router();

// /api/proxy/stream?url=<encoded upstream>
router.get("/proxy/stream", async (req, res) => {
  try {
    const targetUrl = req.query.url;
    if (!targetUrl) {
      return res.status(400).json({ error: "url parametresi gerekli" });
    }

    const allowedDomains = [
      "tiktokcdn.com",
      "cdninstagram.com",
      "fbcdn.net",
      "instagram.com",
      "youtube.com",
      "ytimg.com",
      "googlevideo.com"
    ];
    if (!allowedDomains.some(domain => targetUrl.includes(domain))) {
      return res.status(403).json({ error: "İzin verilmeyen domain", domain: targetUrl });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const headers = {
      "User-Agent": "Mozilla/5.0 (Linux; Android 10; Mobile) Chrome/90.0 Safari/537.36",
      "Accept": "*/*",
      "Referer": targetUrl,
      "Origin": targetUrl,
      "Connection": "keep-alive",
      "sec-fetch-mode": "navigate",
      "sec-fetch-site": "same-origin",
      "accept-language": req.headers["accept-language"] || "en-US,en;q=0.9",
      ...(req.headers.range ? { Range: req.headers.range } : {}),
      ...(req.headers.cookie ? { Cookie: req.headers.cookie } : {})
    };

    const response = await fetch(targetUrl, { headers, signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok && response.status !== 206) {
      return res.status(response.status).json({ error: "Proxy isteği başarısız" });
    }

    // Header’ları aynen aktar
    res.status(response.status);
    for (const [key, value] of response.headers.entries()) {
      res.setHeader(key, value);
    }

    // HLS/M3U8 rewrite
    if (targetUrl.endsWith(".m3u8")) {
      const text = await response.text();
      const rewritten = text.replace(/https?:\/\/[^ \n]+/g, match => buildProxyUrl(match));
      res.send(rewritten);
    } else {
      response.body.pipe(res);
      response.body.on("error", (err) => {
        console.error("Proxy stream error:", err);
        res.end();
      });
    }
  } catch (err) {
    console.error("Proxy hata:", err);
    res.status(500).json({ error: "Proxy hata", details: err.message });
  }
});

module.exports = router;
