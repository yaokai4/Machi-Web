"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { APIError } from "./api";

/**
 * Production-tuned React Query setup.
 *
 * - 30s staleTime: most feeds, posts and profile data don't need to
 *   refetch on every mount during a single user session. This is the
 *   single biggest win for handling many concurrent users — it cuts
 *   API load by an order of magnitude when users navigate between
 *   pages.
 * - 5min gcTime: keep prefetched data in memory while the user is
 *   navigating; release it after they've moved on.
 * - Retry once with backoff on transient failures, but NEVER retry on
 *   4xx — those are programmatic / auth errors that won't fix on
 *   retry and just waste backend capacity.
 * - refetchOnReconnect: true so a user who flapped wifi catches up.
 * - refetchOnWindowFocus: false because the SSE realtime channel
 *   already invalidates queries the user cares about.
 */
function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= 1) return false;
  if (error instanceof APIError) {
    if (error.status >= 400 && error.status < 500) return false;
    if (error.status === 0) return true; // network / timeout
    if (error.status >= 500) return true;
    return false;
  }
  return true;
}

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30 * 1000,
            gcTime: 5 * 60 * 1000,
            retry: shouldRetry,
            retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
            refetchOnWindowFocus: false,
            refetchOnReconnect: true,
            networkMode: "online",
          },
          mutations: {
            retry: 0,
            networkMode: "online",
          },
        },
      }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
