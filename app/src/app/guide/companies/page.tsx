"use client";

import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { useQuery } from "@tanstack/react-query";
import { Building2, Search, SlidersHorizontal } from "lucide-react";
import { guide } from "@/lib/guide";
import { CompanyCard, GuideComingSoon, GuideSectionTitle, GuideShell, useGuideCountry } from "@/components/guide/GuideKit";
import { EmptyState, ErrorState, InlineLoading } from "@/components/design/States";
import { appLocaleToGuideLanguage, useI18n } from "@/lib/i18n";
import { companySizeLabel, guideUi, industryLabel, japanCityLabel, regionGroupLabel } from "@/lib/guide-ui";

const INDUSTRIES = ["", "it_internet", "software", "ai_data", "electronics", "automotive", "manufacturing", "consulting", "finance", "telecom", "retail", "ecommerce", "logistics", "transportation", "hospitality", "education", "trading", "game_entertainment", "healthcare", "other"];
const COMPANY_SIZES = ["startup", "small", "medium", "large", "enterprise"];

export default function GuideCompaniesPage() {
  const country = useGuideCountry();
  const { locale, t } = useI18n();
  const language = appLocaleToGuideLanguage(locale);
  const copy = guideUi(locale);
  const quickFilters = useMemo(() => [
    { label: "IT", params: { industry: "it_internet" } },
    { label: industryLabel("software", locale), params: { industry: "software" } },
    { label: locale === "en" ? "Foreign companies in Japan" : locale === "ja" ? "外資系日本法人" : "外资日本法人", params: { keyword: "Japan" } },
    { label: locale === "en" ? "Global companies" : locale === "ja" ? "外資系" : "外资", params: { keyword: "global" } },
    { label: companySizeLabel("enterprise", locale), params: { companySize: "enterprise" } },
    { label: companySizeLabel("startup", locale), params: { companySize: "startup" } },
    { label: regionGroupLabel("capital_area", locale), params: { regionGroup: "capital_area" } },
    { label: regionGroupLabel("kansai_area", locale), params: { regionGroup: "kansai_area" } },
    { label: t("guide_visa_support"), params: { supportsWorkVisa: true } },
    { label: locale === "en" ? "Foreigner-friendly" : locale === "ja" ? "外国人フレンドリー" : "外国人友好", params: { acceptsForeignApplicants: true } },
    { label: "Global career", params: { hasGlobalRoles: true } },
    { label: japanCityLabel("tokyo", locale), params: { city: "tokyo" } },
    { label: japanCityLabel("osaka", locale), params: { city: "osaka" } },
    { label: locale === "en" ? "English interviews" : locale === "ja" ? "英語面接可" : "可英文面试", params: { interviewLanguage: "English" } },
  ], [locale, t]);
  const [draft, setDraft] = useState("");
  const [keyword, setKeyword] = useState("");
  const [industry, setIndustry] = useState("");
  const [subIndustry, setSubIndustry] = useState("");
  const [regionGroup, setRegionGroup] = useState("");
  const [city, setCity] = useState("");
  const [companySize, setCompanySize] = useState("");
  const [employmentType, setEmploymentType] = useState("");
  const [japaneseLevel, setJapaneseLevel] = useState("");
  const [englishLevel, setEnglishLevel] = useState("");
  const [supportsWorkVisa, setSupportsWorkVisa] = useState(false);
  const [acceptsForeignApplicants, setAcceptsForeignApplicants] = useState(false);
  const [hasEnglishPositions, setHasEnglishPositions] = useState(false);
  const [hasGlobalRoles, setHasGlobalRoles] = useState(false);
  const [hasForeignEmployees, setHasForeignEmployees] = useState(false);
  const [sort, setSort] = useState("recommended");

  const params = useMemo(() => ({
    country,
    language,
    keyword: keyword || undefined,
    industry: industry || undefined,
    subIndustry: subIndustry || undefined,
    regionGroup: regionGroup || undefined,
    city: city || undefined,
    companySize: companySize || undefined,
    employmentType: employmentType || undefined,
    japaneseLevel: japaneseLevel || undefined,
    englishLevel: englishLevel || undefined,
    supportsWorkVisa: supportsWorkVisa || undefined,
    acceptsForeignApplicants: acceptsForeignApplicants || undefined,
    hasEnglishPositions: hasEnglishPositions || undefined,
    hasGlobalRoles: hasGlobalRoles || undefined,
    hasForeignEmployees: hasForeignEmployees || undefined,
    sort,
    pageSize: 50,
  }), [acceptsForeignApplicants, city, companySize, country, employmentType, englishLevel, hasEnglishPositions, hasForeignEmployees, hasGlobalRoles, industry, japaneseLevel, keyword, language, regionGroup, sort, subIndustry, supportsWorkVisa]);

  const q = useQuery({
    queryKey: ["guide", "companies", params],
    queryFn: () => guide.companies(params),
    staleTime: 30_000,
  });

  if (country !== "jp" || q.data?.status === "coming_soon") {
    return (
      <GuideShell back={{ href: "/guide", label: copy.back }}>
        <GuideComingSoon empty={q.data?.emptyState} />
      </GuideShell>
    );
  }

  return (
    <GuideShell back={{ href: "/guide", label: copy.back }}>
      <header className="px-4 pb-4 pt-3 sm:px-6">
        <div className="flex items-center gap-3">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#0E7490] text-white shadow-sm">
            <Building2 className="h-6 w-6" />
          </span>
          <div className="min-w-0">
            <h1 className="text-xl font-black leading-tight text-kx-text sm:text-2xl">{copy.companies.title}</h1>
            <p className="text-xs leading-5 text-kx-muted">{copy.companies.subtitle}</p>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2 rounded-2xl border border-kx-stroke/60 bg-kx-card px-3 py-2 shadow-sm">
          <Search className="h-4 w-4 shrink-0 text-kx-muted" />
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && setKeyword(draft.trim())}
            placeholder={copy.companies.placeholder}
            className="min-w-0 flex-1 bg-transparent text-sm text-kx-text outline-none placeholder:text-kx-muted"
          />
          <button type="button" onClick={() => setKeyword(draft.trim())} className="kx-button-primary h-8 px-3 text-xs">
            {copy.search}
          </button>
        </div>

        <div className="mt-2 flex flex-wrap gap-1.5">
          {quickFilters.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() => {
                if ("industry" in item.params) setIndustry(String(item.params.industry));
                if ("companySize" in item.params) setCompanySize(String(item.params.companySize));
                if ("regionGroup" in item.params) setRegionGroup(String(item.params.regionGroup));
                if ("city" in item.params) setCity(String(item.params.city));
                if ("keyword" in item.params) {
                  setDraft(String(item.params.keyword));
                  setKeyword(String(item.params.keyword));
                }
                if ("supportsWorkVisa" in item.params) setSupportsWorkVisa(true);
                if ("acceptsForeignApplicants" in item.params) setAcceptsForeignApplicants(true);
                if ("hasGlobalRoles" in item.params) setHasGlobalRoles(true);
              }}
              className="rounded-full bg-kx-card px-3 py-1 text-xs font-semibold text-kx-subtle shadow-sm transition hover:text-kx-accent"
            >
              {item.label}
            </button>
          ))}
        </div>
      </header>

      <div className="px-4 pb-8 sm:px-6">
        <section className="rounded-kx-lg border border-kx-stroke/50 bg-kx-card p-3">
          <div className="mb-2 flex items-center gap-2 text-xs font-bold text-kx-muted">
            <SlidersHorizontal className="h-4 w-4" /> {copy.filter}
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <select value={industry} onChange={(e) => setIndustry(e.target.value)} className="h-10 rounded-kx-md border border-kx-stroke/70 bg-kx-soft/40 px-3 text-sm text-kx-text outline-none">
              {INDUSTRIES.map((value) => <option key={value || "all"} value={value}>{value ? industryLabel(value, locale) : (locale === "en" ? "All industries" : locale === "ja" ? "すべての業界" : "全部行业")}</option>)}
            </select>
            <input value={subIndustry} onChange={(e) => setSubIndustry(e.target.value)} placeholder={locale === "en" ? "Sub-industry" : locale === "ja" ? "詳細業界" : "子行业"} className="h-10 rounded-kx-md border border-kx-stroke/70 bg-kx-soft/40 px-3 text-sm text-kx-text outline-none placeholder:text-kx-muted" />
            <select value={regionGroup} onChange={(e) => setRegionGroup(e.target.value)} className="h-10 rounded-kx-md border border-kx-stroke/70 bg-kx-soft/40 px-3 text-sm text-kx-text outline-none">
              <option value="">{locale === "en" ? "All regions" : locale === "ja" ? "すべての地域" : "全部区域组"}</option>
              <option value="capital_area">{regionGroupLabel("capital_area", locale)}</option>
              <option value="kansai_area">{regionGroupLabel("kansai_area", locale)}</option>
              <option value="all_japan">{regionGroupLabel("all_japan", locale)}</option>
            </select>
            <select value={city} onChange={(e) => setCity(e.target.value)} className="h-10 rounded-kx-md border border-kx-stroke/70 bg-kx-soft/40 px-3 text-sm text-kx-text outline-none">
              <option value="">{locale === "en" ? "All areas" : locale === "ja" ? "すべてのエリア" : "全部地区"}</option>
              {["tokyo", "osaka", "kyoto", "yokohama", "kobe"].map((value) => <option key={value} value={value}>{japanCityLabel(value, locale)}</option>)}
            </select>
            <select value={companySize} onChange={(e) => setCompanySize(e.target.value)} className="h-10 rounded-kx-md border border-kx-stroke/70 bg-kx-soft/40 px-3 text-sm text-kx-text outline-none">
              <option value="">{locale === "en" ? "All sizes" : locale === "ja" ? "すべての規模" : "全部规模"}</option>
              {COMPANY_SIZES.map((value) => <option key={value} value={value}>{companySizeLabel(value, locale)}</option>)}
            </select>
            <select value={employmentType} onChange={(e) => setEmploymentType(e.target.value)} className="h-10 rounded-kx-md border border-kx-stroke/70 bg-kx-soft/40 px-3 text-sm text-kx-text outline-none">
              <option value="">{locale === "en" ? "Employment type" : locale === "ja" ? "雇用形態" : "雇佣类型"}</option>
              <option value="new_graduate">{locale === "en" ? "New graduate" : locale === "ja" ? "新卒" : "新卒"}</option>
              <option value="mid_career">{locale === "en" ? "Mid-career" : locale === "ja" ? "中途採用" : "中途"}</option>
              <option value="internship">{locale === "en" ? "Internship" : locale === "ja" ? "インターン" : "实习"}</option>
              <option value="global_hire">Global hire</option>
            </select>
            <select value={sort} onChange={(e) => setSort(e.target.value)} className="h-10 rounded-kx-md border border-kx-stroke/70 bg-kx-soft/40 px-3 text-sm text-kx-text outline-none">
              <option value="recommended">{locale === "en" ? "Recommended" : locale === "ja" ? "おすすめ順" : "推荐优先"}</option>
              <option value="data_quality">{locale === "en" ? "Data completeness" : locale === "ja" ? "情報の充実度" : "数据完整度"}</option>
              <option value="review_count">{locale === "en" ? "Most reviews" : locale === "ja" ? "レビュー数" : "评论数"}</option>
              <option value="interview_review_count">{locale === "en" ? "Most interview reviews" : locale === "ja" ? "面接レビュー数" : "面试评论数"}</option>
              <option value="recently_updated">{locale === "en" ? "Recently updated" : locale === "ja" ? "最近更新" : "最近更新"}</option>
              <option value="foreigner_friendly_score">{locale === "en" ? "Foreigner-friendly score" : locale === "ja" ? "外国人フレンドリー度" : "外国人友好度"}</option>
              <option value="visa_support_score">{locale === "en" ? "Visa-support score" : locale === "ja" ? "ビザサポート度" : "签证支持度"}</option>
              <option value="name_asc">{locale === "en" ? "Name A-Z" : locale === "ja" ? "英字名順" : "名称 A-Z"}</option>
              <option value="name_jp_asc">{locale === "en" ? "Japanese name" : locale === "ja" ? "日本語名順" : "日文名排序"}</option>
            </select>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <label className="inline-flex items-center gap-2 rounded-full bg-kx-soft px-3 py-1.5 text-xs font-semibold text-kx-subtle">
              <input type="checkbox" checked={supportsWorkVisa} onChange={(e) => setSupportsWorkVisa(e.target.checked)} />
              {t("guide_visa_support")}
            </label>
            <label className="inline-flex items-center gap-2 rounded-full bg-kx-soft px-3 py-1.5 text-xs font-semibold text-kx-subtle">
              <input type="checkbox" checked={acceptsForeignApplicants} onChange={(e) => setAcceptsForeignApplicants(e.target.checked)} />
              {locale === "en" ? "Accepts foreign applicants" : locale === "ja" ? "外国人応募可" : "接受外国人"}
            </label>
            <label className="inline-flex items-center gap-2 rounded-full bg-kx-soft px-3 py-1.5 text-xs font-semibold text-kx-subtle">
              <input type="checkbox" checked={hasEnglishPositions} onChange={(e) => setHasEnglishPositions(e.target.checked)} />
              {t("guide_english_positions")}
            </label>
            {[
              [hasGlobalRoles, setHasGlobalRoles, "Global career"],
              [hasForeignEmployees, setHasForeignEmployees, locale === "en" ? "Foreign employees" : locale === "ja" ? "外国籍社員あり" : "有外国员工"],
            ].map(([checked, setter, label]) => (
              <label key={String(label)} className="inline-flex items-center gap-2 rounded-full bg-kx-soft px-3 py-1.5 text-xs font-semibold text-kx-subtle">
                <input type="checkbox" checked={Boolean(checked)} onChange={(e) => (setter as Dispatch<SetStateAction<boolean>>)(e.target.checked)} />
                {String(label)}
              </label>
            ))}
            <select value={japaneseLevel} onChange={(e) => setJapaneseLevel(e.target.value)} className="h-8 rounded-full border border-kx-stroke/60 bg-kx-soft px-3 text-xs font-semibold text-kx-subtle outline-none">
              <option value="">{locale === "en" ? "Japanese requirement" : locale === "ja" ? "日本語要件" : "日语要求"}</option>
              <option value="none">{locale === "en" ? "No requirement" : locale === "ja" ? "要件なし" : "无要求"}</option>
              <option value="n3">N3</option>
              <option value="n2">N2</option>
              <option value="n1">N1</option>
              <option value="business">Business</option>
            </select>
            <select value={englishLevel} onChange={(e) => setEnglishLevel(e.target.value)} className="h-8 rounded-full border border-kx-stroke/60 bg-kx-soft px-3 text-xs font-semibold text-kx-subtle outline-none">
              <option value="">{locale === "en" ? "English requirement" : locale === "ja" ? "英語要件" : "英语要求"}</option>
              <option value="none">{locale === "en" ? "No requirement" : locale === "ja" ? "要件なし" : "无要求"}</option>
              <option value="business">Business</option>
              <option value="native_like">Native-like</option>
              <option value="unknown">{t("guide_unconfirmed")}</option>
            </select>
            <button
              type="button"
              onClick={() => {
                setKeyword("");
                setDraft("");
                setIndustry("");
                setSubIndustry("");
                setRegionGroup("");
                setCity("");
                setCompanySize("");
                setEmploymentType("");
                setJapaneseLevel("");
                setEnglishLevel("");
                setSupportsWorkVisa(false);
                setAcceptsForeignApplicants(false);
                setHasEnglishPositions(false);
                setHasGlobalRoles(false);
                setHasForeignEmployees(false);
                setSort("recommended");
              }}
              className="rounded-full px-3 py-1.5 text-xs font-semibold text-kx-muted hover:bg-kx-soft"
            >
              {copy.clearFilters}
            </button>
          </div>
        </section>

        <section className="mt-5">
          <GuideSectionTitle title={copy.companies.listTitle} subtitle={copy.totalCompanies(q.data?.total ?? 0)} />
          {q.isLoading ? (
            <InlineLoading />
          ) : q.isError ? (
            <ErrorState title={copy.companies.loadError} subtitle={copy.retryLater} onRetry={() => q.refetch()} />
          ) : (q.data?.items.length ?? 0) === 0 ? (
            <EmptyState title={copy.companies.emptyTitle} subtitle={copy.companies.emptySubtitle} />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {q.data!.items.map((c) => (
                <CompanyCard key={c.id} company={c} />
              ))}
            </div>
          )}
          {q.data?.disclaimer ? <p className="mt-4 text-[11px] leading-5 text-kx-muted">{q.data.disclaimer}</p> : null}
        </section>
      </div>
    </GuideShell>
  );
}
