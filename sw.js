const CACHE_NAME = "mileage-tracker-cache-v1";
const urlsToCache = [
  "./",
  "./index.html",
  "./app.js",
  "./style.css",
  "./manifest.json"
];

// Install cache
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
  );
});

// Serve requests from cache if available
self.addEventListener("fetch", event => {
  event.respondWith(
    caches.match(event.request).then(response => response || fetch(event.request))
  );
});
