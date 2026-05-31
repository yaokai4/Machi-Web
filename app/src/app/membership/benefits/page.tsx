"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { BadgeCheck, CheckCircle2, ChevronLeft } from "lucide-react";
import { api } from "@/lib/api";
import { AppShell } from "@/components/shell/AppShell";
import { ErrorState, InlineLoading } from "@/components/design/States";

export default function MembershipBenefitsPage() {
  const q = useQuery({ queryKey: ["membership-benefits"], queryFn: () => api.membershipBenefits() });

  return (
    <AppShell requireAuth={false}>
      <header className="sticky top-0 z-30 kx-glass-bar px-3 py-2 flex items-center gap-2">
        <Link href="/membership" className="grid h-9 w-9 place-items-center rounded-full hover:bg-kx-soft" aria-label="返回会员页">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <BadgeCheck className="h-5 w-5 text-kx-verified" />
        <h1 className="text-lg font-bold">会员权益详情</h1>
      </header>
      <div className="space-y-3 px-3 py-3 sm:px-4">
        {q.isLoading ? <InlineLoading /> : q.isError || !q.data ? (
          <ErrorState onRetry={() => q.refetch()} />
        ) : (
          <>
            <section className="kx-card">
              <h2 className="text-xl font-black text-kx-text">Machi 认证会员</h2>
              <p className="mt-2 text-sm leading-6 text-kx-subtle">{q.data.disclaimer}</p>
            </section>
            <section className="kx-card">
              <div className="grid gap-3 sm:grid-cols-2">
                {q.data.benefits.map((benefit) => (
                  <div key={benefit.key} className="rounded-kx-md bg-kx-soft p-3">
                    <div className="flex items-center gap-2 font-black text-kx-text">
                      <CheckCircle2 className="h-4 w-4 text-kx-verified" />
                      {benefit.title}
                    </div>
                    <p className="mt-1 text-sm leading-6 text-kx-subtle">{benefit.description}</p>
                  </div>
                ))}
              </div>
            </section>
            <Link href="/membership" className="kx-button-primary w-full justify-center">开通或查看会员状态</Link>
          </>
        )}
      </div>
    </AppShell>
  );
}
