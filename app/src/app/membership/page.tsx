"use client";

// Machi Verified membership page (Web). Shows backend-configured plans + benefits,
// then runs the WeChat / Alipay purchase flow:
//   create-order -> show QR (WeChat) or redirect (Alipay) -> poll
//   order-status -> on "paid" refresh the membership.
// The amount is computed server-side; this page never sends a price.
// No existing styles are changed — it reuses the kx-* design tokens.

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, Check, CreditCard, Loader2, ShieldAlert } from "lucide-react";
import { api, APIError, isAuthRequiredError } from "@/lib/api";
import { AppShell } from "@/components/shell/AppShell";
import { VerifiedBadge } from "@/components/design/Avatar";
import { useAuthPrompt, useSession, useToasts } from "@/lib/store";
import { useI18n } from "@/lib/i18n";
import type { KXCreateOrderResult, KXMembershipPlan, PaymentProvider } from "@/lib/types";
import { formatPrice } from "@/lib/format";

const BENEFIT_KEYS = [
  "mem_benefit_badge",
  "mem_benefit_publish",
  "mem_benefit_priority",
  "mem_benefit_data",
  "mem_benefit_quota",
  "mem_benefit_review",
  "mem_benefit_sync",
  "mem_benefit_audience",
] as const;

const FALLBACK_PLANS: KXMembershipPlan[] = [{
  plan_key: "machi_verified_monthly",
  name_zh: "Machi 认证会员",
  name_en: "Machi Verified",
  name_ja: "Machi 認証メンバー",
  amount: 0,
  amount_cents: 0,
  currency: "CNY",
  priceLabel: "价格加载中",
  billing_cycle: "monthly",
  billingPeriod: "monthly",
}, {
  plan_key: "machi_verified_yearly",
  name: "Machi 认证会员 · 包年",
  name_zh: "Machi 认证会员 · 包年",
  name_en: "Machi Verified Yearly",
  name_ja: "Machi 認証メンバー 年額",
  amount: 0,
  amount_cents: 0,
  currency: "CNY",
  priceLabel: "价格加载中",
  billing_cycle: "yearly",
  billingPeriod: "yearly",
  isRecommended: true,
}];

