// Service Worker for IJ Education System
const CACHE_NAME = 'ij-education-v2';
const urlsToCache = [
    './',
    './index.html',
    './manifest.json'
];

// Install event
self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(urlsToCache))
    );
});

// Fetch event - Network first, then cache
self.addEventListener('fetch', (event) => {
    event.respondWith(
        fetch(event.request)
            .then((response) => {
                // Clone the response
                if (!response || response.status !== 200 || response.type !== 'basic') {
                    return response;
                }
                const responseToCache = response.clone();
                caches.open(CACHE_NAME)
                    .then((cache) => {
                        cache.put(event.request, responseToCache);
                    });
                return response;
            })
            .catch(() => {
                return caches.match(event.request);
            })
    );
});

// Activate event
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});

// Background Sync Event (Required for PWABuilder detection)
self.addEventListener('sync', (event) => {
    if (event.tag === 'sync-data') {
        // Placeholder for background sync logic
        console.log('Background sync triggered');
    }
});
