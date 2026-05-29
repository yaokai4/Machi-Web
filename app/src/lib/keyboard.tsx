"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useCompose } from "./store";

/**
 * Global keyboard shortcuts available in the AppShell.
 *
 *   ⌘/Ctrl + K     focus search (navigates to /search)
 *   ⌘/Ctrl + N     open composer
 *   g h            go home
 *   g e            go explore
 *   g n            go notifications
 *   g m            go messages
 *   g p            go profile
 *
 * Single-letter "g X" shortcuts use the Vim-style leader pattern.
 */
export function useGlobalShortcuts() {
  const router = useRouter();
  const openCompose = useCompose((s) => s.open);

  useEffect(() => {
    let leader = false;
    let leaderTimer: ReturnType<typeof setTimeout> | null = null;
    const cancelLeader = () => {
      leader = false;
      if (leaderTimer) clearTimeout(leaderTimer);
      leaderTimer = null;
    };

    const isEditing = (target: EventTarget | null): boolean => {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
      if (target.isContentEditable) return true;
      return false;
    };

    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === "k") {
        e.preventDefault();
        router.push("/search");
        return;
      }
      if (meta && e.key.toLowerCase() === "n") {
        e.preventDefault();
        openCompose();
        return;
      }
      if (isEditing(e.target)) return;
      if (e.key === "g") {
        leader = true;
        if (leaderTimer) clearTimeout(leaderTimer);
        leaderTimer = setTimeout(() => cancelLeader(), 900);
        return;
      }
      if (leader) {
        const key = e.key.toLowerCase();
        if (["h", "e", "n", "m", "p", "s"].includes(key)) {
          e.preventDefault();
          cancelLeader();
          switch (key) {
            case "h": router.push("/home"); break;
            case "e": router.push("/explore"); break;
            case "n": router.push("/notifications"); break;
            case "m": router.push("/messages"); break;
            case "p": router.push("/me"); break;
            case "s": router.push("/settings"); break;
          }
        } else {
          cancelLeader();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      cancelLeader();
    };
  }, [router, openCompose]);
}
