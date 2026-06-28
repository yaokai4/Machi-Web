import { Skeleton, PostSkeleton } from "@/components/design/States";

// A presentational skeleton that mirrors the real AppShell chrome — left nav
// rail (desktop), bordered center column, right rail (xl), and the floating
// mobile tab bar — so route-level `loading.tsx` and the session-bootstrap wait
// state never flash a blank page or shift layout. Quiet and scannable, not a
// hero. Pure markup (no hooks) so it can render as a server component.

export type ShellVariant =
  | "feed"
  | "list"
  | "detail"
  | "settings"
  | "guide"
  | "machiAI"
  | "wallet"
  | "messages";

export function shellVariantForPath(pathname?: string | null): ShellVariant {
  const p = pathname || "";
  if (p.startsWith("/messages")) return "messages";
  if (p.startsWith("/settings")) return "settings";
  if (p.startsWith("/wallet")) return "wallet";
  if (p.startsWith("/membership")) return "wallet";
  if (p.startsWith("/guide/ai")) return "machiAI";
  if (p.startsWith("/guide")) return "guide";
  if (/\/(marketplace|rentals|jobs|services|deals|discounts)\/[^/]+$/.test(p)) return "detail";
  if (p.startsWith("/listings/") || p.startsWith("/post/")) return "detail";
  if (p.startsWith("/explore") || p.startsWith("/search") || p.startsWith("/cities")) return "list";
  return "feed";
}

function NavRailSkeleton() {
  return (
    <aside
      className="hidden md:flex flex-col gap-1 w-16 lg:w-64 shrink-0 py-3 px-2 lg:px-3 sticky top-0 self-start h-dvh"
      aria-hidden="true"
    >
      <div className="mb-2 flex items-center gap-2 px-1">
        <Skeleton className="h-9 w-9 rounded-[30%]" />
        <Skeleton className="hidden lg:block h-4 w-24 rounded-full" />
      </div>
      {Array.from({ length: 7 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-1 py-2">
          <Skeleton className="h-9 w-9 rounded-full shrink-0" />
          <Skeleton className="hidden lg:block h-3.5 w-28 rounded-full" />
        </div>
      ))}
      <div className="mt-3 hidden lg:block">
        <Skeleton className="h-11 w-full rounded-full" />
      </div>
    </aside>
  );
}

