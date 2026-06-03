"use client";

import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { useQuery } from "@tanstack/react-query";
import { GraduationCap, Search, SlidersHorizontal } from "lucide-react";
import { guide } from "@/lib/guide";
import {
  GUIDE_SCHOOL_TYPE_LABELS,
  GuideComingSoon,
  GuideSectionTitle,
  GuideShell,
  SchoolCard,
  useGuideCountry,
} from "@/components/guide/GuideKit";
import { EmptyState, ErrorState, InlineLoading } from "@/components/design/States";

const QUICK_FILTERS = [
  { label: "大学", params: { schoolType: "university" } },
  { label: "大学院", params: { schoolType: "graduate_school" } },
  { label: "短期大学", params: { schoolType: "junior_college" } },
  { label: "高专", params: { schoolType: "college_of_technology" } },
  { label: "专门学校", params: { schoolType: "vocational_school" } },
  { label: "语言学校", params: { schoolType: "language_school" } },
  { label: "首都圈", params: { regionGroup: "capital_area" } },
  { label: "关西圈", params: { regionGroup: "kansai_area" } },
  { label: "东京", params: { prefecture: "tokyo" } },
  { label: "大阪", params: { prefecture: "osaka" } },
  { label: "京都", params: { prefecture: "kyoto" } },
  { label: "英文项目", params: { hasEnglishProgram: true } },
  { label: "留学生可申请", params: { acceptsInternationalStudents: true } },
];

const PREFECTURES = [
  { value: "", label: "全部都道府县" },
  { value: "tokyo", label: "东京" },
  { value: "kanagawa", label: "神奈川" },
  { value: "chiba", label: "千叶" },
  { value: "saitama", label: "埼玉" },
  { value: "osaka", label: "大阪" },
  { value: "kyoto", label: "京都" },
  { value: "hyogo", label: "兵库" },
  { value: "nara", label: "奈良" },
  { value: "shiga", label: "滋贺" },
  { value: "wakayama", label: "和歌山" },
];

const FIELDS = ["", "engineering", "business", "it", "medicine", "humanities", "language", "design", "anime_game", "science"];

