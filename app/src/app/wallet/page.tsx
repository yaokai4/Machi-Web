"use client";

// Machi Points wallet (Web). Shows the points balance, buyable top-up packs
// (Stripe Checkout), the points disclaimer and the recent ledger. The amount
// is computed server-side; this page never sends a price or a points amount.
// On return from Stripe (?wallet_session=...) it confirms the top-up so a
// missed webhook still credits the points. Reuses the kx-* design tokens only.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Coins, Loader2, RefreshCw, ShieldCheck, Sparkles } from "lucide-react";
import { api, APIError } from "@/lib/api";
import { AppShell } from "@/components/shell/AppShell";
import { useAuthPrompt, useSession, useToasts } from "@/lib/store";
import type { KXWalletTopupProduct } from "@/lib/types";

// A safe in-app return target carried across the Stripe round trip, so a topup
// started from a product page lands the user back on that product.
function safeReturnTo(value: string | null): string | null {
  if (!value) return null;
  return value.startsWith("/") && !value.startsWith("//") ? value : null;
}

export default function WalletPage() {
  const user = useSession((s) => s.user);
  const router = useRouter();
  const openAuthPrompt = useAuthPrompt((s) => s.open);
  const pushToast = useToasts((s) => s.push);
  const queryClient = useQueryClient();
  const [buying, setBuying] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  // Prominent on-page receipt shown after returning from Stripe Checkout, so a
  // successful top-up has a clear success screen (not just a transient toast).
  const [topupReceipt, setTopupReceipt] = useState<
    { status: "checking" | "success" | "pending" | "error"; points?: number; orderNo?: string } | null
  >(null);

  const walletQuery = useQuery({
    queryKey: ["wallet-me", user?.id],
    queryFn: () => api.walletMe("web"),
    enabled: !!user,
    retry: false,
  });

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ["wallet-me"] });
  }, [queryClient]);

  // Return from Stripe Checkout carries a session id we confirm server-side.
  useEffect(() => {
    if (typeof window === "undefined" || !user) return;
    const params = new URLSearchParams(window.location.search);
    const session = params.get("wallet_session") || params.get("stripe_session");
    if (!session) return;
    const returnTo = safeReturnTo(params.get("returnTo"));
    const clearParams = () => {
      const url = new URL(window.location.href);
      url.searchParams.delete("wallet_session");
      url.searchParams.delete("stripe_session");
      url.searchParams.delete("topup");
      url.searchParams.delete("returnTo");
      window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    };
    setConfirming(true);
    setTopupReceipt({ status: "checking" });
    api
      .walletTopupStripeConfirm(session)
      .then(async (res) => {
        await refresh();
        if (res.status === "fulfilled") {
          const granted = res.grantedPoints ?? 0;
          pushToast({ kind: "success", message: `已到账 ${granted} 币` });
          // Round-trip back to the product the topup was started from.
          if (returnTo) {
            setTopupReceipt(null);
            clearParams();
            router.replace(returnTo);
            return;
          }
          setTopupReceipt({ status: "success", points: granted, orderNo: res.orderNo });
        } else {
          // Paid but not yet credited (webhook in flight) — tell the user it's
          // processing rather than leaving them unsure.
          setTopupReceipt({ status: "pending", orderNo: res.orderNo });
        }
      })
      .catch(() => {
        // Non-fatal; the webhook will still settle. Surface a soft status.
        setTopupReceipt({ status: "pending" });
      })
      .finally(() => {
        setConfirming(false);
        clearParams();
      });
  }, [user, refresh, pushToast, router]);

  const onTopup = useCallback(
    async (pack: KXWalletTopupProduct) => {
      if (!user) {
        openAuthPrompt("generic");
        return;
      }
      if (!pack.purchasable) return;
      setBuying(pack.packKey);
      try {
        // Preserve any returnTo so the post-topup confirm can send the user back.
        const here = new URL(window.location.href);
        const returnTo = safeReturnTo(here.searchParams.get("returnTo"));
        const success = new URL(`${window.location.origin}/wallet`);
        success.searchParams.set("topup", "1");
        if (returnTo) success.searchParams.set("returnTo", returnTo);
        const res = await api.walletTopupStripeCheckout(pack.packKey, success.toString());
        if (res.checkoutUrl) {
          window.location.href = res.checkoutUrl;
          return;
        }
      } catch {
        pushToast({ kind: "error", message: "充值发起失败，请稍后再试" });
      } finally {
        setBuying(null);
      }
    },
    [user, openAuthPrompt, pushToast],
  );

  const wallet = walletQuery.data?.wallet;
  const packs = walletQuery.data?.topupProducts ?? [];
  const entries = walletQuery.data?.recentEntries ?? [];
  const disclaimer = walletQuery.data?.disclaimer ?? wallet?.disclaimer ?? "";
  // A 404 on /api/wallet/me means the backend predates the wallet (version
  // mismatch) — show "not available", not a generic error. Any other failure is
  // a transient error the user can retry.
  const walletError = walletQuery.error as APIError | undefined;
  const walletUnsupported = walletError?.status === 404;

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-2xl space-y-4 px-4 py-6">
        <header className="flex items-center gap-2">
          <Coins className="h-6 w-6 text-kx-accent" />
          <h1 className="text-xl font-semibold text-kx-text">Machi 币钱包</h1>
        </header>

        {topupReceipt ? (
          <WalletReturnReceipt receipt={topupReceipt} onDismiss={() => setTopupReceipt(null)} />
        ) : null}

        {!user ? (
          <section className="kx-card text-center space-y-3">
            <p className="text-kx-subtle">登录后查看你的 Machi 币余额与充值。</p>
            <button type="button" onClick={() => openAuthPrompt("generic")} className="kx-button-primary mx-auto justify-center">
              登录 / 注册
            </button>
          </section>
        ) : walletUnsupported ? (
          <section className="kx-card space-y-3 text-center">
            <AlertTriangle className="mx-auto h-8 w-8 text-kx-subtle" />
            <p className="text-kx-text">当前版本暂未开放 Machi 币钱包。</p>
            <p className="text-sm text-kx-subtle">请稍后再试，或更新到最新版本。</p>
            <button type="button" onClick={() => walletQuery.refetch()} className="kx-button-ghost mx-auto justify-center">
              <RefreshCw className="h-4 w-4" /> 重试
            </button>
          </section>
        ) : walletQuery.isError ? (
          <section className="kx-card space-y-3 text-center">
            <AlertTriangle className="mx-auto h-8 w-8 text-amber-500" />
            <p className="text-kx-text">钱包加载失败</p>
            <p className="text-sm text-kx-subtle">网络或服务暂时不可用，请重试。</p>
            <button type="button" onClick={() => walletQuery.refetch()} className="kx-button-primary mx-auto justify-center">
              <RefreshCw className="h-4 w-4" /> 重试
            </button>
          </section>
        ) : (
          <>
            {/* Balance */}
            <section className="kx-card border-kx-accent/20 bg-kx-accentSoft/45">
              <div className="text-sm text-kx-subtle">当前余额</div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-3xl font-bold text-kx-text">
                  {wallet ? wallet.displayBalance : <Loader2 className="inline h-6 w-6 animate-spin" />}
                </span>
              </div>
              {confirming && (
                <div className="mt-2 flex items-center gap-1 text-sm text-kx-subtle">
                  <Loader2 className="h-4 w-4 animate-spin" /> 正在确认到账…
                </div>
              )}
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
                <Link href="/guide" className="inline-flex items-center gap-1 text-sm font-medium text-kx-accent hover:underline">
                  用 Machi 币购买学习资料 →
                </Link>
                <Link href="/guide/my-library" className="inline-flex items-center gap-1 text-sm font-medium text-kx-accent hover:underline">
                  我的资料库 →
                </Link>
              </div>
            </section>

            {/* Top-up packs */}
            <section className="kx-card space-y-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-kx-accent" />
                <h2 className="font-semibold text-kx-text">充值 Machi 币</h2>
              </div>
              {walletQuery.isLoading ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {[0, 1, 2, 3].map((i) => (
                    <div key={i} className="kx-skeleton h-24 rounded-xl" />
                  ))}
                </div>
              ) : packs.length === 0 ? (
                <p className="text-sm text-kx-subtle">暂无可充值套餐，请稍后再试。</p>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {packs.map((pack) => (
                    <button
                      key={pack.packKey}
                      type="button"
                      disabled={!pack.purchasable || buying !== null}
                      onClick={() => onTopup(pack)}
                      className="flex flex-col items-start rounded-xl border border-kx-stroke/60 bg-kx-card p-4 text-left transition hover:border-kx-accent/60 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <div className="text-lg font-semibold text-kx-text">{pack.displayPoints}</div>
                      {pack.subtitle && <div className="text-xs text-kx-subtle">{pack.subtitle}</div>}
                      <div className="mt-2 flex w-full items-center justify-between">
                        <span className="text-base font-medium text-kx-accent">{pack.priceLabel}</span>
                        {buying === pack.packKey ? (
                          <Loader2 className="h-4 w-4 animate-spin text-kx-subtle" />
                        ) : (
                          <span className="text-xs text-kx-subtle">{pack.purchasable ? "Stripe 充值" : "暂不可用"}</span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </section>

            {/* Disclaimer */}
            {disclaimer && (
              <section className="kx-card flex items-start gap-2 text-sm text-kx-subtle">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-kx-accent" />
                <span>{disclaimer}</span>
              </section>
            )}

            {/* Recent ledger */}
            <section className="kx-card space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-kx-text">最近记录</h2>
                <Link href="/wallet/ledger" className="text-sm text-kx-accent hover:underline">
                  全部
                </Link>
              </div>
              {entries.length === 0 ? (
                <p className="text-sm text-kx-subtle">暂无记录。</p>
              ) : (
                <ul className="divide-y divide-kx-stroke/40">
                  {entries.map((e) => (
                    <li key={e.id} className="flex items-center justify-between py-2 text-sm">
                      <span className="text-kx-text">{ledgerLabel(e.entryType)}</span>
                      <span className={e.pointsDelta >= 0 ? "font-medium text-emerald-600" : "font-medium text-kx-subtle"}>
                        {e.displayDelta}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </AppShell>
  );
}

function ledgerLabel(entryType: string): string {
  switch (entryType) {
    case "topup":
      return "充值";
    case "bonus":
      return "充值赠送";
    case "spend":
      return "购买资料";
    case "refund_credit":
      return "退款返还";
    case "admin_adjustment":
      return "客服调整";
    case "membership_bonus":
      return "会员赠币";
    default:
      return entryType;
  }
}

// Post-checkout success/processing receipt for Machi 币 top-ups. Uses kx-* tokens
// only (dark-mode safe) and mirrors the membership receipt so the two payment
// flows feel consistent. Shown on return from Stripe Checkout.
function WalletReturnReceipt({
  receipt,
  onDismiss,
}: {
  receipt: { status: "checking" | "success" | "pending" | "error"; points?: number; orderNo?: string };
  onDismiss: () => void;
}) {
  const isChecking = receipt.status === "checking";
  const isSuccess = receipt.status === "success";
  const title = isChecking
    ? "正在确认充值…"
    : isSuccess
      ? "充值成功"
      : receipt.status === "pending"
        ? "支付已收到，到账处理中"
        : "确认失败";
  const subtitle = isChecking
    ? "正在和支付服务核对你的订单，请稍候。"
    : isSuccess
      ? `Machi 币已到账，可立即用于购买资料与服务。`
      : receipt.status === "pending"
        ? "支付已完成，点数会在稍后自动到账，无需重复支付。"
        : "暂时无法确认这笔充值，如果已扣款，点数会在稍后自动到账。";
  return (
    <section className="kx-card border-kx-accent/20 bg-kx-accentSoft/45">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-kx-card text-kx-accent shadow-sm">
          {isChecking ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h2 className="font-black text-kx-text">{title}</h2>
            {!isChecking ? (
              <button type="button" onClick={onDismiss} className="text-xs font-bold text-kx-muted hover:text-kx-text">
                关闭
              </button>
            ) : null}
          </div>
          <p className="mt-1 text-sm text-kx-subtle">{subtitle}</p>
          {isSuccess && typeof receipt.points === "number" ? (
            <div className="mt-3 inline-flex items-center gap-2 rounded-kx-md bg-kx-card/70 px-3 py-2">
              <Coins className="h-4 w-4 text-kx-accent" />
              <span className="font-black text-kx-text">+{receipt.points.toLocaleString()} 币</span>
            </div>
          ) : null}
          {receipt.orderNo ? (
            <div className="mt-2 text-xs text-kx-muted">订单号：<span className="break-all font-bold text-kx-subtle">{receipt.orderNo}</span></div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
