"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { api, writeToken, APIError } from "./api";
import { useSession, useSettings } from "./store";

// Only an explicit 401/403 means "you are not (or no longer) logged in". Every
// other failure — 429 rate limit, 5xx, network blip, request timeout — is
// transient and must NOT log the user out, or a multi-tab user / QA sweep /
// pointed-at-an-old-backend deploy gets bounced to /login by mistake.
function isAuthRejection(err: unknown): boolean {
  if (err instanceof APIError) {
    return err.status === 401 || err.status === 403 || err.code === "AUTH_REQUIRED";
  }
  return false;
}

export function SessionBootstrap({ children }: { children: React.ReactNode }) {
  const setUser = useSession((s) => s.setUser);
  const setStatus = useSession((s) => s.setStatus);
  const setSettings = useSettings((s) => s.setSettings);

  useEffect(() => {
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const MAX_ATTEMPTS = 3;

    const loadSettings = async () => {
      try {
        const s = await api.settings();
        if (!cancelled) setSettings(s);
      } catch {
        // settings are best-effort; never block bootstrap on them
      }
    };

    const probe = (attempt: number) => {
      setStatus("loading");
      api
        .me()
        .then((user) => {
          if (cancelled) return;
          setUser(user);
          void loadSettings();
        })
        .catch((err) => {
          if (cancelled) return;
          if (isAuthRejection(err)) {
            // Genuinely not logged in: clear and surface as unauthed.
            writeToken(null);
            setUser(null);
            return;
          }
          // Transient failure: keep any existing token, mark degraded (so
          // protected routes don't redirect), and retry with backoff.
          setStatus("degraded");
          if (attempt + 1 < MAX_ATTEMPTS) {
            retryTimer = setTimeout(() => probe(attempt + 1), 1500 * (attempt + 1));
          }
        });
    };

    probe(0);
    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [setUser, setStatus, setSettings]);

  return <>{children}</>;
}

export function useRequireAuth(): boolean {
  const status = useSession((s) => s.status);
  const user = useSession((s) => s.user);
  const router = useRouter();
  useEffect(() => {
    if (status === "unauthed") {
      const redirect =
        typeof window !== "undefined"
          ? `${window.location.pathname}${window.location.search}`
          : "/home";
      const safeRedirect = redirect.startsWith("/") && !redirect.startsWith("//") ? redirect : "/home";
      router.replace(`/login?redirect=${encodeURIComponent(safeRedirect)}`);
    }
  }, [status, router]);
  return !!user;
}

export function useSessionUser() {
  return useSession((s) => s.user);
}
