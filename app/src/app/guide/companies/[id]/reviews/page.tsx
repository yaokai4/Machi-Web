"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Building2, MessageSquarePlus, Send } from "lucide-react";
import {
  guide,
  guideCityLabel,
  type GuideCompanyReview,
  type GuideInterviewReview,
} from "@/lib/guide";
import { GuideComingSoon, GuideShell, useGuideCountry } from "@/components/guide/GuideKit";
import { EmptyState, ErrorState, InlineLoading } from "@/components/design/States";
import { useAuthPrompt, useSession, useToasts } from "@/lib/store";

type ReviewTab = "interview" | "work";

const EMPLOYMENT_TYPES = ["正社员", "契约社员", "派遣", "实习", "兼职", "新卒", "中途"];
const DIFFICULTY = ["普通", "偏简单", "偏难", "压力较大"];
const RESULTS = ["通过", "未通过", "等待结果", "辞退/未继续"];

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

  useEffect(() => {
    if (searchParams.get("compose") === "1") setShowForm(true);
  }, [searchParams]);

  const company = useQuery({
    queryKey: ["guide", "company", country, id],
    queryFn: () => guide.company(id, country),
    enabled: country === "jp" && id.length > 0,
    staleTime: 60_000,
  });
  const reviews = useQuery({
    queryKey: ["guide", "company-reviews", country, id],
    queryFn: () => guide.companyReviews(id, country),
    enabled: country === "jp" && id.length > 0,
    staleTime: 30_000,
  });

  if (country !== "jp") {
    return (
      <GuideShell back={{ href: "/guide", label: "日本指南" }}>
        <GuideComingSoon />
      </GuideShell>
    );
  }

  if (company.isLoading || reviews.isLoading) {
    return (
      <GuideShell back={{ href: `/guide/companies/${id}`, label: "公司详情" }}>
        <InlineLoading />
      </GuideShell>
    );
  }

  if (company.isError || reviews.isError || !company.data?.company || !reviews.data) {
    return (
      <GuideShell back={{ href: `/guide/companies/${id}`, label: "公司详情" }}>
        <ErrorState title="评论暂时无法加载" subtitle="请稍后再试。" onRetry={() => { company.refetch(); reviews.refetch(); }} />
      </GuideShell>
    );
  }

  const c = company.data.company;
  const workReviews = reviews.data.workReviews || [];
  const interviewReviews = reviews.data.interviewReviews || [];
  const activeItems = activeTab === "interview" ? interviewReviews : workReviews;

  return (
    <GuideShell back={{ href: `/guide/companies/${c.slug || c.id}`, label: "公司详情" }}>
      <div className="px-4 py-4 sm:px-6">
        <header className="rounded-kx-lg border border-kx-stroke/50 bg-kx-card p-5">
          <div className="flex items-start gap-3">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-kx-accentSoft text-kx-accent">
              <Building2 className="h-6 w-6" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-kx-accent">外国人就职公司库</p>
              <h1 className="mt-1 text-xl font-black leading-tight text-kx-text sm:text-2xl">{c.companyName}</h1>
              <p className="mt-1 text-xs text-kx-muted">
                {c.industry || "公司"} · {guideCityLabel(c.city)} · 经审核后展示真实用户提交
              </p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button type="button" data-active={activeTab === "interview"} onClick={() => setActiveTab("interview")} className="kx-tab h-9 px-4 text-xs">
              面试评论 {interviewReviews.length}
            </button>
            <button type="button" data-active={activeTab === "work"} onClick={() => setActiveTab("work")} className="kx-tab h-9 px-4 text-xs">
              工作评价 {workReviews.length}
            </button>
            <button
              type="button"
              onClick={() => setShowForm((v) => !v)}
              className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-full bg-kx-accent px-4 text-xs font-bold text-white shadow-sm hover:opacity-95"
            >
              <MessageSquarePlus className="h-3.5 w-3.5" /> 写评论
            </button>
          </div>
        </header>

        {showForm ? (
          <ReviewComposer
            companyId={c.slug || c.id}
            defaultTab={activeTab}
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
              title={activeTab === "interview" ? "还没有面试评论" : "还没有工作评价"}
              subtitle="所有评论都需要审核后展示。不会预填或伪造用户内容。"
            />
          ) : activeTab === "interview" ? (
            interviewReviews.map((item) => <InterviewReviewCard key={item.id} review={item} />)
          ) : (
            workReviews.map((item) => <WorkReviewCard key={item.id} review={item} />)
          )}
        </section>

        {reviews.data.disclaimer ? (
          <p className="mt-4 text-[11px] leading-5 text-kx-muted">{reviews.data.disclaimer}</p>
        ) : null}
      </div>
    </GuideShell>
  );
}

function WorkReviewCard({ review }: { review: GuideCompanyReview }) {
  return (
    <article className="rounded-kx-lg border border-kx-stroke/50 bg-kx-card p-4">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-bold text-kx-muted">
        {review.position ? <span className="rounded-full bg-kx-accentSoft px-2 py-0.5 text-kx-accent">{review.position}</span> : null}
        {review.employmentType ? <span>{review.employmentType}</span> : null}
        {review.recommendationScore ? <span>推荐度 {review.recommendationScore.toFixed(1)}/5</span> : null}
      </div>
      {review.pros ? <p className="mt-3 text-sm leading-7 text-kx-text">{review.pros}</p> : null}
      {review.cons ? <p className="mt-2 text-sm leading-7 text-kx-subtle">需要留意：{review.cons}</p> : null}
      <div className="mt-3 grid gap-2 text-xs text-kx-muted sm:grid-cols-2">
        {review.overtimeLevel ? <span>加班：{review.overtimeLevel}</span> : null}
        {review.foreignerSupport ? <span>外国人支持：{review.foreignerSupport}</span> : null}
        {review.salaryBenefits ? <span>薪资福利：{review.salaryBenefits}</span> : null}
        {review.careerGrowth ? <span>成长空间：{review.careerGrowth}</span> : null}
      </div>
    </article>
  );
}

