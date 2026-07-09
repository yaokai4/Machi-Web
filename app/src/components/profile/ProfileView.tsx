"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { Calendar, Camera, Edit3, Flag, LayoutDashboard, Loader2, MapPin, MessageSquarePlus, Shield, UserCheck, UserPlus, X } from "lucide-react";
import { api, APIError, isAuthRequiredError, isUploadImageFile } from "@/lib/api";
import type { KXPost, KXUser, ProfileSegment, KXComment } from "@/lib/types";
import { Avatar, OfficialBadge, OfficialPill, VerifiedBadge } from "@/components/design/Avatar";
import { showOfficialBadge, showVerifiedBadge } from "@/lib/types";
import { EmptyState, ErrorState, PostSkeleton } from "@/components/design/States";
import { PostCard } from "@/components/feed/PostCard";
import { Dialog, ConfirmDialog } from "@/components/design/Dialog";
import { NavTabs } from "@/components/design/NavTabs";
import { fullDateTime, compactNumber, relativeTime } from "@/lib/format";
import { useAuthPrompt, useCompose, useSession, useToasts } from "@/lib/store";
import { useRouter } from "next/navigation";
import { BrandPhrase } from "@/components/marketing/BrandText";
import { regionDisplayName, regionFromUser } from "@/lib/regions";
import { useI18n } from "@/lib/i18n";
import { ShareButton } from "@/components/social/ShareButton";
import { DISPLAY_NAME_MAX } from "@/lib/authValidation";

interface ProfileViewProps {
  user: KXUser;
  isSelf: boolean;
}

const BIO_MAX = 200;

// ---------------------------------------------------------------------------
// Local three-language copy. /me and /u/[handle] are identity-core pages, so
// they must never leak a single language. The shared i18n dictionary is owned
// by another workstream and its `t()` is type-locked to existing keys, so this
// screen carries its own zh / ja / en table (mirrors authLocale.ts) and reuses
// the app locale from useI18n().
// ---------------------------------------------------------------------------
type Lang = "zh" | "ja" | "en";
function profileLang(locale: string): Lang {
  if (locale === "ja") return "ja";
  if (locale === "en") return "en";
  return "zh";
}

