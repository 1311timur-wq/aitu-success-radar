// My DU — service worker for the app SHELL only.
// - Navigations: network first (a new deploy is picked up immediately), cached shell as offline fallback.
// - Same-origin static files (JS/CSS/images): cache first.
// - Firebase/Firestore/Auth traffic is cross-origin and is never touched, so no grades or attendance are ever cached here.
const CACHE = 'mydu-shell-v3'
const STATIC = ['./', './index.html', './manifest.webmanifest', './assets/logo-white.webp', './assets/dew-head.webp', './assets/dew-wave.webp', './assets/dew-wink.webp', './assets/favicon-48.png']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(STATIC)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k)
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).then((res) => {
      const copy = res.clone(); caches.open(CACHE).then((c) => c.put('./index.html', copy)); return res
    }).catch(async () => (await caches.match('./index.html')) || Response.error()))
    return
  }
  event.respondWith((async () => {
    const cache = await caches.open(CACHE)
    const hit = await cache.match(req)
    if (hit) return hit
    const res = await fetch(req)
    if (res.ok) cache.put(req, res.clone())
    return res
  })())
})
