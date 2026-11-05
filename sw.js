// Service worker : permet d'ouvrir l'app sans réseau (salle mal couverte).
// Stratégie : on répond tout de suite avec la copie en cache, et on met
// le cache à jour en arrière-plan. Une mise à jour s'affiche donc au lancement suivant.
// Changer VERSION à chaque modification des fichiers listés.
const VERSION = 'muscu-v2';
const FICHIERS = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './js/storage.js',
  './js/util.js',
  './js/muscles.js',
  './js/repas.js',
  './programme.json',
  './nutrition.json',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FICHIERS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((cles) => Promise.all(cles.filter((c) => c !== VERSION).map((c) => caches.delete(c))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    caches.open(VERSION).then(async (cache) => {
      const enCache = await cache.match(req, { ignoreSearch: true });
      const reseau = fetch(req)
        .then((rep) => {
          if (rep.ok) cache.put(req, rep.clone());
          return rep;
        })
        .catch(() => enCache);
      if (enCache) {
        e.waitUntil(reseau.catch(() => {}));
        return enCache;
      }
      return reseau;
    })
  );
});
