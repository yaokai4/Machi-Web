"use client";

// 后台 · 活动管理 —— 全量活动列表(含草稿/已取消),支持精选开关、
// 打开活动管理页(编辑基本信息 + 报名表单字段 + 名单)、下线活动。

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, ExternalLink, Loader2, Search, Settings2, Star, XCircle } from "lucide-react";
import { AppShell } from "@/components/shell/AppShell";
import { ErrorState, InlineLoading } from "@/components/design/States";
import { Avatar } from "@/components/design/Avatar";
import { api } from "@/lib/api";
import type { KXEvent } from "@/lib/types";
import { eventStyle, eventTimeLine } from "@/components/social/socialStyle";

function statusChip(status?: string) {
  if (status === "published") return <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-black text-emerald-600">已发布</span>;
  if (status === "draft") return <span className="rounded-full bg-kx-soft px-2 py-0.5 text-[11px] font-black text-kx-muted">草稿</span>;
  return <span className="rounded-full bg-kx-heat/10 px-2 py-0.5 text-[11px] font-black text-kx-heat">已取消</span>;
}

function AdminEventRow({ event }: { event: KXEvent }) {
  const queryClient = useQueryClient();
  const style = eventStyle(event.category);
  const Icon = style.icon;
  const slug = event.slug || event.id;

  const toggleFeatured = useMutation({
    mutationFn: () => api.updateEvent(slug, { is_featured: !event.is_featured }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-events"] }),
  });
  const cancel = useMutation({
    mutationFn: () => api.updateEvent(slug, { status: "cancelled" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-events"] }),
  });

  return (
    <li className="kx-card flex flex-wrap items-center gap-3 p-3.5">
      <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${style.softBg}`}>
        <Icon className={`h-5 w-5 ${style.text}`} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <p className="truncate text-sm font-black">{event.title}</p>
          {statusChip(event.status)}
          {event.is_featured ? (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-400/15 px-2 py-0.5 text-[11px] font-black text-amber-600">
              <Star className="h-3 w-3" /> 精选
            </span>
          ) : null}
        </div>
        <p className="mt-0.5 truncate text-xs font-semibold text-kx-muted">
          {eventTimeLine(event.starts_at, event.ends_at)}
          {event.venue_name ? ` · ${event.venue_name}` : ""} · {event.going_count ?? 0} 人报名
        </p>
      </div>
      {event.organizer ? <Avatar user={event.organizer} size={30} href={`/u/${event.organizer.handle}`} /> : null}
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => toggleFeatured.mutate()}
          disabled={toggleFeatured.isPending}
          className={`inline-flex h-8 items-center gap-1 rounded-full px-3 text-[11px] font-black transition disabled:opacity-50 ${
            event.is_featured ? "bg-amber-400/20 text-amber-600" : "bg-kx-soft text-kx-muted hover:text-kx-text"
          }`}
        >
          {toggleFeatured.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Star className="h-3 w-3" />}
          {event.is_featured ? "取消精选" : "精选"}
        </button>
        <Link
          href={`/events/${encodeURIComponent(slug)}/manage`}
          className="inline-flex h-8 items-center gap-1 rounded-full bg-kx-accent/10 px-3 text-[11px] font-black text-kx-accent hover:bg-kx-accent/15"
        >
          <Settings2 className="h-3 w-3" /> 管理
        </Link>
        <Link
          href={`/events/${encodeURIComponent(slug)}`}
          className="inline-flex h-8 items-center gap-1 rounded-full bg-kx-soft px-3 text-[11px] font-black text-kx-muted hover:text-kx-text"
        >
          <ExternalLink className="h-3 w-3" /> 查看
        </Link>
        {event.status !== "cancelled" ? (
          <button
            type="button"
            onClick={() => { if (confirm(`下线活动「${event.title}」?`)) cancel.mutate(); }}
            disabled={cancel.isPending}
            className="inline-flex h-8 items-center gap-1 rounded-full bg-kx-heat/10 px-3 text-[11px] font-black text-kx-heat hover:bg-kx-heat/15 disabled:opacity-50"
          >
            <XCircle className="h-3 w-3" /> 下线
          </button>
        ) : null}
      </div>
    </li>
  );
}

export default function AdminEventsPage() {
  const [when, setWhen] = useState("all");
  const [keyword, setKeyword] = useState("");

  const events = useQuery({
    queryKey: ["admin-events", when],
    queryFn: () => api.adminEvents({ when, limit: 50 }),
  });

  const filtered = (events.data?.items ?? []).filter((event) =>
    !keyword.trim() || event.title.toLowerCase().includes(keyword.trim().toLowerCase()),
  );

  return (
    <AppShell requireAuth wide>
      <header className="kx-glass-bar sticky top-0 z-30 px-4 py-3">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-kx-accent" />
          <h1 className="text-xl font-black">活动管理</h1>
        </div>
        <p className="mt-1 text-sm text-kx-muted">全量活动(含草稿与已取消)。精选活动在活动页和 App 端置顶展示。</p>
      </header>

      <main className="space-y-4 px-4 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-full border border-kx-stroke/60 bg-kx-card/70 p-1 text-xs font-black">
            {([["all", "全部"], ["upcoming", "未开始"], ["past", "已结束"]] as const).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setWhen(key)}
                className={`rounded-full px-3.5 py-1.5 transition ${when === key ? "bg-kx-accent text-white shadow" : "text-kx-muted hover:text-kx-text"}`}
              >
                {label}
              </button>
            ))}
          </div>
          <label className="relative ml-auto block w-full max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-kx-muted" />
            <input
              className="kx-input h-10 pl-9"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="搜活动名…"
            />
          </label>
        </div>

        {events.isError ? (
          <ErrorState onRetry={() => events.refetch()} />
        ) : events.isLoading || !events.data ? (
          <InlineLoading />
        ) : filtered.length === 0 ? (
          <p className="py-12 text-center text-sm font-semibold text-kx-muted">没有匹配的活动。</p>
        ) : (
          <ul className="space-y-2.5">
            {filtered.map((event) => (
              <AdminEventRow key={event.id} event={event} />
            ))}
          </ul>
        )}
      </main>
    </AppShell>
  );
}
