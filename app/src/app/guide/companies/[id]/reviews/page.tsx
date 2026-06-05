"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Building2, MessageSquarePlus, Send } from "lucide-react";
import {
  guide,
  type GuideCompanyReview,
  type GuideInterviewReview,
} from "@/lib/guide";
import { GuideComingSoon, GuideShell, useGuideCountry } from "@/components/guide/GuideKit";
import { EmptyState, ErrorState, InlineLoading } from "@/components/design/States";
import { useAuthPrompt, useSession, useToasts } from "@/lib/store";
import { appLocaleToGuideLanguage, type Locale, useI18n } from "@/lib/i18n";
import { guideUi, industryLabel, japanCityLabel } from "@/lib/guide-ui";

type ReviewTab = "interview" | "work";
type LocalizedOption = { value: string; zh: string; en: string; ja: string };

const EMPLOYMENT_TYPES: LocalizedOption[] = [
  { value: "正社员", zh: "正社员", en: "Full-time", ja: "正社員" },
  { value: "契约社员", zh: "契约社员", en: "Contract employee", ja: "契約社員" },
  { value: "派遣", zh: "派遣", en: "Dispatch", ja: "派遣" },
  { value: "实习", zh: "实习", en: "Internship", ja: "インターン" },
  { value: "兼职", zh: "兼职", en: "Part-time", ja: "アルバイト" },
  { value: "新卒", zh: "新卒", en: "New graduate", ja: "新卒" },
  { value: "中途", zh: "中途", en: "Mid-career", ja: "中途" },
];
const DIFFICULTY: LocalizedOption[] = [
  { value: "普通", zh: "普通", en: "Average", ja: "普通" },
  { value: "偏简单", zh: "偏简单", en: "Somewhat easy", ja: "やや簡単" },
  { value: "偏难", zh: "偏难", en: "Somewhat difficult", ja: "やや難しい" },
  { value: "压力较大", zh: "压力较大", en: "High pressure", ja: "プレッシャーが強い" },
];
const RESULTS: LocalizedOption[] = [
  { value: "通过", zh: "通过", en: "Passed", ja: "通過" },
  { value: "未通过", zh: "未通过", en: "Not selected", ja: "不通過" },
  { value: "等待结果", zh: "等待结果", en: "Waiting for results", ja: "結果待ち" },
  { value: "辞退/未继续", zh: "辞退/未继续", en: "Withdrew / did not continue", ja: "辞退・継続せず" },
];

function lang(locale: Locale): "zh" | "en" | "ja" {
  if (locale === "en") return "en";
  if (locale === "ja") return "ja";
  return "zh";
}

function optionLabel(value: string | undefined | null, options: LocalizedOption[], locale: Locale): string {
  if (!value) return "";
  const found = options.find((item) => item.value === value || item.zh === value || item.en === value || item.ja === value);
  return found ? found[lang(locale)] : value;
}

