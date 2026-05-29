"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, readToken } from "./api";
import { useSession, useToasts } from "./store";

/**
 * Subscribe to the unified backend's Server-Sent Events stream and
 * mirror new notifications / messages into React Query's cache so the
 * UI updates without a manual refetch.
 *
 * The connection negotiates a short-lived (5 min) SSE token via
 * `POST /api/events/token` so the long-lived Bearer never appears in
 * the URL — keeping it out of nginx logs, browser history and Referer.
 * EventSource itself still cannot attach a custom Authorization header.
 */
export function useRealtime() {
  const queryClient = useQueryClient();
  const user = useSession((s) => s.user);
  const pushToast = useToasts((s) => s.push);
  const lastEventAt = useRef<number>(0);

  useEffect(() => {
    if (!user) return;
    const bearer = readToken();
    if (!bearer) return;

    let es: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let renewTimer: ReturnType<typeof setTimeout> | null = null;
    let closed = false;

    const connect = async () => {
      if (closed) return;
      let sseToken: string;
      let renewMs = 4 * 60 * 1000;
      try {
        const issued = await api.issueEventsToken();
        sseToken = issued.token;
        // Renew well before the server-side TTL (default 300s).
        renewMs = Math.max(30_000, (issued.expires_in - 30) * 1000);
      } catch {
        // If the token endpoint is unreachable, schedule a retry but
        // do NOT fall back to putting the long-lived bearer in the
        // URL — keeping it out of logs is the whole point.
        if (!closed) retryTimer = setTimeout(connect, 5000);
        return;
      }
      try {
        es = new EventSource(`/api/events?token=${encodeURIComponent(sseToken)}`);
      } catch {
        return;
      }
      // The SSE token is single-use; rotate ahead of expiry by closing
      // the current stream and re-opening with a fresh token.
      renewTimer = setTimeout(() => {
        if (closed) return;
        try { es?.close(); } catch { /* ignore */ }
        es = null;
        void connect();
      }, renewMs);

      es.addEventListener("notification", (e) => {
        lastEventAt.current = Date.now();
        try {
          const data = JSON.parse((e as MessageEvent).data || "{}");
          queryClient.invalidateQueries({ queryKey: ["notifications"] });
          // Bump post counts as a free side effect.
          if (data.post_id) {
            queryClient.invalidateQueries({ queryKey: ["post", data.post_id] });
          }
        } catch {
          // ignore
        }
      });

      es.addEventListener("message", (e) => {
        // Treat plain "message" events as DM updates only when they
        // describe a conversation; the SSE protocol's default event
        // type is "message" so we also fall through to JSON parsing.
        try {
          const data = JSON.parse((e as MessageEvent).data || "{}");
          if (data?.type === "message" && data?.conversation_id) {
            lastEventAt.current = Date.now();
            queryClient.invalidateQueries({ queryKey: ["messages", data.conversation_id] });
            queryClient.invalidateQueries({ queryKey: ["conversations"] });
            if (typeof document !== "undefined" && document.hidden) {
              // optional desktop notification
              try {
                if (typeof Notification !== "undefined" && Notification.permission === "granted") {
                  new Notification("Machi 新消息", { body: "有新的私信" });
                }
              } catch {
                // ignore
              }
            }
          }
        } catch {
          // ignore non-json keepalives
        }
      });

      es.addEventListener("post_created", () => {
        queryClient.invalidateQueries({ queryKey: ["feed"] });
      });

      es.addEventListener("hello", () => {
        lastEventAt.current = Date.now();
      });

      es.onerror = () => {
        es?.close();
        es = null;
        // Reconnect with backoff. The browser may also auto-retry; this
        // guards against the page being suspended for long periods.
        if (!closed) {
          retryTimer = setTimeout(connect, 5000);
        }
      };
    };

    void connect();

    return () => {
      closed = true;
      if (retryTimer) clearTimeout(retryTimer);
      if (renewTimer) clearTimeout(renewTimer);
      es?.close();
    };
  }, [user, queryClient, pushToast]);

  return null;
}
