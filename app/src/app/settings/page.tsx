"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  Bell,
  Bookmark,
  ChevronRight,
  Download,
  Eraser,
  FileText,
  HelpCircle,
  Languages,
  LayoutDashboard,
  LogOut,
  MapPin,
  MessageSquareWarning,
  Palette,
  Shield,
  Smartphone,
  Sparkles,
  Store,
  Trash2,
  User as UserIcon,
  KeyRound,
  Link2,
} from "lucide-react";
import { CONTENT_LANGUAGE_LABELS, type ContentLanguage } from "@/lib/types";
import { useLanguagePreference } from "@/lib/store";
import clsx from "clsx";
import { api, APIError } from "@/lib/api";
import { AppShell } from "@/components/shell/AppShell";
import { RegionPickerDialog } from "@/components/feed/RegionPickerDialog";
import { ErrorState, InlineLoading } from "@/components/design/States";
import { ConfirmDialog, Dialog } from "@/components/design/Dialog";
import { useSession, useSettings, useToasts } from "@/lib/store";
import { useI18n } from "@/lib/i18n";
import { BrandPhrase } from "@/components/marketing/BrandText";
import { regionAccountPatch, regionDisplayName, regionFromUser, type RegionInfo } from "@/lib/regions";
import { PASSWORD_MIN } from "@/lib/authValidation";

// ---------------------------------------------------------------------------
// Local three-language copy. The shared i18n dictionary (lib/i18n.tsx) is owned
// by another workstream and its `t()` is type-locked to existing keys, so this
// account-critical page carries its own zh / ja / en table — mirroring the
// established authLocale.ts pattern — to satisfy the hard tri-lingual rule
// without cross-file churn. Reuses the app locale from useI18n().
// ---------------------------------------------------------------------------
type Lang = "zh" | "ja" | "en";
function settingsLang(locale: string): Lang {
  if (locale === "ja") return "ja";
  if (locale === "en") return "en";
  return "zh";
}

