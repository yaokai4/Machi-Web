// Machi Service Worker — production-grade, conservative caching.
//
// Goals:
//   1. Never cache HTML, RSC payloads, or _next/static/chunks. Those
//      change between deploys; if the SW serves a stale chunk after a
//      redeploy the page crashes with "Application error: a client-side
//      exception has occurred". This is the bug that bit machicity.com.
//   2. DO cache truly immutable assets (images, fonts, manifest, icon)
//      so repeat visits feel snappy.
//   3. Provide an offline fallback for navigations.
//   4. Self-heal: if the user reports a broken cached state, any new
//      deploy ships a new VERSION which drops every prior cache on
//      activate. A `{type: 'kill-sw'}` postMessage also nukes the
//      worker entirely.
//
// The shape (no precache list, no chunk caching, only safe content
// types) is intentional. The Next.js build hashes its own URLs and the
// CDN/nginx handles caching of those with immutable headers — the SW
// adds nothing there but risk.

// Bump VERSION whenever the cache shape changes. The activate handler
// deletes every cache not starting with VERSION, which gives us a hard
// reset path if any version goes bad.
const VERSION = "machi-v4";
const STATIC = `${VERSION}-static`;
const OFFLINE_URL = "/offline.html";

// Hostnames where the SW intentionally self-destructs. Dev / loopback
// uses HMR chunk hashing and a previous prod build leaving a worker
// behind would otherwise serve stale chunks and crash the page.
const DISABLED_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0"]);

function isDisabledHost() {
  try {
    const host = self.location.hostname;
    if (DISABLED_HOSTS.has(host)) return true;
    // Treat private LAN ranges as disabled too — they're either dev
    // machines or LAN previews where HMR-style behaviour is common.
    if (/^10\./.test(host)) return true;
    if (/^192\.168\./.test(host)) return true;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true;
    return false;
  } catch {
    return false;
  }
}

self.addEventListener("install", (event) => {
  if (isDisabledHost()) {
    self.skipWaiting();
    return;
  }
  // Pre-cache only the offline shell. Best-effort — failures here do
  // not block install, because the SW still works without precache.
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(STATIC);
        await cache.add(OFFLINE_URL).catch(() => undefined);
      } catch {
        // ignore
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const keys = await caches.keys();
        // Drop every cache that doesn't belong to the current VERSION.
        // This is what makes redeploys safe: bump VERSION and the user
        // gets a clean slate on next activate.
        await Promise.all(
          keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)),
        );
        if (isDisabledHost()) {
          await self.registration.unregister();
          const clients = await self.clients.matchAll({ type: "window" });
          for (const client of clients) {
            try {
              client.navigate(client.url);
            } catch {
              // cross-origin or detached — skip
            }
          }
          return;
        }
        await self.clients.claim();
      } catch {
        // Best-effort. A failed activate just means we lose offline
        // mode for this session; the next deploy reactivates.
      }
    })(),
  );
});

self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || typeof data !== "object") return;
  if (data.type === "kill-sw") {
    event.waitUntil(
      (async () => {
        try {
          const keys = await caches.keys();
          await Promise.all(keys.map((k) => caches.delete(k)));
          await self.registration.unregister();
          const clients = await self.clients.matchAll({ type: "window" });
          for (const c of clients) {
            try {
              c.navigate(c.url);
            } catch {
              // ignore
            }
          }
        } catch {
          // ignore
        }
      })(),
    );
  } else if (data.type === "clear-api-cache") {
    // Legacy hook from api.ts — we no longer keep an API cache, but
    // honour the message so old clients don't spam errors.
    event.waitUntil(
      (async () => {
        try {
          const keys = await caches.keys();
          await Promise.all(
            keys.filter((k) => k.includes("-api")).map((k) => caches.delete(k)),
          );
        } catch {
          // ignore
        }
      })(),
    );
  }
});

// Only cache same-origin GETs whose path looks safe AND whose response
// content type is in this allow-list. HTML, JSON, JS, CSS are
// intentionally excluded — Next.js manages those itself via content
// hashing + immutable cache headers.
const CACHEABLE_PATH_PREFIXES = ["/icon", "/og-image", "/manifest.webmanifest"];
const CACHEABLE_PATH_SUFFIXES = [
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".svg",
  ".ico",
  ".woff",
  ".woff2",
  ".ttf",
  ".otf",
];

function isCacheableStaticAsset(url) {
  if (url.origin !== self.location.origin) return false;
  if (url.search) return false; // skip anything with query (RSC, ?_rsc=, ?v=)
  const pathname = url.pathname;
  // Hands-off zones — let the network/CDN own these.
  if (pathname.startsWith("/_next/")) return false;
  if (pathname.startsWith("/api/")) return false;
  if (pathname.startsWith("/media/")) return false;
  if (pathname === "/sw.js") return false;
  if (CACHEABLE_PATH_PREFIXES.some((p) => pathname.startsWith(p))) return true;
  if (CACHEABLE_PATH_SUFFIXES.some((s) => pathname.endsWith(s))) return true;
  return false;
}

self.addEventListener("fetch", (event) => {
  if (isDisabledHost()) return; // pass-through on dev / LAN
  const req = event.request;
  if (req.method !== "GET") return;

  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }

  // Cross-origin: don't touch.
  if (url.origin !== self.location.origin) return;

  // Navigations: network only, fall back to /offline.html on hard
  // failure. Critically, we never cache HTML — the browser does, and
  // the next deploy must always be able to ship fresh markup.
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          return res;
        } catch {
          const cache = await caches.open(STATIC);
          const offline = await cache.match(OFFLINE_URL);
          return offline || new Response("Offline", { status: 503 });
        }
      })(),
    );
    return;
  }

  // _next/static/* — let it go straight to network. Chunks are content
  // hashed; the HTTP cache + Cache-Control: immutable on the CDN owns
  // this. Touching it from the SW is the bug that caused the second-
  // visit crash.
  if (url.pathname.startsWith("/_next/")) return;
  if (url.pathname.startsWith("/api/")) return;
  if (url.pathname.startsWith("/media/")) return;

  // Static immutable assets: stale-while-revalidate. Serves cached
  // copy fast, refreshes in the background.
  if (isCacheableStaticAsset(url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(STATIC);
        const cached = await cache.match(req);
        const network = fetch(req)
          .then((res) => {
            if (res && res.ok && res.type === "basic") {
              cache.put(req, res.clone()).catch(() => undefined);
            }
            return res;
          })
          .catch(() => cached);
        return cached || (await network) || Response.error();
      })(),
    );
  }
  // Anything else (HTML, JSON, JS, RSC payloads): default pass-through.
});