export default function GuideSchoolsPage() {
  const country = useGuideCountry();
  const [draft, setDraft] = useState("");
  const [keyword, setKeyword] = useState("");
  const [schoolType, setSchoolType] = useState("");
  const [regionGroup, setRegionGroup] = useState("");
  const [prefecture, setPrefecture] = useState("");
  const [field, setField] = useState("");
  const [acceptsInternational, setAcceptsInternational] = useState(false);
  const [hasEnglishProgram, setHasEnglishProgram] = useState(false);
  const [hasJapaneseProgram, setHasJapaneseProgram] = useState(false);
  const [hasScholarship, setHasScholarship] = useState(false);
  const [hasDormitory, setHasDormitory] = useState(false);
  const [hasCareerSupport, setHasCareerSupport] = useState(false);
  const [hasLanguageSupport, setHasLanguageSupport] = useState(false);
  const [jlptLevel, setJlptLevel] = useState("");
  const [ejuRequired, setEjuRequired] = useState("");
  const [toeflRequired, setToeflRequired] = useState("");
  const [ieltsRequired, setIeltsRequired] = useState("");
  const [admissionMonth, setAdmissionMonth] = useState("");
  const [tuitionMax, setTuitionMax] = useState("");
  const [sort, setSort] = useState("recommended");

  const params = useMemo(() => ({
    country,
    keyword: keyword || undefined,
    schoolType: schoolType || undefined,
    regionGroup: regionGroup || undefined,
    prefecture: prefecture || undefined,
    field: field || undefined,
    acceptsInternationalStudents: acceptsInternational || undefined,
    hasEnglishProgram: hasEnglishProgram || undefined,
    hasJapaneseProgram: hasJapaneseProgram || undefined,
    hasScholarship: hasScholarship || undefined,
    hasDormitory: hasDormitory || undefined,
    hasCareerSupport: hasCareerSupport || undefined,
    hasLanguageSupport: hasLanguageSupport || undefined,
    jlptLevel: jlptLevel || undefined,
    ejuRequired: ejuRequired || undefined,
    toeflRequired: toeflRequired || undefined,
    ieltsRequired: ieltsRequired || undefined,
    admissionMonth: admissionMonth || undefined,
    tuitionMax: tuitionMax ? Number(tuitionMax) : undefined,
    sort,
    pageSize: 50,
  }), [acceptsInternational, admissionMonth, country, ejuRequired, field, hasCareerSupport, hasDormitory, hasEnglishProgram, hasJapaneseProgram, hasLanguageSupport, hasScholarship, ieltsRequired, jlptLevel, keyword, prefecture, regionGroup, schoolType, sort, toeflRequired, tuitionMax]);

  const q = useQuery({
    queryKey: ["guide", "schools", params],
    queryFn: () => guide.schools(params),
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
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#2563EB] text-white shadow-sm">
            <GraduationCap className="h-6 w-6" />
          </span>
          <div className="min-w-0">
            <h1 className="text-xl font-black leading-tight text-kx-text sm:text-2xl">日本学校库</h1>
            <p className="text-xs leading-5 text-kx-muted">查找日本大学、大学院、专门学校、语言学校和留学生申请信息。</p>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2 rounded-2xl border border-kx-stroke/60 bg-kx-card px-3 py-2 shadow-sm">
          <Search className="h-4 w-4 shrink-0 text-kx-muted" />
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && setKeyword(draft.trim())}
            placeholder="搜索学校名称、地区、专业、入学方式"
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
                if ("schoolType" in item.params) setSchoolType(String(item.params.schoolType));
                if ("regionGroup" in item.params) setRegionGroup(String(item.params.regionGroup));
                if ("prefecture" in item.params) setPrefecture(String(item.params.prefecture));
                if ("hasEnglishProgram" in item.params) setHasEnglishProgram(true);
                if ("acceptsInternationalStudents" in item.params) setAcceptsInternational(true);
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
            <select value={schoolType} onChange={(e) => setSchoolType(e.target.value)} className="h-10 rounded-kx-md border border-kx-stroke/70 bg-kx-soft/40 px-3 text-sm text-kx-text outline-none">
              <option value="">全部学校类型</option>
              {Object.entries(GUIDE_SCHOOL_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
            <select value={regionGroup} onChange={(e) => setRegionGroup(e.target.value)} className="h-10 rounded-kx-md border border-kx-stroke/70 bg-kx-soft/40 px-3 text-sm text-kx-text outline-none">
              <option value="">全部区域组</option>
              <option value="capital_area">首都圈</option>
              <option value="kansai_area">关西圈</option>
              <option value="all_japan">日本全国</option>
            </select>
            <select value={prefecture} onChange={(e) => setPrefecture(e.target.value)} className="h-10 rounded-kx-md border border-kx-stroke/70 bg-kx-soft/40 px-3 text-sm text-kx-text outline-none">
              {PREFECTURES.map((p) => <option key={p.value || "all"} value={p.value}>{p.label}</option>)}
            </select>
            <select value={field} onChange={(e) => setField(e.target.value)} className="h-10 rounded-kx-md border border-kx-stroke/70 bg-kx-soft/40 px-3 text-sm text-kx-text outline-none">
              {FIELDS.map((f) => <option key={f || "all"} value={f}>{f || "全部专业领域"}</option>)}
            </select>
            <select value={sort} onChange={(e) => setSort(e.target.value)} className="h-10 rounded-kx-md border border-kx-stroke/70 bg-kx-soft/40 px-3 text-sm text-kx-text outline-none">
              <option value="recommended">推荐优先</option>
              <option value="data_quality">数据完整度</option>
              <option value="popular">收藏/浏览优先</option>
              <option value="recently_updated">最近更新</option>
              <option value="tuition_low_to_high">学费低到高</option>
              <option value="tuition_high_to_low">学费高到低</option>
              <option value="name_asc">名称 A-Z</option>
              <option value="name_jp_asc">日文名排序</option>
            </select>
            <select value={jlptLevel} onChange={(e) => setJlptLevel(e.target.value)} className="h-10 rounded-kx-md border border-kx-stroke/70 bg-kx-soft/40 px-3 text-sm text-kx-text outline-none">
              <option value="">JLPT 要求</option>
              <option value="n5">N5</option>
              <option value="n4">N4</option>
              <option value="n3">N3</option>
              <option value="n2">N2</option>
              <option value="n1">N1</option>
            </select>
            <select value={ejuRequired} onChange={(e) => setEjuRequired(e.target.value)} className="h-10 rounded-kx-md border border-kx-stroke/70 bg-kx-soft/40 px-3 text-sm text-kx-text outline-none">
              <option value="">EJU 要求</option>
              <option value="true">需要 EJU</option>
              <option value="false">不需要 EJU</option>
            </select>
            <select value={toeflRequired} onChange={(e) => setToeflRequired(e.target.value)} className="h-10 rounded-kx-md border border-kx-stroke/70 bg-kx-soft/40 px-3 text-sm text-kx-text outline-none">
              <option value="">TOEFL 要求</option>
              <option value="required">required</option>
              <option value="not_required">not_required</option>
              <option value="unknown">unknown</option>
            </select>
            <select value={ieltsRequired} onChange={(e) => setIeltsRequired(e.target.value)} className="h-10 rounded-kx-md border border-kx-stroke/70 bg-kx-soft/40 px-3 text-sm text-kx-text outline-none">
              <option value="">IELTS 要求</option>
              <option value="required">required</option>
              <option value="not_required">not_required</option>
              <option value="unknown">unknown</option>
            </select>
            <select value={admissionMonth} onChange={(e) => setAdmissionMonth(e.target.value)} className="h-10 rounded-kx-md border border-kx-stroke/70 bg-kx-soft/40 px-3 text-sm text-kx-text outline-none">
              <option value="">入学月份</option>
              <option value="april">4月</option>
              <option value="september">9月</option>
              <option value="october">10月</option>
            </select>
            <select value={tuitionMax} onChange={(e) => setTuitionMax(e.target.value)} className="h-10 rounded-kx-md border border-kx-stroke/70 bg-kx-soft/40 px-3 text-sm text-kx-text outline-none">
              <option value="">学费上限</option>
              <option value="800000">80万 JPY</option>
              <option value="1200000">120万 JPY</option>
              <option value="1800000">180万 JPY</option>
            </select>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <label className="inline-flex items-center gap-2 rounded-full bg-kx-soft px-3 py-1.5 text-xs font-semibold text-kx-subtle">
              <input type="checkbox" checked={acceptsInternational} onChange={(e) => setAcceptsInternational(e.target.checked)} />
              留学生可申请
            </label>
            <label className="inline-flex items-center gap-2 rounded-full bg-kx-soft px-3 py-1.5 text-xs font-semibold text-kx-subtle">
              <input type="checkbox" checked={hasEnglishProgram} onChange={(e) => setHasEnglishProgram(e.target.checked)} />
              英文项目
            </label>
            {[
              [hasJapaneseProgram, setHasJapaneseProgram, "日语项目"],
              [hasScholarship, setHasScholarship, "奖学金"],
              [hasDormitory, setHasDormitory, "宿舍"],
              [hasCareerSupport, setHasCareerSupport, "就职支持"],
              [hasLanguageSupport, setHasLanguageSupport, "语言支持"],
            ].map(([checked, setter, label]) => (
              <label key={String(label)} className="inline-flex items-center gap-2 rounded-full bg-kx-soft px-3 py-1.5 text-xs font-semibold text-kx-subtle">
                <input type="checkbox" checked={Boolean(checked)} onChange={(e) => (setter as Dispatch<SetStateAction<boolean>>)(e.target.checked)} />
                {String(label)}
              </label>
            ))}
            <button
              type="button"
              onClick={() => {
                setSchoolType("");
                setRegionGroup("");
                setPrefecture("");
                setField("");
                setKeyword("");
                setDraft("");
                setAcceptsInternational(false);
                setHasEnglishProgram(false);
                setHasJapaneseProgram(false);
                setHasScholarship(false);
                setHasDormitory(false);
                setHasCareerSupport(false);
                setHasLanguageSupport(false);
                setJlptLevel("");
                setEjuRequired("");
                setToeflRequired("");
                setIeltsRequired("");
                setAdmissionMonth("");
                setTuitionMax("");
                setSort("recommended");
              }}
              className="rounded-full px-3 py-1.5 text-xs font-semibold text-kx-muted hover:bg-kx-soft"
            >
              清除筛选
            </button>
          </div>
        </section>

        <section className="mt-5">
          <GuideSectionTitle title="学校列表" subtitle={`共 ${q.data?.total ?? 0} 所示例学校`} />
          {q.isLoading ? (
            <InlineLoading />
          ) : q.isError ? (
            <ErrorState title="学校列表暂时无法加载" subtitle="请稍后再试。" onRetry={() => q.refetch()} />
          ) : (q.data?.items.length ?? 0) === 0 ? (
            <EmptyState title="暂无匹配学校" subtitle="试试减少筛选条件，或等待编辑部继续补充资料。" />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {q.data!.items.map((school) => (
                <SchoolCard key={school.id} school={school} />
              ))}
            </div>
          )}
          {q.data?.disclaimer ? <p className="mt-4 text-[11px] leading-5 text-kx-muted">{q.data.disclaimer}</p> : null}
        </section>
      </div>
    </GuideShell>
  );
}
