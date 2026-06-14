"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { Calendar, Camera, Edit3, Flag, LayoutDashboard, Loader2, MapPin, MessageSquarePlus, Shield, UserCheck, UserPlus, X } from "lucide-react";
import { api, APIError, isAuthRequiredError, isUploadImageFile } from "@/lib/api";
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
import { useI18n } from "@/lib/i18n";

interface ProfileViewProps {
  user: KXUser;
  isSelf: boolean;
}

const SEGMENTS: { value: ProfileSegment; labelKey: "profile_section_posts" | "profile_section_reposts" | "profile_section_replies" | "profile_section_media" | "profile_section_likes" | "profile_section_bookmarks" }[] = [
  { value: "posts", labelKey: "profile_section_posts" },
  { value: "reposts", labelKey: "profile_section_reposts" },
  { value: "replies", labelKey: "profile_section_replies" },
  { value: "media", labelKey: "profile_section_media" },
  { value: "likes", labelKey: "profile_section_likes" },
  { value: "bookmarks", labelKey: "profile_section_bookmarks" },
];

export function ProfileView({ user: baseUser, isSelf }: ProfileViewProps) {
  const router = useRouter();
  const pushToast = useToasts((s) => s.push);
  const me = useSession((s) => s.user);
  const openAuthPrompt = useAuthPrompt((s) => s.open);
  const setSessionUser = useSession((s) => s.setUser);
  const queryClient = useQueryClient();
  const { locale, t } = useI18n();

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
    cover_url: user.cover_url || "",
  });
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [coverUploading, setCoverUploading] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const coverInputRef = useRef<HTMLInputElement | null>(null);

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
      cover_url: user.cover_url || "",
    });
  }, [editOpen, user.display_name, user.bio, user.location, user.avatar_color, user.avatar_url, user.cover_url]);

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

  const uploadProfileImage = async (file: File | undefined, purpose: "avatar" | "profile_cover") => {
    if (!file) return;
    if (!isUploadImageFile(file)) {
      pushToast({ kind: "error", message: "请选择图片文件" });
      return;
    }
    const max = purpose === "avatar" ? 5 * 1024 * 1024 : 10 * 1024 * 1024;
    if (file.size > max) {
      pushToast({ kind: "error", message: purpose === "avatar" ? "头像图片不能超过 5MB" : "封面图片不能超过 10MB" });
      return;
    }
    if (purpose === "avatar") setAvatarUploading(true);
    else setCoverUploading(true);
    try {
      const media = await api.uploadMediaBase64(file, { purpose });
      setDraft((prev) => ({ ...prev, [purpose === "avatar" ? "avatar_url" : "cover_url"]: media.url }));
      pushToast({ kind: "success", message: purpose === "avatar" ? "头像已上传，保存后生效" : "封面已上传，保存后生效" });
    } catch (err) {
      pushToast({ kind: "error", message: (err as APIError).message });
    } finally {
      if (purpose === "avatar") setAvatarUploading(false);
      else setCoverUploading(false);
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
    <div>
      <div className="relative">
        <div
          className="h-24 sm:h-40 w-full"
          style={{
            background:
              user.cover_url
                ? `center / cover no-repeat url("${user.cover_url}")`
                : "linear-gradient(140deg, rgb(var(--kx-accent) / 0.18), rgb(var(--kx-heat) / 0.15) 60%, rgb(var(--kx-repost) / 0.12))",
          }}
        />
        <div className="px-4 -mt-10 sm:-mt-14">
          <div className="flex items-end justify-between gap-3">
            <div className="rounded-kx-lg ring-4 ring-kx-bg bg-kx-bg">
              <Avatar user={user} size={72} className="sm:!w-[88px] sm:!h-[88px]" />
            </div>
            <div className="flex items-center gap-2 mb-2">
              {isSelf ? (
                <>
                  <Link
                    href="/my/features"
                    className="grid h-11 w-11 place-items-center rounded-full border border-slate-200/90 bg-white text-slate-800 shadow-[0_10px_30px_rgba(15,23,42,0.08)] transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                    aria-label="我的工作台"
                    title="我的工作台"
                  >
                    <LayoutDashboard className="w-5 h-5" />
                  </Link>
                  <button
                    type="button"
                    className="inline-flex h-11 items-center gap-2 rounded-full border border-slate-200/80 bg-white px-4 text-sm font-bold text-slate-800 shadow-[0_10px_30px_rgba(15,23,42,0.08)] transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                    onClick={() => setEditOpen(true)}
                  >
                    <Edit3 className="w-4 h-4" /> 编辑资料
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="grid h-11 w-11 place-items-center rounded-full border border-slate-200/90 bg-white text-slate-700 shadow-[0_10px_30px_rgba(15,23,42,0.08)] transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                    onClick={openDM}
                    aria-label="发私信"
                    title="发私信"
                  >
                    <MessageSquarePlus className="w-5 h-5" />
                  </button>
                  <button
                    type="button"
                    className={clsx(
                      "inline-flex h-11 items-center gap-2 rounded-full px-5 text-sm font-bold shadow-[0_12px_30px_rgba(37,99,235,0.18)] transition",
                      following
                        ? "border border-slate-200/90 bg-white text-slate-800 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                        : "bg-blue-600 text-white hover:bg-blue-700",
                    )}
                    onClick={toggleFollow}
                  >
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
            {/* 自己的主页不再堆工作台功能入口 — 右上角的工作台按钮
                (/my/features) 是唯一入口,主页只展示身份信息和内容。 */}
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
                  <span className="px-2 h-6 inline-flex items-center rounded-full bg-slate-100 text-slate-700 font-bold dark:bg-white/10 dark:text-slate-200">{profileRegion.country_emoji} {regionDisplayName(profileRegion, locale)}</span>
                ) : null}
                {/* Admin-assigned custom tags — bordered chips. */}
                {(user.custom_tags || []).map((tag) => (
                  <span key={tag} className="px-2 h-6 inline-flex items-center rounded-full bg-kx-accent/[0.07] text-kx-accent font-bold ring-1 ring-kx-accent/30">{tag}</span>
                ))}
              </div>
            ) : null}
            {/* Tappable listing-count tags — jump to this user's posts of that type. */}
            <ProfileListingCountTags userId={user.id} counts={user.listing_counts} citySlug={profileRegion?.city_code || "tokyo"} />
            {!isSelf ? (
              <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
                <button
                  type="button"
                  className="inline-flex h-8 items-center gap-1.5 rounded-full bg-slate-100/80 px-3 font-semibold text-slate-500 transition hover:bg-red-50 hover:text-red-600"
                  onClick={() => (me ? setReportOpen(true) : openAuthPrompt("generic"))}
                >
                  <Flag className="w-3.5 h-3.5" /> 举报
                </button>
                <button
                  type="button"
                  className="inline-flex h-8 items-center gap-1.5 rounded-full bg-slate-100/80 px-3 font-semibold text-slate-500 transition hover:bg-red-50 hover:text-red-600"
                  onClick={() => (me ? setBlockOpen(true) : openAuthPrompt("generic"))}
                >
                  <Shield className="w-3.5 h-3.5" /> {blocked ? "解除拉黑" : "拉黑"}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="kx-profile-tabs-sticky kx-glass-bar">
        <NavTabs
          items={filteredSegments.map((s) => ({ value: s.value, label: t(s.labelKey) }))}
          value={segment}
          onChange={(v) => setSegment(v as ProfileSegment)}
          equalWidth
        />
      </div>

      <div className="px-3 sm:px-4 py-3 space-y-3">
        {segmentQuery.isLoading ? (
          <>
            <PostSkeleton /><PostSkeleton />
          </>
        ) : segmentQuery.isError ? (
          <ErrorState onRetry={() => segmentQuery.refetch()} />
        ) : !segmentQuery.data?.items?.length ? (
          <EmptyState title="还没有内容" />
        ) : segment === "replies" ? (
          (segmentQuery.data.items as KXComment[]).map((c) => (
            <div key={c.id} className="kx-card">
              <div className="flex items-center gap-1.5 text-sm">
                <Avatar user={c.author || undefined} size={28} />
                <span className="font-semibold">{c.author?.display_name}</span>
                <span className="text-kx-muted text-xs">@{c.author?.handle} · {relativeTime(c.created_at)}</span>
              </div>
              <p className="mt-1.5 text-kx-text text-sm whitespace-pre-wrap break-words">{c.content}</p>
              {c.post ? (
                <Link href={`/p/${c.post.id}`} className="block mt-2 p-2.5 rounded-kx-md bg-kx-soft text-xs text-kx-subtle hover:bg-kx-stroke/30">
                  评论于 @{c.post.author?.handle}：{c.post.content.slice(0, 80)}
                </Link>
              ) : null}
            </div>
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
                  uploadProfileImage(e.target.files?.[0], "avatar");
                  e.target.value = "";
                }}
              />
            </div>
          </div>
          <div className="rounded-kx-md border border-kx-stroke bg-kx-soft/40 p-3">
            <div
              className="h-24 rounded-kx-md bg-kx-soft"
              style={{
                background: draft.cover_url
                  ? `center / cover no-repeat url("${draft.cover_url}")`
                  : "linear-gradient(140deg, rgb(var(--kx-accent) / 0.16), rgb(var(--kx-heat) / 0.12))",
              }}
            />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button type="button" className="kx-button-ghost h-8 px-3 text-xs" onClick={() => coverInputRef.current?.click()} disabled={coverUploading}>
                {coverUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
                更换封面
              </button>
              {draft.cover_url ? (
                <button type="button" className="kx-button-ghost h-8 px-3 text-xs" onClick={() => setDraft({ ...draft, cover_url: "" })}>
                  <X className="w-3.5 h-3.5" />
                  移除封面
                </button>
              ) : null}
              <input
                ref={coverInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  uploadProfileImage(e.target.files?.[0], "profile_cover");
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

// Tappable listing-count tags on a profile: "出售二手 5" → that seller's
// secondhand listings (channel page reads ?seller=). Mirrors iOS.
const LISTING_TAG_META: Record<string, { label: string; channel: string }> = {
  secondhand: { label: "二手", channel: "marketplace" },
  rental: { label: "租房", channel: "rentals" },
  job: { label: "招聘", channel: "jobs" },
  hiring: { label: "招聘", channel: "jobs" },
  local_service: { label: "本地服务", channel: "services" },
  discount: { label: "优惠", channel: "deals" },
};

function ProfileListingCountTags({ userId, counts, citySlug }: { userId: string; counts?: Record<string, number>; citySlug: string }) {
  if (!counts) return null;
  // job + hiring both map to the jobs channel — merge so we show one "招聘 N".
  const merged = new Map<string, { label: string; channel: string; count: number }>();
  for (const [type, count] of Object.entries(counts)) {
    const meta = LISTING_TAG_META[type];
    if (!meta || !count) continue;
    const existing = merged.get(meta.channel);
    if (existing) existing.count += count;
    else merged.set(meta.channel, { ...meta, count });
  }
  const tags = [...merged.values()];
  if (!tags.length) return null;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      {tags.map((tag) => (
        <Link
          key={tag.channel}
          href={`/cities/${encodeURIComponent(citySlug)}/${tag.channel}?seller=${encodeURIComponent(userId)}`}
          className="inline-flex h-7 items-center gap-1 rounded-full border border-kx-stroke/60 bg-kx-card px-2.5 text-[11px] font-black text-kx-subtle transition hover:border-kx-accent/40 hover:text-kx-accent"
        >
          {tag.label}
          <span className="grid h-4 min-w-4 place-items-center rounded-full bg-kx-accent/10 px-1 text-kx-accent">{tag.count}</span>
        </Link>
      ))}
    </div>
  );
}
