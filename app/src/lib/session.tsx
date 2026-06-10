"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { api, writeToken } from "./api";
import { useSession, useSettings } from "./store";

export function SessionBootstrap({ children }: { children: React.ReactNode }) {
  const setUser = useSession((s) => s.setUser);
  const setStatus = useSession((s) => s.setStatus);
  const setSettings = useSettings((s) => s.setSettings);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    api
      .me()
      .then(async (user) => {
        if (cancelled) return;
        setUser(user);
        try {
          const s = await api.settings();
          if (!cancelled) setSettings(s);
        } catch {
          // ignore
        }
      })
      .catch(() => {
        writeToken(null);
        if (!cancelled) setUser(null);
      });
    return () => {
      cancelled = true;
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
