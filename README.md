# Vid Download — website

The public landing page for the Vid Download Android app: one page that explains
what the app does, shows it in six screenshots, and hands over the signed APK,
plus the two legal pages the app itself links to from Settings.

Plain HTML, one stylesheet, one small script. No build step, no framework, no
dependencies — `git push` is the whole deploy pipeline.

## Layout

```
web/
├── index.html          landing page (hero, platforms, features, screenshots,
│                       how-it-works, install guide, FAQ, download band)
├── privacy.html        privacy policy — the app links here from Settings
├── terms.html          terms of service — likewise
├── 404.html            not-found page (Vercel serves it automatically)
├── css/style.css       the whole stylesheet, mobile-first
├── js/config.js        version, size, APK URL — the only file to edit on release
├── js/main.js          drawer, gallery arrows, scroll reveal, build stamps
├── assets/
│   ├── logo-512.png    app icon, used in the header and footer
│   ├── favicon.png     browser tab icon
│   ├── apple-touch-icon.png
│   ├── og-image.png    1200×630 social preview
│   └── screens/*.webp  six device screenshots, with .png fallbacks
├── vercel.json         redirects, rewrites, cache and security headers
├── robots.txt
├── sitemap.xml
└── .gitignore          keeps the 72 MB APK out of git
```

Both legal filenames are load-bearing: `util/Links.kt` in the app points at
`$SITE/privacy.html` and `$SITE/terms.html`. Rename them and the in-app links
break. `vercel.json` also accepts `/privacy` and `/terms` without the extension.

## Preview it locally

```bash
cd "E:/Vid Download/web" && python -m http.server 4173
```

Then open <http://localhost:4173>. Test the phone layout with your browser's
device toolbar — the breakpoints are 700 px and 960 px.

## Deploy

1. Create an empty GitHub repository and push this folder as its root:

   ```bash
   cd "E:/Vid Download/web" && git init && git add . && git commit -m "Vid Download website" && git branch -M main && git remote add origin https://github.com/<you>/<repo>.git && git push -u origin main
   ```

2. On <https://vercel.com/new>, import that repository. Framework preset
   **Other**, build command **empty**, output directory **`.`** (it is a static
   site — Vercel needs nothing else). Deploy.
3. Add your domain under Project → Settings → Domains, then set
   `Links.SITE` in the app to the same host so Settings → Privacy opens the
   real page.

## Hosting the APK

The signed APK is about 72 MB. GitHub warns above 50 MB and refuses above
100 MB, so `.gitignore` excludes `*.apk` and every download button points at
`/download`, which `vercel.json` redirects. Pick one of these:

- **GitHub Release (recommended).** Attach `VidDownload.apk` to a release, then
  change the `/download` destination in `vercel.json` to
  `https://github.com/<you>/<repo>/releases/download/v1.0.7/VidDownload.apk`.
- **Same origin.** Copy the APK into this folder as `VidDownload.apk` and deploy
  from your machine with `npx vercel --prod`, which uploads the working
  directory rather than the git tree. Leave `vercel.json` as it is.

Either way the file is served as `application/vnd.android.package-archive` with
a `Content-Disposition` filename, so phones save it as an installable APK.

## Releasing a new version

Edit `js/config.js` — `version`, `sizeMb`, `updated`, and `apkUrl` if it moved.
Every button, badge and stamp on all three pages reads from it. Then bump the
`softwareVersion`/`fileSize` in the JSON-LD block in `index.html`, the dates in
`sitemap.xml`, and the "applies to" line at the top of each legal page.

## Regenerating the screenshots

Capture on the device and downscale to 520 px wide:

```bash
adb exec-out screencap -p > home.png && ffmpeg -y -i home.png -vf scale=520:-1 -quality 82 assets/screens/home.webp
```

Keep a `.png` next to every `.webp` — `index.html` uses `<picture>`, and old
Android WebViews still need the fallback.

## Publishing the 72 MB APK (read this before wondering why the button 404s)

**In effect right now:** the repo is private, so GitHub Release assets would need a
login to download. The APK is therefore committed at the repo root and Vercel serves
it from the site itself, which is why `/download` keeps working after every deploy.
Cost of that choice: the git history grows by ~72 MB per release. If the repo is ever
made public, switch to route 1 below and delete the binary from the tree.

`.gitignore` excludes `*.apk` on purpose, so the APK is **not** in the repo and a
git-driven Vercel build deploys a site with no file behind `/download`. GitHub's
drag-and-drop uploader also refuses it — that box caps at 25 MB. Two routes work:

**1. GitHub Release (recommended — survives every redeploy).** Release assets are
allowed up to 2 GB, so the 25 MB limit does not apply there. Repo → Releases →
*Draft a new release* → tag `v1.0.7` → attach `VidDownload.apk` → publish. Then
point the site at it in two places:

- `js/config.js` → `apkUrl: "https://github.com/<user>/<repo>/releases/download/v1.0.7/VidDownload.apk"`
- `vercel.json` → the `/download` redirect `destination` (same URL), so old links keep working.

