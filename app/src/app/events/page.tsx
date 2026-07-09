"use client";

// Machi 活动 —— Luma 式活动发现页(海报画廊)。与约局(搭子·聊天大厅)在视觉与
// 概念上彻底区分:活动是「正式策划、发海报、报名参加」的东西,大封面 + 日期块 +
// 报名。全新路由,不动任何既有页面样式。

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarPlus, Check, Clock3, MapPin, Star } from "lucide-react";
import { AppShell } from "@/components/shell/AppShell";
import { EmptyState, ErrorState, InlineLoading } from "@/components/design/States";
import { Avatar } from "@/components/design/Avatar";
import { api } from "@/lib/api";
import { sameOriginApiUrl } from "@/lib/media";
import { useI18n } from "@/lib/i18n";
import type { KXEvent } from "@/lib/types";
import { dateBadge, eventStyle, eventTimeLine, kindLabel, socialCopy, EVENT_CATEGORY_KEYS } from "@/components/social/socialStyle";

function AvatarWall({ users, total }: { users: KXEvent["attendees_preview"]; total: number }) {
  const shown = (users ?? []).slice(0, 5);
  return (
    <div className="flex items-center">
      <div className="flex -space-x-2">
        {shown.map((user) => (
          <div key={user.id} className="rounded-full ring-2 ring-kx-card">
            <Avatar user={user} size={22} />
          </div>
        ))}
      </div>
      {total > shown.length ? (
        <span className="ml-1.5 text-xs font-bold text-kx-muted">+{total - shown.length}</span>
      ) : null}
    </div>
  );
}

