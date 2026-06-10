import fs from "node:fs";
import path from "node:path";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://127.0.0.1:8787";

// Conservative CSP. In dev, Next.js needs eval / inline for fast-refresh
// so we relax it; in production we lock it down.
const dev = process.env.NODE_ENV !== "production";

// In production the API is same-origin behind nginx, so 'self' already
// covers it. Only widen connect-src for an explicitly configured non-local
// origin — the dev loopback fallback must never leak into the prod header.
const connectSrcExtra = dev
  ? ` ${API_BASE}`
  : /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(API_BASE)
    ? ""
    : ` ${API_BASE}`;

const cspParts = [
  "default-src 'self'",
  `script-src 'self' ${dev ? "'unsafe-eval' 'unsafe-inline'" : "'unsafe-inline'"}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https: http:",
  "media-src 'self' blob: https: http:",
  "font-src 'self' data:",
  // EventSource / fetch / WebSocket
  `connect-src 'self'${connectSrcExtra} ws: wss:`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
];

const securityHeaders = [
  { key: "X-Content-Type-Options",   value: "nosniff" },
  { key: "X-Frame-Options",          value: "DENY" },
  { key: "Referrer-Policy",          value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy",       value: "interest-cohort=(), geolocation=(), microphone=(), camera=()" },
  { key: "Content-Security-Policy",  value: cspParts.join("; ") },
  ...(dev
    ? [
        { key: "Cache-Control", value: "no-store, no-cache, must-revalidate, max-age=0" },
        { key: "Clear-Site-Data", value: "\"cache\"" },
      ]
    : []),
  ...(dev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]),
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  compress: true,
  experimental: {
    optimizePackageImports: dev ? [] : ["lucide-react"],
  },
  webpack(config, { isServer, nextRuntime }) {
    if (isServer && nextRuntime !== "edge" && config.output?.path) {
      config.plugins ??= [];
      config.plugins.push({
        apply(compiler) {
          compiler.hooks.afterEmit.tap("MachiServerChunkCompatPlugin", () => {
            const chunksDir = compiler.outputPath;
            if (path.basename(chunksDir) !== "chunks" || !fs.existsSync(chunksDir)) return;
            const serverDir = path.dirname(chunksDir);
            for (const entry of fs.readdirSync(chunksDir, { withFileTypes: true })) {
              if (!entry.isFile() || !entry.name.endsWith(".js")) continue;
              fs.copyFileSync(path.join(chunksDir, entry.name), path.join(serverDir, entry.name));
            }
          });
        },
      });
    }
    return config;
  },
  async headers() {
    return [
      {
        // every route
        source: "/:path*",
        headers: securityHeaders,
      },
      {
        // service worker MUST NOT be cached. If the old buggy SW
        // sticks around because of an intermediary cache, users are
        // trapped in the second-visit crash loop.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-store, no-cache, must-revalidate, max-age=0" },
          { key: "Service-Worker-Allowed", value: "/" },
          { key: "Pragma", value: "no-cache" },
        ],
      },
      {
        // In dev these paths are not stable enough to cache forever:
        // stale chunks surface as "Cannot read properties of undefined
        // (reading 'call')" in the browser after HMR / restore cycles.
        source: "/_next/static/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: dev
              ? "no-store, no-cache, must-revalidate, max-age=0"
              : "public, max-age=31536000, immutable",
          },
        ],
      },
    ];
  },
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${API_BASE}/api/:path*` },
      { source: "/media/:path*", destination: `${API_BASE}/media/:path*` },
      { source: "/healthz", destination: `${API_BASE}/healthz` },
    ];
  },
  images: {
    remotePatterns: [
      { protocol: "http",  hostname: "127.0.0.1" },
      { protocol: "http",  hostname: "localhost" },
      { protocol: "https", hostname: "**" },
    ],
  },
};

export default nextConfig;
