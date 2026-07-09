"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Bookmark, Building2, ExternalLink, MessageSquarePlus, PencilLine } from "lucide-react";
import { guide, guideCityLabel, type GuideCompany, type GuideCompanyScores } from "@/lib/guide";
import { ArticleCard, GuideComingSoon, GuideSectionTitle, GuideShell, useGuideCountry } from "@/components/guide/GuideKit";
import { EmptyState, ErrorState, InlineLoading } from "@/components/design/States";
import { useAuthPrompt, useSession, useToasts } from "@/lib/store";
import { appLocaleToGuideLanguage, useI18n, type Locale } from "@/lib/i18n";
import { companySizeLabel, guideUi, industryLabel } from "@/lib/guide-ui";

/** Full detail payload from GET /api/guide/companies/:idOrSlug — also used by
 * the server component to seed React Query (SSR for SEO, UI unchanged). */
export type CompanyDetailData = Awaited<ReturnType<typeof guide.company>>;

function pick(locale: Locale, zh: string, ja: string, en: string): string {
  if (locale === "ja") return ja;
  if (locale === "en") return en;
  return zh;
}

const SCORE_LABELS: Array<{ key: keyof GuideCompanyScores; zh: string; ja: string; en: string }> = [
  { key: "foreignerFriendly", zh: "外国人友好度", ja: "外国人フレンドリー度", en: "Foreigner-friendly" },
  { key: "visaSupport", zh: "签证支持度", ja: "ビザサポート", en: "Visa support" },
  { key: "interviewDifficulty", zh: "面试难度", ja: "面接の難易度", en: "Interview difficulty" },
  { key: "overtime", zh: "加班情况", ja: "残業状況", en: "Overtime" },
  { key: "salaryBenefit", zh: "薪资福利", ja: "給与・待遇", en: "Salary & benefits" },
  { key: "workLifeBalance", zh: "工作生活平衡", ja: "ワークライフバランス", en: "Work-life balance" },
  { key: "careerGrowth", zh: "成长空间", ja: "成長機会", en: "Career growth" },
];

const FACTS: Array<{ key: keyof GuideCompany; zh: string; ja: string; en: string }> = [
  { key: "acceptsForeignApplicants", zh: "接受外国人", ja: "外国人応募可", en: "Accepts foreign applicants" },
  { key: "supportsWorkVisa", zh: "签证支持", ja: "ビザサポート", en: "Visa support" },
  { key: "hasEnglishPositions", zh: "英文岗位", ja: "英語職あり", en: "English-language roles" },
  { key: "hasGlobalRoles", zh: "全球岗位", ja: "グローバル職", en: "Global roles" },
  { key: "hasForeignEmployees", zh: "外国员工", ja: "外国人社員在籍", en: "Foreign employees" },
];

