"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Upload,
  FileSpreadsheet,
  Sparkles,
  Phone,
  Plus,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Download,
  LogOut,
  Building2,
  Globe2,
  Trash2,
  Pencil,
  Save,
  X,
  Image as ImageIcon,
  MessageCircle,
  Mail,
  RefreshCw,
  Search,
} from "lucide-react";
import { Toaster } from "@/components/design/Toaster";
import { useToasts } from "@/lib/store";
import {
  getPartnerBranding,
  startPartnerSession,
  getPartnerTemplate,
  listPartnerContacts,
  createPartnerContact,
  updatePartnerContact,
  deletePartnerContact,
  uploadPartnerImage,
  savePartnerBranding,
  parsePartnerImport,
  commitPartnerImport,
  previewStarealImport,
  syncStarealImport,
  getStarealSyncJob,
  listPartnerListings,
  partnerCreateListing,
  partnerUpdateListing,
  partnerDeleteListing,
  readPartnerToken,
  writePartnerToken,
  isPartnerAuthError,
  PartnerAPIError,
  type PartnerBranding,
  type PartnerSessionResponse,
  type PartnerContact,
  type PartnerContactPayload,
  type PartnerMappedRow,
  type PartnerCommitResult,
  type PartnerStarealJob,
  type PartnerStarealSummary,
  type PartnerListing,
  type PartnerListingDraft,
} from "@/lib/partner";

// Sanitise a partner-supplied hex colour before letting it drive inline styles.
function safeColor(value: string | undefined, fallback: string): string {
  if (value && /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value.trim())) return value.trim();
  return fallback;
}

const ACCENT_FALLBACK = "#147067"; // --kx-accent

type TabKey = "import" | "contacts" | "listings";

const STAREAL_TYPES: Array<"buy" | "rent" | "invest"> = ["buy", "rent", "invest"];
const STAREAL_PARTNER_KEYS = new Set(["xingyu-tokyo", "stareal"]);
const STAREAL_TYPE_LABELS: Record<string, string> = {
  buy: "买房",
  rent: "租房",
  invest: "投资",
};

// ============================================================
// Page entry
// ============================================================

export default function PartnerBackendPage() {
  const params = useParams<{ key: string }>();
  const partnerKey = String(params?.key || "");
  const pushToast = useToasts((s) => s.push);

  const [token, setToken] = useState<string | null>(null);
  const [authed, setAuthed] = useState(false);
  // probing = trying a stored token on mount; until it resolves we show a
  // neutral splash instead of flashing the gate at a returning partner.
  const [probing, setProbing] = useState(true);
  const [session, setSession] = useState<PartnerSessionResponse | null>(null);

  // Public branding for the gate heading (no token required).
  const brandingQuery = useQuery({
    queryKey: ["partner", partnerKey, "branding"],
    queryFn: () => getPartnerBranding(partnerKey),
    enabled: !!partnerKey,
    staleTime: 5 * 60_000,
    retry: false,
  });
  const branding: PartnerBranding | undefined = brandingQuery.data?.partner;

  const accent = safeColor(branding?.accentColor, ACCENT_FALLBACK);
  const brand = safeColor(branding?.brandColor, accent);

  // On mount: try a stored token via POST /session.
  useEffect(() => {
    if (!partnerKey) return;
    const stored = readPartnerToken(partnerKey);
    if (!stored) {
      setProbing(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const data = await startPartnerSession(partnerKey, stored);
        if (cancelled) return;
        setSession(data);
        setToken(stored);
        setAuthed(true);
      } catch {
        if (cancelled) return;
        // Stored token no longer valid — clear it and show the gate.
        writePartnerToken(partnerKey, null);
      } finally {
        if (!cancelled) setProbing(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [partnerKey]);

  const handleAuthed = (tok: string, data: PartnerSessionResponse) => {
    writePartnerToken(partnerKey, tok);
    setToken(tok);
    setSession(data);
    setAuthed(true);
  };

  const handleLogout = () => {
    writePartnerToken(partnerKey, null);
    setToken(null);
    setSession(null);
    setAuthed(false);
    pushToast({ kind: "info", message: "已退出后台" });
  };

  // If any data call later 401s, drop back to the gate.
  const handleAuthDrop = () => {
    writePartnerToken(partnerKey, null);
    setToken(null);
    setSession(null);
    setAuthed(false);
    pushToast({ kind: "error", message: "访问口令已失效，请重新进入。" });
  };

  const shellStyle = {
    // expose accent as a CSS var so themed bits read one source of truth
    ["--partner-accent" as string]: accent,
    ["--partner-brand" as string]: brand,
  } as CSSProperties;

  return (
    <div className="kx-guide-page min-h-[100dvh]" style={shellStyle}>
      <Toaster />
      {probing ? (
        <PartnerSplash />
      ) : authed && session && token ? (
        <PartnerDashboard
          partnerKey={partnerKey}
          token={token}
          session={session}
          branding={branding}
          accent={accent}
          brand={brand}
          onLogout={handleLogout}
          onAuthDrop={handleAuthDrop}
        />
      ) : (
        <PartnerGate
          partnerKey={partnerKey}
          branding={branding}
          accent={accent}
          brand={brand}
          onAuthed={handleAuthed}
        />
      )}
    </div>
  );
}

function PartnerSplash() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center">
      <Loader2 className="h-7 w-7 animate-spin text-kx-muted" />
    </div>
  );
}

// ============================================================
// Token gate
// ============================================================

function PartnerGate({
  partnerKey,
  branding,
  accent,
  brand,
  onAuthed,
}: {
  partnerKey: string;
  branding?: PartnerBranding;
  accent: string;
  brand: string;
  onAuthed: (token: string, data: PartnerSessionResponse) => void;
}) {
  const pushToast = useToasts((s) => s.push);
  const [value, setValue] = useState("");
  const name = branding?.name || "合作方";

  const enter = useMutation({
    mutationFn: (tok: string) => startPartnerSession(partnerKey, tok),
    onSuccess: (data, tok) => onAuthed(tok, data),
    onError: (err) => {
      const msg = err instanceof PartnerAPIError && err.status !== 401 ? err.message : "访问口令无效";
      pushToast({ kind: "error", message: msg });
    },
  });

  const submit = () => {
    const tok = value.trim();
    if (!tok || enter.isPending) return;
    enter.mutate(tok);
  };

  return (
    <div className="flex min-h-[100dvh] items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <section className="kx-guide-hero rounded-kx-lg border border-kx-stroke/40 p-7 sm:p-8">
          <div className="mb-5 flex items-center gap-3">
            {branding?.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={branding.logoUrl}
                alt={name}
                className="h-12 w-12 rounded-kx-md object-cover"
              />
            ) : (
              <span
                className="grid h-12 w-12 place-items-center rounded-kx-md text-white"
                style={{ background: brand }}
              >
                <Building2 className="h-6 w-6" />
              </span>
            )}
            <div className="min-w-0">
              <div className="text-xs font-semibold text-kx-muted">{branding?.nameJa || branding?.nameEn || "合作方专属后台"}</div>
              <h1 className="truncate text-xl font-black text-kx-text">{name} · 房源入驻后台</h1>
            </div>
          </div>

          {branding?.intro ? (
            <p className="mb-4 text-sm leading-6 text-kx-subtle">{branding.intro}</p>
          ) : null}

          <label className="mb-4 block">
            <span className="mb-1.5 block text-xs font-semibold text-kx-muted">访问口令</span>
            <input
              type="password"
              autoComplete="off"
              className="kx-input"
              placeholder="请输入专属访问口令"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
              }}
            />
          </label>

          <button
            className="kx-button-primary h-11 w-full"
            style={{ background: accent, borderColor: accent }}
            disabled={!value.trim() || enter.isPending}
            onClick={submit}
          >
            {enter.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            进入
          </button>

          <p className="mt-5 rounded-kx-md border border-kx-stroke/50 bg-kx-soft/60 px-3 py-2.5 text-xs leading-5 text-kx-muted">
            请妥善保管此专属链接与口令，仅限 {name} 内部使用。
          </p>
        </section>
      </div>
    </div>
  );
}

// ============================================================
// Dashboard
// ============================================================

