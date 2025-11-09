const querystring = require("querystring");

function buildProxyUrl(upstreamUrl) {
  if (!upstreamUrl) return null;
  const qs = querystring.stringify({ url: upstreamUrl });
  return `/api/proxy/stream?${qs}`;
}

module.exports = { buildProxyUrl };
