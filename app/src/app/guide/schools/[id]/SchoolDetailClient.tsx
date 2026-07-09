"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Bookmark, ExternalLink, GraduationCap, PencilLine } from "lucide-react";
import { guide, guideCityLabel, type GuideSchool } from "@/lib/guide";
import {
  ArticleCard,
  GuideComingSoon,
  GuideSectionTitle,
  GuideShell,
  ProductCard,
  useGuideCountry,
} from "@/components/guide/GuideKit";
import { EmptyState, ErrorState, InlineLoading } from "@/components/design/States";
import { useAuthPrompt, useSession, useToasts } from "@/lib/store";
import { appLocaleToGuideLanguage, useI18n, type Locale } from "@/lib/i18n";
import { guideUi, schoolTypeLabel } from "@/lib/guide-ui";

/** Full detail payload from GET /api/guide/schools/:idOrSlug — also used by the
 * server component to seed React Query (SSR for SEO, UI unchanged). */
export type SchoolDetailData = Awaited<ReturnType<typeof guide.school>>;

function pick(locale: Locale, zh: string, ja: string, en: string): string {
  if (locale === "ja") return ja;
  if (locale === "en") return en;
  return zh;
}

const SUPPORT_LABELS: Array<{ key: keyof GuideSchool; zh: string; ja: string; en: string }> = [
  { key: "isAcceptingInternationalStudents", zh: "留学生可申请", ja: "留学生の応募可", en: "Open to international students" },
  { key: "hasEnglishProgram", zh: "英文项目", ja: "英語プログラム", en: "English program" },
  { key: "hasScholarship", zh: "奖学金", ja: "奨学金", en: "Scholarship" },
  { key: "hasDormitory", zh: "宿舍", ja: "寮", en: "Dormitory" },
  { key: "hasCareerSupport", zh: "就职支持", ja: "就職支援", en: "Career support" },
  { key: "hasLanguageSupport", zh: "语言支持", ja: "語学サポート", en: "Language support" },
];

