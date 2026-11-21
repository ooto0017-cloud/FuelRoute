const cacheName = "fuelroute-offline-v1";
const offline = "/offline.html";

self.addEventListener("install", event => {
  event.waitUntil(caches.open(cacheName).then(cache => cache.add(offline)));
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith("fuelroute-offline-") && key !== cacheName)
      .map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  if (event.request.mode !== "navigate" || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(fetch(event.request).catch(async () =>
    (await caches.match(offline, { cacheName })) || new Response("Нет подключения", { status: 503 })));
});
