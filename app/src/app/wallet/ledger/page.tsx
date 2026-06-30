"use client";

// Full Machi Points ledger (Web). Paginated, read-only audit of every points
// movement. Reuses the kx-* design tokens only.

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { AppShell } from "@/components/shell/AppShell";
import { useSession } from "@/lib/store";
import { useI18n, type I18nKey } from "@/lib/i18n";

export default function WalletLedgerPage() {
  const { t } = useI18n();
  const user = useSession((s) => s.user);
  const [page, setPage] = useState(1);
  const ledgerQuery = useQuery({
    queryKey: ["wallet-ledger", user?.id, page],
    queryFn: () => api.walletLedger(page, 20),
    enabled: !!user,
  });

  const entries = ledgerQuery.data?.entries ?? [];
  const hasMore = ledgerQuery.data?.hasMore ?? false;

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-2xl space-y-4 px-4 py-6">
        <header className="flex items-center gap-2">
          <Link href="/wallet" className="text-kx-subtle hover:text-kx-text">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-xl font-semibold text-kx-text">{t("wallet_ledger_title")}</h1>
        </header>

        {!user ? (
          <p className="kx-card text-center text-kx-subtle">{t("unauthorized")}</p>
        ) : ledgerQuery.isLoading ? (
          <p className="kx-card flex items-center justify-center gap-2 text-kx-subtle">
            <Loader2 className="h-4 w-4 animate-spin" /> {t("loading")}
          </p>
        ) : (
          <section className="kx-card space-y-2">
            {entries.length === 0 ? (
              <p className="text-sm text-kx-subtle">{t("wallet_ledger_empty")}</p>
            ) : (
              <ul className="divide-y divide-kx-stroke/40">
                {entries.map((e) => (
                  <li key={e.id} className="flex items-center justify-between py-2 text-sm">
                    <span className="flex flex-col">
                      <span className="text-kx-text">{ledgerLabel(e.entryType, t)}</span>
                      <span className="text-xs text-kx-subtle">{formatDate(e.createdAt)}</span>
                    </span>
                    <span className="flex flex-col items-end">
                      <span className={e.pointsDelta >= 0 ? "font-medium text-emerald-600" : "font-medium text-kx-subtle"}>
                        {e.displayDelta}
                      </span>
                      <span className="text-xs text-kx-subtle">{t("wallet_balance_after")} {e.balanceAfter.toLocaleString()}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {(page > 1 || hasMore) && (
              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="kx-button-ghost h-9 justify-center disabled:opacity-50"
                >
                  {t("page_prev")}
                </button>
                <span className="text-sm text-kx-subtle">{t("page_indicator").replace("{n}", String(page))}</span>
                <button
                  type="button"
                  disabled={!hasMore}
                  onClick={() => setPage((p) => p + 1)}
                  className="kx-button-ghost h-9 justify-center disabled:opacity-50"
                >
                  {t("page_next")}
                </button>
              </div>
            )}
          </section>
        )}
      </div>
    </AppShell>
  );
}

function formatDate(iso?: string): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function ledgerLabel(entryType: string, t: (key: I18nKey) => string): string {
  switch (entryType) {
    case "topup":
      return t("ledger_type_topup");
    case "bonus":
      return t("ledger_type_bonus");
    case "spend":
      return t("ledger_type_spend");
    case "refund_credit":
      return t("ledger_type_refund");
    case "admin_adjustment":
      return t("ledger_type_admin");
    case "membership_bonus":
      return t("ledger_type_membership_bonus");
    default:
      return entryType;
  }
}