function InterviewReviewCard({ review }: { review: GuideInterviewReview }) {
  return (
    <article className="rounded-kx-lg border border-kx-stroke/50 bg-kx-card p-4">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-bold text-kx-muted">
        {review.position ? <span className="rounded-full bg-kx-accentSoft px-2 py-0.5 text-kx-accent">{review.position}</span> : null}
        {review.employmentType ? <span>{review.employmentType}</span> : null}
        {review.difficulty ? <span>难度：{review.difficulty}</span> : null}
        {review.result ? <span>结果：{review.result}</span> : null}
        {review.interviewYear ? <span>{review.interviewYear}</span> : null}
      </div>
      {review.questions ? <p className="mt-3 text-sm leading-7 text-kx-text">{review.questions}</p> : null}
      {review.processDescription ? <p className="mt-2 text-sm leading-7 text-kx-subtle">{review.processDescription}</p> : null}
      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-kx-muted">
        {review.interviewRounds ? <span>{review.interviewRounds} 轮面试</span> : null}
        {review.interviewLanguage ? <span>{review.interviewLanguage}</span> : null}
        {review.city ? <span>{guideCityLabel(review.city)}</span> : null}
      </div>
    </article>
  );
}

function ReviewComposer({
  companyId,
  defaultTab,
  isSignedIn,
  onNeedsAuth,
  onSubmitted,
  onError,
}: {
  companyId: string;
  defaultTab: ReviewTab;
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
        onSubmitted(r.message || "面试经验已提交，将在审核通过后展示。");
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
        onSubmitted(r.message || "已提交，将在审核通过后展示。");
      }
    } catch {
      onError("提交失败，请稍后再试。");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mt-3 rounded-kx-lg border border-kx-stroke/50 bg-kx-card p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button type="button" data-active={tab === "interview"} onClick={() => setTab("interview")} className="kx-tab h-8 px-3 text-xs">
          写面试评论
        </button>
        <button type="button" data-active={tab === "work"} onClick={() => setTab("work")} className="kx-tab h-8 px-3 text-xs">
          写工作评价
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <TextInput label="岗位/职种" value={form.position} onChange={set("position")} placeholder="例：软件工程师 / 综合职" />
        <SelectInput label="雇佣类型" value={form.employmentType} onChange={set("employmentType")} options={EMPLOYMENT_TYPES} />
      </div>

      {tab === "interview" ? (
        <div className="mt-3 grid gap-3">
          <div className="grid gap-3 sm:grid-cols-4">
            <TextInput label="面试轮数" value={form.interviewRounds} onChange={set("interviewRounds")} />
            <TextInput label="面试语言" value={form.interviewLanguage} onChange={set("interviewLanguage")} />
            <SelectInput label="难度" value={form.difficulty} onChange={set("difficulty")} options={DIFFICULTY} />
            <SelectInput label="结果" value={form.result} onChange={set("result")} options={RESULTS} />
          </div>
          <TextArea label="面试问题" value={form.questions} onChange={set("questions")} placeholder="写你被问到的问题、题型或准备建议。" />
          <TextArea label="流程说明" value={form.processDescription} onChange={set("processDescription")} placeholder="例：书类选考、一次面试、最终面试、等待多久收到结果。" />
        </div>
      ) : (
        <div className="mt-3 grid gap-3">
          <TextArea label="优点" value={form.pros} onChange={set("pros")} placeholder="写工作环境、培养制度、团队氛围等真实体验。" />
          <TextArea label="需要留意" value={form.cons} onChange={set("cons")} placeholder="写加班、沟通、制度等需要后来者注意的地方，避免个人隐私和未经证实指控。" />
          <div className="grid gap-3 sm:grid-cols-2">
            <TextInput label="加班情况" value={form.overtimeLevel} onChange={set("overtimeLevel")} placeholder="例：项目期较忙 / 基本准点" />
            <TextInput label="外国人支持" value={form.foreignerSupport} onChange={set("foreignerSupport")} placeholder="例：签证支持明确" />
            <TextInput label="薪资福利" value={form.salaryBenefits} onChange={set("salaryBenefits")} />
            <TextInput label="成长空间" value={form.careerGrowth} onChange={set("careerGrowth")} />
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-kx-stroke/40 pt-3">
        <p className="text-[11px] leading-5 text-kx-muted">
          默认匿名提交，审核通过后展示。请勿填写个人隐私、联系方式或无法核实的指控。
        </p>
        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit || busy}
          className="inline-flex h-10 items-center gap-1.5 rounded-full bg-kx-accent px-5 text-sm font-bold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Send className="h-4 w-4" /> {busy ? "提交中" : "提交审核"}
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

function SelectInput({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[] }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-bold text-kx-muted">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full rounded-kx-md border border-kx-stroke/70 bg-kx-soft/40 px-3 text-sm text-kx-text outline-none transition focus:border-kx-accent"
      >
        {options.map((option) => (
          <option key={option} value={option}>{option}</option>
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
