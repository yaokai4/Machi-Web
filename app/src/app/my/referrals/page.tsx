"use client";

// 「我的邀请」战绩页 — the user's stable invite code + share URL + counts +
// recent invitees. Reads /api/referral/me (lazily mints the code server-side).
// Copy / share the link; new signups arrive via /i/{code} → /register?ref=.

import { useMemo } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Copy, Gift, Link2, Share2, Sparkles, Users } from "lucide-react";
import { api, type KXReferralSummary, type KXReferralInvitee } from "@/lib/api";
import { AppShell } from "@/components/shell/AppShell";
import { EmptyState, ErrorState, InlineLoading } from "@/components/design/States";
import { useSession, useToasts } from "@/lib/store";
import { useI18n, type I18nKey } from "@/lib/i18n";

const STATUS_KEY: Record<string, I18nKey> = {
  pending: "referral_status_pending",
  qualified: "referral_status_qualified",
  rewarded: "referral_status_rewarded",
  rejected: "referral_status_rejected",
  held: "referral_status_held",
};

export default function MyReferralsPage() {
  const { t } = useI18n();
  const status = useSession((s) => s.status);
  const user = useSession((s) => s.user);
  const pushToast = useToasts((s) => s.push);

  const query = useQuery({
    queryKey: ["referral-me", user?.id],
    queryFn: () => api.referralMe(),
    enabled: status === "authed",
    retry: false,
  });

  // Absolute share URL for the native share sheet; the API also returns
  // shareUrl, but we prefer the live origin so preview/staging links stay valid.
  const shareUrl = useMemo(() => {
    const data = query.data;
    if (!data) return "";
    if (typeof window !== "undefined" && data.code) {
      return `${window.location.origin}/i/${data.code}`;
    }
    return data.shareUrl;
  }, [query.data]);

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      pushToast({ kind: "success", message: t("referral_copied") });
    } catch {
      pushToast({ kind: "error", message: t("referral_share_failed") });
    }
  };

  const share = async (data: KXReferralSummary) => {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: t("referral_title"), text: t("referral_subtitle"), url: shareUrl });
        return;
      } catch {
        // user cancelled or unsupported — fall back to copy
      }
    }
    await copy(shareUrl || data.shareUrl);
  };

  if (status === "loading" || status === "idle") {
    return (
      <AppShell>
        <InlineLoading />
      </AppShell>
    );
  }

  if (status === "unauthed") {
    return (
      <AppShell>
        <main className="mx-auto w-full max-w-kx-feed px-3 py-10 sm:px-4">
          <EmptyState
            icon={Gift}
            title={t("referral_title")}
            subtitle={t("referral_subtitle")}
            action={{ label: t("wallet_login_register"), href: "/login?redirect=/my/referrals" }}
          />
        </main>
      </AppShell>
    );
  }

  const rewardHint = (data: KXReferralSummary) =>
    t("referral_reward_hint")
      .replace("{inviter}", String(data.inviterReward))
      .replace("{invitee}", String(data.inviteeReward));

  return (
    <AppShell>
      <main className="mx-auto w-full max-w-kx-feed px-3 py-4 sm:px-4">
        <header className="mb-4 px-1">
          <h1 className="flex items-center gap-2 text-xl font-black text-kx-text">
            <Gift className="h-5 w-5 text-kx-accent" />
            {t("referral_title")}
          </h1>
          <p className="mt-1 text-sm font-semibold text-kx-muted">{t("referral_subtitle")}</p>
        </header>

        {query.isLoading ? (
          <InlineLoading />
        ) : query.isError ? (
          <ErrorState onRetry={() => query.refetch()} />
        ) : query.data ? (
          <ReferralBody
            data={query.data}
            shareUrl={shareUrl}
            rewardHint={rewardHint(query.data)}
            onCopyCode={() => copy(query.data!.code)}
            onCopyLink={() => copy(shareUrl || query.data!.shareUrl)}
            onShare={() => share(query.data!)}
            statusLabel={(s) => t(STATUS_KEY[s] ?? "referral_status_pending")}
            t={t}
          />
        ) : (
          <EmptyState icon={Gift} title={t("referral_load_error")} />
        )}

        {/* 兜底导航:积分进钱包 */}
        <div className="mt-6 text-center">
          <Link href="/wallet" className="text-sm font-bold text-kx-accent hover:underline">
            {t("nav_wallet")}
          </Link>
        </div>
      </main>
    </AppShell>
  );
}

