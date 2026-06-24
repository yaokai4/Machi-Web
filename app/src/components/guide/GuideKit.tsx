"use client";

// Shared building blocks for the Machi Guide / 日本指南 surface. Reuses the
// existing kx-* design tokens (so light/dark theming keeps working) and adds a
// scoped warm-gray background only inside /guide — no global/frozen CSS touched.

import Link from "next/link";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSession, useToasts, useAuthPrompt } from "@/lib/store";
import { api, APIError, isAuthRequiredError } from "@/lib/api";
import { AppShell } from "@/components/shell/AppShell";
import {
  ArrowLeft,
  Building2,
  Briefcase,
  ClipboardList,
  FileText,
  GraduationCap,
  Home,
  Languages,
  Package,
  Plane,
  PlaneLanding,
  Signpost,
  BookOpen,
  School,
  AlertTriangle,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import type { GuideCategory, GuideEmptyState, GuideProduct, GuideCompany, GuideGoalEntry, GuideResourceEntry, GuideSchool, GuideJourney } from "@/lib/guide";
import { GUIDE_PRODUCT_TYPE_LABELS, guideCityLabel, isGuideArticleStale } from "@/lib/guide";
import { formatPrice } from "@/lib/format";
import { regionAccountPatch, resolveRegion } from "@/lib/regions";
import { useI18n, type Locale } from "@/lib/i18n";

const ICON_MAP: Record<string, LucideIcon> = {
  graduation: GraduationCap,
  briefcase: Briefcase,
  plane: Plane,
  language: Languages,
  home: Home,
  package: Package,
  school: School,
  building: Building2,
};

export function categoryIconFor(token?: string): LucideIcon {
  return ICON_MAP[String(token || "")] || BookOpen;
}

/** Slug used in /guide/<slug> category routes, derived from a category key. */
export const CATEGORY_ROUTE: Record<string, string> = {
  study_japan: "study-japan",
  career_japan: "career-japan",
  study_abroad_japan: "study-abroad-japan",
  jlpt: "jlpt",
  life_japan: "life-japan",
  guide_services: "services",
};

export function categoryHref(key: string): string {
  const slug = CATEGORY_ROUTE[key];
  return slug ? `/guide/${slug}` : `/guide`;
}

const JOURNEY_ICON_MAP: Record<string, LucideIcon> = {
  arrival: PlaneLanding,
  plan: ClipboardList,
  home: Home,
  plane: Plane,
  graduation: GraduationCap,
  briefcase: Briefcase,
  language: Languages,
  document: FileText,
};

export function journeyIconFor(token?: string): LucideIcon {
  return JOURNEY_ICON_MAP[String(token || "")] || Signpost;
}

export function journeyHref(key: string): string {
  return `/guide/goals/${encodeURIComponent(key)}`;
}

/** Situation -> action-path entry card. `done` is the local/known completed count. */
export function JourneyCard({ journey, done = 0 }: { journey: GuideJourney; done?: number }) {
  const Icon = journeyIconFor(journey.icon);
  const total = journey.stepCount ?? 0;
  const pct = total > 0 ? Math.round((Math.min(done, total) / total) * 100) : 0;
  const color = journey.color || "#147067";
  return (
    <Link
      href={journeyHref(journey.key)}
      className="kx-guide-category-card group relative overflow-hidden transition-transform duration-200 hover:-translate-y-0.5"
    >
      {/* soft per-journey color wash in the top-right corner */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-70 transition-opacity duration-200 group-hover:opacity-100"
        style={{ background: `radial-gradient(135% 95% at 100% 0%, ${color}1f, transparent 55%)` }}
      />
      <div className="relative flex items-center justify-between">
        <span
          className="grid h-11 w-11 place-items-center rounded-2xl text-white transition-transform duration-200 group-hover:scale-105"
          style={{ background: `linear-gradient(135deg, ${color}, ${color}cc)`, boxShadow: `0 6px 16px ${color}40` }}
        >
          <Icon className="h-5 w-5" />
        </span>
        {total > 0 ? (
          <span className="rounded-full bg-kx-soft px-2 py-0.5 text-[11px] font-bold text-kx-muted">
            {done > 0 ? `${done}/${total}` : `${total} 步`}
          </span>
        ) : null}
      </div>
      <div className="relative">
        <h3 className="text-[15px] font-black text-kx-text group-hover:text-kx-accent">{journey.title}</h3>
        <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-kx-subtle">{journey.subtitle}</p>
      </div>
      {total > 0 && done > 0 ? (
        <div className="relative mt-auto h-1.5 w-full overflow-hidden rounded-full bg-kx-soft" aria-label={`${pct}%`}>
          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
        </div>
      ) : null}
    </Link>
  );
}

/** Current viewer country for the Japan-only gate. Defaults to jp. */
export function useGuideCountry(): string {
  const user = useSession((s) => s.user);
  // Follow the *browsing* region (current_region_code, synced from the region
  // picker and the iOS app) so Guide matches the home feed and what the user
  // is actually looking at — not their declared profile country. Region codes
  // are dot-separated "country.province.city"; the country is the prefix.
  const browseCountry = (user?.current_region_code || "").split(".")[0];
  return (browseCountry || user?.country || "jp").toLowerCase();
}

export function GuideShell({
  children,
  right,
  back,
}: {
  children: React.ReactNode;
  right?: React.ReactNode;
  back?: { href: string; label: string };
}) {
  return (
    <AppShell requireAuth={false} wide right={right ?? null}>
      <div className="kx-guide-page min-h-full">
        <GuideOfflineBanner />
        {back ? (
          <div className="px-4 pt-3 sm:px-6">
            <Link
              href={back.href}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-kx-muted hover:text-kx-accent"
            >
              <ArrowLeft className="h-4 w-4" /> {back.label}
            </Link>
          </div>
        ) : null}
        {/* Guide drops the social right-rail and uses the full content width; an
            inner max-width keeps long-form readable while letting grids breathe. */}
        <div className="mx-auto w-full max-w-6xl">{children}</div>
      </div>
    </AppShell>
  );
}

function GuideOfflineBanner() {
  const [offline, setOffline] = useState(false);
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || typeof navigator === "undefined") return;
    setOffline(!navigator.onLine);
    let restoredTimer: number | undefined;
    const onOffline = () => {
      if (restoredTimer) window.clearTimeout(restoredTimer);
      setRestored(false);
      setOffline(true);
    };
    const onOnline = () => {
      setOffline(false);
      setRestored(true);
      if (restoredTimer) window.clearTimeout(restoredTimer);
      restoredTimer = window.setTimeout(() => setRestored(false), 3600);
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      if (restoredTimer) window.clearTimeout(restoredTimer);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  if (!offline && !restored) return null;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pt-3 sm:px-6" role="status" aria-live="polite">
      <div
        className={[
          "rounded-2xl border px-4 py-3 text-sm font-semibold shadow-sm",
          offline
            ? "border-amber-400/35 bg-amber-400/12 text-amber-800 dark:text-amber-200"
            : "border-emerald-400/25 bg-emerald-400/12 text-emerald-800 dark:text-emerald-200",
        ].join(" ")}
      >
        {offline
          ? "当前离线。Guide 的核心计划、Todo、日历和申请以服务器数据为准，联网后请重试或刷新同步。"
          : "网络已恢复。Guide 会继续从服务器同步最新状态。"}
      </div>
    </div>
  );
}

export function GuideComingSoon({ empty }: { empty?: GuideEmptyState }) {
  const { t } = useI18n();
  const e = empty || {
    title: t("guide_coming_soon_title"),
    body: t("guide_coming_soon_body"),
    action: t("guide_switch_japan"),
    actionCountry: "jp",
  };
  const user = useSession((s) => s.user);
  const setUser = useSession((s) => s.setUser);
  const pushToast = useToasts((s) => s.push);
  const openAuthPrompt = useAuthPrompt((s) => s.open);
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);

  // Switch the *browsing* region to Japan (current_region_code) — the same
  // field the home feed and the iOS app sync — so Guide opens immediately and
  // the choice persists across devices. Guests are prompted to log in.
  const switchToJapan = async () => {
    if (!user) {
      openAuthPrompt("generic");
      return;
    }
    setBusy(true);
    try {
      const tokyo = resolveRegion("jp.tokyo.tokyo");
      const next = await api.updateRegionLanguage(tokyo ? regionAccountPatch(tokyo) : { current_region_code: "jp.tokyo.tokyo" });
      setUser(next);
      queryClient.invalidateQueries({ queryKey: ["guide"] });
      pushToast({ kind: "success", message: t("guide_switched_japan") });
    } catch (err) {
      if (isAuthRequiredError(err)) {
        openAuthPrompt("generic");
        return;
      }
      pushToast({ kind: "error", message: (err as APIError).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <span className="grid h-16 w-16 place-items-center rounded-3xl bg-kx-accentSoft text-kx-accent">
        <Plane className="h-8 w-8" />
      </span>
      <h1 className="mt-5 text-2xl font-black text-kx-text">{e.title}</h1>
      <p className="mt-3 max-w-md text-sm leading-7 text-kx-subtle">{e.body}</p>
      <button type="button" onClick={switchToJapan} disabled={busy} className="kx-button-primary mt-6 h-11 px-5 disabled:opacity-60">
        {busy ? t("guide_switching") : e.action}
      </button>
    </div>
  );
}

export function GuideSectionTitle({
  title,
  subtitle,
  href,
  hrefLabel,
}: {
  title: string;
  subtitle?: string;
  href?: string;
  hrefLabel?: string;
}) {
  const { t } = useI18n();
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-xl font-black leading-tight tracking-[-0.01em] text-kx-text">{title}</h2>
        {subtitle ? <p className="mt-0.5 text-xs leading-5 text-kx-muted">{subtitle}</p> : null}
      </div>
      {href ? (
        <Link href={href} className="shrink-0 text-xs font-semibold text-kx-accent hover:underline">
          {hrefLabel || t("guide_view_all")}
        </Link>
      ) : null}
    </div>
  );
}

export function CategoryCard({ category }: { category: GuideCategory }) {
  const Icon = categoryIconFor(category.icon);
  const countParts = [
    typeof category.articleCount === "number" ? `${category.articleCount} 篇指南` : "",
    typeof category.productCount === "number" ? `${category.productCount} 个资料/服务` : "",
  ].filter(Boolean);
  return (
    <Link
      href={categoryHref(category.key)}
      className="kx-guide-category-card group"
    >
      <span
        className="grid h-11 w-11 place-items-center rounded-2xl text-white"
        style={{ backgroundColor: category.color || "#2563EB" }}
      >
        <Icon className="h-5 w-5" />
      </span>
      <div>
        <h3 className="text-[15px] font-black text-kx-text group-hover:text-kx-accent">{category.title}</h3>
        {category.subtitle ? <p className="mt-0.5 text-xs text-kx-muted">{category.subtitle}</p> : null}
      </div>
      <p className="line-clamp-2 text-xs leading-5 text-kx-subtle">{category.description}</p>
      {countParts.length ? (
        <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
          {countParts.map((part) => (
            <span key={part} className="rounded-full bg-kx-soft px-2 py-0.5 text-[11px] font-bold text-kx-muted">
              {part}
            </span>
          ))}
        </div>
      ) : null}
    </Link>
  );
}

// Compact "browse by topic" pill — the journeys above are the primary,
// action-oriented entry; categories overlap with them, so instead of a second
// full card grid we surface them as a slim chip row under the journeys.
export function CategoryPill({ category }: { category: GuideCategory }) {
  const Icon = categoryIconFor(category.icon);
  return (
    <Link
      href={categoryHref(category.key)}
      className="group inline-flex items-center gap-2 rounded-full border border-kx-stroke/50 bg-kx-card px-3.5 py-2 text-sm font-bold text-kx-subtle transition hover:-translate-y-0.5 hover:border-kx-accent/40 hover:text-kx-accent"
    >
      <span
        className="grid h-6 w-6 place-items-center rounded-lg text-white transition-transform duration-200 group-hover:scale-110"
        style={{ backgroundColor: category.color || "#2563EB" }}
      >
        <Icon className="h-3.5 w-3.5" />
      </span>
      {category.title}
    </Link>
  );
}

export function ResourceEntryCard({ entry }: { entry: GuideResourceEntry }) {
  const Icon = categoryIconFor(entry.icon);
  const { t } = useI18n();
  return (
    <Link
      href={entry.href}
      className="kx-guide-resource-card group"
    >
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-kx-accentSoft text-kx-accent">
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h3 className="text-[15px] font-black text-kx-text group-hover:text-kx-accent">{entry.title}</h3>
          <p className="mt-1 line-clamp-3 text-xs leading-5 text-kx-subtle">{entry.description}</p>
        </div>
      </div>
      <span className="mt-3 text-xs font-bold text-kx-accent">{t("guide_enter_library")}</span>
    </Link>
  );
}

// Spec P1: one shared freshness badge for ALL content cards (article / school /
// company / product). Shows "更新于 YYYY/MM/DD"; flags "需复核" when past the
// staleAfterDays window so policy/procedure info that may have changed is
// visibly marked. Renders nothing when there's no freshness data.
export type GuideFreshnessLike = { verifiedAt?: string | null; staleAfterDays?: number; sourceLabel?: string | null; updatedAt?: string | null };

export function GuideFreshnessBadge({ data, className }: { data?: GuideFreshnessLike | null; className?: string }) {
  // Prefer the editorial verifiedAt (with stale-window logic); fall back to the
  // row's updatedAt so school/company/product cards still show "更新于".
  const stamp = data?.verifiedAt || data?.updatedAt;
  if (!stamp) return null;
  const d = new Date(stamp);
  if (Number.isNaN(d.getTime())) return null;
  const stale = Boolean(data?.verifiedAt) && isGuideArticleStale(data || {});
  const dateText = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
  return (
    <span className={"inline-flex items-center gap-1 text-[11px] font-semibold " + (stale ? "text-amber-600 dark:text-amber-400" : "text-kx-muted") + (className ? " " + className : "")}>
      {stale ? <AlertTriangle className="h-3 w-3" /> : <ShieldCheck className="h-3 w-3" />}
      {stale ? "需复核" : `更新于 ${dateText}`}
      {data?.sourceLabel ? <span className="text-kx-muted/80">· {data.sourceLabel}</span> : null}
    </span>
  );
}

export function ArticleCard({ article, compact = false }: { article: { slug: string; title: string; summary: string; tags: string[]; authorName: string; isFeatured?: boolean } & GuideFreshnessLike; compact?: boolean }) {
  const { t } = useI18n();
  return (
    <Link
      href={`/guide/articles/${article.slug}`}
      className={[
        "kx-guide-article-card group block",
        compact ? "p-3.5" : "p-4 sm:p-5",
      ].join(" ")}
    >
      <div className="mb-1.5 flex flex-wrap items-center gap-1.5 text-[11px] font-bold text-kx-muted">
        <span className="rounded-full bg-kx-accentSoft px-2 py-0.5 text-kx-accent">{t("nav_guide")}</span>
        <span className="truncate">{article.authorName}</span>
      </div>
      <h3 className={(compact ? "text-base " : "text-lg ") + "line-clamp-2 font-black leading-snug text-kx-text group-hover:text-kx-accent"}>
        {article.title}
      </h3>
      <p className="mt-1.5 line-clamp-2 text-sm leading-6 text-kx-subtle">{article.summary}</p>
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        {article.tags?.slice(0, 3).map((t) => (
          <span key={t} className="rounded-full bg-kx-soft px-2 py-0.5 text-[11px] text-kx-muted">
            {t}
          </span>
        ))}
        <GuideFreshnessBadge data={article} className="ml-auto" />
      </div>
    </Link>
  );
}

function priceToneClass(tone: string): string {
  const base = "rounded-full px-2 py-0.5 text-[11px] font-bold ";
  if (tone === "soon") return base + "bg-amber-400/15 text-amber-600 dark:text-amber-400";
  if (tone === "free") return base + "bg-emerald-400/15 text-emerald-600 dark:text-emerald-400";
  return base + "bg-kx-accentSoft text-kx-accent";
}

export function guideProductPrice(p: GuideProduct): { label: string; tone: "soon" | "free" | "service" | "paid" } {
  if (p.isComingSoon || p.status === "coming_soon") return { label: formatPrice(p), tone: "soon" };
  if (p.isFree) return { label: "免费", tone: "free" };
  if (p.isService || p.isAppointmentOnly || p.isPriceHidden) return { label: formatPrice(p) || "预约咨询", tone: "service" };
  return { label: formatPrice(p), tone: "paid" };
}

export function ProductCard({ product }: { product: GuideProduct }) {
  const { t } = useI18n();
  const price = guideProductPrice(product);
  const priceLabel = price.tone === "free" ? t("guide_free") : price.tone === "service" && price.label === "预约咨询" ? t("guide_appointment") : price.label;
  const typeLabel = GUIDE_PRODUCT_TYPE_LABELS[product.productType] || (product.isService ? t("guide_service") : t("guide_material"));
  return (
    <Link
      href={`/guide/products/${product.slug}`}
      className="kx-guide-product-card group flex flex-col p-4"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="rounded-full bg-kx-soft px-2 py-0.5 text-[11px] font-bold text-kx-muted">{typeLabel}</span>
        <span className={priceToneClass(price.tone)}>{priceLabel}</span>
      </div>
      <h3 className="line-clamp-2 text-[15px] font-black leading-snug text-kx-text group-hover:text-kx-accent">{product.title}</h3>
      {product.subtitle ? <p className="mt-1 line-clamp-2 text-xs leading-5 text-kx-subtle">{product.subtitle}</p> : null}
      {product.targetAudience ? <p className="mt-2 text-[11px] text-kx-muted">{t("guide_audience_prefix")}{product.targetAudience}</p> : null}
      <div className="mt-auto pt-2"><GuideFreshnessBadge data={product as GuideFreshnessLike} /></div>
    </Link>
  );
}

export const GUIDE_SCHOOL_TYPE_LABELS: Record<string, string> = {
  university: "大学",
  graduate_school: "大学院",
  junior_college: "短期大学",
  vocational_school: "专门学校",
  language_school: "语言学校",
  college_of_technology: "高专",
  other: "其他",
};

const GUIDE_SCHOOL_TYPE_LABELS_I18N: Record<string, Record<Locale, string>> = {
  university: { "zh-Hans": "大学", "zh-Hant": "大學", en: "University", ja: "大学" },
  graduate_school: { "zh-Hans": "大学院", "zh-Hant": "大學院", en: "Graduate school", ja: "大学院" },
  junior_college: { "zh-Hans": "短期大学", "zh-Hant": "短期大學", en: "Junior college", ja: "短期大学" },
  vocational_school: { "zh-Hans": "专门学校", "zh-Hant": "專門學校", en: "Vocational school", ja: "専門学校" },
  language_school: { "zh-Hans": "语言学校", "zh-Hant": "語言學校", en: "Language school", ja: "日本語学校" },
  college_of_technology: { "zh-Hans": "高专", "zh-Hant": "高專", en: "Technical college", ja: "高専" },
  other: { "zh-Hans": "其他", "zh-Hant": "其他", en: "Other", ja: "その他" },
};

export function SchoolCard({ school }: { school: GuideSchool }) {
  const { locale, t } = useI18n();
  const typeLabel = GUIDE_SCHOOL_TYPE_LABELS_I18N[school.schoolType]?.[locale] || GUIDE_SCHOOL_TYPE_LABELS_I18N.other[locale];
  return (
    <Link
      href={`/guide/schools/${school.slug || school.id}`}
      className="kx-guide-directory-card group block p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="line-clamp-1 text-[15px] font-black text-kx-text group-hover:text-kx-accent">{school.schoolName}</h3>
          <p className="line-clamp-1 text-xs text-kx-muted">{school.schoolNameJp || school.schoolNameEn}</p>
        </div>
        <span className="shrink-0 rounded-full bg-kx-soft px-2 py-0.5 text-[11px] font-bold text-kx-muted">{typeLabel}</span>
      </div>
      <p className="mt-2 line-clamp-2 text-xs leading-5 text-kx-subtle">{school.shortDescription || school.description}</p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {school.isAcceptingInternationalStudents ? (
          <span className="rounded-full bg-emerald-400/15 px-2 py-0.5 text-[11px] font-bold text-emerald-700 dark:text-emerald-300">{t("guide_student_ok")}</span>
        ) : null}
        {school.hasEnglishProgram ? (
          <span className="rounded-full bg-kx-accentSoft px-2 py-0.5 text-[11px] font-bold text-kx-accent">{t("guide_english_program")}</span>
        ) : null}
        {school.fieldsOfStudy.slice(0, 2).map((field) => (
          <span key={field} className="rounded-full bg-kx-soft px-2 py-0.5 text-[11px] text-kx-muted">{field}</span>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between text-[11px] text-kx-muted">
        <span>{school.prefecture || guideCityLabel(school.city)} · {guideCityLabel(school.city)}</span>
        <GuideFreshnessBadge data={school as GuideFreshnessLike} />
      </div>
    </Link>
  );
}

export function CompanyCard({ company }: { company: GuideCompany }) {
  const { t } = useI18n();
  return (
    <Link
      href={`/guide/companies/${company.slug || company.id}`}
      className="kx-guide-directory-card group block p-4"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-[15px] font-black text-kx-text group-hover:text-kx-accent">{company.companyName}</h3>
          {company.companyNameJp ? <p className="truncate text-xs text-kx-muted">{company.companyNameJp}</p> : null}
        </div>
        <span className="shrink-0 rounded-full bg-kx-soft px-2 py-0.5 text-[11px] text-kx-muted">{company.industry || t("guide_company")}</span>
      </div>
      <p className="mt-2 line-clamp-2 text-xs leading-5 text-kx-subtle">{company.shortDescription || company.description}</p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {company.supportsWorkVisa ? (
          <span className="rounded-full bg-emerald-400/15 px-2 py-0.5 text-[11px] font-bold text-emerald-700 dark:text-emerald-300">{t("guide_visa_support")}</span>
        ) : null}
        {company.hasEnglishPositions ? (
          <span className="rounded-full bg-kx-accentSoft px-2 py-0.5 text-[11px] font-bold text-kx-accent">{t("guide_english_positions")}</span>
        ) : null}
        <span className="rounded-full bg-kx-soft px-2 py-0.5 text-[11px] text-kx-muted">
          {t("guide_japanese_label")} {company.requiredJapaneseLevel && company.requiredJapaneseLevel !== "unknown" ? company.requiredJapaneseLevel.toUpperCase() : t("guide_unconfirmed")}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-kx-muted">
        <span>{guideCityLabel(company.city)}</span>
        {company.foundedYear ? <span>{t("guide_founded")} {company.foundedYear}</span> : null}
        <span className={company.reviewCount > 0 ? "text-kx-accent" : ""}>
          {company.reviewCount > 0 ? `${company.reviewCount} ${t("guide_reviews_suffix")}` : t("guide_no_reviews")}
        </span>
        <GuideFreshnessBadge data={company as GuideFreshnessLike} className="ml-auto" />
      </div>
    </Link>
  );
}

export function GoalChip({ goal }: { goal: GuideGoalEntry }) {
  const href = `${categoryHref(goal.categoryKey)}${goal.subCategoryKey ? `?sub=${goal.subCategoryKey}` : ""}`;
  return (
    <Link
      href={href}
      className="flex items-center gap-2 rounded-full border border-kx-stroke/60 bg-kx-card px-3.5 py-2 text-sm font-semibold text-kx-text transition hover:border-kx-accent/50 hover:text-kx-accent"
    >
      <span className="text-kx-accent">→</span>
      {goal.title}
    </Link>
  );
}
