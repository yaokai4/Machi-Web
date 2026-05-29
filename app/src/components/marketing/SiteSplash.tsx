/// Render the splash markup directly into the SSR HTML so it's
/// present on the very first frame, before any client JS hydrates.
/// An inline `<script>` decides whether to actually *display* it —
/// the splash only appears when the page hasn't finished loading
/// within 250 ms, so a fast (already-cached) navigation never sees
/// the animation. On a slow load it appears, then fades out as soon
/// as `window.load` fires. Either way the splash is dismissed once
/// per session via sessionStorage.
///
/// This is intentionally a server component — no "use client", no
/// hydration, no React state. It writes ~1KB of HTML and a tiny
/// script, and never re-renders.
///
/// `suppressHydrationWarning` is required because the inline script
/// below may flip `style.display` from `none` to `grid` *before*
/// React hydrates the page. Without the suppression, React's
/// hydration pass complains about the SSR vs. live-DOM mismatch.
/// The splash node is owned by the inline script after first paint
/// and React never updates it again, so suppressing the warning is
/// the right call here.
export function SiteSplash() {
  return (
    <>
      <div
        id="machi-splash"
        className="machi-splash"
        aria-hidden
        style={{ display: "none" }}
        suppressHydrationWarning
      >
        <span className="machi-splash-glow machi-splash-glow-a" />
        <span className="machi-splash-glow machi-splash-glow-b" />
        <div className="machi-splash-stack">
          <span className="machi-splash-ring machi-splash-ring-a" />
          <span className="machi-splash-ring machi-splash-ring-b" />
          <span className="machi-splash-logo">
            M<span className="machi-splash-dot" />
          </span>
          <div className="machi-splash-text">
            <p className="machi-splash-title">Machi&nbsp;City</p>
            <p className="machi-splash-tagline">在每一座城市，找到生活的回声</p>
          </div>
          <span className="machi-splash-bar">
            <span className="machi-splash-bar-fill" />
          </span>
        </div>
      </div>
      <script
        // Inline so it runs before any other JS — and importantly,
        // before the first paint of the page content. Tries to keep
        // out of the user's way on fast loads.
        dangerouslySetInnerHTML={{
          __html: `(() => {
            try {
              if (sessionStorage.getItem('machi.splash.played') === '1') return;
              if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
                sessionStorage.setItem('machi.splash.played', '1');
                return;
              }
              var el = document.getElementById('machi-splash');
              if (!el) return;
              var shown = false;
              var settled = false;
              var showTimer = setTimeout(function () {
                if (document.readyState !== 'complete') {
                  shown = true;
                  el.style.display = 'grid';
                }
              }, 260);
              function settle() {
                if (settled) return;
                settled = true;
                clearTimeout(showTimer);
                try { sessionStorage.setItem('machi.splash.played', '1'); } catch (e) {}
                if (!shown) return;
                el.classList.add('machi-splash--fade');
                setTimeout(function () {
                  el.style.display = 'none';
                  el.classList.remove('machi-splash--fade');
                }, 520);
              }
              if (document.readyState === 'complete') {
                settle();
              } else {
                window.addEventListener('load', settle, { once: true });
                setTimeout(settle, 4000);
              }
            } catch (e) {}
          })();`,
        }}
      />
    </>
  );
}
