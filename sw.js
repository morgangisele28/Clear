// Offline support for Clear.
//
// Network first, with a short timeout and a cache fallback. That order matters:
// cache-first would pin every installed user to whatever version they first loaded
// until this file's VERSION string changed, which is a manual step that is easy to
// forget. This way an update reaches people the next time they open the app, and it
// still works with no signal at all.

const VERSION = "clear-v5";
const NET_TIMEOUT = 2500;

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.add("./")).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function fromCache(req) {
  return caches.match(req).then((hit) => hit || caches.match("./"));
}

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);

  // air quality lookups must always go to the network, never to the cache
  if (url.hostname.indexOf("open-meteo.com") !== -1) return;
  if (url.origin !== location.origin) return;

  e.respondWith(
    new Promise((resolve) => {
      let settled = false;
      const done = (res) => {
        if (!settled) {
          settled = true;
          resolve(res);
        }
      };

      // if the network is slow, serve what we have and let the fetch finish in the
      // background so the cache is warm for next time
      const timer = setTimeout(() => fromCache(e.request).then((hit) => hit && done(hit)), NET_TIMEOUT);

      fetch(e.request)
        .then((res) => {
          clearTimeout(timer);
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(e.request, copy));
          }
          done(res);
        })
        .catch(() => {
          clearTimeout(timer);
          fromCache(e.request).then(done);
        });
    })
  );
});
