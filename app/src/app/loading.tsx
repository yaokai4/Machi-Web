"use client";

// Global route fallback. This also covers public/marketing routes (/, /login,
// …), so it stays neutral and quiet — a centered brand placeholder rather than
// an app-shell skeleton. App routes below (/home, /explore, …) ship their own
// shell-aware loading.tsx.
import { useI18n } from "@/lib/i18n";

export default function Loading() {
  const { t } = useI18n();
  return (
    <div className="min-h-dvh flex items-center justify-center bg-kx-bg">
      <div className="flex flex-col items-center gap-4" role="status" aria-label={t("loading")}>
        <span className="h-11 w-11 rounded-[30%] kx-skeleton" />
        <span className="h-3 w-24 rounded-full kx-skeleton" />
      </div>
    </div>
  );
}
