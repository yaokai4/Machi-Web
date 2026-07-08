"use client";

// 交友 · 约局 · 约饭 —— 搭子/即兴组队大厅。和活动(海报画廊)彻底不同:这里是
// 一个「聊天大厅」——紧凑的房间行,看得到里面有谁、还差几个、聊到哪,进来就说话。
// 无封面海报、无报名表,轻快即兴。与 iOS 端 SocialRoomsView 同步(同一套 /api/rooms)。

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CalendarClock, MapPin, MessageCircle, Plus, Users, X } from "lucide-react";
import { AppShell } from "@/components/shell/AppShell";
import { EmptyState, ErrorState, InlineLoading } from "@/components/design/States";
import { Avatar } from "@/components/design/Avatar";
import { api } from "@/lib/api";
import { useSessionUser } from "@/lib/session";
import type { KXRoom } from "@/lib/types";
import { parseISO, roomStyle, ROOM_TYPE_KEYS } from "@/components/social/socialStyle";

function RoomRow({ room }: { room: KXRoom }) {
  const style = roomStyle(room.room_type);
  const Icon = style.icon;
  const memberCount = room.member_count ?? room.members?.length ?? 1;
  const capacity = room.capacity ?? 0;
  const startsAt = parseISO(room.starts_at);
  const spotsLeft = capacity > 0 ? Math.max(0, capacity - memberCount) : null;
  return (
    <Link
      href={`/rooms/${encodeURIComponent(room.id)}`}
      className="group flex items-start gap-3.5 rounded-2xl border border-kx-stroke/45 bg-kx-card p-3.5 transition-all duration-200 hover:border-kx-accent/30 hover:shadow-[0_14px_34px_-24px_rgb(var(--kx-shadow)/0.5)]"
    >
      <div className={`relative grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br text-white ${style.gradient}`}>
        <Icon className="h-5 w-5" />
        {room.status === "open" ? (
          <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-kx-card bg-emerald-400" title="进行中" />
        ) : null}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-black ${style.softBg} ${style.text}`}>
            {room.room_type_label || style.labelZh}
          </span>
          {room.viewer_joined ? (
            <span className="shrink-0 rounded-full bg-kx-accent/10 px-2 py-0.5 text-[11px] font-black text-kx-accent">已加入</span>
          ) : null}
          <span className="ml-auto shrink-0 text-xs font-black text-kx-muted">
            {capacity > 0 ? (
              spotsLeft && spotsLeft > 0 ? <span className="text-kx-accent">还差 {spotsLeft} 人</span> : <span className="text-kx-heat">已满</span>
            ) : `${memberCount} 人`}
          </span>
        </div>
        <h3 className="mt-1 line-clamp-1 text-[15px] font-black leading-snug">{room.title}</h3>
        {room.description ? <p className="mt-0.5 line-clamp-1 text-xs font-semibold text-kx-muted">{room.description}</p> : null}
        <div className="mt-2 flex items-center gap-2">
          <div className="flex -space-x-1.5">
            {(room.members ?? []).slice(0, 5).map((member) => (
              <div key={member.id} className="rounded-full ring-2 ring-kx-card">
                <Avatar user={member} size={22} />
              </div>
            ))}
          </div>
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-kx-muted">
            <MessageCircle className="h-3.5 w-3.5" />
            {(room.message_count ?? 0) > 0 ? `${room.message_count} 条消息` : "进来开个头"}
          </span>
          {startsAt ? (
            <span className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-kx-muted/80">
              <CalendarClock className="h-3.5 w-3.5" />
              {startsAt.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" })}{" "}
              {startsAt.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false })}
            </span>
          ) : room.location_hint ? (
            <span className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-kx-muted/80">
              <MapPin className="h-3.5 w-3.5" />
              <span className="max-w-[110px] truncate">{room.location_hint}</span>
            </span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}

function CreateRoomModal({ onClose, onCreated }: { onClose: () => void; onCreated: (room: KXRoom) => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [roomType, setRoomType] = useState("meal");
  const [locationHint, setLocationHint] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [capacity, setCapacity] = useState("4");
  const [error, setError] = useState("");

  const create = useMutation({
    mutationFn: () => api.createRoom({
      title: title.trim(),
      description: description.trim(),
      room_type: roomType,
      country_code: "jp",
      location_hint: locationHint.trim(),
      starts_at: startsAt ? new Date(startsAt).toISOString() : "",
      capacity: capacity ? Math.max(0, parseInt(capacity, 10) || 0) : 0,
    }),
    onSuccess: onCreated,
    onError: (err: Error) => setError(err.message || "开局失败,稍后再试"),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 backdrop-blur-sm sm:items-center sm:p-6" onClick={onClose}>
      <div className="max-h-[88vh] w-full overflow-y-auto rounded-t-3xl bg-kx-bg p-5 shadow-2xl sm:max-w-md sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-black">开个局</h2>
            <p className="mt-0.5 text-xs font-semibold text-kx-muted">想找人一起做点什么?发出来,同城的人进来就能聊。</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-2 text-kx-muted hover:bg-kx-soft" aria-label="关闭">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-4 space-y-4">
          <div>
            <p className="mb-1.5 text-xs font-black text-kx-muted">想找什么搭子?</p>
            <div className="flex flex-wrap gap-1.5">
              {[...ROOM_TYPE_KEYS, "other"].map((key) => {
                const style = roomStyle(key);
                const Icon = style.icon;
                const active = roomType === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setRoomType(key)}
                    className={`inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-black transition ${
                      active ? "bg-kx-accent text-white shadow" : `${style.softBg} ${style.text} hover:opacity-80`
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {style.labelZh}
                  </button>
                );
              })}
            </div>
          </div>
          <label className="block space-y-1.5">
            <span className="text-xs font-black text-kx-muted">局的名字 <span className="text-red-500">*</span></span>
            <input className="kx-input font-bold" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例如 周五晚新宿吃烤肉,来仨人" maxLength={80} />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-black text-kx-muted">想说的话</span>
            <textarea className="kx-input min-h-[80px] resize-y py-2.5" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="预算、口味、见面方式…随便写" maxLength={1000} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1.5">
              <span className="text-xs font-black text-kx-muted">约定时间(可选)</span>
              <input type="datetime-local" className="kx-input" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-black text-kx-muted">人数上限(0 = 不限)</span>
              <input type="number" min={0} max={200} className="kx-input" value={capacity} onChange={(e) => setCapacity(e.target.value)} />
            </label>
          </div>
          <label className="block space-y-1.5">
            <span className="text-xs font-black text-kx-muted">大概位置(可选)</span>
            <input className="kx-input" value={locationHint} onChange={(e) => setLocationHint(e.target.value)} placeholder="例如 新宿站东口 / 涩谷附近" maxLength={120} />
          </label>
          {error ? <p className="text-xs font-bold text-red-500">{error}</p> : null}
          <button
            type="button"
            disabled={!title.trim() || create.isPending}
            onClick={() => create.mutate()}
            className="kx-button-primary h-12 w-full rounded-full text-sm font-black disabled:opacity-50"
          >
            {create.isPending ? "创建中…" : "开局"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function RoomsPage() {
  const router = useRouter();
  const viewer = useSessionUser();
  const [type, setType] = useState("");
  const [mine, setMine] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const rooms = useQuery({
    queryKey: ["rooms", type, mine],
    queryFn: () => api.rooms({ country_code: "jp", type: type || undefined, mine, limit: 50 }),
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  const typeChips = useMemo(() => {
    const server = rooms.data?.room_types ?? [];
    return server.length ? server.filter((t) => t.key !== "other") : ROOM_TYPE_KEYS.map((key) => ({ key, label: roomStyle(key).labelZh }));
  }, [rooms.data?.room_types]);

  function openCreate() {
    if (!viewer) {
      router.push(`/login?redirect=${encodeURIComponent("/rooms")}`);
      return;
    }
    setCreateOpen(true);
  }

  return (
    <AppShell requireAuth={false} wide right={null}>
      <header className="relative overflow-hidden px-4 pb-5 pt-8 sm:px-6">
        <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-indigo-500/15 blur-3xl" />
        <div className="pointer-events-none absolute -left-14 top-6 h-44 w-44 rounded-full bg-kx-accent/15 blur-3xl" />
        <div className="relative">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-kx-accent">Machi Rooms</p>
          <h1 className="mt-2 text-3xl font-black leading-tight sm:text-4xl">找个搭子,现在就约</h1>
          <p className="mt-2 max-w-xl text-sm font-semibold text-kx-muted">
            饭搭子、酒搭子、学习搭子、拼车……开一个局就像开一个游戏房间:进来就能看到有谁、聊到哪,直接说话约起来。
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button type="button" onClick={openCreate} className="kx-button-primary inline-flex h-11 items-center gap-2 rounded-full px-5 text-sm font-black">
              <Plus className="h-4 w-4" />
              开个局
            </button>
            <button
              type="button"
              onClick={() => setMine((v) => !v)}
              className={`inline-flex h-11 items-center gap-1.5 rounded-full px-4 text-xs font-black transition ${
                mine ? "bg-kx-accent text-white shadow" : "border border-kx-stroke/60 bg-kx-card/70 text-kx-muted hover:text-kx-text"
              }`}
            >
              <Users className="h-3.5 w-3.5" />
              我加入的
            </button>
          </div>
        </div>
      </header>

      <nav className="scrollbar-none flex gap-2 overflow-x-auto px-4 pb-4 sm:px-6">
        <button
          type="button"
          onClick={() => setType("")}
          className={`inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-xs font-black transition ${
            type === "" ? "bg-kx-accent text-white shadow" : "bg-kx-accent/10 text-kx-accent hover:bg-kx-accent/15"
          }`}
        >
          全部
        </button>
        {typeChips.map((entry) => {
          const style = roomStyle(entry.key);
          const Icon = style.icon;
          const active = type === entry.key;
          return (
            <button
              key={entry.key}
              type="button"
              onClick={() => setType(active ? "" : entry.key)}
              className={`inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-xs font-black transition ${
                active ? "bg-kx-accent text-white shadow" : `${style.softBg} ${style.text} hover:opacity-80`
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {entry.label || style.labelZh}
            </button>
          );
        })}
      </nav>

      <main className="mx-auto max-w-3xl px-4 pb-16 sm:px-6">
        {rooms.isError ? (
          <ErrorState onRetry={() => rooms.refetch()} />
        ) : rooms.isLoading || !rooms.data ? (
          <InlineLoading />
        ) : rooms.data.items.length === 0 ? (
          <EmptyState
            title={mine ? "你还没有加入任何局" : "还没有进行中的局"}
            subtitle="开一个局,喊大家一起吃饭、喝酒、打桌游。"
            icon={Users}
            action={{ label: "开个局", onClick: openCreate }}
          />
        ) : (
          <div className="space-y-2.5">
            {rooms.data.items.map((room) => (
              <RoomRow key={room.id} room={room} />
            ))}
          </div>
        )}
      </main>

      {createOpen ? (
        <CreateRoomModal
          onClose={() => setCreateOpen(false)}
          onCreated={(room) => {
            setCreateOpen(false);
            router.push(`/rooms/${encodeURIComponent(room.id)}`);
          }}
        />
      ) : null}
    </AppShell>
  );
}
