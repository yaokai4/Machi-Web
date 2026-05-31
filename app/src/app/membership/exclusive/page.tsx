"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { BadgeCheck, ChevronLeft, LockKeyhole, Newspaper } from "lucide-react";
import { api, APIError } from "@/lib/api";
import { AppShell } from "@/components/shell/AppShell";
import { ErrorState, InlineLoading } from "@/components/design/States";
import { useAuthPrompt, useSession } from "@/lib/store";

export default function MembershipExclusivePage() {
  const user = useSession((s) => s.user);
  const openAuthPrompt = useAuthPrompt((s) => s.open);
  const q = useQuery({ queryKey: ["membership-exclusive"], queryFn: () => api.membershipExclusive(), retry: false, enabled: !!user });
  const err = q.error as APIError | null;
  const needsUpgrade = err?.code === "MEMBERSHIP_REQUIRED" || err?.status === 403;

  return (
    <AppShell requireAuth={false}>
      <header className="sticky top-0 z-30 kx-glass-bar px-3 py-2 flex items-center gap-2">
        <Link href="/membership" className="grid h-9 w-9 place-items-center rounded-full hover:bg-kx-soft" aria-label="返回会员页">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <BadgeCheck className="h-5 w-5 text-kx-verified" />
        <h1 className="text-lg font-bold">会员专属</h1>
      </header>
      <div className="space-y-3 px-3 py-3 sm:px-4">
        {!user ? (
          <section className="kx-card text-center">
            <LockKeyhole className="mx-auto h-9 w-9 text-kx-verified" />
            <h2 className="mt-3 text-xl font-black text-kx-text">登录后访问会员专属内容</h2>
            <p className="mt-2 text-sm leading-6 text-kx-subtle">登录后可以查看会员专属城市资讯、生活指南和高信任内容入口。</p>
            <button type="button" onClick={() => openAuthPrompt("generic")} className="kx-button-primary mt-4 w-full justify-center">登录后继续</button>
          </section>
        ) : q.isLoading ? <InlineLoading /> : needsUpgrade ? (
          <section className="kx-card text-center">
            <LockKeyhole className="mx-auto h-9 w-9 text-kx-verified" />
            <h2 className="mt-3 text-xl font-black text-kx-text">开通 Machi 认证会员后可访问</h2>
            <p className="mt-2 text-sm leading-6 text-kx-subtle">这里会汇总会员专属城市资讯精选、东京 / 大阪生活指南、租房避坑合集和高信任内容发布入口。</p>
            <Link href="/membership" className="kx-button-primary mt-4 w-full justify-center">查看会员权益</Link>
          </section>
        ) : q.isError || !q.data ? (
          <ErrorState onRetry={() => q.refetch()} />
        ) : (
          <>
            <section className="kx-card">
              <h2 className="text-xl font-black text-kx-text">你的会员专区</h2>
              <p className="mt-2 text-sm text-kx-subtle">到期时间：{q.data.membership.current_period_end || "同步中"}</p>
            </section>
            <section className="grid gap-3 sm:grid-cols-3">
              {q.data.guides.map((guide) => (
                <div key={guide.key} className="kx-card">
                  <h3 className="font-black text-kx-text">{guide.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-kx-subtle">{guide.description}</p>
                </div>
              ))}
            </section>
            <section className="kx-card">
              <h2 className="mb-3 flex items-center gap-2 font-black text-kx-text"><Newspaper className="h-4 w-4 text-kx-accent" /> 城市资讯精选</h2>
              {q.data.items.length ? (
                <div className="space-y-2">
                  {q.data.items.map((item) => (
                    <Link key={item.id} href={`/news/${item.id}`} className="block rounded-kx-md bg-kx-soft p-3 hover:bg-kx-accentSoft">
                      <div className="font-bold text-kx-text">{item.title}</div>
                      <p className="mt-1 line-clamp-2 text-sm text-kx-subtle">{item.summary}</p>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-kx-muted">编辑部发布会员精选后会显示在这里。</p>
              )}
            </section>
          </>
        )}
      </div>
    </AppShell>
  );
}
