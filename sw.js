// ============================================================
// sw.js — Service worker minimal pour rendre Gandxo Store
// installable (PWA). Ne met en cache QUE les fichiers du site
// lui-même (même origine). Toute requête vers Firebase, Cloudinary
// ou tout autre domaine externe passe directement au réseau, sans
// jamais être interceptée : les données restent toujours à jour.
// ============================================================

const CACHE_NAME = "gandxo-store-v1";
const SHELL = [
  "./index.html",
  "./about.html",
  "./login.html",
  "./app.html",
  "./style.css",
  "./responsive.css",
  "./app.js",
  "./store.js",
  "./auth.js",
  "./analytics.js",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // On ne touche jamais aux requêtes vers un autre domaine
  // (Firestore, Cloudinary, polices Google, etc.) : elles passent
  // directement au réseau, sans interception ni cache.
  if (url.origin !== self.location.origin) return;
  if (event.request.method !== "GET") return;

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
