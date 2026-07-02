"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bookmark, CheckCircle2, Clock3, ExternalLink, Eye, Loader2, Languages, Share2, ShieldCheck } from "lucide-react";
import { guide, type GuideArticle } from "@/lib/guide";
import { GuideShell, GuideComingSoon, ArticleCard, categoryHref, useGuideCountry } from "@/components/guide/GuideKit";
import { MarkdownLite } from "@/components/guide/MarkdownLite";
import { InlineLoading, ErrorState } from "@/components/design/States";
import { relativeTime } from "@/lib/format";
import { appLocaleToGuideLanguage, useI18n } from "@/lib/i18n";
import { guideUi } from "@/lib/guide-ui";
import { useAuthPrompt, useSession, useToasts } from "@/lib/store";

/** Full detail payload from GET /api/guide/articles/:idOrSlug — also used by
 * the server component to seed React Query (SSR for SEO, UI unchanged). */
export type ArticleDetailData = Awaited<ReturnType<typeof guide.article>>;

export default function ArticleDetailClient({
  initialData,
  initialLanguage,
}: {
  initialData?: ArticleDetailData;
  initialLanguage?: string;
}) {
  const params = useParams();
  const slug = String(params?.slug || "");
  const country = useGuideCountry();
  const { locale } = useI18n();
  const language = appLocaleToGuideLanguage(locale);
  const copy = guideUi(locale);
  const user = useSession((s) => s.user);
  const openAuthPrompt = useAuthPrompt((s) => s.open);
  const pushToast = useToasts((s) => s.push);
  const queryClient = useQueryClient();
  // Seed the query from the server prefetch so SSR emits real content. When
  // the client language differs from the prefetch language, mark the seed as
  // stale (updatedAt 0) so React Query silently refetches in the right one.
  const q = useQuery({
    queryKey: ["guide", "article", country, language, slug],
    queryFn: () => guide.article(slug, country, language),
    enabled: country === "jp" && slug.length > 0,
    staleTime: 60_000,
    initialData: country === "jp" ? initialData : undefined,
    initialDataUpdatedAt: initialData ? (language === initialLanguage ? Date.now() : 0) : undefined,
  });
  const articleQueryKey = ["guide", "article", country, language, slug];
  const saveMutation = useMutation({
    mutationFn: ({ article, saved }: { article: GuideArticle; saved: boolean }) =>
      guide.setSaved("article", article.id, saved),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: articleQueryKey });
      queryClient.invalidateQueries({ queryKey: ["guide", "saved"] });
      pushToast({ kind: "success", message: vars.saved ? "已收藏到资料库" : "已取消收藏" });
    },
    onError: (error) => pushToast({ kind: "error", message: error instanceof Error ? error.message : "操作失败，请重试" }),
  });
  const progressMutation = useMutation({
    mutationFn: (article: GuideArticle) => guide.updateArticleProgress(article.slug, { country, progressPercent: 100 }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: articleQueryKey });
      pushToast({ kind: "success", message: "已标记读完" });
    },
    onError: (error) => pushToast({ kind: "error", message: error instanceof Error ? error.message : "保存阅读进度失败" }),
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
      <GuideShell back={{ href: "/guide", label: copy.back }}>
        <InlineLoading />
      </GuideShell>
    );
  }
  if (q.isError || !q.data?.article) {
    return (
      <GuideShell back={{ href: "/guide", label: copy.back }}>
        <ErrorState
          title={locale === "en" ? "Guide article not found" : locale === "ja" ? "ガイド記事が見つかりません" : "指南内容不存在"}
          subtitle={locale === "en" ? "It may have been moved or unpublished." : locale === "ja" ? "移動または非公開になった可能性があります。" : "它可能已被移动或下线。"}
          onRetry={() => q.refetch()}
        />
      </GuideShell>
    );
  }
  const a = q.data.article;
  const related = q.data.related || [];

  return (
    <GuideShell
      back={{ href: categoryHref(a.categoryKey), label: locale === "en" ? "Back to category" : locale === "ja" ? "カテゴリに戻る" : "返回分类" }}
      right={<ArticleRightRail related={related} />}
    >
      <ReadingProgressBar />
      {user ? <ReadingProgressReporter slug={a.slug} country={country} initialPercent={a.progressPercent || a.readingProgress?.progressPercent || 0} /> : null}
      <article className="px-4 py-4 sm:px-6">
        <div className="mb-2 flex flex-wrap items-center gap-1.5 text-[11px] font-bold text-kx-muted">
          <span className="rounded-full bg-kx-accentSoft px-2 py-0.5 text-kx-accent">{locale === "en" ? "Guide" : locale === "ja" ? "ガイド" : "指南"}</span>
          <span>{a.authorName}</span>
          {a.publishedAt ? (
            <span className="inline-flex items-center gap-1">
              <Clock3 className="h-3 w-3" /> <time dateTime={a.publishedAt} suppressHydrationWarning>{relativeTime(a.publishedAt, locale)}</time>
            </span>
          ) : null}
          <span className="inline-flex items-center gap-1">
            <Eye className="h-3 w-3" /> {a.viewCount}
          </span>
        </div>
        <h1 className="text-2xl font-black leading-tight text-kx-text sm:text-3xl">{a.title}</h1>
        {a.summary ? <p className="mt-3 text-base leading-8 text-kx-subtle">{a.summary}</p> : null}
        {a.tags?.length ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {a.tags.map((t) => (
              <span key={t} className="rounded-full bg-kx-soft px-2.5 py-0.5 text-xs text-kx-muted">
                {t}
              </span>
            ))}
          </div>
        ) : null}
        <ArticleActionBar
          article={a}
          locale={locale}
          isSignedIn={Boolean(user)}
          onNeedLogin={() => openAuthPrompt("bookmark")}
          onSave={() => saveMutation.mutate({ article: a, saved: !a.saved })}
          onMarkRead={() => progressMutation.mutate(a)}
          onShare={async () => {
            try {
              const url = typeof window !== "undefined" ? window.location.href : "";
              const nav = typeof window !== "undefined" ? window.navigator : undefined;
              const share = (nav as (Navigator & { share?: (data: ShareData) => Promise<void> }) | undefined)?.share;
              if (share) {
                await share.call(nav, { title: a.title, text: a.summary, url });
              } else if (nav?.clipboard && url) {
                await nav.clipboard.writeText(url);
                pushToast({ kind: "success", message: "链接已复制" });
              }
            } catch {
              // Native share can be cancelled by the user; no toast needed.
            }
          }}
          saving={saveMutation.isPending}
          marking={progressMutation.isPending}
        />
        <ArticleTrustPanel article={a} locale={locale} />

        {locale !== "en" && locale !== "ja" ? null : <TranslationNotice locale={locale} />}

        <div className="mt-5 border-t border-kx-stroke/40 pt-5">
          <MarkdownLite body={a.body || ""} />
        </div>

        <div className="mt-8 rounded-kx-lg border border-kx-stroke/50 bg-kx-card p-4 text-xs leading-6 text-kx-muted">
          {locale === "en" ? `This content is curated by ${a.authorName} for reference only. For visas, immigration, exams and other official procedures, always check the latest official notices as well.` : locale === "ja" ? `本コンテンツは ${a.authorName} が参考用に整理したものです。ビザ、入管、試験などの公式手続きについては、必ず公式の最新案内も確認してください。` : `本内容由 ${a.authorName} 整理，仅供参考。涉及签证、入管、考试等官方流程时，请同时以官方最新公告为准。`}
        </div>

        {related.length ? (
          <section className="mt-8 xl:hidden">
            <h2 className="mb-3 text-lg font-black text-kx-text">{locale === "en" ? "Related guides" : locale === "ja" ? "関連ガイド" : "相关指南"}</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {related.map((r) => (
                <ArticleCard key={r.id} article={r} compact />
              ))}
            </div>
          </section>
        ) : null}
      </article>
    </GuideShell>
  );
}