function EventCard({ event }: { event: KXEvent }) {
  const { locale } = useI18n();
  const c = socialCopy(locale).events;
  const style = eventStyle(event.category);
  const Icon = style.icon;
  const badge = dateBadge(event.starts_at, locale);
  const going = event.going_count ?? 0;
  return (
    <Link
      href={`/events/${encodeURIComponent(event.slug || event.id)}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-kx-stroke/45 bg-kx-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_18px_44px_-24px_rgb(var(--kx-shadow)/0.5)]"
    >
      <div className="relative aspect-[16/9] overflow-hidden">
        {event.cover_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={sameOriginApiUrl(event.cover_url)}
            alt=""
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
            loading="lazy"
          />
        ) : (
          <div className={`flex h-full w-full items-center justify-center bg-gradient-to-br ${style.gradient}`}>
            <Icon className="h-11 w-11 text-white/85" />
          </div>
        )}
        {badge ? (
          <div className="absolute left-3 top-3 flex w-11 flex-col items-center rounded-xl bg-white/95 py-1 shadow-md backdrop-blur dark:bg-black/75">
            <span className="text-[10px] font-black uppercase leading-tight text-red-500">{badge.month}</span>
            <span className="text-lg font-black leading-none">{badge.day}</span>
          </div>
        ) : null}
        {event.is_featured ? (
          <div className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-amber-400/95 px-2 py-1 text-[10px] font-black text-amber-950 shadow">
            <Star className="h-3 w-3" /> {c.featuredBadge}
          </div>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-black ${style.softBg} ${style.text}`}>
            <Icon className="h-3 w-3" />
            {kindLabel(event.category_label, style, locale)}
          </span>
          {event.price_text ? (
            <span className="ml-auto shrink-0 truncate text-xs font-black text-kx-heat">{event.price_text}</span>
          ) : null}
        </div>
        <h3 className="line-clamp-2 text-[15px] font-black leading-snug">{event.title}</h3>
        <div className="mt-auto space-y-1 text-xs font-semibold text-kx-muted">
          <p className="flex items-center gap-1.5">
            <Clock3 className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{eventTimeLine(event.starts_at, event.ends_at, locale)}</span>
          </p>
          {event.venue_name ? (
            <p className="flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{event.venue_name}</span>
            </p>
          ) : null}
        </div>
        <div className="flex items-center justify-between pt-1">
          {going > 0 ? (
            <div className="flex items-center gap-2">
              <AvatarWall users={event.attendees_preview} total={going} />
              <span className="text-xs font-semibold text-kx-muted">{c.going(going)}</span>
            </div>
          ) : (
            <span className="text-xs font-semibold text-kx-muted/70">{c.beFirst}</span>
          )}
          {event.viewer_status === "going" ? (
            <span className="inline-flex shrink-0 items-center gap-1 text-xs font-black text-kx-accent">
              <Check className="h-3.5 w-3.5" /> {c.registeredBadge}
            </span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}

export default function EventsPage() {
  const { locale } = useI18n();
  const c = socialCopy(locale).events;
  const [category, setCategory] = useState("");
  const [when, setWhen] = useState<"upcoming" | "past">("upcoming");

  const events = useQuery({
    queryKey: ["events", category, when],
    queryFn: () => api.events({ country_code: "jp", category: category || undefined, when, limit: 40 }),
    staleTime: 30_000,
  });

  const categories = useMemo(() => {
    const server = events.data?.categories ?? [];
    return server.length ? server.filter((c) => c.key !== "other") : EVENT_CATEGORY_KEYS.map((key) => ({ key, label: eventStyle(key).labelZh }));
  }, [events.data?.categories]);

  return (
    <AppShell requireAuth={false} wide right={null}>
      {/* Hero */}
      <header className="relative overflow-hidden px-4 pb-6 pt-8 sm:px-6">
        <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-kx-accent/15 blur-3xl" />
        <div className="pointer-events-none absolute -left-16 top-10 h-48 w-48 rounded-full bg-orange-400/15 blur-3xl" />
        <div className="relative">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-kx-accent">Machi Events</p>
          <h1 className="mt-2 text-3xl font-black leading-tight sm:text-4xl">{c.heroTitle}</h1>
          <p className="mt-2 max-w-xl text-sm font-semibold text-kx-muted">{c.heroDesc}</p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Link href="/events/create" className="kx-button-primary inline-flex h-11 items-center gap-2 rounded-full px-5 text-sm font-black">
              <CalendarPlus className="h-4 w-4" />
              {c.create}
            </Link>
            <div className="inline-flex rounded-full border border-kx-stroke/60 bg-kx-card/70 p-1 text-xs font-black">
              <button
                type="button"
                onClick={() => setWhen("upcoming")}
                className={`rounded-full px-3.5 py-1.5 transition ${when === "upcoming" ? "bg-kx-accent text-white shadow" : "text-kx-muted hover:text-kx-text"}`}
              >
                {c.upcoming}
              </button>
              <button
                type="button"
                onClick={() => setWhen("past")}
                className={`rounded-full px-3.5 py-1.5 transition ${when === "past" ? "bg-kx-accent text-white shadow" : "text-kx-muted hover:text-kx-text"}`}
              >
                {c.past}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Category rail */}
      <nav className="scrollbar-none flex gap-2 overflow-x-auto px-4 pb-4 sm:px-6">
        <button
          type="button"
          onClick={() => setCategory("")}
          className={`inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-xs font-black transition ${
            category === "" ? "bg-kx-accent text-white shadow" : "bg-kx-accent/10 text-kx-accent hover:bg-kx-accent/15"
          }`}
        >
          {c.all}
        </button>
        {categories.map((entry) => {
          const style = eventStyle(entry.key);
          const Icon = style.icon;
          const active = category === entry.key;
          return (
            <button
              key={entry.key}
              type="button"
              onClick={() => setCategory(active ? "" : entry.key)}
              className={`inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-xs font-black transition ${
                active ? "bg-kx-accent text-white shadow" : `${style.softBg} ${style.text} hover:opacity-80`
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {kindLabel(entry.label, style, locale)}
            </button>
          );
        })}
      </nav>

      <main className="px-4 pb-16 sm:px-6">
        {events.isError ? (
          <ErrorState onRetry={() => events.refetch()} />
        ) : events.isLoading || !events.data ? (
          <InlineLoading />
        ) : events.data.items.length === 0 ? (
          <EmptyState
            title={when === "past" ? c.emptyPast : c.emptyUpcoming}
            subtitle={c.emptySubtitle}
            icon={CalendarPlus}
            action={{ label: c.create, href: "/events/create" }}
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {events.data.items.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        )}
      </main>
    </AppShell>
  );
}
