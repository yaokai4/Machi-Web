"use client";

// Machi Verified membership page (Web). Shows the ¥10/月 plan + benefits,
// then runs the WeChat / Alipay purchase flow:
//   create-order -> show QR (WeChat) or redirect (Alipay) -> poll
//   order-status -> on "paid" refresh the membership.
// The amount is computed server-side; this page never sends a price.
// No existing styles are changed — it reuses the kx-* design tokens.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, Check, Loader2, ShieldAlert } from "lucide-react";
import { api, APIError, isAuthRequiredError } from "@/lib/api";
import { AppShell } from "@/components/shell/AppShell";
import { ErrorState, InlineLoading } from "@/components/design/States";
import { VerifiedBadge } from "@/components/design/Avatar";
import { useAuthPrompt, useSession, useToasts } from "@/lib/store";
import { useI18n } from "@/lib/i18n";
import type { KXCreateOrderResult, PaymentProvider } from "@/lib/types";

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

export default function MembershipPage() {
  const user = useSession((s) => s.user);
  const setUser = useSession((s) => s.setUser);
  const openAuthPrompt = useAuthPrompt((s) => s.open);
  const pushToast = useToasts((s) => s.push);
  const { t } = useI18n();
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
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollStartedAtRef = useRef(0);

  const plan = planQuery.data?.plan;
  // Only ever show payment methods the server reports as actually configured
  // (`available_providers`). Empty fallback during load so we never flash an
  // unconfigured method (WeChat/Alipay) that would "time out" on click — on
  // production only Stripe is configured, so only Stripe shows.
  const availableProviders: PaymentProvider[] = planQuery.data?.available_providers ?? [];
  const membership = meQuery.data?.membership;
  const isActive = !!membership?.is_active;
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
          pushToast({ kind: "error", message: "订单确认超时，请刷新会员状态或重新创建订单。" });
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
    if (!meQuery.data.membership.is_active) {
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

  const startPurchase = async (provider: PaymentProvider) => {
    if (!user) {
      openAuthPrompt("generic");
      return;
    }
    setCreating(provider);
    try {
      const result = await api.createPaymentOrder(provider, plan?.plan_key);
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

  const priceLabel = plan ? `¥${plan.amount} ${t("mem_price_unit")}` : "¥10 / 月";

  return (
    <AppShell requireAuth={false}>
      <header className="sticky top-0 z-30 kx-glass-bar px-3 py-2 flex items-center gap-2">
        <BadgeCheck className="w-5 h-5 text-kx-verified" />
        <h1 className="text-lg font-bold">{t("mem_title")}</h1>
      </header>

      <div className="px-3 sm:px-4 py-3 space-y-3">
        {planQuery.isLoading ? (
          <InlineLoading />
        ) : planQuery.isError ? (
          <ErrorState onRetry={() => planQuery.refetch()} />
        ) : (
          <>
            {/* Hero */}
            <section className="kx-card">
              <div className="flex items-center gap-2">
                <span className="text-xl font-bold text-kx-text">{t("mem_title")}</span>
                <VerifiedBadge />
              </div>
              <p className="mt-1 text-kx-subtle">{t("mem_subtitle")}</p>
              <div className="mt-3 text-2xl font-extrabold text-kx-text">{priceLabel}</div>
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
            {isActive && insightsQuery.data ? (
              <section className="kx-card">
                <h2 className="font-bold text-kx-text mb-3">{t("mem_insights_title")}</h2>
                <div className="grid grid-cols-3 gap-2 text-center">
                  {([
                    ["mem_insights_views", insightsQuery.data.totals.total_views],
                    ["mem_insights_likes", insightsQuery.data.totals.total_likes],
                    ["mem_insights_comments", insightsQuery.data.totals.total_comments],
                    ["mem_insights_bookmarks", insightsQuery.data.totals.total_bookmarks],
                    ["mem_insights_posts", insightsQuery.data.totals.post_count],
                  ] as const).map(([key, val]) => (
                    <div key={key} className="rounded-kx-md bg-kx-soft p-2">
                      <div className="text-lg font-extrabold text-kx-text">{val}</div>
                      <div className="text-xs text-kx-muted">{t(key)}</div>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            {/* Benefits */}
            <section className="kx-card">
              <h2 className="font-bold text-kx-text mb-2">{t("mem_benefits_title")}</h2>
              <ul className="space-y-2">
                {BENEFIT_KEYS.map((key) => (
                  <li key={key} className="flex items-start gap-2 text-sm text-kx-text">
                    <Check className="w-4 h-4 mt-0.5 text-kx-verified shrink-0" />
                    <span>{t(key)}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-4 grid gap-2 sm:grid-cols-3">
                <Link href="/membership/benefits" className="kx-button-ghost justify-center">权益详情</Link>
                {user ? (
                  <Link href="/membership/exclusive" className="kx-button-ghost justify-center">会员专属</Link>
                ) : (
                  <button type="button" onClick={() => openAuthPrompt("generic")} className="kx-button-ghost justify-center">会员专属</button>
                )}
                {user ? (
                  <Link href="/membership/orders" className="kx-button-ghost justify-center">会员订单</Link>
                ) : (
                  <button type="button" onClick={() => openAuthPrompt("generic")} className="kx-button-ghost justify-center">会员订单</button>
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
            ) : (
              <section className="kx-card">
                <h2 className="font-bold text-kx-text mb-2">{t("mem_pay_method")}</h2>
                <div className="grid grid-cols-2 gap-2">
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
                      className="kx-button-ghost h-11 justify-center"
                      disabled={creating !== null}
                      onClick={() => startPurchase("stripe")}
                    >
                      {creating === "stripe" ? <Loader2 className="w-4 h-4 animate-spin" /> : t("mem_pay_stripe")}
                    </button>
                  ) : null}
                </div>
              </section>
            )}

            {/* Safety notice — never imply a platform guarantee. */}
            <section className="kx-card flex items-start gap-2 text-sm text-kx-subtle">
              <ShieldAlert className="w-4 h-4 mt-0.5 text-kx-heat shrink-0" />
              <span>{t("mem_safety_notice")}</span>
            </section>
          </>
        )}
      </div>
    </AppShell>
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
          [DEV] 模拟支付成功
        </button>
      ) : null}
      <button className="kx-button-ghost w-full justify-center" onClick={onCancel}>
        {t("action_cancel")}
      </button>
    </section>
  );
}
