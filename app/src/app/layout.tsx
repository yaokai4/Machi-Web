import type { Metadata, Viewport } from "next";
import "@/styles/globals.css";
import { QueryProvider } from "@/lib/queryClient";
import { SessionBootstrap } from "@/lib/session";
import { ThemeBridge } from "@/components/shell/ThemeBridge";
import { I18nProvider } from "@/lib/i18n";
import { ServiceWorkerRegistrar } from "@/components/shell/ServiceWorkerRegistrar";
import { SiteSplash } from "@/components/marketing/SiteSplash";
import { htmlLangFor, resolveMarketingLocale } from "@/lib/marketing-locale";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.machicity.com"),
  title: {
    default: "Machi",
    template: "%s | Machi",
  },
  description: "Machi 按城市和语言，整理租房、手续、求职、二手、本地服务、问答与真实经验。在每一座城市，找到生活的回声。",
  applicationName: "Machi",
  appleWebApp: { capable: true, title: "Machi", statusBarStyle: "default" },
  manifest: "/manifest.webmanifest",
  // Emits <meta name="apple-itunes-app"> so Safari on iOS shows the native
  // Smart App Banner pointing at the Machi App Store listing.
  itunes: { appId: "6781900781" },
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/icon.svg" }],
  },
  formatDetection: { email: false, address: false, telephone: false },
  authors: [{ name: "Machi" }],
  creator: "Machi",
  publisher: "Machi",
};

