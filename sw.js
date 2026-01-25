// ============================================
// IJ EDUCATION SYSTEM - Service Worker
// PWA Builder Compliant (All Features Enabled)
// ============================================

const CACHE_NAME = 'ij-education-v3';
const OFFLINE_URL = './index.html';
const OFFLINE_FALLBACK_PAGE = './offline.html';

// Resources to pre-cache for offline support
const PRE_CACHE_RESOURCES = [
    './',
    './index.html',
    './manifest.json',
    './favicon.ico',
    './index.css',
    './offline.html'
];

// ============================================
// 1. INSTALL EVENT - Pre-cache resources
// ============================================
self.addEventListener('install', (event) => {
    console.log('[SW] Installing service worker...');
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[SW] Pre-caching resources');
            return cache.addAll(PRE_CACHE_RESOURCES);
        })
    );
    self.skipWaiting();
});

// ============================================
// 2. ACTIVATE EVENT - Clean old caches
// ============================================
self.addEventListener('activate', (event) => {
    console.log('[SW] Activating service worker...');
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('[SW] Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

// ============================================
// 3. FETCH EVENT - Offline Support Strategy
// ============================================
self.addEventListener('fetch', (event) => {
    // Skip non-GET requests
    if (event.request.method !== 'GET') {
        return;
    }

    const url = new URL(event.request.url);

    // Navigation requests (SPA support with offline fallback)
    if (event.request.mode === 'navigate') {
        event.respondWith(
            fetch(event.request)
                .then((response) => {
                    // Cache successful navigation responses
                    if (response.status === 200) {
                        const responseClone = response.clone();
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(event.request, responseClone);
                        });
                    }
                    return response;
                })
                .catch(() => {
                    // Return cached page or offline fallback
                    return caches.match(event.request).then((cached) => {
                        return cached || caches.match(OFFLINE_URL) || caches.match(OFFLINE_FALLBACK_PAGE);
                    });
                })
        );
        return;
    }

    // Static assets - Cache First, then Network
    const isStaticAsset =
        event.request.destination === 'script' ||
        event.request.destination === 'style' ||
        event.request.destination === 'image' ||
        event.request.destination === 'font' ||
        url.pathname.endsWith('.js') ||
        url.pathname.endsWith('.css') ||
        url.pathname.endsWith('.png') ||
        url.pathname.endsWith('.jpg') ||
        url.pathname.endsWith('.svg') ||
        url.pathname.endsWith('.woff2');

    if (isStaticAsset) {
        event.respondWith(
            caches.match(event.request).then((cached) => {
                if (cached) {
                    // Return cached version but fetch new version in background
                    fetch(event.request).then((response) => {
                        if (response && response.status === 200) {
                            caches.open(CACHE_NAME).then((cache) => {
                                cache.put(event.request, response);
                            });
                        }
                    }).catch(() => { });
                    return cached;
                }
                return fetch(event.request).then((response) => {
                    if (!response || response.status !== 200 || response.type !== 'basic') {
                        return response;
                    }
                    const toCache = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, toCache));
                    return response;
                }).catch(() => {
                    // Return nothing for failed static assets
                    return new Response('', { status: 503, statusText: 'Service Unavailable' });
                });
            })
        );
        return;
    }

    // API/Dynamic requests - Network First, then Cache
    event.respondWith(
        fetch(event.request)
            .then((response) => {
                if (response && response.status === 200) {
                    const responseClone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseClone);
                    });
                }
                return response;
            })
            .catch(() => {
                return caches.match(event.request);
            })
    );
});

// ============================================
// 4. BACKGROUND SYNC - Queue offline actions
// ============================================
self.addEventListener('sync', (event) => {
    console.log('[SW] Background Sync triggered:', event.tag);

    if (event.tag === 'sync-attendance') {
        event.waitUntil(syncAttendanceData());
    } else if (event.tag === 'sync-data') {
        event.waitUntil(syncAllData());
    } else if (event.tag === 'sync-queue') {
        event.waitUntil(processOfflineQueue());
    }
});

// Process queued offline actions
async function processOfflineQueue() {
    try {
        const cache = await caches.open('offline-queue');
        const requests = await cache.keys();

        console.log('[SW] Processing offline queue:', requests.length, 'items');

        for (const request of requests) {
            try {
                const cachedData = await cache.match(request);
                if (cachedData) {
                    const data = await cachedData.json();
                    await fetch(request.url, {
                        method: data.method || 'POST',
                        headers: data.headers || {},
                        body: data.body ? JSON.stringify(data.body) : undefined
                    });
                    await cache.delete(request);
                    console.log('[SW] Synced queued request:', request.url);
                }
            } catch (error) {
                console.error('[SW] Failed to sync request:', request.url, error);
            }
        }

        // Notify clients about sync completion
        const clients = await self.clients.matchAll();
        clients.forEach(client => {
            client.postMessage({ type: 'SYNC_COMPLETE' });
        });
    } catch (error) {
        console.error('[SW] Error processing offline queue:', error);
    }
}

async function syncAttendanceData() {
    console.log('[SW] Syncing attendance data...');
    return processOfflineQueue();
}

async function syncAllData() {
    console.log('[SW] Syncing all data...');
    return processOfflineQueue();
}

// ============================================
// 5. PERIODIC BACKGROUND SYNC
// ============================================
self.addEventListener('periodicsync', (event) => {
    console.log('[SW] Periodic Sync triggered:', event.tag);

    if (event.tag === 'sync-content') {
        event.waitUntil(syncContentPeriodically());
    } else if (event.tag === 'update-data') {
        event.waitUntil(updateDataPeriodically());
    } else if (event.tag === 'check-updates') {
        event.waitUntil(checkForUpdates());
    }
});