export default function SchoolDetailClient({
  initialData,
  initialLanguage,
}: {
  initialData?: SchoolDetailData;
  initialLanguage?: string;
}) {
  const params = useParams();
  const id = String(params?.id || "");
  const country = useGuideCountry();
  const { locale } = useI18n();
  const language = appLocaleToGuideLanguage(locale);
  const copy = guideUi(locale);
  const user = useSession((s) => s.user);
  const openAuthPrompt = useAuthPrompt((s) => s.open);
  const pushToast = useToasts((s) => s.push);
  const [showCorrection, setShowCorrection] = useState(false);

  // Shared value word reused across the support grid and info lines.
  const tbd = pick(locale, "待补充", "未記載", "Not listed");

  // Seed the query from the server prefetch so SSR emits real content. When
  // the client language differs from the prefetch language, mark the seed as
  // stale (updatedAt 0) so React Query silently refetches in the right one.
  const q = useQuery({
    queryKey: ["guide", "school", country, language, id],
    queryFn: () => guide.school(id, country, language),
    enabled: country === "jp" && id.length > 0,
    staleTime: 60_000,
    initialData: country === "jp" ? initialData : undefined,
    initialDataUpdatedAt: initialData ? (language === initialLanguage ? Date.now() : 0) : undefined,
  });

  const save = useMutation({
    mutationFn: (on: boolean) => guide.saveSchool(id, on),
    onSuccess: () => {
      q.refetch();
      pushToast({ kind: "success", message: locale === "en" ? "Saved status updated" : locale === "ja" ? "保存状態を更新しました" : "收藏状态已更新" });
    },
    onError: () => pushToast({ kind: "error", message: locale === "en" ? "Please log in to save schools" : locale === "ja" ? "学校を保存するにはログインしてください" : "请登录后收藏学校" }),
  });

  if (country !== "jp") {
    return (
      <GuideShell back={{ href: "/guide", label: copy.back }}>
        <GuideComingSoon />
      </GuideShell>
    );
  }

  if (q.isLoading) {
    return (
      <GuideShell back={{ href: "/guide/schools", label: copy.schools.listTitle }}>
        <InlineLoading />
      </GuideShell>
    );
  }

  if (q.isError || !q.data?.school) {
    return (
      <GuideShell back={{ href: "/guide/schools", label: copy.schools.listTitle }}>
        <ErrorState
          title={locale === "en" ? "School not found" : locale === "ja" ? "学校が見つかりません" : "学校不存在"}
          subtitle={locale === "en" ? "It may have been moved or unpublished." : locale === "ja" ? "移動または非公開になった可能性があります。" : "它可能已被移动或下线。"}
          onRetry={() => q.refetch()}
        />
      </GuideShell>
    );
  }

  const school = q.data.school;
  const typeLabel = schoolTypeLabel(school.schoolType, locale);

  return (
    <GuideShell back={{ href: "/guide/schools", label: copy.schools.listTitle }}>
      <div className="px-4 py-4 sm:px-6">
        <section className="rounded-kx-lg border border-kx-stroke/50 bg-kx-card p-5">
          <div className="flex items-start gap-3">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-kx-accentSoft text-kx-accent">
              <GraduationCap className="h-6 w-6" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex flex-wrap gap-1.5">
                <span className="rounded-full bg-kx-soft px-2 py-0.5 text-[11px] font-bold text-kx-muted">{typeLabel}</span>
                <span className="rounded-full bg-kx-accentSoft px-2 py-0.5 text-[11px] font-bold text-kx-accent">{pick(locale, "仅限日本", "日本のみ", "Japan only")}</span>
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
            {school.website ? <ExternalButton href={school.website} label={pick(locale, "学校官网", "公式サイト", "Official site")} /> : null}
            {school.internationalAdmissionUrl ? <ExternalButton href={school.internationalAdmissionUrl} label={pick(locale, "留学生招生", "留学生募集", "International admissions")} /> : null}
            {school.applicationUrl ? <ExternalButton href={school.applicationUrl} label={pick(locale, "申请入口", "出願ページ", "Apply")} /> : null}
            {school.scholarshipUrl ? <ExternalButton href={school.scholarshipUrl} label={pick(locale, "奖学金", "奨学金", "Scholarship")} /> : null}
            {school.careerSupportUrl ? <ExternalButton href={school.careerSupportUrl} label={pick(locale, "就职支持", "就職支援", "Career support")} /> : null}
            {school.languageSupportUrl ? <ExternalButton href={school.languageSupportUrl} label={pick(locale, "语言支持", "語学サポート", "Language support")} /> : null}
            {school.dormitoryUrl ? <ExternalButton href={school.dormitoryUrl} label={pick(locale, "宿舍", "寮", "Dormitory")} /> : null}
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
              <Bookmark className="h-4 w-4" /> {school.savedByMe ? (locale === "en" ? "Saved" : locale === "ja" ? "保存済み" : "已收藏") : (locale === "en" ? "Save school" : locale === "ja" ? "学校を保存" : "收藏学校")}
            </button>
            <button
              type="button"
              onClick={() => {
                if (!user) return openAuthPrompt("generic");
                setShowCorrection((v) => !v);
              }}
              className="inline-flex h-10 items-center gap-1.5 rounded-full border border-kx-stroke/60 px-4 text-sm font-semibold text-kx-text hover:border-kx-accent/50 hover:text-kx-accent"
            >
              <PencilLine className="h-4 w-4" /> {locale === "en" ? "Suggest a correction" : locale === "ja" ? "修正・補足を送る" : "纠错 / 补充信息"}
            </button>
          </div>
        </section>

        {showCorrection ? (
          <CorrectionBox
            targetType="school"
            targetId={school.id}
            onDone={() => {
              setShowCorrection(false);
              pushToast({ kind: "success", message: locale === "en" ? "Submitted for admin review" : locale === "ja" ? "管理者レビューに送信しました" : "已提交给管理员审核" });
            }}
          />
        ) : null}

        <section className="mt-3 rounded-kx-lg border border-kx-stroke/50 bg-kx-card p-5">
          <GuideSectionTitle
            title={pick(locale, "留学生支持", "留学生サポート", "Support for international students")}
            subtitle={pick(locale, "未知项会保持空白，不强行推断", "不明な項目は空欄のままにし、無理に推測しません", "Unknown items are left blank rather than guessed")}
          />
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {SUPPORT_LABELS.map((support) => {
              const value = school[support.key];
              return (
                <div key={support.key} className="rounded-kx-md bg-kx-soft/70 px-3 py-2">
                  <p className="text-xs font-bold text-kx-muted">{pick(locale, support.zh, support.ja, support.en)}</p>
                  <p className="mt-0.5 text-sm font-black text-kx-text">{value === true ? pick(locale, "有", "あり", "Yes") : value === false ? pick(locale, "未确认支持", "未確認", "Not confirmed") : tbd}</p>
                </div>
              );
            })}
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <InfoLine label={pick(locale, "地址", "住所", "Address")} value={[school.postalCode, school.prefecture, school.city, school.ward, school.address].filter(Boolean).join(" ") || tbd} />
            <InfoLine label={pick(locale, "语言要求", "言語要件", "Language requirements")} value={`${pick(locale, "日语", "日本語", "Japanese")} ${unknownLabel(locale, school.requiredJapaneseLevel)} / ${pick(locale, "英语", "英語", "English")} ${unknownLabel(locale, school.requiredEnglishLevel)}`} />
            <InfoLine label={pick(locale, "考试要求", "試験要件", "Exam requirements")} value={`JLPT ${unknownLabel(locale, school.jlptRequired)} / EJU ${unknownLabel(locale, school.ejuRequired)} / TOEFL ${unknownLabel(locale, school.toeflRequired)} / IELTS ${unknownLabel(locale, school.ieltsRequired)}`} />
            <InfoLine label={pick(locale, "学费范围", "学費レンジ", "Tuition range")} value={school.tuitionMin || school.tuitionMax ? `${school.currency} ${school.tuitionMin || "-"} - ${school.tuitionMax || "-"}` : tbd} />
            <InfoLine label={pick(locale, "入学月份", "入学月", "Enrollment months")} value={school.admissionMonths.length ? school.admissionMonths.join(" / ") : tbd} />
            <InfoLine label={pick(locale, "数据完整度", "データ完全度", "Data completeness")} value={`${school.dataQualityScore ?? 0} / 100`} />
            <InfoLine label={pick(locale, "最后核验", "最終確認", "Last verified")} value={school.sourceLastCheckedAt || tbd} />
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
              <InfoLine label={pick(locale, "学部", "学部", "Faculties")} value={school.faculties?.length ? school.faculties.join(" / ") : tbd} />
              <InfoLine label={pick(locale, "研究科", "研究科", "Graduate schools")} value={school.graduateSchools?.length ? school.graduateSchools.join(" / ") : tbd} />
              <InfoLine label={pick(locale, "部门", "学科", "Departments")} value={school.departments.length ? school.departments.join(" / ") : tbd} />
            </div>
          ) : null}
        </section>

        <section className="mt-5">
          <GuideSectionTitle
            title={pick(locale, "专业 / 项目", "専攻・プログラム", "Programs")}
            subtitle={pick(locale, "由管理员按官方资料逐步补充", "管理者が公式資料に基づき順次追記します", "Added gradually by editors from official sources")}
          />
          {q.data.programs.length ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {q.data.programs.map((program) => (
                <article key={program.id} className="rounded-kx-lg border border-kx-stroke/50 bg-kx-card p-4">
                  <h3 className="font-black text-kx-text">{program.programName}</h3>
                  <p className="mt-1 text-xs text-kx-muted">{program.degreeLevel} · {program.field || pick(locale, "领域待补充", "分野は未記載", "Field not listed")}</p>
                  <p className="mt-2 text-sm leading-6 text-kx-subtle">{program.description || pick(locale, "项目介绍待管理员根据官方资料补充。", "プログラム概要は公式資料に基づき管理者が追記します。", "Program details will be added by an editor from official sources.")}</p>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState
              title={pick(locale, "项目资料待补充", "プログラム情報は準備中", "Programs not listed yet")}
              subtitle={pick(locale, "请先以学校官网和招生简章为准。", "まずは学校の公式サイトと募集要項をご確認ください。", "Refer to the school's official site and admission guidelines first.")}
            />
          )}
        </section>

        <section className="mt-5">
          <GuideSectionTitle
            title={pick(locale, "申请信息", "出願情報", "Admissions")}
            subtitle={pick(locale, "出愿时间、材料和选考方式", "出願時期、必要書類、選考方法", "Application periods, documents, and selection")}
          />
          {q.data.admissions.length ? (
            <div className="space-y-3">
              {q.data.admissions.map((admission) => (
                <article key={admission.id} className="rounded-kx-lg border border-kx-stroke/50 bg-kx-card p-4">
                  <h3 className="font-black text-kx-text">{admission.admissionType}</h3>
                  <p className="mt-1 text-xs text-kx-muted">{pick(locale, "入学月份：", "入学月：", "Enrollment month: ")}{admission.enrollmentMonth || tbd}</p>
                  {admission.requiredDocuments.length ? (
                    <p className="mt-2 text-sm leading-6 text-kx-subtle">{pick(locale, "材料：", "必要書類：", "Documents: ")}{admission.requiredDocuments.join(" / ")}</p>
                  ) : null}
                </article>
              ))}
            </div>
          ) : (
            <EmptyState
              title={pick(locale, "申请信息待补充", "出願情報は準備中", "Admissions not listed yet")}
              subtitle={pick(locale, "申请前请直接确认学校官网和最新募集要项。", "出願前に学校の公式サイトと最新の募集要項を直接ご確認ください。", "Before applying, check the school's official site and the latest admission guidelines directly.")}
            />
          )}
        </section>

        {q.data.relatedArticles.length ? (
          <section className="mt-5">
            <GuideSectionTitle title={pick(locale, "相关指南", "関連ガイド", "Related guides")} />
            <div className="grid gap-3 sm:grid-cols-2">
              {q.data.relatedArticles.map((article) => <ArticleCard key={article.id} article={article} compact />)}
            </div>
          </section>
        ) : null}

        {q.data.relatedProducts.length ? (
          <section className="mt-5">
            <GuideSectionTitle title={pick(locale, "相关资料与服务", "関連する資料とサービス", "Related resources and services")} />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {q.data.relatedProducts.map((product) => <ProductCard key={product.id} product={product} />)}
            </div>
          </section>
        ) : null}

        <section className="mt-5 rounded-kx-lg border border-kx-stroke/50 bg-kx-card p-4">
          <GuideSectionTitle
            title={pick(locale, "数据来源", "データソース", "Data sources")}
            subtitle={pick(locale, "不确定信息不会被强行推断", "不確かな情報は無理に推測しません", "Uncertain information is never guessed")}
          />
          <div className="grid gap-2 sm:grid-cols-2">
            <InfoLine label={pick(locale, "来源名称", "情報ソース名", "Source name")} value={school.sourceName || tbd} />
            <InfoLine label={pick(locale, "核验状态", "確認ステータス", "Verification status")} value={school.verificationStatus || "needs_review"} />
            <InfoLine label={pick(locale, "来源链接", "情報ソースURL", "Source URL")} value={school.sourceUrl || tbd} />
            <InfoLine label={pick(locale, "最后检查", "最終確認", "Last checked")} value={school.sourceLastCheckedAt || tbd} />
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

function unknownLabel(locale: Locale, value?: string) {
  return value && value !== "unknown" ? value : pick(locale, "待补充", "未記載", "Not listed");
}

function CorrectionBox({ targetType, targetId, onDone }: { targetType: string; targetId: string; onDone: () => void }) {
  const { locale } = useI18n();
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
      pushToast({ kind: "error", message: pick(locale, "提交失败，请稍后再试", "送信に失敗しました。しばらくしてからお試しください。", "Submission failed. Please try again later.") });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mt-3 rounded-kx-lg border border-kx-stroke/50 bg-kx-card p-4">
      <h2 className="text-base font-black text-kx-text">{pick(locale, "纠错 / 补充信息", "修正・補足", "Suggest a correction")}</h2>
      <textarea
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        rows={4}
        placeholder={pick(locale, "说明需要修正或补充的内容。", "修正または補足したい内容をご記入ください。", "Describe what should be corrected or added.")}
        className="mt-3 w-full resize-none rounded-kx-md border border-kx-stroke/70 bg-kx-soft/40 px-3 py-2 text-sm leading-6 text-kx-text outline-none focus:border-kx-accent"
      />
      <input
        value={sourceUrl}
        onChange={(event) => setSourceUrl(event.target.value)}
        placeholder={pick(locale, "可选：官方来源链接", "任意：公式ソースのURL", "Optional: official source link")}
        className="mt-2 h-10 w-full rounded-kx-md border border-kx-stroke/70 bg-kx-soft/40 px-3 text-sm text-kx-text outline-none focus:border-kx-accent"
      />
      <div className="mt-3 flex justify-end">
        <button type="button" onClick={submit} disabled={!canSubmit || busy} className="kx-button-primary h-10 px-5 text-sm disabled:opacity-50">
          {busy ? pick(locale, "提交中", "送信中", "Submitting") : pick(locale, "提交审核", "確認に送信", "Submit for review")}
        </button>
      </div>
    </section>
  );
}