function reviewsCopy(locale: Locale) {
  if (locale === "en") {
    return {
      back: "Company details",
      database: "Foreigner-Friendly Company Database",
      trustedNote: "Reviewed submissions from real users",
      interviewTab: "Interview reviews",
      workTab: "Work reviews",
      write: "Write a review",
      emptyInterview: "No interview reviews yet",
      emptyWork: "No work reviews yet",
      emptyBody: "Reviews are shown only after moderation. Machi never pre-fills or fabricates user reviews.",
      loadError: "Reviews are temporarily unavailable",
      submitInterview: "Write interview review",
      submitWork: "Write work review",
      position: "Role / job type",
      positionPlaceholder: "e.g. Software Engineer / Generalist role",
      employmentType: "Employment type",
      interviewRounds: "Interview rounds",
      interviewLanguage: "Interview language",
      difficulty: "Difficulty",
      result: "Result",
      questions: "Interview questions",
      questionsPlaceholder: "Share questions, formats, or preparation tips.",
      process: "Process notes",
      processPlaceholder: "e.g. document screening, first interview, final interview, wait time.",
      pros: "What was good",
      prosPlaceholder: "Share real experience about the team, training, environment, or culture.",
      cons: "What to watch for",
      consPlaceholder: "Mention overtime, communication, or systems future applicants should know. Avoid private information and unverified accusations.",
      overtime: "Overtime",
      overtimePlaceholder: "e.g. busy during projects / usually on time",
      foreignerSupport: "Support for foreign employees",
      foreignerSupportPlaceholder: "e.g. clear visa support",
      salaryBenefits: "Compensation and benefits",
      careerGrowth: "Career growth",
      anonymousNote: "Submitted anonymously by default and shown after moderation. Do not include private information, contact details, or claims you cannot verify.",
      submitting: "Submitting",
      submitReview: "Submit for review",
      submittedInterview: "Interview review submitted. It will appear after moderation.",
      submittedWork: "Review submitted. It will appear after moderation.",
      submitFailed: "Submission failed. Please try again later.",
      recommendation: "Recommendation",
      attention: "Worth noting",
      overtimeLabel: "Overtime",
      supportLabel: "Foreigner support",
      salaryLabel: "Compensation",
      growthLabel: "Growth",
      difficultyLabel: "Difficulty",
      resultLabel: "Result",
      roundsSuffix: "rounds",
      companyFallback: "Company",
    };
  }
  if (locale === "ja") {
    return {
      back: "会社詳細",
      database: "外国人向け就職会社データベース",
      trustedNote: "実際のユーザー投稿を審査後に掲載",
      interviewTab: "面接レビュー",
      workTab: "勤務レビュー",
      write: "レビューを書く",
      emptyInterview: "面接レビューはまだありません",
      emptyWork: "勤務レビューはまだありません",
      emptyBody: "すべてのレビューは審査後に掲載されます。Machi がユーザー内容を事前入力したり、偽造したりすることはありません。",
      loadError: "レビューを読み込めません",
      submitInterview: "面接レビューを書く",
      submitWork: "勤務レビューを書く",
      position: "職種・ポジション",
      positionPlaceholder: "例：ソフトウェアエンジニア / 総合職",
      employmentType: "雇用形態",
      interviewRounds: "面接回数",
      interviewLanguage: "面接言語",
      difficulty: "難易度",
      result: "結果",
      questions: "面接で聞かれたこと",
      questionsPlaceholder: "質問内容、形式、準備のコツなどを書いてください。",
      process: "選考プロセス",
      processPlaceholder: "例：書類選考、一次面接、最終面接、結果連絡までの期間。",
      pros: "良かった点",
      prosPlaceholder: "職場環境、研修、チームの雰囲気など、実体験を書いてください。",
      cons: "注意したい点",
      consPlaceholder: "残業、コミュニケーション、制度など、後から応募する人に役立つ注意点。個人情報や未確認の主張は避けてください。",
      overtime: "残業状況",
      overtimePlaceholder: "例：プロジェクト時期は忙しい / 基本定時",
      foreignerSupport: "外国人サポート",
      foreignerSupportPlaceholder: "例：ビザサポートが明確",
      salaryBenefits: "給与・福利厚生",
      careerGrowth: "成長機会",
      anonymousNote: "デフォルトで匿名投稿され、審査後に掲載されます。個人情報、連絡先、確認できない主張は書かないでください。",
      submitting: "送信中",
      submitReview: "審査に送信",
      submittedInterview: "面接体験を送信しました。審査後に掲載されます。",
      submittedWork: "レビューを送信しました。審査後に掲載されます。",
      submitFailed: "送信できませんでした。しばらくしてからもう一度お試しください。",
      recommendation: "おすすめ度",
      attention: "注意点",
      overtimeLabel: "残業",
      supportLabel: "外国人サポート",
      salaryLabel: "給与・福利厚生",
      growthLabel: "成長機会",
      difficultyLabel: "難易度",
      resultLabel: "結果",
      roundsSuffix: "回の面接",
      companyFallback: "会社",
    };
  }
  return {
    back: "公司详情",
    database: "外国人就职公司库",
    trustedNote: "经审核后展示真实用户提交",
    interviewTab: "面试评论",
    workTab: "工作评价",
    write: "写评论",
    emptyInterview: "还没有面试评论",
    emptyWork: "还没有工作评价",
    emptyBody: "所有评论都需要审核后展示。不会预填或伪造用户内容。",
    loadError: "评论暂时无法加载",
    submitInterview: "写面试评论",
    submitWork: "写工作评价",
    position: "岗位/职种",
    positionPlaceholder: "例：软件工程师 / 综合职",
    employmentType: "雇佣类型",
    interviewRounds: "面试轮数",
    interviewLanguage: "面试语言",
    difficulty: "难度",
    result: "结果",
    questions: "面试问题",
    questionsPlaceholder: "写你被问到的问题、题型或准备建议。",
    process: "流程说明",
    processPlaceholder: "例：书类选考、一次面试、最终面试、等待多久收到结果。",
    pros: "优点",
    prosPlaceholder: "写工作环境、培养制度、团队氛围等真实体验。",
    cons: "需要留意",
    consPlaceholder: "写加班、沟通、制度等需要后来者注意的地方，避免个人隐私和未经证实指控。",
    overtime: "加班情况",
    overtimePlaceholder: "例：项目期较忙 / 基本准点",
    foreignerSupport: "外国人支持",
    foreignerSupportPlaceholder: "例：签证支持明确",
    salaryBenefits: "薪资福利",
    careerGrowth: "成长空间",
    anonymousNote: "默认匿名提交，审核通过后展示。请勿填写个人隐私、联系方式或无法核实的指控。",
    submitting: "提交中",
    submitReview: "提交审核",
    submittedInterview: "面试经验已提交，将在审核通过后展示。",
    submittedWork: "已提交，将在审核通过后展示。",
    submitFailed: "提交失败，请稍后再试。",
    recommendation: "推荐度",
    attention: "需要留意",
    overtimeLabel: "加班",
    supportLabel: "外国人支持",
    salaryLabel: "薪资福利",
    growthLabel: "成长空间",
    difficultyLabel: "难度",
    resultLabel: "结果",
    roundsSuffix: "轮面试",
    companyFallback: "公司",
  };
}

