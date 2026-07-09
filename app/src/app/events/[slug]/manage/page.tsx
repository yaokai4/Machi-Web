"use client";

// 活动管理 —— 主办方 / 管理员的后台:编辑基本信息、精选(仅管理员)、
// 自由增删改报名表单字段(保留旧字段 id,已有答案不丢)、查看完整报名
// 名单(含每人的表单答案)、取消活动。

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, Hourglass, Loader2, Plus, Save, Settings2, Star, Trash2, Users2, XCircle } from "lucide-react";
import { AppShell } from "@/components/shell/AppShell";
import { ErrorState, InlineLoading } from "@/components/design/States";
import { Avatar } from "@/components/design/Avatar";
import { api } from "@/lib/api";
import { useSessionUser } from "@/lib/session";
import { useI18n } from "@/lib/i18n";
import { socialCopy } from "@/components/social/socialStyle";
import type { KXEventFormField } from "@/lib/types";

interface DraftField {
  id?: string;
  key: number;
  label: string;
  field_type: string;
  optionsText: string;
  required: boolean;
}

export default function EventManagePage() {
  const params = useParams<{ slug: string }>();
  const slug = decodeURIComponent(params.slug);
  const router = useRouter();
  const queryClient = useQueryClient();
  const viewer = useSessionUser();
  const { locale } = useI18n();
  const c = socialCopy(locale).events;

  const eventQuery = useQuery({ queryKey: ["event", slug], queryFn: () => api.event(slug) });
  const event = eventQuery.data;
  const canManage = !!viewer && !!event && (viewer.id === event.organizer_user_id || viewer.role === "admin");
  const isAdmin = viewer?.role === "admin";

  const attendeesQuery = useQuery({
    queryKey: ["event-attendees", slug],
    queryFn: () => api.eventAttendees(slug),
    enabled: canManage,
  });

  // 基本信息草稿
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [description, setDescription] = useState("");
  const [venueName, setVenueName] = useState("");
  const [address, setAddress] = useState("");
  const [capacity, setCapacity] = useState("");
  const [priceText, setPriceText] = useState("");
  const [fields, setFields] = useState<DraftField[]>([]);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!event) return;
    setTitle(event.title);
    setSubtitle(event.subtitle ?? "");
    setDescription(event.description ?? "");
    setVenueName(event.venue_name ?? "");
    setAddress(event.address ?? "");
    setCapacity(event.capacity ? String(event.capacity) : "");
    setPriceText(event.price_text ?? "");
    setFields((event.form_fields ?? []).map((f: KXEventFormField, i: number) => ({
      id: f.id,
      key: i,
      label: f.label,
      field_type: f.field_type ?? "text",
      optionsText: (f.options ?? []).join(", "),
      required: !!f.required,
    })));
  }, [event]);

  const save = useMutation({
    mutationFn: () => api.updateEvent(slug, {
      title: title.trim(),
      subtitle: subtitle.trim(),
      description: description.trim(),
      venue_name: venueName.trim(),
      address: address.trim(),
      capacity: capacity ? Math.max(0, parseInt(capacity, 10) || 0) : 0,
      price_text: priceText.trim(),
      form_fields: fields
        .filter((f) => f.label.trim())
        .map((f, index) => ({
          ...(f.id ? { id: f.id } : {}),
          label: f.label.trim(),
          field_type: f.field_type,
          options: f.field_type === "select" ? f.optionsText.split(/[,，、/]+/).map((s) => s.trim()).filter(Boolean) : [],
          required: f.required,
          sort_order: index,
        })),
    }),
    onSuccess: (updated) => {
      queryClient.setQueryData(["event", slug], updated);
      queryClient.invalidateQueries({ queryKey: ["event-attendees", slug] });
      setMessage(c.saved);
      setTimeout(() => setMessage(""), 2000);
    },
    onError: (err: Error) => setMessage(err.message || c.saveError),
  });

  const toggleFeatured = useMutation({
    mutationFn: () => api.updateEvent(slug, { is_featured: !event?.is_featured }),
    onSuccess: (updated) => queryClient.setQueryData(["event", slug], updated),
  });

  const cancelEvent = useMutation({
    mutationFn: () => api.updateEvent(slug, { status: "cancelled" }),
    onSuccess: (updated) => queryClient.setQueryData(["event", slug], updated),
  });

  if (eventQuery.isError) {
    return (
      <AppShell requireAuth right={null}>
        <div className="px-4 py-10"><ErrorState onRetry={() => eventQuery.refetch()} /></div>
      </AppShell>
    );
  }
  if (eventQuery.isLoading || !event) {
    return <AppShell requireAuth right={null}><InlineLoading /></AppShell>;
  }
  if (!canManage) {
    return (
      <AppShell requireAuth right={null}>
        <div className="px-4 py-16 text-center text-sm font-bold text-kx-muted">{c.manageNoPermission}</div>
      </AppShell>
    );
  }

  const attendees = attendeesQuery.data;

  return (
    <AppShell requireAuth wide right={null}>
      <header className="kx-glass-bar sticky top-0 z-30 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/events/${encodeURIComponent(slug)}`} className="inline-flex items-center gap-1 rounded-full bg-kx-soft px-3 py-1.5 text-xs font-black text-kx-muted hover:text-kx-text">
            <ArrowLeft className="h-3.5 w-3.5" /> {c.backToEvent}
          </Link>
          <Settings2 className="h-5 w-5 text-kx-accent" />
          <h1 className="truncate text-lg font-black">{event.title}</h1>
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-black ${event.status === "published" ? "bg-emerald-500/10 text-emerald-600" : "bg-kx-soft text-kx-muted"}`}>
            {event.status === "published" ? c.statusPublished : event.status === "draft" ? c.statusDraft : c.statusCancelled}
          </span>
          <div className="ml-auto flex items-center gap-2">
            {isAdmin ? (
              <button
                type="button"
                onClick={() => toggleFeatured.mutate()}
                className={`inline-flex h-9 items-center gap-1 rounded-full px-3.5 text-xs font-black transition ${
                  event.is_featured ? "bg-amber-400/20 text-amber-600" : "bg-kx-soft text-kx-muted hover:text-kx-text"
                }`}
              >
                <Star className="h-3.5 w-3.5" />
                {event.is_featured ? c.featuredOn : c.featuredSet}
              </button>
            ) : null}
            <button
              type="button"
              disabled={save.isPending}
              onClick={() => save.mutate()}
              className="kx-button-primary inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-xs font-black disabled:opacity-50"
            >
              {save.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              {c.save}
            </button>
          </div>
        </div>
        {message ? <p className="mt-1 text-xs font-bold text-kx-accent">{message}</p> : null}
      </header>

      <main className="grid grid-cols-1 gap-5 px-4 py-5 lg:grid-cols-2">
        {/* 左:编辑 */}
        <div className="space-y-5">
          <section className="kx-card space-y-4 p-4 sm:p-5">
            <p className="text-xs font-black uppercase tracking-wider text-kx-muted">{c.basicInfo}</p>
            <label className="block space-y-1.5">
              <span className="text-xs font-black text-kx-muted">{c.fName}</span>
              <input className="kx-input font-bold" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-black text-kx-muted">{c.mSubtitle}</span>
              <input className="kx-input" value={subtitle} onChange={(e) => setSubtitle(e.target.value)} maxLength={200} />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-black text-kx-muted">{c.mDesc}</span>
              <textarea className="kx-input min-h-[120px] resize-y py-3" value={description} onChange={(e) => setDescription(e.target.value)} />
            </label>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="block space-y-1.5">
                <span className="text-xs font-black text-kx-muted">{c.fVenue}</span>
                <input className="kx-input" value={venueName} onChange={(e) => setVenueName(e.target.value)} maxLength={160} />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-black text-kx-muted">{c.mAddress}</span>
                <input className="kx-input" value={address} onChange={(e) => setAddress(e.target.value)} maxLength={300} />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-black text-kx-muted">{c.mCapacity}</span>
                <input type="number" min={0} className="kx-input" value={capacity} onChange={(e) => setCapacity(e.target.value)} />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-black text-kx-muted">{c.fPrice}</span>
                <input className="kx-input" value={priceText} onChange={(e) => setPriceText(e.target.value)} maxLength={60} />
              </label>
            </div>
          </section>

          <section className="kx-card space-y-4 p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-wider text-kx-muted">{c.formFieldsTitle}</p>
                <p className="mt-0.5 text-[11px] font-semibold text-kx-muted/80">{c.formFieldsHintManage}</p>
              </div>
              <button
                type="button"
                onClick={() => setFields((prev) => [...prev, { key: Date.now(), label: "", field_type: "text", optionsText: "", required: false }])}
                className="inline-flex h-9 items-center gap-1 rounded-full bg-kx-accent/10 px-3 text-xs font-black text-kx-accent hover:bg-kx-accent/15"
              >
                <Plus className="h-3.5 w-3.5" /> {c.addField}
              </button>
            </div>
            {fields.length === 0 ? (
              <p className="text-xs font-semibold text-kx-muted">{c.noFieldsManage}</p>
            ) : (
              <div className="space-y-3">
                {fields.map((field, index) => (
                  <div key={field.key} className="space-y-2 rounded-2xl border border-kx-stroke/50 p-3">
                    <div className="flex items-center gap-2">
                      <input
                        className="kx-input h-10 flex-1"
                        value={field.label}
                        onChange={(e) => setFields((prev) => prev.map((f, i) => (i === index ? { ...f, label: e.target.value } : f)))}
                        placeholder={c.fieldNamePlaceholderManage}
                        maxLength={120}
                      />
                      <button
                        type="button"
                        onClick={() => setFields((prev) => prev.filter((_, i) => i !== index))}
                        className="rounded-full p-2 text-kx-muted hover:bg-kx-soft hover:text-kx-heat"
                        aria-label={c.removeField}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs font-black">
                      {(["text", "select", "checkbox"] as const).map((kind) => (
                        <button
                          key={kind}
                          type="button"
                          onClick={() => setFields((prev) => prev.map((f, i) => (i === index ? { ...f, field_type: kind } : f)))}
                          className={`rounded-full px-3 py-1.5 transition ${field.field_type === kind ? "bg-kx-accent text-white" : "bg-kx-soft text-kx-muted hover:text-kx-text"}`}
                        >
                          {kind === "text" ? c.ftText : kind === "select" ? c.ftSelect : c.ftCheckbox}
                        </button>
                      ))}
                      <label className="ml-auto inline-flex cursor-pointer items-center gap-1.5">
                        <input
                          type="checkbox"
                          checked={field.required}
                          onChange={(e) => setFields((prev) => prev.map((f, i) => (i === index ? { ...f, required: e.target.checked } : f)))}
                          className="h-3.5 w-3.5 accent-[rgb(var(--kx-accent))]"
                        />
                        {c.required}
                      </label>
                    </div>
                    {field.field_type === "select" ? (
                      <input
                        className="kx-input h-10"
                        value={field.optionsText}
                        onChange={(e) => setFields((prev) => prev.map((f, i) => (i === index ? { ...f, optionsText: e.target.value } : f)))}
                        placeholder={c.optionsPlaceholderManage}
                      />
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </section>

          {event.status !== "cancelled" ? (
            <button
              type="button"
              onClick={() => { if (confirm(c.cancelEventConfirm)) cancelEvent.mutate(); }}
              className="inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-full border border-kx-heat/40 text-sm font-black text-kx-heat transition hover:bg-kx-heat/10"
            >
              <XCircle className="h-4 w-4" /> {c.cancelEvent}
            </button>
          ) : null}
        </div>

        {/* 右:报名名单 */}
        <section className="kx-card self-start p-4 sm:p-5">
          <div className="flex items-center gap-2">
            <Users2 className="h-4 w-4 text-kx-accent" />
            <h2 className="text-sm font-black">{c.attendeeList}</h2>
            {attendees ? <span className="text-xs font-bold text-kx-muted">{c.peopleCount(attendees.total)}</span> : null}
          </div>
          {attendeesQuery.isLoading ? (
            <InlineLoading />
          ) : !attendees || attendees.items.length === 0 ? (
            <p className="mt-4 text-sm font-semibold text-kx-muted">{c.noAttendees}</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {attendees.items.map((entry) => (
                <li key={entry.user.id} className="rounded-2xl border border-kx-stroke/45 p-3">
                  <div className="flex items-center gap-2.5">
                    <Avatar user={entry.user} size={34} href={`/u/${entry.user.handle}`} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-black">{entry.user.display_name}</p>
                      <p className="truncate text-xs font-semibold text-kx-muted">@{entry.user.handle}</p>
                    </div>
                    {entry.status === "going" ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-1 text-[11px] font-black text-emerald-600">
                        <Check className="h-3 w-3" /> {c.statusGoing}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/15 px-2 py-1 text-[11px] font-black text-amber-600">
                        <Hourglass className="h-3 w-3" /> {c.statusWaitlist}
                      </span>
                    )}
                  </div>
                  {entry.answers && Object.keys(entry.answers).length > 0 ? (
                    <dl className="mt-2 space-y-1 border-t border-kx-stroke/40 pt-2 text-xs">
                      {(attendees.form_fields ?? []).map((field) =>
                        entry.answers?.[field.id] ? (
                          <div key={field.id} className="flex gap-2">
                            <dt className="shrink-0 font-black text-kx-muted">{field.label}:</dt>
                            <dd className="font-semibold">{entry.answers[field.id] === "true" ? c.yes : entry.answers[field.id]}</dd>
                          </div>
                        ) : null,
                      )}
                    </dl>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </AppShell>
  );
}
