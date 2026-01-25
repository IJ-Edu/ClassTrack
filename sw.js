// ============================================
// IJ EDUCATION SYSTEM - Service Worker
// PWA Builder Compliant (All Features Enabled)
// ============================================

const CACHE_NAME = 'ij-education-v4';
const OFFLINE_URL = '/ClassTrack/offline.html';

// Resources to pre-cache for offline support
// These MUST be cached during install for offline support to work
const PRE_CACHE_RESOURCES = [
    '/ClassTrack/',
    '/ClassTrack/index.html',
    '/ClassTrack/offline.html',
    '/ClassTrack/manifest.json',
    '/ClassTrack/favicon.ico'
];

// ============================================
// 1. INSTALL EVENT - Pre-cache resources
// ============================================
self.addEventListener('install', (event) => {
    console.log('[SW] Installing service worker...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[SW] Pre-caching offline resources');
                return cache.addAll(PRE_CACHE_RESOURCES);
            })
            .then(() => {
                console.log('[SW] Pre-cache complete');
            })
            .catch((err) => {
                console.error('[SW] Pre-cache failed:', err);
            })
    );
    // Activate immediately
    self.skipWaiting();
});

// ============================================
// 2. ACTIVATE EVENT - Clean old caches & claim
// ============================================
self.addEventListener('activate', (event) => {
    console.log('[SW] Activating service worker...');
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME && cacheName !== 'offline-queue') {
                        console.log('[SW] Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => {
            console.log('[SW] Claiming clients');
            return self.clients.claim();
        })
    );
});

// ============================================
// 3. FETCH EVENT - Offline Support Strategy
// This is the KEY for PWA Builder "Offline Support"
// ============================================
self.addEventListener('fetch', (event) => {
    const request = event.request;

    // Only handle GET requests
    if (request.method !== 'GET') {
        return;
    }

    // Handle navigation requests (HTML pages) - THIS IS CRITICAL FOR OFFLINE SUPPORT
    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request)
                .then((response) => {
                    // Clone and cache successful responses
                    if (response && response.status === 200) {
                        const responseClone = response.clone();
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(request, responseClone);
                        });
                    }
                    return response;
                })
                .catch(() => {
                    // OFFLINE: Return cached page or offline fallback
                    console.log('[SW] Offline - serving from cache');
                    return caches.match(request)
                        .then((cachedResponse) => {
                            if (cachedResponse) {
                                return cachedResponse;
                            }
                            // Return offline page as fallback
                            return caches.match(OFFLINE_URL);
                        });
                })
        );
        return;
    }

    // Handle other requests (assets, API calls, etc.)
    const url = new URL(request.url);

    // Static assets - Stale While Revalidate
    const isStaticAsset =
        request.destination === 'script' ||
        request.destination === 'style' ||
        request.destination === 'image' ||
        request.destination === 'font' ||
        url.pathname.match(/\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)$/);

    if (isStaticAsset) {
        event.respondWith(
            caches.match(request).then((cached) => {
                // If we have a cached version, return it and update in background
                const fetchPromise = fetch(request)
                    .then((networkResponse) => {
                        if (networkResponse && networkResponse.status === 200) {
                            const responseClone = networkResponse.clone();
                            caches.open(CACHE_NAME).then((cache) => {
                                cache.put(request, responseClone);
                            });
                        }
                        return networkResponse;
                    })
                    .catch(() => {
                        // Network failed, return cached if available
                        return cached;
                    });

                return cached || fetchPromise;
            })
        );
        return;
    }

    // API/Dynamic requests - Network first with cache fallback
    event.respondWith(
        fetch(request)
            .then((response) => {
                if (response && response.status === 200) {
                    const responseClone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(request, responseClone);
                    });
                }
                return response;
            })
            .catch(() => {
                return caches.match(request);
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
        const cache = await caches.open(CACHE_NAME);

        // Update critical resources
        for (const resource of PRE_CACHE_RESOURCES) {
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

    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            for (const client of clientList) {
                if (client.url.includes(self.location.origin) && 'focus' in client) {
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
            const urlToOpen = notificationData.url || '/ClassTrack/';
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

console.log('[SW] Service Worker loaded - Version 4');