function PartnerDashboard({
  partnerKey,
  token,
  session,
  branding,
  accent,
  brand,
  onLogout,
  onAuthDrop,
}: {
  partnerKey: string;
  token: string;
  session: PartnerSessionResponse;
  branding?: PartnerBranding;
  accent: string;
  brand: string;
  onLogout: () => void;
  onAuthDrop: () => void;
}) {
  const [tab, setTab] = useState<TabKey>("import");
  const partner = session.partner;
  const name = partner.name || branding?.name || "合作方";

  // Any data call that 401s should bounce back to the gate.
  const onError = (err: unknown) => {
    if (isPartnerAuthError(err)) onAuthDrop();
  };

  const tabs: { key: TabKey; label: string; icon: typeof Upload }[] = [
    { key: "import", label: "批量导入房源", icon: Upload },
    { key: "contacts", label: "预约联系人", icon: Phone },
    { key: "listings", label: "已导入房源", icon: Building2 },
  ];

  return (
    <div>
      <header className="kx-listing-header sticky top-0 z-30 border-b border-kx-stroke/50">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            {branding?.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={branding.logoUrl} alt={name} className="h-10 w-10 rounded-kx-md object-cover" />
            ) : (
              <span className="grid h-10 w-10 place-items-center rounded-kx-md text-white" style={{ background: brand }}>
                <Building2 className="h-5 w-5" />
              </span>
            )}
            <div className="min-w-0">
              <h1 className="truncate text-base font-black text-kx-text">{name} · 房源入驻后台</h1>
              <p className="text-xs text-kx-muted">
                已发布房源 {typeof partner.listingCount === "number" ? partner.listingCount : 0} 条
                {partner.tokenHint ? ` · 口令 ${partner.tokenHint}` : ""}
              </p>
            </div>
          </div>
          <button className="kx-button-ghost h-9" onClick={onLogout}>
            <LogOut className="h-4 w-4" /> 退出
          </button>
        </div>
        <div className="mx-auto max-w-5xl px-4 pb-2">
          <div className="flex gap-1.5 overflow-x-auto">
            {tabs.map((t) => {
              const active = tab === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-bold transition"
                  style={
                    active
                      ? { background: accent, color: "#fff" }
                      : { background: "rgb(var(--kx-soft))", color: "rgb(var(--kx-subtle))" }
                  }
                >
                  <t.icon className="h-4 w-4" /> {t.label}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-5">
        <BrandingCard partnerKey={partnerKey} name={name} logoUrl={branding?.logoUrl} accent={accent} brand={brand} onAuthDrop={onAuthDrop} />
        {tab === "import" ? (
          <ImportTab partnerKey={partnerKey} session={session} accent={accent} onError={onError} onCommitted={() => setTab("listings")} />
        ) : tab === "contacts" ? (
          <ContactsTab partnerKey={partnerKey} accent={accent} onError={onError} />
        ) : (
          <ListingsTab partnerKey={partnerKey} accent={accent} onError={onError} />
        )}
      </main>
    </div>
  );
}

// Company avatar / logo self-service. The 公司账号 (star-domain-style seller
// account that publishes & syncs listings) is provisioned with a discarded
// password and can NEVER log into the app to edit its profile — so the ONLY way
// its avatar can change is here: upload a logo, and the server mirrors it onto
// the account's avatar_url. Fixes "这个账号不能更换头像".
function BrandingCard({
  partnerKey,
  name,
  logoUrl,
  accent,
  brand,
  onAuthDrop,
}: {
  partnerKey: string;
  name: string;
  logoUrl?: string;
  accent: string;
  brand: string;
  onAuthDrop: () => void;
}) {
  const pushToast = useToasts((s) => s.push);
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | undefined>(logoUrl);

  useEffect(() => {
    setPreview(logoUrl);
  }, [logoUrl]);

  const pick = () => fileRef.current?.click();

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      pushToast({ kind: "error", message: "请选择图片文件（PNG / JPG）" });
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      pushToast({ kind: "error", message: "图片过大，请压缩到 8MB 以内" });
      return;
    }
    setBusy(true);
    try {
      const up = await uploadPartnerImage(partnerKey, file);
      await savePartnerBranding(partnerKey, { logo_url: up.url });
      setPreview(up.url);
      await queryClient.invalidateQueries({ queryKey: ["partner", partnerKey, "branding"] });
      pushToast({ kind: "success", message: "公司头像已更新，账号头像会同步显示" });
    } catch (err) {
      if (isPartnerAuthError(err)) {
        onAuthDrop();
        return;
      }
      pushToast({ kind: "error", message: (err as PartnerAPIError).message || "上传失败，请重试" });
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <section className="mb-4 rounded-kx-lg border border-kx-stroke/50 bg-kx-card p-4 sm:p-5">
      <div className="flex items-center gap-4">
        <div className="relative shrink-0">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt={name} className="h-16 w-16 rounded-kx-lg object-cover ring-1 ring-kx-stroke/50" />
          ) : (
            <span className="grid h-16 w-16 place-items-center rounded-kx-lg text-white" style={{ background: brand }}>
              <Building2 className="h-7 w-7" />
            </span>
          )}
          {busy ? (
            <span className="absolute inset-0 grid place-items-center rounded-kx-lg bg-black/40">
              <Loader2 className="h-5 w-5 animate-spin text-white" />
            </span>
          ) : null}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black text-kx-text">公司头像</p>
          <p className="mt-0.5 text-xs leading-5 text-kx-muted">
            上传公司 logo，将同步显示为「{name}」账号头像（房源发布人 / 同步账号）。建议正方形、512×512 以上。
          </p>
        </div>
        <button
          type="button"
          onClick={pick}
          disabled={busy}
          className="kx-button-primary h-9 shrink-0 px-4 disabled:opacity-60"
          style={{ background: accent, borderColor: accent }}
        >
          <ImageIcon className="h-4 w-4" /> {preview ? "更换头像" : "上传头像"}
        </button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => onFile(e.target.files?.[0])}
      />
    </section>
  );
}

// ============================================================
// Shared bits
// ============================================================

function intentPill(intent: PartnerMappedRow["listing_intent"] | string) {
  switch (intent) {
    case "rent":
      return { label: "出租", className: "bg-emerald-500/10 text-emerald-700" };
    case "sale":
      return { label: "出售", className: "bg-blue-500/10 text-blue-700" };
    case "investment":
      return { label: "投资", className: "bg-amber-500/10 text-amber-700" };
    default:
      return { label: intent || "—", className: "bg-kx-soft text-kx-subtle" };
  }
}

function starealTypeSummary(summary: PartnerStarealSummary | null) {
  if (!summary) return "";
  return STAREAL_TYPES.map((t) => `${STAREAL_TYPE_LABELS[t]} ${summary.byType?.[t] || 0}`).join(" · ");
}

function isPartnerStarealJobActive(job: PartnerStarealJob | null | undefined): boolean {
  return job?.status === "queued" || job?.status === "running";
}