export default function GuideCompanyReviewsPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const id = String(params?.id || "");
  const country = useGuideCountry();
  const [activeTab, setActiveTab] = useState<ReviewTab>("interview");
  const [showForm, setShowForm] = useState(false);
  const user = useSession((s) => s.user);
  const openAuthPrompt = useAuthPrompt((s) => s.open);
  const pushToast = useToasts((s) => s.push);
  const { locale } = useI18n();
  const language = appLocaleToGuideLanguage(locale);
  const g = guideUi(locale);
  const copy = reviewsCopy(locale);

  useEffect(() => {
    if (searchParams.get("compose") === "1") setShowForm(true);
  }, [searchParams]);

  const company = useQuery({
    queryKey: ["guide", "company", country, id, language],
    queryFn: () => guide.company(id, country, language),
    enabled: country === "jp" && id.length > 0,
    staleTime: 60_000,
  });
  const reviews = useQuery({
    queryKey: ["guide", "company-reviews", country, id, language],
    queryFn: () => guide.companyReviews(id, country, language),
    enabled: country === "jp" && id.length > 0,
    staleTime: 30_000,
  });

  if (country !== "jp") {
    return (
      <GuideShell back={{ href: "/guide", label: g.back }}>
        <GuideComingSoon />
      </GuideShell>
    );
  }

  if (company.isLoading || reviews.isLoading) {
    return (
      <GuideShell back={{ href: `/guide/companies/${id}`, label: copy.back }}>
        <InlineLoading />
      </GuideShell>
    );
  }

  if (company.isError || reviews.isError || !company.data?.company || !reviews.data) {
    return (
      <GuideShell back={{ href: `/guide/companies/${id}`, label: copy.back }}>
        <ErrorState title={copy.loadError} subtitle={g.retryLater} onRetry={() => { company.refetch(); reviews.refetch(); }} />
      </GuideShell>
    );
  }

  const c = company.data.company;
  const workReviews = reviews.data.workReviews || [];
  const interviewReviews = reviews.data.interviewReviews || [];
  const activeItems = activeTab === "interview" ? interviewReviews : workReviews;

  return (
    <GuideShell back={{ href: `/guide/companies/${c.slug || c.id}`, label: copy.back }}>
      <div className="px-4 py-4 sm:px-6">
        <header className="rounded-kx-lg border border-kx-stroke/50 bg-kx-card p-5">
          <div className="flex items-start gap-3">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-kx-accentSoft text-kx-accent">
              <Building2 className="h-6 w-6" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-kx-accent">{copy.database}</p>
              <h1 className="mt-1 text-xl font-black leading-tight text-kx-text sm:text-2xl">{c.companyName}</h1>
              <p className="mt-1 text-xs text-kx-muted">
                {industryLabel(c.industry || "other", locale)} · {japanCityLabel(c.city, locale)} · {copy.trustedNote}
              </p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button type="button" data-active={activeTab === "interview"} onClick={() => setActiveTab("interview")} className="kx-tab h-9 px-4 text-xs">
              {copy.interviewTab} {interviewReviews.length}
            </button>
            <button type="button" data-active={activeTab === "work"} onClick={() => setActiveTab("work")} className="kx-tab h-9 px-4 text-xs">
              {copy.workTab} {workReviews.length}
            </button>
            <button
              type="button"
              onClick={() => setShowForm((v) => !v)}
              className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-full bg-kx-accent px-4 text-xs font-bold text-white shadow-sm hover:opacity-95"
            >
              <MessageSquarePlus className="h-3.5 w-3.5" /> {copy.write}
            </button>
          </div>
        </header>

        {showForm ? (
          <ReviewComposer
            companyId={c.slug || c.id}
            defaultTab={activeTab}
            locale={locale}
            copy={copy}
            isSignedIn={!!user}
            onNeedsAuth={() => openAuthPrompt("generic")}
            onSubmitted={(message) => {
              pushToast({ kind: "success", message });
              setShowForm(false);
            }}
            onError={(message) => pushToast({ kind: "error", message })}
          />
        ) : null}

        <section className="mt-3 space-y-3">
          {activeItems.length === 0 ? (
            <EmptyState
              title={activeTab === "interview" ? copy.emptyInterview : copy.emptyWork}
              subtitle={copy.emptyBody}
            />
          ) : activeTab === "interview" ? (
            interviewReviews.map((item) => <InterviewReviewCard key={item.id} review={item} locale={locale} copy={copy} />)
          ) : (
            workReviews.map((item) => <WorkReviewCard key={item.id} review={item} locale={locale} copy={copy} />)
          )}
        </section>

        {reviews.data.disclaimer ? (
          <p className="mt-4 text-[11px] leading-5 text-kx-muted">{reviews.data.disclaimer}</p>
        ) : null}
      </div>
    </GuideShell>
  );
}

