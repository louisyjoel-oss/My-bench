// Service worker minimal : condition technique requise pour qu'un navigateur
// (et PWABuilder) considère l'app comme une PWA installable. Ne met rien en
// cache de façon agressive pour l'instant, afin de ne jamais servir une
// version périmée de l'app tant que le contenu n'est pas versionné.
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', () => {
  // Passthrough : laisse le réseau gérer chaque requête normalement.
});
