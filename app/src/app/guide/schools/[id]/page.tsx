"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Bookmark, ExternalLink, GraduationCap, PencilLine } from "lucide-react";
import { guide, guideCityLabel, type GuideSchool } from "@/lib/guide";
import {
  GUIDE_SCHOOL_TYPE_LABELS,
  ArticleCard,
  GuideComingSoon,
  GuideSectionTitle,
  GuideShell,
  ProductCard,
  useGuideCountry,
} from "@/components/guide/GuideKit";
import { EmptyState, ErrorState, InlineLoading } from "@/components/design/States";
import { useAuthPrompt, useSession, useToasts } from "@/lib/store";

const SUPPORT_LABELS: Array<{ key: keyof GuideSchool; label: string }> = [
  { key: "isAcceptingInternationalStudents", label: "留学生可申请" },
  { key: "hasEnglishProgram", label: "英文项目" },
  { key: "hasScholarship", label: "奖学金" },
  { key: "hasDormitory", label: "宿舍" },
  { key: "hasCareerSupport", label: "就职支持" },
  { key: "hasLanguageSupport", label: "语言支持" },
];

export default function GuideSchoolDetailPage() {
  const params = useParams();
  const id = String(params?.id || "");
  const country = useGuideCountry();
  const user = useSession((s) => s.user);
  const openAuthPrompt = useAuthPrompt((s) => s.open);
  const pushToast = useToasts((s) => s.push);
  const [showCorrection, setShowCorrection] = useState(false);

  const q = useQuery({
    queryKey: ["guide", "school", country, id],
    queryFn: () => guide.school(id, country),
    enabled: country === "jp" && id.length > 0,
    staleTime: 60_000,
  });

  const save = useMutation({
    mutationFn: (on: boolean) => guide.saveSchool(id, on),
    onSuccess: () => {
      q.refetch();
      pushToast({ kind: "success", message: "收藏状态已更新" });
    },
    onError: () => pushToast({ kind: "error", message: "请登录后收藏学校" }),
  });

  if (country !== "jp") {
    return (
      <GuideShell back={{ href: "/guide", label: "日本指南" }}>
        <GuideComingSoon />
      </GuideShell>
    );
  }

  if (q.isLoading) {
    return (
      <GuideShell back={{ href: "/guide/schools", label: "学校列表" }}>
        <InlineLoading />
      </GuideShell>
    );
  }

  if (q.isError || !q.data?.school) {
    return (
      <GuideShell back={{ href: "/guide/schools", label: "学校列表" }}>
        <ErrorState title="学校不存在" subtitle="它可能已被移动或下线。" onRetry={() => q.refetch()} />
      </GuideShell>
    );
  }

  const school = q.data.school;
  const typeLabel = GUIDE_SCHOOL_TYPE_LABELS[school.schoolType] || "学校";

  return (
    <GuideShell back={{ href: "/guide/schools", label: "学校列表" }}>
      <div className="px-4 py-4 sm:px-6">
        <section className="rounded-kx-lg border border-kx-stroke/50 bg-kx-card p-5">
          <div className="flex items-start gap-3">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-kx-accentSoft text-kx-accent">
              <GraduationCap className="h-6 w-6" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex flex-wrap gap-1.5">
                <span className="rounded-full bg-kx-soft px-2 py-0.5 text-[11px] font-bold text-kx-muted">{typeLabel}</span>
                <span className="rounded-full bg-kx-accentSoft px-2 py-0.5 text-[11px] font-bold text-kx-accent">Japan only</span>
              </div>
              <h1 className="text-xl font-black leading-tight text-kx-text sm:text-2xl">{school.schoolName}</h1>
              <p className="mt-0.5 text-sm text-kx-muted">{school.schoolNameJp || school.schoolNameEn}</p>
              <p className="mt-1.5 text-xs text-kx-muted">
                {school.prefecture || guideCityLabel(school.city)} · {guideCityLabel(school.city)}
                {school.ward ? ` · ${school.ward}` : ""}
              </p>
            </div>
          </div>

          <p className="mt-4 text-[15px] leading-7 text-kx-subtle">{school.description}</p>

          <div className="mt-4 flex flex-wrap gap-2">
            {school.website ? <ExternalButton href={school.website} label="学校官网" /> : null}
            {school.internationalAdmissionUrl ? <ExternalButton href={school.internationalAdmissionUrl} label="留学生招生" /> : null}
            {school.applicationUrl ? <ExternalButton href={school.applicationUrl} label="申请入口" /> : null}
            {school.scholarshipUrl ? <ExternalButton href={school.scholarshipUrl} label="奖学金" /> : null}
            {school.careerSupportUrl ? <ExternalButton href={school.careerSupportUrl} label="就职支持" /> : null}
            {school.languageSupportUrl ? <ExternalButton href={school.languageSupportUrl} label="语言支持" /> : null}
            {school.dormitoryUrl ? <ExternalButton href={school.dormitoryUrl} label="宿舍" /> : null}
          </div>

          <div className="mt-4 flex flex-wrap gap-2 border-t border-kx-stroke/40 pt-4">
            <button
              type="button"
              onClick={() => {
                if (!user) return openAuthPrompt("generic");
                save.mutate(!school.savedByMe);
              }}
              className="inline-flex h-10 items-center gap-1.5 rounded-full bg-kx-accent px-4 text-sm font-bold text-white shadow-sm disabled:opacity-60"
              disabled={save.isPending}
            >
              <Bookmark className="h-4 w-4" /> {school.savedByMe ? "已收藏" : "收藏学校"}
            </button>
            <button
              type="button"
              onClick={() => {
                if (!user) return openAuthPrompt("generic");
                setShowCorrection((v) => !v);
              }}
              className="inline-flex h-10 items-center gap-1.5 rounded-full border border-kx-stroke/60 px-4 text-sm font-semibold text-kx-text hover:border-kx-accent/50 hover:text-kx-accent"
            >
              <PencilLine className="h-4 w-4" /> 纠错 / 补充信息
            </button>
          </div>
        </section>

        {showCorrection ? (
          <CorrectionBox
            targetType="school"
            targetId={school.id}
            onDone={() => {
              setShowCorrection(false);
              pushToast({ kind: "success", message: "已提交给管理员审核" });
            }}
          />
        ) : null}

        <section className="mt-3 rounded-kx-lg border border-kx-stroke/50 bg-kx-card p-5">
          <GuideSectionTitle title="留学生支持" subtitle="未知项会保持空白，不强行推断" />
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {SUPPORT_LABELS.map(({ key, label }) => {
              const value = school[key];
              return (
                <div key={key} className="rounded-kx-md bg-kx-soft/70 px-3 py-2">
                  <p className="text-xs font-bold text-kx-muted">{label}</p>
                  <p className="mt-0.5 text-sm font-black text-kx-text">{value === true ? "有" : value === false ? "未确认支持" : "待补充"}</p>
                </div>
              );
            })}
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <InfoLine label="地址" value={[school.postalCode, school.prefecture, school.city, school.ward, school.address].filter(Boolean).join(" ") || "待补充"} />
            <InfoLine label="语言要求" value={`日语 ${unknownLabel(school.requiredJapaneseLevel)} / 英语 ${unknownLabel(school.requiredEnglishLevel)}`} />
            <InfoLine label="考试要求" value={`JLPT ${unknownLabel(school.jlptRequired)} / EJU ${unknownLabel(school.ejuRequired)} / TOEFL ${unknownLabel(school.toeflRequired)} / IELTS ${unknownLabel(school.ieltsRequired)}`} />
            <InfoLine label="学费范围" value={school.tuitionMin || school.tuitionMax ? `${school.currency} ${school.tuitionMin || "-"} - ${school.tuitionMax || "-"}` : "待补充"} />
            <InfoLine label="入学月份" value={school.admissionMonths.length ? school.admissionMonths.join(" / ") : "待补充"} />
            <InfoLine label="数据完整度" value={`${school.dataQualityScore ?? 0} / 100`} />
            <InfoLine label="最后核验" value={school.sourceLastCheckedAt || "待补充"} />
          </div>
          {school.fieldsOfStudy.length ? (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {school.fieldsOfStudy.map((field) => (
                <span key={field} className="rounded-full bg-kx-soft px-2 py-0.5 text-[11px] text-kx-muted">{field}</span>
              ))}
            </div>
          ) : null}
          {(school.faculties?.length || school.graduateSchools?.length || school.departments.length) ? (
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              <InfoLine label="学部" value={school.faculties?.length ? school.faculties.join(" / ") : "待补充"} />
              <InfoLine label="研究科" value={school.graduateSchools?.length ? school.graduateSchools.join(" / ") : "待补充"} />
              <InfoLine label="部门" value={school.departments.length ? school.departments.join(" / ") : "待补充"} />
            </div>
          ) : null}
        </section>

        <section className="mt-5">
          <GuideSectionTitle title="专业 / 项目" subtitle="由管理员按官方资料逐步补充" />
          {q.data.programs.length ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {q.data.programs.map((program) => (
                <article key={program.id} className="rounded-kx-lg border border-kx-stroke/50 bg-kx-card p-4">
                  <h3 className="font-black text-kx-text">{program.programName}</h3>
                  <p className="mt-1 text-xs text-kx-muted">{program.degreeLevel} · {program.field || "领域待补充"}</p>
                  <p className="mt-2 text-sm leading-6 text-kx-subtle">{program.description || "项目介绍待管理员根据官方资料补充。"}</p>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState title="项目资料待补充" subtitle="请先以学校官网和招生简章为准。" />
          )}
        </section>

        <section className="mt-5">
          <GuideSectionTitle title="申请信息" subtitle="出愿时间、材料和选考方式" />
          {q.data.admissions.length ? (
            <div className="space-y-3">
              {q.data.admissions.map((admission) => (
                <article key={admission.id} className="rounded-kx-lg border border-kx-stroke/50 bg-kx-card p-4">
                  <h3 className="font-black text-kx-text">{admission.admissionType}</h3>
                  <p className="mt-1 text-xs text-kx-muted">入学月份：{admission.enrollmentMonth || "待补充"}</p>
                  {admission.requiredDocuments.length ? (
                    <p className="mt-2 text-sm leading-6 text-kx-subtle">材料：{admission.requiredDocuments.join(" / ")}</p>
                  ) : null}
                </article>
              ))}
            </div>
          ) : (
            <EmptyState title="申请信息待补充" subtitle="申请前请直接确认学校官网和最新募集要项。" />
          )}
        </section>

        {q.data.relatedArticles.length ? (
          <section className="mt-5">
            <GuideSectionTitle title="相关指南" />
            <div className="grid gap-3 sm:grid-cols-2">
              {q.data.relatedArticles.map((article) => <ArticleCard key={article.id} article={article} compact />)}
            </div>
          </section>
        ) : null}

        {q.data.relatedProducts.length ? (
          <section className="mt-5">
            <GuideSectionTitle title="相关资料与服务" />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {q.data.relatedProducts.map((product) => <ProductCard key={product.id} product={product} />)}
            </div>
          </section>
        ) : null}

        <section className="mt-5 rounded-kx-lg border border-kx-stroke/50 bg-kx-card p-4">
          <GuideSectionTitle title="数据来源" subtitle="不确定信息不会被强行推断" />
          <div className="grid gap-2 sm:grid-cols-2">
            <InfoLine label="来源名称" value={school.sourceName || "待补充"} />
            <InfoLine label="核验状态" value={school.verificationStatus || "needs_review"} />
            <InfoLine label="来源链接" value={school.sourceUrl || "待补充"} />
            <InfoLine label="最后检查" value={school.sourceLastCheckedAt || "待补充"} />
          </div>
          <p className="mt-3 text-[11px] leading-5 text-kx-muted">{q.data.disclaimer}</p>
        </section>
      </div>
    </GuideShell>
  );
}

function ExternalButton({ href, label }: { href: string; label: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-full border border-kx-stroke/60 px-3 text-xs font-bold text-kx-text hover:border-kx-accent/50 hover:text-kx-accent">
      {label} <ExternalLink className="h-3.5 w-3.5" />
    </a>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-kx-md bg-kx-soft/60 px-3 py-2">
      <p className="text-xs font-bold text-kx-muted">{label}</p>
      <p className="mt-0.5 text-sm text-kx-text">{value}</p>
    </div>
  );
}

function unknownLabel(value?: string) {
  return value && value !== "unknown" ? value : "待补充";
}

function CorrectionBox({ targetType, targetId, onDone }: { targetType: string; targetId: string; onDone: () => void }) {
  const [message, setMessage] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const pushToast = useToasts((s) => s.push);
  const canSubmit = message.trim().length > 0;

  const submit = async () => {
    if (!canSubmit || busy) return;
    setBusy(true);
    try {
      await guide.submitCorrection({ targetType, targetId, message, sourceUrl });
      onDone();
    } catch {
      pushToast({ kind: "error", message: "提交失败，请稍后再试" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mt-3 rounded-kx-lg border border-kx-stroke/50 bg-kx-card p-4">
      <h2 className="text-base font-black text-kx-text">纠错 / 补充信息</h2>
      <textarea
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        rows={4}
        placeholder="说明需要修正或补充的内容。"
        className="mt-3 w-full resize-none rounded-kx-md border border-kx-stroke/70 bg-kx-soft/40 px-3 py-2 text-sm leading-6 text-kx-text outline-none focus:border-kx-accent"
      />
      <input
        value={sourceUrl}
        onChange={(event) => setSourceUrl(event.target.value)}
        placeholder="可选：官方来源链接"
        className="mt-2 h-10 w-full rounded-kx-md border border-kx-stroke/70 bg-kx-soft/40 px-3 text-sm text-kx-text outline-none focus:border-kx-accent"
      />
      <div className="mt-3 flex justify-end">
        <button type="button" onClick={submit} disabled={!canSubmit || busy} className="kx-button-primary h-10 px-5 text-sm disabled:opacity-50">
          {busy ? "提交中" : "提交审核"}
        </button>
      </div>
    </section>
  );
}
