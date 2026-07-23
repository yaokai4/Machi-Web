// Route-level loading skeleton for the JLPT zone: mirrors the landing layout
// (hero card + countdown + action grid) so the first paint doesn't flash a
// bare spinner. Server component — no hooks, tokens only, pulse respects
// prefers-reduced-motion via motion-reduce.

function Block({ className }: { className: string }) {
  return (
    <div
      aria-hidden
      className={`animate-pulse rounded-2xl bg-[rgb(var(--kx-living-ink))]/[0.05] motion-reduce:animate-none ${className}`}
    />
  );
}

export default function JlptZoneLoading() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-16 pt-6 sm:px-5" role="status" aria-label="Loading">
      <Block className="h-44 rounded-[28px]" />
      <div className="mt-3">
        <Block className="h-[72px] rounded-[20px]" />
      </div>
      <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Block className="h-[92px] rounded-[24px]" />
        <Block className="h-[92px] rounded-[24px]" />
        <Block className="h-[92px] rounded-[24px]" />
        <Block className="h-[92px] rounded-[24px]" />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <Block className="h-[64px] rounded-[20px]" />
        <Block className="h-[64px] rounded-[20px]" />
      </div>
    </div>
  );
}
