"use client";

// Interactive product detail (purchase / points / booking / reviews). The
// route's server component (./page.tsx) owns fetch-for-SEO + generateMetadata;
// this client keeps its own React Query fetch for per-viewer entitlement.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, CheckCircle2, Coins, Download, FileText, Flag, Lock, Pencil, ShieldCheck, Star, ThumbsUp, Trash2, Wrench } from "lucide-react";
import { guide, GUIDE_PRODUCT_TYPE_LABELS, type GuideProduct, type GuideReview } from "@/lib/guide";
import { GuideComingSoon, GuideShell, useGuideCountry } from "@/components/guide/GuideKit";
import { InlineLoading, ErrorState } from "@/components/design/States";
import { useSession, useAuthPrompt, useToasts } from "@/lib/store";
import { formatPrice } from "@/lib/format";
import { appLocaleToGuideLanguage, useI18n } from "@/lib/i18n";
import { guideUi } from "@/lib/guide-ui";
import { APIError } from "@/lib/api";

const SERVICE_CITIES = ["Tokyo", "Osaka", "Kyoto", "Yokohama", "Kobe", "Nagoya", "Fukuoka", "Other"];

export default function ProductDetailClient() {
  const params = useParams();
  const slug = String(params?.slug || "");
  const user = useSession((s) => s.user);
  const country = useGuideCountry();
  const { locale, t } = useI18n();
  const language = appLocaleToGuideLanguage(locale);
  const copy = guideUi(locale);
  const openAuthPrompt = useAuthPrompt((s) => s.open);
  const pushToast = useToasts((s) => s.push);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const tt = (zh: string, en: string, ja: string) => (locale === "en" ? en : locale === "ja" ? ja : zh);

  // Send the user to top up, remembering this product so the wallet round-trips
  // them back here after a successful topup (see wallet page returnTo handling).
  // requiredPoints lets the wallet highlight the smallest pack that covers the
  // shortfall for THIS purchase.
  const goTopUp = (requiredPoints?: number) => {
    const here = typeof window !== "undefined"
      ? `${window.location.pathname}${window.location.search}`
      : `/guide/products/${slug}`;
    const params = new URLSearchParams({ returnTo: here });
    if (requiredPoints && requiredPoints > 0) params.set("requiredPoints", String(requiredPoints));
    router.push(`/wallet?${params.toString()}`);
  };

  const q = useQuery({
    queryKey: ["guide", "product", country, language, slug, user?.id || "anon"],
    queryFn: () => guide.product(slug, country, language),
    enabled: country === "jp" && slug.length > 0,
    staleTime: 30_000,
  });

  // Settle a returning Stripe checkout (?guide_session=...) once signed in.
  useEffect(() => {
    if (typeof window === "undefined" || !user) return;
    const sess = new URLSearchParams(window.location.search).get("guide_session");
    if (!sess) return;
    guide.confirmCheckout(sess).then((r) => {
      if (r.status === "fulfilled") {
        pushToast({ kind: "success", message: locale === "en" ? "Purchase complete. Content unlocked." : locale === "ja" ? "購入が完了し、コンテンツが解放されました。" : "购买成功，已解锁内容。" });
        q.refetch();
      }
      const url = new URL(window.location.href);
      url.searchParams.delete("guide_session");
      window.history.replaceState({}, "", url.toString());
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  if (country !== "jp") {
    return <GuideShell back={{ href: "/guide/services", label: copy.services.title }}><GuideComingSoon /></GuideShell>;
  }

  if (q.isLoading) {
    return <GuideShell back={{ href: "/guide/services", label: copy.services.title }}><InlineLoading /></GuideShell>;
  }
  if (q.isError || !q.data?.product) {
    return (
      <GuideShell back={{ href: "/guide/services", label: copy.services.title }}>
        <ErrorState
          title={locale === "en" ? "Resource or service not found" : locale === "ja" ? "資料またはサービスが見つかりません" : "资料/服务不存在"}
          subtitle={locale === "en" ? "It may have been moved or unpublished." : locale === "ja" ? "移動または非公開になった可能性があります。" : "它可能已被移动或下线。"}
          onRetry={() => q.refetch()}
        />
      </GuideShell>
    );
  }
  const p = q.data.product;
  const typeLabel = GUIDE_PRODUCT_TYPE_LABELS[p.productType] || (p.isService ? t("guide_service") : t("guide_material"));
  const Icon = p.isService ? Wrench : FileText;
  const access = p.access;
  const canAccess = !!access?.canAccess;
  const isComing = p.isComingSoon || p.status === "coming_soon";
  // 契约 C-1：deliverable_ready 缺省视为 true；false（数字商品已发布但交付文件
  // 缺失）时禁用购买 CTA，避免买到 404。
  const deliverableReady = p.deliverable_ready !== false;
  const priceLabel = formatPrice(p, "CNY", locale) || p.priceLabel;

  const onBuy = async () => {
    if (!user) return openAuthPrompt("generic");
    setBusy(true);
    try {
      if (p.isFree) {
        const r = await guide.purchase(p.slug);
        pushToast({ kind: "success", message: r.message || (locale === "en" ? "Unlocked." : locale === "ja" ? "解放しました。" : "已解锁。") });
        q.refetch();
        return;
      }
      const r = await guide.checkout(p.slug, window.location.href);
      if (r.status === "ok" && r.checkoutUrl) {
        window.location.href = r.checkoutUrl;
        return;
      }
      if (r.status === "member_unlocked") {
        pushToast({ kind: "success", message: r.message || (locale === "en" ? "Included with your membership." : locale === "ja" ? "メンバー特典として閲覧できます。" : "会员可直接查看。") });
        q.refetch();
        return;
      }
      pushToast({ kind: "info", message: r.message || (locale === "en" ? "Purchases will open soon." : locale === "ja" ? "購入機能はまもなく公開予定です。" : "购买功能即将开放。") });
    } catch {
      pushToast({ kind: "error", message: locale === "en" ? "Action failed. Please try again later." : locale === "ja" ? "操作に失敗しました。しばらくしてからもう一度お試しください。" : "操作失败，请稍后再试。" });
    } finally {
      setBusy(false);
    }
  };

  // Buy with Machi Points. If the balance is short, send the user to the
  // wallet to top up rather than charging. Web also supports Stripe (above).
  const onBuyWithPoints = async () => {
    if (!user) return openAuthPrompt("generic");
    const ctx = p.pointsContext;
    if (ctx && !ctx.sufficient) {
      pushToast({ kind: "info", message: tt("Machi 币不足，请先充值。", "Not enough Machi Coins — top up first.", "Machi コインが不足しています。チャージしてください。") });
      goTopUp(ctx.requiredPoints ?? p.walletPricePoints);
      return;
    }
    setBusy(true);
    try {
      const r = await guide.purchase(p.slug, { paymentMethod: "wallet" });
      if (r.status === "fulfilled") {
        pushToast({ kind: "success", message: r.message || (locale === "en" ? "Purchased with Machi Coins." : locale === "ja" ? "Machi コインで購入しました。" : "已用 Machi 币购买。") });
        q.refetch();
      }
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if (code === "INSUFFICIENT_POINTS") {
        pushToast({ kind: "info", message: tt("Machi 币不足，请先充值。", "Not enough Machi Coins — top up first.", "Machi コインが不足しています。チャージしてください。") });
        goTopUp(p.pointsContext?.requiredPoints ?? p.walletPricePoints);
      } else {
        pushToast({ kind: "error", message: locale === "en" ? "Action failed. Please try again later." : locale === "ja" ? "操作に失敗しました。" : "操作失败，请稍后再试。" });
      }
    } finally {
      setBusy(false);
    }
  };

  const onDownload = async () => {
    if (!user) return openAuthPrompt("generic");
    setBusy(true);
    try {
      const r = await guide.downloadUrl(p.slug);
      window.open(r.downloadUrl, "_blank", "noopener,noreferrer");
    } catch {
      pushToast({ kind: "error", message: locale === "en" ? "Download link failed." : locale === "ja" ? "ダウンロードリンクの作成に失敗しました。" : "下载链接生成失败。" });
    } finally {
      setBusy(false);
    }
  };

  // The purchase note must describe how THIS product is actually bought — a
  // points/free/member product should not claim "checkout through Stripe".
  const purchaseNote = p.isService
    ? tt(
        "服务类按预约处理，价格由服务器决定，不进入会员免费权益（会员可享折扣或优先处理）。",
        "Services are handled by booking with server-set prices, and aren't included as free member resources (member discounts or priority may apply).",
        "個別サービスは予約制で価格はサーバー側で管理され、メンバー無料対象には含まれません（割引や優先対応の対象になる場合があります）。",
      )
    : (() => {
        const ways: string[] = [];
        if (p.isMemberIncluded) ways.push(tt("会员可直接解锁", "membership", "メンバー特典"));
        if (p.canBuyWithPoints) ways.push(tt("Machi 币", "Machi Coins", "Machi コイン"));
        if (!p.isFree) ways.push(tt("Stripe 安全结账", "secure Stripe checkout", "Stripe 決済"));
        if (p.isFree && !p.isMemberIncluded) ways.push(tt("登录后免费查看", "free after sign-in", "ログイン後無料"));
        const waysText = ways.length ? ways.join(" / ") : tt("即将开放", "coming soon", "近日公開");
        return tt(
          `此数字资料可通过 ${waysText} 获取，价格由服务器决定；一经解锁请勿外传。`,
          `This digital resource is available via ${waysText}; prices are set by the server and content must not be redistributed after unlock.`,
          `このデジタル資料は ${waysText} で入手できます。価格はサーバー側で管理され、解放後の再配布は禁止です。`,
        );
      })();

  return (
    <GuideShell back={{ href: "/guide/services", label: copy.services.title }}>
      <div className="px-4 py-4 sm:px-6">
        <section className="rounded-kx-lg border border-kx-stroke/50 bg-kx-card p-5">
          <div className="flex items-start gap-4">
            <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-kx-accentSoft text-kx-accent">
              <Icon className="h-7 w-7" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex flex-wrap items-center gap-2 text-[11px] font-bold text-kx-muted">
                <span className="rounded-full bg-kx-soft px-2 py-0.5">{typeLabel}</span>
                <span className="rounded-full bg-kx-soft px-2 py-0.5">{p.isService ? copy.services.humanTitle : copy.services.digitalTitle}</span>
                {p.isMemberIncluded && !p.isService ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-kx-accentSoft px-2 py-0.5 text-kx-accent"><BadgeCheck className="h-3 w-3" />{t("mem_exclusive")}</span>
                ) : null}
                {p.isMemberDiscount ? <span className="rounded-full bg-emerald-400/15 px-2 py-0.5 text-emerald-600 dark:text-emerald-400">{locale === "en" ? "Member discount" : locale === "ja" ? "メンバー割引" : "会员折扣"}</span> : null}
              </div>
              <h1 className="text-xl font-black leading-tight text-kx-text sm:text-2xl">{p.title}</h1>
              {p.subtitle ? <p className="mt-1 text-sm text-kx-subtle">{p.subtitle}</p> : null}
            </div>
          </div>

          {/* Price + primary CTA */}
          <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-kx-stroke/40 pt-4">
            <div>
              <span className="text-2xl font-black text-kx-text">
                {priceLabel || t("guide_appointment")}
              </span>
              {p.isMemberDiscount && (p.memberPrice || p.memberEffectivePrice) ? (
                <span className="ml-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                  {p.memberPriceLabel || `${t("mem_exclusive")} ${formatPrice({ price: p.memberEffectivePrice || p.memberPrice, currency: p.currency }, "CNY", locale)}`}
                </span>
              ) : null}
            </div>
            {canAccess ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-400/15 px-4 py-2 text-sm font-bold text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-4 w-4" /> {access?.memberUnlocked ? (locale === "en" ? "Unlocked by membership" : locale === "ja" ? "メンバー特典で解放済み" : "会员已解锁") : (locale === "en" ? "Purchased" : locale === "ja" ? "購入済み" : "已购买")}
              </span>
            ) : p.isService ? null : isComing ? (
              <button type="button" disabled className="kx-button-primary h-10 px-5 opacity-60">{locale === "en" ? "Coming soon" : locale === "ja" ? "近日公開" : "即将开放"}</button>
            ) : !deliverableReady ? (
              <button type="button" disabled className="kx-button-primary h-10 px-5 opacity-60">{tt("内容准备中", "Content in preparation", "コンテンツ準備中")}</button>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={onBuy} disabled={busy} className="kx-button-primary h-10 px-5 disabled:opacity-60">
                  {p.ctaLabel || (p.isFree ? (user ? (locale === "en" ? "View for free" : locale === "ja" ? "無料で見る" : "免费查看") : (locale === "en" ? "Log in to view" : locale === "ja" ? "ログインして見る" : "登录后查看")) : `${locale === "en" ? "Buy" : locale === "ja" ? "購入" : "购买"} ${priceLabel}`)}
                </button>
                {p.canBuyWithPoints ? (
                  <button type="button" onClick={onBuyWithPoints} disabled={busy} className="kx-button-ghost inline-flex h-10 items-center gap-1.5 px-4 disabled:opacity-60">
                    <Coins className="h-4 w-4 text-amber-500" />
                    {(p.pointsContext?.requiredPoints ?? p.walletPricePoints ?? 0).toLocaleString()} {locale === "en" ? "coins" : "币"}
                  </button>
                ) : null}
              </div>
            )}
          </div>
          {deliverableReady && !canAccess && !isComing && p.canBuyWithPoints && p.pointsContext && !p.pointsContext.sufficient ? (
            <p className="mt-2 text-xs text-kx-muted">
              {(() => {
                const bal = p.pointsContext.currentBalance;
                const need = p.pointsContext.requiredPoints ?? p.walletPricePoints ?? 0;
                const deficit = Math.max(0, need - bal);
                return tt(
                  `当前余额 ${bal.toLocaleString()} 币，还差 ${deficit.toLocaleString()} 币。`,
                  `Your balance: ${bal.toLocaleString()} coins — ${deficit.toLocaleString()} short.`,
                  `残高：${bal.toLocaleString()} コイン — ${deficit.toLocaleString()} コイン不足。`,
                );
              })()}{" "}
              <button
                type="button"
                onClick={() => goTopUp(p.pointsContext?.requiredPoints ?? p.walletPricePoints)}
                className="font-semibold text-kx-accent hover:underline"
              >
                {tt("去充值", "Top up", "チャージ")}
              </button>
            </p>
          ) : null}

          {p.description ? (
            <p className="mt-4 whitespace-pre-line border-t border-kx-stroke/40 pt-4 text-[15px] leading-8 text-kx-text/90">
              {p.description}
            </p>
          ) : null}

          <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
            {p.targetAudience ? <Info label={locale === "en" ? "Best for" : locale === "ja" ? "対象" : "适合人群"} value={p.targetAudience} /> : null}
            {p.deliveryMethod ? <Info label={locale === "en" ? "Delivery" : locale === "ja" ? "提供方法" : "交付方式"} value={p.deliveryMethod} /> : null}
            {p.refundPolicy ? <Info label={locale === "en" ? "Refund / cancellation" : locale === "ja" ? "返金・キャンセル" : "退款/取消"} value={p.refundPolicy} /> : null}
          </dl>
        </section>

        {/* Preview (non-entitled) */}
        {!canAccess && p.previewContent ? (
          <section className="mt-3 rounded-kx-lg border border-kx-stroke/50 bg-kx-card p-5">
            <h2 className="mb-2 inline-flex items-center gap-1.5 text-base font-black text-kx-text"><Lock className="h-4 w-4 text-kx-muted" /> {locale === "en" ? "Preview" : locale === "ja" ? "プレビュー" : "预览内容"}</h2>
            <p className="whitespace-pre-line text-[15px] leading-8 text-kx-subtle">{p.previewContent}</p>
            {!p.isService && p.hasPurchaseContent ? (
              <p className="mt-3 text-xs text-kx-muted">{locale === "en" ? `Purchase to view the full content${p.hasFile ? " and download files" : ""}.` : locale === "ja" ? `購入後、全文${p.hasFile ? "とファイル" : ""}を確認できます。` : `购买后可查看完整内容${p.hasFile ? "并下载文件" : ""}。`}</p>
            ) : null}
          </section>
        ) : null}

        {/* Purchased content (entitled) */}
        {canAccess && (p.purchaseContent || p.fileDownloadAvailable || p.hasFile || p.fileUrl) ? (
          <section className="mt-3 rounded-kx-lg border border-emerald-400/30 bg-emerald-400/[0.06] p-5">
            <h2 className="mb-2 inline-flex items-center gap-1.5 text-base font-black text-kx-text"><CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" /> {locale === "en" ? "Purchased content" : locale === "ja" ? "購入済みコンテンツ" : "已购买内容"}</h2>
            {p.purchaseContent ? <p className="whitespace-pre-line text-[15px] leading-8 text-kx-text/90">{p.purchaseContent}</p> : null}
            {p.fileDownloadAvailable || p.hasFile || p.fileUrl ? (
              <button type="button" onClick={onDownload} disabled={busy} className="kx-button-primary mt-3 inline-flex h-10 px-5 disabled:opacity-60">
                <Download className="h-4 w-4" /> {locale === "en" ? "Download" : locale === "ja" ? "ダウンロード" : "下载"}{p.fileName ? `（${p.fileName}）` : ""}
              </button>
            ) : null}
            <Link href="/guide/my-library" className="mt-3 block text-sm font-semibold text-kx-accent hover:underline">
              {tt("在「我的资料库」查看全部已购 →", "See all in My library →", "「マイライブラリ」で全て見る →")}
            </Link>
          </section>
        ) : null}

        {/* Service booking */}
        {p.isService && !canAccess ? (
          <ServiceBooking product={p} signedIn={!!user} onNeedAuth={() => openAuthPrompt("generic")}
            onSubmitted={(m) => pushToast({ kind: "success", message: m })}
            onError={(m) => pushToast({ kind: "error", message: m })} />
        ) : null}

        <div className="mt-3 rounded-kx-lg border border-kx-stroke/50 bg-kx-card p-4 text-xs leading-6 text-kx-muted">
          <p className="mb-1 inline-flex items-center gap-1.5 font-bold text-kx-subtle"><ShieldCheck className="h-3.5 w-3.5 text-kx-accent" /> {locale === "en" ? "Purchase and service notes" : locale === "ja" ? "購入・サービスに関する説明" : "购买与服务说明"}</p>
          {purchaseNote}
          {p.notes ? <span className="mt-1 block">{p.notes}</span> : null}
        </div>

        <ProductReviews slug={p.slug} signedIn={!!user} onNeedAuth={() => openAuthPrompt("generic")} />
      </div>
    </GuideShell>
  );
}

// ---------------------------------------------------------------------------
// Reviews (BE4 UGC) — rating bar + 5-bucket distribution + paginated list +
// owner/member "write review" form + helpful vote / report.
// ---------------------------------------------------------------------------

function Stars({ value, size = 14, className = "" }: { value: number; size?: number; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-0.5 ${className}`} aria-hidden>
      {[1, 2, 3, 4, 5].map((s) => (
        <Star
          key={s}
          style={{ width: size, height: size }}
          className={s <= Math.round(value) ? "fill-amber-400 text-amber-400" : "fill-transparent text-kx-stroke"}
        />
      ))}
    </span>
  );
}

function ProductReviews({ slug, signedIn, onNeedAuth }: { slug: string; signedIn: boolean; onNeedAuth: () => void }) {
  const { locale } = useI18n();
  const qc = useQueryClient();
  const pushToast = useToasts((s) => s.push);
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState(false);
  const tt = (zh: string, en: string, ja: string) => (locale === "en" ? en : locale === "ja" ? ja : zh);
  const PAGE = 10;

  const list = useQuery({
    queryKey: ["guide", "product-reviews", slug, page],
    queryFn: () => guide.productReviews(slug, { limit: PAGE, offset: page * PAGE }),
    enabled: slug.length > 0,
    staleTime: 15_000,
  });

  const mine = useQuery({
    queryKey: ["guide", "product-review-me", slug],
    queryFn: () => guide.myProductReview(slug),
    enabled: slug.length > 0 && signedIn,
    staleTime: 15_000,
  });

  const refetchAll = () => {
    qc.invalidateQueries({ queryKey: ["guide", "product-reviews", slug] });
    qc.invalidateQueries({ queryKey: ["guide", "product-review-me", slug] });
  };

  const summary = list.data?.summary;
  const items = list.data?.items || [];
  const total = summary?.ratingCount || 0;
  const maxBucket = Math.max(1, ...(summary?.distribution || []).map((d) => d.count));
  // A withdrawn review is a soft-delete: the server still returns the row so the
  // aggregate can be reconciled, but for the UI it means "no review" — otherwise
  // MyReviewCard re-renders after a withdraw (mislabeled 审核中) and the write
  // form never comes back. Treat withdrawn as absent so we fall through to the
  // ReviewForm / canReview branch.
  const raw = mine.data?.review || null;
  const myReview = raw && raw.status !== "withdrawn" ? raw : null;
  const canReview = !!mine.data?.canReview;

  return (
    <section className="mt-3 rounded-kx-lg border border-kx-stroke/50 bg-kx-card p-5">
      <h2 className="text-base font-black text-kx-text">
        {tt("用户评价", "Reviews", "レビュー")}
        {total > 0 ? <span className="ml-2 text-sm font-semibold text-kx-muted">{total}</span> : null}
      </h2>

      {/* Summary: average + distribution */}
      {list.isLoading ? (
        <div className="mt-3"><InlineLoading /></div>
      ) : list.isError ? (
        <p className="mt-3 text-sm text-kx-muted">{tt("评价加载失败，请稍后再试。", "Failed to load reviews. Please try again later.", "レビューの読み込みに失敗しました。")}</p>
      ) : (
        <>
          {total > 0 ? (
            <div className="mt-3 flex flex-col gap-4 border-t border-kx-stroke/40 pt-4 sm:flex-row sm:items-center">
              <div className="flex shrink-0 flex-col items-center justify-center sm:w-32">
                <span className="text-4xl font-black leading-none text-kx-text">{(summary?.ratingAvg ?? 0).toFixed(1)}</span>
                <Stars value={summary?.ratingAvg ?? 0} size={16} className="mt-1.5" />
                <span className="mt-1 text-xs text-kx-muted">{tt(`${total} 条评价`, `${total} review${total === 1 ? "" : "s"}`, `${total} 件のレビュー`)}</span>
              </div>
              <div className="flex-1 space-y-1.5">
                {(summary?.distribution || []).map((d) => (
                  <div key={d.star} className="flex items-center gap-2 text-xs text-kx-muted">
                    <span className="inline-flex w-8 shrink-0 items-center gap-0.5 tabular-nums">{d.star}<Star className="h-3 w-3 fill-amber-400 text-amber-400" /></span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-kx-soft">
                      <span className="block h-full rounded-full bg-amber-400" style={{ width: `${Math.round((d.count / maxBucket) * 100)}%` }} />
                    </span>
                    <span className="w-8 shrink-0 text-right tabular-nums">{d.count}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="mt-3 border-t border-kx-stroke/40 pt-4 text-sm text-kx-muted">{tt("还没有评价，成为第一个评价的人。", "No reviews yet — be the first to leave one.", "まだレビューはありません。最初のレビューを投稿しましょう。")}</p>
          )}

          {/* My review / write form */}
          <div className="mt-4 border-t border-kx-stroke/40 pt-4">
            {!signedIn ? (
              canReview ? null : (
                <button type="button" onClick={onNeedAuth} className="kx-button-ghost h-9 px-4 text-sm">
                  {tt("登录后评价", "Log in to review", "ログインしてレビュー")}
                </button>
              )
            ) : myReview && !editing ? (
              <MyReviewCard
                review={myReview}
                onEdit={() => setEditing(true)}
                onDeleted={() => { refetchAll(); pushToast({ kind: "success", message: tt("评价已撤回。", "Review withdrawn.", "レビューを取り消しました。") }); }}
                onError={(m) => pushToast({ kind: "error", message: m })}
              />
            ) : canReview ? (
              <ReviewForm
                slug={slug}
                initial={editing ? myReview : null}
                onCancel={editing ? () => setEditing(false) : undefined}
                onSubmitted={(m) => { setEditing(false); refetchAll(); pushToast({ kind: "success", message: m }); }}
                onError={(m) => pushToast({ kind: "error", message: m })}
              />
            ) : (
              <p className="text-sm text-kx-muted">{tt("购买或解锁后可写评价。", "Purchase or unlock this resource to write a review.", "購入または解放後にレビューを書けます。")}</p>
            )}
          </div>

          {/* Published list */}
          {items.length > 0 ? (
            <ul className="mt-4 space-y-4 border-t border-kx-stroke/40 pt-4">
              {items.map((r) => (
                <ReviewRow
                  key={r.id}
                  review={r}
                  signedIn={signedIn}
                  onNeedAuth={onNeedAuth}
                  onChanged={refetchAll}
                  onError={(m) => pushToast({ kind: "error", message: m })}
                  onInfo={(m) => pushToast({ kind: "info", message: m })}
                />
              ))}
            </ul>
          ) : null}

          {/* Pagination */}
          {(page > 0 || list.data?.hasMore) ? (
            <div className="mt-4 flex items-center justify-between border-t border-kx-stroke/40 pt-4">
              <button type="button" disabled={page === 0} onClick={() => setPage((n) => Math.max(0, n - 1))} className="kx-button-ghost h-9 px-4 text-sm disabled:opacity-40">
                {tt("上一页", "Previous", "前へ")}
              </button>
              <span className="text-xs text-kx-muted">{tt(`第 ${page + 1} 页`, `Page ${page + 1}`, `${page + 1} ページ`)}</span>
              <button type="button" disabled={!list.data?.hasMore} onClick={() => setPage((n) => n + 1)} className="kx-button-ghost h-9 px-4 text-sm disabled:opacity-40">
                {tt("下一页", "Next", "次へ")}
              </button>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

function reviewerName(review: GuideReview, locale: string): string {
  if (review.anonymous || !review.author) return locale === "en" ? "Anonymous" : locale === "ja" ? "匿名ユーザー" : "匿名用户";
  return review.author.displayName || review.author.handle || (locale === "en" ? "User" : locale === "ja" ? "ユーザー" : "用户");
}

function formatReviewDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString();
}

function ReviewRow({
  review, signedIn, onNeedAuth, onChanged, onError, onInfo,
}: {
  review: GuideReview;
  signedIn: boolean;
  onNeedAuth: () => void;
  onChanged: () => void;
  onError: (m: string) => void;
  onInfo: (m: string) => void;
}) {
  const { locale } = useI18n();
  const tt = (zh: string, en: string, ja: string) => (locale === "en" ? en : locale === "ja" ? ja : zh);
  const [voted, setVoted] = useState(review.viewerVoted);
  const [helpful, setHelpful] = useState(review.helpfulCount);
  const [reported, setReported] = useState(false);
  const [busy, setBusy] = useState(false);
  const name = reviewerName(review, locale);

  const toggleHelpful = async () => {
    if (!signedIn) return onNeedAuth();
    if (review.isMine) return;
    const next = !voted;
    setBusy(true);
    // Optimistic; reconcile from the authoritative count the server returns.
    setVoted(next);
    setHelpful((n) => Math.max(0, n + (next ? 1 : -1)));
    try {
      const r = await guide.voteHelpful(review.id, next);
      setVoted(r.viewerVoted);
      setHelpful(r.helpfulCount);
    } catch (err) {
      setVoted(!next);
      setHelpful((n) => Math.max(0, n + (next ? -1 : 1)));
      const code = err instanceof APIError ? err.code : "";
      onError(code === "cannot_vote_own_review"
        ? tt("不能给自己的评价投票。", "You can't vote on your own review.", "自分のレビューには投票できません。")
        : tt("操作失败，请稍后再试。", "Action failed. Please try again later.", "操作に失敗しました。"));
    } finally {
      setBusy(false);
    }
  };

  const report = async () => {
    if (!signedIn) return onNeedAuth();
    setBusy(true);
    try {
      const r = await guide.reportReview(review.id, { reason: "other" });
      setReported(true);
      onInfo(r.deduped
        ? tt("你已举报过该评价。", "You have already reported this review.", "このレビューは既に通報済みです。")
        : tt("已举报，感谢反馈。", "Reported. Thanks for the feedback.", "通報しました。ご協力ありがとうございます。"));
    } catch {
      onError(tt("举报失败，请稍后再试。", "Report failed. Please try again later.", "通報に失敗しました。"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="flex gap-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full bg-kx-soft text-xs font-bold text-kx-muted">
        {!review.anonymous && review.author?.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={review.author.avatarUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          name.slice(0, 1).toUpperCase()
        )}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-bold text-kx-text">{name}</span>
          {review.isMine ? <span className="rounded-full bg-kx-accentSoft px-1.5 py-0.5 text-[10px] font-bold text-kx-accent">{tt("我", "You", "あなた")}</span> : null}
          <Stars value={review.rating} size={12} />
          <span className="text-[11px] text-kx-muted">{formatReviewDate(review.createdAt)}</span>
        </div>
        {review.body ? <p className="mt-1 whitespace-pre-line text-sm leading-6 text-kx-text/90">{review.body}</p> : null}
        <div className="mt-1.5 flex items-center gap-4 text-xs text-kx-muted">
          <button
            type="button"
            onClick={toggleHelpful}
            disabled={busy || review.isMine}
            className={`inline-flex items-center gap-1 disabled:opacity-50 ${voted ? "font-semibold text-kx-accent" : "hover:text-kx-text"}`}
            title={review.isMine ? tt("不能给自己的评价投票", "You can't vote on your own review", "自分のレビューには投票できません") : undefined}
          >
            <ThumbsUp className="h-3.5 w-3.5" /> {tt("有帮助", "Helpful", "参考になった")}{helpful > 0 ? ` (${helpful})` : ""}
          </button>
          {!review.isMine ? (
            <button type="button" onClick={report} disabled={busy || reported} className="inline-flex items-center gap-1 hover:text-kx-text disabled:opacity-50">
              <Flag className="h-3.5 w-3.5" /> {reported ? tt("已举报", "Reported", "通報済み") : tt("举报", "Report", "通報")}
            </button>
          ) : null}
        </div>
      </div>
    </li>
  );
}

function MyReviewCard({
  review, onEdit, onDeleted, onError,
}: {
  review: GuideReview;
  onEdit: () => void;
  onDeleted: () => void;
  onError: (m: string) => void;
}) {
  const { locale } = useI18n();
  const tt = (zh: string, en: string, ja: string) => (locale === "en" ? en : locale === "ja" ? ja : zh);
  const [busy, setBusy] = useState(false);
  const statusLabel =
    review.status === "published" ? tt("已发布", "Published", "公開中")
    : review.status === "rejected" ? tt("未通过审核", "Not approved", "審査に通りませんでした")
    : review.status === "hidden" ? tt("已隐藏", "Hidden", "非表示")
    : review.status === "withdrawn" ? tt("已撤回", "Withdrawn", "取り消し済み")
    : tt("审核中", "Pending review", "審査中");

  const remove = async () => {
    setBusy(true);
    try {
      await guide.deleteMyReview(review.id);
      onDeleted();
    } catch {
      onError(tt("撤回失败，请稍后再试。", "Failed to withdraw. Please try again later.", "取り消しに失敗しました。"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-kx border border-kx-stroke/50 bg-kx-soft/40 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-bold text-kx-text">{tt("我的评价", "My review", "自分のレビュー")}</span>
        <span className="rounded-full bg-kx-soft px-2 py-0.5 text-[11px] font-bold text-kx-muted">{statusLabel}</span>
        <Stars value={review.rating} size={13} />
      </div>
      {review.body ? <p className="mt-1.5 whitespace-pre-line text-sm leading-6 text-kx-text/90">{review.body}</p> : null}
      {review.status !== "published" ? (
        <p className="mt-1.5 text-xs text-kx-muted">{tt("评价将在审核通过后公开展示。", "Your review will be shown publicly after it is approved.", "レビューは審査通過後に公開されます。")}</p>
      ) : null}
      <div className="mt-2.5 flex items-center gap-2">
        <button type="button" onClick={onEdit} disabled={busy} className="kx-button-ghost inline-flex h-8 items-center gap-1 px-3 text-xs disabled:opacity-60">
          <Pencil className="h-3.5 w-3.5" /> {tt("修改", "Edit", "編集")}
        </button>
        <button type="button" onClick={remove} disabled={busy} className="inline-flex h-8 items-center gap-1 rounded-kx px-3 text-xs font-semibold text-red-500 hover:bg-red-500/10 disabled:opacity-60">
          <Trash2 className="h-3.5 w-3.5" /> {tt("撤回", "Withdraw", "取り消し")}
        </button>
      </div>
    </div>
  );
}

function ReviewForm({
  slug, initial, onCancel, onSubmitted, onError,
}: {
  slug: string;
  initial: GuideReview | null;
  onCancel?: () => void;
  onSubmitted: (m: string) => void;
  onError: (m: string) => void;
}) {
  const { locale } = useI18n();
  const tt = (zh: string, en: string, ja: string) => (locale === "en" ? en : locale === "ja" ? ja : zh);
  const [rating, setRating] = useState(initial?.rating || 0);
  const [hover, setHover] = useState(0);
  const [body, setBody] = useState(initial?.body || "");
  const [anonymous, setAnonymous] = useState(initial?.anonymous ?? false);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (rating < 1) return onError(tt("请先选择评分。", "Please pick a rating.", "評価を選択してください。"));
    setBusy(true);
    try {
      const r = await guide.submitReview(slug, { rating, body: body.trim(), anonymous });
      onSubmitted(r.message || tt("评价已提交，将在审核通过后展示。", "Review submitted — it will appear after approval.", "レビューを送信しました。審査通過後に表示されます。"));
    } catch (err) {
      const code = err instanceof APIError ? err.code : "";
      onError(code === "rate_limited"
        ? tt("评价过于频繁，请稍后再试。", "Too many reviews — please try again later.", "レビューの送信が多すぎます。しばらくしてからお試しください。")
        : code === "not_purchased"
        ? tt("购买或解锁后才能评价。", "Purchase or unlock this resource to review it.", "購入または解放後にレビューできます。")
        : tt("提交失败，请稍后再试。", "Submission failed. Please try again later.", "送信に失敗しました。"));
    } finally {
      setBusy(false);
    }
  };

  const display = hover || rating;

  return (
    <div className="rounded-kx border border-kx-stroke/50 bg-kx-soft/40 p-4">
      <p className="text-sm font-bold text-kx-text">{initial ? tt("修改评价", "Edit your review", "レビューを編集") : tt("写评价", "Write a review", "レビューを書く")}</p>
      <div className="mt-2 flex items-center gap-1" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setRating(s)}
            onMouseEnter={() => setHover(s)}
            aria-label={tt(`${s} 星`, `${s} star${s === 1 ? "" : "s"}`, `${s} つ星`)}
            className="p-0.5"
          >
            <Star className={`h-6 w-6 ${s <= display ? "fill-amber-400 text-amber-400" : "fill-transparent text-kx-stroke"}`} />
          </button>
        ))}
      </div>
      <textarea
        className="kx-input mt-2 min-h-20 w-full px-3 py-2 text-sm"
        value={body}
        maxLength={2000}
        onChange={(e) => setBody(e.target.value)}
        placeholder={tt("分享你的使用体验（可选）", "Share your experience (optional)", "感想を書いてください（任意）")}
      />
      <label className="mt-2 flex cursor-pointer items-center gap-2 text-xs text-kx-muted">
        <input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} className="h-3.5 w-3.5 accent-kx-accent" />
        {tt("匿名发布", "Post anonymously", "匿名で投稿")}
      </label>
      <p className="mt-2 text-[11px] leading-5 text-kx-muted">
        {tt("请勿发布个人隐私或未经证实的指控；评价将在审核通过后展示。", "Do not post private information or unverified accusations; reviews appear after approval.", "個人情報や未確認の告発は投稿しないでください。レビューは審査通過後に表示されます。")}
      </p>
      <div className="mt-2.5 flex items-center gap-2">
        <button type="button" onClick={submit} disabled={busy} className="kx-button-primary h-9 px-5 text-sm disabled:opacity-60">
          {busy ? tt("提交中...", "Submitting...", "送信中...") : initial ? tt("更新评价", "Update review", "レビューを更新") : tt("提交评价", "Submit review", "レビューを送信")}
        </button>
        {onCancel ? (
          <button type="button" onClick={onCancel} disabled={busy} className="kx-button-ghost h-9 px-4 text-sm disabled:opacity-60">
            {tt("取消", "Cancel", "キャンセル")}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="shrink-0 font-semibold text-kx-muted">{label}</dt>
      <dd className="text-kx-subtle">{value}</dd>
    </div>
  );
}

function ServiceBooking({
  product, signedIn, onNeedAuth, onSubmitted, onError,
}: {
  product: GuideProduct;
  signedIn: boolean;
  onNeedAuth: () => void;
  onSubmitted: (m: string) => void;
  onError: (m: string) => void;
}) {
  const { locale } = useI18n();
  const [form, setForm] = useState<Record<string, string>>({ contactMethod: "wechat", serviceCity: "Tokyo" });
  const [busy, setBusy] = useState(false);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));
  const input = "kx-input h-9 w-full px-2 text-sm";

  const submit = async () => {
    if (!signedIn) return onNeedAuth();
    if (!(form.contactValue || "").trim()) return onError(locale === "en" ? "Please enter your contact details." : locale === "ja" ? "連絡先を入力してください。" : "请填写联系方式");
    setBusy(true);
    try {
      const r = await guide.submitServiceRequest({
        productId: product.slug,
        serviceType: product.productType,
        contactMethod: form.contactMethod,
        contactValue: form.contactValue,
        serviceCity: form.serviceCity,
        preferredDate: form.preferredDate,
        preferredTime: form.preferredTime,
        language: form.language,
        currentSituation: form.currentSituation,
        requestDetail: form.requestDetail,
      });
      onSubmitted(r.message || (locale === "en" ? "Booking request submitted. We will contact you soon." : locale === "ja" ? "予約リクエストを送信しました。近日中にご連絡します。" : "预约已提交，我们会尽快联系你。"));
      setForm({ contactMethod: "wechat", serviceCity: "Tokyo" });
    } catch {
      onError(locale === "en" ? "Submission failed. Please try again later." : locale === "ja" ? "送信に失敗しました。しばらくしてからもう一度お試しください。" : "提交失败，请稍后再试。");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mt-3 rounded-kx-lg border border-kx-accent/30 bg-kx-card p-5">
      <h2 className="text-base font-black text-kx-text">{locale === "en" ? "Book a consultation" : locale === "ja" ? "相談を予約" : "预约咨询"}</h2>
      <p className="mt-1 text-xs leading-6 text-kx-muted">{locale === "en" ? "Flow: submit request -> Machi confirms needs -> confirm time/place -> payment/confirmation -> service completed -> follow-up." : locale === "ja" ? "流れ：予約送信 → Machi が内容確認 → 日時・場所を確定 → 支払い/確認 → サービス実施 → フォローアップ。" : "流程：提交预约 → Machi 确认需求 → 确认时间地点 → 支付/确认 → 完成服务 → 后续反馈。"}</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label={locale === "en" ? "Contact method" : locale === "ja" ? "連絡方法" : "联系方式"}>
          <select className={input} value={form.contactMethod} onChange={set("contactMethod")}>
            <option value="wechat">WeChat</option><option value="email">{locale === "en" ? "Email" : locale === "ja" ? "メール" : "邮箱"}</option>
            <option value="line">LINE</option><option value="phone">{locale === "en" ? "Phone" : locale === "ja" ? "電話" : "电话"}</option>
          </select>
        </Field>
        <Field label={locale === "en" ? "Contact ID / number" : locale === "ja" ? "連絡先ID / 番号" : "联系账号 / 号码"}><input className={input} value={form.contactValue || ""} onChange={set("contactValue")} placeholder={locale === "en" ? "WeChat ID / email" : locale === "ja" ? "WeChat ID / メール" : "如微信号 / 邮箱"} /></Field>
        <Field label={locale === "en" ? "Service city" : locale === "ja" ? "対応都市" : "服务城市"}>
          <select className={input} value={form.serviceCity} onChange={set("serviceCity")}>
            {SERVICE_CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
        <Field label={locale === "en" ? "Language" : locale === "ja" ? "言語" : "语言"}><input className={input} value={form.language || ""} onChange={set("language")} placeholder="中文 / 日本語 / English" /></Field>
        <Field label={locale === "en" ? "Preferred date" : locale === "ja" ? "希望日" : "期望日期"}><input className={input} type="date" value={form.preferredDate || ""} onChange={set("preferredDate")} /></Field>
        <Field label={locale === "en" ? "Preferred time" : locale === "ja" ? "希望時間" : "期望时间"}><input className={input} value={form.preferredTime || ""} onChange={set("preferredTime")} placeholder={locale === "en" ? "Morning / 14:00" : locale === "ja" ? "午前 / 14:00" : "如 上午 / 14:00"} /></Field>
        <div className="sm:col-span-2"><Field label={locale === "en" ? "Current situation" : locale === "ja" ? "現在の状況" : "当前情况"}><textarea className="kx-input min-h-16 w-full px-2 py-1.5 text-sm" value={form.currentSituation || ""} onChange={set("currentSituation")} placeholder={locale === "en" ? "Briefly describe your situation" : locale === "ja" ? "状況を簡単にご記入ください" : "简单描述你的情况"} /></Field></div>
        <div className="sm:col-span-2"><Field label={locale === "en" ? "Request details" : locale === "ja" ? "具体的な依頼内容" : "具体需求"}><textarea className="kx-input min-h-16 w-full px-2 py-1.5 text-sm" value={form.requestDetail || ""} onChange={set("requestDetail")} placeholder={locale === "en" ? "What would you like us to help with?" : locale === "ja" ? "どのようなサポートが必要ですか？" : "你希望我们协助的具体内容"} /></Field></div>
      </div>
      <button type="button" onClick={submit} disabled={busy} className="kx-button-primary mt-3 h-10 px-5 disabled:opacity-60">{busy ? (locale === "en" ? "Submitting..." : locale === "ja" ? "送信中..." : "提交中...") : (locale === "en" ? "Submit request" : locale === "ja" ? "予約を送信" : "提交预约")}</button>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-kx-muted">{label}</span>
      {children}
    </label>
  );
}
