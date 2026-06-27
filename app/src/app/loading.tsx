// Global route fallback. This also covers public/marketing routes (/, /login,
// …), so it stays neutral and quiet — a centered brand placeholder rather than
// an app-shell skeleton. App routes below (/home, /explore, …) ship their own
// shell-aware loading.tsx.
export default function Loading() {
  return (
    <div className="min-h-dvh flex items-center justify-center bg-kx-bg">
      <div className="flex flex-col items-center gap-4" role="status" aria-label="加载中">
        <span className="h-11 w-11 rounded-[30%] kx-skeleton" />
        <span className="h-3 w-24 rounded-full kx-skeleton" />
      </div>
    </div>
  );
}