// A thin reading-progress bar pinned to the top of the article, driven by the
// window scroll position. Pure presentation — token colors only.
function ReadingProgressBar() {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const el = document.scrollingElement || document.documentElement;
      const max = el.scrollHeight - el.clientHeight;
      const pct = max > 0 ? Math.min(100, Math.max(0, (el.scrollTop / max) * 100)) : 0;
      if (ref.current) ref.current.style.width = `${pct}%`;
    };
    const onScroll = () => {
      if (!raf) raf = window.requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, []);
  return (
    <div className="sticky top-0 z-40 h-1 w-full bg-transparent" aria-hidden>
      <div ref={ref} className="h-full bg-kx-accent transition-[width] duration-150 ease-out" style={{ width: "0%" }} />
    </div>
  );
}

// Reports the deepest scroll depth back to the server (throttled), so reading
// progress persists across devices. Only ever escalates the stored percent
// (never lowers it), and only fires when it advances by a meaningful step.
function ReadingProgressReporter({
  slug,
  country,
  initialPercent,
}: {
  slug: string;
  country: string;
  initialPercent: number;
}) {
  const reportedRef = useRef(Math.max(0, Math.min(100, initialPercent || 0)));
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    reportedRef.current = Math.max(reportedRef.current, Math.max(0, Math.min(100, initialPercent || 0)));
  }, [initialPercent]);
  useEffect(() => {
    const send = (pct: number) => {
      const rounded = Math.round(pct);
      if (rounded <= reportedRef.current) return;
      // Only escalate in >= 10-point steps, or when the reader reaches the end.
      if (rounded < reportedRef.current + 10 && rounded < 95) return;
      reportedRef.current = rounded;
      guide.updateArticleProgress(slug, { country, progressPercent: rounded }).catch(() => {
        /* progress is best-effort; a failed report must never disrupt reading */
      });
    };
    const onScroll = () => {
      if (timerRef.current) return;
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        const el = document.scrollingElement || document.documentElement;
        const max = el.scrollHeight - el.clientHeight;
        const pct = max > 0 ? (el.scrollTop / max) * 100 : 0;
        // Reaching the bottom of a page counts as fully read.
        send(max > 0 && el.scrollTop >= max - 4 ? 100 : pct);
      }, 1500);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [slug, country]);
  return null;
}