function RightRailSkeleton() {
  return (
    <aside
      className="hidden xl:flex flex-col gap-3 w-80 shrink-0 py-3 pl-6 sticky top-0 self-start h-dvh"
      aria-hidden="true"
    >
      {Array.from({ length: 2 }).map((_, i) => (
        <div key={i} className="kx-card space-y-3">
          <Skeleton className="h-4 w-28 rounded-full" />
          {Array.from({ length: 3 }).map((__, j) => (
            <div key={j} className="flex items-center gap-3">
              <Skeleton className="h-9 w-9 rounded-full shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3 w-2/3 rounded-full" />
                <Skeleton className="h-3 w-1/3 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      ))}
    </aside>
  );
}

function MobileTabBarSkeleton() {
  return (
    <nav
      className="kx-mobile-tabbar md:hidden px-2 py-2"
      style={{ bottom: "var(--kx-mobile-tabbar-bottom)" }}
      aria-hidden="true"
    >
      <ul className="relative z-[1] flex h-12 items-center justify-between">
        {Array.from({ length: 5 }).map((_, i) => (
          <li key={i} className="flex flex-1 items-center justify-center">
            <Skeleton className="h-7 w-7 rounded-full" />
          </li>
        ))}
      </ul>
    </nav>
  );
}

function FeedHeaderSkeleton() {
  return (
    <div className="flex items-center gap-5 border-b border-kx-stroke/35 px-4 py-3.5">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-4 w-12 rounded-full" />
      ))}
    </div>
  );
}

function CenterSkeleton({ variant }: { variant: ShellVariant }) {
  if (variant === "detail") {
    return (
      <div className="space-y-4 p-3 md:p-4">
        <Skeleton className="h-7 w-24 rounded-full" />
        <Skeleton className="aspect-[4/3] w-full rounded-kx-lg" />
        <div className="space-y-3">
          <Skeleton className="h-5 w-2/3 rounded-full" />
          <Skeleton className="h-4 w-1/3 rounded-full" />
          <Skeleton className="h-24 w-full rounded-kx-md" />
        </div>
      </div>
    );
  }
  if (variant === "settings") {
    return (
      <div className="space-y-3 p-3 md:p-4">
        <Skeleton className="h-7 w-28 rounded-full" />
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="kx-card flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Skeleton className="h-9 w-9 rounded-2xl" />
              <Skeleton className="h-4 w-32 rounded-full" />
            </div>
            <Skeleton className="h-5 w-10 rounded-full" />
          </div>
        ))}
      </div>
    );
  }
  if (variant === "wallet") {
    return (
      <div className="space-y-4 p-3 md:p-4">
        <Skeleton className="h-7 w-24 rounded-full" />
        <Skeleton className="h-28 w-full rounded-kx-lg" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-kx-md" />
          ))}
        </div>
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-kx-md" />
          ))}
        </div>
      </div>
    );
  }
  if (variant === "guide") {
    return (
      <div className="space-y-4 p-3 md:p-4">
        <Skeleton className="h-8 w-40 rounded-full" />
        <Skeleton className="h-12 w-full rounded-full" />
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-kx-lg" />
          ))}
        </div>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-kx-md" />
          ))}
        </div>
      </div>
    );
  }
  if (variant === "messages") {
    return (
      <div className="space-y-2 p-3 md:p-4">
        <Skeleton className="mb-2 h-7 w-20 rounded-full" />
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 rounded-kx-md p-2">
            <Skeleton className="h-12 w-12 rounded-full shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3.5 w-1/3 rounded-full" />
              <Skeleton className="h-3 w-2/3 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    );
  }
  if (variant === "list") {
    return (
      <div className="space-y-4 p-3 md:p-4">
        <Skeleton className="h-11 w-full rounded-full" />
        <div className="flex gap-2 overflow-hidden">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-20 shrink-0 rounded-full" />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="aspect-[4/3] w-full rounded-kx-md" />
              <Skeleton className="h-3.5 w-2/3 rounded-full" />
              <Skeleton className="h-3 w-1/3 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (variant === "machiAI") {
    // Chat-shaped: back link + sticky header (avatar/title/controls) + a couple
    // of message bubbles + bottom composer — mirrors the real /guide/ai layout
    // so the load reads as intentional instead of flashing the guide grid.
    return (
      <div className="flex h-full flex-col p-3 md:p-4">
        <Skeleton className="mb-3 h-5 w-24 rounded-full" />
        <div className="flex items-center gap-3 border-b border-kx-stroke/30 pb-3">
          <Skeleton className="h-10 w-10 shrink-0 rounded-[28%]" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-28 rounded-full" />
            <Skeleton className="h-3 w-40 rounded-full" />
          </div>
          <Skeleton className="hidden h-9 w-20 rounded-full sm:block" />
          <Skeleton className="h-9 w-9 rounded-full" />
        </div>
        <div className="flex-1 space-y-5 py-5">
          <div className="flex items-start gap-2">
            <Skeleton className="h-8 w-8 shrink-0 rounded-[28%]" />
            <Skeleton className="h-20 w-3/5 rounded-[1.25rem]" />
          </div>
          <div className="flex justify-end">
            <Skeleton className="h-12 w-2/5 rounded-[1.25rem]" />
          </div>
          <div className="flex items-start gap-2">
            <Skeleton className="h-8 w-8 shrink-0 rounded-[28%]" />
            <Skeleton className="h-28 w-3/4 rounded-[1.25rem]" />
          </div>
        </div>
        <Skeleton className="h-12 w-full rounded-full" />
      </div>
    );
  }
  // feed (default)
  return (
    <div>
      <FeedHeaderSkeleton />
      <div className="space-y-3 p-3 md:p-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <PostSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

export function AppShellSkeleton({
  variant = "feed",
  showRight = true,
}: {
  variant?: ShellVariant;
  showRight?: boolean;
}) {
  return (
    <div className="kx-app-shell min-h-dvh" aria-busy="true">
      <div className="kx-grain" aria-hidden="true" />
      <div className="relative z-[1] mx-auto flex w-full max-w-kx-shell">
        <NavRailSkeleton />
        <main className="kx-shell-main flex-1 min-w-0 border-x border-kx-stroke/35 lg:max-w-kx-feed">
          <div className="pb-36 md:pb-8">
            <CenterSkeleton variant={variant} />
          </div>
        </main>
        {showRight ? <RightRailSkeleton /> : null}
      </div>
      <MobileTabBarSkeleton />
      <span className="sr-only" role="status">
        加载中…
      </span>
    </div>
  );
}