function partnerStarealJobResult(job: PartnerStarealJob | null | undefined) {
  const result = job?.result || {};
  return {
    created: Number(result.created ?? job?.created ?? 0),
    updated: Number(result.updated ?? job?.updated ?? 0),
    total: Number(result.total ?? ((job?.created || 0) + (job?.updated || 0))),
    errors: Array.isArray(result.errors) ? result.errors.length : Number(job?.errors || 0),
  };
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-kx-lg border border-kx-stroke/50 bg-kx-card p-4 sm:p-5 ${className}`}>
      {children}
    </section>
  );
}

// ============================================================
// Tab 1 — Import
// ============================================================

function ImportTab({
  partnerKey,
  session,
  accent,
  onError,
  onCommitted,
}: {
  partnerKey: string;
  session: PartnerSessionResponse;
  accent: string;
  onError: (err: unknown) => void;
  onCommitted: () => void;
}) {
  const pushToast = useToasts((s) => s.push);
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const [rows, setRows] = useState<PartnerMappedRow[]>([]);
  const [parseWarnings, setParseWarnings] = useState<string[]>([]);
  const [rehostUrls, setRehostUrls] = useState(true);
  const [matchedImages, setMatchedImages] = useState<number | null>(null);
  const [commitResult, setCommitResult] = useState<PartnerCommitResult["result"] | null>(null);
  const [starealSummary, setStarealSummary] = useState<PartnerStarealSummary | null>(null);

  const templateColumns = session.templateColumns || [];
  const isStarealPartner = STAREAL_PARTNER_KEYS.has(partnerKey);

  const starealJobQuery = useQuery({
    queryKey: ["partner", partnerKey, "stareal-job"],
    queryFn: () => getStarealSyncJob(partnerKey),
    enabled: isStarealPartner,
    refetchInterval: isStarealPartner ? 2500 : false,
  });
  const starealJob = starealJobQuery.data?.job || null;
  const starealJobActive = isPartnerStarealJobActive(starealJob);
  const starealJobResult = partnerStarealJobResult(starealJob);

  useEffect(() => {
    if (starealJob?.status === "succeeded") {
      queryClient.invalidateQueries({ queryKey: ["partner", partnerKey, "listings"] });
    }
  }, [partnerKey, queryClient, starealJob?.status]);

  const downloadTemplate = useMutation({
    mutationFn: () => getPartnerTemplate(partnerKey),
    onSuccess: (data) => {
      const blob = new Blob([data.csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = data.filename || "import-template.csv";
      a.click();
      URL.revokeObjectURL(url);
      pushToast({ kind: "success", message: "模板已下载" });
    },
    onError: (err) => {
      onError(err);
      pushToast({ kind: "error", message: err instanceof Error ? err.message : "下载失败" });
    },
  });

  const parse = useMutation({
    mutationFn: (file: File) => parsePartnerImport(partnerKey, file),
    onSuccess: (data) => {
      setRows(data.rows || []);
      setParseWarnings(data.warnings || []);
      setMatchedImages(null);
      setCommitResult(null);
      setStarealSummary(null);
      pushToast({ kind: "success", message: `已解析 ${data.rowCount} 条房源` });
    },
    onError: (err) => {
      onError(err);
      pushToast({ kind: "error", message: err instanceof Error ? err.message : "解析失败" });
    },
  });

  const starealPreview = useMutation({
    mutationFn: () => previewStarealImport(partnerKey, { types: STAREAL_TYPES, maxImages: 20, fullRes: true }),
    onSuccess: (data) => {
      setRows(data.rows || []);
      setParseWarnings(data.warnings || []);
      setMatchedImages(null);
      setCommitResult(null);
      setStarealSummary(data.summary || null);
      pushToast({ kind: "success", message: `已获取官网 ${data.rowCount} 条房源` });
    },
    onError: (err) => {
      onError(err);
      pushToast({ kind: "error", message: err instanceof Error ? err.message : "官网获取失败" });
    },
  });

  const starealSync = useMutation({
    mutationFn: () =>
      syncStarealImport(partnerKey, { types: STAREAL_TYPES, maxImages: 20, fullRes: true, rehostUrls }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["partner", partnerKey, "stareal-job"] });
      pushToast({
        kind: "success",
        message: data.reused ? "已有同步任务正在进行，已恢复进度" : "已开始后台同步，关闭浏览器也会继续执行",
      });
    },
    onError: (err) => {
      onError(err);
      pushToast({ kind: "error", message: err instanceof Error ? err.message : "同步失败" });
    },
  });

  const uploadImages = useMutation({
    mutationFn: async (files: File[]) => {
      const map: Record<string, string> = {};
      for (const file of files) {
        const res = await uploadPartnerImage(partnerKey, file);
        map[file.name] = res.url;
      }
      return map;
    },
    onSuccess: (map) => {
      let matched = 0;
      setRows((prev) =>
        prev.map((row) => {
          const adds = (row.image_filenames || [])
            .map((fn) => map[fn])
            .filter((u): u is string => !!u && !row.image_urls.includes(u));
          if (adds.length === 0) return row;
          matched += adds.length;
          return { ...row, image_urls: [...row.image_urls, ...adds] };
        }),
      );
      setMatchedImages(matched);
      pushToast({ kind: "success", message: `已上传 ${Object.keys(map).length} 张，匹配 ${matched} 张到房源` });
    },
    onError: (err) => {
      onError(err);
      pushToast({ kind: "error", message: err instanceof Error ? err.message : "图片上传失败" });
    },
  });

  const validRows = useMemo(() => rows.filter((r) => (r.errors?.length || 0) === 0), [rows]);
  const errorCount = rows.length - validRows.length;

  const commit = useMutation({
    mutationFn: () => commitPartnerImport(partnerKey, validRows, { rehostUrls }),
    onSuccess: (data) => {
      setCommitResult(data.result);
      queryClient.invalidateQueries({ queryKey: ["partner", partnerKey, "listings"] });
      pushToast({
        kind: "success",
        message: `导入完成：新增 ${data.result.created} 条，更新 ${data.result.updated} 条`,
      });
      onCommitted();
    },
    onError: (err) => {
      onError(err);
      pushToast({ kind: "error", message: err instanceof Error ? err.message : "导入失败" });
    },
  });

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (file) parse.mutate(file);
  };

  const onPickImages = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (files.length) uploadImages.mutate(files);
  };

  const starealBusy = starealPreview.isPending || starealSync.isPending || starealJobActive;
  const effectiveStarealSummary = starealSummary || (starealJob?.summary?.mapped ? starealJob.summary as PartnerStarealSummary : null);

  return (
    <div className="grid gap-4">
      {isStarealPartner ? (
        <Card>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="mb-2 flex items-center gap-2">
                <Globe2 className="h-5 w-5" style={{ color: accent }} />
                <h2 className="text-base font-black text-kx-text">星域东京官网同步</h2>
              </div>
              <p className="text-sm leading-6 text-kx-subtle">
                从 stareal.jp 直接获取买房、租房、投资房源与全部照片。相同官网物件编号会更新原房源，不会重复发布。
              </p>
            </div>
            <span className="rounded-full bg-kx-accentSoft px-3 py-1 text-xs font-bold text-kx-accent">
              授权合作方
            </span>
          </div>

          {effectiveStarealSummary ? (
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              <div className="rounded-kx-md border border-kx-stroke/50 bg-kx-soft/50 px-3 py-2.5">
                <div className="text-xs font-semibold text-kx-muted">官网房源</div>
                <div className="mt-1 text-2xl font-black text-kx-text">{effectiveStarealSummary.mapped}</div>
                <div className="mt-0.5 text-xs text-kx-muted">{starealTypeSummary(effectiveStarealSummary)}</div>
              </div>
              <div className="rounded-kx-md border border-kx-stroke/50 bg-kx-soft/50 px-3 py-2.5">
                <div className="text-xs font-semibold text-kx-muted">照片</div>
                <div className="mt-1 text-2xl font-black text-kx-text">{effectiveStarealSummary.imageCount}</div>
                <div className="mt-0.5 text-xs text-kx-muted">每套最多 {effectiveStarealSummary.maxImages} 张</div>
              </div>
              <div className="rounded-kx-md border border-kx-stroke/50 bg-kx-soft/50 px-3 py-2.5">
                <div className="text-xs font-semibold text-kx-muted">发布类型</div>
                <div className="mt-1 text-2xl font-black text-kx-text">
                  {(effectiveStarealSummary.byIntent?.rent || 0) + (effectiveStarealSummary.byIntent?.sale || 0) + (effectiveStarealSummary.byIntent?.investment || 0)}
                </div>
                <div className="mt-0.5 text-xs text-kx-muted">
                  出租 {effectiveStarealSummary.byIntent?.rent || 0} · 出售 {effectiveStarealSummary.byIntent?.sale || 0} · 投资 {effectiveStarealSummary.byIntent?.investment || 0}
                </div>
              </div>
            </div>
          ) : null}

          <div className="mt-4 grid gap-3">
            {starealJob ? (
              <div className="rounded-kx-md border border-kx-stroke/50 bg-kx-soft/50 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="font-bold text-kx-text">{starealJob.message || "同步任务"}</span>
                  <span className="font-mono text-kx-muted">{Math.max(0, Math.min(100, starealJob.progress || 0))}%</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-kx-card">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${Math.max(2, Math.min(100, starealJob.progress || 0))}%`, background: accent }}
                  />
                </div>
                <div className="mt-2 flex flex-wrap gap-2 text-xs text-kx-muted">
                  <span>{starealJob.status === "failed" ? "失败" : starealJob.status === "succeeded" ? "已完成" : "进行中"}</span>
                  {starealJob.totalSteps ? <span>已处理 {starealJob.processedSteps}/{starealJob.totalSteps}</span> : null}
                  {starealJob.imageCount ? <span>照片 {starealJob.imageCount}</span> : null}
                  {starealJob.status === "succeeded" ? (
                    <span>新增 {starealJobResult.created} · 更新重复 {starealJobResult.updated}</span>
                  ) : null}
                  {starealJob.status === "failed" ? (
                    <span className="text-kx-danger">{starealJob.errorMessage || "同步失败"}</span>
                  ) : null}
                </div>
              </div>
            ) : null}
            <label className="flex items-center gap-2 text-sm text-kx-subtle">
              <input
                type="checkbox"
                className="h-4 w-4 accent-kx-accent"
                checked={rehostUrls}
                onChange={(e) => setRehostUrls(e.target.checked)}
              />
              同步时下载并托管照片到 Machi
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                className="kx-button-ghost h-9"
                disabled={starealBusy}
                onClick={() => starealPreview.mutate()}
              >
                {starealPreview.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                预览官网房源
              </button>
              <button
                className="kx-button-primary h-9"
                style={{ background: accent, borderColor: accent }}
                disabled={starealBusy}
                onClick={() => starealSync.mutate()}
              >
                {starealSync.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {starealJobActive ? "同步中" : "同步并发布"}
              </button>
              {starealJobActive ? (
                <span className="self-center text-xs text-kx-muted">后台正在同步，离开页面后也会继续。</span>
              ) : null}
            </div>
          </div>
        </Card>
      ) : null}

      {/* Intro / help */}
      <Card>
        <div className="mb-3 flex items-center gap-2">
          <FileSpreadsheet className="h-5 w-5" style={{ color: accent }} />
          <h2 className="text-base font-black text-kx-text">批量导入房源</h2>
        </div>
        <p className="text-sm leading-6 text-kx-subtle">
          通过 Excel(.xlsx) 或 CSV 一次性导入房源的字段与图片。图片支持三选一或混用：
        </p>
        <ul className="mt-2 grid gap-1.5 text-sm text-kx-subtle">
          <li className="flex gap-2"><span className="font-bold" style={{ color: accent }}>1.</span> 图片链接列(URL)：在表格列中粘贴公开图片地址。</li>
          <li className="flex gap-2"><span className="font-bold" style={{ color: accent }}>2.</span> 上传图片文件：表格写文件名，下方「补充上传图片」按文件名自动匹配。</li>
          <li className="flex gap-2"><span className="font-bold" style={{ color: accent }}>3.</span> 直接贴进 Excel 单元格(嵌入图)：服务器会自动解析单元格里的内嵌图片。</li>
        </ul>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            className="kx-button-primary h-9"
            style={{ background: accent, borderColor: accent }}
            disabled={downloadTemplate.isPending}
            onClick={() => downloadTemplate.mutate()}
          >
            {downloadTemplate.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            下载导入模板
          </button>
        </div>

        {templateColumns.length > 0 ? (
          <div className="mt-4 overflow-hidden rounded-kx-md border border-kx-stroke/50">
            <table className="w-full text-left text-xs">
              <thead className="bg-kx-soft/70 text-kx-muted">
                <tr>
                  <th className="px-3 py-2 font-semibold">列名</th>
                  <th className="px-3 py-2 font-semibold">说明</th>
                </tr>
              </thead>
              <tbody>
                {templateColumns.map((c) => (
                  <tr key={c.header} className="border-t border-kx-stroke/40">
                    <td className="whitespace-nowrap px-3 py-2 font-mono font-bold text-kx-text">{c.header}</td>
                    <td className="px-3 py-2 text-kx-subtle">{c.hint}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </Card>

      {/* File picker / drop zone */}
      <Card>
        <input ref={fileInputRef} type="file" accept=".xlsx,.csv" className="hidden" onChange={onPickFile} />
        <div
          role="button"
          tabIndex={0}
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click();
          }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const file = e.dataTransfer.files?.[0];
            if (file) parse.mutate(file);
          }}
          className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-kx-md border-2 border-dashed border-kx-stroke/70 bg-kx-soft/40 px-4 py-10 text-center transition hover:border-kx-accent/60"
        >
          {parse.isPending ? (
            <>
              <Loader2 className="h-7 w-7 animate-spin text-kx-muted" />
              <p className="text-sm font-semibold text-kx-subtle">正在解析表格…</p>
            </>
          ) : (
            <>
              <Upload className="h-7 w-7" style={{ color: accent }} />
              <p className="text-sm font-bold text-kx-text">点击或拖拽上传 .xlsx / .csv</p>
              <p className="text-xs text-kx-muted">一次上传一个文件，解析后可在下方预览</p>
            </>
          )}
        </div>
        {parseWarnings.length > 0 ? (
          <div className="mt-3 rounded-kx-md border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
            <div className="mb-1 flex items-center gap-1.5 font-bold">
              <AlertTriangle className="h-3.5 w-3.5" /> 解析提示
            </div>
            {parseWarnings.map((w, i) => (
              <div key={i}>· {w}</div>
            ))}
          </div>
        ) : null}
      </Card>

      {/* Preview */}
      {rows.length > 0 ? (
        <Card className="!p-0">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-kx-stroke/50 px-4 py-3">
            <h3 className="font-black text-kx-text">
              预览 {rows.length} 条
              {errorCount > 0 ? <span className="ml-2 text-xs font-semibold text-kx-danger">{errorCount} 条有错误，将被跳过</span> : null}
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-left text-sm">
              <thead className="bg-kx-soft/70 text-xs text-kx-muted">
                <tr>
                  <th className="px-3 py-2 font-semibold">标题</th>
                  <th className="px-3 py-2 font-semibold">类型</th>
                  <th className="px-3 py-2 font-semibold">价格</th>
                  <th className="px-3 py-2 font-semibold">图片</th>
                  <th className="px-3 py-2 font-semibold">预约联系人</th>
                  <th className="px-3 py-2 font-semibold">Machi推荐</th>
                  <th className="px-3 py-2 font-semibold">警告 / 错误</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const hasError = (row.errors?.length || 0) > 0;
                  const pill = intentPill(row.listing_intent);
                  return (
                    <tr
                      key={row.row_index}
                      className={`border-t border-kx-stroke/40 align-top ${hasError ? "bg-kx-danger/5" : ""}`}
                    >
                      <td className="px-3 py-2">
                        <div className="font-bold text-kx-text">{row.title || "(无标题)"}</div>
                        <div className="text-xs text-kx-muted">{row.location_text || row.city_slug || "—"}</div>
                      </td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-bold ${pill.className}`}>{pill.label}</span>
                      </td>
                      <td className="px-3 py-2 text-kx-subtle">
                        {row.price != null ? `${row.currency || ""} ${row.price}`.trim() : "—"}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5">
                          <span className="inline-flex items-center gap-1 text-xs text-kx-muted">
                            <ImageIcon className="h-3.5 w-3.5" /> {row.image_urls.length}
                          </span>
                          <div className="flex gap-1">
                            {row.image_urls.slice(0, 3).map((u, i) => (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img key={i} src={u} alt="" className="h-7 w-7 rounded object-cover" />
                            ))}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-kx-subtle">{row.contact?.name || "—"}</td>
                      <td className="px-3 py-2">
                        {row.machi_recommended ? (
                          <CheckCircle2 className="h-4 w-4 text-amber-500" />
                        ) : (
                          <span className="text-xs text-kx-muted">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {row.errors?.length ? (
                          <div className="text-xs font-semibold text-kx-danger">{row.errors.join("；")}</div>
                        ) : null}
                        {row.warnings?.length ? (
                          <div className="text-xs text-amber-700">{row.warnings.join("；")}</div>
                        ) : null}
                        {!row.errors?.length && !row.warnings?.length ? (
                          <span className="text-xs text-kx-muted">—</span>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Supplemental image upload + options + commit */}
          <div className="grid gap-3 border-t border-kx-stroke/50 px-4 py-4">
            <input ref={imageInputRef} type="file" accept="image/*" multiple className="hidden" onChange={onPickImages} />
            <div className="flex flex-wrap items-center gap-2">
              <button
                className="kx-button-ghost h-9"
                disabled={uploadImages.isPending}
                onClick={() => imageInputRef.current?.click()}
              >
                {uploadImages.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}
                补充上传图片
              </button>
              {matchedImages != null ? (
                <span className="text-xs text-kx-subtle">已匹配 {matchedImages} 张图片到对应房源</span>
              ) : (
                <span className="text-xs text-kx-muted">按表格中的图片文件名自动匹配到对应房源</span>
              )}
            </div>

            <label className="flex items-center gap-2 text-sm text-kx-subtle">
              <input
                type="checkbox"
                className="h-4 w-4 accent-kx-accent"
                checked={rehostUrls}
                onChange={(e) => setRehostUrls(e.target.checked)}
              />
              下载并托管图片到 Machi（更稳定）
            </label>

            <div>
              <button
                className="kx-button-primary h-10"
                style={{ background: accent, borderColor: accent }}
                disabled={validRows.length === 0 || commit.isPending}
                onClick={() => commit.mutate()}
              >
                {commit.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                确认导入 {validRows.length} 条
              </button>
            </div>
          </div>
        </Card>
      ) : null}

      {/* Result panel */}
      {commitResult ? (
        <Card>
          <div className="mb-3 flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-kx-repost" />
            <h3 className="font-black text-kx-text">导入结果</h3>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "新增", value: commitResult.created },
              { label: "更新", value: commitResult.updated },
              { label: "总计", value: commitResult.total },
            ].map((s) => (
              <div key={s.label} className="rounded-kx-md border border-kx-stroke/50 bg-kx-soft/50 px-3 py-2.5 text-center">
                <div className="text-xs font-semibold text-kx-muted">{s.label}</div>
                <div className="mt-1 text-2xl font-black text-kx-text">{s.value}</div>
              </div>
            ))}
          </div>
          {commitResult.errors?.length ? (
            <div className="mt-3 rounded-kx-md border border-kx-danger/40 bg-kx-danger/5 px-3 py-2.5 text-xs leading-5 text-kx-danger">
              <div className="mb-1 font-bold">部分行导入失败</div>
              {commitResult.errors.map((e) => (
                <div key={e.row_index}>
                  第 {e.row_index + 1} 行「{e.title || "无标题"}」：{e.errors.join("；")}
                </div>
              ))}
            </div>
          ) : null}
          {commitResult.results?.some((r) => r.warnings?.length) ? (
            <div className="mt-3 rounded-kx-md border border-amber-300/60 bg-amber-50 px-3 py-2.5 text-xs leading-5 text-amber-800">
              <div className="mb-1 font-bold">提示</div>
              {commitResult.results
                .filter((r) => r.warnings?.length)
                .map((r) => (
                  <div key={r.row_index}>
                    「{r.title}」：{r.warnings.join("；")}
                  </div>
                ))}
            </div>
          ) : null}
        </Card>
      ) : null}
    </div>
  );
}

// ============================================================
// Tab 2 — Contacts
// ============================================================

const EMPTY_CONTACT_FORM: PartnerContactPayload = {
  name: "",
  title: "",
  phone: "",
  email: "",
  line_id: "",
  wechat_id: "",
  whatsapp: "",
  languages: "",
  note: "",
  photo_url: "",
  is_default: false,
};

function ContactsTab({
  partnerKey,
  accent,
  onError,
}: {
  partnerKey: string;
  accent: string;
  onError: (err: unknown) => void;
}) {
  const pushToast = useToasts((s) => s.push);
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<PartnerContactPayload>(EMPTY_CONTACT_FORM);

  const q = useQuery({
    queryKey: ["partner", partnerKey, "contacts"],
    queryFn: () => listPartnerContacts(partnerKey),
  });

  useEffect(() => {
    if (q.error) onError(q.error);
  }, [q.error, onError]);

  const resetForm = () => {
    setEditingId(null);
    setForm(EMPTY_CONTACT_FORM);
  };

  const startEdit = (c: PartnerContact) => {
    setEditingId(c.id);
    setForm({
      name: c.name || "",
      name_ja: c.nameJa || "",
      title: c.title || "",
      phone: c.phone || "",
      email: c.email || "",
      line_id: c.lineId || "",
      wechat_id: c.wechatId || "",
      whatsapp: c.whatsapp || "",
      languages: c.languages || "",
      note: c.note || "",
      photo_url: c.photoUrl || "",
      is_default: !!c.isDefault,
    });
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const save = useMutation({
    mutationFn: () => {
      const payload: PartnerContactPayload = { ...form, name: form.name.trim() };
      return editingId ? updatePartnerContact(partnerKey, editingId, payload) : createPartnerContact(partnerKey, payload);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["partner", partnerKey, "contacts"] });
      queryClient.invalidateQueries({ queryKey: ["partner", partnerKey, "listings"] });
      if (editingId && "resynced" in data && typeof data.resynced === "number") {
        pushToast({ kind: "success", message: `已保存，已同步 ${data.resynced} 个房源的联系人` });
      } else {
        pushToast({ kind: "success", message: "联系人已保存" });
      }
      resetForm();
    },
    onError: (err) => {
      onError(err);
      pushToast({ kind: "error", message: err instanceof Error ? err.message : "保存失败" });
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => deletePartnerContact(partnerKey, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["partner", partnerKey, "contacts"] });
      pushToast({ kind: "success", message: "联系人已删除" });
      if (editingId) resetForm();
    },
    onError: (err) => {
      onError(err);
      pushToast({ kind: "error", message: err instanceof Error ? err.message : "删除失败" });
    },
  });

  const contacts = q.data?.contacts || [];

  const FIELDS: { key: keyof PartnerContactPayload; label: string; type?: string }[] = [
    { key: "title", label: "职务 / 头衔" },
    { key: "phone", label: "电话", type: "tel" },
    { key: "email", label: "邮箱", type: "email" },
    { key: "line_id", label: "LINE ID" },
    { key: "wechat_id", label: "微信号" },
    { key: "whatsapp", label: "WhatsApp" },
    { key: "languages", label: "可用语言（如 中文/日语/英语）" },
    { key: "photo_url", label: "头像图片链接" },
  ];

  return (
    <div className="grid gap-4">
      <Card>
        <p className="text-sm leading-6 text-kx-subtle">
          预约联系人会展示在该后台导入的房源页，供用户直接电话 / LINE 联系。可设置多位联系人，并指定一位默认联系人。
        </p>
      </Card>

      {/* Add / edit form */}
      <Card>
        <div className="mb-3 flex items-center gap-2">
          {editingId ? <Pencil className="h-5 w-5" style={{ color: accent }} /> : <Plus className="h-5 w-5" style={{ color: accent }} />}
          <h2 className="text-base font-black text-kx-text">{editingId ? "编辑联系人" : "新增联系人"}</h2>
          {editingId ? (
            <button className="ml-auto text-kx-muted hover:text-kx-text" onClick={resetForm} aria-label="取消编辑">
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-xs font-semibold text-kx-muted sm:col-span-2">
            姓名（必填）
            <input
              className="kx-input"
              value={form.name}
              onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
              placeholder="联系人姓名"
            />
          </label>
          {FIELDS.map((f) => (
            <label key={f.key as string} className="grid gap-1 text-xs font-semibold text-kx-muted">
              {f.label}
              <input
                className="kx-input"
                type={f.type || "text"}
                value={(form[f.key] as string) || ""}
                onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))}
              />
            </label>
          ))}
          <label className="grid gap-1 text-xs font-semibold text-kx-muted sm:col-span-2">
            备注
            <textarea
              className="kx-textarea min-h-[72px]"
              value={form.note || ""}
              onChange={(e) => setForm((s) => ({ ...s, note: e.target.value }))}
            />
          </label>
          <label className="flex items-center gap-2 text-sm font-medium text-kx-subtle sm:col-span-2">
            <input
              type="checkbox"
              className="h-4 w-4 accent-kx-accent"
              checked={!!form.is_default}
              onChange={(e) => setForm((s) => ({ ...s, is_default: e.target.checked }))}
            />
            设为默认联系人
          </label>
        </div>
        <div className="mt-4 flex gap-2">
          <button
            className="kx-button-primary h-9"
            style={{ background: accent, borderColor: accent }}
            disabled={!form.name.trim() || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : editingId ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {editingId ? "保存修改" : "添加联系人"}
          </button>
          {editingId ? (
            <button className="kx-button-ghost h-9" onClick={resetForm}>
              取消
            </button>
          ) : null}
        </div>
      </Card>

      {/* List */}
      {q.isLoading ? (
        <Card>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-kx-muted" />
          </div>
        </Card>
      ) : contacts.length === 0 ? (
        <Card>
          <div className="py-8 text-center text-sm text-kx-muted">暂无联系人，请在上方添加。</div>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {contacts.map((c) => (
            <Card key={c.id}>
              <div className="flex items-start gap-3">
                {c.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.photoUrl} alt={c.name} className="h-12 w-12 rounded-full object-cover" />
                ) : (
                  <span className="grid h-12 w-12 place-items-center rounded-full bg-kx-soft text-kx-muted">
                    <Phone className="h-5 w-5" />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate font-black text-kx-text">{c.name}</h3>
                    {c.isDefault ? (
                      <span className="rounded-full bg-kx-accentSoft px-2 py-0.5 text-[11px] font-bold text-kx-accent">默认</span>
                    ) : null}
                  </div>
                  {c.title ? <div className="text-xs text-kx-muted">{c.title}</div> : null}
                  <div className="mt-2 grid gap-1 text-xs text-kx-subtle">
                    {c.phone ? (
                      <div className="flex items-center gap-1.5">
                        <Phone className="h-3.5 w-3.5 text-kx-muted" /> {c.phone}
                      </div>
                    ) : null}
                    {c.lineId ? (
                      <div className="flex items-center gap-1.5">
                        <MessageCircle className="h-3.5 w-3.5 text-kx-muted" /> LINE {c.lineId}
                      </div>
                    ) : null}
                    {c.wechatId ? (
                      <div className="flex items-center gap-1.5">
                        <MessageCircle className="h-3.5 w-3.5 text-kx-muted" /> 微信 {c.wechatId}
                      </div>
                    ) : null}
                    {c.email ? (
                      <div className="flex items-center gap-1.5">
                        <Mail className="h-3.5 w-3.5 text-kx-muted" /> {c.email}
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <button
                    className="rounded-full bg-kx-accentSoft p-2 text-kx-accent"
                    aria-label="编辑"
                    onClick={() => startEdit(c)}
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    className="rounded-full bg-kx-danger/10 p-2 text-kx-danger"
                    aria-label="删除"
                    disabled={remove.isPending}
                    onClick={() => {
                      if (typeof window !== "undefined" && window.confirm(`确定删除联系人「${c.name}」？`)) {
                        remove.mutate(c.id);
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Tab 3 — Listings
// ============================================================

// ---- listing editor form state ----

type ListingFormKind = "rent" | "sale";

interface ListingForm {
  kind: ListingFormKind; // 长租 / 买房
  investment: boolean; // 买房 only — flips sale → investment
  title: string;
  price: string; // raw text; coerced to number on save
  category: string;
  location_text: string;
  description: string;
  layout: string; // attrs.layout
  area_sqm: string; // attrs.area_sqm
  yield_rate: string; // 买房 only — attrs.yield_rate
  land_area: string; // 买房 only — attrs.land_area
  building_age: string; // 买房 only — attrs.building_age
  structure: string; // 买房 only — attrs.structure
  nearest_station: string; // attrs.nearest_station
  contact_id: string;
  badges: string; // comma input
  machi_recommended: boolean;
  status: "published" | "draft";
}

const EMPTY_LISTING_FORM: ListingForm = {
  kind: "rent",
  investment: false,
  title: "",
  price: "",
  category: "",
  location_text: "",
  description: "",
  layout: "",
  area_sqm: "",
  yield_rate: "",
  land_area: "",
  building_age: "",
  structure: "",
  nearest_station: "",
  contact_id: "",
  badges: "",
  machi_recommended: false,
  status: "published",
};

function attrStr(attrs: Record<string, unknown> | undefined, key: string): string {
  const v = attrs?.[key];
  if (v == null) return "";
  return String(v);
}

// Map a fetched listing back into editable form state.
function listingToForm(l: PartnerListing): ListingForm {
  const attrs = l.attributes || {};
  const intent = typeof l.listing_intent === "string" ? l.listing_intent : l.type;
  const isSale = intent === "sale" || intent === "investment";
  const priceRaw =
    attrStr(attrs, isSale ? "sale_price" : "rent") ||
    (l.price != null ? String(l.price) : "");
  return {
    kind: isSale ? "sale" : "rent",
    investment: intent === "investment",
    title: l.title || "",
    price: priceRaw,
    category: typeof l.category === "string" ? l.category : attrStr(attrs, "category"),
    location_text:
      (typeof l.location_text === "string" && l.location_text) ||
      (typeof l.locationText === "string" && l.locationText) ||
      attrStr(attrs, "location_text") ||
      "",
    description:
      (typeof l.description === "string" && l.description) || attrStr(attrs, "description") || "",
    layout: attrStr(attrs, "layout"),
    area_sqm: attrStr(attrs, "area_sqm"),
    yield_rate: attrStr(attrs, "yield_rate"),
    land_area: attrStr(attrs, "land_area"),
    building_age: attrStr(attrs, "building_age"),
    structure: attrStr(attrs, "structure"),
    nearest_station: attrStr(attrs, "nearest_station"),
    contact_id: extractContactId(l),
    badges: (l.machiBadges || []).join("，"),
    machi_recommended: !!l.machiRecommended,
    status: (l.status as "published" | "draft") === "draft" ? "draft" : "published",
  };
}

function extractContactId(l: PartnerListing): string {
  const rc = l.reservationContact;
  if (rc && typeof rc.id === "string") return rc.id;
  if (typeof l.contact_id === "string") return l.contact_id;
  if (typeof l.contactId === "string") return l.contactId;
  return "";
}

// Existing image_urls on a listing, in whatever shape the backend returns.
function listingImageUrls(l: PartnerListing): string[] {
  const candidates = [l.image_urls, l.imageUrls, l.images, l.photos];
  for (const c of candidates) {
    if (Array.isArray(c)) {
      const urls = c
        .map((it) => (typeof it === "string" ? it : (it as { url?: string })?.url))
        .filter((u): u is string => typeof u === "string" && !!u);
      if (urls.length) return urls;
    }
  }
  if (l.coverUrl) return [l.coverUrl];
  return [];
}

function ListingsTab({
  partnerKey,
  accent,
  onError,
}: {
  partnerKey: string;
  accent: string;
  onError: (err: unknown) => void;
}) {
  const pageSizeOptions = [
    { label: "30 / 页", value: "30" },
    { label: "60 / 页", value: "60" },
    { label: "120 / 页", value: "120" },
    { label: "200 / 页", value: "200" },
    { label: "全部", value: "all" },
  ];
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [pageSize, setPageSize] = useState("60");
  const [page, setPage] = useState(0);
  const isUnlimited = pageSize === "all";
  const pageLimit = isUnlimited ? "all" : Number(pageSize);
  const offset = isUnlimited ? 0 : page * Number(pageSize);
  const q = useQuery({
    queryKey: ["partner", partnerKey, "listings", search, pageSize, offset],
    queryFn: () => listPartnerListings(partnerKey, { q: search, limit: pageLimit, offset }),
  });

  useEffect(() => {
    if (q.error) onError(q.error);
  }, [q.error, onError]);

  const pushToast = useToasts((s) => s.push);
  const queryClient = useQueryClient();

  // editor state: null = closed, { id: null } = create, { id } = edit
  const [editor, setEditor] = useState<{ id: string | null; listing: PartnerListing | null } | null>(null);

  const remove = useMutation({
    mutationFn: (id: string) => partnerDeleteListing(partnerKey, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["partner", partnerKey, "listings"] });
      pushToast({ kind: "success", message: "房源已删除" });
    },
    onError: (err) => {
      onError(err);
      pushToast({ kind: "error", message: err instanceof Error ? err.message : "删除失败" });
    },
  });

  const listings: PartnerListing[] = q.data?.listings || [];
  const total = q.data?.total ?? listings.length;
  const currentOffset = q.data?.offset ?? offset;
  const currentStart = total > 0 ? currentOffset + 1 : 0;
  const currentEnd = total > 0 ? currentOffset + listings.length : 0;
  const hasPrevious = !isUnlimited && currentOffset > 0;
  const hasNext = !isUnlimited && !!q.data?.hasMore;
  const applySearch = () => {
    setSearch(searchInput.trim());
    setPage(0);
  };
  const clearSearch = () => {
    setSearchInput("");
    setSearch("");
    setPage(0);
  };

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 rounded-kx-lg border border-kx-stroke/50 bg-kx-card/85 p-3 shadow-[0_18px_58px_-44px_rgba(15,23,42,0.4)] backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-kx-muted">
              共 {total} 条房源
              {search ? <span> · 搜索 “{search}”</span> : null}
              {q.isFetching ? " · 刷新中…" : ""}
            </p>
            <p className="mt-0.5 text-xs text-kx-muted">
              {isUnlimited ? "当前显示全部匹配房源" : total > 0 ? `当前 ${currentStart}-${currentEnd}` : "当前无结果"}
            </p>
          </div>
          <button
            className="kx-button-primary h-9"
            style={{ background: accent, borderColor: accent }}
            onClick={() => setEditor({ id: null, listing: null })}
          >
            <Plus className="h-4 w-4" /> 新增房源
          </button>
        </div>

        <form
          className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto_auto]"
          onSubmit={(event) => {
            event.preventDefault();
            applySearch();
          }}
        >
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-kx-muted" />
            <input
              className="kx-input h-10 w-full pl-9"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="搜索标题、地址、官网物件编号、户型、车站"
            />
          </label>
          <select
            className="kx-input h-10 min-w-[128px]"
            value={pageSize}
            onChange={(e) => {
              setPageSize(e.target.value);
              setPage(0);
            }}
            aria-label="每页显示数量"
          >
            {pageSizeOptions.map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </select>
          <div className="flex gap-2">
            <button className="kx-button-primary h-10 px-4" style={{ background: accent, borderColor: accent }} type="submit">
              搜索
            </button>
            {search || searchInput ? (
              <button className="kx-button-ghost h-10 px-4" type="button" onClick={clearSearch}>
                清空
              </button>
            ) : null}
          </div>
        </form>
      </div>

      {q.isLoading ? (
        <Card>
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-kx-muted" />
          </div>
        </Card>
      ) : listings.length === 0 ? (
        <Card>
          <div className="py-10 text-center">
            <Building2 className="mx-auto mb-2 h-8 w-8 text-kx-muted" />
            <p className="text-sm font-semibold text-kx-text">{search ? "没有找到匹配房源" : "暂无房源"}</p>
            <p className="mt-1 text-xs text-kx-muted">
              {search ? "换一个关键词，或清空搜索查看全部房源。" : "点击右上角「新增房源」或前往「批量导入房源」。"}
            </p>
          </div>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {listings.map((l) => (
            <article key={l.id} className="flex flex-col overflow-hidden rounded-kx-lg border border-kx-stroke/50 bg-kx-card">
              <div className="aspect-[4/3] w-full bg-kx-soft">
                {l.coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={l.coverUrl} alt={l.title} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-kx-muted">
                    <Building2 className="h-8 w-8" />
                  </div>
                )}
              </div>
              <div className="flex flex-1 flex-col p-3">
                <h3 className="line-clamp-2 font-bold text-kx-text">{l.title}</h3>
                <div className="mt-1 text-sm font-black" style={{ color: accent }}>
                  {l.priceLabel || (l.price != null ? String(l.price) : "面议")}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {l.machiRecommended ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-bold text-amber-700">
                      <Sparkles className="h-3 w-3" /> Machi推荐
                    </span>
                  ) : null}
                  {(l.machiBadges || []).map((b) => (
                    <span key={b} className="rounded-full bg-kx-soft px-2 py-0.5 text-[11px] font-semibold text-kx-subtle">
                      {b}
                    </span>
                  ))}
                </div>
                {l.reservationContact?.name ? (
                  <div className="mt-2 flex items-center gap-1.5 text-xs text-kx-muted">
                    <Phone className="h-3.5 w-3.5" /> {l.reservationContact.name}
                  </div>
                ) : null}
                <div className="mt-3 flex gap-2 border-t border-kx-stroke/40 pt-3">
                  <button
                    className="kx-button-ghost h-8 flex-1"
                    onClick={() => setEditor({ id: l.id, listing: l })}
                  >
                    <Pencil className="h-3.5 w-3.5" /> 编辑
                  </button>
                  <button
                    className="inline-flex h-8 items-center justify-center gap-1.5 rounded-full bg-kx-danger/10 px-3 text-sm font-bold text-kx-danger disabled:opacity-50"
                    disabled={remove.isPending}
                    onClick={() => {
                      if (typeof window !== "undefined" && window.confirm("确定删除该房源？")) {
                        remove.mutate(l.id);
                      }
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" /> 删除
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {!isUnlimited && total > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-kx-lg border border-kx-stroke/50 bg-kx-card/80 px-3 py-2">
          <p className="text-xs font-semibold text-kx-muted">
            第 {page + 1} 页 · 显示 {currentStart}-{currentEnd} / {total}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              className="kx-button-ghost h-9 px-3"
              disabled={!hasPrevious || q.isFetching}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              <ChevronLeft className="h-4 w-4" /> 上一页
            </button>
            <button
              type="button"
              className="kx-button-ghost h-9 px-3"
              disabled={!hasNext || q.isFetching}
              onClick={() => setPage((p) => p + 1)}
            >
              下一页 <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : null}

      {editor ? (
        <ListingEditor
          partnerKey={partnerKey}
          accent={accent}
          listingId={editor.id}
          listing={editor.listing}
          onError={onError}
          onClose={() => setEditor(null)}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ["partner", partnerKey, "listings"] });
            setEditor(null);
          }}
        />
      ) : null}
    </div>
  );
}

// ============================================================
// Listing editor (create / edit) — modal
// ============================================================

function ListingEditor({
  partnerKey,
  accent,
  listingId,
  listing,
  onError,
  onClose,
  onSaved,
}: {
  partnerKey: string;
  accent: string;
  listingId: string | null;
  listing: PartnerListing | null;
  onError: (err: unknown) => void;
  onClose: () => void;
  onSaved: () => void;
}) {
  const pushToast = useToasts((s) => s.push);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const isEdit = !!listingId;

  const [form, setForm] = useState<ListingForm>(() => (listing ? listingToForm(listing) : EMPTY_LISTING_FORM));
  // photos for create start empty; for edit they start from the listing.
  const [photos, setPhotos] = useState<string[]>(() => (listing ? listingImageUrls(listing) : []));
  // track whether the user touched photos — only then do we send image_urls on edit.
  const [photosDirty, setPhotosDirty] = useState(false);

  const set = <K extends keyof ListingForm>(key: K, value: ListingForm[K]) =>
    setForm((s) => ({ ...s, [key]: value }));

  // contacts for the reservation-contact select (shares the ContactsTab query).
  const contactsQuery = useQuery({
    queryKey: ["partner", partnerKey, "contacts"],
    queryFn: () => listPartnerContacts(partnerKey),
  });
  const contacts: PartnerContact[] = contactsQuery.data?.contacts || [];

  const uploadImages = useMutation({
    mutationFn: async (files: File[]) => {
      const urls: string[] = [];
      for (const file of files) {
        const res = await uploadPartnerImage(partnerKey, file);
        urls.push(res.url);
      }
      return urls;
    },
    onSuccess: (urls) => {
      if (!urls.length) return;
      setPhotos((prev) => [...prev, ...urls]);
      setPhotosDirty(true);
      pushToast({ kind: "success", message: `已上传 ${urls.length} 张图片` });
    },
    onError: (err) => {
      onError(err);
      pushToast({ kind: "error", message: err instanceof Error ? err.message : "图片上传失败" });
    },
  });

  const removePhoto = (idx: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== idx));
    setPhotosDirty(true);
  };

  const onPickImages = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (files.length) uploadImages.mutate(files);
  };

  const buildDraft = (): PartnerListingDraft => {
    const isSale = form.kind === "sale";
    const intent: PartnerListingDraft["listing_intent"] = isSale
      ? form.investment
        ? "investment"
        : "sale"
      : "rent";
    const priceNum = form.price.trim() === "" ? null : Number(form.price.replace(/[,，\s]/g, ""));
    const price = priceNum != null && Number.isFinite(priceNum) ? priceNum : null;

    const attrs: Record<string, unknown> = {};
    const put = (key: string, value: string) => {
      const v = value.trim();
      if (v) attrs[key] = v;
    };
    put("layout", form.layout);
    put("area_sqm", form.area_sqm);
    put("nearest_station", form.nearest_station);
    if (isSale) {
      if (price != null) attrs.sale_price = price;
      put("yield_rate", form.yield_rate);
      put("land_area", form.land_area);
      put("building_age", form.building_age);
      put("structure", form.structure);
    } else if (price != null) {
      attrs.rent = price;
    }

    const badges = form.badges
      .split(/[,，]/)
      .map((b) => b.trim())
      .filter(Boolean);

    const draft: PartnerListingDraft = {
      title: form.title.trim(),
      listing_intent: intent,
      price,
      location_text: form.location_text.trim() || undefined,
      description: form.description.trim() || undefined,
      category: form.category.trim() || undefined,
      status: form.status,
      attrs,
      contact_id: form.contact_id || undefined,
      badges,
      machi_recommended: form.machi_recommended,
    };

    // Only send image_urls on edit if the user changed photos (else omit so the
    // backend keeps the existing photos). On create, always send what we have.
    if (!isEdit || photosDirty) {
      draft.image_urls = photos;
    }
    return draft;
  };

  const save = useMutation({
    mutationFn: () => {
      const draft = buildDraft();
      return isEdit
        ? partnerUpdateListing(partnerKey, listingId as string, draft, { rehostUrls: true })
        : partnerCreateListing(partnerKey, draft, { rehostUrls: true });
    },
    onSuccess: () => {
      pushToast({ kind: "success", message: isEdit ? "房源已更新" : "房源已新增" });
      onSaved();
    },
    onError: (err) => {
      onError(err);
      pushToast({ kind: "error", message: err instanceof Error ? err.message : "保存失败" });
    },
  });

  const submit = () => {
    if (!form.title.trim()) {
      pushToast({ kind: "error", message: "请填写标题" });
      return;
    }
    if (save.isPending) return;
    save.mutate();
  };

  const isSale = form.kind === "sale";
  const priceLabel = isSale ? "售价（円）" : "月租（円）";

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 px-4 py-8"
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-2xl rounded-kx-lg border border-kx-stroke/50 bg-kx-card shadow-xl">
        {/* header */}
        <div className="flex items-center justify-between border-b border-kx-stroke/50 px-5 py-3.5">
          <h2 className="flex items-center gap-2 text-base font-black text-kx-text">
            {isEdit ? <Pencil className="h-5 w-5" style={{ color: accent }} /> : <Plus className="h-5 w-5" style={{ color: accent }} />}
            {isEdit ? "编辑房源" : "新增房源"}
          </h2>
          <button className="text-kx-muted hover:text-kx-text" onClick={onClose} aria-label="关闭">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid gap-4 px-5 py-4">
          {/* 类型 segment */}
          <div>
            <span className="mb-1.5 block text-xs font-semibold text-kx-muted">类型</span>
            <div className="inline-flex rounded-full border border-kx-stroke/60 bg-kx-soft/50 p-1">
              {([
                { k: "rent", label: "长租" },
                { k: "sale", label: "买房" },
              ] as const).map((opt) => {
                const active = form.kind === opt.k;
                return (
                  <button
                    key={opt.k}
                    onClick={() => set("kind", opt.k)}
                    className="rounded-full px-4 py-1.5 text-sm font-bold transition"
                    style={active ? { background: accent, color: "#fff" } : { color: "rgb(var(--kx-subtle))" }}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
            {isSale ? (
              <label className="ml-3 inline-flex items-center gap-2 text-sm font-medium text-kx-subtle">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-kx-accent"
                  checked={form.investment}
                  onChange={(e) => set("investment", e.target.checked)}
                />
                投资房源
              </label>
            ) : null}
          </div>

          {/* 标题 */}
          <label className="grid gap-1 text-xs font-semibold text-kx-muted">
            标题（必填）
            <input
              className="kx-input"
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="房源标题"
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            {/* 价格 */}
            <label className="grid gap-1 text-xs font-semibold text-kx-muted">
              {priceLabel}
              <input
                className="kx-input"
                inputMode="numeric"
                value={form.price}
                onChange={(e) => set("price", e.target.value)}
                placeholder="直接填数字"
              />
            </label>
            {/* 分类 */}
            <label className="grid gap-1 text-xs font-semibold text-kx-muted">
              分类
              <input className="kx-input" value={form.category} onChange={(e) => set("category", e.target.value)} />
            </label>
            {/* 地址 */}
            <label className="grid gap-1 text-xs font-semibold text-kx-muted sm:col-span-2">
              地址
              <input
                className="kx-input"
                value={form.location_text}
                onChange={(e) => set("location_text", e.target.value)}
                placeholder="如 東京都渋谷区…"
              />
            </label>
            {/* 户型 */}
            <label className="grid gap-1 text-xs font-semibold text-kx-muted">
              户型
              <input
                className="kx-input"
                value={form.layout}
                onChange={(e) => set("layout", e.target.value)}
                placeholder="如 2LDK"
              />
            </label>
            {/* 面积 */}
            <label className="grid gap-1 text-xs font-semibold text-kx-muted">
              面积（㎡）
              <input
                className="kx-input"
                inputMode="decimal"
                value={form.area_sqm}
                onChange={(e) => set("area_sqm", e.target.value)}
              />
            </label>
            {/* 最寄駅 */}
            <label className="grid gap-1 text-xs font-semibold text-kx-muted sm:col-span-2">
              最寄駅
              <input
                className="kx-input"
                value={form.nearest_station}
                onChange={(e) => set("nearest_station", e.target.value)}
                placeholder="如 渋谷駅 徒歩5分"
              />
            </label>

            {/* 买房 only fields */}
            {isSale ? (
              <>
                <label className="grid gap-1 text-xs font-semibold text-kx-muted">
                  利回り（%）
                  <input
                    className="kx-input"
                    inputMode="decimal"
                    value={form.yield_rate}
                    onChange={(e) => set("yield_rate", e.target.value)}
                  />
                </label>
                <label className="grid gap-1 text-xs font-semibold text-kx-muted">
                  土地面积
                  <input
                    className="kx-input"
                    value={form.land_area}
                    onChange={(e) => set("land_area", e.target.value)}
                  />
                </label>
                <label className="grid gap-1 text-xs font-semibold text-kx-muted">
                  築年
                  <input
                    className="kx-input"
                    value={form.building_age}
                    onChange={(e) => set("building_age", e.target.value)}
                    placeholder="如 1995年 / 築28年"
                  />
                </label>
                <label className="grid gap-1 text-xs font-semibold text-kx-muted">
                  構造
                  <input
                    className="kx-input"
                    value={form.structure}
                    onChange={(e) => set("structure", e.target.value)}
                    placeholder="如 RC造 / 木造"
                  />
                </label>
              </>
            ) : null}
          </div>

          {/* 描述 */}
          <label className="grid gap-1 text-xs font-semibold text-kx-muted">
            描述
            <textarea
              className="kx-textarea min-h-[96px]"
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
            />
          </label>

          {/* 预约联系人 */}
          <label className="grid gap-1 text-xs font-semibold text-kx-muted">
            预约联系人
            <select
              className="kx-input"
              value={form.contact_id}
              onChange={(e) => set("contact_id", e.target.value)}
            >
              <option value="">（不指定）</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.title ? ` · ${c.title}` : ""}
                  {c.isDefault ? "（默认）" : ""}
                </option>
              ))}
            </select>
          </label>

          {/* 标签 */}
          <label className="grid gap-1 text-xs font-semibold text-kx-muted">
            标签（用逗号分隔）
            <input
              className="kx-input"
              value={form.badges}
              onChange={(e) => set("badges", e.target.value)}
              placeholder="如 闪耀，新上架"
            />
          </label>

          {/* Machi推荐 + 状态 */}
          <div className="flex flex-wrap items-center gap-4">
            <label className="inline-flex items-center gap-2 text-sm font-medium text-kx-subtle">
              <input
                type="checkbox"
                className="h-4 w-4 accent-kx-accent"
                checked={form.machi_recommended}
                onChange={(e) => set("machi_recommended", e.target.checked)}
              />
              <span className="inline-flex items-center gap-1">
                <Sparkles className="h-4 w-4 text-amber-500" /> Machi推荐
              </span>
            </label>
            <label className="inline-flex items-center gap-2 text-xs font-semibold text-kx-muted">
              状态
              <select
                className="kx-input h-9 py-0"
                value={form.status}
                onChange={(e) => set("status", e.target.value as "published" | "draft")}
              >
                <option value="published">已发布</option>
                <option value="draft">草稿</option>
              </select>
            </label>
          </div>

          {/* 图片 */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-xs font-semibold text-kx-muted">图片</span>
              {isEdit && !photosDirty ? (
                <span className="text-[11px] text-kx-muted">不改动则保留现有图片</span>
              ) : null}
            </div>
            <input ref={imageInputRef} type="file" accept="image/*" multiple className="hidden" onChange={onPickImages} />
            <div className="flex flex-wrap gap-2">
              {photos.map((u, i) => (
                <div key={`${u}-${i}`} className="group relative h-20 w-20 overflow-hidden rounded-kx-md border border-kx-stroke/50">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={u} alt="" className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removePhoto(i)}
                    className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white"
                    aria-label="移除图片"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => imageInputRef.current?.click()}
                disabled={uploadImages.isPending}
                className="grid h-20 w-20 place-items-center rounded-kx-md border-2 border-dashed border-kx-stroke/70 bg-kx-soft/40 text-kx-muted transition hover:border-kx-accent/60 disabled:opacity-50"
                aria-label="添加图片"
              >
                {uploadImages.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImageIcon className="h-5 w-5" />}
              </button>
            </div>
          </div>
        </div>

        {/* footer */}
        <div className="flex justify-end gap-2 border-t border-kx-stroke/50 px-5 py-3.5">
          <button className="kx-button-ghost h-10" onClick={onClose} disabled={save.isPending}>
            取消
          </button>
          <button
            className="kx-button-primary h-10"
            style={{ background: accent, borderColor: accent }}
            disabled={save.isPending || !form.title.trim()}
            onClick={submit}
          >
            {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {isEdit ? "保存修改" : "创建房源"}
          </button>
        </div>
      </div>
    </div>
  );
}
