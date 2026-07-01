const FUZZY_CACHE = 'fuzzy-template-v4'
const FUZZY_ASSETS = [
  './landing.html',
  './manifest.json',
  './assets/css/style.css',
  './assets/css/vendors/bootstrap.min.css',
  './assets/css/vendors/swiper-bundle.min.css',
  './assets/css/vendors/iconsax.css',
  './assets/js/script.js',
  './assets/js/custom-swiper.js',
  './assets/js/range-slider.js',
  './assets/js/fuzzy-checkout.js',
  './assets/js/swiper-bundle.min.js',
  './assets/js/bootstrap.bundle.min.js',
  './assets/js/iconsax.js',
  './assets/images/logo/48.png',
  './assets/images/logo/logo.png',
  './assets/images/banner/banner-1.jpg',
  './assets/images/banner/banner-2.jpg',
  './assets/images/banner/banner-3.jpg',
  './assets/images/banner/banner-4.jpg',
]

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(FUZZY_CACHE).then((cache) => cache.addAll(FUZZY_ASSETS)))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== FUZZY_CACHE).map((key) => caches.delete(key)),
    )),
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return
  const url = new URL(event.request.url)
  const isFreshPageOrScript = event.request.mode === 'navigate'
    || url.pathname.endsWith('.html')
    || url.pathname.endsWith('/assets/js/fuzzy-profile.js')
    || url.pathname.endsWith('/assets/js/fuzzy-auth.js')
    || url.pathname.endsWith('/assets/js/fuzzy-checkout.js')
  if (isFreshPageOrScript) {
    event.respondWith(
      fetch(event.request).then((response) => {
        const clone = response.clone()
        caches.open(FUZZY_CACHE).then((cache) => cache.put(event.request, clone))
        return response
      }).catch(() => caches.match(event.request) || caches.match('./landing.html')),
    )
    return
  }
  event.respondWith(
    caches.match(event.request).then((cached) => cached ?? fetch(event.request).then((response) => {
      const clone = response.clone()
      caches.open(FUZZY_CACHE).then((cache) => cache.put(event.request, clone))
      return response
    }).catch(() => caches.match('./landing.html'))),
  )
})
