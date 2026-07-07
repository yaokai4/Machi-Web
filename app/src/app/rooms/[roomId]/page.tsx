"use client";

// 房间内部 —— 进来就像进了游戏房间:局的信息 + 在房间里的人 + 房间聊天。
// 没加入也能围观,想说话先「加入这个局」。聊天走 8s 轮询(与 iOS 同步)。

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CalendarClock, Crown, LogOut, MapPin, SendHorizonal, UserPlus, Users } from "lucide-react";
import { AppShell } from "@/components/shell/AppShell";
import { ErrorState, InlineLoading } from "@/components/design/States";
import { Avatar } from "@/components/design/Avatar";
import { api } from "@/lib/api";
import { useSessionUser } from "@/lib/session";
import { parseISO, relativeTime, roomStyle } from "@/components/social/socialStyle";

export default function RoomDetailPage() {
  const params = useParams<{ roomId: string }>();
  const roomId = decodeURIComponent(params.roomId);
  const router = useRouter();
  const queryClient = useQueryClient();
  const viewer = useSessionUser();
  const [draft, setDraft] = useState("");
  const [actionError, setActionError] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);

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
  const messages = messagesQuery.data?.items ?? [];
  const joined = !!room?.viewer_joined;
  const isHost = room?.viewer_role === "host";

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  const join = useMutation({
    mutationFn: () => api.joinRoom(roomId),
    onSuccess: (updated) => {
      queryClient.setQueryData(["room", roomId], updated);
      queryClient.invalidateQueries({ queryKey: ["room-messages", roomId] });
    },
    onError: (err: Error) => setActionError(err.message || "加入失败"),
  });
  const leave = useMutation({
    mutationFn: () => api.leaveRoom(roomId),
    onSuccess: (updated) => {
      if (!updated) {
        router.push("/rooms");
        return;
      }
      queryClient.setQueryData(["room", roomId], updated);
      queryClient.invalidateQueries({ queryKey: ["room-messages", roomId] });
    },
    onError: (err: Error) => setActionError(err.message || "操作失败"),
  });
  const send = useMutation({
    mutationFn: (content: string) => api.sendRoomMessage(roomId, content),
    onSuccess: () => {
      setDraft("");
      queryClient.invalidateQueries({ queryKey: ["room-messages", roomId] });
    },
    onError: (err: Error) => setActionError(err.message || "发送失败"),
  });

  function handleJoin() {
    if (!viewer) {
      router.push(`/login?redirect=${encodeURIComponent(`/rooms/${roomId}`)}`);
      return;
    }
    setActionError("");
    join.mutate();
  }

  if (roomQuery.isError) {
    return (
      <AppShell requireAuth={false}>
        <div className="px-4 py-10"><ErrorState onRetry={() => roomQuery.refetch()} /></div>
      </AppShell>
    );
  }
  if (roomQuery.isLoading || !room) {
    return <AppShell requireAuth={false}><InlineLoading /></AppShell>;
  }

  const style = roomStyle(room.room_type);
  const Icon = style.icon;
  const memberCount = room.member_count ?? room.members?.length ?? 1;
  const capacity = room.capacity ?? 0;
  const isOpen = (room.status ?? "open") === "open" || room.status === "full";
  const startsAt = parseISO(room.starts_at);

  return (
    <AppShell requireAuth={false}>
      <header className="kx-glass-bar sticky top-0 z-30 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <Link href="/rooms" className="rounded-full p-2 text-kx-muted transition hover:bg-kx-soft hover:text-kx-text" aria-label="返回房间广场">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br text-white ${style.gradient}`}>
            <Icon className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-black">{room.title}</h1>
            <p className="truncate text-xs font-semibold text-kx-muted">
              {room.room_type_label || style.labelZh} · {memberCount} 人在房间里
              {capacity > 0 ? ` · ${memberCount}/${capacity}` : ""}
            </p>
          </div>
          {joined ? (
            <button
              type="button"
              onClick={() => { if (confirm(isHost ? "解散这个局?" : "退出这个局?")) leave.mutate(); }}
              className="inline-flex items-center gap-1 rounded-full bg-kx-soft px-3 py-1.5 text-xs font-black text-kx-muted transition hover:text-kx-heat"
            >
              <LogOut className="h-3.5 w-3.5" />
              {isHost ? "解散" : "退出"}
            </button>
          ) : null}
        </div>
      </header>

      <main className="flex min-h-[70vh] flex-col px-4 py-4">
        {/* 局的信息 */}
        <section className="kx-card p-4">
          {room.description ? <p className="text-sm font-semibold leading-6">{room.description}</p> : null}
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-kx-muted">
            {startsAt ? (
              <span className="inline-flex items-center gap-1">
                <CalendarClock className="h-3.5 w-3.5" />
                {startsAt.toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "short" })}{" "}
                {startsAt.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false })}
              </span>
            ) : null}
            {room.location_hint ? (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                {room.location_hint}
              </span>
            ) : null}
            {!isOpen ? <span className="font-black text-kx-heat">这个局已经结束了</span> : null}
          </div>
          {/* 在房间里的人 */}
          <div className="mt-3 border-t border-kx-stroke/40 pt-3">
            <p className="mb-2 inline-flex items-center gap-1 text-[11px] font-black uppercase tracking-wider text-kx-muted">
              <Users className="h-3.5 w-3.5" /> 在房间里的人
            </p>
            <div className="flex flex-wrap gap-3">
              {(room.members ?? []).map((member) => (
                <Link key={member.id} href={`/u/${member.handle}`} className="flex w-14 flex-col items-center gap-1">
                  <div className="relative">
                    <Avatar user={member} size={44} />
                    {member.id === room.host_user_id ? (
                      <span className="absolute -bottom-0.5 -right-0.5 grid h-4.5 w-4.5 place-items-center rounded-full bg-amber-400 ring-2 ring-kx-card">
                        <Crown className="h-2.5 w-2.5 text-amber-900" />
                      </span>
                    ) : null}
                  </div>
                  <span className="w-full truncate text-center text-[11px] font-bold">{member.display_name}</span>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* 房间聊天 */}
        <section className="kx-card mt-4 flex flex-1 flex-col p-4">
          <p className="mb-3 text-[11px] font-black uppercase tracking-wider text-kx-muted">房间聊天</p>
          <div className="flex-1 space-y-3 overflow-y-auto">
            {messages.length === 0 ? (
              <p className="py-8 text-center text-sm font-semibold text-kx-muted">
                {joined ? "还没人说话,来开个头。" : "还没人说话。加入后可以聊天。"}
              </p>
            ) : (
              messages.map((message) =>
                message.kind === "system" ? (
                  <p key={message.id} className="text-center text-[11px] font-bold text-kx-muted/70">{message.content}</p>
                ) : (
                  <div key={message.id} className={`flex gap-2.5 ${message.user?.id === viewer?.id ? "flex-row-reverse" : ""}`}>
                    <Avatar user={message.user ?? undefined} size={30} href={message.user ? `/u/${message.user.handle}` : undefined} />
                    <div className={`max-w-[75%] ${message.user?.id === viewer?.id ? "items-end text-right" : ""}`}>
                      {message.user?.id !== viewer?.id ? (
                        <p className="mb-0.5 text-[11px] font-black text-kx-muted">{message.user?.display_name}</p>
                      ) : null}
                      <div
                        className={`inline-block rounded-2xl px-3.5 py-2 text-sm font-medium leading-relaxed ${
                          message.user?.id === viewer?.id ? "bg-kx-accent text-white" : "bg-kx-soft"
                        }`}
                      >
                        {message.content}
                      </div>
                      <p className="mt-0.5 text-[10px] font-semibold text-kx-muted/70">{relativeTime(message.created_at)}</p>
                    </div>
                  </div>
                ),
              )
            )}
            <div ref={chatEndRef} />
          </div>

          {actionError ? <p className="mt-2 text-xs font-bold text-red-500">{actionError}</p> : null}

          {/* 底部动作:加入 or 发言 */}
          <div className="mt-3 border-t border-kx-stroke/40 pt-3">
            {joined ? (
              <form
                className="flex items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const content = draft.trim();
                  if (content && !send.isPending) send.mutate(content);
                }}
              >
                <input
                  className="kx-input h-11 flex-1 rounded-full"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="说点什么…"
                  maxLength={1000}
                  disabled={!isOpen}
                />
                <button
                  type="submit"
                  disabled={!draft.trim() || send.isPending || !isOpen}
                  className="kx-button-primary grid h-11 w-11 shrink-0 place-items-center rounded-full disabled:opacity-40"
                  aria-label="发送"
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
                {room.status === "full" ? "房间已满员" : join.isPending ? "加入中…" : "加入这个局"}
              </button>
            ) : null}
          </div>
        </section>
      </main>
    </AppShell>
  );
}
