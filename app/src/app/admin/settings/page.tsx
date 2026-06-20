"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, ArrowDown, ArrowLeft, ArrowUp, Cpu, FileImage, Flame, Globe, HardDrive, ImageIcon, LayoutGrid, Network, Plus, Save, Settings, ShieldCheck, Server, Trash2, Upload, Wand2, type LucideIcon } from "lucide-react";
import { api, APIError, isUploadImageFile, type AdminMediaItem, type MarketingCopyBlock, type SiteSettings } from "@/lib/api";
import {
  ALL_CHANNELS,
  DEFAULT_DISCOVER_ENTRANCES,
  parseDiscoverEntrances,
  serializeDiscoverEntrances,
  getChannelByKey,
  type DiscoverEntrance,
  type ChannelKey,
} from "@/config/channels";
import { AppShell } from "@/components/shell/AppShell";
import { ErrorState, InlineLoading } from "@/components/design/States";
import { useSession, useToasts } from "@/lib/store";
import { fullDateTime } from "@/lib/format";
import type { MarketingLocale } from "@/data/machi-home";
import { marketingPageLabels, type MarketingPageId } from "@/data/marketing-pages";
import { SocialBrandIcon, type SocialBrand } from "@/components/marketing/SocialBrandIcon";

type SitePageKey = MarketingPageId | "home";

const PAGE_OPTIONS: Array<{ value: SitePageKey; label: string }> = [
  { value: "home", label: "首页" },
  ...(Object.entries(marketingPageLabels) as Array<[MarketingPageId, string]>).map(([value, label]) => ({ value, label })),
];

const LOCALES: Array<{ value: MarketingLocale; label: string }> = [
  { value: "zh", label: "中文" },
  { value: "en", label: "English" },
  { value: "ja", label: "日本語" },
] as const;

export default function AdminSettingsPage() {
  const router = useRouter();
  const user = useSession((s) => s.user);
  const status = useSession((s) => s.status);

  useEffect(() => {
    if (status === "unauthed") router.replace("/login?redirect=/admin/settings");
  }, [router, status]);

  if (status === "loading" || status === "idle") return <AppShell><InlineLoading /></AppShell>;
  if (!user) return null;
  if (user.role !== "admin") return <AppShell><main className="px-6 py-16 text-center font-bold">无权访问</main></AppShell>;

  return (
    <AppShell right={null} wide>
      <header className="sticky top-0 z-30 kx-glass-bar px-3 py-2">
        <Link href="/admin" className="inline-flex items-center gap-1 text-xs font-bold text-kx-muted hover:text-kx-accent">
          <ArrowLeft className="h-4 w-4" /> 管理后台
        </Link>
        <h1 className="mt-1 inline-flex items-center gap-2 text-lg font-black">
          <Settings className="h-5 w-5 text-kx-accent" /> 站点设置
        </h1>
      </header>
      <main className="space-y-3 px-3 py-3 sm:px-4">
        <SiteInfoCard />
        <ServerMetricsCard />
        <SiteBrandSettingsCard />
        <SocialLinksCard />
        <MediaLibraryCard />
        <MarketingCoverageCard />
        <ContentModerationCard />
        <RightRailCard />
        <ExploreRankingSettingsCard />
        <DiscoverEntrancesCard />
      </main>
    </AppShell>
  );
}

function ServerMetricsCard() {
  const q = useQuery({
    queryKey: ["admin-server-metrics"],
    queryFn: () => api.adminServerMetrics(),
    refetchInterval: 15_000,
  });
  if (q.isError) return <ErrorState onRetry={() => q.refetch()} />;
  if (!q.data) return <InlineLoading />;
  const m = q.data;
  return (
    <section className="kx-card">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="inline-flex items-center gap-2 text-base font-bold"><Activity className="h-4 w-4 text-kx-accent" />服务器监控</h2>
          <p className="mt-1 text-xs text-kx-muted">每 15 秒刷新一次，便于上线后观察 CPU、内存、磁盘和网络累计流量。</p>
        </div>
        <button className="kx-button-ghost h-8 px-3 text-xs" onClick={() => q.refetch()}>刷新</button>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric icon={Cpu} label="CPU 负载" value={pct(m.cpu.load_percent)} helper={`1m ${m.load_average.one.toFixed(2)} · ${m.cpu.count} cores`} />
        <Metric icon={Activity} label="内存" value={pct(m.memory.used_percent)} helper={`${formatBytes(m.memory.used_bytes)} / ${formatBytes(m.memory.total_bytes)}`} />
        <Metric icon={HardDrive} label="存储空间" value={pct(m.disk.used_percent)} helper={`${formatBytes(m.disk.used_bytes)} / ${formatBytes(m.disk.total_bytes)} · ${formatBytes(m.disk.free_bytes)} 可用 · ${m.disk.path}`} />
        <Metric icon={Network} label="网络累计" value={formatBytes(m.network.rx_bytes + m.network.tx_bytes)} helper={`入 ${formatBytes(m.network.rx_bytes)} · 出 ${formatBytes(m.network.tx_bytes)}`} />
      </div>
      <p className="mt-2 text-[11px] text-kx-muted">服务时间：{fullDateTime(m.server_time)} · 进程 {m.process.pid} · 线程 {m.process.threads}</p>
    </section>
  );
}

