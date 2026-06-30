"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import {
  AlertCircle,
  Building2,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  ExternalLink,
  KeyRound,
  Pencil,
  Plus,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { api, APIError, type Partner } from "@/lib/api";
import { AppShell } from "@/components/shell/AppShell";
import { ErrorState, InlineLoading } from "@/components/design/States";
import { ConfirmDialog, Dialog } from "@/components/design/Dialog";
import { useSession, useToasts } from "@/lib/store";
import { fullDateTime } from "@/lib/format";

const DEFAULT_BADGES = "Machi推荐,星域臻选,认证房源";

function originBase(): string {
  if (typeof window === "undefined") return "";
  return window.location.origin;
}

function partnerLink(key: string): string {
  return `${originBase()}/partner/${key}`;
}

function badgesToList(raw: string): string[] {
  return raw
    .split(/[,，、]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 12);
}

export default function AdminPartnersPage() {
  const router = useRouter();
  const user = useSession((s) => s.user);
  const status = useSession((s) => s.status);

  // Auth + admin gate. Mirror /admin: while session bootstrapping render
  // nothing so we don't flash 403 to the actual admin.
  useEffect(() => {
    if (status === "unauthed") router.replace("/login?redirect=/admin/partners");
  }, [status, router]);

  if (status === "loading" || status === "idle") {
    return (
      <AppShell right={null} wide>
        <InlineLoading />
      </AppShell>
    );
  }
  if (!user) return null;
  if (user.role !== "admin") {
    return (
      <AppShell right={null} wide>
        <div className="px-6 py-16 text-center">
          <div className="inline-flex w-12 h-12 items-center justify-center rounded-full bg-kx-danger/10 text-kx-danger mb-3">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-bold">无权访问</h1>
          <p className="text-sm text-kx-subtle mt-1">这个页面仅限管理员。</p>
          <Link href="/home" className="kx-button-primary mt-4 inline-flex">回首页</Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell right={null} wide>
      <header className="sticky top-0 z-30 kx-glass-bar px-3 py-2 flex items-center gap-2">
        <Building2 className="w-5 h-5 text-kx-accent" />
        <h1 className="text-lg font-bold">入驻商后台</h1>
        <span className="text-xs text-kx-muted ml-2">星域等专属房源导入后台</span>
        <Link href="/admin" className="kx-button-ghost h-8 px-3 text-xs ml-auto">返回管理后台</Link>
      </header>
      <div className="px-3 sm:px-4 py-3">
        <PartnersPanel />
      </div>
    </AppShell>
  );
}

function PartnersPanel() {
  const queryClient = useQueryClient();
  const pushToast = useToasts((s) => s.push);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Partner | null>(null);
  const [pendingRotate, setPendingRotate] = useState<Partner | null>(null);
  // One-time token reveal box: shown after create or rotate. Never refetched.
  const [reveal, setReveal] = useState<{ name: string; key: string; accessToken: string } | null>(null);

  const list = useQuery({ queryKey: ["admin-partners"], queryFn: () => api.adminPartners() });
  const partners = list.data?.partners ?? [];

  const rotate = useMutation({
    mutationFn: (key: string) => api.adminRotatePartnerToken(key),
    onSuccess: (res, key) => {
      const p = partners.find((x) => x.key === key);
      setReveal({ name: p?.name || key, key, accessToken: res.accessToken });
      setPendingRotate(null);
      queryClient.invalidateQueries({ queryKey: ["admin-partners"] });
      pushToast({ kind: "success", message: "已重新生成口令，旧口令立即失效" });
    },
    onError: (e) => {
      setPendingRotate(null);
      pushToast({ kind: "error", message: (e as APIError).message });
    },
  });

  return (
    <div className="space-y-3">
      <div className="kx-card p-3 flex flex-wrap items-center gap-2">
        <ShieldCheck className="w-4 h-4 text-kx-accent" />
        <div className="text-sm">
          <span className="font-semibold">专属导入后台</span>
          <span className="text-kx-muted ml-2">为入驻商（如 星域东京）创建独立后台与一次性口令</span>
        </div>
        <button className="kx-button-primary h-9 px-4 text-sm ml-auto" onClick={() => setCreateOpen(true)}>
          <Plus className="w-4 h-4" /> 新建入驻商后台
        </button>
      </div>

      {list.isError ? (
        <ErrorState onRetry={() => list.refetch()} />
      ) : !list.data ? (
        <InlineLoading />
      ) : partners.length === 0 ? (
        <div className="kx-card text-center py-10 text-kx-subtle">还没有入驻商。点击「新建入驻商后台」开始。</div>
      ) : (
        <ul className="space-y-2">
          {partners.map((p) => (
            <PartnerCard
              key={p.key}
              partner={p}
              onEdit={() => setEditing(p)}
              onRotate={() => setPendingRotate(p)}
            />
          ))}
        </ul>
      )}

      {createOpen ? (
        <PartnerCreateDialog
          onClose={() => setCreateOpen(false)}
          onCreated={(name, key, accessToken) => {
            setCreateOpen(false);
            setReveal({ name, key, accessToken });
            queryClient.invalidateQueries({ queryKey: ["admin-partners"] });
          }}
        />
      ) : null}

      {editing ? (
        <PartnerEditDialog
          partner={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            queryClient.invalidateQueries({ queryKey: ["admin-partners"] });
          }}
        />
      ) : null}

      <ConfirmDialog
        open={!!pendingRotate}
        title={pendingRotate ? `重新生成「${pendingRotate.name}」的口令？` : "重新生成口令？"}
        description="旧口令将立即失效，入驻商需用新口令重新登录专属后台。新口令只显示一次，请妥善保存。"
        destructive
        confirmLabel="重新生成"
        onConfirm={() => pendingRotate && rotate.mutate(pendingRotate.key)}
        onCancel={() => setPendingRotate(null)}
      />

      <TokenRevealDialog reveal={reveal} onClose={() => setReveal(null)} />
    </div>
  );
}

