// /api/stats?days=30 — the numbers behind stats.html.
//
// The dashboard is private: without the right key this returns 401 and nothing
// else. The Supabase service key never leaves the server; the browser only ever
// sees the aggregate JSON this endpoint returns.
//
// stats.html sends the dashboard key in the x-stats-key header, which keeps it
// out of browser history, out of Referer headers and out of request logs. The
// ?key= form still works, for curl.
//
// Environment:
//   SUPABASE_URL, SUPABASE_SERVICE_KEY  (same values as /api/download)
//   STATS_KEY                           the password for this dashboard

const crypto = require('crypto');

function digest(s) {
  return crypto.createHash('sha256').update(String(s)).digest();
}

// Compared as fixed-length digests so neither the length nor an early-exit
// timing difference tells an attacker anything about the real key.
function keyMatches(given, expected) {
  return crypto.timingSafeEqual(digest(given), digest(expected));
}

function send(res, code, body) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

module.exports = async (req, res) => {
  const expected = process.env.STATS_KEY;
  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;

  if (!expected || !base || !key) {
    return send(res, 503, { error: 'not-configured', missing: {
      STATS_KEY: !expected, SUPABASE_URL: !base, SUPABASE_SERVICE_KEY: !key } });
  }

  const q = req.query || {};
  const given = q.key || (req.headers['x-stats-key'] || '');
  if (!given || !keyMatches(given, expected)) {
    return send(res, 401, { error: 'unauthorized' });
  }

  const days = Math.min(Math.max(parseInt(q.days, 10) || 30, 1), 365);

  try {
    const r = await fetch(base.replace(/\/+$/, '') + '/rest/v1/rpc/download_stats', {
      method: 'POST',
      headers: {
        'apikey': key,
        'Authorization': 'Bearer ' + key,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_days: days }),
      signal: AbortSignal.timeout(8000),
    });
    const text = await r.text();
    if (!r.ok) return send(res, 502, { error: 'supabase', status: r.status, detail: text.slice(0, 300) });
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    return res.end(text);
  } catch (err) {
    return send(res, 504, { error: 'timeout' });
  }
};
