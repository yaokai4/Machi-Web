"use client";

import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { useQuery } from "@tanstack/react-query";
import { Building2, Search, SlidersHorizontal } from "lucide-react";
import { guide } from "@/lib/guide";
import { CompanyCard, GuideComingSoon, GuideSectionTitle, GuideShell, useGuideCountry } from "@/components/guide/GuideKit";
import { EmptyState, ErrorState, InlineLoading } from "@/components/design/States";

const QUICK_FILTERS = [
  { label: "IT", params: { industry: "it_internet" } },
  { label: "软件", params: { industry: "software" } },
  { label: "外资日本法人", params: { keyword: "Japan" } },
  { label: "外资", params: { keyword: "global" } },
  { label: "大手", params: { companySize: "enterprise" } },
  { label: "初创", params: { companySize: "startup" } },
  { label: "首都圈", params: { regionGroup: "capital_area" } },
  { label: "关西圈", params: { regionGroup: "kansai_area" } },
  { label: "签证支持", params: { supportsWorkVisa: true } },
  { label: "外国人友好", params: { acceptsForeignApplicants: true } },
  { label: "Global career", params: { hasGlobalRoles: true } },
  { label: "东京", params: { city: "tokyo" } },
  { label: "大阪", params: { city: "osaka" } },
  { label: "可英文面试", params: { interviewLanguage: "英语" } },
];

const INDUSTRIES = ["", "it_internet", "software", "ai_data", "electronics", "automotive", "manufacturing", "consulting", "finance", "telecom", "retail", "ecommerce", "logistics", "transportation", "hospitality", "education", "trading", "game_entertainment", "healthcare", "other"];
const COMPANY_SIZES = [
  { value: "", label: "全部规模" },
  { value: "startup", label: "初创" },
  { value: "small", label: "小型" },
  { value: "medium", label: "中型" },
  { value: "large", label: "大型" },
  { value: "enterprise", label: "大手 / 集团" },
];

