"use client";

// 房间内部 —— 一个聊天大厅。核心是「聊天」:顶部一条紧凑的局信息,中间是
// 定高、内部滚动的消息区(不会把页面越撑越长),底部固定输入框。没加入也能
// 围观,想说话先「加入这个局」。聊天走 8s 轮询(与 iOS 同步)。

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, CalendarClock, ChevronDown, ChevronUp, Crown, Loader2, LogOut, MapPin, MessageCircle,
  SendHorizonal, Trash2, UserPlus, Users,
} from "lucide-react";
import { AppShell } from "@/components/shell/AppShell";
import { ErrorState, InlineLoading } from "@/components/design/States";
import { Avatar } from "@/components/design/Avatar";
import { api } from "@/lib/api";
import type { KXRoomMessage } from "@/lib/types";
import { useSessionUser } from "@/lib/session";
import { useI18n } from "@/lib/i18n";
import { kindLabel, longDayTime, relativeTime, roomStyle, socialCopy } from "@/components/social/socialStyle";
import { ShareButton } from "@/components/social/ShareButton";

export default function RoomDetailPage() {
  const params = useParams<{ roomId: string }>();
  const roomId = decodeURIComponent(params.roomId);
  const router = useRouter();
  const queryClient = useQueryClient();
  const viewer = useSessionUser();
  const { locale } = useI18n();
  const copy = socialCopy(locale);
  const c = copy.rooms;
  const [draft, setDraft] = useState("");
  const [actionError, setActionError] = useState("");
  const [showInfo, setShowInfo] = useState(false);
  // 向上翻历史:earlierPages 累积「加载更早」拉到的历史页(都比实时窗口更旧);
  // earlierBefore 是下一次要用的游标(undefined = 未开始,沿用实时窗口的 next_before;
  // null = 没有更早的了)。
  const [earlierPages, setEarlierPages] = useState<KXRoomMessage[]>([]);
  const [earlierBefore, setEarlierBefore] = useState<string | null | undefined>(undefined);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const messagesRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const didInitialScroll = useRef(false);
  // 预记录 scrollHeight,prepend 更早消息后据此把用户锚回原来看的位置(不跳顶)。
  const restoreScrollRef = useRef<number | null>(null);

  const roomQuery = useQuery({
    queryKey: ["room", roomId],
    queryFn: () => api.room(roomId),
    refetchInterval: 15_000,
  });
  const messagesQuery = useQuery({
    queryKey: ["room-messages", roomId],
    queryFn: () => api.roomMessages(roomId, { limit: 80 }),
    refetchInterval: 8_000,
  });

  const room = roomQuery.data;
  const liveItems = useMemo(() => messagesQuery.data?.items ?? [], [messagesQuery.data]);
  const liveNextBefore = messagesQuery.data?.next_before ?? null;
  // 实时窗口(最新 80 条)+ 已加载的更早历史,按 (created_at, id) 升序去重合并。
  const messages = useMemo(() => {
    const map = new Map<string, KXRoomMessage>();
    for (const m of earlierPages) map.set(m.id, m);
    for (const m of liveItems) map.set(m.id, m);
    return Array.from(map.values()).sort((a, b) => {
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
      if (ta !== tb) return ta - tb;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
  }, [earlierPages, liveItems]);
  // 未翻过历史时沿用实时窗口给的游标;翻过之后用最后一页的游标。null = 到头了。
  const effectiveBefore = earlierBefore === undefined ? liveNextBefore : earlierBefore;
  const canLoadEarlier = !!effectiveBefore;
  const joined = !!room?.viewer_joined;
  const isHost = room?.viewer_role === "host";

  const earlierCopy = {
    load:
      locale === "ja" ? "以前のメッセージを表示"
      : locale === "en" ? "Load earlier messages"
      : locale === "zh-Hant" ? "載入更早的訊息"
      : "加载更早的消息",
    loading:
      locale === "ja" ? "読み込み中…"
      : locale === "en" ? "Loading…"
      : locale === "zh-Hant" ? "載入中…"
      : "加载中…",
  };

  async function loadEarlier() {
    if (loadingEarlier) return;
    const before = effectiveBefore;
    if (!before) return;
    const el = messagesRef.current;
    if (el) restoreScrollRef.current = el.scrollHeight;
    setLoadingEarlier(true);
    try {
      const page = await api.roomMessages(roomId, { before, limit: 40 });
      setEarlierPages((prev) => {
        const seen = new Set(prev.map((m) => m.id));
        const fresh = (page.items ?? []).filter((m) => !seen.has(m.id));
        return [...fresh, ...prev];
      });
      setEarlierBefore(page.next_before ?? null);
    } catch (err) {
      restoreScrollRef.current = null;
      setActionError((err as Error).message || c.opError);
    } finally {
      setLoadingEarlier(false);
    }
  }

  function onMessagesScroll() {
    const el = messagesRef.current;
    if (!el) return;
    if (el.scrollTop < 120 && canLoadEarlier && !loadingEarlier) void loadEarlier();
  }

  // 切换房间时重置首帧滚动标记 + 历史分页状态(同一路由复用组件,ref/state 不自动清)。
  useEffect(() => {
    didInitialScroll.current = false;
    restoreScrollRef.current = null;
    setEarlierPages([]);
    setEarlierBefore(undefined);
    setLoadingEarlier(false);
  }, [roomId]);

  // prepend 更早消息后,把滚动位置锚回原处(内容在上方增长,scrollTop 要相应下移)。
  useLayoutEffect(() => {
    const el = messagesRef.current;
    if (el && restoreScrollRef.current != null) {
      el.scrollTop += el.scrollHeight - restoreScrollRef.current;
      restoreScrollRef.current = null;
    }
  }, [messages]);

  // 只滚动消息容器自身(不滚整页)。首帧无条件贴底,之后仅当用户本就贴近底部时
  // 才跟随新消息 —— 否则打开有历史的房间会停在最旧消息处(#1),翻历史也会被拽下去。
  useEffect(() => {
    const el = messagesRef.current;
    if (!el || messages.length === 0) return;
    if (!didInitialScroll.current) {
      didInitialScroll.current = true;
      bottomRef.current?.scrollIntoView({ block: "end" });
      return;
    }
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 200;
    if (nearBottom) bottomRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [messages.length]);

  const join = useMutation({
    mutationFn: () => api.joinRoom(roomId),
    onSuccess: (updated) => {
      queryClient.setQueryData(["room", roomId], updated);
      queryClient.invalidateQueries({ queryKey: ["room-messages", roomId] });
    },
    onError: (err: Error) => setActionError(err.message || c.joinError),
  });
  const leave = useMutation({
    mutationFn: () => api.leaveRoom(roomId),
    onSuccess: (updated) => {
      if (!updated) { router.push("/rooms"); return; }
      queryClient.setQueryData(["room", roomId], updated);
      queryClient.invalidateQueries({ queryKey: ["room-messages", roomId] });
    },
    onError: (err: Error) => setActionError(err.message || c.opError),
  });
  const remove = useMutation({
    mutationFn: () => api.deleteRoom(roomId),
    onSuccess: () => router.push("/rooms"),
    onError: (err: Error) => setActionError(err.message || c.deleteError),
  });
  const send = useMutation({
    mutationFn: (content: string) => api.sendRoomMessage(roomId, content),
    onSuccess: () => {
      setDraft("");
      queryClient.invalidateQueries({ queryKey: ["room-messages", roomId] });
    },
    onError: (err: Error) => setActionError(err.message || c.sendError),
  });

  function handleJoin() {
    if (!viewer) { router.push(`/login?redirect=${encodeURIComponent(`/rooms/${roomId}`)}`); return; }
    setActionError("");
    join.mutate();
  }

  if (roomQuery.isError) {
    return (
      <AppShell requireAuth={false} right={null}>
        <div className="px-4 py-10"><ErrorState onRetry={() => roomQuery.refetch()} /></div>
      </AppShell>
    );
  }
  if (roomQuery.isLoading || !room) {
    return <AppShell requireAuth={false} right={null}><InlineLoading /></AppShell>;
  }

  const style = roomStyle(room.room_type);
  const Icon = style.icon;
  const memberCount = room.member_count ?? room.members?.length ?? 1;
  const capacity = room.capacity ?? 0;
  const isOpen = (room.status ?? "open") === "open" || room.status === "full";
  const hasStart = !!room.starts_at && !Number.isNaN(new Date(room.starts_at).getTime());
  const shareUrl = typeof window !== "undefined" ? window.location.href : `/rooms/${roomId}`;

  return (
    <AppShell requireAuth={false} right={null} hideBottomNav>
      {/* 整页固定高度的聊天布局:头部 + 定高消息区 + 底部输入。 */}
      <div className="flex h-[100dvh] flex-col md:h-[calc(100dvh-0px)]">
        {/* 头部:紧凑局信息 */}
        <header className="kx-glass-bar shrink-0 px-3 py-2.5">
          <div className="flex items-center gap-2.5">
            <Link href="/rooms" className="rounded-full p-2 text-kx-muted transition hover:bg-kx-soft hover:text-kx-text" aria-label={copy.common.back}>
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <button type="button" onClick={() => setShowInfo((v) => !v)} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
              <div className={`relative grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br text-white ${style.gradient}`}>
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="truncate text-[15px] font-black leading-tight">{room.title}</h1>
                <p className="truncate text-xs font-semibold text-kx-muted">
                  {kindLabel(room.room_type_label, style, locale)} · {c.inRoom(memberCount, capacity)}
                </p>
              </div>
              <ChevronDown className={`h-4 w-4 shrink-0 text-kx-muted transition ${showInfo ? "rotate-180" : ""}`} />
            </button>
            <ShareButton url={shareUrl} title={room.title} compact />
            {joined ? (
              isHost ? (
                <button
                  type="button"
                  onClick={() => { if (confirm(c.dissolveConfirm)) remove.mutate(); }}
                  className="rounded-full p-2 text-kx-muted transition hover:bg-kx-heat/10 hover:text-kx-heat"
                  aria-label={c.dissolveAria}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => { if (confirm(c.leaveConfirm)) leave.mutate(); }}
                  className="rounded-full p-2 text-kx-muted transition hover:bg-kx-soft hover:text-kx-text"
                  aria-label={c.leaveAria}
                >
                  <LogOut className="h-4 w-4" />
                </button>
              )
            ) : null}
          </div>

          {/* 展开的局信息 */}
          {showInfo ? (
            <div className="mt-2.5 space-y-2 rounded-2xl border border-kx-stroke/45 bg-kx-card/60 p-3">
              {room.description ? <p className="text-sm font-semibold leading-6">{room.description}</p> : null}
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-kx-muted">
                {hasStart ? (
                  <span className="inline-flex items-center gap-1">
                    <CalendarClock className="h-3.5 w-3.5" />
                    {longDayTime(room.starts_at, locale)}
                  </span>
                ) : null}
                {room.location_hint ? (
                  <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{room.location_hint}</span>
                ) : null}
              </div>
              <div>
                <p className="mb-1.5 inline-flex items-center gap-1 text-[11px] font-black uppercase tracking-wider text-kx-muted">
                  <Users className="h-3.5 w-3.5" /> {c.peopleHere}
                </p>
                <div className="flex flex-wrap gap-2.5">
                  {(room.members ?? []).map((member) => (
                    <Link key={member.id} href={`/u/${member.handle}`} className="flex w-14 flex-col items-center gap-1">
                      <div className="relative">
                        <Avatar user={member} size={40} />
                        {member.id === room.host_user_id ? (
                          <span className="absolute -bottom-0.5 -right-0.5 grid h-4 w-4 place-items-center rounded-full bg-amber-400 ring-2 ring-kx-card" title={c.host}>
                            <Crown className="h-2.5 w-2.5 text-amber-900" />
                          </span>
                        ) : null}
                      </div>
                      <span className="w-full truncate text-center text-[11px] font-bold">{member.display_name}</span>
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
        </header>

        {/* 定高、内部滚动的消息区 */}
        <div ref={messagesRef} onScroll={onMessagesScroll} className="flex-1 space-y-3 overflow-y-auto px-3 py-4">
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-kx-muted">
              <MessageCircle className="h-8 w-8 opacity-40" />
              <p className="text-sm font-semibold">{joined ? c.emptyJoined : c.emptyGuest}</p>
            </div>
          ) : (
            <>
              {canLoadEarlier ? (
                <div className="flex justify-center pb-1">
                  <button
                    type="button"
                    onClick={() => void loadEarlier()}
                    disabled={loadingEarlier}
                    className="inline-flex items-center gap-1.5 rounded-full border border-kx-stroke/45 bg-kx-card/70 px-3.5 py-1.5 text-xs font-bold text-kx-muted transition hover:bg-kx-soft hover:text-kx-text disabled:opacity-50 dark:border-white/10 dark:bg-kx-card/60"
                  >
                    {loadingEarlier ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ChevronUp className="h-3.5 w-3.5" />}
                    {loadingEarlier ? earlierCopy.loading : earlierCopy.load}
                  </button>
                </div>
              ) : null}
              {messages.map((message) =>
              message.kind === "system" ? (
                <p key={message.id} className="text-center text-[11px] font-bold text-kx-muted/70">{message.content}</p>
              ) : (
                <div key={message.id} className={`flex gap-2.5 ${message.user?.id === viewer?.id ? "flex-row-reverse" : ""}`}>
                  <Avatar user={message.user ?? undefined} size={30} href={message.user ? `/u/${message.user.handle}` : undefined} />
                  <div className={`flex max-w-[75%] flex-col ${message.user?.id === viewer?.id ? "items-end" : "items-start"}`}>
                    {message.user?.id !== viewer?.id ? (
                      <p className="mb-0.5 text-[11px] font-black text-kx-muted">{message.user?.display_name}</p>
                    ) : null}
                    <div className={`inline-block rounded-2xl px-3.5 py-2 text-sm font-medium leading-relaxed ${message.user?.id === viewer?.id ? "bg-kx-accent text-white" : "bg-kx-soft"}`}>
                      {message.content}
                    </div>
                    <p className="mt-0.5 text-[10px] font-semibold text-kx-muted/70">{relativeTime(message.created_at, locale)}</p>
                  </div>
                </div>
              ),
              )}
            </>
          )}
          <div ref={bottomRef} />
        </div>

        {/* 底部固定操作:加入 or 发言 */}
        <div className="shrink-0 border-t border-kx-stroke/40 bg-kx-bg px-3 py-3">
          {actionError ? <p className="mb-2 text-xs font-bold text-red-500">{actionError}</p> : null}
          {joined ? (
            <form
              className="flex items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const content = draft.trim();
                if (content && !send.isPending && isOpen) send.mutate(content);
              }}
            >
              <input
                className="kx-input h-11 flex-1 rounded-full"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={isOpen ? c.sayPlaceholder : c.ended}
                maxLength={1000}
                disabled={!isOpen}
              />
              <button
                type="submit"
                disabled={!draft.trim() || send.isPending || !isOpen}
                className="kx-button-primary grid h-11 w-11 shrink-0 place-items-center rounded-full disabled:opacity-40"
                aria-label={copy.common.send}
              >
                <SendHorizonal className="h-4 w-4" />
              </button>
            </form>
          ) : isOpen ? (
            <button
              type="button"
              onClick={handleJoin}
              disabled={join.isPending || room.status === "full"}
              className="kx-button-primary inline-flex h-12 w-full items-center justify-center gap-2 rounded-full text-sm font-black disabled:opacity-50"
            >
              <UserPlus className="h-4 w-4" />
              {room.status === "full" ? c.fullLabel : join.isPending ? c.joining : c.join}
            </button>
          ) : (
            <p className="py-2 text-center text-sm font-semibold text-kx-muted">{c.ended}</p>
          )}
        </div>
      </div>
    </AppShell>
  );
}
