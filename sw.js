// Service Worker：アプリ本体をキャッシュして、ネットが無くても開けるようにする
const CACHE = "music-room-v2";
const ASSETS = ["./", "index.html", "firebase-config.js", "manifest.webmanifest", "js/app.js", "js/db.js", "js/logic.js",
  "js/player.js", "js/termux.js", "js/cloud.js", "js/native.js", "icons/icon-192.png", "icons/icon-512.png", "icons/maskable-512.png",
  "icons/favicon-64.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  // Firebase の SDK は一度読んだらキャッシュから（オフラインでもアプリが開けるように）
  if (url.hostname === "www.gstatic.com" && url.pathname.startsWith("/firebasejs/")) {
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(res => {
      const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return res;
    })));
    return;
  }
  if (url.origin !== self.location.origin) return;   // ダウンロードサーバー（127.0.0.1）などには触れない
  // 自分のファイルはネット優先（更新をすぐ反映）、つながらないときはキャッシュ
  e.respondWith(fetch(e.request).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
    return res;
  }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match("index.html"))));
});
