"use client";

import clsx from "clsx";
import { Skeleton } from "@/components/design/States";

/**
 * Post-shaped skeleton that mirrors the real PostCard anatomy — avatar,
 * two-line author meta, body lines, an optional media block and the
 * interaction row — so the loading → content swap doesn't jump. All bones
 * run through the shared `.kx-skeleton` shimmer primitive.
 *
 * `withMedia` is passed explicitly (deterministic, no Math.random) so
 * server and client render identically.
 */
export function FeedSkeleton({ withMedia = false }: { withMedia?: boolean }) {
  return (
    <div className="kx-card" aria-hidden="true">
      <div className="flex items-start gap-3">
        <Skeleton className="h-[42px] w-[42px] shrink-0 rounded-kx-sm" />
        <div className="min-w-0 flex-1">
          {/* Author line: name + meta */}
          <div className="flex items-center gap-2">
            <Skeleton className="h-3.5 w-24 rounded-full" />
            <Skeleton className="h-3 w-16 rounded-full" />
          </div>
          {/* Body */}
          <div className="mt-3 space-y-2">
            <Skeleton className="h-3.5 w-full rounded-full" />
            <Skeleton className="h-3.5 w-11/12 rounded-full" />
            <Skeleton className="h-3.5 w-3/5 rounded-full" />
          </div>
          {withMedia ? <Skeleton className="mt-3 aspect-video w-full rounded-kx-md" /> : null}
          {/* Interaction row: four quiet dots */}
          <div className="mt-3.5 flex max-w-md items-center justify-between pr-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-4 w-10 rounded-full" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** A short stack of alternating skeleton cards for list loading states. */
export function FeedSkeletonList({ count = 3, className }: { count?: number; className?: string }) {
  return (
    <div className={clsx("space-y-3", className)} role="status" aria-live="polite">
      {Array.from({ length: count }).map((_, i) => (
        <FeedSkeleton key={i} withMedia={i % 2 === 0} />
      ))}
    </div>
  );
}
