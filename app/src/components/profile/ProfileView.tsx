"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { Calendar, Camera, Edit3, Flag, Loader2, MapPin, MessageSquarePlus, Shield, UserCheck, UserPlus, X } from "lucide-react";
import { api, APIError, isAuthRequiredError } from "@/lib/api";
import type { KXPost, KXUser, ProfileSegment, KXComment } from "@/lib/types";
import { Avatar, VerifiedBadge } from "@/components/design/Avatar";
import { showVerifiedBadge } from "@/lib/types";
import { EmptyState, ErrorState, PostSkeleton } from "@/components/design/States";
import { PostCard } from "@/components/feed/PostCard";
import { Dialog, ConfirmDialog } from "@/components/design/Dialog";
import { NavTabs } from "@/components/design/NavTabs";
import { fullDateTime, compactNumber, relativeTime } from "@/lib/format";
import { useAuthPrompt, useSession, useToasts } from "@/lib/store";
import { useRouter } from "next/navigation";
import { BrandPhrase } from "@/components/marketing/BrandText";
import { regionDisplayName, regionFromUser } from "@/lib/regions";

interface ProfileViewProps {
  user: KXUser;
  isSelf: boolean;
}

const SEGMENTS: { value: ProfileSegment; label: string }[] = [
  { value: "posts", label: "帖子" },
  { value: "replies", label: "回复" },
  { value: "media", label: "媒体" },
  { value: "likes", label: "喜欢" },
  { value: "bookmarks", label: "收藏" },
];

