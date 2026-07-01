const CACHE_NAME = 'fuzzy-pwa-v6'
const STATIC_ASSETS = [
  '/',
  '/offline.html',
  '/manifest.json',
  '/favicon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/mobile/fuzzy/assets/images/logo/48.png',
  '/mobile/fuzzy/assets/images/logo/logo.png',
  '/mobile/fuzzy/assets/images/icons/profile.png',
  '/mobile/fuzzy/assets/images/banner/banner-1.jpg',
  '/mobile/fuzzy/assets/images/banner/banner-3.jpg',
  '/mobile/fuzzy/assets/images/banner/banner-4.jpg',
  '/mobile/fuzzy/assets/images/product/1.png',
  '/mobile/fuzzy/assets/images/product/2.png',
  '/mobile/fuzzy/assets/images/product/4.png',
  '/mobile/fuzzy/assets/images/product/6.png',
  '/mobile/fuzzy/assets/images/product/8.png',
  '/mobile/fuzzy/assets/images/product/20.png',
  '/mobile/fuzzy/assets/images/product/23.png',
  '/mobile/fuzzy/assets/images/product/26.png',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)),
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)),
    )),
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return
  const url = new URL(event.request.url)
  if (url.origin !== self.location.origin) return

  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request).catch(() => new Response(JSON.stringify({
        message: 'Khong co ket noi mang',
        offline: true,
      }), {
        status: 503,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
      })),
    )
    return
  }

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).then((response) => {
        const clone = response.clone()
        caches.open(CACHE_NAME).then((cache) => cache.put('/', clone))
        return response
      }).catch(() => caches.match('/') ?? caches.match('/offline.html')),
    )
    return
  }

  if (
    url.pathname.endsWith('/mobile/fuzzy/assets/js/fuzzy-profile.js')
    || url.pathname.endsWith('/mobile/fuzzy/assets/js/fuzzy-auth.js')
    || url.pathname.endsWith('/mobile/fuzzy/assets/js/fuzzy-checkout.js')
  ) {
    event.respondWith(
      fetch(event.request).then((response) => {
        const clone = response.clone()
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone))
        return response
      }).catch(() => caches.match(event.request)),
    )
    return
  }

  if (['style', 'script', 'worker', 'image', 'font'].includes(event.request.destination) || url.pathname.startsWith('/assets/') || url.pathname.startsWith('/mobile/fuzzy/assets/')) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        const fetched = fetch(event.request).then((response) => {
          if (response.ok) {
            const clone = response.clone()
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone))
          }
          return response
        }).catch(() => cached)
        return cached ?? fetched
      }),
    )
    return
  }

  event.respondWith(
    caches.match(event.request).then((cached) => cached ?? fetch(event.request).then((response) => {
      const clone = response.clone()
      caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone))
      return response
    }).catch(() => cached)),
  )
})
