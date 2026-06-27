"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  Heart,
  MessageCircle,
  Reply,
  Repeat2,
  UserPlus,
  AtSign,
  Bookmark,
  CheckCheck,
  Trash2,
  Store,
  Star,
  MessageSquare,
  Users,
} from "lucide-react";
import clsx from "clsx";
import { api, APIError } from "@/lib/api";
import { AppShell } from "@/components/shell/AppShell";
import { Avatar } from "@/components/design/Avatar";
import { EmptyState, ErrorState, InlineLoading } from "@/components/design/States";
import { NavTabs } from "@/components/design/NavTabs";
import { relativeTime } from "@/lib/format";
import { useToasts } from "@/lib/store";
import { useI18n } from "@/lib/i18n";
import type { KXNotification } from "@/lib/types";

type NotificationsResponse = { items: KXNotification[]; unread_count: number };

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  like: Heart,
  comment: MessageCircle,
  reply: Reply,
  repost: Repeat2,
  follow: UserPlus,
  mention: AtSign,
  bookmark: Bookmark,
  system: Bell,
  listing_inquiry: Store,
  listing_inquiry_status: Store,
  listing_review: Star,
  listing_review_reply: Star,
  message: MessageSquare,
  meetup_join: Users,
};

export default function NotificationsPage() {
  const [filter, setFilter] = useState("all");
  const queryClient = useQueryClient();
  const pushToast = useToasts((s) => s.push);
  const router = useRouter();
  const { t } = useI18n();
  const FILTERS = [
    { value: "all", label: t("notif_filter_all") },
    { value: "like", label: t("notif_filter_like") },
    { value: "comment", label: t("notif_filter_comment") },
    { value: "reply", label: t("notif_filter_reply") },
    { value: "repost", label: t("notif_filter_repost") },
    { value: "follow", label: t("notif_filter_follow") },
    { value: "system", label: t("notif_filter_system") },
  ];
  const notif = useQuery({
    queryKey: ["notifications", filter],
    queryFn: () => api.notifications(filter),
  });

  // Group consecutive same-type notifications by post — this is what
  // the iOS app calls "通知聚合".
  const grouped: { key: string; items: KXNotification[]; kind: string }[] = [];
  for (const item of notif.data?.items || []) {
    const key = `${item.type}-${item.target_post_id || item.actor_id}`;
    const last = grouped[grouped.length - 1];
    if (last && last.key === key && last.items.length < 6 && item.type !== "system") {
      last.items.push(item);
    } else {
      grouped.push({ key, kind: item.type, items: [item] });
    }
  }

  const markAll = async () => {
    try {
      queryClient.setQueriesData<NotificationsResponse>({ queryKey: ["notifications"] }, (old) => {
        if (!old) return old;
        return {
          ...old,
          items: old.items.map((item) => ({ ...item, is_read: true })),
          unread_count: 0,
        };
      });
      await api.markNotificationsRead({ all: true });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    } catch (err) {
      pushToast({ kind: "error", message: (err as APIError).message });
    }
  };

  const remove = async (id: string) => {
    try {
      await api.deleteNotification(id);
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    } catch (err) {
      pushToast({ kind: "error", message: (err as APIError).message });
    }
  };

  const markIds = async (ids: string[]) => {
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    try {
      queryClient.setQueriesData<NotificationsResponse>({ queryKey: ["notifications"] }, (old) => {
        if (!old) return old;
        const items = old.items.map((item) => idSet.has(item.id) ? { ...item, is_read: true } : item);
        return {
          ...old,
          items,
          unread_count: items.filter((item) => !item.is_read).length,
        };
      });
      await api.markNotificationsRead({ ids });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    } catch (err) {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      pushToast({ kind: "error", message: (err as APIError).message });
    }
  };

  const notificationTargetHref = (main: KXNotification) => {
    if (main.target_conversation_id) return `/messages/${main.target_conversation_id}`;
    if (main.target_listing_id) return `/listings/${main.target_listing_id}`;
    if (main.target_post_id) return `/p/${main.target_post_id}`;
    if (main.actor) return `/u/${main.actor.handle}`;
    return "";
  };

  const openNotificationTarget = async (main: KXNotification, unreadIds: string[]) => {
    await markIds(unreadIds);
    const href = notificationTargetHref(main);
    if (href) router.push(href);
  };

  const openActorProfile = async (actor: NonNullable<KXNotification["actor"]>, unreadIds: string[]) => {
    await markIds(unreadIds);
    router.push(`/u/${actor.handle}`);
  };

  return (
    <AppShell>
      <header className="sticky top-0 z-30 kx-glass-bar px-3 py-2 flex items-center gap-2">
        <h1 className="text-lg font-bold">{t("nav_notifications")}</h1>
        {notif.data && notif.data.unread_count > 0 ? (
          <button onClick={markAll} className="ml-auto kx-button-ghost text-xs h-8">
            <CheckCheck className="w-3.5 h-3.5" /> {t("action_mark_all_read")}
          </button>
        ) : null}
      </header>

      <div className="sticky top-[52px] z-20">
        <NavTabs
          items={FILTERS.map((f) => ({ value: f.value, label: f.label }))}
          value={filter}
          onChange={setFilter}
        />
      </div>

      {notif.isLoading ? (
        <InlineLoading />
      ) : notif.isError ? (
        <ErrorState onRetry={() => notif.refetch()} />
      ) : grouped.length === 0 ? (
        <EmptyState title={t("notif_empty_title")} subtitle={t("notif_empty_subtitle")} icon={Bell} action={{ label: t("empty_cta_browse"), href: "/home" }} />
      ) : (
        <ul className="divide-y divide-kx-stroke/30">
          {grouped.map((group) => {
            const main = group.items[0];
            const Icon = ICONS[group.kind] || Bell;
            const moreCount = group.items.length - 1;
            const unread = group.items.some((i) => !i.is_read);
            const unreadIds = group.items.filter((i) => !i.is_read).map((i) => i.id);
            return (
              <li
                key={group.key}
                className={clsx("px-3 sm:px-4 py-3 flex gap-3 group items-start transition hover:bg-kx-soft/40 cursor-pointer", unread && "bg-kx-accentSoft/40")}
                onClick={(e) => {
                  // Allow nested links / buttons to take over.
                  if ((e.target as HTMLElement).closest("a, button")) return;
                  void openNotificationTarget(main, unreadIds);
                }}
              >
                <div className="mt-0.5">
                  <Icon className={clsx(
                    "w-5 h-5",
                    group.kind === "like" && "text-kx-like",
                    group.kind === "repost" && "text-kx-repost",
                    group.kind === "comment" && "text-kx-accent",
                    group.kind === "reply" && "text-kx-accent",
                    group.kind === "follow" && "text-kx-accent",
                    group.kind === "system" && "text-kx-muted",
                  )} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center -space-x-2 mb-1.5">
                    {group.items.slice(0, 5).map((i) =>
                      i.actor ? (
                        <Link
                          key={i.id}
                          href={`/u/${i.actor.handle}`}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            void openActorProfile(i.actor!, unreadIds);
                          }}
                          className="ring-2 ring-kx-bg rounded-kx-sm hover:scale-110 transition-transform"
                        >
                          <Avatar user={i.actor} size={28} />
                        </Link>
                      ) : (
                        <Avatar key={i.id} user={undefined} size={28} />
                      ),
                    )}
                  </div>
                  <div className="text-sm text-kx-text leading-snug">
                    {main.actor ? (
                      <Link
                        href={`/u/${main.actor.handle}`}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          void openActorProfile(main.actor!, unreadIds);
                        }}
                        className="font-semibold hover:underline"
                      >
                        {main.actor.display_name}
                      </Link>
                    ) : (
                      <strong>用户</strong>
                    )}
                    {moreCount > 0 ? <span className="text-kx-muted"> 等 {moreCount + 1} 位 </span> : <span className="text-kx-muted"> </span>}
                    <NotifVerb kind={group.kind} />
                    {main.target_conversation_id ? (
                      <Link
                        href={`/messages/${main.target_conversation_id}`}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          void openNotificationTarget(main, unreadIds);
                        }}
                        className="kx-link ml-1"
                      >
                        查看对话
                      </Link>
                    ) : main.target_listing_id ? (
                      <Link
                        href={`/listings/${main.target_listing_id}`}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          void openNotificationTarget(main, unreadIds);
                        }}
                        className="kx-link ml-1"
                      >
                        查看信息
                      </Link>
                    ) : main.target_post_id ? (
                      <Link
                        href={`/p/${main.target_post_id}`}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          void openNotificationTarget(main, unreadIds);
                        }}
                        className="kx-link ml-1"
                      >
                        查看帖子
                      </Link>
                    ) : null}
                  </div>
                  {main.content ? <div className="text-xs text-kx-subtle mt-1 line-clamp-2">{main.content}</div> : null}
                  <div className="text-xs text-kx-muted mt-1">{relativeTime(main.created_at)}</div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  {unread ? (
                    <button
                      className="inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full border border-kx-accent/20 bg-kx-accentSoft px-2.5 text-xs font-bold text-kx-accent transition hover:border-kx-accent/35 hover:bg-kx-accentSoft/80"
                      onClick={(e) => {
                        e.stopPropagation();
                        void markIds(unreadIds);
                      }}
                      aria-label="标记为已查看"
                    >
                      <CheckCheck className="h-3.5 w-3.5" /> 未查看
                    </button>
                  ) : (
                    <span className="inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full bg-kx-soft px-2.5 text-xs font-bold text-kx-muted">
                      <CheckCheck className="h-3.5 w-3.5" /> 已查看
                    </span>
                  )}
                  <button
                    className="text-kx-muted opacity-70 transition hover:text-kx-danger group-hover:opacity-100"
                    onClick={(e) => {
                      e.stopPropagation();
                      remove(main.id);
                    }}
                    aria-label="删除"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </AppShell>
  );
}

function NotifVerb({ kind }: { kind: string }) {
  switch (kind) {
    case "like": return <>赞了你的帖子</>;
    case "comment": return <>评论了你的帖子</>;
    case "reply": return <>回复了你</>;
    case "repost": return <>转发了你的帖子</>;
    case "follow": return <>关注了你</>;
    case "bookmark": return <>收藏了你的帖子</>;
    case "mention": return <>提到了你</>;
    case "system": return <>系统通知</>;
    case "listing_inquiry": return <>联系了你发布的城市信息</>;
    case "listing_inquiry_status": return <>更新了咨询 / 预约状态</>;
    case "listing_review": return <>点评了你发布的城市信息</>;
    case "listing_review_reply": return <>回复了你的点评</>;
    case "message": return <>给你发来一条私信</>;
    case "meetup_join": return <>报名参加了你的活动</>;
    default: return <>给你发来新通知</>;
  }
}