// Shown on EN/JA guide articles: the full write-up is authored in Chinese, so
// the localized view is a machine-assisted summary. Honest, non-blocking notice.
function TranslationNotice({ locale }: { locale: string }) {
  return (
    <div className="mt-4 flex items-start gap-2 rounded-kx-lg border border-kx-accent/25 bg-kx-accentSoft/40 p-3 text-sm leading-6 text-kx-subtle">
      <Languages className="mt-0.5 h-4 w-4 shrink-0 text-kx-accent" />
      <span>
        {locale === "en"
          ? "The full version of this guide is currently written in Chinese. This is a localized summary — switch to 中文 for the complete text."
          : "このガイドの完全版は現在中国語で提供しています。こちらは要約版です。全文は中文でご覧いただけます。"}
      </span>
    </div>
  );
}

function ArticleActionBar({
  article,
  locale,
  isSignedIn,
  saving,
  marking,
  onNeedLogin,
  onSave,
  onShare,
  onMarkRead,
}: {
  article: GuideArticle;
  locale: string;
  isSignedIn: boolean;
  saving: boolean;
  marking: boolean;
  onNeedLogin: () => void;
  onSave: () => void;
  onShare: () => void;
  onMarkRead: () => void;
}) {
  const progress = Math.max(0, Math.min(100, article.progressPercent || article.readingProgress?.progressPercent || 0));
  const saveLabel = article.saved
    ? locale === "en" ? "Saved" : locale === "ja" ? "保存済み" : "已收藏"
    : locale === "en" ? "Save" : locale === "ja" ? "保存" : "收藏";
  const readLabel = progress >= 95
    ? locale === "en" ? "Finished" : locale === "ja" ? "読了" : "已读完"
    : locale === "en" ? "Mark as read" : locale === "ja" ? "読了にする" : "标记读完";
  return (
    <div className="mt-4 rounded-kx-lg border border-kx-stroke/50 bg-white/70 p-3 shadow-sm backdrop-blur">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => (isSignedIn ? onSave() : onNeedLogin())}
          disabled={saving}
          className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-kx-stroke bg-white px-4 text-sm font-black text-kx-text transition hover:-translate-y-0.5 hover:border-kx-accent/40 disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bookmark className={`h-4 w-4 ${article.saved ? "fill-kx-accent text-kx-accent" : ""}`} />}
          {saveLabel}
        </button>
        <button
          type="button"
          onClick={onShare}
          className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-kx-stroke bg-white px-4 text-sm font-black text-kx-text transition hover:-translate-y-0.5 hover:border-kx-accent/40"
        >
          <Share2 className="h-4 w-4" />
          {locale === "en" ? "Share" : locale === "ja" ? "共有" : "分享"}
        </button>
        <button
          type="button"
          onClick={() => (isSignedIn ? onMarkRead() : onNeedLogin())}
          disabled={marking || progress >= 95}
          className="inline-flex min-h-11 items-center gap-2 rounded-2xl bg-kx-accent px-4 text-sm font-black text-white transition hover:-translate-y-0.5 disabled:opacity-70"
        >
          {marking ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          {readLabel}
        </button>
      </div>
      <div className="mt-3 flex items-center gap-3 text-xs font-bold text-kx-muted">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-kx-soft">
          <div className="h-full rounded-full bg-kx-accent transition-all" style={{ width: `${progress}%` }} />
        </div>
        <span>{progress}%</span>
      </div>
    </div>
  );
}