export function ProfileView({ user: baseUser, isSelf }: ProfileViewProps) {
  const router = useRouter();
  const pushToast = useToasts((s) => s.push);
  const me = useSession((s) => s.user);
  const openAuthPrompt = useAuthPrompt((s) => s.open);
  const setSessionUser = useSession((s) => s.setUser);
  const queryClient = useQueryClient();

  // Always fetch the full user detail so counts (followers / following /
  // posts) are present even when a parent supplies a partial KXUser.
  const detailQuery = useQuery({
    queryKey: ["user", baseUser.handle || baseUser.id],
    queryFn: () => api.userDetail(baseUser.handle || baseUser.id),
    initialData: baseUser,
    enabled: !!(baseUser.handle || baseUser.id),
  });
  const user = detailQuery.data || baseUser;
  const profileRegion = regionFromUser(user);

  const [segment, setSegment] = useState<ProfileSegment>("posts");
  const [reportOpen, setReportOpen] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [following, setFollowing] = useState(user.is_following ?? false);
  const [blocked, setBlocked] = useState(user.is_blocked ?? false);
  const [draft, setDraft] = useState({
    display_name: user.display_name,
    bio: user.bio || "",
    location: user.location || "",
    avatar_color: user.avatar_color || "indigo",
    avatar_url: user.avatar_url || "",
  });
  const [avatarUploading, setAvatarUploading] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);

  // Keep follow / block state in sync with refreshed user data.
  useEffect(() => {
    if (user.is_following !== undefined) setFollowing(user.is_following);
    if (user.is_blocked !== undefined) setBlocked(user.is_blocked);
  }, [user.is_following, user.is_blocked]);

  useEffect(() => {
    if (!editOpen) return;
    setDraft({
      display_name: user.display_name,
      bio: user.bio || "",
      location: user.location || "",
      avatar_color: user.avatar_color || "indigo",
      avatar_url: user.avatar_url || "",
    });
  }, [editOpen, user.display_name, user.bio, user.location, user.avatar_color, user.avatar_url]);

  const segmentQuery = useQuery({
    queryKey: ["profile-segment", user.id, segment],
    queryFn: () => api.userPosts(user.id, { segment }),
  });

  const filteredSegments = isSelf ? SEGMENTS : SEGMENTS.filter((s) => s.value !== "bookmarks");

  const toggleFollow = async () => {
    if (!me) {
      openAuthPrompt("follow");
      return;
    }
    const next = !following;
    setFollowing(next);
    try {
      await api.follow(user.id, next);
    } catch (err) {
      setFollowing(!next);
      if (isAuthRequiredError(err)) {
        openAuthPrompt("follow");
        return;
      }
      pushToast({ kind: "error", message: (err as APIError).message });
    }
  };

  const submitBlock = async () => {
    if (!me) {
      openAuthPrompt("generic");
      return;
    }
    try {
      await api.block(user.id, !blocked);
      setBlocked(!blocked);
      setBlockOpen(false);
      pushToast({ kind: "success", message: !blocked ? "已拉黑" : "已解除拉黑" });
    } catch (err) {
      if (isAuthRequiredError(err)) {
        openAuthPrompt("generic");
        return;
      }
      pushToast({ kind: "error", message: (err as APIError).message });
    }
  };

  const submitEdit = async () => {
    try {
      const updated = await api.updateMe(draft);
      setSessionUser(updated);
      queryClient.setQueryData(["user", baseUser.handle || baseUser.id], updated);
      setEditOpen(false);
      pushToast({ kind: "success", message: "已保存" });
    } catch (err) {
      if (isAuthRequiredError(err)) {
        openAuthPrompt("message");
        return;
      }
      pushToast({ kind: "error", message: (err as APIError).message });
    }
  };

  const uploadAvatar = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      pushToast({ kind: "error", message: "请选择图片作为头像" });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      pushToast({ kind: "error", message: "头像图片不能超过 10MB" });
      return;
    }
    setAvatarUploading(true);
    try {
      const media = await api.uploadMediaBase64(file);
      setDraft((prev) => ({ ...prev, avatar_url: media.url }));
      pushToast({ kind: "success", message: "头像已上传，保存后生效" });
    } catch (err) {
      pushToast({ kind: "error", message: (err as APIError).message });
    } finally {
      setAvatarUploading(false);
    }
  };

  const openDM = async () => {
    if (!me) {
      openAuthPrompt("message");
      return;
    }
    try {
      const conv = await api.openConversation(user.id);
      router.push(`/messages/${conv.id}`);
    } catch (err) {
      pushToast({ kind: "error", message: (err as APIError).message });
    }
  };

  return (
    <div className="min-w-0">
      <div className="relative">
        <div
          className="h-24 sm:h-40 w-full"
          style={{
            background:
              "linear-gradient(140deg, rgb(var(--kx-accent) / 0.18), rgb(var(--kx-heat) / 0.15) 60%, rgb(var(--kx-repost) / 0.12))",
          }}
        />
        <div className="px-4 -mt-10 sm:-mt-14">
          <div className="flex items-end justify-between gap-3">
            <div className="rounded-kx-lg ring-4 ring-kx-bg bg-kx-bg">
              <Avatar user={user} size={72} className="sm:!w-[88px] sm:!h-[88px]" />
            </div>
            <div className="mb-2 flex min-w-0 flex-wrap items-center justify-end gap-2">
              {isSelf ? (
                <button className="kx-button-ghost h-9 w-9 p-0 sm:w-auto sm:px-3" onClick={() => setEditOpen(true)} aria-label="编辑资料">
                  <Edit3 className="w-4 h-4" />
                  <span className="hidden sm:inline">编辑资料</span>
                </button>
              ) : (
                <>
                  <button className="kx-button-ghost h-9 w-9 p-0" onClick={openDM} aria-label="发私信">
                    <MessageSquarePlus className="w-4 h-4" />
                  </button>
                  <button className={following ? "kx-button-ghost" : "kx-button-primary"} onClick={toggleFollow}>
                    {following ? (<><UserCheck className="w-4 h-4" /> 已关注</>) : (<><UserPlus className="w-4 h-4" /> 关注</>)}
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="mt-3">
            <h1 className="text-xl font-bold inline-flex items-center gap-1.5">
              {user.display_name}
              {showVerifiedBadge(user) ? <VerifiedBadge /> : null}
            </h1>
            <div className="text-kx-muted text-sm">@{user.handle}</div>
            {user.bio ? <p className="mt-2 text-kx-text text-sm whitespace-pre-wrap break-words">{user.bio}</p> : null}
            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-kx-subtle">
              {user.location ? (
                <span className="inline-flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> {user.location}</span>
              ) : null}
              {user.joined_at ? (
                <span className="inline-flex items-center gap-1"><Calendar className="w-3.5 h-3.5" /> 加入于 {fullDateTime(user.joined_at).split(" ")[0]}</span>
              ) : null}
            </div>
            {/* Slim stats row — 关注 / 粉丝 / 帖子 are the three
                numbers users actually scan; 总热度 / 访问 / 被收藏
                were noise that lit up the header but nobody read. */}
            <div className="mt-2 flex items-center gap-4 text-sm flex-wrap">
              <Link href={`/u/${user.handle}/following`} className="hover:underline">
                <strong>{compactNumber(user.following_count || 0)}</strong>
                <span className="text-kx-muted ml-1">关注</span>
              </Link>
              <Link href={`/u/${user.handle}/followers`} className="hover:underline">
                <strong>{compactNumber(user.follower_count || 0)}</strong>
                <span className="text-kx-muted ml-1">粉丝</span>
              </Link>
              <span><strong>{compactNumber(user.post_count || 0)}</strong> <span className="text-kx-muted">帖子</span></span>
            </div>
            {/* Identity / status badges row. Mirrors iOS ProfileView
                ProfileRoleBadge strip. */}
            {(user.role && user.role !== "member") || user.is_merchant || user.merchant_verified || user.creator_badge || profileRegion ? (
              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
                {user.role && user.role !== "member" ? (
                  <span className="px-2 h-6 inline-flex items-center rounded-full bg-kx-accent/10 text-kx-accent font-bold">
                    {user.role === "creator" ? "创作者" : user.role === "admin" ? "管理员" : user.role}
                  </span>
                ) : null}
                {user.merchant_verified ? (
                  <span className="px-2 h-6 inline-flex items-center rounded-full bg-emerald-100 text-emerald-700 font-bold dark:bg-emerald-500/15 dark:text-emerald-300">商家已认证</span>
                ) : user.is_merchant ? (
                  <span className="px-2 h-6 inline-flex items-center rounded-full bg-amber-100 text-amber-700 font-bold dark:bg-amber-500/15 dark:text-amber-300">商家待审核</span>
                ) : null}
                {user.creator_badge ? (
                  <span className="px-2 h-6 inline-flex items-center rounded-full bg-pink-100 text-pink-700 font-bold dark:bg-pink-500/15 dark:text-pink-300">{user.creator_badge}</span>
                ) : null}
                {profileRegion ? (
                  <span className="px-2 h-6 inline-flex items-center rounded-full bg-slate-100 text-slate-700 font-bold dark:bg-white/10 dark:text-slate-200">{profileRegion.country_emoji} {regionDisplayName(profileRegion)}</span>
                ) : null}
              </div>
            ) : null}
            {!isSelf ? (
              <div className="mt-3 flex items-center gap-2 text-xs">
                <button className="text-kx-muted hover:text-kx-danger inline-flex items-center gap-1" onClick={() => (me ? setReportOpen(true) : openAuthPrompt("generic"))}>
                  <Flag className="w-3.5 h-3.5" /> 举报
                </button>
                <button className="text-kx-muted hover:text-kx-danger inline-flex items-center gap-1" onClick={() => (me ? setBlockOpen(true) : openAuthPrompt("generic"))}>
                  <Shield className="w-3.5 h-3.5" /> {blocked ? "解除拉黑" : "拉黑"}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mt-4">
        <div className="sticky top-0 z-30 bg-kx-bg/90 px-3 backdrop-blur supports-[backdrop-filter]:bg-kx-bg/75">
          <NavTabs
            items={filteredSegments.map((s) => ({ value: s.value, label: s.label }))}
            value={segment}
            onChange={(v) => setSegment(v as ProfileSegment)}
            equalWidth
          />
        </div>
      </div>

      <div className="px-3 sm:px-4 py-3 space-y-3">
        {segmentQuery.isLoading ? (
          <>
            <PostSkeleton /><PostSkeleton />
          </>
        ) : segmentQuery.isError ? (
          <ErrorState onRetry={() => segmentQuery.refetch()} />
        ) : !segmentQuery.data?.items?.length ? (
          <EmptyState title={segment === "replies" ? "还没有回复" : "还没有内容"} />
        ) : segment === "replies" ? (
          (segmentQuery.data.items as KXComment[]).map((c) => (
            <article key={c.id} className="kx-card overflow-hidden !p-0">
              <div className="p-4 sm:p-5">
                <div className="flex items-start gap-2.5">
                  <Avatar user={c.author || undefined} size={34} />
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-1.5 text-sm">
                      <span className="truncate font-semibold text-kx-text">{c.author?.display_name || "未知用户"}</span>
                      <span className="truncate text-xs text-kx-muted">
                        @{c.author?.handle || "unknown"} · {relativeTime(c.created_at)}
                      </span>
                    </div>
                    <div className="mt-0.5 text-xs font-semibold text-kx-muted">回复了一条帖子</div>
                  </div>
                </div>
                <p className="mt-3 whitespace-pre-wrap break-words text-[15px] leading-7 text-kx-text">{c.content}</p>
              </div>
              {c.post ? (
                <Link href={`/p/${c.post.id}`} className="block border-t border-kx-stroke/35 bg-kx-soft/55 px-4 py-3 text-xs text-kx-subtle transition hover:bg-kx-soft sm:px-5">
                  <div className="mb-1 flex min-w-0 items-center gap-1.5 font-bold text-kx-muted">
                    <span className="shrink-0">原帖</span>
                    <span className="truncate">@{c.post.author?.handle || "unknown"}</span>
                  </div>
                  <div className="line-clamp-2 text-sm leading-6 text-kx-text">
                    {(c.post.content || "这条帖子没有文字内容").slice(0, 120)}
                  </div>
                </Link>
              ) : (
                <div className="border-t border-kx-stroke/35 bg-kx-soft/45 px-4 py-3 text-xs font-semibold text-kx-muted sm:px-5">
                  原帖暂时不可见
                </div>
              )}
            </article>
          ))
        ) : (
          (segmentQuery.data.items as KXPost[]).map((p) => <PostCard key={p.id} post={p} />)
        )}
      </div>

      <Dialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="编辑个人资料"
        footer={
          <>
            <button className="kx-button-ghost" onClick={() => setEditOpen(false)}>取消</button>
            <button className="kx-button-primary" onClick={submitEdit}>保存</button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="flex items-center gap-3 rounded-kx-md border border-kx-stroke bg-kx-soft/40 p-3">
            <Avatar
              user={{ ...user, display_name: draft.display_name, avatar_color: draft.avatar_color, avatar_url: draft.avatar_url }}
              size={64}
            />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-kx-text">头像</div>
              <div className="mt-1 text-xs text-kx-muted">支持 JPG、PNG、WebP、GIF，保存资料后更新到个人页。</div>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="kx-button-ghost h-8 px-3 text-xs"
                  onClick={() => avatarInputRef.current?.click()}
                  disabled={avatarUploading}
                >
                  {avatarUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
                  更换头像
                </button>
                {draft.avatar_url ? (
                  <button
                    type="button"
                    className="kx-button-ghost h-8 px-3 text-xs"
                    onClick={() => setDraft({ ...draft, avatar_url: "" })}
                  >
                    <X className="w-3.5 h-3.5" />
                    移除图片
                  </button>
                ) : null}
              </div>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  uploadAvatar(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </div>
          </div>
          <label className="block">
            <span className="text-sm font-semibold">显示名称</span>
            <input className="kx-input mt-1" value={draft.display_name} onChange={(e) => setDraft({ ...draft, display_name: e.target.value })} />
          </label>
          <label className="block">
            <span className="text-sm font-semibold">简介</span>
            <textarea className="kx-textarea mt-1 h-24" value={draft.bio} onChange={(e) => setDraft({ ...draft, bio: e.target.value })} />
          </label>
          <label className="block">
            <span className="text-sm font-semibold">所在地</span>
            <input className="kx-input mt-1" value={draft.location} onChange={(e) => setDraft({ ...draft, location: e.target.value })} />
          </label>
          <div>
            <span className="text-sm font-semibold">头像颜色</span>
            <div className="flex flex-wrap gap-2 mt-2">
              {["indigo", "blue", "green", "orange", "red", "purple", "pink", "teal", "brown", "black"].map((c) => (
                <button
                  key={c}
                  className={clsx("w-8 h-8 rounded-kx-sm border-2", draft.avatar_color === c ? "border-kx-accent" : "border-transparent")}
                  style={{ backgroundColor: ({ indigo: "#4f4ad6", blue: "#3a6dde", green: "#27a85a", orange: "#e57a26", red: "#d94343", purple: "#8859d0", pink: "#e85cab", teal: "#1ea3a1", brown: "#9a6f4b", black: "#1f2329" }[c]) }}
                  onClick={() => setDraft({ ...draft, avatar_color: c })}
                  aria-label={c}
                />
              ))}
            </div>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        title="举报这个用户"
        footer={
          <>
            <button className="kx-button-ghost" onClick={() => setReportOpen(false)}>取消</button>
            <button className="kx-button-primary" onClick={async () => {
              try {
                await api.reportUser(user.id, "inappropriate");
                setReportOpen(false);
                pushToast({ kind: "success", message: "举报已提交" });
              } catch (err) {
                if (isAuthRequiredError(err)) {
                  openAuthPrompt("generic");
                  return;
                }
                pushToast({ kind: "error", message: (err as APIError).message });
              }
            }}>提交</button>
          </>
        }
      >
        <p className="text-sm text-kx-subtle"><BrandPhrase text="举报会发送给 Machi 审核团队，匿名处理。" /></p>
      </Dialog>

      <ConfirmDialog
        open={blockOpen}
        title={blocked ? "解除对该用户的拉黑？" : "拉黑这个用户？"}
        description={blocked ? "解除后你将再次看到对方的内容。" : "对方将无法和你互动，你也将不再看到对方的内容。"}
        destructive={!blocked}
        confirmLabel={blocked ? "解除" : "拉黑"}
        onConfirm={submitBlock}
        onCancel={() => setBlockOpen(false)}
      />
    </div>
  );
}