function WorkReviewCard({ review, locale, copy }: { review: GuideCompanyReview; locale: Locale; copy: ReturnType<typeof reviewsCopy> }) {
  return (
    <article className="rounded-kx-lg border border-kx-stroke/50 bg-kx-card p-4">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-bold text-kx-muted">
        {review.position ? <span className="rounded-full bg-kx-accentSoft px-2 py-0.5 text-kx-accent">{review.position}</span> : null}
        {review.employmentType ? <span>{optionLabel(review.employmentType, EMPLOYMENT_TYPES, locale)}</span> : null}
        {review.recommendationScore ? <span>{copy.recommendation} {review.recommendationScore.toFixed(1)}/5</span> : null}
      </div>
      {review.pros ? <p className="mt-3 text-sm leading-7 text-kx-text">{review.pros}</p> : null}
      {review.cons ? <p className="mt-2 text-sm leading-7 text-kx-subtle">{copy.attention}: {review.cons}</p> : null}
      <div className="mt-3 grid gap-2 text-xs text-kx-muted sm:grid-cols-2">
        {review.overtimeLevel ? <span>{copy.overtimeLabel}: {review.overtimeLevel}</span> : null}
        {review.foreignerSupport ? <span>{copy.supportLabel}: {review.foreignerSupport}</span> : null}
        {review.salaryBenefits ? <span>{copy.salaryLabel}: {review.salaryBenefits}</span> : null}
        {review.careerGrowth ? <span>{copy.growthLabel}: {review.careerGrowth}</span> : null}
      </div>
    </article>
  );
}

