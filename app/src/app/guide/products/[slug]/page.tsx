"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { BadgeCheck, CheckCircle2, Download, FileText, Lock, ShieldCheck, Wrench } from "lucide-react";
import { guide, GUIDE_PRODUCT_TYPE_LABELS, type GuideProduct } from "@/lib/guide";
import { GuideComingSoon, GuideShell, useGuideCountry } from "@/components/guide/GuideKit";
import { InlineLoading, ErrorState } from "@/components/design/States";
import { useSession, useAuthPrompt, useToasts } from "@/lib/store";
import { formatPrice } from "@/lib/format";
import { appLocaleToGuideLanguage, useI18n } from "@/lib/i18n";
import { guideUi } from "@/lib/guide-ui";

const SERVICE_CITIES = ["Tokyo", "Osaka", "Kyoto", "Yokohama", "Kobe", "Nagoya", "Fukuoka", "Other"];

export default function GuideProductPage() {
  const params = useParams();
  const slug = String(params?.slug || "");
  const user = useSession((s) => s.user);
  const country = useGuideCountry();
  const { locale, t } = useI18n();
  const language = appLocaleToGuideLanguage(locale);
  const copy = guideUi(locale);
  const openAuthPrompt = useAuthPrompt((s) => s.open);
  const pushToast = useToasts((s) => s.push);
  const [busy, setBusy] = useState(false);

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
  const priceLabel = formatPrice(p) || p.priceLabel;

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
                  {p.memberPriceLabel || `${t("mem_exclusive")} ${formatPrice({ price: p.memberEffectivePrice || p.memberPrice, currency: p.currency })}`}
                </span>
              ) : null}
            </div>
            {canAccess ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-400/15 px-4 py-2 text-sm font-bold text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-4 w-4" /> {access?.memberUnlocked ? (locale === "en" ? "Unlocked by membership" : locale === "ja" ? "メンバー特典で解放済み" : "会员已解锁") : (locale === "en" ? "Purchased" : locale === "ja" ? "購入済み" : "已购买")}
              </span>
            ) : p.isService ? null : isComing ? (
              <button type="button" disabled className="kx-button-primary h-10 px-5 opacity-60">{locale === "en" ? "Coming soon" : locale === "ja" ? "近日公開" : "即将开放"}</button>
            ) : (
              <button type="button" onClick={onBuy} disabled={busy} className="kx-button-primary h-10 px-5 disabled:opacity-60">
                {p.ctaLabel || (p.isFree ? (user ? (locale === "en" ? "View for free" : locale === "ja" ? "無料で見る" : "免费查看") : (locale === "en" ? "Log in to view" : locale === "ja" ? "ログインして見る" : "登录后查看")) : `${locale === "en" ? "Buy" : locale === "ja" ? "購入" : "购买"} ${priceLabel}`)}
              </button>
            )}
          </div>

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
        {canAccess && (p.purchaseContent || p.fileUrl) ? (
          <section className="mt-3 rounded-kx-lg border border-emerald-400/30 bg-emerald-400/[0.06] p-5">
            <h2 className="mb-2 inline-flex items-center gap-1.5 text-base font-black text-kx-text"><CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" /> {locale === "en" ? "Purchased content" : locale === "ja" ? "購入済みコンテンツ" : "已购买内容"}</h2>
            {p.purchaseContent ? <p className="whitespace-pre-line text-[15px] leading-8 text-kx-text/90">{p.purchaseContent}</p> : null}
            {p.fileUrl ? (
              <a href={p.fileUrl} target="_blank" rel="noopener noreferrer" className="kx-button-primary mt-3 inline-flex h-10 px-5">
                <Download className="h-4 w-4" /> {locale === "en" ? "Download" : locale === "ja" ? "ダウンロード" : "下载"}{p.fileName ? `（${p.fileName}）` : ""}
              </a>
            ) : null}
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
          {locale === "en" ? "Paid web content is checked out securely through Stripe, with prices decided by the server. Digital resources must not be redistributed after unlock; services are handled by booking and are not included as free member resources, though member discounts or priority may apply." : locale === "ja" ? "Web の有料コンテンツは Stripe で安全に決済され、価格はサーバー側で管理されます。デジタル資料は解放後の再配布を禁止します。個別サービスは予約制で、メンバー無料対象には含まれません（割引や優先対応の対象になる場合があります）。" : "Web 端付费内容通过 Stripe 安全结账，价格由服务器决定。数字资料一经解锁不外传；服务类按预约处理，不进入会员免费权益（会员可享折扣或优先处理）。"}
          {p.notes ? <span className="mt-1 block">{p.notes}</span> : null}
        </div>
      </div>
    </GuideShell>
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
