// ============================================================
// sw.js — Service worker de Gandxo Store (PWA)
//
// Stratégie :
//   - navigations (HTML) : RÉSEAU D'ABORD, cache en secours
//     ⇒ un déploiement est visible dès la visite suivante, et le
//       site reste consultable hors-ligne ;
//   - assets du site (CSS/JS/icônes) : cache immédiat puis mise à
//     jour en arrière-plan (stale-while-revalidate) ;
//   - tout domaine externe (Firebase, Cloudinary, polices) : jamais
//     intercepté, toujours en direct.
//
// ⚠️ À CHAQUE DÉPLOIEMENT : incrémenter CACHE_NAME (v3, v4, …).
// ============================================================

const CACHE_NAME = "gandxo-store-v2";

const SHELL = [
  "./index.html",
  "./about.html",
  "./login.html",
  "./app.html",
  "./404.html",
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
    caches.open(CACHE_NAME).then((cache) =>
      // addAll échouerait entièrement si un seul fichier manque :
      // on ajoute chaque entrée indépendamment.
      Promise.all(SHELL.map((url) => cache.add(url).catch(() => {})))
    )
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

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response && response.ok) cache.put(request, response.clone());
    return response;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    const fallback = await cache.match("./index.html");
    if (fallback) return fallback;
    return new Response(
      "<!DOCTYPE html><meta charset='utf-8'><title>Hors-ligne</title><p style='font-family:sans-serif;padding:2rem'>Page indisponible hors-ligne.</p>",
      { headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response && response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => cached);
  return cached || network;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  // Aucune interception des domaines externes.
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request));
    return;
  }

  event.respondWith(staleWhileRevalidate(request));
});