async function syncContentPeriodically() {
    console.log('[SW] Periodic content sync...');
    try {
        // Refresh cached content
        const cache = await caches.open(CACHE_NAME);

        // Update critical resources
        const criticalResources = ['./index.html', './manifest.json'];
        for (const resource of criticalResources) {
            try {
                const response = await fetch(resource, { cache: 'no-cache' });
                if (response.ok) {
                    await cache.put(resource, response);
                }
            } catch (e) {
                console.log('[SW] Could not update:', resource);
            }
        }

        // Notify clients
        const clients = await self.clients.matchAll();
        clients.forEach(client => {
            client.postMessage({ type: 'PERIODIC_SYNC_COMPLETE' });
        });
    } catch (error) {
        console.error('[SW] Periodic sync error:', error);
    }
}

async function updateDataPeriodically() {
    console.log('[SW] Periodic data update...');
    // Trigger data refresh in the app
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
        client.postMessage({ type: 'REFRESH_DATA' });
    });
}

async function checkForUpdates() {
    console.log('[SW] Checking for updates...');
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
        client.postMessage({ type: 'CHECK_UPDATES' });
    });
}

// ============================================
// 6. PUSH NOTIFICATIONS
// ============================================
self.addEventListener('push', (event) => {
    console.log('[SW] Push received');

    let notificationData = {
        title: 'IJ Education System',
        body: 'You have a new notification',
        icon: 'https://cdn-icons-png.flaticon.com/512/2997/2997322.png',
        badge: 'https://cdn-icons-png.flaticon.com/512/2997/2997322.png',
        tag: 'ij-education-notification',
        requireInteraction: false,
        actions: []
    };

    if (event.data) {
        try {
            const data = event.data.json();
            notificationData = {
                title: data.title || notificationData.title,
                body: data.body || data.message || notificationData.body,
                icon: data.icon || notificationData.icon,
                badge: data.badge || notificationData.badge,
                tag: data.tag || notificationData.tag,
                data: data.data || {},
                requireInteraction: data.requireInteraction || false,
                actions: data.actions || [
                    { action: 'open', title: 'Open App' },
                    { action: 'dismiss', title: 'Dismiss' }
                ],
                vibrate: data.vibrate || [200, 100, 200],
                renotify: data.renotify || false
            };
        } catch (e) {
            notificationData.body = event.data.text();
        }
    }

    event.waitUntil(
        self.registration.showNotification(notificationData.title, notificationData)
    );
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
    console.log('[SW] Notification clicked:', event.action);
    event.notification.close();

    const action = event.action;
    const notificationData = event.notification.data || {};

    if (action === 'dismiss') {
        return;
    }

    // Default action or 'open' action - open/focus the app
    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            // Check if there's already a window open
            for (const client of clientList) {
                if (client.url.includes(self.location.origin) && 'focus' in client) {
                    // Send data to client if available
                    if (notificationData.url) {
                        client.postMessage({
                            type: 'NOTIFICATION_CLICK',
                            url: notificationData.url,
                            data: notificationData
                        });
                    }
                    return client.focus();
                }
            }
            // No window open, open a new one
            const urlToOpen = notificationData.url || './index.html';
            return self.clients.openWindow(urlToOpen);
        })
    );
});

// Handle notification close
self.addEventListener('notificationclose', (event) => {
    console.log('[SW] Notification closed');
});

// ============================================
// 7. MESSAGE HANDLER - Communication with app
// ============================================
self.addEventListener('message', (event) => {
    console.log('[SW] Message received:', event.data);

    if (!event.data) return;

    switch (event.data.type) {
        case 'SKIP_WAITING':
            self.skipWaiting();
            break;

        case 'CACHE_URLS':
            // Cache specific URLs on demand
            if (event.data.urls && Array.isArray(event.data.urls)) {
                event.waitUntil(
                    caches.open(CACHE_NAME).then((cache) => {
                        return cache.addAll(event.data.urls);
                    })
                );
            }
            break;

        case 'CLEAR_CACHE':
            event.waitUntil(
                caches.delete(CACHE_NAME).then(() => {
                    console.log('[SW] Cache cleared');
                    if (event.ports && event.ports[0]) {
                        event.ports[0].postMessage({ success: true });
                    }
                })
            );
            break;

        case 'GET_CACHE_SIZE':
            event.waitUntil(
                caches.open(CACHE_NAME).then(async (cache) => {
                    const keys = await cache.keys();
                    if (event.ports && event.ports[0]) {
                        event.ports[0].postMessage({ cacheSize: keys.length });
                    }
                })
            );
            break;

        case 'QUEUE_REQUEST':
            // Queue a request for background sync
            if (event.data.request) {
                event.waitUntil(
                    queueRequest(event.data.request).then(() => {
                        if (event.ports && event.ports[0]) {
                            event.ports[0].postMessage({ queued: true });
                        }
                    })
                );
            }
            break;
    }
});

// Queue request for offline processing
async function queueRequest(requestData) {
    const cache = await caches.open('offline-queue');
    const request = new Request(requestData.url);
    const response = new Response(JSON.stringify({
        method: requestData.method,
        headers: requestData.headers,
        body: requestData.body,
        timestamp: Date.now()
    }));
    await cache.put(request, response);
    console.log('[SW] Request queued:', requestData.url);
}

// ============================================
// 8. ERROR HANDLING
// ============================================
self.addEventListener('error', (event) => {
    console.error('[SW] Error:', event.error);
});

self.addEventListener('unhandledrejection', (event) => {
    console.error('[SW] Unhandled rejection:', event.reason);
});

console.log('[SW] Service Worker loaded');