export const viewport: Viewport = {
  // Match the marketing page's warm light gradient and the near-black
  // indigo dark surface so browser chrome blends instead of clashing.
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0e1026" },
    { color: "#fff2e8" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await resolveMarketingLocale();
  return (
    <html lang={htmlLangFor(locale)} suppressHydrationWarning>
      <head>
        <script
          // initialise appearance class before paint to avoid flashes
          dangerouslySetInnerHTML={{
            __html: `(function(){
              try {
                function safeParse(raw){
                  if(raw==='light'||raw==='dark')return raw;
                  return null;
                }
                var stored=null;
                try{stored=safeParse(localStorage.getItem('machi-theme')||localStorage.getItem('machi_theme'));}catch(_){}
                // No explicit choice yet → follow the system. Only an
                // explicit toggle persists to storage, so system-theme
                // users keep following OS changes across visits.
                var target=stored||(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');
                if(stored){try{localStorage.setItem('machi-theme',stored);localStorage.removeItem('machi_theme');}catch(_){}}
                try{localStorage.removeItem('machi-appearance');localStorage.removeItem('kaix-appearance');}catch(_){}
                document.documentElement.classList.toggle('dark',target==='dark');
                document.documentElement.dataset.theme=target;
              } catch(e) {}
            })()`,
          }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){
              try {
                function usable(url){
                  return typeof url === 'string' && (/^data:image\\//.test(url) || url.indexOf('/') === 0 || /^https:\\/\\/www\\.machicity\\.com\\//.test(url) || /^https:\\/\\/machicity\\.com\\//.test(url));
                }
                function setIcon(rel, href){
                  var link = document.querySelector('link[rel="' + rel + '"]');
                  if (!link) {
                    link = document.createElement('link');
                    link.setAttribute('rel', rel);
                    document.head.appendChild(link);
                  }
                  link.setAttribute('href', href);
                }
                fetch('/api/site-settings', { credentials: 'same-origin' })
                  .then(function(res){ return res.ok ? res.json() : null; })
                  .then(function(data){
                    var logo = data && data.settings && data.settings.logo_url;
                    if (!usable(logo)) return;
                    setIcon('icon', logo);
                    setIcon('shortcut icon', logo);
                    setIcon('apple-touch-icon', logo);
                  })
                  .catch(function(){});
              } catch(e) {}
            })()`,
          }}
        />
        {/* Self-heal for users carrying a stale service worker from an
            older build. The previous SW cached /_next/static/* and any
            same-origin GET (RSC payloads included), which caused the
            second-visit "Application error" loop. We unregister any
            registration whose scope this page is under so the next
            navigation goes straight to network. The new sw.js (machi-
            v4+) installs cleanly after this. Production registration
            happens later in ServiceWorkerRegistrar.tsx. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){
              try {
                if (!('serviceWorker' in navigator)) return;
                var host = window.location.hostname;
                var isPrivate = host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0'
                  || /^10\\./.test(host) || /^192\\.168\\./.test(host) || /^172\\.(1[6-9]|2\\d|3[01])\\./.test(host);
                var isDev = ${JSON.stringify(process.env.NODE_ENV !== "production")};
                if (isDev || isPrivate) {
                  navigator.serviceWorker.getRegistrations().then(function(regs){
                    regs.forEach(function(r){ try{ r.unregister(); }catch(_){} });
                  }).catch(function(){});
                  if (window.caches && caches.keys) {
                    caches.keys().then(function(ks){
                      return Promise.all(ks.map(function(k){ return caches.delete(k).catch(function(){return false;}); }));
                    }).catch(function(){});
                  }
                }
              } catch(e) {}
            })()`,
          }}
        />
        {/* Last-resort self-heal. Runs as soon as the <head> is parsed,
            so we catch errors that happen BEFORE the React app has had
            a chance to mount its own listeners. Triggers on chunk-load
            failures and any uncaught error during boot. Once per
            session, kills SW + caches + storage and reloads. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){
              var KEY='machi.boot.heal';
              var ATTEMPT_KEY='machi.boot.attempt';
              var triggered=false;
              function isChunkError(msg){
                if(!msg)return false;
                msg=String(msg);
                return msg.indexOf('ChunkLoadError')>=0
                  || msg.indexOf('Loading chunk')>=0
                  || msg.indexOf('Loading CSS chunk')>=0
                  || msg.indexOf('Failed to fetch dynamically imported module')>=0
                  || msg.indexOf('Importing a module script failed')>=0
                  || msg.indexOf('Unexpected token')>=0;
              }
              function heal(reason){
                if(triggered)return;triggered=true;
                try{
                  if(sessionStorage.getItem(KEY)==='1')return;
                  sessionStorage.setItem(KEY,'1');
                }catch(_){return;}
                try{console.warn('[machi] self-heal triggered:',reason);}catch(_){}
                var done=function(){
                  try{location.reload();}catch(_){}
                };
                var pending=0;
                function step(){pending--; if(pending<=0)done();}
                pending++;
                try{
                  if('serviceWorker' in navigator){
                    navigator.serviceWorker.getRegistrations().then(function(regs){
                      Promise.all(regs.map(function(r){return r.unregister().catch(function(){return false;});})).then(step,step);
                    },step);
                  } else step();
                }catch(_){step();}
                pending++;
                try{
                  if(window.caches&&caches.keys){
                    caches.keys().then(function(ks){
                      Promise.all(ks.map(function(k){return caches.delete(k).catch(function(){return false;});})).then(step,step);
                    },step);
                  } else step();
                }catch(_){step();}
                // Safety: never wait more than 2.5s for cleanups.
                setTimeout(done,2500);
              }
              window.__machiHeal=heal;
              window.addEventListener('error',function(ev){
                if(isChunkError(ev&&(ev.message||ev.error&&ev.error.message))){
                  heal('error: '+(ev.message||'unknown'));
                }
              });
              window.addEventListener('unhandledrejection',function(ev){
                var reason=ev&&ev.reason;
                var msg=reason&&(reason.message||String(reason));
                if(isChunkError(msg)){
                  heal('rejection: '+msg);
                }
              });
              // Heal-once token: clear so a future genuine error can heal again
              // after the user has stayed on the page for a while.
              setTimeout(function(){try{sessionStorage.removeItem(KEY);}catch(_){}},30000);
              // Belt-and-suspenders: if window.load doesn't fire within
              // 12 seconds AND nothing has rendered, assume the boot is
              // truly stuck and heal. ResetTime: once per session.
              setTimeout(function(){
                try{
                  if(document.readyState==='complete')return;
                  var hasContent=document.body && document.body.innerText &&
                    document.body.innerText.replace(/\\s/g,'').length>40;
                  if(!hasContent) heal('boot stalled');
                }catch(_){}
              },12000);
            })()`,
          }}
        />
      </head>
      <body>
        <QueryProvider>
          <SessionBootstrap>
            <ThemeBridge>
              <I18nProvider>{children}</I18nProvider>
            </ThemeBridge>
          </SessionBootstrap>
        </QueryProvider>
        <ServiceWorkerRegistrar />
        <SiteSplash locale={locale} />
      </body>
    </html>
  );
}
