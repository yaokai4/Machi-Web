"use client";

import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { useQuery } from "@tanstack/react-query";
import { GraduationCap, Search, SlidersHorizontal } from "lucide-react";
import { guide } from "@/lib/guide";
import {
  GuideComingSoon,
  GuideSectionTitle,
  GuideShell,
  SchoolCard,
  useGuideCountry,
} from "@/components/guide/GuideKit";
import { EmptyState, ErrorState, InlineLoading } from "@/components/design/States";
import { appLocaleToGuideLanguage, useI18n } from "@/lib/i18n";
import { fieldLabel, guideUi, prefectureOptions, regionGroupLabel, schoolTypeLabel } from "@/lib/guide-ui";

const FIELDS = ["", "engineering", "business", "it", "medicine", "humanities", "language", "design", "anime_game", "science"];
const SCHOOL_TYPES = ["university", "graduate_school", "junior_college", "college_of_technology", "vocational_school", "language_school", "other"];

export default function GuideSchoolsPage() {
  const country = useGuideCountry();
  const { locale, t } = useI18n();
  const language = appLocaleToGuideLanguage(locale);
  const copy = guideUi(locale);
  const prefectures = useMemo(() => prefectureOptions(locale), [locale]);
  const quickFilters = useMemo(() => [
    { label: schoolTypeLabel("university", locale), params: { schoolType: "university" } },
    { label: schoolTypeLabel("graduate_school", locale), params: { schoolType: "graduate_school" } },
    { label: schoolTypeLabel("junior_college", locale), params: { schoolType: "junior_college" } },
    { label: schoolTypeLabel("college_of_technology", locale), params: { schoolType: "college_of_technology" } },
    { label: schoolTypeLabel("vocational_school", locale), params: { schoolType: "vocational_school" } },
    { label: schoolTypeLabel("language_school", locale), params: { schoolType: "language_school" } },
    { label: regionGroupLabel("capital_area", locale), params: { regionGroup: "capital_area" } },
    { label: regionGroupLabel("kansai_area", locale), params: { regionGroup: "kansai_area" } },
    ...prefectures.filter((p) => ["tokyo", "osaka", "kyoto"].includes(p.value)).map((p) => ({ label: p.label, params: { prefecture: p.value } })),
    { label: t("guide_english_program"), params: { hasEnglishProgram: true } },
    { label: t("guide_student_ok"), params: { acceptsInternationalStudents: true } },
  ], [locale, prefectures, t]);
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
    language,
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
  }), [acceptsInternational, admissionMonth, country, ejuRequired, field, hasCareerSupport, hasDormitory, hasEnglishProgram, hasJapaneseProgram, hasLanguageSupport, hasScholarship, ieltsRequired, jlptLevel, keyword, language, prefecture, regionGroup, schoolType, sort, toeflRequired, tuitionMax]);

  const q = useQuery({
    queryKey: ["guide", "schools", params],
    queryFn: () => guide.schools(params),
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
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#2563EB] text-white shadow-sm">
            <GraduationCap className="h-6 w-6" />
          </span>
          <div className="min-w-0">
            <h1 className="text-xl font-black leading-tight text-kx-text sm:text-2xl">{copy.schools.title}</h1>
            <p className="text-xs leading-5 text-kx-muted">{copy.schools.subtitle}</p>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2 rounded-2xl border border-kx-stroke/60 bg-kx-card px-3 py-2 shadow-sm">
          <Search className="h-4 w-4 shrink-0 text-kx-muted" />
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && setKeyword(draft.trim())}
            placeholder={copy.schools.placeholder}
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
            <SlidersHorizontal className="h-4 w-4" /> {copy.filter}
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <select value={schoolType} onChange={(e) => setSchoolType(e.target.value)} className="h-10 rounded-kx-md border border-kx-stroke/70 bg-kx-soft/40 px-3 text-sm text-kx-text outline-none">
              <option value="">{locale === "en" ? "All school types" : locale === "ja" ? "すべての学校種別" : "全部学校类型"}</option>
              {SCHOOL_TYPES.map((value) => (
                <option key={value} value={value}>{schoolTypeLabel(value, locale)}</option>
              ))}
            </select>
            <select value={regionGroup} onChange={(e) => setRegionGroup(e.target.value)} className="h-10 rounded-kx-md border border-kx-stroke/70 bg-kx-soft/40 px-3 text-sm text-kx-text outline-none">
              <option value="">{locale === "en" ? "All regions" : locale === "ja" ? "すべての地域" : "全部区域组"}</option>
              <option value="capital_area">{regionGroupLabel("capital_area", locale)}</option>
              <option value="kansai_area">{regionGroupLabel("kansai_area", locale)}</option>
              <option value="all_japan">{regionGroupLabel("all_japan", locale)}</option>
            </select>
            <select value={prefecture} onChange={(e) => setPrefecture(e.target.value)} className="h-10 rounded-kx-md border border-kx-stroke/70 bg-kx-soft/40 px-3 text-sm text-kx-text outline-none">
              <option value="">{locale === "en" ? "All prefectures" : locale === "ja" ? "すべての都道府県" : "全部都道府县"}</option>
              {prefectures.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
            <select value={field} onChange={(e) => setField(e.target.value)} className="h-10 rounded-kx-md border border-kx-stroke/70 bg-kx-soft/40 px-3 text-sm text-kx-text outline-none">
              {FIELDS.map((f) => <option key={f || "all"} value={f}>{f ? fieldLabel(f, locale) : (locale === "en" ? "All fields" : locale === "ja" ? "すべての分野" : "全部专业领域")}</option>)}
            </select>
            <select value={sort} onChange={(e) => setSort(e.target.value)} className="h-10 rounded-kx-md border border-kx-stroke/70 bg-kx-soft/40 px-3 text-sm text-kx-text outline-none">
              <option value="recommended">{locale === "en" ? "Recommended" : locale === "ja" ? "おすすめ順" : "推荐优先"}</option>
              <option value="data_quality">{locale === "en" ? "Data completeness" : locale === "ja" ? "情報の充実度" : "数据完整度"}</option>
              <option value="popular">{locale === "en" ? "Most saved / viewed" : locale === "ja" ? "保存・閲覧が多い順" : "收藏/浏览优先"}</option>
              <option value="recently_updated">{locale === "en" ? "Recently updated" : locale === "ja" ? "最近更新" : "最近更新"}</option>
              <option value="tuition_low_to_high">{locale === "en" ? "Tuition: low to high" : locale === "ja" ? "学費が安い順" : "学费低到高"}</option>
              <option value="tuition_high_to_low">{locale === "en" ? "Tuition: high to low" : locale === "ja" ? "学費が高い順" : "学费高到低"}</option>
              <option value="name_asc">{locale === "en" ? "Name A-Z" : locale === "ja" ? "英字名順" : "名称 A-Z"}</option>
              <option value="name_jp_asc">{locale === "en" ? "Japanese name" : locale === "ja" ? "日本語名順" : "日文名排序"}</option>
            </select>
            <select value={jlptLevel} onChange={(e) => setJlptLevel(e.target.value)} className="h-10 rounded-kx-md border border-kx-stroke/70 bg-kx-soft/40 px-3 text-sm text-kx-text outline-none">
              <option value="">{locale === "en" ? "JLPT requirement" : locale === "ja" ? "JLPT 要件" : "JLPT 要求"}</option>
              <option value="n5">N5</option>
              <option value="n4">N4</option>
              <option value="n3">N3</option>
              <option value="n2">N2</option>
              <option value="n1">N1</option>
            </select>
            <select value={ejuRequired} onChange={(e) => setEjuRequired(e.target.value)} className="h-10 rounded-kx-md border border-kx-stroke/70 bg-kx-soft/40 px-3 text-sm text-kx-text outline-none">
              <option value="">{locale === "en" ? "EJU requirement" : locale === "ja" ? "EJU 要件" : "EJU 要求"}</option>
              <option value="true">{locale === "en" ? "EJU required" : locale === "ja" ? "EJU 必須" : "需要 EJU"}</option>
              <option value="false">{locale === "en" ? "EJU not required" : locale === "ja" ? "EJU 不要" : "不需要 EJU"}</option>
            </select>
            <select value={toeflRequired} onChange={(e) => setToeflRequired(e.target.value)} className="h-10 rounded-kx-md border border-kx-stroke/70 bg-kx-soft/40 px-3 text-sm text-kx-text outline-none">
              <option value="">{locale === "en" ? "TOEFL requirement" : locale === "ja" ? "TOEFL 要件" : "TOEFL 要求"}</option>
              <option value="required">{locale === "en" ? "TOEFL required" : locale === "ja" ? "TOEFL 必須" : "需要 TOEFL"}</option>
              <option value="not_required">{locale === "en" ? "TOEFL not required" : locale === "ja" ? "TOEFL 不要" : "不需要 TOEFL"}</option>
              <option value="unknown">{t("guide_unconfirmed")}</option>
            </select>
            <select value={ieltsRequired} onChange={(e) => setIeltsRequired(e.target.value)} className="h-10 rounded-kx-md border border-kx-stroke/70 bg-kx-soft/40 px-3 text-sm text-kx-text outline-none">
              <option value="">{locale === "en" ? "IELTS requirement" : locale === "ja" ? "IELTS 要件" : "IELTS 要求"}</option>
              <option value="required">{locale === "en" ? "IELTS required" : locale === "ja" ? "IELTS 必須" : "需要 IELTS"}</option>
              <option value="not_required">{locale === "en" ? "IELTS not required" : locale === "ja" ? "IELTS 不要" : "不需要 IELTS"}</option>
              <option value="unknown">{t("guide_unconfirmed")}</option>
            </select>
            <select value={admissionMonth} onChange={(e) => setAdmissionMonth(e.target.value)} className="h-10 rounded-kx-md border border-kx-stroke/70 bg-kx-soft/40 px-3 text-sm text-kx-text outline-none">
              <option value="">{locale === "en" ? "Admission month" : locale === "ja" ? "入学月" : "入学月份"}</option>
              <option value="april">{locale === "en" ? "April" : locale === "ja" ? "4月" : "4月"}</option>
              <option value="september">{locale === "en" ? "September" : locale === "ja" ? "9月" : "9月"}</option>
              <option value="october">{locale === "en" ? "October" : locale === "ja" ? "10月" : "10月"}</option>
            </select>
            <select value={tuitionMax} onChange={(e) => setTuitionMax(e.target.value)} className="h-10 rounded-kx-md border border-kx-stroke/70 bg-kx-soft/40 px-3 text-sm text-kx-text outline-none">
              <option value="">{locale === "en" ? "Tuition cap" : locale === "ja" ? "学費上限" : "学费上限"}</option>
              <option value="800000">80万 JPY</option>
              <option value="1200000">120万 JPY</option>
              <option value="1800000">180万 JPY</option>
            </select>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <label className="inline-flex items-center gap-2 rounded-full bg-kx-soft px-3 py-1.5 text-xs font-semibold text-kx-subtle">
              <input type="checkbox" checked={acceptsInternational} onChange={(e) => setAcceptsInternational(e.target.checked)} />
              {t("guide_student_ok")}
            </label>
            <label className="inline-flex items-center gap-2 rounded-full bg-kx-soft px-3 py-1.5 text-xs font-semibold text-kx-subtle">
              <input type="checkbox" checked={hasEnglishProgram} onChange={(e) => setHasEnglishProgram(e.target.checked)} />
              {t("guide_english_program")}
            </label>
            {[
              [hasJapaneseProgram, setHasJapaneseProgram, locale === "en" ? "Japanese-taught programs" : locale === "ja" ? "日本語プログラム" : "日语项目"],
              [hasScholarship, setHasScholarship, locale === "en" ? "Scholarships" : locale === "ja" ? "奨学金" : "奖学金"],
              [hasDormitory, setHasDormitory, locale === "en" ? "Dormitory" : locale === "ja" ? "寮" : "宿舍"],
              [hasCareerSupport, setHasCareerSupport, locale === "en" ? "Career support" : locale === "ja" ? "就職支援" : "就职支持"],
              [hasLanguageSupport, setHasLanguageSupport, locale === "en" ? "Language support" : locale === "ja" ? "語学サポート" : "语言支持"],
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
              {copy.clearFilters}
            </button>
          </div>
        </section>

        <section className="mt-5">
          <GuideSectionTitle title={copy.schools.listTitle} subtitle={copy.totalSchools(q.data?.total ?? 0)} />
          {q.isLoading ? (
            <InlineLoading />
          ) : q.isError ? (
            <ErrorState title={copy.schools.loadError} subtitle={copy.retryLater} onRetry={() => q.refetch()} />
          ) : (q.data?.items.length ?? 0) === 0 ? (
            <EmptyState title={copy.schools.emptyTitle} subtitle={copy.schools.emptySubtitle} />
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