const COPY: Record<Lang, Record<string, string>> = {
  zh: {
    sec_account: "账号",
    sec_prefs: "偏好",
    sec_notifications: "通知",
    sec_privacy: "隐私",
    sec_recommend: "内容推荐",
    sec_data: "数据与本地缓存",
    sec_commerce: "商业化",
    sec_support: "支持",
    sec_security: "账号与安全",
    edit_profile: "编辑资料",
    workbench: "我的工作台",
    workbench_sub: "发布、咨询、订单和会员入口",
    change_password: "修改密码",
    google_account: "Google 账号",
    google_linked_sub: "已绑定 · 可用 Google 一键登录",
    google_unlinked_sub: "绑定后可用 Google 一键登录",
    devices: "登录设备",
    region: "地区设置",
    region_switch: "切换",
    ui_language: "界面语言",
    content_language: "内容语言",
    content_language_sub: "决定推荐与热榜优先展示哪种语言的投稿",
    content_lang_follow: "跟随 App 语言",
    content_lang_multi: "多语言内容",
    notif_likes: "点赞通知",
    notif_comments: "评论通知",
    notif_follows: "关注通知",
    notif_messages: "私信通知",
    privacy_protect: "账号保护模式",
    privacy_protect_sub: "开启后非粉丝无法查看你的帖子",
    allow_dm: "允许接收私信",
    dm_everyone: "所有人",
    dm_following: "我关注的人",
    dm_nobody: "不接收",
    blocklist: "黑名单",
    rec_following: "基于关注关系推荐",
    rec_topics: "基于话题推荐",
    bookmarks: "收藏列表",
    drafts: "草稿箱",
    export_data: "数据导出",
    clear_cache: "清除缓存",
    merchant_verified_label: "商家认证(已通过)",
    merchant_pending_label: "商家认证(待审核)",
    merchant_apply_label: "申请商家认证",
    merchant_verified_sub: "可发布商家、优惠、服务等商家内容",
    merchant_apply_sub: "认证后可发布商家、优惠、服务等内容",
    help_center: "帮助中心",
    feedback: "反馈问题",
    logout: "退出登录",
    delete_account: "删除账号",
    footer: "Machi Web v1.0 · 与 iOS App 共享同一套账号、地区内容与 API。",
    cancel: "取消",
    save: "保存",
    pw_title: "修改密码",
    pw_current: "当前密码",
    pw_new: "新密码",
    pw_confirm: "确认新密码",
    pw_hint: "至少 8 位，包含字母和数字",
    merchant_dialog_title: "申请商家认证",
    merchant_submit: "提交申请",
    merchant_submitting: "提交中…",
    merchant_intro: "请填写真实公司信息和服务内容。认证通过后可发布商家、服务、优惠和合作类内容。",
    merchant_company: "公司 / 店铺名称",
    merchant_service: "服务内容",
    merchant_service_ph: "提供什么服务、服务范围、适合人群、收费方式等",
    merchant_contact: "联系方式",
    merchant_website: "官网 / 社媒链接",
    merchant_address: "地址 / 服务区域",
    merchant_license: "营业执照 / 资质说明",
    logout_title: "确认退出登录？",
    logout_desc: "退出后需要重新输入用户名和密码登录。",
    logout_confirm: "退出",
    delete_title: "永久删除账号？",
    delete_desc: "账号删除后，你的帖子、评论、私信将无法恢复。该操作不可撤销。",
    delete_confirm: "永久删除",
    delete_pw_label: "输入登录密码以确认",
    delete_pw_ph: "当前登录密码",
    delete_handle_label: "输入你的用户名以确认",
    delete_handle_hint: "该账号使用 Google 登录。请输入用户名 @{handle} 以确认删除。",
    delete_wrong_password: "密码不正确，请重试。",
    delete_handle_mismatch: "用户名不匹配。",
    unlink_title: "解绑 Google 账号？",
    unlink_desc: "解绑后将无法使用 Google 一键登录，仍可用用户名 / 邮箱和密码登录。",
    unlink_confirm: "解绑",
    processing: "处理中…",
    region_switch_title: "切换国家？",
    region_switch_desc: "切换国家会同时影响首页、发现、资讯和发布页可选择的城市。确认切换吗？",
    region_switch_confirm: "切换",
    toast_google_linked: "已绑定 Google 账号",
    toast_logged_out: "已退出登录",
    toast_account_deleted: "账号已删除",
    toast_password_updated: "密码已更新",
    err_current_password: "请输入当前密码",
    err_password_policy: "密码至少 8 位，且需同时包含字母和数字",
    err_password_mismatch: "两次输入不一致",
    err_google_start: "无法开始 Google 绑定",
    toast_google_unlinked: "已解绑 Google 账号",
    info_bind_email_first: "请先绑定邮箱并设置登录密码，再解绑 Google。",
    toast_switched_region: "已切换到 {city}",
    toast_exported: "已导出",
    toast_cache_cleared: "已清除缓存",
    toast_merchant_submitted: "商家认证申请已提交，管理员会审核公司和服务信息。",
    info_already_merchant: "已是认证商家",
    info_merchant_review: "审核中，可重新提交补充资料。",
    merchant_missing_prefix: "请补充",
    google_err_already_linked: "该 Google 账号已绑定到其他 Machi 账号。",
    google_err_already_other: "当前账号已绑定了另一个 Google 账号，请先解绑。",
    google_err_state_expired: "绑定会话已过期，请重试。",
    google_err_denied: "已取消 Google 授权。",
    google_err_generic: "Google 绑定失败，请重试。",
  },
  ja: {
    sec_account: "アカウント",
    sec_prefs: "環境設定",
    sec_notifications: "通知",
    sec_privacy: "プライバシー",
    sec_recommend: "コンテンツのおすすめ",
    sec_data: "データとローカルキャッシュ",
    sec_commerce: "ビジネス",
    sec_support: "サポート",
    sec_security: "アカウントとセキュリティ",
    edit_profile: "プロフィール編集",
    workbench: "マイ・ワークベンチ",
    workbench_sub: "投稿・相談・注文・会員の入り口",
    change_password: "パスワード変更",
    google_account: "Google アカウント",
    google_linked_sub: "連携済み · Google ワンタップでログイン可能",
    google_unlinked_sub: "連携すると Google でワンタップログインできます",
    devices: "ログイン端末",
    region: "地域設定",
    region_switch: "変更",
    ui_language: "表示言語",
    content_language: "コンテンツ言語",
    content_language_sub: "おすすめや話題で優先表示する投稿の言語を決めます",
    content_lang_follow: "アプリの言語に合わせる",
    content_lang_multi: "多言語コンテンツ",
    notif_likes: "いいね通知",
    notif_comments: "コメント通知",
    notif_follows: "フォロー通知",
    notif_messages: "メッセージ通知",
    privacy_protect: "アカウント保護モード",
    privacy_protect_sub: "オンにするとフォロワー以外は投稿を見られません",
    allow_dm: "メッセージの受信",
    dm_everyone: "全員",
    dm_following: "フォロー中の人",
    dm_nobody: "受け取らない",
    blocklist: "ブロックリスト",
    rec_following: "フォロー関係に基づくおすすめ",
    rec_topics: "話題に基づくおすすめ",
    bookmarks: "保存リスト",
    drafts: "下書き",
    export_data: "データエクスポート",
    clear_cache: "キャッシュを消去",
    merchant_verified_label: "事業者認証（承認済み）",
    merchant_pending_label: "事業者認証（審査中）",
    merchant_apply_label: "事業者認証を申請",
    merchant_verified_sub: "事業者・クーポン・サービスなどを投稿できます",
    merchant_apply_sub: "認証後は事業者・クーポン・サービスなどを投稿できます",
    help_center: "ヘルプセンター",
    feedback: "フィードバック",
    logout: "ログアウト",
    delete_account: "アカウント削除",
    footer: "Machi Web v1.0 · iOS アプリとアカウント・地域コンテンツ・API を共有します。",
    cancel: "キャンセル",
    save: "保存",
    pw_title: "パスワード変更",
    pw_current: "現在のパスワード",
    pw_new: "新しいパスワード",
    pw_confirm: "新しいパスワード（確認）",
    pw_hint: "8文字以上、英字と数字を含める",
    merchant_dialog_title: "事業者認証を申請",
    merchant_submit: "申請する",
    merchant_submitting: "送信中…",
    merchant_intro: "正確な会社情報とサービス内容をご記入ください。承認後、事業者・サービス・クーポン・提携などの投稿ができます。",
    merchant_company: "会社・店舗名",
    merchant_service: "サービス内容",
    merchant_service_ph: "提供サービス・対応範囲・対象・料金など",
    merchant_contact: "連絡先",
    merchant_website: "公式サイト・SNS リンク",
    merchant_address: "住所・対応エリア",
    merchant_license: "営業許可・資格の説明",
    logout_title: "ログアウトしますか？",
    logout_desc: "再度ログインするにはユーザー名とパスワードが必要です。",
    logout_confirm: "ログアウト",
    delete_title: "アカウントを完全に削除しますか？",
    delete_desc: "削除すると投稿・コメント・メッセージは復元できません。この操作は取り消せません。",
    delete_confirm: "完全に削除",
    delete_pw_label: "確認のためログインパスワードを入力",
    delete_pw_ph: "現在のログインパスワード",
    delete_handle_label: "確認のためユーザー名を入力",
    delete_handle_hint: "このアカウントは Google ログインです。削除するにはユーザー名 @{handle} を入力してください。",
    delete_wrong_password: "パスワードが正しくありません。",
    delete_handle_mismatch: "ユーザー名が一致しません。",
    unlink_title: "Google アカウントの連携を解除しますか？",
    unlink_desc: "解除後は Google ログインが使えなくなりますが、ユーザー名／メールとパスワードでログインできます。",
    unlink_confirm: "連携解除",
    processing: "処理中…",
    region_switch_title: "国を切り替えますか？",
    region_switch_desc: "国を切り替えると、ホーム・発見・ニュース・投稿で選べる都市が変わります。切り替えますか？",
    region_switch_confirm: "切り替える",
    toast_google_linked: "Google アカウントを連携しました",
    toast_logged_out: "ログアウトしました",
    toast_account_deleted: "アカウントを削除しました",
    toast_password_updated: "パスワードを更新しました",
    err_current_password: "現在のパスワードを入力してください",
    err_password_policy: "パスワードは8文字以上で、英字と数字を両方含めてください",
    err_password_mismatch: "パスワードが一致しません",
    err_google_start: "Google 連携を開始できません",
    toast_google_unlinked: "Google 連携を解除しました",
    info_bind_email_first: "先にメールとパスワードを設定してから Google を解除してください。",
    toast_switched_region: "{city} に切り替えました",
    toast_exported: "エクスポートしました",
    toast_cache_cleared: "キャッシュを消去しました",
    toast_merchant_submitted: "事業者認証を申請しました。管理者が会社・サービス情報を審査します。",
    info_already_merchant: "すでに認証事業者です",
    info_merchant_review: "審査中です。追加資料を再提出できます。",
    merchant_missing_prefix: "未入力",
    google_err_already_linked: "この Google アカウントは別の Machi アカウントに連携済みです。",
    google_err_already_other: "現在のアカウントは別の Google アカウントに連携済みです。先に解除してください。",
    google_err_state_expired: "連携セッションの有効期限が切れました。もう一度お試しください。",
    google_err_denied: "Google の認可をキャンセルしました。",
    google_err_generic: "Google 連携に失敗しました。もう一度お試しください。",
  },
  en: {
    sec_account: "Account",
    sec_prefs: "Preferences",
    sec_notifications: "Notifications",
    sec_privacy: "Privacy",
    sec_recommend: "Recommendations",
    sec_data: "Data & cache",
    sec_commerce: "Business",
    sec_support: "Support",
    sec_security: "Account & security",
    edit_profile: "Edit profile",
    workbench: "My workbench",
    workbench_sub: "Posts, inquiries, orders and membership",
    change_password: "Change password",
    google_account: "Google account",
    google_linked_sub: "Linked · one-tap Google sign-in",
    google_unlinked_sub: "Link to enable one-tap Google sign-in",
    devices: "Devices",
    region: "Region",
    region_switch: "Switch",
    ui_language: "Interface language",
    content_language: "Content language",
    content_language_sub: "Which language's posts get priority in recommendations and Trending",
    content_lang_follow: "Follow app language",
    content_lang_multi: "Multilingual",
    notif_likes: "Like notifications",
    notif_comments: "Comment notifications",
    notif_follows: "Follow notifications",
    notif_messages: "Message notifications",
    privacy_protect: "Protected account",
    privacy_protect_sub: "When on, non-followers can't see your posts",
    allow_dm: "Who can message you",
    dm_everyone: "Everyone",
    dm_following: "People I follow",
    dm_nobody: "No one",
    blocklist: "Blocklist",
    rec_following: "Recommend based on who you follow",
    rec_topics: "Recommend based on topics",
    bookmarks: "Bookmarks",
    drafts: "Drafts",
    export_data: "Export data",
    clear_cache: "Clear cache",
    merchant_verified_label: "Merchant verified",
    merchant_pending_label: "Merchant (under review)",
    merchant_apply_label: "Apply for merchant verification",
    merchant_verified_sub: "You can post merchant, deals and service content",
    merchant_apply_sub: "Verify to post merchant, deals and service content",
    help_center: "Help center",
    feedback: "Feedback",
    logout: "Log out",
    delete_account: "Delete account",
    footer: "Machi Web v1.0 · Shares one account, regional content and API with the iOS app.",
    cancel: "Cancel",
    save: "Save",
    pw_title: "Change password",
    pw_current: "Current password",
    pw_new: "New password",
    pw_confirm: "Confirm new password",
    pw_hint: "At least 8 characters with letters and numbers",
    merchant_dialog_title: "Apply for merchant verification",
    merchant_submit: "Submit",
    merchant_submitting: "Submitting…",
    merchant_intro: "Enter accurate company and service details. Once verified you can post merchant, service, deals and partnership content.",
    merchant_company: "Company / store name",
    merchant_service: "Services",
    merchant_service_ph: "What you offer, coverage, audience, pricing…",
    merchant_contact: "Contact",
    merchant_website: "Website / social link",
    merchant_address: "Address / service area",
    merchant_license: "License / credentials",
    logout_title: "Log out?",
    logout_desc: "You'll need to enter your username and password to sign back in.",
    logout_confirm: "Log out",
    delete_title: "Permanently delete your account?",
    delete_desc: "Your posts, comments and messages can't be recovered. This can't be undone.",
    delete_confirm: "Delete permanently",
    delete_pw_label: "Enter your login password to confirm",
    delete_pw_ph: "Your current login password",
    delete_handle_label: "Type your username to confirm",
    delete_handle_hint: "This account uses Google sign-in. Type your username @{handle} to confirm deletion.",
    delete_wrong_password: "Password is incorrect. Please try again.",
    delete_handle_mismatch: "Username doesn't match.",
    unlink_title: "Unlink Google account?",
    unlink_desc: "After unlinking you can't use Google sign-in, but you can still log in with your username / email and password.",
    unlink_confirm: "Unlink",
    processing: "Working…",
    region_switch_title: "Switch country?",
    region_switch_desc: "Switching country changes the cities available on Home, Explore, News and when posting. Continue?",
    region_switch_confirm: "Switch",
    toast_google_linked: "Google account linked",
    toast_logged_out: "Logged out",
    toast_account_deleted: "Account deleted",
    toast_password_updated: "Password updated",
    err_current_password: "Enter your current password",
    err_password_policy: "Password must be at least 8 characters with both letters and numbers",
    err_password_mismatch: "Passwords don't match",
    err_google_start: "Couldn't start Google linking",
    toast_google_unlinked: "Google account unlinked",
    info_bind_email_first: "Add an email and set a login password before unlinking Google.",
    toast_switched_region: "Switched to {city}",
    toast_exported: "Exported",
    toast_cache_cleared: "Cache cleared",
    toast_merchant_submitted: "Merchant application submitted. An admin will review your company and service details.",
    info_already_merchant: "You're already a verified merchant",
    info_merchant_review: "Under review — you can resubmit with more details.",
    merchant_missing_prefix: "Please add",
    google_err_already_linked: "This Google account is already linked to another Machi account.",
    google_err_already_other: "This account is already linked to a different Google account. Unlink it first.",
    google_err_state_expired: "The linking session expired. Please try again.",
    google_err_denied: "Google authorization was cancelled.",
    google_err_generic: "Google linking failed. Please try again.",
  },
};

