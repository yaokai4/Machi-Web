/// Next.js `template.tsx` is re-mounted on every navigation (unlike
/// `layout.tsx` which persists). We use that to:
///   1. Apply a subtle opacity fade-in (.mc-route-enter)
///   2. Show a tiny indigo→sky progress shimmer at the top of the
///      viewport for ~700ms (.mc-nav-progress)
///
/// Both are CSS-only — no React state, no setTimeout — so they never
/// stay around past their animation, and they cost zero JS at runtime.
/// `prefers-reduced-motion` users get an instant cut.
export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="mc-nav-progress" aria-hidden="true" />
      <div className="mc-route-enter">{children}</div>
    </>
  );
}
