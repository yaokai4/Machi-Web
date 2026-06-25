"use client";

// Machi Points wallet (Web). Shows the points balance, buyable top-up packs
// (Stripe Checkout), the points disclaimer and the recent ledger. The amount
// is computed server-side; this page never sends a price or a points amount.
// On return from Stripe (?wallet_session=...) it confirms the top-up so a
// missed webhook still credits the points. Reuses the kx-* design tokens only.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Coins, Loader2, ShieldCheck, Sparkles } from "lucide-react";
import { api } from "@/lib/api";
import { AppShell } from "@/components/shell/AppShell";
import { useAuthPrompt, useSession, useToasts } from "@/lib/store";
import type { KXWalletTopupProduct } from "@/lib/types";

export default function WalletPage() {
  const user = useSession((s) => s.user);
  const openAuthPrompt = useAuthPrompt((s) => s.open);
  const pushToast = useToasts((s) => s.push);
  const queryClient = useQueryClient();
  const [buying, setBuying] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const walletQuery = useQuery({
    queryKey: ["wallet-me", user?.id],
    queryFn: () => api.walletMe("web"),
    enabled: !!user,
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
    const clearParams = () => {
      const url = new URL(window.location.href);
      url.searchParams.delete("wallet_session");
      url.searchParams.delete("stripe_session");
      url.searchParams.delete("topup");
      window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    };
    setConfirming(true);
    api
      .walletTopupStripeConfirm(session)
      .then(async (res) => {
        await refresh();
        if (res.status === "fulfilled") {
          pushToast({ kind: "success", message: `已到账 ${res.grantedPoints ?? 0} 币` });
        }
      })
      .catch(() => {
        /* non-fatal; webhook will settle */
      })
      .finally(() => {
        setConfirming(false);
        clearParams();
      });
  }, [user, refresh, pushToast]);

  const onTopup = useCallback(
    async (pack: KXWalletTopupProduct) => {
      if (!user) {
        openAuthPrompt("generic");
        return;
      }
      if (!pack.purchasable) return;
      setBuying(pack.packKey);
      try {
        const res = await api.walletTopupStripeCheckout(pack.packKey, `${window.location.origin}/wallet?topup=1`);
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

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-2xl space-y-4 px-4 py-6">
        <header className="flex items-center gap-2">
          <Coins className="h-6 w-6 text-kx-accent" />
          <h1 className="text-xl font-semibold text-kx-text">Machi 币钱包</h1>
        </header>

        {!user ? (
          <section className="kx-card text-center space-y-3">
            <p className="text-kx-subtle">登录后查看你的 Machi 币余额与充值。</p>
            <button type="button" onClick={() => openAuthPrompt("generic")} className="kx-button-primary mx-auto justify-center">
              登录 / 注册
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
            </section>

            {/* Top-up packs */}
            <section className="kx-card space-y-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-kx-accent" />
                <h2 className="font-semibold text-kx-text">充值 Machi 币</h2>
              </div>
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