function SiteBrandSettingsCard() {
  const queryClient = useQueryClient();
  const pushToast = useToasts((s) => s.push);
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const q = useQuery({ queryKey: ["admin-site-settings"], queryFn: () => api.adminSiteSettings() });
  const media = useQuery({ queryKey: ["admin-media", "image"], queryFn: () => api.adminMedia({ type: "image", limit: 60 }) });
  const [form, setForm] = useState<Partial<SiteSettings>>({});
  const [busy, setBusy] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [logoDesign, setLogoDesign] = useState({ letter: "M", bg: "#2563eb", accent: "#f97316" });

  useEffect(() => {
    if (q.data) setForm(q.data);
  }, [q.data]);

  const update = (key: keyof SiteSettings, value: string) => setForm((prev) => ({ ...prev, [key]: value }));
  const uploadLogo = async (file?: File | null) => {
    if (!file) return;
    if (!isUploadImageFile(file)) {
      pushToast({ kind: "error", message: "Logo 只能上传图片文件" });
      return;
    }
    setUploadingLogo(true);
    try {
      const uploaded = await api.adminUploadMedia(file);
      update("logo_url", uploaded.url);
      await queryClient.invalidateQueries({ queryKey: ["admin-media"] });
      pushToast({ kind: "success", message: "Logo 图片已上传并选中" });
    } catch (e) {
      pushToast({ kind: "error", message: (e as APIError).message });
    } finally {
      setUploadingLogo(false);
    }
  };
  const applyDesignedLogo = () => {
    update("logo_url", buildLogoDataUrl(logoDesign.letter || form.site_title || "M", logoDesign.bg, logoDesign.accent));
    pushToast({ kind: "success", message: "已应用设计 Logo，记得保存站点设置" });
  };
  const save = async () => {
    setBusy(true);
    try {
      await api.adminUpdateSiteSettings(form);
      await queryClient.invalidateQueries({ queryKey: ["admin-site-settings"] });
      pushToast({ kind: "success", message: "站点设置已保存" });
    } catch (e) {
      pushToast({ kind: "error", message: (e as APIError).message });
    } finally {
      setBusy(false);
    }
  };

  if (q.isError) return <ErrorState onRetry={() => q.refetch()} />;
  if (!q.data) return <InlineLoading />;

  return (
    <section className="kx-card">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="inline-flex items-center gap-2 text-base font-bold"><Globe className="h-4 w-4 text-kx-accent" />站点品牌与官网标题</h2>
          <p className="mt-1 text-xs text-kx-muted">用于官网标题、SEO 描述、Logo、分享图和客服邮箱。保存后公开接口会立即返回新设置。</p>
        </div>
        <button className="kx-button-primary h-9 px-3 text-xs" onClick={save} disabled={busy}>
          <Save className="h-3.5 w-3.5" /> {busy ? "保存中…" : "保存"}
        </button>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <Field label="站点短标题"><input className="kx-input" value={form.site_title || ""} onChange={(e) => update("site_title", e.target.value)} /></Field>
        <Field label="客服邮箱"><input className="kx-input" value={form.support_email || ""} onChange={(e) => update("support_email", e.target.value)} /></Field>
        <Field label="OG 分享图 URL"><input className="kx-input" value={form.og_image_url || ""} onChange={(e) => update("og_image_url", e.target.value)} /></Field>
      </div>
      <section className="mt-3 rounded-[24px] border border-kx-stroke/60 bg-kx-soft/30 p-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
          <div className="flex items-center gap-3 lg:w-64">
            <div className="relative grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-2xl border border-kx-stroke/60 bg-white shadow-sm">
              {form.logo_url ? <Image src={form.logo_url} alt="当前 Logo" fill sizes="64px" className="object-cover" unoptimized /> : <ImageIcon className="h-6 w-6 text-kx-muted" />}
            </div>
            <div>
              <div className="text-sm font-black text-kx-text">当前 Logo</div>
              <div className="mt-1 text-xs text-kx-muted">后台仅展示预览，不显示文件路径。</div>
            </div>
          </div>
          <div className="min-w-0 flex-1 space-y-3">
            <div className="flex flex-wrap gap-2">
              <button type="button" className="kx-button-ghost h-9 px-3 text-xs" onClick={() => logoInputRef.current?.click()} disabled={uploadingLogo}>
                <Upload className="h-3.5 w-3.5" /> {uploadingLogo ? "上传中…" : "上传 Logo"}
              </button>
              <button type="button" className="kx-button-ghost h-9 px-3 text-xs" onClick={applyDesignedLogo}>
                <Wand2 className="h-3.5 w-3.5" /> 应用设计 Logo
              </button>
              <input
                ref={logoInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => {
                  uploadLogo(event.target.files?.[0]);
                  event.currentTarget.value = "";
                }}
              />
            </div>
            <div className="grid gap-2 sm:grid-cols-[7rem_1fr_1fr_auto]">
              <input className="kx-input h-10" maxLength={2} value={logoDesign.letter} onChange={(e) => setLogoDesign({ ...logoDesign, letter: e.target.value || "M" })} aria-label="Logo 字母" />
              <ColorField label="主色" value={logoDesign.bg} onChange={(bg) => setLogoDesign({ ...logoDesign, bg })} />
              <ColorField label="强调色" value={logoDesign.accent} onChange={(accent) => setLogoDesign({ ...logoDesign, accent })} />
              <div className="relative grid h-10 w-10 place-items-center overflow-hidden rounded-xl border border-kx-stroke bg-white">
                <Image src={buildLogoDataUrl(logoDesign.letter, logoDesign.bg, logoDesign.accent)} alt="Logo 设计预览" fill sizes="40px" className="object-cover" unoptimized />
              </div>
            </div>
            <div>
              <div className="mb-2 text-xs font-black text-kx-muted">从已上传图片选择</div>
              {media.isLoading ? <div className="text-xs text-kx-muted">正在加载媒体库…</div> : null}
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-8 lg:grid-cols-10">
                {(media.data || []).filter((item) => item.type === "image").slice(0, 40).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => update("logo_url", item.url)}
                    data-active={form.logo_url === item.url}
                    className="group relative aspect-square overflow-hidden rounded-xl border border-kx-stroke bg-white transition hover:border-kx-accent data-[active=true]:border-kx-accent data-[active=true]:ring-2 data-[active=true]:ring-kx-accent/20"
                    aria-label="选择这张图片作为 Logo"
                  >
                    <Image src={item.thumb_url || item.url} alt="媒体图片" fill sizes="64px" className="object-cover" unoptimized />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
      <div className="mt-3 grid gap-2 lg:grid-cols-3">
        <LocaleTextArea label="中文标题" value={form.site_title_zh || ""} onChange={(v) => update("site_title_zh", v)} />
        <LocaleTextArea label="English title" value={form.site_title_en || ""} onChange={(v) => update("site_title_en", v)} />
        <LocaleTextArea label="日本語タイトル" value={form.site_title_ja || ""} onChange={(v) => update("site_title_ja", v)} />
        <LocaleTextArea label="中文描述" value={form.site_description_zh || ""} onChange={(v) => update("site_description_zh", v)} rows={4} />
        <LocaleTextArea label="English description" value={form.site_description_en || ""} onChange={(v) => update("site_description_en", v)} rows={4} />
        <LocaleTextArea label="日本語説明" value={form.site_description_ja || ""} onChange={(v) => update("site_description_ja", v)} rows={4} />
      </div>
      <div className="mt-3">
        <LocaleTextArea
          label="登录页公告（留空则不显示）"
          value={form.login_announcement || ""}
          onChange={(v) => update("login_announcement", v)}
          rows={3}
        />
        <p className="mt-1 text-xs text-kx-muted">显示在登录页左侧品牌栏底部与移动端登录表单上方。支持换行。</p>
      </div>
    </section>
  );
}