export default function MembershipPage() {
  const user = useSession((s) => s.user);
  const setUser = useSession((s) => s.setUser);
  const openAuthPrompt = useAuthPrompt((s) => s.open);
  const pushToast = useToasts((s) => s.push);
  const { locale, t } = useI18n();
  const queryClient = useQueryClient();

  const planQuery = useQuery({
    queryKey: ["membership-plan"],
    queryFn: () => api.membershipPlan(),
  });
  const meQuery = useQuery({
    queryKey: ["membership-me", user?.id],
    queryFn: () => api.membershipMe(),
    enabled: !!user,
  });

  const [order, setOrder] = useState<KXCreateOrderResult | null>(null);
  const [creating, setCreating] = useState<PaymentProvider | null>(null);
  const [selectedPlanKey, setSelectedPlanKey] = useState<string>("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollStartedAtRef = useRef(0);

  const plans = planQuery.data?.plans?.length ? planQuery.data.plans : FALLBACK_PLANS;
  const selectedPlan = plans.find((p) => planKey(p) === selectedPlanKey) ?? plans.find((p) => p.isRecommended) ?? plans[0];
  const planUnavailable = !planQuery.isLoading && (planQuery.isError || plans.length === 0);
  // Only ever show payment methods the server reports as actually configured
  // (`available_providers`). Empty fallback during load so we never flash an
  // unconfigured method (WeChat/Alipay) that would "time out" on click — on
  // production only Stripe is configured, so only Stripe shows.
  const availableProviders: PaymentProvider[] = planQuery.isError ? [] : (planQuery.data?.available_providers ?? []);
  const membership = meQuery.data?.membership ?? null;
  const isActive = !!membership?.is_active;
  const benefitsQuery = useQuery({
    queryKey: ["membership-benefits"],
    queryFn: () => api.membershipBenefits(),
  });
  const insightsQuery = useQuery({
    queryKey: ["membership-insights", user?.id],
    queryFn: () => api.membershipInsights(),
    enabled: !!user && isActive,
  });

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const refreshAfterPaid = useCallback(async () => {
    stopPolling();
    setOrder(null);
    pushToast({ kind: "success", message: t("mem_pay_success") });
    await queryClient.invalidateQueries({ queryKey: ["membership-me"] });
    // Refresh the session user so the blue badge appears immediately.
    try {
      const me = await api.me();
      setUser(me);
    } catch {
      /* non-fatal */
    }
  }, [stopPolling, pushToast, t, queryClient, setUser]);

  // Poll the order status while an order is open.
  useEffect(() => {
    if (!order) return;
    stopPolling();
    pollStartedAtRef.current = Date.now();
    pollRef.current = setInterval(async () => {
      try {
        if (Date.now() - pollStartedAtRef.current > 180_000) {
          stopPolling();
          pushToast({ kind: "error", message: t("mem_order_timeout") });
          return;
        }
        const status = await api.orderStatus(order.orderNo);
        if (status.status === "paid" || status.membershipActive) {
          await refreshAfterPaid();
        } else if (status.status === "closed" || status.status === "failed") {
          stopPolling();
          setOrder(null);
          pushToast({ kind: "error", message: t("mem_pay_failed") });
        }
      } catch {
        /* transient; keep polling */
      }
    }, 4000);
    return stopPolling;
  }, [order, stopPolling, refreshAfterPaid, pushToast, t]);

  // Return from a redirect provider lands back here. Stripe carries a
  // session id we confirm server-side (settles the order without a
  // webhook); Alipay just lands with ?paid=1.
  useEffect(() => {
    if (typeof window === "undefined" || !user) return;
    const params = new URLSearchParams(window.location.search);
    const stripeSession = params.get("stripe_session");
    const refresh = async () => {
      await queryClient.invalidateQueries({ queryKey: ["membership-me"] });
      try {
        setUser(await api.me());
      } catch {
        /* non-fatal */
      }
    };
    if (stripeSession) {
      api.confirmStripe(stripeSession).then(refresh).catch(() => { refresh(); });
    } else if (params.get("paid") === "1") {
      refresh();
    }
  }, [user, queryClient, setUser]);

  // Self-heal: if the user is logged in but not active, ask the server to
  // reconcile any paid-but-pending Stripe order with Stripe (recovers a
  // payment whose redirect/webhook was missed). Runs once per mount.
  const reconciledRef = useRef(false);
  useEffect(() => {
    if (!user || reconciledRef.current || !meQuery.data) return;
    if (!meQuery.data.membership?.is_active) {
      reconciledRef.current = true;
      api
        .reconcileStripe()
        .then(async () => {
          await queryClient.invalidateQueries({ queryKey: ["membership-me"] });
          try {
            setUser(await api.me());
          } catch {
            /* non-fatal */
          }
        })
        .catch(() => {});
    }
  }, [user, meQuery.data, queryClient, setUser]);

  useEffect(() => {
    if (!selectedPlanKey && plans.length > 0) {
      setSelectedPlanKey(planKey(plans.find((p) => p.isRecommended) ?? plans[0]));
    }
  }, [plans, selectedPlanKey]);

  const startPurchase = async (provider: PaymentProvider) => {
    if (!user) {
      openAuthPrompt("generic");
      return;
    }
    setCreating(provider);
    try {
      if (provider === "stripe") {
        const result = await api.createMembershipCheckout(planKey(selectedPlan));
        if (result.checkoutUrl || result.checkout_url) {
          window.location.href = result.checkoutUrl || result.checkout_url;
          return;
        }
      }
      const result = await api.createPaymentOrder(provider, planKey(selectedPlan));
      setOrder(result);
      // Redirect providers (Alipay gateway / Stripe hosted Checkout) send
      // the browser straight to the provider. WeChat shows a QR instead.
      if ((provider === "alipay" || provider === "stripe") && result.pay_url && !result.mock) {
        window.location.href = result.pay_url;
      }
    } catch (err) {
      if (isAuthRequiredError(err)) {
        openAuthPrompt("generic");
        return;
      }
      pushToast({ kind: "error", message: (err as APIError).message });
    } finally {
      setCreating(null);
    }
  };

  const devMockConfirm = async () => {
    if (!order) return;
    try {
      await api.mockConfirmOrder(order.orderNo);
      await refreshAfterPaid();
    } catch (err) {
      pushToast({ kind: "error", message: (err as APIError).message });
    }
  };

  const priceLabel = planPriceLabel(selectedPlan, t);
  const benefitItems = benefitsQuery.data?.benefits ?? [];

  return (
    <AppShell requireAuth={false}>
      <header className="sticky top-0 z-30 kx-glass-bar px-3 py-2 flex items-center gap-2">
        <BadgeCheck className="w-5 h-5 text-kx-verified" />
        <h1 className="text-lg font-bold">{t("mem_title")}</h1>
      </header>

      <div className="px-3 sm:px-4 py-3 space-y-3">
        <>
            {/* Hero */}
            <section className="kx-card">
              <div className="flex items-center gap-2">
                <span className="text-xl font-bold text-kx-text">{t("mem_title")}</span>
                <VerifiedBadge />
              </div>
              <p className="mt-1 text-kx-subtle">{t("mem_subtitle")}</p>
              <div className="mt-3 text-2xl font-extrabold text-kx-text">{priceLabel}</div>
              {planUnavailable ? (
                <p className="mt-2 text-sm font-semibold text-kx-muted">{t("mem_service_unavailable")}</p>
              ) : null}
            </section>

            {/* Current status (logged-in) */}
            {user && membership ? (
              <section className="kx-card">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-kx-text">{t("mem_view_status")}</span>
                  </div>
                  <StatusPill status={membership.status} />
                </div>
                {isActive && membership.current_period_end ? (
                  <p className="mt-2 text-sm text-kx-subtle">
                    {t("mem_active_until")}{" "}
                    {new Date(membership.current_period_end).toLocaleDateString()}
                  </p>
                ) : null}
              </section>
            ) : null}

            {/* Member-only content stats */}
            {isActive && insightsQuery.data?.totals ? (
              <section className="kx-card">
                <h2 className="font-bold text-kx-text mb-3">{t("mem_insights_title")}</h2>
                <div className="grid grid-cols-3 gap-2 text-center">
                  {([
                    ["mem_insights_views", insightsQuery.data.totals.total_views ?? 0],
                    ["mem_insights_likes", insightsQuery.data.totals.total_likes ?? 0],
                    ["mem_insights_comments", insightsQuery.data.totals.total_comments ?? 0],
                    ["mem_insights_bookmarks", insightsQuery.data.totals.total_bookmarks ?? 0],
                    ["mem_insights_posts", insightsQuery.data.totals.post_count ?? 0],
                  ] as const).map(([key, val]) => (
                    <div key={key} className="rounded-kx-md bg-kx-soft p-2">
                      <div className="text-lg font-extrabold text-kx-text">{val}</div>
                      <div className="text-xs text-kx-muted">{t(key)}</div>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            <section className="kx-card">
              <h2 className="font-bold text-kx-text mb-3">{t("mem_select_plan")}</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {plans.map((p) => {
                  const active = planKey(p) === planKey(selectedPlan);
                  return (
                    <button
                      key={planKey(p)}
                      type="button"
                      onClick={() => setSelectedPlanKey(planKey(p))}
                      className={[
                        "rounded-kx-lg border p-4 text-left transition",
                        active ? "border-kx-accent bg-kx-accentSoft/60" : "border-kx-stroke/60 bg-kx-card hover:border-kx-accent/50",
                      ].join(" ")}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-black text-kx-text">{localizedPlanName(p, locale)}</div>
                          <div className="mt-1 text-xs text-kx-muted">{p.subtitle || periodLabel(p, t)}</div>
                        </div>
                        {p.isRecommended ? <span className="rounded-full bg-kx-accent px-2 py-0.5 text-[11px] font-bold text-white">{t("mem_recommended")}</span> : null}
                      </div>
                      <div className="mt-3 text-2xl font-black text-kx-text">{planPriceLabel(p, t)}</div>
                      {p.discountLabel || p.discount_label ? <div className="mt-1 text-xs font-bold text-emerald-600">{p.discountLabel || p.discount_label}</div> : null}
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Benefits */}
            <section className="kx-card">
              <h2 className="font-bold text-kx-text mb-2">{t("mem_benefits_title")}</h2>
              <ul className="space-y-2">
                {benefitItems.length > 0 ? benefitItems.map((benefit) => (
                  <li key={benefit.key} className="flex items-start gap-2 text-sm text-kx-text">
                    <Check className="w-4 h-4 mt-0.5 text-kx-verified shrink-0" />
                    <span>{benefit.key && BENEFIT_KEYS.includes(benefit.key as (typeof BENEFIT_KEYS)[number]) ? t(benefit.key as (typeof BENEFIT_KEYS)[number]) : benefit.title}</span>
                  </li>
                )) : BENEFIT_KEYS.map((key) => (
                  <li key={key} className="flex items-start gap-2 text-sm text-kx-text">
                    <Check className="w-4 h-4 mt-0.5 text-kx-verified shrink-0" />
                    <span>{t(key)}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-4 grid gap-2 sm:grid-cols-3">
                <Link href="/membership/benefits" className="kx-button-ghost justify-center">{t("mem_benefits_detail")}</Link>
                {user ? (
                  <Link href="/membership/exclusive" className="kx-button-ghost justify-center">{t("mem_exclusive")}</Link>
                ) : (
                  <button type="button" onClick={() => openAuthPrompt("generic")} className="kx-button-ghost justify-center">{t("mem_exclusive")}</button>
                )}
                {user ? (
                  <Link href="/membership/orders" className="kx-button-ghost justify-center">{t("mem_orders")}</Link>
                ) : (
                  <button type="button" onClick={() => openAuthPrompt("generic")} className="kx-button-ghost justify-center">{t("mem_orders")}</button>
                )}
              </div>
            </section>

            {/* Purchase / status-driven CTA */}
            {!user ? (
              <button type="button" onClick={() => openAuthPrompt("generic")} className="kx-button-primary w-full justify-center">
                {t("mem_login_required")}
              </button>
            ) : isActive ? (
              <div className="kx-card text-center text-kx-subtle">
                <div className="flex items-center justify-center gap-1.5 font-bold text-kx-text">
                  <VerifiedBadge /> {t("mem_already_member")}
                </div>
              </div>
            ) : order ? (
              <PaymentPanel
                order={order}
                onCancel={() => {
                  stopPolling();
                  setOrder(null);
                }}
                onMockConfirm={order.mock ? devMockConfirm : undefined}
              />
            ) : availableProviders.length === 0 ? (
              <section className="kx-card text-center">
                <h2 className="font-bold text-kx-text">{t("mem_pay_method")}</h2>
                <p className="mt-2 text-sm text-kx-subtle">
                  {planQuery.isLoading ? t("mem_payment_loading") : t("mem_payment_unavailable")}
                </p>
                {planQuery.isError ? (
                  <button type="button" onClick={() => planQuery.refetch()} className="kx-button-ghost mx-auto mt-3 h-9 justify-center">
                    {t("action_retry")}
                  </button>
                ) : null}
              </section>
            ) : (
              <section className="kx-card space-y-3">
                <h2 className="font-bold text-kx-text mb-2">{t("mem_pay_method")}</h2>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {availableProviders.includes("wechat_pay") ? (
                    <button
                      className="kx-button-ghost h-11 justify-center"
                      disabled={creating !== null}
                      onClick={() => startPurchase("wechat_pay")}
                    >
                      {creating === "wechat_pay" ? <Loader2 className="w-4 h-4 animate-spin" /> : t("mem_pay_wechat")}
                    </button>
                  ) : null}
                  {availableProviders.includes("alipay") ? (
                    <button
                      className="kx-button-ghost h-11 justify-center"
                      disabled={creating !== null}
                      onClick={() => startPurchase("alipay")}
                    >
                      {creating === "alipay" ? <Loader2 className="w-4 h-4 animate-spin" /> : t("mem_pay_alipay")}
                    </button>
                  ) : null}
                  {availableProviders.includes("stripe") ? (
                    <button
                      className="kx-button-ghost h-12 justify-center sm:col-span-2"
                      disabled={creating !== null}
                      onClick={() => startPurchase("stripe")}
                    >
                      {creating === "stripe" ? (
                        <span className="inline-flex w-full items-center justify-center gap-2">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>{t("mem_pay_pending")}</span>
                        </span>
                      ) : (
                        <BankCardPaymentOption label={t("mem_pay_stripe")} />
                      )}
                    </button>
                  ) : null}
                </div>
                {availableProviders.includes("stripe") ? <SupportedPaymentLogos /> : null}
              </section>
            )}

            {/* Safety notice — never imply a platform guarantee. */}
            <section className="kx-card flex items-start gap-2 text-sm text-kx-subtle">
              <ShieldAlert className="w-4 h-4 mt-0.5 text-kx-heat shrink-0" />
              <span>{t("mem_safety_notice")}</span>
            </section>
        </>
      </div>
    </AppShell>
  );
}

function planKey(plan: KXMembershipPlan): string {
  return plan.plan_key || plan.planKey || "";
}

function localizedPlanName(plan: KXMembershipPlan, locale: string): string {
  if (locale === "ja") return plan.name_ja || plan.name_en || plan.name_zh || plan.name || "Machi";
  if (locale === "en") return plan.name_en || plan.name_zh || plan.name_ja || plan.name || "Machi";
  return plan.name_zh || plan.name || plan.name_en || plan.name_ja || "Machi";
}

function periodLabel(plan: KXMembershipPlan, t: ReturnType<typeof useI18n>["t"]): string {
  const period = plan.billingPeriod || plan.billing_period || plan.billing_cycle;
  if (period === "yearly") return t("mem_period_yearly");
  if (period === "monthly" || period === "month") return t("mem_period_monthly");
  return t("mem_period_plan");
}

function planPriceLabel(plan: KXMembershipPlan, t: ReturnType<typeof useI18n>["t"]): string {
  const label = plan.priceLabel || plan.price_label;
  if (label && label !== "价格加载中") return label;
  if (!plan.amount && !plan.amount_cents && !plan.price) return t("mem_price_loading");
  return formatPrice({
    price: plan.price ?? plan.amount,
    currency: plan.currency,
    billingPeriod: plan.billingPeriod || plan.billing_period || plan.billing_cycle,
  });
}

function BankCardPaymentOption({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-2 font-bold text-kx-text">
      <CreditCard className="h-4 w-4 text-kx-accent" />
      {label}
    </span>
  );
}

const PAYMENT_LOGOS = [
  { name: "Apple Pay", src: "/payment-logos/apple-pay.svg", width: 86 },
  { name: "Google Pay", src: "/payment-logos/google-pay.svg", width: 92 },
  { name: "Visa", src: "/payment-logos/visa.svg", width: 62 },
  { name: "Mastercard", src: "/payment-logos/mastercard.svg", width: 70 },
  { name: "American Express", src: "/payment-logos/amex.svg", width: 72 },
] as const;

function SupportedPaymentLogos() {
  const { t } = useI18n();

  return (
    <div className="border-t border-gray-100 pt-3">
      <div className="mb-2 text-xs font-medium text-gray-400">{t("mem_supported_payments")}</div>
      <div className="flex flex-wrap items-center gap-4 sm:gap-6">
        {PAYMENT_LOGOS.map((logo) => (
          <span
            key={logo.name}
            className="inline-flex h-6 items-center justify-center"
            title={logo.name}
            aria-label={logo.name}
          >
            <Image
              src={logo.src}
              alt={logo.name}
              width={logo.width}
              height={24}
              unoptimized
              loading="lazy"
              className="h-5 w-auto object-contain transition-all duration-300 ease-out hover:scale-[1.02] sm:h-6"
            />
          </span>
        ))}
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const { t } = useI18n();
  const map = {
    active: "mem_status_active",
    grace_period: "mem_status_active",
    inactive: "mem_status_inactive",
    expired: "mem_status_expired",
    canceled: "mem_status_canceled",
  } as const;
  const key = map[status as keyof typeof map] ?? "mem_status_inactive";
  const tone =
    status === "active" || status === "grace_period"
      ? "bg-kx-accentSoft text-kx-accent"
      : "bg-kx-soft text-kx-subtle";
  return <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${tone}`}>{t(key)}</span>;
}

function PaymentPanel({
  order,
  onCancel,
  onMockConfirm,
}: {
  order: KXCreateOrderResult;
  onCancel: () => void;
  onMockConfirm?: () => void;
}) {
  const { t } = useI18n();
  const target = order.provider === "wechat_pay" ? order.qr_code_url : order.pay_url;
  return (
    <section className="kx-card text-center space-y-3">
      <div className="flex items-center justify-center gap-2 text-kx-subtle">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span>{t("mem_pay_pending")}</span>
      </div>
      {order.provider === "wechat_pay" ? (
        <>
          <p className="text-sm text-kx-text">{t("mem_scan_qr")}</p>
          {/* No QR-image dependency is bundled; the code_url is shown so it
              can be scanned via a QR renderer or opened directly. */}
          <div className="mx-auto max-w-xs break-all rounded-kx-md border border-kx-stroke/60 bg-kx-soft p-3 text-xs font-mono text-kx-subtle">
            {target}
          </div>
        </>
      ) : (
        <a href={target} target="_blank" rel="noreferrer" className="kx-button-primary w-full justify-center">
          {t(order.provider === "stripe" ? "mem_open_stripe" : "mem_open_alipay")}
        </a>
      )}
      <div className="text-xs text-kx-muted">{order.orderNo}</div>
      {onMockConfirm ? (
        <button className="kx-button-primary w-full justify-center" onClick={onMockConfirm}>
          {t("mem_mock_confirm")}
        </button>
      ) : null}
      <button className="kx-button-ghost w-full justify-center" onClick={onCancel}>
        {t("action_cancel")}
      </button>
    </section>
  );
}
