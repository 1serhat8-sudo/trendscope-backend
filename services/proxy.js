const querystring = require("querystring");
const url = require("url");
const fetch = require("node-fetch");

// İzin verilen domainler (wildcard destekli)
const allowedDomains = [
  "tiktokcdn.com",
  "cdninstagram.com",
  "fbcdn.net",
  "instagram.com",
  "youtube.com",
  "ytimg.com",
  "googlevideo.com"
];

function buildProxyUrl(upstreamUrl) {
  if (!upstreamUrl) return null;
  const qs = querystring.stringify({ url: upstreamUrl });
  return `/api/proxy/stream?${qs}`;
}

async function proxyStream(req, res) {
  const upstreamUrl = req.query.url;
  if (!upstreamUrl) {
    return res.status(400).json({ error: "Missing upstream URL" });
  }

  const parsed = url.parse(upstreamUrl);
  const hostname = parsed.hostname || "";

  // Güvenlik kontrolü: wildcard domain match
  if (!allowedDomains.some(domain => hostname.includes(domain))) {
    return res.status(403).json({ error: "Forbidden domain", domain: hostname });
  }

  try {
    const response = await fetch(upstreamUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Linux; Android 10; Mobile) Chrome/90.0 Safari/537.36",
        "Accept": "*/*",
        "Referer": `https://${hostname}/`,
        "Origin": `https://${hostname}`,
        "Range": req.headers.range || "bytes=0-",
        "sec-fetch-mode": "navigate",
        "sec-fetch-site": "same-origin",
        "accept-language": req.headers["accept-language"] || "en-US,en;q=0.9",
        "cookie": req.headers["cookie"] || ""
      }
    });

    if (!response.ok) {
      return res.status(response.status).json({
        error: `Upstream error ${response.status}`,
        reason: response.statusText
      });
    }

    // Response header forwarding
    res.status(response.status);
    for (const [key, value] of response.headers.entries()) {
      res.setHeader(key, value);
    }

    // HLS/M3U8 rewrite (basit kontrol)
    if (upstreamUrl.endsWith(".m3u8")) {
      const text = await response.text();
      const rewritten = text.replace(/https?:\/\/[^ ]+/g, match => buildProxyUrl(match));
      res.send(rewritten);
    } else {
      response.body.pipe(res);
    }
  } catch (e) {
    console.error("[proxy] hata:", e.message);
    res.status(500).json({ error: "Proxy failure", reason: e.message });
  }
}

module.exports = { buildProxyUrl, proxyStream };