function InterviewReviewCard({ review, locale, copy }: { review: GuideInterviewReview; locale: Locale; copy: ReturnType<typeof reviewsCopy> }) {
  return (
    <article className="rounded-kx-lg border border-kx-stroke/50 bg-kx-card p-4">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-bold text-kx-muted">
        {review.position ? <span className="rounded-full bg-kx-accentSoft px-2 py-0.5 text-kx-accent">{review.position}</span> : null}
        {review.employmentType ? <span>{optionLabel(review.employmentType, EMPLOYMENT_TYPES, locale)}</span> : null}
        {review.difficulty ? <span>{copy.difficultyLabel}: {optionLabel(review.difficulty, DIFFICULTY, locale)}</span> : null}
        {review.result ? <span>{copy.resultLabel}: {optionLabel(review.result, RESULTS, locale)}</span> : null}
        {review.interviewYear ? <span>{review.interviewYear}</span> : null}
      </div>
      {review.questions ? <p className="mt-3 text-sm leading-7 text-kx-text">{review.questions}</p> : null}
      {review.processDescription ? <p className="mt-2 text-sm leading-7 text-kx-subtle">{review.processDescription}</p> : null}
      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-kx-muted">
        {review.interviewRounds ? <span>{locale === "en" ? `${review.interviewRounds} ${copy.roundsSuffix}` : `${review.interviewRounds} ${copy.roundsSuffix}`}</span> : null}
        {review.interviewLanguage ? <span>{review.interviewLanguage}</span> : null}
        {review.city ? <span>{japanCityLabel(review.city, locale)}</span> : null}
      </div>
    </article>
  );
}

