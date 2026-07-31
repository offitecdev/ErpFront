/*
 * Offitec ERP service worker.
 *
 * Hand-written on purpose: the build has no precache-manifest plugin, so this
 * worker never hardcodes hashed filenames. It only precaches the stable shell
 * (document + icons) and fills the rest of the caches at runtime:
 *
 *   /assets/*            cache-first  (Vite fingerprints these; a change means a new URL)
 *   navigations          network-first, cached copy of index.html as the offline fallback
 *   other static files   stale-while-revalidate (icons, fonts, the PDF manual)
 *   /backend/*           never touched — API responses stay live and uncached
 *
 * Bump SW_VERSION only when this file's caching rules change; regular deploys
 * refresh themselves because navigations always try the network first.
 */

const SW_VERSION = 'v1';
const SHELL_CACHE = `offitec-shell-${SW_VERSION}`;
const ASSET_CACHE = `offitec-assets-${SW_VERSION}`;
const CURRENT_CACHES = [SHELL_CACHE, ASSET_CACHE];
const OFFLINE_URL = '/index.html';

const SHELL_ASSETS = [
    OFFLINE_URL,
    '/manifest.webmanifest',
    '/fav4.svg',
    '/icons/icon-192.png',
    '/icons/icon-512.png',
    '/icons/apple-touch-icon.png',
];

const STATIC_EXTENSIONS = [
    '.css',
    '.js',
    '.json',
    '.webmanifest',
    '.png',
    '.jpg',
    '.jpeg',
    '.webp',
    '.gif',
    '.svg',
    '.ico',
    '.woff',
    '.woff2',
    '.ttf',
    '.otf',
    '.pdf',
];

/** Only same-origin, non-API GETs are eligible for any cache. */
const isCacheable = (request, url) =>
    request.method === 'GET' &&
    url.origin === self.location.origin &&
    !url.pathname.startsWith('/backend/') &&
    !request.headers.has('range');

const isStaticFile = (url) => STATIC_EXTENSIONS.some((extension) => url.pathname.endsWith(extension));

/** Redirected and opaque responses cannot be replayed from a cache. */
const isStorable = (response) => Boolean(response) && response.ok && !response.redirected && response.type === 'basic';

/** Guards the offline shell: navigating to e.g. the PDF manual must not replace it. */
const isHtmlDocument = (response) => (response.headers.get('content-type') || '').includes('text/html');

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(SHELL_CACHE).then((cache) =>
            // `reload` skips the HTTP cache so a fresh install never picks up a
            // stale document from a previous deployment.
            Promise.allSettled(SHELL_ASSETS.map((path) => cache.add(new Request(path, { cache: 'reload' })))),
        ),
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        (async () => {
            const keys = await caches.keys();
            await Promise.all(
                keys
                    .filter((key) => key.startsWith('offitec-') && !CURRENT_CACHES.includes(key))
                    .map((key) => caches.delete(key)),
            );
            await self.clients.claim();
        })(),
    );
});

// The page asks for the swap explicitly (via the "new version" toast), so the
// worker never replaces itself mid-session behind the user's back.
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        void self.skipWaiting();
    }
});

/**
 * Navigations: always try the network so a deployment is picked up on the next
 * page load, and keep the newest document as the offline shell.
 */
const handleNavigation = async (request) => {
    try {
        const response = await fetch(request);
        if (isStorable(response) && isHtmlDocument(response)) {
            const cache = await caches.open(SHELL_CACHE);
            await cache.put(OFFLINE_URL, response.clone());
        }
        return response;
    } catch (error) {
        const cached = await caches.match(OFFLINE_URL, { cacheName: SHELL_CACHE });
        if (cached) return cached;
        throw error;
    }
};

/** Fingerprinted assets: content can never change under a given URL. */
const cacheFirst = async (request, cacheName) => {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);
    if (cached) return cached;

    const response = await fetch(request);
    if (isStorable(response)) await cache.put(request, response.clone());
    return response;
};

/** Unhashed static files: serve the cached copy, refresh it in the background. */
const staleWhileRevalidate = async (event, cacheName) => {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(event.request);

    const update = fetch(event.request)
        .then(async (response) => {
            if (isStorable(response)) await cache.put(event.request, response.clone());
            return response;
        })
        .catch(() => undefined);

    if (cached) {
        event.waitUntil(update);
        return cached;
    }

    const response = await update;
    if (response) return response;
    throw new Error(`Offline and not cached: ${event.request.url}`);
};

self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    if (!isCacheable(request, url)) return;

    if (request.mode === 'navigate') {
        event.respondWith(handleNavigation(request));
        return;
    }

    if (url.pathname.startsWith('/assets/')) {
        event.respondWith(cacheFirst(request, ASSET_CACHE));
        return;
    }

    if (isStaticFile(url)) {
        event.respondWith(staleWhileRevalidate(event, SHELL_CACHE));
    }
});
