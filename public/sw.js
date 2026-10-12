const CACHE_NAME = 'litaj-hardware-v1-multi';

// Only pre-cache the offline fallback page at install time.
// Everything else gets cached as the user visits it (cache-on-navigate).
const PRECACHE = ['/offline.html'];

self.addEventListener('install', (e) => {
    self.skipWaiting();
    e.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE))
    );
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (e) => {
    const url = new URL(e.request.url);

    // Never intercept Supabase API calls (data) or non-GET requests
    if (url.hostname.includes('supabase.co') || e.request.method !== 'GET') return;

    const isNavigation = e.request.mode === 'navigate';
    const isAsset = /\.(js|css|png|jpg|svg|ico|json|woff2?)$/i.test(url.pathname) 
                    || url.hostname.includes('cdn') 
                    || url.hostname.includes('tailwind') 
                    || url.hostname.includes('jsdelivr') 
                    || url.hostname.includes('cdnjs');

    e.respondWith(
        caches.open(CACHE_NAME).then(cache =>
            cache.match(e.request).then(cached => {

                const networkFetch = fetch(e.request).then(res => {
                    // Only cache successful responses (allow opaque responses from CDNs too, res.type === 'opaque')
                    if (res && (res.ok || res.type === 'opaque') && (isNavigation || isAsset)) {
                        cache.put(e.request, res.clone());
                    }
                    return res;
                });

                if (isNavigation) {
                    // Network first; fall back to cache; last resort: offline page
                    return networkFetch.catch(() => {
                        if (cached) return cached;
                        return caches.match('/offline.html');
                    });
                }

                // Cache first for JS/CSS; update in background
                if (cached) {
                    networkFetch.catch(() => {}); // background update, ignore errors
                    return cached;
                }
                return networkFetch.catch(() => new Response('', { status: 408 }));
            })
        )
    );
});
