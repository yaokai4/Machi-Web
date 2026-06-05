"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { BadgeCheck, ChevronLeft, LockKeyhole, Newspaper } from "lucide-react";
import { api, APIError } from "@/lib/api";
import { AppShell } from "@/components/shell/AppShell";
import { ErrorState, InlineLoading } from "@/components/design/States";
import { useAuthPrompt, useSession } from "@/lib/store";
import { useI18n } from "@/lib/i18n";
import { membershipGuideCopy, membershipUi } from "@/lib/membership-ui";

export default function MembershipExclusivePage() {
  const user = useSession((s) => s.user);
  const openAuthPrompt = useAuthPrompt((s) => s.open);
  const q = useQuery({ queryKey: ["membership-exclusive"], queryFn: () => api.membershipExclusive(), retry: false, enabled: !!user });
  const err = q.error as APIError | null;
  const needsUpgrade = err?.code === "MEMBERSHIP_REQUIRED" || err?.status === 403;
  const { locale } = useI18n();
  const copy = membershipUi(locale);

  return (
    <AppShell requireAuth={false}>
      <header className="sticky top-0 z-30 kx-glass-bar px-3 py-2 flex items-center gap-2">
        <Link href="/membership" className="grid h-9 w-9 place-items-center rounded-full hover:bg-kx-soft" aria-label={copy.backToMembership}>
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <BadgeCheck className="h-5 w-5 text-kx-verified" />
        <h1 className="text-lg font-bold">{copy.exclusiveTitle}</h1>
      </header>
      <div className="space-y-3 px-3 py-3 sm:px-4">
        {!user ? (
          <section className="kx-card text-center">
            <LockKeyhole className="mx-auto h-9 w-9 text-kx-verified" />
            <h2 className="mt-3 text-xl font-black text-kx-text">{copy.exclusiveLoginTitle}</h2>
            <p className="mt-2 text-sm leading-6 text-kx-subtle">{copy.exclusiveLoginBody}</p>
            <button type="button" onClick={() => openAuthPrompt("generic")} className="kx-button-primary mt-4 w-full justify-center">{copy.exclusiveLoginCta}</button>
          </section>
        ) : q.isLoading ? <InlineLoading /> : needsUpgrade ? (
          <section className="kx-card text-center">
            <LockKeyhole className="mx-auto h-9 w-9 text-kx-verified" />
            <h2 className="mt-3 text-xl font-black text-kx-text">{copy.exclusiveUpgradeTitle}</h2>
            <p className="mt-2 text-sm leading-6 text-kx-subtle">{copy.exclusiveUpgradeBody}</p>
            <Link href="/membership" className="kx-button-primary mt-4 w-full justify-center">{copy.exclusiveUpgradeCta}</Link>
          </section>
        ) : q.isError || !q.data ? (
          <ErrorState onRetry={() => q.refetch()} />
        ) : (
          <>
            <section className="kx-card">
              <h2 className="text-xl font-black text-kx-text">{copy.exclusiveZoneTitle}</h2>
              <p className="mt-2 text-sm text-kx-subtle">{copy.exclusiveUntil}: {q.data.membership.current_period_end || copy.exclusiveSyncing}</p>
            </section>
            <section className="grid gap-3 sm:grid-cols-3">
              {q.data.guides.map((guide) => {
                const localized = membershipGuideCopy(guide.key, locale, guide);
                return (
                  <div key={guide.key} className="kx-card">
                    <h3 className="font-black text-kx-text">{localized.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-kx-subtle">{localized.description}</p>
                  </div>
                );
              })}
            </section>
            <section className="kx-card">
              <h2 className="mb-3 flex items-center gap-2 font-black text-kx-text"><Newspaper className="h-4 w-4 text-kx-accent" /> {copy.exclusiveEditorialTitle}</h2>
              {q.data.items.length ? (
                <div className="space-y-2">
                  {q.data.items.map((item) => (
                    <Link key={item.id} href="/guide" className="block rounded-kx-md bg-kx-soft p-3 hover:bg-kx-accentSoft">
                      <div className="font-bold text-kx-text">{item.title}</div>
                      <p className="mt-1 line-clamp-2 text-sm text-kx-subtle">{item.summary}</p>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-kx-muted">{copy.exclusiveEditorialEmpty}</p>
              )}
            </section>
          </>
        )}
      </div>
    </AppShell>
  );
}