function CopyButton({ value, label = "复制", className }: { value: string; label?: string; className?: string }) {
  const pushToast = useToasts((s) => s.push);
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      pushToast({ kind: "success", message: "已复制到剪贴板" });
    } catch {
      pushToast({ kind: "error", message: "复制失败，请手动选择文本复制" });
    }
  };
  return (
    <button type="button" onClick={copy} className={clsx("kx-button-ghost h-8 px-3 text-xs", className)}>
      {copied ? <Check className="w-3.5 h-3.5 text-kx-accent" /> : <Copy className="w-3.5 h-3.5" />}
      {copied ? "已复制" : label}
    </button>
  );
}

function PartnerCard({ partner, onEdit, onRotate }: { partner: Partner; onEdit: () => void; onRotate: () => void }) {
  const [showListings, setShowListings] = useState(false);
  const link = partnerLink(partner.key);
  const disabled = partner.status === "disabled";

  const listings = useQuery({
    queryKey: ["admin-partner-listings", partner.key],
    queryFn: () => api.adminPartnerListings(partner.key),
    enabled: showListings,
  });

  return (
    <li className={clsx("kx-card", disabled && "opacity-70")}>
      <div className="flex items-start gap-3">
        <span
          className="inline-flex w-10 h-10 shrink-0 items-center justify-center rounded-kx-md text-white"
          style={{ background: partner.accentColor || partner.brandColor || "rgb(var(--kx-accent))" }}
        >
          {partner.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={partner.logoUrl} alt={partner.name} className="w-10 h-10 rounded-kx-md object-cover" />
          ) : (
            <Building2 className="w-5 h-5" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-bold truncate">{partner.name}</span>
            {partner.nameJa ? <span className="text-xs text-kx-muted">{partner.nameJa}</span> : null}
            <span
              className={clsx(
                "px-2 py-0.5 rounded-full text-[11px] font-bold",
                disabled ? "bg-kx-danger/10 text-kx-danger" : "bg-kx-accentSoft text-kx-accent",
              )}
            >
              {disabled ? "已停用" : "正常"}
            </span>
            <span className="px-2 py-0.5 rounded-full bg-kx-soft text-[11px] font-mono text-kx-muted">{partner.key}</span>
          </div>

          {/* Dedicated link */}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <a
              href={link}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs font-mono text-kx-accent hover:underline break-all"
            >
              {link}
              <ExternalLink className="w-3 h-3" />
            </a>
            <CopyButton value={link} label="复制链接" />
          </div>

          {/* Flags + meta */}
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
            <span className="px-2 py-0.5 rounded-full bg-kx-soft text-kx-muted">房源 {partner.listingCount}</span>
            <span className="px-2 py-0.5 rounded-full bg-kx-soft text-kx-muted font-mono">
              口令 ••••{partner.tokenHint || "----"}
            </span>
            <span className={clsx("px-2 py-0.5 rounded-full", partner.saleEnabled ? "bg-kx-accentSoft text-kx-accent" : "bg-kx-soft text-kx-muted")}>
              出售房产{partner.saleEnabled ? "已开" : "关闭"}
            </span>
            <span className={clsx("px-2 py-0.5 rounded-full", partner.machiRecommendedDefault ? "bg-kx-accentSoft text-kx-accent" : "bg-kx-soft text-kx-muted")}>
              默认Machi推荐{partner.machiRecommendedDefault ? "开" : "关"}
            </span>
            {partner.defaultCitySlug ? (
              <span className="px-2 py-0.5 rounded-full bg-kx-soft text-kx-muted">默认城市 {partner.defaultCitySlug}</span>
            ) : null}
          </div>

          {partner.defaultBadges?.length ? (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {partner.defaultBadges.map((b) => (
                <span key={b} className="px-2 py-0.5 rounded-full border border-kx-accent/40 text-[11px] font-semibold text-kx-accent">
                  {b}
                </span>
              ))}
            </div>
          ) : null}

          <div className="mt-1.5 text-xs text-kx-muted">
            {partner.tokenRotatedAt ? `口令更新于 ${fullDateTime(partner.tokenRotatedAt)}` : null}
            {partner.createdAt ? `${partner.tokenRotatedAt ? " · " : ""}创建于 ${fullDateTime(partner.createdAt)}` : null}
          </div>
        </div>

        <div className="flex flex-col gap-1.5 shrink-0">
          <button className="kx-button-ghost h-8 px-3 text-xs" onClick={onEdit}>
            <Pencil className="w-3.5 h-3.5" /> 编辑
          </button>
          <button className="kx-button-ghost h-8 px-3 text-xs" onClick={onRotate}>
            <RefreshCw className="w-3.5 h-3.5" /> 重新生成口令
          </button>
        </div>
      </div>

      {/* 查看房源 expander */}
      <div className="mt-2 border-t border-kx-stroke/30 pt-2">
        <button
          className="inline-flex items-center gap-1 text-xs text-kx-muted hover:text-kx-accent"
          onClick={() => setShowListings((v) => !v)}
        >
          {showListings ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          查看房源（{partner.listingCount}）
        </button>
        {showListings ? (
          listings.isError ? (
            <div className="mt-2"><ErrorState onRetry={() => listings.refetch()} /></div>
          ) : !listings.data ? (
            <div className="mt-2"><InlineLoading /></div>
          ) : listings.data.listings.length === 0 ? (
            <div className="mt-2 text-xs text-kx-muted py-3 text-center">该入驻商还没有导入房源。</div>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {listings.data.listings.map((l) => (
                <li key={l.id} className="flex items-center gap-2 rounded-kx-md bg-kx-soft/60 px-2.5 py-1.5 text-sm">
                  <span className="min-w-0 flex-1 truncate">{l.title || "未命名房源"}</span>
                  <span className="px-2 py-0.5 rounded-full bg-kx-soft text-[11px] text-kx-muted shrink-0">{l.status}</span>
                  {l.city_slug ? (
                    <span className="px-2 py-0.5 rounded-full bg-kx-soft text-[11px] text-kx-muted shrink-0">{l.city_slug}</span>
                  ) : null}
                  <Link href={`/listing/${l.id}`} className="kx-link text-xs shrink-0">查看</Link>
                </li>
              ))}
            </ul>
          )
        ) : null}
      </div>
    </li>
  );
}

function TokenRevealDialog({
  reveal,
  onClose,
}: {
  reveal: { name: string; key: string; accessToken: string } | null;
  onClose: () => void;
}) {
  if (!reveal) return null;
  const link = partnerLink(reveal.key);
  return (
    <Dialog open={!!reveal} onClose={onClose} title={`「${reveal.name}」的访问口令`} maxWidth="32rem">
      <div className="space-y-4">
        <div className="rounded-kx-lg border border-kx-accent/40 bg-kx-accentSoft/40 p-3">
          <div className="flex items-center gap-1.5 text-xs font-bold text-kx-accent">
            <KeyRound className="w-3.5 h-3.5" /> 访问口令（ACCESS TOKEN）
          </div>
          <div className="mt-2 flex items-center gap-2">
            <code className="min-w-0 flex-1 break-all rounded-kx-md bg-kx-card px-3 py-2 font-mono text-sm">
              {reveal.accessToken}
            </code>
            <CopyButton value={reveal.accessToken} className="shrink-0" />
          </div>
          <p className="mt-2 text-[11px] leading-5 font-semibold text-kx-danger">
            请立即复制并安全保存，此口令只显示一次，关闭后无法再次查看（可重新生成）。
          </p>
        </div>

        <div className="space-y-1.5">
          <div className="text-xs font-bold text-kx-muted">专属链接</div>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 break-all rounded-kx-md bg-kx-soft px-3 py-2 font-mono text-xs">{link}</code>
            <CopyButton value={link} label="复制链接" className="shrink-0" />
          </div>
          <p className="text-[11px] text-kx-muted">把链接与口令一起交给入驻商，用于登录专属导入后台。</p>
        </div>

        <div className="flex justify-end">
          <button className="kx-button-primary h-10 px-5 text-sm" onClick={onClose}>我已保存，关闭</button>
        </div>
      </div>
    </Dialog>
  );
}

function Field({
  label,
  help,
  children,
}: {
  label: string;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-bold text-kx-muted">{label}</label>
      {children}
      {help ? <p className="text-[11px] text-kx-muted">{help}</p> : null}
    </div>
  );
}

function PartnerCreateDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (name: string, key: string, accessToken: string) => void;
}) {
  const pushToast = useToasts((s) => s.push);
  const [key, setKey] = useState("");
  const [name, setName] = useState("");
  const [nameJa, setNameJa] = useState("");
  const [website, setWebsite] = useState("");
  const [defaultCitySlug, setDefaultCitySlug] = useState("tokyo");
  const [defaultRegionCode, setDefaultRegionCode] = useState("");
  const [defaultCategory, setDefaultCategory] = useState("");
  const [saleEnabled, setSaleEnabled] = useState(false);
  const [machiRecommendedDefault, setMachiRecommendedDefault] = useState(true);
  const [badges, setBadges] = useState(DEFAULT_BADGES);
  const [brandColor, setBrandColor] = useState("");
  const [accentColor, setAccentColor] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [intro, setIntro] = useState("");

  const create = useMutation({
    mutationFn: () =>
      api.adminCreatePartner({
        key: key.trim(),
        name: name.trim(),
        name_ja: nameJa.trim() || undefined,
        website: website.trim() || undefined,
        default_city_slug: defaultCitySlug.trim() || undefined,
        default_region_code: defaultRegionCode.trim() || undefined,
        default_category: defaultCategory.trim() || undefined,
        sale_enabled: saleEnabled,
        machi_recommended_default: machiRecommendedDefault,
        default_badges: badgesToList(badges),
        brand_color: brandColor.trim() || undefined,
        accent_color: accentColor.trim() || undefined,
        logo_url: logoUrl.trim() || undefined,
        intro: intro.trim() || undefined,
      }),
    onSuccess: (res) => onCreated(res.partner.name, res.partner.key, res.accessToken),
    onError: (e) => pushToast({ kind: "error", message: (e as APIError).message }),
  });

  const keyValid = /^[a-z0-9-]+$/.test(key.trim());
  const canSubmit = keyValid && name.trim().length > 0 && !create.isPending;

  return (
    <Dialog open onClose={onClose} title="新建入驻商后台" maxWidth="34rem">
      <div className="space-y-4">
        <Field label="标识 key（必填）" help="只允许小写字母、数字和连字符；用于专属链接 /partner/<key>，创建后不可更改。">
          <input
            className="kx-input h-10 w-full font-mono"
            value={key}
            onChange={(e) => setKey(e.target.value.toLowerCase())}
            placeholder="如：xingyu-tokyo"
          />
          {key && !keyValid ? <p className="text-[11px] text-kx-danger">只能包含小写字母、数字和连字符。</p> : null}
        </Field>

        <Field label="名称（必填）">
          <input className="kx-input h-10 w-full" value={name} onChange={(e) => setName(e.target.value)} placeholder="如：星域东京" />
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="日文名称">
            <input className="kx-input h-10 w-full" value={nameJa} onChange={(e) => setNameJa(e.target.value)} placeholder="星域東京" />
          </Field>
          <Field label="官网">
            <input className="kx-input h-10 w-full" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://" />
          </Field>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="默认城市 city slug">
            <input className="kx-input h-10 w-full" value={defaultCitySlug} onChange={(e) => setDefaultCitySlug(e.target.value)} placeholder="tokyo" />
          </Field>
          <Field label="默认地区码 region code" help="如：jp.tokyo.tokyo">
            <input className="kx-input h-10 w-full" value={defaultRegionCode} onChange={(e) => setDefaultRegionCode(e.target.value)} placeholder="jp.tokyo.tokyo" />
          </Field>
        </div>

        <Field label="默认类目 default category">
          <input className="kx-input h-10 w-full" value={defaultCategory} onChange={(e) => setDefaultCategory(e.target.value)} placeholder="如：apartment_rent" />
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="flex items-start justify-between gap-3 rounded-kx-md border border-kx-stroke/40 bg-kx-soft/50 px-3 py-2.5">
            <span className="text-sm">
              <span className="font-semibold">允许出售 / 投资房产</span>
              <span className="block text-[11px] text-kx-muted">允许导入出售/投资房产</span>
            </span>
            <input type="checkbox" className="mt-0.5 h-5 w-5 accent-kx-accent" checked={saleEnabled} onChange={(e) => setSaleEnabled(e.target.checked)} />
          </label>
          <label className="flex items-start justify-between gap-3 rounded-kx-md border border-kx-stroke/40 bg-kx-soft/50 px-3 py-2.5">
            <span className="text-sm">
              <span className="font-semibold">默认 Machi 推荐</span>
              <span className="block text-[11px] text-kx-muted">导入房源默认带 Machi 推荐标</span>
            </span>
            <input type="checkbox" className="mt-0.5 h-5 w-5 accent-kx-accent" checked={machiRecommendedDefault} onChange={(e) => setMachiRecommendedDefault(e.target.checked)} />
          </label>
        </div>

        <Field label="默认徽章" help="逗号分隔，显示为房源上的描边胶囊。">
          <input className="kx-input h-10 w-full" value={badges} onChange={(e) => setBadges(e.target.value)} placeholder={DEFAULT_BADGES} />
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="品牌色 brand color">
            <input className="kx-input h-10 w-full" value={brandColor} onChange={(e) => setBrandColor(e.target.value)} placeholder="#147067" />
          </Field>
          <Field label="强调色 accent color">
            <input className="kx-input h-10 w-full" value={accentColor} onChange={(e) => setAccentColor(e.target.value)} placeholder="#147067" />
          </Field>
        </div>

        <Field label="Logo URL">
          <input className="kx-input h-10 w-full" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://" />
        </Field>

        <Field label="简介">
          <textarea className="kx-textarea w-full" rows={3} value={intro} onChange={(e) => setIntro(e.target.value)} placeholder="入驻商简介，会展示在专属页。" />
        </Field>

        <div className="flex justify-end gap-2 pt-1">
          <button className="kx-button-ghost h-10 px-4 text-sm" onClick={onClose}>取消</button>
          <button className="kx-button-primary h-10 px-5 text-sm disabled:opacity-50" disabled={!canSubmit} onClick={() => create.mutate()}>
            <Plus className="w-4 h-4" /> 创建
          </button>
        </div>
      </div>
    </Dialog>
  );
}