export default function GuideCompaniesPage() {
  const country = useGuideCountry();
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
  }), [acceptsForeignApplicants, city, companySize, country, employmentType, englishLevel, hasEnglishPositions, hasForeignEmployees, hasGlobalRoles, industry, japaneseLevel, keyword, regionGroup, sort, subIndustry, supportsWorkVisa]);

  const q = useQuery({
    queryKey: ["guide", "companies", params],
    queryFn: () => guide.companies(params),
    staleTime: 30_000,
  });

  if (country !== "jp" || q.data?.status === "coming_soon") {
    return (
      <GuideShell back={{ href: "/guide", label: "日本指南" }}>
        <GuideComingSoon empty={q.data?.emptyState} />
      </GuideShell>
    );
  }

  return (
    <GuideShell back={{ href: "/guide", label: "日本指南" }}>
      <header className="px-4 pb-4 pt-3 sm:px-6">
        <div className="flex items-center gap-3">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#0E7490] text-white shadow-sm">
            <Building2 className="h-6 w-6" />
          </span>
          <div className="min-w-0">
            <h1 className="text-xl font-black leading-tight text-kx-text sm:text-2xl">外国人就职公司库</h1>
            <p className="text-xs leading-5 text-kx-muted">查找适合外国人就职的日本公司、行业、岗位和面试经验。</p>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2 rounded-2xl border border-kx-stroke/60 bg-kx-card px-3 py-2 shadow-sm">
          <Search className="h-4 w-4 shrink-0 text-kx-muted" />
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && setKeyword(draft.trim())}
            placeholder="搜索公司、行业、岗位、城市"
            className="min-w-0 flex-1 bg-transparent text-sm text-kx-text outline-none placeholder:text-kx-muted"
          />
          <button type="button" onClick={() => setKeyword(draft.trim())} className="kx-button-primary h-8 px-3 text-xs">
            搜索
          </button>
        </div>

        <div className="mt-2 flex flex-wrap gap-1.5">
          {QUICK_FILTERS.map((item) => (
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
            <SlidersHorizontal className="h-4 w-4" /> 筛选
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <select value={industry} onChange={(e) => setIndustry(e.target.value)} className="h-10 rounded-kx-md border border-kx-stroke/70 bg-kx-soft/40 px-3 text-sm text-kx-text outline-none">
              {INDUSTRIES.map((value) => <option key={value || "all"} value={value}>{value || "全部行业"}</option>)}
            </select>
            <input value={subIndustry} onChange={(e) => setSubIndustry(e.target.value)} placeholder="子行业" className="h-10 rounded-kx-md border border-kx-stroke/70 bg-kx-soft/40 px-3 text-sm text-kx-text outline-none placeholder:text-kx-muted" />
            <select value={regionGroup} onChange={(e) => setRegionGroup(e.target.value)} className="h-10 rounded-kx-md border border-kx-stroke/70 bg-kx-soft/40 px-3 text-sm text-kx-text outline-none">
              <option value="">全部区域组</option>
              <option value="capital_area">首都圈</option>
              <option value="kansai_area">关西圈</option>
              <option value="all_japan">日本全国</option>
            </select>
            <select value={city} onChange={(e) => setCity(e.target.value)} className="h-10 rounded-kx-md border border-kx-stroke/70 bg-kx-soft/40 px-3 text-sm text-kx-text outline-none">
              <option value="">全部地区</option>
              <option value="tokyo">东京</option>
              <option value="osaka">大阪</option>
              <option value="kyoto">京都</option>
              <option value="yokohama">横滨</option>
              <option value="kobe">神户</option>
            </select>
            <select value={companySize} onChange={(e) => setCompanySize(e.target.value)} className="h-10 rounded-kx-md border border-kx-stroke/70 bg-kx-soft/40 px-3 text-sm text-kx-text outline-none">
              {COMPANY_SIZES.map((s) => <option key={s.value || "all"} value={s.value}>{s.label}</option>)}
            </select>
            <select value={employmentType} onChange={(e) => setEmploymentType(e.target.value)} className="h-10 rounded-kx-md border border-kx-stroke/70 bg-kx-soft/40 px-3 text-sm text-kx-text outline-none">
              <option value="">雇佣类型</option>
              <option value="new_graduate">新卒</option>
              <option value="mid_career">中途</option>
              <option value="internship">实习</option>
              <option value="global_hire">Global hire</option>
            </select>
            <select value={sort} onChange={(e) => setSort(e.target.value)} className="h-10 rounded-kx-md border border-kx-stroke/70 bg-kx-soft/40 px-3 text-sm text-kx-text outline-none">
              <option value="recommended">推荐优先</option>
              <option value="data_quality">数据完整度</option>
              <option value="review_count">评论数</option>
              <option value="interview_review_count">面试评论数</option>
              <option value="recently_updated">最近更新</option>
              <option value="foreigner_friendly_score">外国人友好度</option>
              <option value="visa_support_score">签证支持度</option>
              <option value="name_asc">名称 A-Z</option>
              <option value="name_jp_asc">日文名排序</option>
            </select>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <label className="inline-flex items-center gap-2 rounded-full bg-kx-soft px-3 py-1.5 text-xs font-semibold text-kx-subtle">
              <input type="checkbox" checked={supportsWorkVisa} onChange={(e) => setSupportsWorkVisa(e.target.checked)} />
              签证支持
            </label>
            <label className="inline-flex items-center gap-2 rounded-full bg-kx-soft px-3 py-1.5 text-xs font-semibold text-kx-subtle">
              <input type="checkbox" checked={acceptsForeignApplicants} onChange={(e) => setAcceptsForeignApplicants(e.target.checked)} />
              接受外国人
            </label>
            <label className="inline-flex items-center gap-2 rounded-full bg-kx-soft px-3 py-1.5 text-xs font-semibold text-kx-subtle">
              <input type="checkbox" checked={hasEnglishPositions} onChange={(e) => setHasEnglishPositions(e.target.checked)} />
              英文岗位
            </label>
            {[
              [hasGlobalRoles, setHasGlobalRoles, "Global career"],
              [hasForeignEmployees, setHasForeignEmployees, "有外国员工"],
            ].map(([checked, setter, label]) => (
              <label key={String(label)} className="inline-flex items-center gap-2 rounded-full bg-kx-soft px-3 py-1.5 text-xs font-semibold text-kx-subtle">
                <input type="checkbox" checked={Boolean(checked)} onChange={(e) => (setter as Dispatch<SetStateAction<boolean>>)(e.target.checked)} />
                {String(label)}
              </label>
            ))}
            <select value={japaneseLevel} onChange={(e) => setJapaneseLevel(e.target.value)} className="h-8 rounded-full border border-kx-stroke/60 bg-kx-soft px-3 text-xs font-semibold text-kx-subtle outline-none">
              <option value="">日语要求</option>
              <option value="none">无要求</option>
              <option value="n3">N3</option>
              <option value="n2">N2</option>
              <option value="n1">N1</option>
              <option value="business">Business</option>
            </select>
            <select value={englishLevel} onChange={(e) => setEnglishLevel(e.target.value)} className="h-8 rounded-full border border-kx-stroke/60 bg-kx-soft px-3 text-xs font-semibold text-kx-subtle outline-none">
              <option value="">英语要求</option>
              <option value="none">无要求</option>
              <option value="business">Business</option>
              <option value="native_like">Native-like</option>
              <option value="unknown">unknown</option>
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
              清除筛选
            </button>
          </div>
        </section>

        <section className="mt-5">
          <GuideSectionTitle title="公司列表" subtitle={`共 ${q.data?.total ?? 0} 家示例公司`} />
          {q.isLoading ? (
            <InlineLoading />
          ) : q.isError ? (
            <ErrorState title="公司列表暂时无法加载" subtitle="请稍后再试。" onRetry={() => q.refetch()} />
          ) : (q.data?.items.length ?? 0) === 0 ? (
            <EmptyState title="暂无匹配公司" subtitle="试试减少筛选条件，或等待编辑部继续补充资料。" />
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