const SOCIAL_FIELDS: Array<{ key: keyof SiteSettings; label: string; helper: string; brand: SocialBrand }> = [
  { key: "social_x_url", label: "X", helper: "全球实时动态与产品公告。", brand: "x" },
  { key: "social_instagram_url", label: "Instagram", helper: "品牌视觉、城市故事与活动照片。", brand: "instagram" },
  { key: "social_tiktok_url", label: "TikTok", helper: "海外短视频账号链接。", brand: "tiktok" },
  { key: "social_youtube_url", label: "YouTube", helper: "产品介绍、城市指南与长视频。", brand: "youtube" },
  { key: "social_linkedin_url", label: "LinkedIn", helper: "团队、招聘与商业合作。", brand: "linkedin" },
  { key: "social_xiaohongshu_url", label: "小红书", helper: "国内种草、生活指南与品牌内容。", brand: "xiaohongshu" },
  { key: "social_douyin_url", label: "抖音", helper: "国内短视频账号链接。", brand: "douyin" },
];

function SocialLinksCard() {
  const queryClient = useQueryClient();
  const pushToast = useToasts((s) => s.push);
  const q = useQuery({ queryKey: ["admin-site-settings"], queryFn: () => api.adminSiteSettings() });
  const [form, setForm] = useState<Partial<SiteSettings>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (q.data) setForm(q.data);
  }, [q.data]);

  const update = (key: keyof SiteSettings, value: string) => setForm((prev) => ({ ...prev, [key]: value }));
  const save = async () => {
    setBusy(true);
    try {
      const patch: Partial<SiteSettings> = {};
      for (const field of SOCIAL_FIELDS) patch[field.key] = (form[field.key] || "").trim();
      await api.adminUpdateSiteSettings(patch);
      await queryClient.invalidateQueries({ queryKey: ["admin-site-settings"] });
      await queryClient.invalidateQueries({ queryKey: ["site-settings"] });
      pushToast({ kind: "success", message: "官网 SNS 链接已保存" });
    } catch (e) {
      pushToast({ kind: "error", message: (e as APIError).message });
    } finally {
      setBusy(false);
    }
  };

  if (q.isError) return <ErrorState title="SNS 设置加载失败" onRetry={() => q.refetch()} />;
  if (!q.data) return <InlineLoading />;

  return (
    <section className="kx-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="inline-flex items-center gap-2 text-base font-bold"><Globe className="h-4 w-4 text-kx-accent" />官网底部 SNS 链接</h2>
          <p className="mt-1 text-xs text-kx-muted">这些链接会显示在官网页脚，包含小红书与抖音。留空时前台不会显示对应图标。</p>
        </div>
        <button type="button" className="kx-button-primary h-9 px-3 text-xs" onClick={save} disabled={busy}>
          <Save className="h-3.5 w-3.5" /> {busy ? "保存中…" : "保存 SNS"}
        </button>
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {SOCIAL_FIELDS.map((field) => (
          <Field key={field.key} label={field.label}>
            <div className="flex gap-2">
              <SocialBrandIcon brand={field.brand} className="h-10 w-10 shrink-0 shadow-sm" />
              <input
                className="kx-input h-10"
                placeholder={`https://.../${field.label}`}
                value={form[field.key] || ""}
                onChange={(event) => update(field.key, event.target.value)}
              />
            </div>
            <p className="mt-1 text-[11px] leading-4 text-kx-muted">{field.helper}</p>
          </Field>
        ))}
      </div>
    </section>
  );
}

