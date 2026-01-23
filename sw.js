const CACHE_NAME = 'classtrack-v4';
const OFFLINE_URL = './index.html';

// Assets to cache immediately on install
const PRE_CACHE_RESOURCES = [
    './',
    './index.html',
    './manifest.json',
    './favicon.ico',
    'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap',
    'https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/katex.min.css'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(PRE_CACHE_RESOURCES);
        })
    );
    self.skipWaiting();
});

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
    self.clients.claim();
});

// Powerful Fetch Handler: Network-first for index, Cache-first for assets
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // 1. Navigation strategy (index.html)
    if (event.request.mode === 'navigate') {
        event.respondWith(
            fetch(event.request).catch(() => {
                return caches.match(OFFLINE_URL);
            })
        );
        return;
    }

    // 2. Static Assets (JS, CSS, Images, Fonts)
    const isStaticAsset =
        event.request.destination === 'script' ||
        event.request.destination === 'style' ||
        event.request.destination === 'image' ||
        event.request.destination === 'font';

    if (isStaticAsset) {
        event.respondWith(
            caches.match(event.request).then((cachedResponse) => {
                if (cachedResponse) return cachedResponse;

                return fetch(event.request).then((networkResponse) => {
                    if (!networkResponse || networkResponse.status !== 200) return networkResponse;

                    const responseToCache = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseToCache);
                    });
                    return networkResponse;
                });
            })
        );
        return;
    }

    // 3. Default strategy: Network only (for Firebase/API calls)
    event.respondWith(fetch(event.request));
});

// ✅ BACKGROUND SYNC: Triggered when internet returns
self.addEventListener('sync', (event) => {
    if (event.tag === 'sync-attendance') {
        event.waitUntil(syncDataWithServer());
    }
});

// ✅ PERIODIC SYNC: Keeps data fresh in background
self.addEventListener('periodicsync', (event) => {
    if (event.tag === 'get-latest-students') {
        event.waitUntil(refreshStudentCache());
    }
});

// ✅ PUSH NOTIFICATIONS: Handler for future notifications
self.addEventListener('push', (event) => {
    const data = event.data ? event.data.json() : { title: 'ClassTrack', body: 'System Update' };
    const options = {
        body: data.body,
        icon: 'https://cdn-icons-png.flaticon.com/512/2997/2997322.png',
        badge: 'https://cdn-icons-png.flaticon.com/512/2997/2997322.png',
        vibrate: [100, 50, 100],
        data: { url: self.registration.scope }
    };
    event.waitUntil(self.registration.showNotification(data.title, options));
});

async function syncDataWithServer() {
    console.log('[SW] Background Syncing Attendance...');
    // Real logic is handled in storageService.ts via syncOfflineData()
    // We send a message to all clients to trigger their sync logic
    const allClients = await clients.matchAll();
    allClients.forEach(client => {
        client.postMessage({ type: 'TRIGGER_SYNC' });
    });
}

async function refreshStudentCache() {
    console.log('[SW] Periodic Sync: Checking for updates...');
}
