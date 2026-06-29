"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
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
    // Auth for the stream is established by `POST /api/events/token`, which
    // carries the session via the same-origin cookie (or legacy Bearer).
    // Do NOT gate on readToken() here: web sessions now live in an HttpOnly
    // cookie, so readToken() is null for cookie-authed (now-default) users —
    // gating on it silently disabled realtime for the majority of users.

    let es: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let renewTimer: ReturnType<typeof setTimeout> | null = null;
    let closed = false;
    let attempt = 0;

    // Exponential backoff with jitter (3s → 5min). A persistently failing stream
    // must never become a reconnect/token storm: the old fixed 5s retry meant a
    // single left-open tab could hammer POST /api/events/token indefinitely (and
    // once rate-limited, spin on 429s), starving the user's other API calls.
    const scheduleReconnect = () => {
      if (closed) return;
      if (retryTimer) clearTimeout(retryTimer);
      const expo = Math.min(5 * 60_000, 3000 * 2 ** Math.min(attempt, 7));
      attempt += 1;
      retryTimer = setTimeout(() => void connect(), expo + Math.random() * Math.min(expo, 4000));
    };

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
        // If the token endpoint is unreachable (or rate-limited), back off
        // exponentially. Do NOT fall back to putting the long-lived bearer in
        // the URL — keeping it out of logs is the whole point.
        scheduleReconnect();
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
        attempt = 0; // planned rotation, not a failure
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
        attempt = 0; // stream is live again — reset the backoff
      });

      es.onerror = () => {
        es?.close();
        es = null;
        // Cancel the pending token-rotation timer for this now-dead stream —
        // otherwise it would later fire its own connect() alongside the backoff
        // reconnect below, producing a stray duplicate stream.
        if (renewTimer) { clearTimeout(renewTimer); renewTimer = null; }
        // Reconnect with exponential backoff (closing es stops the browser's
        // own auto-retry so the two can't compound into a storm).
        scheduleReconnect();
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
