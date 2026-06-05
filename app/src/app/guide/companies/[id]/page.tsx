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
import { appLocaleToGuideLanguage, useI18n } from "@/lib/i18n";
import { guideUi, industryLabel } from "@/lib/guide-ui";

const SCORE_LABELS: Array<{ key: keyof GuideCompanyScores; label: string }> = [
  { key: "foreignerFriendly", label: "外国人友好度" },
  { key: "visaSupport", label: "签证支持度" },
  { key: "interviewDifficulty", label: "面试难度" },
  { key: "overtime", label: "加班情况" },
  { key: "salaryBenefit", label: "薪资福利" },
  { key: "workLifeBalance", label: "工作生活平衡" },
  { key: "careerGrowth", label: "成长空间" },
];

const FACTS: Array<{ key: keyof GuideCompany; label: string }> = [
  { key: "acceptsForeignApplicants", label: "接受外国人" },
  { key: "supportsWorkVisa", label: "签证支持" },
  { key: "hasEnglishPositions", label: "英文岗位" },
  { key: "hasGlobalRoles", label: "全球岗位" },
  { key: "hasForeignEmployees", label: "外国员工" },
];

export default function GuideCompanyDetailPage() {
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

  const q = useQuery({
    queryKey: ["guide", "company", country, language, id],
    queryFn: () => guide.company(id, country, language),
    enabled: country === "jp" && id.length > 0,
    staleTime: 60_000,
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
                <span className="rounded-full bg-kx-soft px-2 py-0.5 text-[11px] font-bold text-kx-muted">{c.industry ? industryLabel(c.industry, locale) : (locale === "en" ? "Company" : locale === "ja" ? "企業" : "公司")}</span>
                <span className="rounded-full bg-kx-accentSoft px-2 py-0.5 text-[11px] font-bold text-kx-accent">{copy.companies.title}</span>
              </div>
              <h1 className="text-xl font-black leading-tight text-kx-text sm:text-2xl">{c.companyName}</h1>
              <p className="mt-0.5 text-sm text-kx-muted">{c.companyNameJp || c.companyNameEn}</p>
              <p className="mt-1.5 text-xs text-kx-muted">
                {c.prefecture ? `${c.prefecture} · ` : ""}{guideCityLabel(c.city)}
                {c.ward ? ` · ${c.ward}` : ""} · {c.companySize || c.size || "规模待补充"} {c.foundedYear ? `· 成立 ${c.foundedYear}` : ""}
              </p>
            </div>
          </div>

          <p className="mt-4 text-[15px] leading-7 text-kx-subtle">{c.description}</p>

          <div className="mt-4 flex flex-wrap gap-2">
            {c.website ? <ExternalButton href={c.website} label="官网" /> : null}
            {c.careerUrl ? <ExternalButton href={c.careerUrl} label="招聘页面" /> : null}
            {c.newGraduateUrl ? <ExternalButton href={c.newGraduateUrl} label="新卒採用" /> : null}
            {c.midCareerUrl ? <ExternalButton href={c.midCareerUrl} label="中途採用" /> : null}
            {c.globalCareerUrl ? <ExternalButton href={c.globalCareerUrl} label="Global career" /> : null}
            {c.sourceUrl ? <ExternalButton href={c.sourceUrl} label="信息来源" /> : null}
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
          <GuideSectionTitle title="就职判断信号" subtitle="未知项不推断，等待官方资料或管理员补充" />
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {FACTS.map(({ key, label }) => {
              const value = c[key];
              return (
                <div key={key} className="rounded-kx-md bg-kx-soft/70 px-3 py-2">
                  <p className="text-xs font-bold text-kx-muted">{label}</p>
                  <p className="mt-0.5 text-sm font-black text-kx-text">{value === true ? "有" : value === false ? "未确认支持" : "待补充"}</p>
                </div>
              );
            })}
            <InfoLine label="日语要求" value={levelLabel(c.requiredJapaneseLevel)} />
            <InfoLine label="英语要求" value={levelLabel(c.requiredEnglishLevel)} />
            <InfoLine label="地址" value={[c.postalCode, c.prefecture, c.city, c.ward, c.address].filter(Boolean).join(" ") || "待补充"} />
            <InfoLine label="雇佣类型" value={c.employmentTypes?.length ? c.employmentTypes.join(" / ") : "待补充"} />
            <InfoLine label="数据完整度" value={`${c.dataQualityScore ?? 0} / 100`} />
            <InfoLine label="最后核验" value={c.sourceLastCheckedAt || "待补充"} />
          </div>
        </section>

        <section className="mt-3 rounded-kx-lg border border-kx-stroke/50 bg-kx-card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-black text-kx-text">评分概览</h2>
            <span className="text-xs text-kx-muted">{c.reviewCount > 0 ? `${c.reviewCount} 条评价` : "暂无评价"}</span>
          </div>
          {c.scores ? (
            <div className="space-y-2.5">
              {SCORE_LABELS.map(({ key, label }) => {
                const v = c.scores?.[key] || 0;
                return (
                  <div key={key} className="flex items-center gap-3">
                    <span className="w-24 shrink-0 text-xs text-kx-muted">{label}</span>
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
              暂无足够真实评价数据。评分将在用户提交并通过审核后显示，我们不会预设主观分数。
            </p>
          )}
        </section>

        <section className="mt-5">
          <GuideSectionTitle title="相关岗位" subtitle="管理员按官方招聘页面维护" />
          {q.data.positions?.length ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {q.data.positions.map((position) => (
                <article key={position.id} className="rounded-kx-lg border border-kx-stroke/50 bg-kx-card p-4">
                  <h3 className="font-black text-kx-text">{position.positionTitle}</h3>
                  <p className="mt-1 text-xs text-kx-muted">{position.positionCategory} · {position.employmentType || "雇佣类型待补充"} · {guideCityLabel(position.city)}</p>
                  <p className="mt-2 text-sm leading-6 text-kx-subtle">{position.description || "岗位说明待管理员根据官方招聘页面补充。"}</p>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState title="岗位资料待补充" subtitle="求职前请以公司官网和招聘页面为准。" />
          )}
        </section>

        <div className="mt-5 flex flex-wrap gap-2">
          <Link href={reviewsHref} className="kx-button-primary h-10 px-5">
            查看评论（面试 {q.data.interviewReviewCount} · 工作 {q.data.workReviewCount}）
          </Link>
          <Link href="/guide/interview-reviews" className="inline-flex h-10 items-center rounded-full border border-kx-stroke/60 px-5 text-sm font-semibold text-kx-text hover:border-kx-accent/50 hover:text-kx-accent">
            最新面试评论
          </Link>
        </div>

        {q.data.relatedArticles?.length ? (
          <section className="mt-5">
            <GuideSectionTitle title="相关就职攻略" />
            <div className="grid gap-3 sm:grid-cols-2">
              {q.data.relatedArticles.map((article) => <ArticleCard key={article.id} article={article} compact />)}
            </div>
          </section>
        ) : null}

        <section className="mt-5 rounded-kx-lg border border-kx-stroke/50 bg-kx-card p-4">
          <GuideSectionTitle title="数据来源" subtitle="未确认字段会显示待补充，评论和评分不会预设" />
          <div className="grid gap-2 sm:grid-cols-2">
            <InfoLine label="法人番号" value={c.corporateNumber || "待补充"} />
            <InfoLine label="来源名称" value={c.sourceName || "待补充"} />
            <InfoLine label="核验状态" value={c.verificationStatus || "needs_review"} />
            <InfoLine label="来源链接" value={c.sourceUrl || "待补充"} />
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

function levelLabel(value?: string) {
  return value && value !== "unknown" ? value.toUpperCase() : "待补充";
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
