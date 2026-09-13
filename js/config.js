/* Single source of truth for everything about the published build.
   Change it here and every button, badge and stamp on the site follows.

   apkUrl — where the "Download APK" buttons point.
     "/download"  → the redirect defined in vercel.json (recommended: it lets
                    you move the file without touching the pages).
     "NetX-Downloader.apk" → the APK sitting next to index.html, same origin.
     "https://github.com/<user>/<repo>/releases/download/v1.0.7/NetX-Downloader.apk"
                    → a GitHub Release asset, which is what you want if the
                      72 MB file must stay out of the git repo.  */
window.VD = {
  version: "1.0.7",
  versionCode: 8,
  sizeMb: "71.8",
  minAndroid: "7.0",
  minApi: 24,
  updated: "13 September 2026",
  apkUrl: "https://github.com/huzaifa379/ainetworkx/releases/download/v1.0.7/NetX-Downloader.apk",
  sha256: "579d72bfdf45fe064c637a3977c39..."
};