const COPY: Record<Lang, Record<string, string>> = {
  zh: {
    edit_profile: "编辑资料",
    workbench: "我的工作台",
    dm: "发私信",
    follow: "关注",
    following: "已关注",
    joined_prefix: "加入于",
    stat_following: "关注",
    stat_followers: "粉丝",
    stat_posts: "帖子",
    role_creator: "创作者",
    role_admin: "管理员",
    merchant_verified: "商家已认证",
    merchant_pending: "商家待审核",
    report: "举报",
    block: "拉黑",
    unblock: "解除拉黑",
    empty_replies: "还没有回复",
    empty_bookmarks: "还没有收藏",
    empty_likes: "还没有喜欢",
    empty_reposts: "还没有转发",
    empty_media: "还没有图片或视频",
    empty_posts: "还没有动态",
    empty_sub_bookmarks: "在 Feed 中点击书签即可收藏喜欢的帖子。",
    empty_sub_posts: "发布你的第一条动态，让大家看到你。",
    action_publish: "发布",
    action_browse: "去逛逛",
    reply_tpl: "评论于 @{handle}：{content}",
    edit_dialog_title: "编辑个人资料",
    cancel: "取消",
    save: "保存",
    avatar_label: "头像",
    avatar_hint: "支持 JPG、PNG、WebP、GIF，保存资料后更新到个人页。",
    change_avatar: "更换头像",
    remove_image: "移除图片",
    change_cover: "更换封面",
    remove_cover: "移除封面",
    display_name: "显示名称",
    bio: "简介",
    auto_region: "自动地区",
    avatar_color: "头像颜色",
    report_dialog_title: "举报这个用户",
    submit: "提交",
    report_hint: "举报会发送给 Machi 审核团队，匿名处理。",
    block_title: "拉黑这个用户？",
    unblock_title: "解除对该用户的拉黑？",
    block_desc: "对方将无法和你互动，你也将不再看到对方的内容。",
    unblock_desc: "解除后你将再次看到对方的内容。",
    toast_blocked: "已拉黑",
    toast_unblocked: "已解除拉黑",
    toast_saved: "已保存",
    err_select_image: "请选择图片文件",
    err_avatar_size: "头像图片不能超过 5MB",
    err_cover_size: "封面图片不能超过 10MB",
    toast_avatar_uploaded: "头像已上传，保存后生效",
    toast_cover_uploaded: "封面已上传，保存后生效",
    toast_report_submitted: "举报已提交",
    lt_secondhand: "二手",
    lt_rental: "租房",
    lt_job: "招聘",
    lt_service: "本地服务",
    lt_deal: "优惠",
  },
  ja: {
    edit_profile: "プロフィール編集",
    workbench: "マイ・ワークベンチ",
    dm: "メッセージ",
    follow: "フォロー",
    following: "フォロー中",
    joined_prefix: "登録日",
    stat_following: "フォロー",
    stat_followers: "フォロワー",
    stat_posts: "投稿",
    role_creator: "クリエイター",
    role_admin: "管理者",
    merchant_verified: "事業者認証済み",
    merchant_pending: "事業者審査中",
    report: "通報",
    block: "ブロック",
    unblock: "ブロック解除",
    empty_replies: "まだ返信がありません",
    empty_bookmarks: "まだ保存がありません",
    empty_likes: "まだいいねがありません",
    empty_reposts: "まだリポストがありません",
    empty_media: "まだ画像や動画がありません",
    empty_posts: "まだ投稿がありません",
    empty_sub_bookmarks: "フィードでブックマークを押すと投稿を保存できます。",
    empty_sub_posts: "最初の投稿をして、みんなに知ってもらいましょう。",
    action_publish: "投稿",
    action_browse: "見てまわる",
    reply_tpl: "@{handle} へのコメント：{content}",
    edit_dialog_title: "プロフィールを編集",
    cancel: "キャンセル",
    save: "保存",
    avatar_label: "アイコン",
    avatar_hint: "JPG・PNG・WebP・GIF 対応。保存後にプロフィールへ反映されます。",
    change_avatar: "アイコンを変更",
    remove_image: "画像を削除",
    change_cover: "カバーを変更",
    remove_cover: "カバーを削除",
    display_name: "表示名",
    bio: "自己紹介",
    auto_region: "自動地域",
    avatar_color: "アイコンの色",
    report_dialog_title: "このユーザーを通報",
    submit: "送信",
    report_hint: "通報は Machi の審査チームへ匿名で送られます。",
    block_title: "このユーザーをブロックしますか？",
    unblock_title: "このユーザーのブロックを解除しますか？",
    block_desc: "相手はあなたと交流できなくなり、あなたも相手の投稿を見なくなります。",
    unblock_desc: "解除すると、再び相手の投稿が表示されます。",
    toast_blocked: "ブロックしました",
    toast_unblocked: "ブロックを解除しました",
    toast_saved: "保存しました",
    err_select_image: "画像ファイルを選択してください",
    err_avatar_size: "アイコンは 5MB までです",
    err_cover_size: "カバーは 10MB までです",
    toast_avatar_uploaded: "アイコンをアップロードしました。保存後に反映されます",
    toast_cover_uploaded: "カバーをアップロードしました。保存後に反映されます",
    toast_report_submitted: "通報を送信しました",
    lt_secondhand: "中古",
    lt_rental: "賃貸",
    lt_job: "求人",
    lt_service: "地域サービス",
    lt_deal: "クーポン",
  },
  en: {
    edit_profile: "Edit profile",
    workbench: "My workbench",
    dm: "Message",
    follow: "Follow",
    following: "Following",
    joined_prefix: "Joined",
    stat_following: "Following",
    stat_followers: "Followers",
    stat_posts: "Posts",
    role_creator: "Creator",
    role_admin: "Admin",
    merchant_verified: "Merchant verified",
    merchant_pending: "Merchant under review",
    report: "Report",
    block: "Block",
    unblock: "Unblock",
    empty_replies: "No replies yet",
    empty_bookmarks: "No bookmarks yet",
    empty_likes: "No likes yet",
    empty_reposts: "No reposts yet",
    empty_media: "No photos or videos yet",
    empty_posts: "No posts yet",
    empty_sub_bookmarks: "Tap the bookmark on a post in your feed to save it here.",
    empty_sub_posts: "Share your first post so people can find you.",
    action_publish: "Post",
    action_browse: "Explore",
    reply_tpl: "Replied to @{handle}: {content}",
    edit_dialog_title: "Edit profile",
    cancel: "Cancel",
    save: "Save",
    avatar_label: "Avatar",
    avatar_hint: "JPG, PNG, WebP, GIF. Applied to your profile after you save.",
    change_avatar: "Change avatar",
    remove_image: "Remove",
    change_cover: "Change cover",
    remove_cover: "Remove cover",
    display_name: "Display name",
    bio: "Bio",
    auto_region: "Auto region",
    avatar_color: "Avatar color",
    report_dialog_title: "Report this user",
    submit: "Submit",
    report_hint: "Reports are sent anonymously to the Machi review team.",
    block_title: "Block this user?",
    unblock_title: "Unblock this user?",
    block_desc: "They won't be able to interact with you, and you won't see their content.",
    unblock_desc: "You'll see their content again once unblocked.",
    toast_blocked: "Blocked",
    toast_unblocked: "Unblocked",
    toast_saved: "Saved",
    err_select_image: "Please choose an image file",
    err_avatar_size: "Avatar must be under 5MB",
    err_cover_size: "Cover must be under 10MB",
    toast_avatar_uploaded: "Avatar uploaded — applied after you save",
    toast_cover_uploaded: "Cover uploaded — applied after you save",
    toast_report_submitted: "Report submitted",
    lt_secondhand: "Secondhand",
    lt_rental: "Rentals",
    lt_job: "Jobs",
    lt_service: "Services",
    lt_deal: "Deals",
  },
};