function ReviewComposer({
  companyId,
  defaultTab,
  locale,
  copy,
  isSignedIn,
  onNeedsAuth,
  onSubmitted,
  onError,
}: {
  companyId: string;
  defaultTab: ReviewTab;
  locale: Locale;
  copy: ReturnType<typeof reviewsCopy>;
  isSignedIn: boolean;
  onNeedsAuth: () => void;
  onSubmitted: (message: string) => void;
  onError: (message: string) => void;
}) {
  const [tab, setTab] = useState<ReviewTab>(defaultTab);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    position: "",
    employmentType: "正社员",
    pros: "",
    cons: "",
    overtimeLevel: "",
    foreignerSupport: "",
    salaryBenefits: "",
    careerGrowth: "",
    recommendationScore: "4",
    interviewRounds: "2",
    interviewLanguage: "日语",
    difficulty: "普通",
    questions: "",
    processDescription: "",
    result: "等待结果",
    interviewYear: String(new Date().getFullYear()),
    city: "tokyo",
  });

  const canSubmit = useMemo(() => {
    if (!form.position.trim()) return false;
    if (tab === "interview") return !!(form.questions.trim() || form.processDescription.trim());
    return !!(form.pros.trim() || form.cons.trim());
  }, [form, tab]);

  const set = (key: keyof typeof form) => (value: string) => setForm((prev) => ({ ...prev, [key]: value }));

  const submit = async () => {
    if (!isSignedIn) {
      onNeedsAuth();
      return;
    }
    if (!canSubmit || busy) return;
    setBusy(true);
    try {
      if (tab === "interview") {
        const r = await guide.submitInterviewReview({
          companyId,
          position: form.position,
          employmentType: form.employmentType,
          interviewRounds: Number(form.interviewRounds) || 0,
          interviewLanguage: form.interviewLanguage,
          difficulty: form.difficulty,
          questions: form.questions,
          processDescription: form.processDescription,
          result: form.result,
          interviewYear: Number(form.interviewYear) || 0,
          city: form.city,
          anonymous: true,
        });
        onSubmitted(r.message || copy.submittedInterview);
      } else {
        const r = await guide.submitCompanyReview({
          companyId,
          position: form.position,
          employmentType: form.employmentType,
          pros: form.pros,
          cons: form.cons,
          overtimeLevel: form.overtimeLevel,
          foreignerSupport: form.foreignerSupport,
          salaryBenefits: form.salaryBenefits,
          careerGrowth: form.careerGrowth,
          recommendationScore: Number(form.recommendationScore) || 0,
          anonymous: true,
        });
        onSubmitted(r.message || copy.submittedWork);
      }
    } catch {
      onError(copy.submitFailed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mt-3 rounded-kx-lg border border-kx-stroke/50 bg-kx-card p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button type="button" data-active={tab === "interview"} onClick={() => setTab("interview")} className="kx-tab h-8 px-3 text-xs">
          {copy.submitInterview}
        </button>
        <button type="button" data-active={tab === "work"} onClick={() => setTab("work")} className="kx-tab h-8 px-3 text-xs">
          {copy.submitWork}
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <TextInput label={copy.position} value={form.position} onChange={set("position")} placeholder={copy.positionPlaceholder} />
        <SelectInput label={copy.employmentType} value={form.employmentType} onChange={set("employmentType")} options={EMPLOYMENT_TYPES} locale={locale} />
      </div>

      {tab === "interview" ? (
        <div className="mt-3 grid gap-3">
          <div className="grid gap-3 sm:grid-cols-4">
            <TextInput label={copy.interviewRounds} value={form.interviewRounds} onChange={set("interviewRounds")} />
            <TextInput label={copy.interviewLanguage} value={form.interviewLanguage} onChange={set("interviewLanguage")} />
            <SelectInput label={copy.difficulty} value={form.difficulty} onChange={set("difficulty")} options={DIFFICULTY} locale={locale} />
            <SelectInput label={copy.result} value={form.result} onChange={set("result")} options={RESULTS} locale={locale} />
          </div>
          <TextArea label={copy.questions} value={form.questions} onChange={set("questions")} placeholder={copy.questionsPlaceholder} />
          <TextArea label={copy.process} value={form.processDescription} onChange={set("processDescription")} placeholder={copy.processPlaceholder} />
        </div>
      ) : (
        <div className="mt-3 grid gap-3">
          <TextArea label={copy.pros} value={form.pros} onChange={set("pros")} placeholder={copy.prosPlaceholder} />
          <TextArea label={copy.cons} value={form.cons} onChange={set("cons")} placeholder={copy.consPlaceholder} />
          <div className="grid gap-3 sm:grid-cols-2">
            <TextInput label={copy.overtime} value={form.overtimeLevel} onChange={set("overtimeLevel")} placeholder={copy.overtimePlaceholder} />
            <TextInput label={copy.foreignerSupport} value={form.foreignerSupport} onChange={set("foreignerSupport")} placeholder={copy.foreignerSupportPlaceholder} />
            <TextInput label={copy.salaryBenefits} value={form.salaryBenefits} onChange={set("salaryBenefits")} />
            <TextInput label={copy.careerGrowth} value={form.careerGrowth} onChange={set("careerGrowth")} />
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-kx-stroke/40 pt-3">
        <p className="text-[11px] leading-5 text-kx-muted">
          {copy.anonymousNote}
        </p>
        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit || busy}
          className="inline-flex h-10 items-center gap-1.5 rounded-full bg-kx-accent px-5 text-sm font-bold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Send className="h-4 w-4" /> {busy ? copy.submitting : copy.submitReview}
        </button>
      </div>
    </section>
  );
}

function TextInput({ label, value, onChange, placeholder = "" }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-bold text-kx-muted">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-10 w-full rounded-kx-md border border-kx-stroke/70 bg-kx-soft/40 px-3 text-sm text-kx-text outline-none transition focus:border-kx-accent"
      />
    </label>
  );
}

function SelectInput({ label, value, onChange, options, locale }: { label: string; value: string; onChange: (value: string) => void; options: LocalizedOption[]; locale: Locale }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-bold text-kx-muted">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full rounded-kx-md border border-kx-stroke/70 bg-kx-soft/40 px-3 text-sm text-kx-text outline-none transition focus:border-kx-accent"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option[lang(locale)]}</option>
        ))}
      </select>
    </label>
  );
}

function TextArea({ label, value, onChange, placeholder = "" }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-bold text-kx-muted">{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        rows={4}
        className="w-full resize-none rounded-kx-md border border-kx-stroke/70 bg-kx-soft/40 px-3 py-2 text-sm leading-6 text-kx-text outline-none transition focus:border-kx-accent"
      />
    </label>
  );
}