function PartnerEditDialog({
  partner,
  onClose,
  onSaved,
}: {
  partner: Partner;
  onClose: () => void;
  onSaved: () => void;
}) {
  const pushToast = useToasts((s) => s.push);
  const [name, setName] = useState(partner.name);
  const [nameJa, setNameJa] = useState(partner.nameJa);
  const [website, setWebsite] = useState(partner.website);
  const [status, setStatus] = useState(partner.status || "active");
  const [defaultCitySlug, setDefaultCitySlug] = useState(partner.defaultCitySlug);
  const [defaultRegionCode, setDefaultRegionCode] = useState(partner.defaultRegionCode);
  const [defaultCategory, setDefaultCategory] = useState(partner.defaultCategory);
  const [saleEnabled, setSaleEnabled] = useState(partner.saleEnabled);
  const [machiRecommendedDefault, setMachiRecommendedDefault] = useState(partner.machiRecommendedDefault);
  const [badges, setBadges] = useState((partner.defaultBadges || []).join(","));
  const [brandColor, setBrandColor] = useState(partner.brandColor);
  const [accentColor, setAccentColor] = useState(partner.accentColor);
  const [logoUrl, setLogoUrl] = useState(partner.logoUrl);
  const [intro, setIntro] = useState(partner.intro);

  const save = useMutation({
    mutationFn: () =>
      api.adminUpdatePartner(partner.key, {
        name: name.trim(),
        name_ja: nameJa.trim(),
        website: website.trim(),
        status,
        default_city_slug: defaultCitySlug.trim(),
        default_region_code: defaultRegionCode.trim(),
        default_category: defaultCategory.trim(),
        sale_enabled: saleEnabled,
        machi_recommended_default: machiRecommendedDefault,
        default_badges: badgesToList(badges),
        brand_color: brandColor.trim(),
        accent_color: accentColor.trim(),
        logo_url: logoUrl.trim(),
        intro: intro.trim(),
      }),
    onSuccess: () => {
      pushToast({ kind: "success", message: "已保存" });
      onSaved();
    },
    onError: (e) => pushToast({ kind: "error", message: (e as APIError).message }),
  });

  return (
    <Dialog open onClose={onClose} title={`编辑「${partner.name}」`} maxWidth="34rem">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="px-2 py-0.5 rounded-full bg-kx-soft font-mono text-kx-muted">key {partner.key}</span>
          <span className="px-2 py-0.5 rounded-full bg-kx-soft font-mono text-kx-muted">口令 ••••{partner.tokenHint || "----"}</span>
        </div>

        <Field label="名称">
          <input className="kx-input h-10 w-full" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="日文名称">
            <input className="kx-input h-10 w-full" value={nameJa} onChange={(e) => setNameJa(e.target.value)} />
          </Field>
          <Field label="状态">
            <select className="kx-input h-10 w-full" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="active">正常 active</option>
              <option value="disabled">停用 disabled</option>
            </select>
          </Field>
        </div>

        <Field label="官网">
          <input className="kx-input h-10 w-full" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://" />
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="默认城市 city slug">
            <input className="kx-input h-10 w-full" value={defaultCitySlug} onChange={(e) => setDefaultCitySlug(e.target.value)} placeholder="tokyo" />
          </Field>
          <Field label="默认地区码 region code" help="如：jp.tokyo.tokyo">
            <input className="kx-input h-10 w-full" value={defaultRegionCode} onChange={(e) => setDefaultRegionCode(e.target.value)} placeholder="jp.tokyo.tokyo" />
          </Field>
        </div>

        <Field label="默认类目 default category">
          <input className="kx-input h-10 w-full" value={defaultCategory} onChange={(e) => setDefaultCategory(e.target.value)} />
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="flex items-start justify-between gap-3 rounded-kx-md border border-kx-stroke/40 bg-kx-soft/50 px-3 py-2.5">
            <span className="text-sm">
              <span className="font-semibold">允许出售 / 投资房产</span>
              <span className="block text-[11px] text-kx-muted">允许导入出售/投资房产</span>
            </span>
            <input type="checkbox" className="mt-0.5 h-5 w-5 accent-kx-accent" checked={saleEnabled} onChange={(e) => setSaleEnabled(e.target.checked)} />
          </label>
          <label className="flex items-start justify-between gap-3 rounded-kx-md border border-kx-stroke/40 bg-kx-soft/50 px-3 py-2.5">
            <span className="text-sm">
              <span className="font-semibold">默认 Machi 推荐</span>
              <span className="block text-[11px] text-kx-muted">导入房源默认带 Machi 推荐标</span>
            </span>
            <input type="checkbox" className="mt-0.5 h-5 w-5 accent-kx-accent" checked={machiRecommendedDefault} onChange={(e) => setMachiRecommendedDefault(e.target.checked)} />
          </label>
        </div>

        <Field label="默认徽章" help="逗号分隔，显示为房源上的描边胶囊。">
          <input className="kx-input h-10 w-full" value={badges} onChange={(e) => setBadges(e.target.value)} />
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="品牌色 brand color">
            <input className="kx-input h-10 w-full" value={brandColor} onChange={(e) => setBrandColor(e.target.value)} placeholder="#147067" />
          </Field>
          <Field label="强调色 accent color">
            <input className="kx-input h-10 w-full" value={accentColor} onChange={(e) => setAccentColor(e.target.value)} placeholder="#147067" />
          </Field>
        </div>

        <Field label="Logo URL">
          <input className="kx-input h-10 w-full" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://" />
        </Field>

        <Field label="简介">
          <textarea className="kx-textarea w-full" rows={3} value={intro} onChange={(e) => setIntro(e.target.value)} />
        </Field>

        <div className="flex justify-end gap-2 pt-1">
          <button className="kx-button-ghost h-10 px-4 text-sm" onClick={onClose}>取消</button>
          <button className="kx-button-primary h-10 px-5 text-sm disabled:opacity-50" disabled={save.isPending || !name.trim()} onClick={() => save.mutate()}>
            保存
          </button>
        </div>
      </div>
    </Dialog>
  );
}
