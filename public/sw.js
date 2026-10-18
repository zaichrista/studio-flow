// Studio Flow service worker: offline shell + web push.
const CACHE = 'studio-flow-v2'

self.addEventListener('install', (event) => {
  self.skipWaiting()
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./', './manifest.webmanifest', './icon.svg'])))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

// Network first for pages (so updates arrive), cache first for hashed assets.
self.addEventListener('fetch', (event) => {
  const req = event.request
  const url = new URL(req.url)
  if (req.method !== 'GET' || url.origin !== self.location.origin) return

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put('./', copy))
          return res
        })
        .catch(() => caches.match('./')),
    )
    return
  }

  event.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put(req, copy))
          }
          return res
        }),
    ),
  )
})

self.addEventListener('push', (event) => {
  let data = { title: 'Studio Flow', body: '', tag: 'studio-flow' }
  try {
    data = { ...data, ...event.data.json() }
  } catch (_) {
    if (event.data) data.body = event.data.text()
  }
  // iOS requires every push to show a notification.
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      tag: data.tag,
      // A refreshed focus notification replaces the last one quietly.
      renotify: data.tag !== 'focus',
      icon: 'icon-192.png',
      badge: 'icon-192.png',
    }),
  )
})

// A tap takes you straight to the right place: the start nudge starts the
// timer, the end-of-day nudge opens "put the day away", money nudges open Money.
self.addEventListener('notificationclick', (event) => {
  const tag = event.notification.tag || ''
  event.notification.close()
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) {
          client.postMessage({ notification: tag })
          return client.focus()
        }
      }
      return self.clients.openWindow('./?n=' + encodeURIComponent(tag))
    }),
  )
})