// Only accept plain http(s)/same-origin references with no characters that
// could break out of a CSS url("...") context (defence in depth against a
// crafted cover_url/avatar_url injecting CSS on a visitor's view). Anything
// else falls back to the gradient.
function safeImageUrl(raw?: string | null): string | null {
  if (!raw) return null;
  const url = raw.trim();
  if (!url) return null;
  if (/["'()\\\s]/.test(url)) return null;
  if (!/^https?:\/\//i.test(url) && !url.startsWith("/")) return null;
  return url;
}

const COVER_FALLBACK = "linear-gradient(140deg, rgb(var(--kx-accent) / 0.18), rgb(var(--kx-heat) / 0.15) 60%, rgb(var(--kx-repost) / 0.12))";
const DRAFT_COVER_FALLBACK = "linear-gradient(140deg, rgb(var(--kx-accent) / 0.16), rgb(var(--kx-heat) / 0.12))";

// Shared classes for the circular header action buttons — kx tokens so they
// adapt to dark mode (previously hard-coded bg-white / slate / blue).
const HEADER_ACTION_BTN =
  "grid h-11 w-11 place-items-center rounded-full border border-kx-stroke bg-kx-card text-kx-subtle shadow-kx transition hover:border-kx-accent/40 hover:bg-kx-accent/10 hover:text-kx-accent";

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
  const compose = useCompose((s) => s.open);
  const openAuthPrompt = useAuthPrompt((s) => s.open);
  const setSessionUser = useSession((s) => s.setUser);
  const queryClient = useQueryClient();
  const { locale, t } = useI18n();
  const L = COPY[profileLang(locale)];

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
  const profileRegionLabel = profileRegion ? regionDisplayName(profileRegion, locale) : "";
  const profileLocalRegionLabel = profileRegionLabel.split(" · ").slice(1).join(" · ") || profileRegionLabel;

  const [segment, setSegment] = useState<ProfileSegment>("posts");
  const [reportOpen, setReportOpen] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [following, setFollowing] = useState(user.is_following ?? false);
  const [blocked, setBlocked] = useState(user.is_blocked ?? false);
  const [draft, setDraft] = useState({
    display_name: user.display_name,
    bio: user.bio || "",
    avatar_color: user.avatar_color || "indigo",
    avatar_url: user.avatar_url || "",
    cover_url: user.cover_url || "",
  });
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [coverUploading, setCoverUploading] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const coverInputRef = useRef<HTMLInputElement | null>(null);

  const coverUrl = safeImageUrl(user.cover_url);
  const draftCoverUrl = safeImageUrl(draft.cover_url);

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
      avatar_color: user.avatar_color || "indigo",
      avatar_url: user.avatar_url || "",
      cover_url: user.cover_url || "",
    });
  }, [editOpen, user.display_name, user.bio, user.avatar_color, user.avatar_url, user.cover_url]);

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
      pushToast({ kind: "success", message: !blocked ? L.toast_blocked : L.toast_unblocked });
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
      pushToast({ kind: "success", message: L.toast_saved });
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
      pushToast({ kind: "error", message: L.err_select_image });
      return;
    }
    const max = purpose === "avatar" ? 5 * 1024 * 1024 : 10 * 1024 * 1024;
    if (file.size > max) {
      pushToast({ kind: "error", message: purpose === "avatar" ? L.err_avatar_size : L.err_cover_size });
      return;
    }
    if (purpose === "avatar") setAvatarUploading(true);
    else setCoverUploading(true);
    try {
      const media = await api.uploadMediaBase64(file, { purpose });
      setDraft((prev) => ({ ...prev, [purpose === "avatar" ? "avatar_url" : "cover_url"]: media.url }));
      pushToast({ kind: "success", message: purpose === "avatar" ? L.toast_avatar_uploaded : L.toast_cover_uploaded });
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
            background: coverUrl ? `center / cover no-repeat url("${coverUrl}")` : COVER_FALLBACK,
          }}
        />
        <div className="px-4 -mt-10 sm:-mt-14">
          <div className="flex items-end justify-between gap-3">
            <div className="rounded-kx-lg ring-4 ring-kx-bg bg-kx-bg">
              <Avatar user={user} size={72} className="sm:!w-[88px] sm:!h-[88px]" />
            </div>
            <div className="flex items-center gap-2 mb-2">
              <ShareButton
                url={`/u/${user.handle}`}
                title={`${user.display_name} · Machi`}
                compact
                className={HEADER_ACTION_BTN}
              />
              {isSelf ? (
                <>
                  <Link
                    href="/my/features"
                    className={clsx(HEADER_ACTION_BTN, "text-kx-text")}
                    aria-label={L.workbench}
                    title={L.workbench}
                  >
                    <LayoutDashboard className="w-5 h-5" />
                  </Link>
                  <button
                    type="button"
                    className="inline-flex h-11 items-center gap-2 rounded-full border border-kx-stroke bg-kx-card px-4 text-sm font-bold text-kx-text shadow-kx transition hover:border-kx-accent/40 hover:bg-kx-accent/10 hover:text-kx-accent"
                    onClick={() => setEditOpen(true)}
                  >
                    <Edit3 className="w-4 h-4" /> {L.edit_profile}
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className={HEADER_ACTION_BTN}
                    onClick={openDM}
                    aria-label={L.dm}
                    title={L.dm}
                  >
                    <MessageSquarePlus className="w-5 h-5" />
                  </button>
                  <button
                    type="button"
                    className={clsx(
                      "inline-flex h-11 items-center gap-2 rounded-full px-5 text-sm font-bold shadow-kx transition",
                      following
                        ? "border border-kx-stroke bg-kx-card text-kx-text hover:border-kx-accent/40 hover:bg-kx-accent/10 hover:text-kx-accent"
                        : "bg-kx-accent text-white hover:brightness-110",
                    )}
                    onClick={toggleFollow}
                  >
                    {following ? (<><UserCheck className="w-4 h-4" /> {L.following}</>) : (<><UserPlus className="w-4 h-4" /> {L.follow}</>)}
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="mt-3">
            <h1 className="text-xl font-bold inline-flex items-center gap-1.5">
              {user.display_name}
              {showOfficialBadge(user) ? <OfficialBadge /> : showVerifiedBadge(user) ? <VerifiedBadge /> : null}
            </h1>
            <div className="text-kx-muted text-sm">@{user.handle}</div>
            {user.bio ? <p className="mt-2 text-kx-text text-sm whitespace-pre-wrap break-words">{user.bio}</p> : null}
            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-kx-subtle">
              {profileRegion ? (
                <span className="inline-flex h-7 items-center gap-1.5 rounded-full border border-kx-accent/15 bg-kx-accent/[0.07] px-2.5 text-[12px] font-bold text-kx-accent shadow-[0_8px_22px_rgba(17,113,104,0.08)] dark:border-kx-accent/25 dark:bg-kx-accent/15">
                  <MapPin className="w-3.5 h-3.5" />
                  <span aria-hidden="true">{profileRegion.country_emoji}</span>
                  <span>{profileLocalRegionLabel}</span>
                </span>
              ) : null}
              {user.joined_at ? (
                <span className="inline-flex items-center gap-1"><Calendar className="w-3.5 h-3.5" /> {L.joined_prefix} {fullDateTime(user.joined_at).split(" ")[0]}</span>
              ) : null}
            </div>
            {/* Slim stats row — following / followers / posts are the three
                numbers users actually scan; total heat / views / saves were
                noise that lit up the header but nobody read. */}
            <div className="mt-2 flex items-center gap-4 text-sm flex-wrap">
              <Link href={`/u/${user.handle}/following`} className="hover:underline">
                <strong>{compactNumber(user.following_count || 0)}</strong>
                <span className="text-kx-muted ml-1">{L.stat_following}</span>
              </Link>
              <Link href={`/u/${user.handle}/followers`} className="hover:underline">
                <strong>{compactNumber(user.follower_count || 0)}</strong>
                <span className="text-kx-muted ml-1">{L.stat_followers}</span>
              </Link>
              <span><strong>{compactNumber(user.post_count || 0)}</strong> <span className="text-kx-muted">{L.stat_posts}</span></span>
            </div>
            {/* Self profile no longer stacks workbench entries — the top-right
                workbench button (/my/features) is the only entry; the profile
                just shows identity + content. Identity / status badges row
                mirrors iOS ProfileView ProfileRoleBadge strip. */}
            {showOfficialBadge(user) || (user.role && user.role !== "member") || user.is_merchant || user.merchant_verified || user.creator_badge ? (
              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
                {showOfficialBadge(user) ? <OfficialPill /> : null}
                {user.role && user.role !== "member" ? (
                  <span className="px-2 h-6 inline-flex items-center rounded-full bg-kx-accent/10 text-kx-accent font-bold">
                    {user.role === "creator" ? L.role_creator : user.role === "admin" ? L.role_admin : user.role}
                  </span>
                ) : null}
                {user.merchant_verified ? (
                  <span className="px-2 h-6 inline-flex items-center rounded-full bg-emerald-100 text-emerald-700 font-bold dark:bg-emerald-500/15 dark:text-emerald-300">{L.merchant_verified}</span>
                ) : user.is_merchant ? (
                  <span className="px-2 h-6 inline-flex items-center rounded-full bg-amber-100 text-amber-700 font-bold dark:bg-amber-500/15 dark:text-amber-300">{L.merchant_pending}</span>
                ) : null}
                {user.creator_badge ? (
                  <span className="px-2 h-6 inline-flex items-center rounded-full bg-pink-100 text-pink-700 font-bold dark:bg-pink-500/15 dark:text-pink-300">{user.creator_badge}</span>
                ) : null}
                {/* Admin-assigned custom tags — bordered chips. */}
                {(user.custom_tags || []).map((tag) => (
                  <span key={tag} className="px-2 h-6 inline-flex items-center rounded-full bg-kx-accent/[0.07] text-kx-accent font-bold ring-1 ring-kx-accent/30">{tag}</span>
                ))}
              </div>
            ) : null}
            {/* Tappable listing-count tags — jump to this user's posts of that type. */}
            <ProfileListingCountTags userId={user.id} counts={user.listing_counts} citySlug={profileRegion?.city_code || "tokyo"} copy={L} />
            {!isSelf ? (
              <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
                <button
                  type="button"
                  className="inline-flex h-8 items-center gap-1.5 rounded-full bg-kx-soft px-3 font-semibold text-kx-subtle transition hover:bg-kx-danger/10 hover:text-kx-danger"
                  onClick={() => (me ? setReportOpen(true) : openAuthPrompt("generic"))}
                >
                  <Flag className="w-3.5 h-3.5" /> {L.report}
                </button>
                <button
                  type="button"
                  className="inline-flex h-8 items-center gap-1.5 rounded-full bg-kx-soft px-3 font-semibold text-kx-subtle transition hover:bg-kx-danger/10 hover:text-kx-danger"
                  onClick={() => (me ? setBlockOpen(true) : openAuthPrompt("generic"))}
                >
                  <Shield className="w-3.5 h-3.5" /> {blocked ? L.unblock : L.block}
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
          <EmptyState
            title={
              segment === "replies" ? L.empty_replies
                : segment === "bookmarks" ? L.empty_bookmarks
                : segment === "likes" ? L.empty_likes
                : segment === "reposts" ? L.empty_reposts
                : segment === "media" ? L.empty_media
                : L.empty_posts
            }
            subtitle={
              isSelf
                ? (segment === "bookmarks" ? L.empty_sub_bookmarks : segment === "posts" ? L.empty_sub_posts : undefined)
                : undefined
            }
            action={
              isSelf && (segment === "posts" || segment === "media")
                ? { label: L.action_publish, onClick: () => compose() }
                : isSelf && segment === "bookmarks"
                  ? { label: L.action_browse, href: "/home" }
                  : undefined
            }
          />
        ) : segment === "replies" ? (
          (segmentQuery.data.items as KXComment[]).map((c) => (
            <div key={c.id} className="kx-card">
              <div className="flex items-center gap-1.5 text-sm">
                <Avatar user={c.author || undefined} size={28} />
                <span className="font-semibold">{c.author?.display_name}</span>
                <span className="text-kx-muted text-xs">@{c.author?.handle} · <time dateTime={c.created_at} suppressHydrationWarning>{relativeTime(c.created_at, locale)}</time></span>
              </div>
              <p className="mt-1.5 text-kx-text text-sm whitespace-pre-wrap break-words">{c.content}</p>
              {c.post ? (
                <Link href={`/p/${c.post.id}`} className="block mt-2 p-2.5 rounded-kx-md bg-kx-soft text-xs text-kx-subtle hover:bg-kx-stroke/30">
                  {L.reply_tpl.replace("{handle}", c.post.author?.handle || "").replace("{content}", c.post.content.slice(0, 80))}
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
        title={L.edit_dialog_title}
        footer={
          <>
            <button className="kx-button-ghost" onClick={() => setEditOpen(false)}>{L.cancel}</button>
            <button className="kx-button-primary" onClick={submitEdit}>{L.save}</button>
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
              <div className="text-sm font-semibold text-kx-text">{L.avatar_label}</div>
              <div className="mt-1 text-xs text-kx-muted">{L.avatar_hint}</div>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="kx-button-ghost h-8 px-3 text-xs"
                  onClick={() => avatarInputRef.current?.click()}
                  disabled={avatarUploading}
                >
                  {avatarUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
                  {L.change_avatar}
                </button>
                {draft.avatar_url ? (
                  <button
                    type="button"
                    className="kx-button-ghost h-8 px-3 text-xs"
                    onClick={() => setDraft({ ...draft, avatar_url: "" })}
                  >
                    <X className="w-3.5 h-3.5" />
                    {L.remove_image}
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
                background: draftCoverUrl ? `center / cover no-repeat url("${draftCoverUrl}")` : DRAFT_COVER_FALLBACK,
              }}
            />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button type="button" className="kx-button-ghost h-8 px-3 text-xs" onClick={() => coverInputRef.current?.click()} disabled={coverUploading}>
                {coverUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
                {L.change_cover}
              </button>
              {draft.cover_url ? (
                <button type="button" className="kx-button-ghost h-8 px-3 text-xs" onClick={() => setDraft({ ...draft, cover_url: "" })}>
                  <X className="w-3.5 h-3.5" />
                  {L.remove_cover}
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
            <span className="text-sm font-semibold">{L.display_name}</span>
            <input
              className="kx-input mt-1"
              maxLength={DISPLAY_NAME_MAX}
              value={draft.display_name}
              onChange={(e) => setDraft({ ...draft, display_name: e.target.value })}
            />
          </label>
          <label className="block">
            <span className="text-sm font-semibold">{L.bio}</span>
            <textarea
              className="kx-textarea mt-1 h-24"
              maxLength={BIO_MAX}
              value={draft.bio}
              onChange={(e) => setDraft({ ...draft, bio: e.target.value })}
            />
            <span className="mt-1 block text-right text-xs text-kx-muted">{draft.bio.length}/{BIO_MAX}</span>
          </label>
          {profileRegion ? (
            <div className="rounded-kx-md border border-kx-line/80 bg-kx-soft/55 px-3 py-2.5 text-sm text-kx-muted">
              <span className="block text-xs font-bold text-kx-subtle">{L.auto_region}</span>
              <span className="mt-1 inline-flex items-center gap-1.5 font-bold text-kx-text">
                <MapPin className="w-3.5 h-3.5 text-kx-accent" />
                <span aria-hidden="true">{profileRegion.country_emoji}</span>
                <span>{profileLocalRegionLabel}</span>
              </span>
            </div>
          ) : null}
          <div>
            <span className="text-sm font-semibold">{L.avatar_color}</span>
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
        title={L.report_dialog_title}
        footer={
          <>
            <button className="kx-button-ghost" onClick={() => setReportOpen(false)}>{L.cancel}</button>
            <button className="kx-button-primary" onClick={async () => {
              try {
                await api.reportUser(user.id, "inappropriate");
                setReportOpen(false);
                pushToast({ kind: "success", message: L.toast_report_submitted });
              } catch (err) {
                if (isAuthRequiredError(err)) {
                  openAuthPrompt("generic");
                  return;
                }
                pushToast({ kind: "error", message: (err as APIError).message });
              }
            }}>{L.submit}</button>
          </>
        }
      >
        <p className="text-sm text-kx-subtle"><BrandPhrase text={L.report_hint} /></p>
      </Dialog>

      <ConfirmDialog
        open={blockOpen}
        title={blocked ? L.unblock_title : L.block_title}
        description={blocked ? L.unblock_desc : L.block_desc}
        destructive={!blocked}
        confirmLabel={blocked ? L.unblock : L.block}
        onConfirm={submitBlock}
        onCancel={() => setBlockOpen(false)}
      />
    </div>
  );
}

// Tappable listing-count tags on a profile: "Secondhand 5" → that seller's
// secondhand listings (channel page reads ?seller=). Mirrors iOS.
const LISTING_TAG_META: Record<string, { labelKey: string; channel: string }> = {
  secondhand: { labelKey: "lt_secondhand", channel: "marketplace" },
  rental: { labelKey: "lt_rental", channel: "rentals" },
  job: { labelKey: "lt_job", channel: "jobs" },
  hiring: { labelKey: "lt_job", channel: "jobs" },
  local_service: { labelKey: "lt_service", channel: "services" },
  discount: { labelKey: "lt_deal", channel: "deals" },
};

function ProfileListingCountTags({ userId, counts, citySlug, copy }: { userId: string; counts?: Record<string, number>; citySlug: string; copy: Record<string, string> }) {
  if (!counts) return null;
  // job + hiring both map to the jobs channel — merge so we show one "Jobs N".
  const merged = new Map<string, { labelKey: string; channel: string; count: number }>();
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
          {copy[tag.labelKey] || tag.labelKey}
          <span className="grid h-4 min-w-4 place-items-center rounded-full bg-kx-accent/10 px-1 text-kx-accent">{tag.count}</span>
        </Link>
      ))}
    </div>
  );
}