function ReferralBody({
  data,
  shareUrl,
  rewardHint,
  onCopyCode,
  onCopyLink,
  onShare,
  statusLabel,
  t,
}: {
  data: KXReferralSummary;
  shareUrl: string;
  rewardHint: string;
  onCopyCode: () => void;
  onCopyLink: () => void;
  onShare: () => void;
  statusLabel: (status: string) => string;
  t: (key: I18nKey) => string;
}) {
  const stats: Array<{ key: I18nKey; value: number }> = [
    { key: "referral_stat_invited", value: data.invitedCount },
    { key: "referral_stat_qualified", value: data.qualifiedCount },
    { key: "referral_stat_points", value: data.pointsEarned },
  ];

  return (
    <div className="grid gap-4">
      {/* Share card */}
      <section className="kx-card">
        <div className="mb-3 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-kx-accent" />
          <span className="text-sm font-black text-kx-text">{t("referral_your_link")}</span>
        </div>

        <label className="mb-1.5 block text-xs font-bold text-kx-muted">{t("referral_your_code")}</label>
        <div className="mb-3 flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-kx-md bg-kx-soft px-3 py-2.5 font-mono text-base font-black tracking-wider text-kx-text">
            {data.code}
          </code>
          <button
            type="button"
            onClick={onCopyCode}
            className="kx-button-ghost h-10 shrink-0 px-3 text-sm"
            aria-label={t("referral_copy_code")}
          >
            <Copy className="h-4 w-4" />
            <span className="hidden sm:inline">{t("referral_copy_code")}</span>
          </button>
        </div>

        <label className="mb-1.5 block text-xs font-bold text-kx-muted">{t("referral_your_link")}</label>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-kx-md bg-kx-soft px-3 py-2.5">
            <Link2 className="h-4 w-4 shrink-0 text-kx-muted" />
            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-kx-subtle">{shareUrl || data.shareUrl}</span>
          </div>
          <div className="flex shrink-0 gap-2">
            <button type="button" onClick={onCopyLink} className="kx-button-ghost h-10 px-3 text-sm">
              <Copy className="h-4 w-4" />
              <span className="hidden sm:inline">{t("referral_copy_link")}</span>
            </button>
            <button type="button" onClick={onShare} className="kx-button-primary h-10 px-3 text-sm">
              <Share2 className="h-4 w-4" />
              <span className="hidden sm:inline">{t("referral_share")}</span>
            </button>
          </div>
        </div>

        <p className="mt-3 flex items-start gap-1.5 text-xs font-semibold leading-5 text-kx-muted">
          <Gift className="mt-0.5 h-3.5 w-3.5 shrink-0 text-kx-accent" />
          {rewardHint}
        </p>
      </section>

      {/* Stats */}
      <section className="grid grid-cols-3 gap-3">
        {stats.map((s) => (
          <div key={s.key} className="kx-card items-center text-center">
            <div className="text-2xl font-black text-kx-accent">{s.value}</div>
            <div className="mt-1 text-xs font-bold text-kx-muted">{t(s.key)}</div>
          </div>
        ))}
      </section>

      {/* Recent invitees */}
      <section>
        <h2 className="mb-2 flex items-center gap-2 px-1 text-sm font-black text-kx-text">
          <Users className="h-4 w-4 text-kx-accent" />
          {t("referral_recent_title")}
        </h2>
        {data.recentInvitees.length ? (
          <ul className="space-y-2.5">
            {data.recentInvitees.map((it) => (
              <InviteeRow key={it.referralId} invitee={it} statusLabel={statusLabel} />
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={Users}
            compact
            title={t("referral_recent_empty_title")}
            subtitle={t("referral_recent_empty_sub")}
          />
        )}
      </section>
    </div>
  );
}

function InviteeRow({
  invitee,
  statusLabel,
}: {
  invitee: KXReferralInvitee;
  statusLabel: (status: string) => string;
}) {
  const name = invitee.displayName || invitee.handle || "Machi";
  const qualified = invitee.status === "qualified" || invitee.status === "rewarded";
  return (
    <li className="kx-card flex flex-row items-center gap-3">
      {invitee.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={invitee.avatarUrl} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
      ) : (
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-kx-soft text-kx-muted">
          <Users className="h-4 w-4" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate font-bold text-kx-text">{name}</p>
        {invitee.handle ? <p className="truncate text-xs font-semibold text-kx-muted">@{invitee.handle}</p> : null}
      </div>
      <span
        className={
          "shrink-0 rounded-full px-2.5 py-1 text-xs font-bold " +
          (qualified
            ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
            : "bg-kx-soft text-kx-subtle")
        }
      >
        {statusLabel(invitee.status)}
      </span>
    </li>
  );
}
