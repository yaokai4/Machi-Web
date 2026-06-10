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

export default function SettingsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const user = useSession((s) => s.user);
  const setUser = useSession((s) => s.setUser);
  const setSettings = useSettings((s) => s.setSettings);
  const setAppearance = useSettings((s) => s.setAppearance);
  const pushToast = useToasts((s) => s.push);
  const { t, locale } = useI18n();
  const [pwOpen, setPwOpen] = useState(false);
  const [pwForm, setPwForm] = useState({ password: "", confirm: "" });
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [unlinkGoogleOpen, setUnlinkGoogleOpen] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [regionOpen, setRegionOpen] = useState(false);
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
      pushToast({ kind: "success", message: "已绑定 Google 账号" });
      api.me().then(setUser).catch(() => {});
    } else if (failed) {
      pushToast({ kind: "error", message: googleLinkErrorMessage(failed) });
    }
    const url = new URL(window.location.href);
    url.searchParams.delete("google");
    url.searchParams.delete("google_error");
    window.history.replaceState({}, "", `${url.pathname}${url.search}`);
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
    pushToast({ kind: "success", message: "已退出登录" });
    router.replace("/login");
  };

  const onDelete = async () => {
    try {
      await api.deleteMe();
      pushToast({ kind: "success", message: "账号已删除" });
      setUser(null);
      queryClient.clear();
      router.replace("/login");
    } catch (err) {
      pushToast({ kind: "error", message: (err as APIError).message });
    }
  };

  const onChangePassword = async () => {
    if (pwForm.password.length < 6) {
      pushToast({ kind: "error", message: "密码至少 6 位" });
      return;
    }
    if (pwForm.password !== pwForm.confirm) {
      pushToast({ kind: "error", message: "两次输入不一致" });
      return;
    }
    try {
      await api.updateMe({ password: pwForm.password });
      setPwOpen(false);
      setPwForm({ password: "", confirm: "" });
      pushToast({ kind: "success", message: "密码已更新" });
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
      pushToast({ kind: "error", message: (err as APIError).message || "无法开始 Google 绑定" });
    }
  };

  const onUnlinkGoogle = async () => {
    setGoogleBusy(true);
    try {
      const res = await api.googleUnlink();
      if (res.user) setUser(res.user);
      setUnlinkGoogleOpen(false);
      pushToast({ kind: "success", message: res.message || "已解绑 Google 账号" });
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
      else pushToast({ kind: "info", message: "请先绑定邮箱并设置登录密码，再解绑 Google。" });
    } else {
      void startGoogleLink();
    }
  };

  const submitMerchantApplication = async () => {
    const required = [
      ["companyName", "公司 / 店铺名称"],
      ["serviceSummary", "服务内容"],
      ["contact", "联系方式"],
    ] as const;
    const missing = required
      .filter(([key]) => !merchantForm[key].trim())
      .map(([, label]) => label);
    if (missing.length) {
      pushToast({ kind: "error", message: `请补充: ${missing.join(" · ")}` });
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
      pushToast({ kind: "success", message: "商家认证申请已提交，管理员会审核公司和服务信息。" });
    } catch (err) {
      pushToast({ kind: "error", message: (err as APIError).message });
    } finally {
      setMerchantBusy(false);
    }
  };

  const onSelectRegion = async (region: RegionInfo) => {
    if (user?.country && region.country_code !== user.country) {
      const confirmed = window.confirm("切换国家会同时影响首页、发现、资讯和发布页可选择的城市。确认切换吗？");
      if (!confirmed) return;
    }
    try {
      const next = await api.updateRegionLanguage(regionAccountPatch(region));
      setUser(next);
      queryClient.invalidateQueries({ queryKey: ["feed"] });
      pushToast({ kind: "success", message: `已切换到 ${region.city_name}` });
    } catch (err) {
      pushToast({ kind: "error", message: (err as APIError).message });
    }
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
      pushToast({ kind: "success", message: "已导出" });
    } catch (err) {
      pushToast({ kind: "error", message: (err as APIError).message });
    }
  };

  return (
    <AppShell>
      <header className="sticky top-0 z-30 kx-glass-bar px-3 py-2">
        <h1 className="text-lg font-bold">{t("settings_title")}</h1>
      </header>
      <div className="px-3 sm:px-4 py-3 space-y-3">
        <Section title="账号">
          <Row icon={UserIcon} label="编辑资料" sub={`@${user?.handle}`} href="/me" />
          <Row icon={LayoutDashboard} label="我的工作台" sub="发布、咨询、订单和会员入口" href="/my/features" />
          <Row
            icon={Sparkles}
            label={t("mem_title")}
            sub={user?.is_verified_member ? t("mem_status_active") : t("mem_status_inactive")}
            href="/membership"
          />
          <Row icon={KeyRound} label="修改密码" onClick={() => setPwOpen(true)} />
          <Row
            icon={Link2}
            label="Google 账号"
            sub={user?.has_google ? "已绑定 · 可用 Google 一键登录" : "绑定后可用 Google 一键登录"}
            onClick={onGoogleRow}
          />
          <Row icon={Smartphone} label="登录设备" href="/settings/devices" />
        </Section>

        <Section title="偏好">
          <RowSwitch icon={MapPin} label="地区设置" valueLabel={regionDisplayName(currentRegion, locale)}>
            <button type="button" onClick={() => setRegionOpen(true)} className="text-kx-accent text-sm font-bold hover:underline">
              切换
            </button>
          </RowSwitch>
          <RowSwitch icon={Languages} label="界面语言" valueLabel={uiLanguageLabel}>
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
            label="内容语言"
            sub="决定推荐与热榜优先展示哪种语言的投稿"
            valueLabel={CONTENT_LANGUAGE_LABELS[contentLanguage]}
          >
            <select
              className="kx-input h-8 px-2 w-32"
              value={contentLanguage}
              onChange={(e) => setContentLanguage(e.target.value as ContentLanguage)}
            >
              <option value="followApp">跟随 App 语言</option>
              <option value="zh">中文</option>
              <option value="en">English</option>
              <option value="ja">日本語</option>
              <option value="ko">한국어</option>
              <option value="fr">Français</option>
              <option value="es">Español</option>
              <option value="multi">多语言内容</option>
            </select>
          </RowSwitch>
          <RowSwitch icon={Palette} label={t("settings_appearance")} valueLabel={s.appearance === "dark" ? t("settings_appearance_dark") : t("settings_appearance_light")}>
            <select
              className="kx-input h-8 px-2 w-32"
              value={s.appearance === "dark" ? "dark" : "light"}
              onChange={(e) => patch({ appearance: e.target.value as "light" | "dark" })}
            >
              <option value="light">{t("settings_appearance_light")}</option>
              <option value="dark">{t("settings_appearance_dark")}</option>
            </select>
          </RowSwitch>
        </Section>

        <Section title="通知">
          <RowToggle icon={Bell} label="点赞通知" checked={s.push_likes} onChange={(v) => patch({ push_likes: v })} />
          <RowToggle icon={Bell} label="评论通知" checked={s.push_comments} onChange={(v) => patch({ push_comments: v })} />
          <RowToggle icon={Bell} label="关注通知" checked={s.push_follows} onChange={(v) => patch({ push_follows: v })} />
          <RowToggle icon={Bell} label="私信通知" checked={s.push_messages} onChange={(v) => patch({ push_messages: v })} />
        </Section>

        <Section title="隐私">
          <RowToggle icon={Shield} label="账号保护模式" sub="开启后非粉丝无法查看你的帖子" checked={s.privacy_protect} onChange={(v) => patch({ privacy_protect: v })} />
          <RowSwitch icon={Shield} label="允许接收私信" valueLabel={s.privacy_allow_dm === "everyone" ? "所有人" : s.privacy_allow_dm === "following" ? "我关注的人" : "不接收"}>
            <select
              className="kx-input h-8 px-2 w-32"
              value={s.privacy_allow_dm}
              onChange={(e) => patch({ privacy_allow_dm: e.target.value as typeof s.privacy_allow_dm })}
            >
              <option value="everyone">所有人</option>
              <option value="following">我关注的人</option>
              <option value="nobody">不接收</option>
            </select>
          </RowSwitch>
          <Row icon={Shield} label="黑名单" href="/settings/blocks" />
        </Section>

        <Section title="内容推荐">
          <RowToggle icon={Sparkles} label="基于关注关系推荐" checked={s.recommend_following} onChange={(v) => patch({ recommend_following: v })} />
          <RowToggle icon={Sparkles} label="基于话题推荐" checked={s.recommend_topics} onChange={(v) => patch({ recommend_topics: v })} />
        </Section>

        <Section title="数据与本地缓存">
          <Row icon={Bookmark} label="收藏列表" href="/bookmarks" />
          <Row icon={FileText} label="草稿箱" href="/drafts" />
          <Row icon={Download} label="数据导出" onClick={exportData} />
          <Row icon={Eraser} label="清除缓存" onClick={async () => {
            await api.clearCache();
            queryClient.clear();
            pushToast({ kind: "success", message: "已清除缓存" });
          }} />
        </Section>

        <Section title="商业化">
          <Row
            icon={Store}
            label={user?.merchant_verified ? "商家认证(已通过)" : user?.is_merchant ? "商家认证(待审核)" : "申请商家认证"}
            sub={user?.merchant_verified ? "可发布商家、优惠、服务等商家内容" : "认证后可发布商家、优惠、服务等内容"}
            onClick={() => {
              if (user?.merchant_verified) {
                pushToast({ kind: "info", message: "已是认证商家" });
                return;
              }
              if (user?.is_merchant) {
                pushToast({ kind: "info", message: "审核中，可重新提交补充资料。" });
              }
              setMerchantOpen(true);
            }}
          />
        </Section>

        <Section title="支持">
          <Row icon={HelpCircle} label="帮助中心" href="/help" />
          <Row icon={MessageSquareWarning} label="反馈问题" href="/feedback" />
        </Section>

        <Section title="账号与安全">
          <Row icon={LogOut} label="退出登录" destructive onClick={() => setLogoutOpen(true)} />
          <Row icon={Trash2} label="删除账号" destructive onClick={() => setDeleteOpen(true)} />
        </Section>
        <p className="text-center text-xs text-kx-muted py-4"><BrandPhrase text="Machi Web v1.0 · 与 iOS App 共享同一套账号、地区内容与 API。" /></p>
      </div>

      <Dialog open={pwOpen} onClose={() => setPwOpen(false)} title="修改密码" footer={
        <>
          <button className="kx-button-ghost" onClick={() => setPwOpen(false)}>取消</button>
          <button className="kx-button-primary" onClick={onChangePassword}>保存</button>
        </>
      }>
        <div className="space-y-3">
          <label className="block">
            <span className="text-sm font-semibold">新密码</span>
            <input type="password" className="kx-input mt-1" value={pwForm.password} onChange={(e) => setPwForm({ ...pwForm, password: e.target.value })} />
          </label>
          <label className="block">
            <span className="text-sm font-semibold">确认新密码</span>
            <input type="password" className="kx-input mt-1" value={pwForm.confirm} onChange={(e) => setPwForm({ ...pwForm, confirm: e.target.value })} />
          </label>
        </div>
      </Dialog>

      <Dialog open={merchantOpen} onClose={() => setMerchantOpen(false)} title="申请商家认证" footer={
        <>
          <button className="kx-button-ghost" onClick={() => setMerchantOpen(false)}>取消</button>
          <button className="kx-button-primary" onClick={submitMerchantApplication} disabled={merchantBusy}>
            {merchantBusy ? "提交中…" : "提交申请"}
          </button>
        </>
      }>
        <div className="space-y-3">
          <p className="text-sm leading-6 text-kx-muted">
            请填写真实公司信息和服务内容。认证通过后可发布商家、服务、优惠和合作类内容。
          </p>
          <Field label="公司 / 店铺名称" value={merchantForm.companyName} onChange={(value) => setMerchantForm({ ...merchantForm, companyName: value })} />
          <label className="block text-sm font-semibold">
            服务内容
            <textarea
              className="kx-textarea mt-1 min-h-24"
              placeholder="提供什么服务、服务范围、适合人群、收费方式等"
              value={merchantForm.serviceSummary}
              onChange={(e) => setMerchantForm({ ...merchantForm, serviceSummary: e.target.value })}
            />
          </label>
          <Field label="联系方式" value={merchantForm.contact} onChange={(value) => setMerchantForm({ ...merchantForm, contact: value })} />
          <Field label="官网 / 社媒链接" value={merchantForm.website} onChange={(value) => setMerchantForm({ ...merchantForm, website: value })} />
          <Field label="地址 / 服务区域" value={merchantForm.address} onChange={(value) => setMerchantForm({ ...merchantForm, address: value })} />
          <Field label="营业执照 / 资质说明" value={merchantForm.license} onChange={(value) => setMerchantForm({ ...merchantForm, license: value })} />
        </div>
      </Dialog>

      <ConfirmDialog
        open={logoutOpen}
        title="确认退出登录？"
        description="退出后需要重新输入用户名和密码登录。"
        confirmLabel="退出"
        onConfirm={onLogout}
        onCancel={() => setLogoutOpen(false)}
      />
      <ConfirmDialog
        open={deleteOpen}
        title="永久删除账号？"
        description="账号删除后，你的帖子、评论、私信将无法恢复。该操作不可撤销。"
        destructive
        confirmLabel="永久删除"
        onConfirm={onDelete}
        onCancel={() => setDeleteOpen(false)}
      />
      <ConfirmDialog
        open={unlinkGoogleOpen}
        title="解绑 Google 账号？"
        description="解绑后将无法使用 Google 一键登录，仍可用用户名 / 邮箱和密码登录。"
        confirmLabel={googleBusy ? "处理中…" : "解绑"}
        onConfirm={onUnlinkGoogle}
        onCancel={() => setUnlinkGoogleOpen(false)}
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

const GOOGLE_LINK_ERROR: Record<string, string> = {
  google_already_linked: "该 Google 账号已绑定到其他 Machi 账号。",
  already_linked_other: "当前账号已绑定了另一个 Google 账号，请先解绑。",
  state_expired: "绑定会话已过期，请重试。",
  google_denied: "已取消 Google 授权。",
};
function googleLinkErrorMessage(code: string): string {
  return GOOGLE_LINK_ERROR[code] || "Google 绑定失败，请重试。";
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="kx-section-title px-2 pb-1">{title}</h3>
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

function Row({
  icon: Icon,
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
    "flex items-center gap-3 px-4 py-3 hover:bg-kx-soft/70 transition w-full text-left border-b border-kx-stroke/30 last:border-0",
    destructive && "text-kx-danger",
  );
  const inner = (
    <>
      <Icon className={clsx("h-[18px] w-[18px] shrink-0", destructive ? "text-kx-danger" : "text-kx-muted")} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold truncate">{label}</div>
        {sub ? <div className="text-xs text-kx-muted truncate">{sub}</div> : null}
      </div>
      <ChevronRight className="w-4 h-4 text-kx-muted shrink-0" />
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
  icon: Icon,
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
    <div className="flex items-center gap-3 px-4 py-3 border-b border-kx-stroke/30 last:border-0">
      <Icon className="h-[18px] w-[18px] shrink-0 text-kx-muted" />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold truncate">{label}</div>
        <div className="text-xs text-kx-muted truncate">{sub || valueLabel}</div>
      </div>
      {children}
    </div>
  );
}

function RowToggle({
  icon: Icon,
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
    <label className="flex items-center gap-3 px-4 py-3 border-b border-kx-stroke/30 last:border-0 cursor-pointer">
      <Icon className="h-[18px] w-[18px] shrink-0 text-kx-muted" />
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