function SiteInfoCard() {
  const stats = useQuery({ queryKey: ["admin-stats"], queryFn: () => api.adminStats() });
  if (stats.isError) return <ErrorState onRetry={() => stats.refetch()} />;
  if (!stats.data) return <InlineLoading />;
  const s = stats.data.stats as Record<string, unknown>;
  return (
    <section className="kx-card">
      <h2 className="inline-flex items-center gap-2 text-base font-bold"><Server className="h-4 w-4 text-kx-accent" />站点信息</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Info label="服务环境" value={String(s.server_env || "-")} />
        <Info label="服务时间" value={s.server_time ? fullDateTime(String(s.server_time)) : "-"} />
        <Info label="用户总数" value={String(s.users_total ?? 0)} />
        <Info label="公开帖子" value={String(s.posts_active ?? 0)} />
      </div>
      <div className="mt-3 rounded-kx-md bg-kx-soft/50 p-3">
        <div className="text-xs font-bold text-kx-muted">允许来源</div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {Array.isArray(s.allowed_origins) ? s.allowed_origins.map((origin) => (
            <span key={String(origin)} className="rounded-full bg-kx-card px-2 py-1 text-xs font-mono text-kx-muted">{String(origin)}</span>
          )) : <span className="text-xs text-kx-muted">未配置</span>}
        </div>
      </div>
    </section>
  );
}

function MediaLibraryCard() {
  const queryClient = useQueryClient();
  const pushToast = useToasts((s) => s.push);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [kind, setKind] = useState<"" | "image" | "video" | "file">("");
  const [scope, setScope] = useState<"admin" | "all">("admin");
  const [uploading, setUploading] = useState(false);
  const media = useQuery({
    queryKey: ["admin-media", kind || "all", scope],
    queryFn: () => api.adminMedia({ type: kind || undefined, limit: 120, scope }),
  });

  const upload = async (file?: File | null) => {
    if (!file) return;
    setUploading(true);
    try {
      await api.adminUploadMedia(file);
      await queryClient.invalidateQueries({ queryKey: ["admin-media"] });
      pushToast({ kind: "success", message: "文件已上传到媒体库" });
    } catch (e) {
      pushToast({ kind: "error", message: (e as APIError).message });
    } finally {
      setUploading(false);
    }
  };

  return (
    <section className="kx-card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="inline-flex items-center gap-2 text-base font-bold"><FileImage className="h-4 w-4 text-kx-accent" />文件与图片库</h2>
          <p className="mt-1 text-xs text-kx-muted">独立上传图片、视频和常见文档；默认只显示管理员上传的素材，用户上传的不在后台展示。Logo 选择会直接读取这里的图片。</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="inline-flex items-center rounded-full border border-kx-stroke/60 bg-kx-soft/60 p-0.5">
            <button type="button" onClick={() => setScope("admin")} className={`h-9 rounded-full px-3 text-xs font-black transition ${scope === "admin" ? "bg-white text-kx-text shadow-sm" : "text-kx-muted hover:text-kx-text"}`}>管理员上传</button>
            <button type="button" onClick={() => setScope("all")} className={`h-9 rounded-full px-3 text-xs font-black transition ${scope === "all" ? "bg-white text-kx-text shadow-sm" : "text-kx-muted hover:text-kx-text"}`}>全部</button>
          </div>
          <select className="kx-input h-9 w-28 text-xs" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
            <option value="">全部</option>
            <option value="image">图片</option>
            <option value="video">视频</option>
            <option value="file">文件</option>
          </select>
          <button type="button" className="kx-button-primary h-9 px-3 text-xs" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
            <Upload className="h-3.5 w-3.5" /> {uploading ? "上传中…" : "上传"}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={(event) => {
              upload(event.target.files?.[0]);
              event.currentTarget.value = "";
            }}
          />
        </div>
      </div>
      {media.isError ? <ErrorState title="媒体库加载失败" onRetry={() => media.refetch()} /> : null}
      {!media.data && media.isLoading ? <InlineLoading /> : null}
      {media.data ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {media.data.map((item) => <MediaLibraryItem key={item.id} item={item} />)}
          {!media.data.length ? <div className="rounded-kx-md bg-kx-soft p-6 text-center text-sm font-semibold text-kx-muted sm:col-span-2 lg:col-span-3">暂无文件</div> : null}
        </div>
      ) : null}
    </section>
  );
}

function MediaLibraryItem({ item }: { item: AdminMediaItem }) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-kx-md border border-kx-stroke/60 bg-kx-soft/30 p-2.5">
      <div className="relative grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-xl bg-white">
        {item.type === "image" ? (
          <Image src={item.thumb_url || item.url} alt={item.display_name || "媒体图片"} fill sizes="56px" className="object-cover" unoptimized />
        ) : (
          <FileImage className="h-5 w-5 text-kx-muted" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-black">{mediaKindLabel(item.type)} · {item.mime}</div>
        <div className="mt-0.5 text-xs text-kx-muted">{formatBytes(item.byte_size)} · {item.owner_handle ? `@${item.owner_handle}` : "系统媒体"}</div>
      </div>
    </div>
  );
}

