// Minimal, deliberately non-caching service worker — see
// Contextos/Decisoes.md for why this isn't next-pwa/Workbox. This app is
// an always-online SaaS (pricing depends on live backend data), so the
// only thing this SW caches is a small static offline fallback page.
// Everything else (JS/CSS/API/images) always goes to the network,
// unmodified — a new deploy is picked up immediately, and a pricing
// calculation is never served from a stale cache.
//
// Bump this on any change to the cached file list below — activate()
// deletes any cache whose name doesn't match, so old versions never
// linger.
const CACHE_VERSION = "pricify3d-sw-v1";
const OFFLINE_URL = "/offline.html";
const PRECACHE_URLS = [OFFLINE_URL, "/icons/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  // Only intercept page navigations — every other request (API calls,
  // JS/CSS chunks, images) passes straight through untouched.
  if (event.request.mode !== "navigate") {
    return;
  }

  event.respondWith(
    fetch(event.request).catch(() => caches.match(OFFLINE_URL)),
  );
});