**2. Deploy the file straight to Vercel (fastest, but fragile).**

```bash
cd "E:/Vid Download/web" && npx vercel --prod
```

`.vercelignore` exists so the CLI stops inheriting `.gitignore`'s `*.apk` rule and
actually uploads the APK. Leave `apkUrl` as `/download`; `vercel.json` redirects it
to `/VidDownload.apk`. Caveat: the next `git push` triggers a build from GitHub,
where the APK does not exist, and the button breaks again. Use route 1 for anything
long-lived.

After either route, load the site and click the button once — a 404 here is silent
on the page and only visible in the network tab.

### The live domain

Production is **https://vid-download-iv.vercel.app** (the older alias
`vid-download-ivory.vercel.app` 307s to it). That hostname is written into
`<link rel="canonical">` on all three pages, `og:url` in `index.html`, the
`Sitemap:` line in `robots.txt`, and the three `<loc>` entries in
`sitemap.xml`. If a real domain is ever bought, one command switches them:

```bash
grep -rl 'vid-download-iv.vercel.app' --include='*.html' --include='*.xml' --include='*.txt' . \
  | xargs sed -i 's#vid-download-iv.vercel.app#yourdomain.com#g'
```

The `support@` / `legal@viddownload.app` addresses in the legal pages are a
separate thing — they are mailbox names, not site URLs, and they only work
once that domain (or whichever one replaces it) has mail set up.

## Download counter (Supabase)

`/download` is no longer a static redirect: `vercel.json` rewrites it to
`api/download.js`, which records the click in Supabase and then 307s to
`/VidDownload.apk`. The counter is deliberately unable to break a download — if
Supabase is unset, slow or erroring, the redirect still happens and the response
carries `X-Download-Counter: new | repeat | logged-legacy | not-configured |
rejected:<code> | timeout | failed | skipped` so you can tell from `curl -I`
which path it took. Link-preview bots (WhatsApp, Facebook, Slack…) are matched
by user-agent and not counted.

**One row per device per UTC day.** Pressing the button five times increments
that row's `hits` instead of writing five rows, so the headline figure is people
rather than presses; both are on the dashboard. Deduplication keys on the IP
address, falling back to the daily hash when the address is unavailable. Each row
holds the time, IP, city/region/country from Vercel's edge headers, browser and
major version, OS and version, phone-vs-desktop, referring page, served app
version and the tap count — see §3.6 of `privacy.html`, which has to stay true to
this list.

| Piece | Where |
| --- | --- |
| Write endpoint | `api/download.js` → `/download` |
| Read endpoint | `api/stats.js` → `/api/stats?days=30` + `x-stats-key` header |
| Dashboard | `stats.html` → `/stats` (noindex, key-gated) |
| Schema, dedupe + aggregate functions | `supabase/schema.sql` |

`schema.sql` is idempotent and doubles as the migration: re-running it adds any
missing columns, collapses rows written before deduping existed into a single row
per device per day with their `hits` preserved, and replaces both functions. If
`record_download` is missing (schema not yet re-run), `api/download.js` falls
back to a plain insert on the original five columns rather than losing the click.

Setup, once:

1. Supabase → SQL Editor → paste `supabase/schema.sql` → Run.
2. Vercel → Project → Settings → Environment Variables (Production + Preview):
   `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` (the `service_role` / secret key),
   `STATS_KEY` (the dashboard password), `HASH_SALT` (any long random string),
   optionally `APK_VERSION`.
3. Redeploy, click the button once, then open `/stats` and enter `STATS_KEY`.

The service key is a server-only secret: it lives in Vercel's environment, never
in this repo and never in anything the browser receives. The browser only ever
sees the aggregate JSON from `/api/stats`. Row level security is on with no
policies, so the publishable key cannot read the table at all. To rotate the
key, add a second one in Supabase → Settings → API Keys, update
`SUPABASE_SERVICE_KEY` in Vercel, redeploy, then delete the old one.

### Who can open the dashboard

`/stats` is a static page, so anyone who types the path gets it — but it renders
nothing except the key prompt. Every number comes from `/api/stats`, which
answers `401 {"error":"unauthorized"}` without a matching `STATS_KEY`; the
comparison is `timingSafeEqual` over sha256 digests, so neither the length nor
the response time leaks anything. The key is 24 random base62 characters (~143
bits) and the dashboard sends it as a header rather than in the URL. It is
remembered in `localStorage` under `vd-stats-key`, which is the one real
exposure: anyone using your unlocked browser can open it. *Forget key* clears
it. To hide the path itself as well, rename `stats.html` and change the `/stats`
rewrite in `vercel.json` to match.

Known limits, on purpose: it counts download *starts*, not completions, and a
direct hit on `/VidDownload.apk` bypasses it (every link on the site and in
`js/config.js` points at `/download`, and `robots.txt` disallows both). App-side
installs can appear on the same dashboard by having the n8n workflow that already
receives the first-run events also insert into `app_events` — that needs no
change to the APK.

