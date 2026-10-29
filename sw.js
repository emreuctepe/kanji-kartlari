// Çevrimdışı çalışma: uygulama dosyaları ilk açılışta önbelleğe alınır, sonraki açılışlarda önbellekten
// gelir ve arka planda yenilenir (yeni sürüm bir sonraki açılışta görünür). FILES değişirse CACHE'i artır.
var CACHE = 'kk-v1';
var FONT_CACHE = 'kk-fonts-v1';
var FILES = [
  './', 'index.html', 'style.css', 'app.js', 'manifest.webmanifest',
  'data/decks.js', 'data/extra.js', 'data/progress.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-32.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return c.addAll(FILES.map(function (f) { return new Request(f, { cache: 'reload' }); }));
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE && k !== FONT_CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url), host = url.hostname;
  if (url.origin === location.origin) e.respondWith(staleWhileRevalidate(CACHE, req, e));
  else if (host === 'fonts.googleapis.com') e.respondWith(staleWhileRevalidate(FONT_CACHE, req, e));
  // font parçaları (unicode-range) değişmez; görülen her parça bir kez indirilip saklanır
  else if (host === 'fonts.gstatic.com') e.respondWith(cacheFirst(FONT_CACHE, req));
});

function keep(c, req, res) {
  if (res.ok || res.type === 'opaque') c.put(req, res.clone());
  return res;
}
function staleWhileRevalidate(name, req, e) {
  return caches.open(name).then(function (c) {
    return c.match(req, { ignoreSearch: true }).then(function (hit) {
      var net = fetch(req).then(function (res) { return keep(c, req, res); });
      if (!hit) return net;
      e.waitUntil(net.catch(function () {}));
      return hit;
    });
  });
}
function cacheFirst(name, req) {
  return caches.open(name).then(function (c) {
    return c.match(req).then(function (hit) {
      return hit || fetch(req).then(function (res) { return keep(c, req, res); });
    });
  });
}