const GOOGLE_LINK_ERROR_KEY: Record<string, string> = {
  google_already_linked: "google_err_already_linked",
  already_linked_other: "google_err_already_other",
  state_expired: "google_err_state_expired",
  google_denied: "google_err_denied",
};

// A password is "settable/verifiable" when the account isn't Google-only: either
// it never used Google (username/password account) or it has linked Google but
// also has email+password (can_unlink_google mirrors that server-side).
function accountHasPassword(user: { has_google?: boolean; can_unlink_google?: boolean } | null | undefined): boolean {
  if (!user) return true;
  return !user.has_google || !!user.can_unlink_google;
}

export default function SettingsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const user = useSession((s) => s.user);
  const setUser = useSession((s) => s.setUser);
  const setSettings = useSettings((s) => s.setSettings);
  const setAppearance = useSettings((s) => s.setAppearance);
  // The effective client theme preference — includes "system", which the
  // server settings enum can't represent, so the select binds to this.
  const appearancePref = useSettings((s) => s.appearance);
  const pushToast = useToasts((s) => s.push);
  const { t, locale } = useI18n();
  const L = COPY[settingsLang(locale)];
  const tr = (key: string, vars?: Record<string, string>) => {
    let out = L[key] ?? COPY.zh[key] ?? key;
    if (vars) for (const [k, v] of Object.entries(vars)) out = out.replace(`{${k}}`, v);
    return out;
  };
  const [pwOpen, setPwOpen] = useState(false);
  const [pwForm, setPwForm] = useState({ current: "", password: "", confirm: "" });
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmInput, setDeleteConfirmInput] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [unlinkGoogleOpen, setUnlinkGoogleOpen] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [regionOpen, setRegionOpen] = useState(false);
  const [pendingRegion, setPendingRegion] = useState<RegionInfo | null>(null);
  const [merchantOpen, setMerchantOpen] = useState(false);
  const [merchantBusy, setMerchantBusy] = useState(false);
  const [merchantForm, setMerchantForm] = useState({
    companyName: "",
    serviceSummary: "",
    contact: "",
    website: "",
    address: "",
    license: "",
  });
  const contentLanguage = useLanguagePreference((s) => s.preferred);
  const setContentLanguage = useLanguagePreference((s) => s.setPreferred);
  const currentRegion = regionFromUser(user);
  const hasPassword = accountHasPassword(user);

  const settings = useQuery({
    queryKey: ["settings"],
    queryFn: () => api.settings(),
  });

  // Returning from the Google bind round-trip lands here with ?google=linked
  // or ?google_error=<code>; surface it, refresh the user, then clean the URL.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const linked = params.get("google");
    const failed = params.get("google_error");
    if (!linked && !failed) return;
    if (linked === "linked") {
      pushToast({ kind: "success", message: tr("toast_google_linked") });
      api.me().then(setUser).catch(() => {});
    } else if (failed) {
      pushToast({ kind: "error", message: tr(GOOGLE_LINK_ERROR_KEY[failed] || "google_err_generic") });
    }
    const url = new URL(window.location.href);
    url.searchParams.delete("google");
    url.searchParams.delete("google_error");
    window.history.replaceState({}, "", `${url.pathname}${url.search}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pushToast, setUser]);

  if (settings.isLoading) {
    return (
      <AppShell>
        <InlineLoading />
      </AppShell>
    );
  }
  if (settings.isError || !settings.data) {
    return (
      <AppShell>
        <ErrorState onRetry={() => settings.refetch()} />
      </AppShell>
    );
  }

  const s = settings.data;
  const uiLanguage = s.language || locale;
  const uiLanguageLabel = uiLanguage === "zh-Hans" ? "简体中文" : uiLanguage === "en" ? "English" : uiLanguage === "ja" ? "日本語" : "简体中文";

  const patch = async (input: Partial<typeof s>) => {
    try {
      const next = await api.updateSettings(input);
      queryClient.setQueryData(["settings"], next);
      setSettings(next);
      if (input.appearance === "light" || input.appearance === "dark") setAppearance(input.appearance);
    } catch (err) {
      pushToast({ kind: "error", message: (err as APIError).message });
    }
  };

  const onLogout = async () => {
    try {
      await api.logout();
    } catch {
      // ignore — local state is what matters
    }
    setUser(null);
    queryClient.clear();
    pushToast({ kind: "success", message: tr("toast_logged_out") });
    router.replace("/login");
  };

  const onDelete = async () => {
    // High-risk, irreversible + PII: require re-authentication before deleting.
    // Password accounts re-verify the password; Google-only accounts (no
    // password to verify) must type their exact @handle instead.
    setDeleteBusy(true);
    try {
      if (hasPassword) {
        const res = await api.verifyPassword(deleteConfirmInput);
        if (!res.ok) {
          pushToast({ kind: "error", message: res.message || tr("delete_wrong_password") });
          setDeleteBusy(false);
          return;
        }
      } else {
        const typed = deleteConfirmInput.trim().replace(/^@+/, "").toLowerCase();
        if (!typed || typed !== (user?.handle || "").toLowerCase()) {
          pushToast({ kind: "error", message: tr("delete_handle_mismatch") });
          setDeleteBusy(false);
          return;
        }
      }
      await api.deleteMe();
      pushToast({ kind: "success", message: tr("toast_account_deleted") });
      setUser(null);
      queryClient.clear();
      router.replace("/login");
    } catch (err) {
      pushToast({ kind: "error", message: (err as APIError).message });
      setDeleteBusy(false);
    }
  };

  const closeDeleteDialog = () => {
    if (deleteBusy) return;
    setDeleteOpen(false);
    setDeleteConfirmInput("");
  };

  const onChangePassword = async () => {
    if (!pwForm.current) {
      pushToast({ kind: "error", message: tr("err_current_password") });
      return;
    }
    // Match the registration policy exactly: >= PASSWORD_MIN and both a letter
    // and a digit — so a password can never be *downgraded* to a weaker one
    // than sign-up allows, and the message matches what the backend enforces.
    if (
      pwForm.password.length < PASSWORD_MIN ||
      !/[A-Za-z]/.test(pwForm.password) ||
      !/\d/.test(pwForm.password)
    ) {
      pushToast({ kind: "error", message: tr("err_password_policy") });
      return;
    }
    if (pwForm.password !== pwForm.confirm) {
      pushToast({ kind: "error", message: tr("err_password_mismatch") });
      return;
    }
    try {
      // The backend enforces changes via POST /api/auth/change-password,
      // which requires the current password. updateMe does not change the
      // password, so calling it here always no-op'd / failed.
      await api.changePassword(pwForm.current, pwForm.password);
      setPwOpen(false);
      setPwForm({ current: "", password: "", confirm: "" });
      pushToast({ kind: "success", message: tr("toast_password_updated") });
    } catch (err) {
      pushToast({ kind: "error", message: (err as APIError).message });
    }
  };

  const startGoogleLink = async () => {
    setGoogleBusy(true);
    try {
      const result = await api.googleLinkStart("/settings");
      window.location.href = result.authorization_url || result.url || "";
    } catch (err) {
      setGoogleBusy(false);
      pushToast({ kind: "error", message: (err as APIError).message || tr("err_google_start") });
    }
  };

  const onUnlinkGoogle = async () => {
    setGoogleBusy(true);
    try {
      const res = await api.googleUnlink();
      if (res.user) setUser(res.user);
      setUnlinkGoogleOpen(false);
      pushToast({ kind: "success", message: res.message || tr("toast_google_unlinked") });
    } catch (err) {
      pushToast({ kind: "error", message: (err as APIError).message });
    } finally {
      setGoogleBusy(false);
    }
  };

  const onGoogleRow = () => {
    if (googleBusy) return;
    if (user?.has_google) {
      if (user?.can_unlink_google) setUnlinkGoogleOpen(true);
      else pushToast({ kind: "info", message: tr("info_bind_email_first") });
    } else {
      void startGoogleLink();
    }
  };

  const submitMerchantApplication = async () => {
    const required = [
      ["companyName", tr("merchant_company")],
      ["serviceSummary", tr("merchant_service")],
      ["contact", tr("merchant_contact")],
    ] as const;
    const missing = required
      .filter(([key]) => !merchantForm[key].trim())
      .map(([, label]) => label);
    if (missing.length) {
      pushToast({ kind: "error", message: `${tr("merchant_missing_prefix")}: ${missing.join(" · ")}` });
      return;
    }
    setMerchantBusy(true);
    try {
      await api.submitFeedback({
        category: "merchant_application",
        content: [
          `公司/店铺: ${merchantForm.companyName}`,
          `服务内容: ${merchantForm.serviceSummary}`,
          `联系方式: ${merchantForm.contact}`,
          `官网/社媒: ${merchantForm.website || "未填写"}`,
          `地址/服务区域: ${merchantForm.address || "未填写"}`,
          `资质/执照: ${merchantForm.license || "未填写"}`,
        ].join("\n"),
      });
      const next = await api.updateMe({ is_merchant: true });
      setUser(next);
      setMerchantOpen(false);
      pushToast({ kind: "success", message: tr("toast_merchant_submitted") });
    } catch (err) {
      pushToast({ kind: "error", message: (err as APIError).message });
    } finally {
      setMerchantBusy(false);
    }
  };

  const commitRegionSwitch = async (region: RegionInfo) => {
    try {
      const next = await api.updateRegionLanguage(regionAccountPatch(region));
      setUser(next);
      queryClient.invalidateQueries({ queryKey: ["feed"] });
      pushToast({ kind: "success", message: tr("toast_switched_region", { city: region.city_name }) });
    } catch (err) {
      pushToast({ kind: "error", message: (err as APIError).message });
    }
  };

  const onSelectRegion = async (region: RegionInfo) => {
    // Switching to a different *country* is disruptive (changes every city
    // picker across the app), so gate it behind an in-app ConfirmDialog rather
    // than a native window.confirm. Same-country switches apply immediately.
    if (user?.country && region.country_code !== user.country) {
      setPendingRegion(region);
      return;
    }
    await commitRegionSwitch(region);
  };

  const exportData = async () => {
    try {
      const data = await api.exportData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `machi-export-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(link.href);
      pushToast({ kind: "success", message: tr("toast_exported") });
    } catch (err) {
      pushToast({ kind: "error", message: (err as APIError).message });
    }
  };

  const deleteConfirmReady = deleteConfirmInput.trim().length > 0;

  return (
    <AppShell>
      <header className="sticky top-0 z-30 kx-glass-bar px-3 py-2">
        <h1 className="text-lg font-bold">{t("settings_title")}</h1>
      </header>
      <div className="px-3 sm:px-4 py-4 space-y-4">
        <Section title={L.sec_account}>
          <Row icon={UserIcon} label={L.edit_profile} sub={`@${user?.handle}`} href="/me" />
          <Row icon={LayoutDashboard} label={L.workbench} sub={L.workbench_sub} href="/my/features" />
          <Row
            icon={Sparkles}
            label={t("mem_title")}
            sub={user?.is_verified_member ? t("mem_status_active") : t("mem_status_inactive")}
            href="/membership"
          />
          <Row icon={KeyRound} label={L.change_password} onClick={() => setPwOpen(true)} />
          <Row
            icon={Link2}
            label={L.google_account}
            sub={user?.has_google ? L.google_linked_sub : L.google_unlinked_sub}
            onClick={onGoogleRow}
          />
          <Row icon={Smartphone} label={L.devices} href="/settings/devices" />
        </Section>

        <Section title={L.sec_prefs}>
          <RowSwitch icon={MapPin} label={L.region} valueLabel={regionDisplayName(currentRegion, locale)}>
            <button type="button" onClick={() => setRegionOpen(true)} className="rounded-full px-2.5 py-1 text-sm font-bold text-kx-accent transition hover:bg-kx-accent/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kx-accent/40">
              {L.region_switch}
            </button>
          </RowSwitch>
          <RowSwitch icon={Languages} label={L.ui_language} valueLabel={uiLanguageLabel}>
            <select
              className="kx-input h-8 px-2 w-32"
              value={uiLanguage}
              onChange={(e) => patch({ language: e.target.value })}
            >
              <option value="zh-Hans">简体中文</option>
              <option value="en">English</option>
              <option value="ja">日本語</option>
            </select>
          </RowSwitch>
          <RowSwitch
            icon={Languages}
            label={L.content_language}
            sub={L.content_language_sub}
            valueLabel={CONTENT_LANGUAGE_LABELS[contentLanguage]}
          >
            <select
              className="kx-input h-8 px-2 w-32"
              value={contentLanguage}
              onChange={(e) => setContentLanguage(e.target.value as ContentLanguage)}
            >
              <option value="followApp">{L.content_lang_follow}</option>
              <option value="zh">中文</option>
              <option value="en">English</option>
              <option value="ja">日本語</option>
              <option value="ko">한국어</option>
              <option value="fr">Français</option>
              <option value="es">Español</option>
              <option value="multi">{L.content_lang_multi}</option>
            </select>
          </RowSwitch>
          <RowSwitch
            icon={Palette}
            label={t("settings_appearance")}
            valueLabel={
              appearancePref === "system"
                ? t("settings_appearance_system")
                : appearancePref === "dark"
                  ? t("settings_appearance_dark")
                  : t("settings_appearance_light")
            }
          >
            <select
              className="kx-input h-8 px-2 w-32"
              value={appearancePref}
              onChange={(e) => {
                const next = e.target.value as "light" | "dark" | "system";
                if (next === "system") {
                  // Client-only preference — the server enum has no "system".
                  setAppearance("system");
                } else {
                  patch({ appearance: next });
                }
              }}
            >
              <option value="system">{t("settings_appearance_system")}</option>
              <option value="light">{t("settings_appearance_light")}</option>
              <option value="dark">{t("settings_appearance_dark")}</option>
            </select>
          </RowSwitch>
        </Section>

        <Section title={L.sec_notifications}>
          <RowToggle icon={Bell} label={L.notif_likes} checked={s.push_likes} onChange={(v) => patch({ push_likes: v })} />
          <RowToggle icon={Bell} label={L.notif_comments} checked={s.push_comments} onChange={(v) => patch({ push_comments: v })} />
          <RowToggle icon={Bell} label={L.notif_follows} checked={s.push_follows} onChange={(v) => patch({ push_follows: v })} />
          <RowToggle icon={Bell} label={L.notif_messages} checked={s.push_messages} onChange={(v) => patch({ push_messages: v })} />
        </Section>

        <Section title={L.sec_privacy}>
          <RowToggle icon={Shield} label={L.privacy_protect} sub={L.privacy_protect_sub} checked={s.privacy_protect} onChange={(v) => patch({ privacy_protect: v })} />
          <RowSwitch icon={Shield} label={L.allow_dm} valueLabel={s.privacy_allow_dm === "everyone" ? L.dm_everyone : s.privacy_allow_dm === "following" ? L.dm_following : L.dm_nobody}>
            <select
              className="kx-input h-8 px-2 w-32"
              value={s.privacy_allow_dm}
              onChange={(e) => patch({ privacy_allow_dm: e.target.value as typeof s.privacy_allow_dm })}
            >
              <option value="everyone">{L.dm_everyone}</option>
              <option value="following">{L.dm_following}</option>
              <option value="nobody">{L.dm_nobody}</option>
            </select>
          </RowSwitch>
          <Row icon={Shield} label={L.blocklist} href="/settings/blocks" />
        </Section>

        <Section title={L.sec_recommend}>
          <RowToggle icon={Sparkles} label={L.rec_following} checked={s.recommend_following} onChange={(v) => patch({ recommend_following: v })} />
          <RowToggle icon={Sparkles} label={L.rec_topics} checked={s.recommend_topics} onChange={(v) => patch({ recommend_topics: v })} />
        </Section>

        <Section title={L.sec_data}>
          <Row icon={Bookmark} label={L.bookmarks} href="/bookmarks" />
          <Row icon={FileText} label={L.drafts} href="/drafts" />
          <Row icon={Download} label={L.export_data} onClick={exportData} />
          <Row icon={Eraser} label={L.clear_cache} onClick={async () => {
            await api.clearCache();
            queryClient.clear();
            pushToast({ kind: "success", message: tr("toast_cache_cleared") });
          }} />
        </Section>

        <Section title={L.sec_commerce}>
          <Row
            icon={Store}
            label={user?.merchant_verified ? L.merchant_verified_label : user?.is_merchant ? L.merchant_pending_label : L.merchant_apply_label}
            sub={user?.merchant_verified ? L.merchant_verified_sub : L.merchant_apply_sub}
            onClick={() => {
              if (user?.merchant_verified) {
                pushToast({ kind: "info", message: tr("info_already_merchant") });
                return;
              }
              if (user?.is_merchant) {
                pushToast({ kind: "info", message: tr("info_merchant_review") });
              }
              setMerchantOpen(true);
            }}
          />
        </Section>

        <Section title={L.sec_support}>
          <Row icon={HelpCircle} label={L.help_center} href="/help" />
          <Row icon={MessageSquareWarning} label={L.feedback} href="/feedback" />
        </Section>

        <Section title={L.sec_security}>
          <Row icon={LogOut} label={L.logout} destructive onClick={() => setLogoutOpen(true)} />
          <Row icon={Trash2} label={L.delete_account} destructive onClick={() => setDeleteOpen(true)} />
        </Section>
        <p className="text-center text-xs text-kx-muted py-4"><BrandPhrase text={L.footer} /></p>
      </div>

      <Dialog open={pwOpen} onClose={() => setPwOpen(false)} title={L.pw_title} footer={
        <>
          <button className="kx-button-ghost" onClick={() => setPwOpen(false)}>{L.cancel}</button>
          <button className="kx-button-primary" onClick={onChangePassword}>{L.save}</button>
        </>
      }>
        <div className="space-y-3">
          <label className="block">
            <span className="text-sm font-semibold">{L.pw_current}</span>
            <input type="password" autoComplete="current-password" className="kx-input mt-1" value={pwForm.current} onChange={(e) => setPwForm({ ...pwForm, current: e.target.value })} />
          </label>
          <label className="block">
            <span className="text-sm font-semibold">{L.pw_new}</span>
            <input type="password" autoComplete="new-password" className="kx-input mt-1" value={pwForm.password} onChange={(e) => setPwForm({ ...pwForm, password: e.target.value })} />
            <span className="mt-1 block text-xs text-kx-muted">{L.pw_hint}</span>
          </label>
          <label className="block">
            <span className="text-sm font-semibold">{L.pw_confirm}</span>
            <input type="password" autoComplete="new-password" className="kx-input mt-1" value={pwForm.confirm} onChange={(e) => setPwForm({ ...pwForm, confirm: e.target.value })} />
          </label>
        </div>
      </Dialog>

      <Dialog open={merchantOpen} onClose={() => setMerchantOpen(false)} title={L.merchant_dialog_title} footer={
        <>
          <button className="kx-button-ghost" onClick={() => setMerchantOpen(false)}>{L.cancel}</button>
          <button className="kx-button-primary" onClick={submitMerchantApplication} disabled={merchantBusy}>
            {merchantBusy ? L.merchant_submitting : L.merchant_submit}
          </button>
        </>
      }>
        <div className="space-y-3">
          <p className="text-sm leading-6 text-kx-muted">
            {L.merchant_intro}
          </p>
          <Field label={L.merchant_company} value={merchantForm.companyName} onChange={(value) => setMerchantForm({ ...merchantForm, companyName: value })} />
          <label className="block text-sm font-semibold">
            {L.merchant_service}
            <textarea
              className="kx-textarea mt-1 min-h-24"
              placeholder={L.merchant_service_ph}
              value={merchantForm.serviceSummary}
              onChange={(e) => setMerchantForm({ ...merchantForm, serviceSummary: e.target.value })}
            />
          </label>
          <Field label={L.merchant_contact} value={merchantForm.contact} onChange={(value) => setMerchantForm({ ...merchantForm, contact: value })} />
          <Field label={L.merchant_website} value={merchantForm.website} onChange={(value) => setMerchantForm({ ...merchantForm, website: value })} />
          <Field label={L.merchant_address} value={merchantForm.address} onChange={(value) => setMerchantForm({ ...merchantForm, address: value })} />
          <Field label={L.merchant_license} value={merchantForm.license} onChange={(value) => setMerchantForm({ ...merchantForm, license: value })} />
        </div>
      </Dialog>

      <ConfirmDialog
        open={logoutOpen}
        title={L.logout_title}
        description={L.logout_desc}
        confirmLabel={L.logout_confirm}
        onConfirm={onLogout}
        onCancel={() => setLogoutOpen(false)}
      />

      {/* Delete account — irreversible, so re-authenticate (password verify, or
          @handle confirmation for Google-only accounts) before proceeding. */}
      <Dialog
        open={deleteOpen}
        onClose={closeDeleteDialog}
        title={L.delete_title}
        footer={
          <>
            <button className="kx-button-ghost" onClick={closeDeleteDialog} disabled={deleteBusy}>{L.cancel}</button>
            <button
              className="kx-button-danger disabled:opacity-60"
              onClick={onDelete}
              disabled={deleteBusy || !deleteConfirmReady}
            >
              {deleteBusy ? L.processing : L.delete_confirm}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm leading-relaxed text-kx-subtle">{L.delete_desc}</p>
          {hasPassword ? (
            <label className="block">
              <span className="text-sm font-semibold">{L.delete_pw_label}</span>
              <input
                type="password"
                autoComplete="current-password"
                className="kx-input mt-1"
                placeholder={L.delete_pw_ph}
                value={deleteConfirmInput}
                onChange={(e) => setDeleteConfirmInput(e.target.value)}
              />
            </label>
          ) : (
            <label className="block">
              <span className="text-sm font-semibold">{L.delete_handle_label}</span>
              <input
                type="text"
                autoComplete="off"
                spellCheck={false}
                className="kx-input mt-1"
                placeholder={`@${user?.handle || ""}`}
                value={deleteConfirmInput}
                onChange={(e) => setDeleteConfirmInput(e.target.value)}
              />
              <span className="mt-1 block text-xs text-kx-muted">{tr("delete_handle_hint", { handle: user?.handle || "" })}</span>
            </label>
          )}
        </div>
      </Dialog>

      <ConfirmDialog
        open={unlinkGoogleOpen}
        title={L.unlink_title}
        description={L.unlink_desc}
        confirmLabel={googleBusy ? L.processing : L.unlink_confirm}
        onConfirm={onUnlinkGoogle}
        onCancel={() => setUnlinkGoogleOpen(false)}
      />

      <ConfirmDialog
        open={!!pendingRegion}
        title={L.region_switch_title}
        description={L.region_switch_desc}
        confirmLabel={L.region_switch_confirm}
        onConfirm={() => {
          const region = pendingRegion;
          setPendingRegion(null);
          if (region) void commitRegionSwitch(region);
        }}
        onCancel={() => setPendingRegion(null)}
      />

      <RegionPickerDialog
        open={regionOpen}
        onClose={() => setRegionOpen(false)}
        onSelect={onSelectRegion}
        initialCountry={user?.country || currentRegion?.country_code}
        allowsAnyCountry
      />
    </AppShell>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="kx-section-title px-2 pb-1.5">{title}</h3>
      <div className="kx-card p-0 overflow-hidden">{children}</div>
    </section>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block text-sm font-semibold">
      {label}
      <input className="kx-input mt-1" value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function RowIcon({ icon: Icon, destructive }: { icon: React.ComponentType<{ className?: string }>; destructive?: boolean }) {
  return (
    <span
      className={clsx(
        "grid h-9 w-9 shrink-0 place-items-center rounded-xl transition-colors",
        destructive ? "bg-kx-danger/10 text-kx-danger" : "bg-kx-soft text-kx-muted",
      )}
    >
      <Icon className="h-[18px] w-[18px]" />
    </span>
  );
}

function Row({
  icon,
  label,
  sub,
  href,
  onClick,
  destructive = false,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  sub?: string;
  href?: string;
  onClick?: () => void;
  destructive?: boolean;
}) {
  const cls = clsx(
    "flex items-center gap-3 px-3.5 py-3 hover:bg-kx-soft/70 transition w-full text-left border-b border-kx-stroke/30 last:border-0 group",
    destructive && "text-kx-danger",
  );
  const inner = (
    <>
      <RowIcon icon={icon} destructive={destructive} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold truncate">{label}</div>
        {sub ? <div className="text-xs text-kx-muted truncate">{sub}</div> : null}
      </div>
      <ChevronRight className="w-4 h-4 text-kx-muted shrink-0 transition-transform group-hover:translate-x-0.5" />
    </>
  );
  if (href) {
    return <Link href={href} className={cls}>{inner}</Link>;
  }
  return (
    <button className={cls} onClick={onClick}>
      {inner}
    </button>
  );
}

function RowSwitch({
  icon,
  label,
  sub,
  valueLabel,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  sub?: string;
  valueLabel: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 px-3.5 py-3 border-b border-kx-stroke/30 last:border-0">
      <RowIcon icon={icon} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold truncate">{label}</div>
        <div className="text-xs text-kx-muted truncate">{sub || valueLabel}</div>
      </div>
      {children}
    </div>
  );
}

function RowToggle({
  icon,
  label,
  sub,
  checked,
  onChange,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  sub?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-3 px-3.5 py-3 border-b border-kx-stroke/30 last:border-0 cursor-pointer hover:bg-kx-soft/40 transition">
      <RowIcon icon={icon} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold truncate">{label}</div>
        {sub ? <div className="text-xs text-kx-muted truncate">{sub}</div> : null}
      </div>
      <span
        className={clsx(
          "relative inline-flex w-10 h-6 rounded-full transition-colors",
          checked ? "bg-kx-accent" : "bg-kx-stroke",
        )}
      >
        <span
          className={clsx(
            "absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-kx transition-transform",
            checked && "translate-x-4",
          )}
        />
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="sr-only"
        />
      </span>
    </label>
  );
}
