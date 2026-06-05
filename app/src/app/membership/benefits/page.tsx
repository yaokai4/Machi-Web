"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { BadgeCheck, CheckCircle2, ChevronLeft } from "lucide-react";
import { api } from "@/lib/api";
import { AppShell } from "@/components/shell/AppShell";
import { ErrorState, InlineLoading } from "@/components/design/States";
import { useI18n } from "@/lib/i18n";
import { membershipBenefitCopy, membershipUi } from "@/lib/membership-ui";

export default function MembershipBenefitsPage() {
  const q = useQuery({ queryKey: ["membership-benefits"], queryFn: () => api.membershipBenefits() });
  const { locale } = useI18n();
  const copy = membershipUi(locale);

  return (
    <AppShell requireAuth={false}>
      <header className="sticky top-0 z-30 kx-glass-bar px-3 py-2 flex items-center gap-2">
        <Link href="/membership" className="grid h-9 w-9 place-items-center rounded-full hover:bg-kx-soft" aria-label={copy.backToMembership}>
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <BadgeCheck className="h-5 w-5 text-kx-verified" />
        <h1 className="text-lg font-bold">{copy.benefitsTitle}</h1>
      </header>
      <div className="space-y-3 px-3 py-3 sm:px-4">
        {q.isLoading ? <InlineLoading /> : q.isError || !q.data ? (
          <ErrorState onRetry={() => q.refetch()} />
        ) : (
          <>
            <section className="kx-card">
              <h2 className="text-xl font-black text-kx-text">{copy.benefitsIntroTitle}</h2>
              <p className="mt-2 text-sm leading-6 text-kx-subtle">{copy.benefitsDisclaimer}</p>
            </section>
            <section className="kx-card">
              <div className="grid gap-3 sm:grid-cols-2">
                {q.data.benefits.map((benefit) => {
                  const localized = membershipBenefitCopy(benefit.key, locale, benefit);
                  return (
                    <div key={benefit.key} className="rounded-kx-md bg-kx-soft p-3">
                      <div className="flex items-center gap-2 font-black text-kx-text">
                        <CheckCircle2 className="h-4 w-4 text-kx-verified" />
                        {localized.title}
                      </div>
                      <p className="mt-1 text-sm leading-6 text-kx-subtle">{localized.description}</p>
                    </div>
                  );
                })}
              </div>
            </section>
            <Link href="/membership" className="kx-button-primary w-full justify-center">{copy.benefitsCta}</Link>
          </>
        )}
      </div>
    </AppShell>
  );
}