export default function CompanyDetailClient({
  initialData,
  initialLanguage,
}: {
  initialData?: CompanyDetailData;
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

  // Shared value words reused across the fact grid and info lines.
  const tbd = pick(locale, "待补充", "未記載", "Not listed");

  // Seed the query from the server prefetch so SSR emits real content. When
  // the client language differs from the prefetch language, mark the seed as
  // stale (updatedAt 0) so React Query silently refetches in the right one.
  const q = useQuery({
    queryKey: ["guide", "company", country, language, id],
    queryFn: () => guide.company(id, country, language),
    enabled: country === "jp" && id.length > 0,
    staleTime: 60_000,
    initialData: country === "jp" ? initialData : undefined,
    initialDataUpdatedAt: initialData ? (language === initialLanguage ? Date.now() : 0) : undefined,
  });

  const save = useMutation({
    mutationFn: (on: boolean) => guide.saveCompany(id, on),
    onSuccess: () => {
      q.refetch();
      pushToast({ kind: "success", message: locale === "en" ? "Saved status updated" : locale === "ja" ? "保存状態を更新しました" : "收藏状态已更新" });
    },
    onError: () => pushToast({ kind: "error", message: locale === "en" ? "Please log in to save companies" : locale === "ja" ? "企業を保存するにはログインしてください" : "请登录后收藏公司" }),
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
      <GuideShell back={{ href: "/guide/companies", label: copy.companies.listTitle }}>
        <InlineLoading />
      </GuideShell>
    );
  }
  if (q.isError || !q.data?.company) {
    return (
      <GuideShell back={{ href: "/guide/companies", label: copy.companies.listTitle }}>
        <ErrorState
          title={locale === "en" ? "Company not found" : locale === "ja" ? "企業が見つかりません" : "公司不存在"}
          subtitle={locale === "en" ? "It may have been moved or unpublished." : locale === "ja" ? "移動または非公開になった可能性があります。" : "它可能已被移动或下线。"}
          onRetry={() => q.refetch()}
        />
      </GuideShell>
    );
  }

  const c = q.data.company;
  const reviewsHref = `/guide/companies/${c.slug || c.id}/reviews`;
  const sizeRaw = c.companySize || c.size;
  const sizeText = sizeRaw ? companySizeLabel(sizeRaw, locale) : pick(locale, "规模待补充", "規模は未記載", "Size not listed");
  const foundedText = pick(locale, `成立 ${c.foundedYear}`, `${c.foundedYear}年設立`, `Founded ${c.foundedYear}`);

  return (
    <GuideShell back={{ href: "/guide/companies", label: copy.companies.listTitle }}>
      <div className="px-4 py-4 sm:px-6">
        <section className="rounded-kx-lg border border-kx-stroke/50 bg-kx-card p-5">
          <div className="flex items-start gap-3">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-kx-accentSoft text-kx-accent">
              <Building2 className="h-6 w-6" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex flex-wrap gap-1.5">
                <span className="rounded-full bg-kx-soft px-2 py-0.5 text-[11px] font-bold text-kx-muted">{c.industry ? industryLabel(c.industry, locale) : pick(locale, "公司", "企業", "Company")}</span>
                <span className="rounded-full bg-kx-accentSoft px-2 py-0.5 text-[11px] font-bold text-kx-accent">{copy.companies.title}</span>
              </div>
              <h1 className="text-xl font-black leading-tight text-kx-text sm:text-2xl">{c.companyName}</h1>
              <p className="mt-0.5 text-sm text-kx-muted">{c.companyNameJp || c.companyNameEn}</p>
              <p className="mt-1.5 text-xs text-kx-muted">
                {c.prefecture ? `${c.prefecture} · ` : ""}{guideCityLabel(c.city)}
                {c.ward ? ` · ${c.ward}` : ""} · {sizeText} {c.foundedYear ? `· ${foundedText}` : ""}
              </p>
            </div>
          </div>

          <p className="mt-4 text-[15px] leading-7 text-kx-subtle">{c.description}</p>

          <div className="mt-4 flex flex-wrap gap-2">
            {c.website ? <ExternalButton href={c.website} label={pick(locale, "官网", "公式サイト", "Official site")} /> : null}
            {c.careerUrl ? <ExternalButton href={c.careerUrl} label={pick(locale, "招聘页面", "採用ページ", "Careers")} /> : null}
            {c.newGraduateUrl ? <ExternalButton href={c.newGraduateUrl} label={pick(locale, "新卒招聘", "新卒採用", "New-grad hiring")} /> : null}
            {c.midCareerUrl ? <ExternalButton href={c.midCareerUrl} label={pick(locale, "社会招聘", "中途採用", "Mid-career hiring")} /> : null}
            {c.globalCareerUrl ? <ExternalButton href={c.globalCareerUrl} label={pick(locale, "全球招聘", "グローバル採用", "Global career")} /> : null}
            {c.sourceUrl ? <ExternalButton href={c.sourceUrl} label={pick(locale, "信息来源", "情報ソース", "Source")} /> : null}
          </div>

          <div className="mt-4 flex flex-wrap gap-2 border-t border-kx-stroke/40 pt-4">
            <button
              type="button"
              onClick={() => {
                if (!user) return openAuthPrompt("generic");
                save.mutate(!c.savedByMe);
              }}
              className="inline-flex h-10 items-center gap-1.5 rounded-full bg-kx-accent px-4 text-sm font-bold text-white shadow-sm disabled:opacity-60"
              disabled={save.isPending}
            >
              <Bookmark className="h-4 w-4" /> {c.savedByMe ? (locale === "en" ? "Saved" : locale === "ja" ? "保存済み" : "已收藏") : (locale === "en" ? "Save company" : locale === "ja" ? "企業を保存" : "收藏公司")}
            </button>
            <Link href={`${reviewsHref}?compose=1`} className="inline-flex h-10 items-center gap-1.5 rounded-full border border-kx-stroke/60 px-4 text-sm font-semibold text-kx-text hover:border-kx-accent/50 hover:text-kx-accent">
              <MessageSquarePlus className="h-4 w-4" /> {locale === "en" ? "Submit review" : locale === "ja" ? "レビューを投稿" : "提交评论"}
            </Link>
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
            targetType="company"
            targetId={c.id}
            onDone={() => {
              setShowCorrection(false);
              pushToast({ kind: "success", message: locale === "en" ? "Submitted for admin review" : locale === "ja" ? "管理者レビューに送信しました" : "已提交给管理员审核" });
            }}
          />
        ) : null}

        <section className="mt-3 rounded-kx-lg border border-kx-stroke/50 bg-kx-card p-5">
          <GuideSectionTitle
            title={pick(locale, "就职判断信号", "就職判断シグナル", "Job-search signals")}
            subtitle={pick(locale, "未知项不推断，等待官方资料或管理员补充", "不明な項目は推測せず、公式情報や管理者の追記を待ちます", "Unknown items are left blank until official sources or an editor fill them in")}
          />
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {FACTS.map((fact) => {
              const value = c[fact.key];
              return (
                <div key={fact.key} className="rounded-kx-md bg-kx-soft/70 px-3 py-2">
                  <p className="text-xs font-bold text-kx-muted">{pick(locale, fact.zh, fact.ja, fact.en)}</p>
                  <p className="mt-0.5 text-sm font-black text-kx-text">{value === true ? pick(locale, "有", "あり", "Yes") : value === false ? pick(locale, "未确认支持", "未確認", "Not confirmed") : tbd}</p>
                </div>
              );
            })}
            <InfoLine label={pick(locale, "日语要求", "日本語要件", "Japanese level")} value={levelLabel(locale, c.requiredJapaneseLevel)} />
            <InfoLine label={pick(locale, "英语要求", "英語要件", "English level")} value={levelLabel(locale, c.requiredEnglishLevel)} />
            <InfoLine label={pick(locale, "地址", "住所", "Address")} value={[c.postalCode, c.prefecture, c.city, c.ward, c.address].filter(Boolean).join(" ") || tbd} />
            <InfoLine label={pick(locale, "雇佣类型", "雇用形態", "Employment types")} value={c.employmentTypes?.length ? c.employmentTypes.join(" / ") : tbd} />
            <InfoLine label={pick(locale, "数据完整度", "データ完全度", "Data completeness")} value={`${c.dataQualityScore ?? 0} / 100`} />
            <InfoLine label={pick(locale, "最后核验", "最終確認", "Last verified")} value={c.sourceLastCheckedAt || tbd} />
          </div>
        </section>

        <section className="mt-3 rounded-kx-lg border border-kx-stroke/50 bg-kx-card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-black text-kx-text">{pick(locale, "评分概览", "評価の概要", "Ratings overview")}</h2>
            <span className="text-xs text-kx-muted">{c.reviewCount > 0 ? pick(locale, `${c.reviewCount} 条评价`, `${c.reviewCount} 件のレビュー`, `${c.reviewCount} reviews`) : pick(locale, "暂无评价", "レビューなし", "No reviews yet")}</span>
          </div>
          {c.scores ? (
            <div className="space-y-2.5">
              {SCORE_LABELS.map((score) => {
                const v = c.scores?.[score.key] || 0;
                return (
                  <div key={score.key} className="flex items-center gap-3">
                    <span className="w-24 shrink-0 text-xs text-kx-muted">{pick(locale, score.zh, score.ja, score.en)}</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-kx-soft">
                      <div className="h-full rounded-full bg-kx-accent" style={{ width: `${(v / 5) * 100}%` }} />
                    </div>
                    <span className="w-8 shrink-0 text-right text-xs font-bold text-kx-text">{v.toFixed(1)}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm leading-6 text-kx-muted">
              {pick(
                locale,
                "暂无足够真实评价数据。评分将在用户提交并通过审核后显示，我们不会预设主观分数。",
                "十分な実ユーザー評価がまだありません。評価はユーザーの投稿が承認された後に表示され、主観的なスコアを事前設定することはありません。",
                "Not enough real user reviews yet. Ratings appear after users submit and pass moderation — we never pre-set subjective scores.",
              )}
            </p>
          )}
        </section>

        <section className="mt-5">
          <GuideSectionTitle
            title={pick(locale, "相关岗位", "関連する求人", "Related positions")}
            subtitle={pick(locale, "管理员按官方招聘页面维护", "管理者が公式採用ページに基づいて更新します", "Maintained by editors from official career pages")}
          />
          {q.data.positions?.length ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {q.data.positions.map((position) => (
                <article key={position.id} className="rounded-kx-lg border border-kx-stroke/50 bg-kx-card p-4">
                  <h3 className="font-black text-kx-text">{position.positionTitle}</h3>
                  <p className="mt-1 text-xs text-kx-muted">{position.positionCategory} · {position.employmentType || pick(locale, "雇佣类型待补充", "雇用形態は未記載", "Employment type not listed")} · {guideCityLabel(position.city)}</p>
                  <p className="mt-2 text-sm leading-6 text-kx-subtle">{position.description || pick(locale, "岗位说明待管理员根据官方招聘页面补充。", "職務内容は公式採用ページに基づき管理者が追記します。", "Job details will be added by an editor from the official career page.")}</p>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState
              title={pick(locale, "岗位资料待补充", "求人情報は準備中", "Positions not listed yet")}
              subtitle={pick(locale, "求职前请以公司官网和招聘页面为准。", "応募前に必ず会社の公式サイトと採用ページをご確認ください。", "Before applying, refer to the company's official site and career pages.")}
            />
          )}
        </section>

        <div className="mt-5 flex flex-wrap gap-2">
          <Link href={reviewsHref} className="kx-button-primary h-10 px-5">
            {pick(
              locale,
              `查看评论（面试 ${q.data.interviewReviewCount} · 工作 ${q.data.workReviewCount}）`,
              `レビューを見る（面接 ${q.data.interviewReviewCount} ・ 勤務 ${q.data.workReviewCount}）`,
              `View reviews (Interviews ${q.data.interviewReviewCount} · Work ${q.data.workReviewCount})`,
            )}
          </Link>
          <Link href="/guide/interview-reviews" className="inline-flex h-10 items-center rounded-full border border-kx-stroke/60 px-5 text-sm font-semibold text-kx-text hover:border-kx-accent/50 hover:text-kx-accent">
            {pick(locale, "最新面试评论", "最新の面接レビュー", "Latest interview reviews")}
          </Link>
        </div>

        {q.data.relatedArticles?.length ? (
          <section className="mt-5">
            <GuideSectionTitle title={pick(locale, "相关就职攻略", "関連する就職ガイド", "Related job-search guides")} />
            <div className="grid gap-3 sm:grid-cols-2">
              {q.data.relatedArticles.map((article) => <ArticleCard key={article.id} article={article} compact />)}
            </div>
          </section>
        ) : null}

        <section className="mt-5 rounded-kx-lg border border-kx-stroke/50 bg-kx-card p-4">
          <GuideSectionTitle
            title={pick(locale, "数据来源", "データソース", "Data sources")}
            subtitle={pick(locale, "未确认字段会显示待补充，评论和评分不会预设", "未確認の項目は「未記載」と表示され、レビューや評価は事前設定されません", "Unconfirmed fields show “Not listed”; reviews and ratings are never pre-set")}
          />
          <div className="grid gap-2 sm:grid-cols-2">
            <InfoLine label={pick(locale, "法人番号", "法人番号", "Corporate number")} value={c.corporateNumber || tbd} />
            <InfoLine label={pick(locale, "来源名称", "情報ソース名", "Source name")} value={c.sourceName || tbd} />
            <InfoLine label={pick(locale, "核验状态", "確認ステータス", "Verification status")} value={c.verificationStatus || "needs_review"} />
            <InfoLine label={pick(locale, "来源链接", "情報ソースURL", "Source URL")} value={c.sourceUrl || tbd} />
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
    <div className="rounded-kx-md bg-kx-soft/70 px-3 py-2">
      <p className="text-xs font-bold text-kx-muted">{label}</p>
      <p className="mt-0.5 text-sm font-black text-kx-text">{value}</p>
    </div>
  );
}

function levelLabel(locale: Locale, value?: string) {
  return value && value !== "unknown" ? value.toUpperCase() : pick(locale, "待补充", "未記載", "Not listed");
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
