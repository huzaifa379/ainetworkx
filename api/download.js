// /api/download — counts a download, then hands over the APK.
//
// The counter is deliberately not allowed to matter: if Supabase is not
// configured, is slow, or errors, the visitor still gets redirected to the file.
// A download must never fail because a statistic could not be written.
//
// One row per device per UTC day. Tapping the button repeatedly increments that
// row's `hits` instead of adding rows, so the dashboard's headline number is
// people rather than presses. X-Download-Counter reports which branch ran:
//   new | repeat | logged-legacy | not-configured | rejected:<code> | timeout |
//   failed | skipped
//
// Environment (set in Vercel → Project → Settings → Environment Variables):
//   SUPABASE_URL          https://<ref>.supabase.co
//   SUPABASE_SERVICE_KEY  the service_role / secret key (server-side only)
//   HASH_SALT             any long random string (optional but recommended)
const crypto = require('crypto');

const APK_PATH = 'https://github.com/huzaifa379/ainetworkx/releases/download/v1.0.7/NetX-Downloader.apk';

// A warm insert measured 0.40–0.49 s; the first one after an idle period ran
// past 1.2 s and was cut off even though the row had already been written. The
// budget is the ceiling on how long a visitor could ever wait in front of a
// 75 MB download, so it is generous enough to survive a cold start and still
// small enough to be invisible next to the file itself.
const WRITE_TIMEOUT_MS = 2000;

// Link-preview fetchers and crawlers pull the URL without a human behind it.
// Counting them would quietly inflate every number on the dashboard.
const BOT = /bot\b|bots?\/|crawler|crawling|spider|slurp|facebookexternalhit|slackbot|whatsapp|telegram|discordbot|bingpreview|embedly|quora link preview|pinterest|vkshare|headlesschrome|lighthouse|uptime|monitor|python-requests|okhttp|go-http-client/i;

function deviceFrom(ua) {
  if (/android/i.test(ua)) return 'android';
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios';
  if (/windows|macintosh|cros|x11|linux/i.test(ua)) return 'desktop';
  return 'other';
}

function grab(ua, re) { const m = ua.match(re); return m ? m[1] : null; }
function major(v) { return v ? String(v).split('.')[0] : null; }