function compactDate(value?: string | null) {
  if (!value) return "";
  return String(value).slice(0, 10);
}

function ArticleTrustPanel({ article, locale }: { article: GuideArticle; locale: string }) {
  const updated = compactDate(article.updatedAt || article.publishedAt);
  const verified = compactDate(article.verifiedAt);
  const staleDays = Number(article.staleAfterDays || 0);
  const sourceLabel = article.sourceLabel || (locale === "en" ? "Editorial source" : locale === "ja" ? "編集部確認" : "编辑部整理");
  return (
    <div className="mt-4 rounded-kx-lg border border-kx-stroke/50 bg-kx-card/80 p-3 text-xs leading-5 text-kx-muted">
      <div className="flex flex-wrap items-center gap-2 font-semibold">
        <span className="inline-flex items-center gap-1 text-kx-accent">
          <ShieldCheck className="h-3.5 w-3.5" />
          {locale === "en" ? "Trust info" : locale === "ja" ? "信頼情報" : "可信信息"}
        </span>
        {updated ? <span>{locale === "en" ? "Updated" : locale === "ja" ? "更新" : "更新"} {updated}</span> : null}
        {verified ? <span>{locale === "en" ? "Verified" : locale === "ja" ? "確認" : "核验"} {verified}</span> : null}
        {staleDays > 0 ? <span>{locale === "en" ? `Review every ${staleDays} days` : locale === "ja" ? `${staleDays}日ごとに再確認` : `${staleDays} 天后需复核`}</span> : null}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        {article.sourceUrl ? (
          <a href={article.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-bold text-kx-accent hover:underline">
            {sourceLabel}
            <ExternalLink className="h-3 w-3" />
          </a>
        ) : (
          <span>{sourceLabel}</span>
        )}
        <span>{locale === "en" ? "Policies and official procedures may change; confirm with official notices before acting." : locale === "ja" ? "制度や公式手続きは変更される場合があります。行動前に公式案内も確認してください。" : "政策和官方手续可能变化，行动前请以官方最新公告为准。"}</span>
      </div>
    </div>
  );
}

function ArticleRightRail({ related }: { related: Array<{ id: string; slug: string; title: string; summary: string; tags: string[]; authorName: string }> }) {
  const { locale } = useI18n();
  const copy = guideUi(locale);
  return (
    <div className="space-y-3">
      <section className="kx-card">
        <h3 className="kx-section-title mb-2 px-0">{locale === "en" ? "Related guides" : locale === "ja" ? "関連ガイド" : "相关指南"}</h3>
        {related.length ? (
          <ul className="space-y-2">
            {related.map((r) => (
              <li key={r.id}>
                <Link href={`/guide/articles/${r.slug}`} className="group flex gap-2 rounded-kx-sm p-1.5 hover:bg-kx-soft">
                  <span className="line-clamp-2 text-sm font-semibold text-kx-text group-hover:text-kx-accent">{r.title}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-kx-muted">{locale === "en" ? "No related content yet." : locale === "ja" ? "関連コンテンツはまだありません。" : "暂无相关内容。"}</p>
        )}
      </section>
      <section className="kx-card">
        <h3 className="text-base font-black text-kx-text">{locale === "en" ? "Need resources or support?" : locale === "ja" ? "資料やサポートが必要ですか？" : "需要资料或辅导？"}</h3>
        <p className="mt-1 text-sm leading-6 text-kx-subtle">{copy.services.subtitle}</p>
        <Link href="/guide/services" className="kx-button-primary mt-3 inline-flex h-9">{copy.services.title}</Link>
      </section>
    </div>
  );
}
