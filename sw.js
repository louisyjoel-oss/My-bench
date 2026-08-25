// ============================================================
// SERVICE WORKER — My Bench
// ============================================================
// Stratégie, en résumé :
// - La page (index.html) : "réseau en priorité, secours sur le cache".
//   On sert toujours la version la plus fraîche possible ; le cache ne sert
//   que si le réseau est indisponible. → jamais de version périmée servie
//   tant qu'il y a du réseau, mais l'app s'ouvre quand même hors-ligne.
// - Les bibliothèques externes (React, Leaflet, Supabase, polices...) :
//   "cache en priorité, réseau en secours + mise à jour silencieuse en
//   arrière-plan". Ces fichiers changent rarement, donc les servir depuis
//   le cache est plus rapide, sans sacrifier la fraîcheur à moyen terme.
// - Tout le reste (Supabase, Nominatim, images de bancs...) : jamais mis en
//   cache, toujours en direct — ce sont des données vivantes.
//
// ⚠️ IMPORTANT : à chaque fois que tu modifies index.html de façon notable,
// change la valeur de CACHE_VERSION ci-dessous (ex. 'v1' → 'v2'). Ça force
// tous les appareils à récupérer une fraîche copie de tout au lieu de
// rester sur d'anciens fichiers mis en cache.
// ============================================================
const CACHE_VERSION = 'v2';
const STATIC_CACHE = `mybench-static-${CACHE_VERSION}`;

// Fichiers de l'app elle-même (même origine que le site).
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-512-maskable.png',
];

// Bibliothèques externes utilisées par l'app (peu susceptibles de changer).
const EXTERNAL_LIBS = [
  'https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,300..700&family=Poppins:wght@400;600;700&display=swap',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
  'https://cdnjs.cloudflare.com/ajax/libs/react/18.2.0/umd/react.production.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.2.0/umd/react-dom.production.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js',
];

// Origines dont les requêtes doivent suivre la stratégie "cache en priorité"
// (bibliothèques + polices). Les polices réelles (fonts.gstatic.com) ne sont
// pas connues à l'avance (URLs générées par Google), donc on les met en
// cache au fil de l'eau, à la première utilisation, plutôt qu'en pré-cache.
const CACHE_FIRST_ORIGINS = [
  'cdn.jsdelivr.net',
  'cdnjs.cloudflare.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      // addAll échoue en bloc si UNE seule ressource échoue : on précache donc
      // chaque fichier séparément, pour qu'une police ou une icône manquante
      // n'empêche pas le reste (l'app shell) d'être mis en cache correctement.
      const all = [...APP_SHELL, ...EXTERNAL_LIBS];
      return Promise.allSettled(all.map((url) => cache.add(url)));
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((name) => name.startsWith('mybench-static-') && name !== STATIC_CACHE)
          .map((name) => caches.delete(name))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return; // Jamais de cache sur les envois de données (POST/PUT/DELETE).

  const url = new URL(req.url);

  // 1. Navigation (chargement de la page elle-même) : réseau en priorité.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(STATIC_CACHE).then((cache) => cache.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // 2. Bibliothèques externes connues : cache en priorité, mise à jour
  // silencieuse en arrière-plan (stale-while-revalidate).
  if (CACHE_FIRST_ORIGINS.includes(url.hostname)) {
    event.respondWith(
      caches.open(STATIC_CACHE).then((cache) =>
        cache.match(req).then((cached) => {
          const networkFetch = fetch(req)
            .then((res) => {
              if (res && res.status === 200) cache.put(req, res.clone());
              return res;
            })
            .catch(() => cached);
          return cached || networkFetch;
        })
      )
    );
    return;
  }

  // 3. Tout le reste (Supabase, Nominatim, images de bancs, QR codes...) :
  // toujours en direct, jamais mis en cache — ce sont des données vivantes.
});