// Order matters: Edge and Opera both also claim "Chrome", and everything on iOS
// also claims "Safari". First match wins, so the specific names come first.
function browserFrom(ua) {
  if (/Edg[A-Z]?\//.test(ua))     return ['Edge',              major(grab(ua, /Edg[A-Z]?\/([\d.]+)/))];
  if (/OPR\/|Opera/.test(ua))     return ['Opera',             major(grab(ua, /(?:OPR|Opera)\/([\d.]+)/))];
  if (/SamsungBrowser/.test(ua))  return ['Samsung Internet',  major(grab(ua, /SamsungBrowser\/([\d.]+)/))];
  if (/UCBrowser/.test(ua))       return ['UC Browser',        major(grab(ua, /UCBrowser\/([\d.]+)/))];
  if (/YaBrowser/.test(ua))       return ['Yandex',            major(grab(ua, /YaBrowser\/([\d.]+)/))];
  if (/Brave/.test(ua))           return ['Brave',             major(grab(ua, /Chrome\/([\d.]+)/))];
  if (/FxiOS|Firefox\//.test(ua)) return ['Firefox',           major(grab(ua, /(?:FxiOS|Firefox)\/([\d.]+)/))];
  if (/; wv\)/.test(ua))          return ['Android WebView',   major(grab(ua, /Chrome\/([\d.]+)/))];
  if (/CriOS\//.test(ua))         return ['Chrome',            major(grab(ua, /CriOS\/([\d.]+)/))];
  if (/Chrome\//.test(ua))        return ['Chrome',            major(grab(ua, /Chrome\/([\d.]+)/))];
  if (/Safari\//.test(ua))        return ['Safari',            major(grab(ua, /Version\/([\d.]+)/))];
  if (/curl\//i.test(ua))         return ['curl',              major(grab(ua, /curl\/([\d.]+)/i))];
  return [null, null];
}

const WIN = { '10.0': '10/11', '6.3': '8.1', '6.2': '8', '6.1': '7' };

function osFrom(ua) {
  if (/Android/.test(ua))            return ['Android', grab(ua, /Android ([\d.]+)/)];
  if (/iPhone|iPad|iPod/.test(ua))   return ['iOS', (grab(ua, /OS ([\d_]+)/) || '').replace(/_/g, '.') || null];
  if (/Windows NT/.test(ua))         { const v = grab(ua, /Windows NT ([\d.]+)/); return ['Windows', WIN[v] || v]; }
  if (/Mac OS X/.test(ua))           return ['macOS', (grab(ua, /Mac OS X ([\d_.]+)/) || '').replace(/_/g, '.') || null];
  if (/CrOS/.test(ua))               return ['ChromeOS', grab(ua, /CrOS \S+ ([\d.]+)/)];
  if (/Linux/.test(ua))              return ['Linux', null];
  return [null, null];
}

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || '';
  return String(fwd).split(',')[0].trim() || null;
}

function visitorHash(ip, ua, salt) {
  if (!ip) return null;
  const day = new Date().toISOString().slice(0, 10);
  return crypto.createHash('sha256').update(ip + '|' + ua + '|' + day + '|' + salt).digest('hex');
}

async function record(req, ua) {
  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!base || !key) return 'not-configured';

  const salt = process.env.HASH_SALT ||
    crypto.createHash('sha256').update(key).digest('hex').slice(0, 32);
  const referrer = (req.headers.referer || req.headers.referrer || '') + '';
  const ip = clientIp(req);
  const [browser, browserVersion] = browserFrom(ua);
  const [os, osVersion] = osFrom(ua);
  const h = req.headers;

  const args = {
    p_country: h['x-vercel-ip-country'] || null,
    p_device: deviceFrom(ua),
    p_referrer: referrer ? referrer.slice(0, 200) : null,
    p_app_version: process.env.APK_VERSION || '1.0.7',
    p_visitor_hash: visitorHash(ip, ua, salt),
    p_ip: ip,
    p_ua: ua ? ua.slice(0, 400) : null,
    p_browser: browser,
    p_browser_version: browserVersion,
    p_os: os,
    p_os_version: osVersion,
    p_city: h['x-vercel-ip-city'] ? decodeURIComponent(h['x-vercel-ip-city']) : null,
    p_region: h['x-vercel-ip-country-region'] || null,
  };

  const root = base.replace(/\/+$/, '');
  const auth = {
    'apikey': key,
    'Authorization': 'Bearer ' + key,
    'Content-Type': 'application/json',
  };

  // record_download() collapses repeated taps from one device into one row.
  const r = await fetch(root + '/rest/v1/rpc/record_download', {
    method: 'POST',
    headers: auth,
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(WRITE_TIMEOUT_MS),
  });
  if (r.ok) return (await r.text()).replace(/"/g, '').trim() || 'logged';

  // 404 means the schema upgrade has not been run yet. Rather than lose the
  // click, fall back to a plain insert using only the columns the first version
  // of the table already had.
  if (r.status === 404) {
    const legacy = {
      country: args.p_country, device: args.p_device, referrer: args.p_referrer,
      app_version: args.p_app_version, visitor_hash: args.p_visitor_hash,
    };
    const f = await fetch(root + '/rest/v1/downloads', {
      method: 'POST',
      headers: Object.assign({ 'Prefer': 'return=minimal' }, auth),
      body: JSON.stringify(legacy),
      signal: AbortSignal.timeout(WRITE_TIMEOUT_MS),
    });
    return f.ok ? 'logged-legacy' : 'rejected:' + f.status;
  }
  return 'rejected:' + r.status;
}

module.exports = async (req, res) => {
  const ua = req.headers['user-agent'] || '';
  let outcome = 'skipped';

  if (req.method === 'GET' && !BOT.test(ua)) {
    try {
      outcome = await record(req, ua);
    } catch (err) {
      // All the same to the visitor; separated only so that `curl -I /download`
      // says whether Supabase was slow or actually broken.
      outcome = err && err.name === 'TimeoutError' ? 'timeout' : 'failed';
    }
  }

  // no-store, or the browser and the edge would serve the redirect from cache
  // next time and the click would never reach this function again.
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Download-Counter', outcome);
  res.statusCode = 307;
  res.setHeader('Location', APK_PATH);
  res.end();
};
