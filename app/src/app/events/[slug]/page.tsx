"use client";

// 活动详情 —— Machi 版 Luma 活动页(一比一的精致度,Machi 的品牌语言):
// 模糊封面做整页氛围底 + 左封面右信息的双栏(移动端纵向堆叠)+
// 粘性报名卡(名额/候补/已报名态)+ 动态报名表单 + 主办方/参加者/详情。
// 全新路由,不动任何既有页面样式。

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, ArrowUpRight, CalendarDays, Check, Hourglass, MapPin,
  Settings2, Sparkles, Star, Ticket, Trash2, Users2, X,
} from "lucide-react";
import { AppShell } from "@/components/shell/AppShell";
import { ErrorState, InlineLoading } from "@/components/design/States";
import { Avatar } from "@/components/design/Avatar";
import { api } from "@/lib/api";
import { sameOriginApiUrl } from "@/lib/media";
import { useSessionUser } from "@/lib/session";
import type { KXEvent, KXEventFormField } from "@/lib/types";
import { dateBadge, eventStyle, eventTimeLine } from "@/components/social/socialStyle";
import { ShareButton } from "@/components/social/ShareButton";

function RegistrationModal({
  event, onClose, onDone,
}: {
  event: KXEvent;
  onClose: () => void;
  onDone: (updated: KXEvent) => void;
}) {
  const fields = useMemo(() => event.form_fields ?? [], [event.form_fields]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [error, setError] = useState("");

  const register = useMutation({
    mutationFn: () => {
      const cleaned = Object.fromEntries(Object.entries(answers).filter(([, v]) => v.trim() !== ""));
      return api.registerForEvent(event.slug || event.id, cleaned);
    },
    onSuccess: (data) => onDone(data.event),
    onError: (err: Error) => setError(err.message || "报名失败,稍后再试"),
  });

  const missingRequired = fields.some((f) => f.required && !(answers[f.id] ?? "").trim());

  function fieldControl(field: KXEventFormField) {
    if (field.field_type === "select") {
      return (
        <div className="flex flex-wrap gap-1.5">
          {(field.options ?? []).map((option) => {
            const active = answers[field.id] === option;
            return (
              <button
                key={option}
                type="button"
                onClick={() => setAnswers((prev) => ({ ...prev, [field.id]: active ? "" : option }))}
                className={`rounded-full px-3 py-1.5 text-xs font-black transition ${
                  active ? "bg-kx-accent text-white shadow" : "bg-kx-soft text-kx-text hover:bg-kx-accent/10"
                }`}
              >
                {option}
              </button>
            );
          })}
        </div>
      );
    }
    if (field.field_type === "checkbox") {
      const on = answers[field.id] === "true";
      return (
        <button
          type="button"
          onClick={() => setAnswers((prev) => ({ ...prev, [field.id]: on ? "" : "true" }))}
          className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-black transition ${
            on ? "bg-kx-accent text-white shadow" : "bg-kx-soft text-kx-text hover:bg-kx-accent/10"
          }`}
        >
          <Check className={`h-3.5 w-3.5 ${on ? "" : "opacity-30"}`} />
          {on ? "是" : "否"}
        </button>
      );
    }
    return (
      <input
        className="kx-input"
        value={answers[field.id] ?? ""}
        onChange={(e) => setAnswers((prev) => ({ ...prev, [field.id]: e.target.value }))}
        placeholder={field.label}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-0 backdrop-blur-sm sm:items-center sm:p-6" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full overflow-y-auto rounded-t-3xl bg-kx-bg p-5 shadow-2xl sm:max-w-md sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-black">报名信息</h2>
            <p className="mt-0.5 line-clamp-1 text-xs font-semibold text-kx-muted">{event.title}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-2 text-kx-muted hover:bg-kx-soft" aria-label="关闭">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-4 space-y-4">
          {fields.map((field) => (
            <label key={field.id} className="block space-y-1.5">
              <span className="text-xs font-black text-kx-muted">
                {field.label}
                {field.required ? <span className="ml-0.5 text-red-500">*</span> : null}
              </span>
              {fieldControl(field)}
            </label>
          ))}
          {error ? <p className="text-xs font-bold text-red-500">{error}</p> : null}
          <button
            type="button"
            disabled={missingRequired || register.isPending}
            onClick={() => register.mutate()}
            className="kx-button-primary h-12 w-full rounded-full text-sm font-black disabled:opacity-50"
          >
            {register.isPending ? "提交中…" : event.is_full ? "加入候补" : "确认报名"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function EventDetailPage() {
  const params = useParams<{ slug: string }>();
  const slug = decodeURIComponent(params.slug);
  const router = useRouter();
  const queryClient = useQueryClient();
  const viewer = useSessionUser();
  const [modalOpen, setModalOpen] = useState(false);

  const query = useQuery({
    queryKey: ["event", slug],
    queryFn: () => api.event(slug),
    staleTime: 15_000,
  });
  const event = query.data;

  const cancelRegistration = useMutation({
    mutationFn: () => api.cancelEventRegistration(slug),
    onSuccess: (data) => queryClient.setQueryData(["event", slug], data.event),
  });
  const quickRegister = useMutation({
    mutationFn: () => api.registerForEvent(slug, {}),
    onSuccess: (data) => queryClient.setQueryData(["event", slug], data.event),
  });
  const removeEvent = useMutation({
    mutationFn: () => api.deleteEvent(slug),
    onSuccess: () => router.push("/events"),
  });

  function handleRegister() {
    if (!viewer) {
      router.push(`/login?redirect=${encodeURIComponent(`/events/${slug}`)}`);
      return;
    }
    if ((event?.form_fields ?? []).length > 0) {
      setModalOpen(true);
    } else {
      quickRegister.mutate();
    }
  }

  if (query.isError) {
    return (
      <AppShell requireAuth={false} wide right={null}>
        <div className="px-4 py-10"><ErrorState onRetry={() => query.refetch()} /></div>
      </AppShell>
    );
  }
  if (query.isLoading || !event) {
    return (
      <AppShell requireAuth={false} wide right={null}>
        <InlineLoading />
      </AppShell>
    );
  }

  const style = eventStyle(event.category);
  const Icon = style.icon;
  const badge = dateBadge(event.starts_at);
  const going = event.going_count ?? 0;
  const capacity = event.capacity ?? 0;
  const spotsLeft = capacity > 0 ? Math.max(0, capacity - going) : null;
  const isOrganizer = viewer && viewer.id === event.organizer_user_id;
  const canManage = isOrganizer || viewer?.role === "admin";
  const ended = (() => {
    const anchor = event.ends_at || event.starts_at;
    if (!anchor) return false;
    const date = new Date(anchor);
    return !Number.isNaN(date.getTime()) && date.getTime() < Date.now();
  })();
  const coverSrc = event.cover_url ? sameOriginApiUrl(event.cover_url) : null;
  const shareUrl = typeof window !== "undefined" ? window.location.href : `/events/${slug}`;

  return (
    <AppShell requireAuth={false} wide right={null}>
      {/* Luma 签名式:封面做整页模糊氛围底 */}
      <div className="relative">
        {coverSrc ? (
          <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[420px] overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={coverSrc} alt="" className="h-full w-full scale-110 object-cover opacity-30 blur-3xl" aria-hidden />
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-kx-bg/60 to-kx-bg" />
          </div>
        ) : (
          <div className={`pointer-events-none absolute inset-x-0 top-0 -z-10 h-[420px] overflow-hidden opacity-25 blur-3xl bg-gradient-to-br ${style.gradient}`} />
        )}

        <div className="mx-auto max-w-5xl px-4 pb-16 pt-4 sm:px-6">
          <div className="mb-4 flex items-center justify-between">
            <Link href="/events" className="inline-flex items-center gap-1.5 rounded-full bg-kx-card/85 px-3.5 py-2 text-xs font-black shadow-sm backdrop-blur hover:bg-kx-card">
              <ArrowLeft className="h-3.5 w-3.5" />
              全部活动
            </Link>
            <div className="flex items-center gap-2">
              {canManage ? (
                <>
                  <Link
                    href={`/events/${encodeURIComponent(event.slug || event.id)}/manage`}
                    className="inline-flex items-center gap-1.5 rounded-full bg-kx-card/85 px-3.5 py-2 text-xs font-black shadow-sm backdrop-blur hover:bg-kx-card"
                  >
                    <Settings2 className="h-3.5 w-3.5" />
                    管理
                  </Link>
                  <button
                    type="button"
                    onClick={() => { if (confirm(`删除活动「${event.title}」?已报名的人会看到活动已取消。`)) removeEvent.mutate(); }}
                    className="inline-flex items-center gap-1.5 rounded-full bg-kx-card/85 px-3.5 py-2 text-xs font-black text-kx-heat shadow-sm backdrop-blur hover:bg-kx-heat/10"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    删除
                  </button>
                </>
              ) : null}
              <ShareButton url={shareUrl} title={event.title} text={event.subtitle || undefined} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
            {/* 左列:封面 + 详情 */}
            <div className="space-y-6">
              <div className="relative overflow-hidden rounded-3xl shadow-xl ring-1 ring-black/5">
                {coverSrc ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={coverSrc} alt={event.title} className="aspect-[4/3] w-full object-cover sm:aspect-[16/10]" />
                ) : (
                  <div className={`flex aspect-[4/3] w-full items-center justify-center bg-gradient-to-br sm:aspect-[16/10] ${style.gradient}`}>
                    <Icon className="h-20 w-20 text-white/85" />
                  </div>
                )}
                {badge ? (
                  <div className="absolute left-4 top-4 flex w-14 flex-col items-center rounded-2xl bg-white/94 py-2 shadow-lg backdrop-blur dark:bg-black/72">
                    <span className="text-[11px] font-black leading-none text-red-500">{badge.month}</span>
                    <span className="mt-1 text-2xl font-black leading-none">{badge.day}</span>
                  </div>
                ) : null}
              </div>

              {event.description ? (
                <section className="kx-card p-5 sm:p-6">
                  <h2 className="text-sm font-black uppercase tracking-wider text-kx-muted">活动详情</h2>
                  <div className="mt-3 whitespace-pre-wrap text-[15px] leading-7">{event.description}</div>
                </section>
              ) : null}
            </div>

            {/* 右列:标题 + 粘性信息卡 */}
            <div className="space-y-4 lg:sticky lg:top-6 lg:self-start">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-black ${style.softBg} ${style.text}`}>
                  <Icon className="h-3 w-3" />
                  {event.category_label || style.labelZh}
                </span>
                {event.is_featured ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/20 px-2.5 py-1 text-[11px] font-black text-amber-600">
                    <Star className="h-3 w-3" /> Machi 精选
                  </span>
                ) : null}
                {event.partner_name ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-kx-soft px-2.5 py-1 text-[11px] font-black text-kx-muted">
                    <Sparkles className="h-3 w-3" /> {event.partner_name}
                  </span>
                ) : null}
              </div>

              <h1 className="text-2xl font-black leading-tight sm:text-3xl">{event.title}</h1>
              {event.subtitle ? <p className="text-sm font-semibold text-kx-muted">{event.subtitle}</p> : null}

              <div className="kx-card divide-y divide-kx-stroke/40">
                <div className="flex items-start gap-3 p-4">
                  <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${style.softBg}`}>
                    <CalendarDays className={`h-5 w-5 ${style.text}`} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-black">{eventTimeLine(event.starts_at, event.ends_at)}</p>
                    <p className="mt-0.5 text-xs font-semibold text-kx-muted">{event.timezone || "Asia/Tokyo"}</p>
                  </div>
                </div>
                {(event.venue_name || event.address) ? (
                  <div className="flex items-start gap-3 p-4">
                    <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${style.softBg}`}>
                      <MapPin className={`h-5 w-5 ${style.text}`} />
                    </div>
                    <div className="min-w-0">
                      {event.venue_name ? <p className="text-sm font-black">{event.venue_name}</p> : null}
                      {event.address ? (
                        <a
                          className="mt-0.5 block text-xs font-semibold text-kx-muted underline-offset-2 hover:underline"
                          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.address || event.venue_name || "")}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {event.address}
                        </a>
                      ) : null}
                    </div>
                  </div>
                ) : null}
                {event.organizer ? (
                  <div className="flex items-center gap-3 p-4">
                    <Avatar user={event.organizer} size={44} href={`/u/${event.organizer.handle}`} />
                    <div className="min-w-0">
                      <p className="text-[11px] font-black uppercase tracking-wider text-kx-muted">主办方</p>
                      <p className="truncate text-sm font-black">{event.organizer.display_name}</p>
                    </div>
                  </div>
                ) : null}
              </div>

              {/* 报名卡 */}
              <div className="kx-card p-4 sm:p-5">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-black uppercase tracking-wider text-kx-muted">报名</p>
                  {event.price_text ? <p className="text-sm font-black text-kx-heat">{event.price_text}</p> : null}
                </div>
                <div className="mt-2">
                  {event.viewer_status === "going" ? (
                    <p className="inline-flex items-center gap-1.5 text-sm font-black text-kx-accent">
                      <Check className="h-4 w-4" /> 你已报名这场活动
                    </p>
                  ) : event.viewer_status === "waitlist" ? (
                    <p className="inline-flex items-center gap-1.5 text-sm font-black text-amber-600">
                      <Hourglass className="h-4 w-4" /> 已进入候补,有空位自动顶上
                    </p>
                  ) : spotsLeft !== null ? (
                    <p className={`text-sm font-black ${spotsLeft > 0 ? "text-kx-accent" : "text-kx-heat"}`}>
                      {spotsLeft > 0 ? `还剩 ${spotsLeft} 个名额` : "名额已满,可加入候补"}
                    </p>
                  ) : (
                    <p className="text-sm font-semibold text-kx-muted">名额不限,来就完事了</p>
                  )}
                </div>

                {going > 0 ? (
                  <div className="mt-3 flex items-center gap-2.5">
                    <div className="flex -space-x-2">
                      {(event.attendees_preview ?? []).slice(0, 8).map((user) => (
                        <div key={user.id} className="rounded-full ring-2 ring-kx-card">
                          <Avatar user={user} size={28} />
                        </div>
                      ))}
                    </div>
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-kx-muted">
                      <Users2 className="h-3.5 w-3.5" /> {going} 人参加
                    </span>
                  </div>
                ) : null}

                <div className="mt-4 space-y-2">
                  {event.status === "cancelled" ? (
                    <div className="grid h-12 place-items-center rounded-full bg-kx-soft text-sm font-black text-kx-muted">活动已取消</div>
                  ) : ended ? (
                    <div className="grid h-12 place-items-center rounded-full bg-kx-soft text-sm font-black text-kx-muted">活动已结束</div>
                  ) : isOrganizer ? (
                    <div className="grid h-12 place-items-center rounded-full bg-kx-soft text-sm font-black text-kx-muted">你是这场活动的主办方</div>
                  ) : event.viewer_status === "going" || event.viewer_status === "waitlist" ? (
                    <button
                      type="button"
                      onClick={() => cancelRegistration.mutate()}
                      disabled={cancelRegistration.isPending}
                      className="h-12 w-full rounded-full bg-kx-soft text-sm font-black text-kx-heat transition hover:bg-kx-heat/10 disabled:opacity-50"
                    >
                      {cancelRegistration.isPending ? "取消中…" : "取消报名"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleRegister}
                      disabled={quickRegister.isPending}
                      className="kx-button-primary h-12 w-full rounded-full text-sm font-black disabled:opacity-60"
                    >
                      {quickRegister.isPending ? "报名中…" : event.is_full ? "加入候补" : "报名参加"}
                    </button>
                  )}
                  {event.external_url ? (
                    <a
                      href={event.external_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-full border border-kx-stroke/70 text-xs font-black text-kx-text transition hover:bg-kx-soft"
                    >
                      <Ticket className="h-3.5 w-3.5" />
                      合作方售票 / 详情页
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    </a>
                  ) : null}
                </div>
                <p className="mt-3 text-center text-[11px] font-semibold text-kx-muted/80">
                  Machi 不代收任何费用;付费活动请以合作方页面为准。
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {modalOpen ? (
        <RegistrationModal
          event={event}
          onClose={() => setModalOpen(false)}
          onDone={(updated) => {
            queryClient.setQueryData(["event", slug], updated);
            setModalOpen(false);
          }}
        />
      ) : null}
    </AppShell>
  );
}
