"use client";

import Link from "next/link";
import { Newspaper } from "lucide-react";
import type { EditorialPost } from "@/lib/api";
import { relativeTime } from "@/lib/format";
import { NEWS_CATEGORY_LABELS } from "@/components/news/LocalNewsStrip";

function langChip(code?: string): string {
  if (!code) return "";
  const c = code.toLowerCase();
  if (c.startsWith("zh")) return "中文";
  if (c.startsWith("en")) return "EN";
  if (c.startsWith("ja")) return "日本語";
  return code;
}

function cityChip(code?: string): string {
  if (!code) return "";
  return code.charAt(0).toUpperCase() + code.slice(1);
}

/**
 * Editorial news card — deliberately distinct from PostCard so 资讯 never
 * reads like a user post: an editorial badge + 编辑部 attribution instead
 * of an avatar, no like/repost/bookmark row, and a clear "来源 · 时间"
 * line. Country-wide editorial is labelled Japan-wide so its scope is
 * unambiguous when it shows inside a single city's feed.
 */
export function NewsCard({ item, contextCity }: { item: EditorialPost; contextCity?: string }) {
  const wide = !item.city;
  const lang = langChip(item.language);
  const cityScope = contextCity || cityChip(item.city) || "本城";
  return (
    <Link
      href={`/news/${item.id}`}
      className="block rounded-kx-lg border border-kx-stroke/50 bg-kx-card/80 p-4 transition hover:border-kx-accent/40"
    >
      <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px] font-bold">
        <span className="inline-flex items-center gap-1 rounded-full bg-kx-accentSoft px-2 py-0.5 text-kx-accent">
          <Newspaper className="h-3 w-3" /> {NEWS_CATEGORY_LABELS[item.category] || "本地资讯"}
        </span>
        <span className="text-kx-muted">{item.author_display_name || "Machi 编辑部整理"}</span>
      </div>
      <h3 className="line-clamp-2 text-[15px] font-black leading-5 text-kx-text">{item.title}</h3>
      {item.summary ? (
        <p className="mt-1 line-clamp-2 text-sm leading-5 text-kx-subtle">{item.summary}</p>
      ) : null}
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-kx-muted">
        {wide ? (
          <span className="rounded-full border border-kx-stroke/60 px-2 py-0.5">Japan-wide · 适用于 {cityScope}</span>
        ) : (
          <span className="rounded-full border border-kx-stroke/60 px-2 py-0.5">{cityChip(item.city)}</span>
        )}
        {lang ? <span className="rounded-full bg-kx-soft px-2 py-0.5">{lang}</span> : null}
        {item.source_name ? <span className="truncate">· {item.source_name}</span> : null}
        <span className="ml-auto shrink-0">{item.published_at ? relativeTime(item.published_at) : "待发布"}</span>
      </div>
    </Link>
  );
}