function MarketingCoverageCard() {
  const q = useQuery({ queryKey: ["admin-marketing-copy"], queryFn: () => api.adminMarketingCopy() });
  const coverage = useMemo(() => summarizeCopy(q.data || []), [q.data]);
  if (q.isError) return <ErrorState onRetry={() => q.refetch()} />;
  if (!q.data) return <InlineLoading />;
  return (
    <section className="kx-card">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="inline-flex items-center gap-2 text-base font-bold"><Globe className="h-4 w-4 text-kx-accent" />官网文案覆盖</h2>
          <p className="mt-1 text-xs text-kx-muted">检查各页面是否有三语公开文案，优先补齐首页、商家合作、下载、安全和联系页面。</p>
        </div>
        <Link href="/admin?tab=site" className="kx-button-ghost h-8 px-3 text-xs">进入总编辑器</Link>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {PAGE_OPTIONS.map((page) => {
          const hit = coverage[page.value] || {};
          return (
            <div key={page.value} className="rounded-kx-md border border-kx-stroke/60 bg-kx-soft/30 p-3">
              <div className="font-bold">{page.label}</div>
              <div className="mt-2 flex gap-1">
                {LOCALES.map((locale) => (
                  <span
                    key={locale.value}
                    className={`rounded-full px-2 py-0.5 text-xs font-bold ${hit[locale.value] ? "bg-emerald-500/10 text-emerald-700" : "bg-kx-card text-kx-muted"}`}
                  >
                    {locale.label}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function DiscoverEntrancesCard() {
  const queryClient = useQueryClient();
  const pushToast = useToasts((s) => s.push);
  const q = useQuery({ queryKey: ["admin-site-settings"], queryFn: () => api.adminSiteSettings() });
  const [entries, setEntries] = useState<DiscoverEntrance[] | null>(null);
  const [addKey, setAddKey] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (q.data && entries === null) setEntries(parseDiscoverEntrances(q.data.discover_entrances));
  }, [q.data, entries]);

  if (q.isError) return <ErrorState title="城市入口配置加载失败" onRetry={() => q.refetch()} />;
  if (!entries) return <section className="kx-card"><InlineLoading /></section>;

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= entries.length) return;
    const next = [...entries];
    [next[i], next[j]] = [next[j], next[i]];
    setEntries(next);
  };
  const update = (i: number, patch: Partial<DiscoverEntrance>) =>
    setEntries(entries.map((e, idx) => (idx === i ? { ...e, ...patch } : e)));
  const remove = (i: number) => setEntries(entries.filter((_, idx) => idx !== i));
  const add = () => {
    const key = addKey as ChannelKey;
    if (!key || entries.some((e) => e.channel === key)) return;
    setEntries([...entries, { channel: key, tier: "primary", enabled: true }]);
    setAddKey("");
  };
  const available = ALL_CHANNELS.filter((c) => !entries.some((e) => e.channel === c.key));

  const save = async () => {
    setSaving(true);
    try {
      await api.adminUpdateSiteSettings({ discover_entrances: serializeDiscoverEntrances(entries) });
      await queryClient.invalidateQueries({ queryKey: ["admin-site-settings"] });
      await queryClient.invalidateQueries({ queryKey: ["site-settings"] });
      pushToast({ kind: "success", message: "城市入口已保存，发现页已同步" });
    } catch (e) {
      pushToast({ kind: "error", message: (e as APIError).message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="kx-card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="inline-flex items-center gap-2 text-base font-bold"><LayoutGrid className="h-4 w-4 text-kx-accent" />发现页 · 城市入口</h2>
          <p className="mt-1 text-xs text-kx-muted">编辑发现页「城市入口」的排序、主/次入口、标题与副标题，并启用 / 停用。主入口是大卡片，次入口是下方小标签；留空标题则用频道默认文案。</p>
        </div>
        <div className="flex gap-2">
          <button type="button" className="kx-button-ghost h-9 px-3 text-xs" onClick={() => setEntries(DEFAULT_DISCOVER_ENTRANCES.map((e) => ({ ...e })))}>恢复默认</button>
          <button type="button" className="kx-button-primary h-9 px-3 text-xs" onClick={save} disabled={saving}><Save className="h-3.5 w-3.5" /> {saving ? "保存中…" : "保存"}</button>
        </div>
      </div>

      <div className="mt-3 space-y-2">
        {entries.map((entry, i) => {
          const spec = getChannelByKey(entry.channel);
          if (!spec) return null;
          return (
            <div key={entry.channel} className="rounded-kx-md border border-kx-stroke/60 bg-kx-soft/30 p-3">
              <div className="flex items-center gap-2">
                <div className="flex flex-col">
                  <button type="button" aria-label="上移" className="grid h-5 w-6 place-items-center rounded text-kx-muted transition hover:bg-kx-card hover:text-kx-text disabled:opacity-30" onClick={() => move(i, -1)} disabled={i === 0}><ArrowUp className="h-3.5 w-3.5" /></button>
                  <button type="button" aria-label="下移" className="grid h-5 w-6 place-items-center rounded text-kx-muted transition hover:bg-kx-card hover:text-kx-text disabled:opacity-30" onClick={() => move(i, 1)} disabled={i === entries.length - 1}><ArrowDown className="h-3.5 w-3.5" /></button>
                </div>
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-kx-md bg-kx-accentSoft text-kx-accent"><spec.Icon className="h-4 w-4" /></span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-black">{spec.title}</div>
                  <div className="truncate text-xs text-kx-muted">{spec.subtitle}</div>
                </div>
                <select className="kx-input h-9 w-24 text-xs" value={entry.tier} onChange={(e) => update(i, { tier: e.target.value as DiscoverEntrance["tier"] })}>
                  <option value="primary">主入口</option>
                  <option value="secondary">次入口</option>
                </select>
                <button type="button" onClick={() => update(i, { enabled: !entry.enabled })} className={`h-9 shrink-0 rounded-full px-3 text-xs font-black transition ${entry.enabled ? "bg-emerald-500/10 text-emerald-700" : "bg-kx-soft text-kx-muted"}`}>{entry.enabled ? "已启用" : "已停用"}</button>
                <button type="button" aria-label="删除" onClick={() => remove(i)} className="grid h-9 w-9 shrink-0 place-items-center rounded-kx-md text-kx-muted transition hover:bg-kx-danger/10 hover:text-kx-danger"><Trash2 className="h-4 w-4" /></button>
              </div>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <input className="kx-input h-9 text-xs" value={entry.title || ""} placeholder={`标题（默认：${spec.title}）`} onChange={(e) => update(i, { title: e.target.value })} />
                <input className="kx-input h-9 text-xs" value={entry.subtitle || ""} placeholder={`副标题（默认：${spec.subtitle}）`} onChange={(e) => update(i, { subtitle: e.target.value })} />
              </div>
            </div>
          );
        })}
        {!entries.length ? <div className="rounded-kx-md bg-kx-soft p-6 text-center text-sm font-semibold text-kx-muted">还没有入口，添加一个或点「恢复默认」。</div> : null}
      </div>

      {available.length ? (
        <div className="mt-3 flex items-center gap-2 border-t border-kx-stroke/50 pt-3">
          <select className="kx-input h-9 flex-1 text-xs" value={addKey} onChange={(e) => setAddKey(e.target.value)}>
            <option value="">选择要添加的入口…</option>
            {available.map((c) => <option key={c.key} value={c.key}>{c.title}</option>)}
          </select>
          <button type="button" className="kx-button-ghost h-9 shrink-0 px-3 text-xs" onClick={add} disabled={!addKey}><Plus className="h-3.5 w-3.5" /> 添加入口</button>
        </div>
      ) : null}
    </section>
  );
}

function ContentModerationCard() {
  const queryClient = useQueryClient();
  const pushToast = useToasts((s) => s.push);
  const q = useQuery({ queryKey: ["admin-site-settings"], queryFn: () => api.adminSiteSettings() });
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (q.data && enabled === null) setEnabled((q.data.listing_review_enabled ?? "1") !== "0");
  }, [q.data, enabled]);

  if (q.isError) return <ErrorState title="审核设置加载失败" onRetry={() => q.refetch()} />;
  if (enabled === null) return <section className="kx-card"><InlineLoading /></section>;

  const save = async (next: boolean) => {
    setEnabled(next);
    setSaving(true);
    try {
      await api.adminUpdateSiteSettings({ listing_review_enabled: next ? "1" : "0" });
      await queryClient.invalidateQueries({ queryKey: ["admin-site-settings"] });
      pushToast({ kind: "success", message: next ? "已开启内容审核，新发布需管理员通过后展示。" : "已关闭内容审核，新发布将立即公开展示。" });
    } catch (e) {
      setEnabled(!next);
      pushToast({ kind: "error", message: (e as APIError).message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="kx-card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="inline-flex items-center gap-2 text-base font-bold"><ShieldCheck className="h-4 w-4 text-kx-accent" />内容审核</h2>
          <p className="mt-1 text-xs text-kx-muted">开启后，用户发布的二手、租房、工作、招聘、本地服务、商家优惠会先进入管理员审核队列，通过后才公开（通常 1 天内）。关闭后，新发布立即公开、无需审核。</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="内容审核开关"
          disabled={saving}
          onClick={() => save(!enabled)}
          className={`relative h-9 w-16 shrink-0 rounded-full transition disabled:opacity-60 ${enabled ? "bg-kx-accent" : "bg-kx-soft ring-1 ring-inset ring-kx-stroke/60"}`}
        >
          <span className={`absolute top-1 grid h-7 w-7 place-items-center rounded-full bg-white shadow transition-all ${enabled ? "left-8" : "left-1"}`} />
        </button>
      </div>
      <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-kx-soft/60 px-3 py-1.5 text-xs font-bold">
        <span className={`h-2 w-2 rounded-full ${enabled ? "bg-emerald-500" : "bg-amber-500"}`} />
        {enabled ? "审核中：新发布需管理员通过后展示" : "已关闭：新发布立即公开展示"}
      </div>
    </section>
  );
}

function RightRailCard() {
  const queryClient = useQueryClient();
  const pushToast = useToasts((s) => s.push);
  const q = useQuery({ queryKey: ["admin-site-settings"], queryFn: () => api.adminSiteSettings() });
  const [showTrending, setShowTrending] = useState<boolean | null>(null);
  const [showRecommended, setShowRecommended] = useState<boolean | null>(null);
  const [handles, setHandles] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (q.data && showTrending === null) {
      setShowTrending((q.data.right_rail_show_trending ?? "1") !== "0");
      setShowRecommended((q.data.right_rail_show_recommended ?? "1") !== "0");
      setHandles(q.data.right_rail_pinned_handles ?? "");
    }
  }, [q.data, showTrending]);

  if (q.isError) return <ErrorState title="右侧栏设置加载失败" onRetry={() => q.refetch()} />;
  if (showTrending === null || showRecommended === null) return <section className="kx-card"><InlineLoading /></section>;

  const save = async () => {
    setSaving(true);
    try {
      await api.adminUpdateSiteSettings({
        right_rail_show_trending: showTrending ? "1" : "0",
        right_rail_show_recommended: showRecommended ? "1" : "0",
        right_rail_pinned_handles: handles.trim(),
      });
      await queryClient.invalidateQueries({ queryKey: ["admin-site-settings"] });
      await queryClient.invalidateQueries({ queryKey: ["trending"] });
      pushToast({ kind: "success", message: "右侧栏设置已保存" });
    } catch (e) {
      pushToast({ kind: "error", message: (e as APIError).message });
    } finally {
      setSaving(false);
    }
  };

  const toggle = (label: string, on: boolean, onToggle: () => void) => (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onToggle}
      className={`relative h-9 w-16 shrink-0 rounded-full transition ${on ? "bg-kx-accent" : "bg-kx-soft ring-1 ring-inset ring-kx-stroke/60"}`}
    >
      <span className={`absolute top-1 grid h-7 w-7 place-items-center rounded-full bg-white shadow transition-all ${on ? "left-8" : "left-1"}`} />
    </button>
  );

  return (
    <section className="kx-card">
      <div className="min-w-0">
        <h2 className="inline-flex items-center gap-2 text-base font-bold"><Flame className="h-4 w-4 text-kx-accent" />右侧栏 · 热榜与推荐</h2>
        <p className="mt-1 text-xs text-kx-muted">控制 PC 端各页右侧栏内容。发现页点进的二手 / 租房 / 工作 / 商家服务等列表页不显示右侧栏，其余页面都会展示。</p>
      </div>
      <div className="mt-3 divide-y divide-kx-stroke/30">
        <div className="flex items-start justify-between gap-3 py-2.5">
          <div className="min-w-0">
            <p className="text-sm font-bold text-kx-text">显示热榜话题</p>
            <p className="mt-0.5 text-xs text-kx-muted">右侧栏顶部的热门话题榜。</p>
          </div>
          {toggle("显示热榜话题", showTrending, () => setShowTrending((v) => !v))}
        </div>
        <div className="flex items-start justify-between gap-3 py-2.5">
          <div className="min-w-0">
            <p className="text-sm font-bold text-kx-text">显示推荐关注</p>
            <p className="mt-0.5 text-xs text-kx-muted">右侧栏的「推荐关注」用户列表。</p>
          </div>
          {toggle("显示推荐关注", showRecommended, () => setShowRecommended((v) => !v))}
        </div>
      </div>
      <label className="mt-3 block">
        <span className="text-sm font-bold text-kx-text">指定推荐关注（用户名）</span>
        <p className="mt-0.5 text-xs text-kx-muted">填写后固定展示这些账号（最多 8 个），覆盖自动推荐。用逗号、空格或顿号分隔，可带或不带 @；留空则自动推荐。</p>
        <input
          className="kx-input mt-2 h-10 w-full"
          placeholder="例如：citylive, tokyo_jobdesk, kaizi"
          value={handles}
          onChange={(e) => setHandles(e.target.value)}
        />
      </label>
      <button type="button" disabled={saving} onClick={save} className="kx-button-primary mt-3 h-10 px-5 text-sm disabled:opacity-60">
        <Save className="h-4 w-4" /> 保存右侧栏设置
      </button>
    </section>
  );
}

const EXPLORE_NUMERIC_FIELDS: Array<{ key: keyof SiteSettings; label: string; min: number; max: number; step?: string; helper: string }> = [
  { key: "explore_happening_days", label: "正在发生窗口天数", min: 1, max: 30, helper: "默认 3 天，超过窗口的内容只在 fallback 时补充。" },
  { key: "explore_hot_days", label: "热榜窗口天数", min: 1, max: 60, helper: "默认 10 天，首页热榜和发现热榜共用。" },
  { key: "explore_topic_days", label: "话题窗口天数", min: 1, max: 60, helper: "默认 7 天，按话题使用量和互动热度排序。" },
  { key: "explore_like_weight", label: "点赞权重", min: 0, max: 50, step: "0.1", helper: "默认 3。" },
  { key: "explore_comment_weight", label: "评论权重", min: 0, max: 50, step: "0.1", helper: "默认 5。" },
  { key: "explore_repost_weight", label: "转发权重", min: 0, max: 50, step: "0.1", helper: "默认 6。" },
  { key: "explore_favorite_weight", label: "收藏权重", min: 0, max: 50, step: "0.1", helper: "默认 4。" },
  { key: "explore_view_weight", label: "浏览权重", min: 0, max: 10, step: "0.1", helper: "默认 0.2，避免浏览量压过真实互动。" },
  { key: "explore_time_decay_weight", label: "新鲜度加权", min: 0, max: 50, step: "0.1", helper: "默认 8，越新越有轻微加成。" },
  { key: "explore_report_penalty", label: "举报惩罚", min: 0, max: 200, step: "1", helper: "默认 20，被举报内容会被降权或排除。" },
  { key: "explore_min_display", label: "最小展示数量", min: 0, max: 30, helper: "不足时按 fallback 规则补最近优质内容。" },
];

const EXPLORE_SWITCH_FIELDS: Array<{ key: keyof SiteSettings; label: string; helper: string }> = [
  { key: "explore_fallback_enabled", label: "启用 fallback", helper: "窗口内内容不足时补充近期内容。" },
  { key: "explore_city_isolated", label: "按城市隔离", helper: "开启后正在发生/热榜优先只看当前城市。" },
  { key: "explore_exclude_reported", label: "排除被举报内容", helper: "开启后 report_count 大于 0 的内容不进榜。" },
  { key: "explore_exclude_low_quality", label: "排除低质量内容", helper: "过滤正文过短且无媒体的内容。" },
  { key: "explore_exclude_banned_users", label: "排除封禁用户内容", helper: "过滤已删除/封禁用户的内容。" },
];

function ExploreRankingSettingsCard() {
  const queryClient = useQueryClient();
  const pushToast = useToasts((s) => s.push);
  const q = useQuery({ queryKey: ["admin-site-settings"], queryFn: () => api.adminSiteSettings() });
  const [form, setForm] = useState<Partial<SiteSettings> | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (q.data && form === null) setForm(q.data);
  }, [q.data, form]);

  if (q.isError) return <ErrorState title="发现排序配置加载失败" onRetry={() => q.refetch()} />;
  if (!form) return <section className="kx-card"><InlineLoading /></section>;

  const update = (key: keyof SiteSettings, value: string) => setForm((current) => ({ ...(current || {}), [key]: value }));
  const save = async () => {
    setSaving(true);
    try {
      const patch: Partial<SiteSettings> = {};
      for (const field of EXPLORE_NUMERIC_FIELDS) {
        const raw = Number(form[field.key] || 0);
        const safe = Number.isFinite(raw) ? Math.max(field.min, Math.min(raw, field.max)) : field.min;
        patch[field.key] = String(safe);
      }
      for (const field of EXPLORE_SWITCH_FIELDS) {
        patch[field.key] = form[field.key] === "0" ? "0" : "1";
      }
      await api.adminUpdateSiteSettings(patch);
      await api.clearCache();
      await queryClient.invalidateQueries({ queryKey: ["admin-site-settings"] });
      await queryClient.invalidateQueries({ queryKey: ["explore-happening"] });
      await queryClient.invalidateQueries({ queryKey: ["explore-hot"] });
      await queryClient.invalidateQueries({ queryKey: ["explore-topics"] });
      pushToast({ kind: "success", message: "发现排序配置已保存，榜单缓存已刷新" });
    } catch (e) {
      pushToast({ kind: "error", message: (e as APIError).message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="kx-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="inline-flex items-center gap-2 text-base font-bold"><Flame className="h-4 w-4 text-kx-accent" />发现页 · 热度排序</h2>
          <p className="mt-1 text-xs text-kx-muted">控制正在发生、热榜和话题的时间窗口、权重、fallback 和排除规则。保存后 Web、iOS、Android 统一生效。</p>
        </div>
        <button type="button" className="kx-button-primary h-9 px-3 text-xs" onClick={save} disabled={saving}>
          <Save className="h-3.5 w-3.5" /> {saving ? "保存中…" : "保存排序配置"}
        </button>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {EXPLORE_NUMERIC_FIELDS.map((field) => (
          <Field key={field.key} label={field.label}>
            <input
              className="kx-input h-10"
              type="number"
              min={field.min}
              max={field.max}
              step={field.step || "1"}
              value={form[field.key] || ""}
              onChange={(event) => update(field.key, event.target.value)}
            />
            <p className="mt-1 text-[11px] leading-4 text-kx-muted">{field.helper}</p>
          </Field>
        ))}
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {EXPLORE_SWITCH_FIELDS.map((field) => {
          const enabled = form[field.key] !== "0";
          return (
            <button
              key={field.key}
              type="button"
              role="switch"
              aria-checked={enabled}
              onClick={() => update(field.key, enabled ? "0" : "1")}
              className={`rounded-kx-md border p-3 text-left transition ${enabled ? "border-kx-accent/35 bg-kx-accentSoft/60" : "border-kx-stroke/60 bg-kx-soft/30"}`}
            >
              <span className="flex items-center justify-between gap-3">
                <span className="text-sm font-black text-kx-text">{field.label}</span>
                <span className={`relative h-6 w-11 rounded-full transition ${enabled ? "bg-kx-accent" : "bg-kx-soft ring-1 ring-inset ring-kx-stroke/60"}`}>
                  <span className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition-all ${enabled ? "left-6" : "left-1"}`} />
                </span>
              </span>
              <span className="mt-1 block text-xs leading-5 text-kx-muted">{field.helper}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-kx-md border border-kx-stroke/60 bg-kx-soft/30 p-3">
      <div className="text-xs font-bold text-kx-muted">{label}</div>
      <div className="mt-1 break-words text-sm font-semibold">{value}</div>
    </div>
  );
}

function Metric({ icon: Icon, label, value, helper }: { icon: LucideIcon; label: string; value: string; helper: string }) {
  return (
    <div className="rounded-kx-md border border-kx-stroke/60 bg-kx-soft/30 p-3">
      <div className="flex items-center gap-1.5 text-xs font-bold text-kx-muted"><Icon className="h-3.5 w-3.5" />{label}</div>
      <div className="mt-1 text-xl font-black text-kx-text">{value}</div>
      <div className="mt-1 text-xs text-kx-muted">{helper}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-bold text-kx-muted">{label}</span>
      {children}
    </label>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="flex h-10 items-center gap-2 rounded-kx-md border border-kx-stroke bg-kx-card px-2">
      <span className="text-xs font-bold text-kx-muted">{label}</span>
      <input type="color" value={value} onChange={(event) => onChange(event.target.value)} className="h-7 w-9 rounded border-0 bg-transparent p-0" />
      <span className="font-mono text-xs text-kx-muted">{value}</span>
    </label>
  );
}

function LocaleTextArea({ label, value, onChange, rows = 2 }: { label: string; value: string; onChange: (value: string) => void; rows?: number }) {
  return (
    <Field label={label}>
      <textarea className="kx-textarea min-h-0" rows={rows} value={value} onChange={(e) => onChange(e.target.value)} />
    </Field>
  );
}

function formatBytes(value: number | null | undefined): string {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = n;
  let i = 0;
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024;
    i += 1;
  }
  return `${size >= 10 || i === 0 ? size.toFixed(0) : size.toFixed(1)} ${units[i]}`;
}

function pct(value: number | null | undefined): string {
  return value == null ? "-" : `${Number(value).toFixed(1)}%`;
}

function mediaKindLabel(kind: string): string {
  if (kind === "image") return "图片";
  if (kind === "video") return "视频";
  return "文件";
}

function buildLogoDataUrl(letter: string, bg: string, accent: string): string {
  const safeLetter = (letter || "M").trim().slice(0, 2).replace(/[<>&"']/g, "");
  const safeBg = /^#[0-9a-f]{6}$/i.test(bg) ? bg : "#2563eb";
  const safeAccent = /^#[0-9a-f]{6}$/i.test(accent) ? accent : "#f97316";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><defs><linearGradient id="g" x1="72" y1="64" x2="440" y2="448" gradientUnits="userSpaceOnUse"><stop stop-color="${safeBg}"/><stop offset="1" stop-color="#4f46e5"/></linearGradient></defs><rect width="512" height="512" rx="138" fill="url(#g)"/><circle cx="394" cy="104" r="42" fill="${safeAccent}"/><text x="256" y="312" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="184" font-weight="900" fill="white">${safeLetter}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function summarizeCopy(items: MarketingCopyBlock[]) {
  const result: Record<string, Record<string, boolean>> = {};
  for (const item of items) {
    if (item.status !== "published") continue;
    result[item.page_key] ||= {};
    result[item.page_key][item.locale] = true;
  }
  return result;
}
