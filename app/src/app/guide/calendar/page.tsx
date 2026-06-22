"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays } from "lucide-react";
import { guide, type GuideTodo } from "@/lib/guide";
import { GuideShell } from "@/components/guide/GuideKit";
import { GuideCalendarPanel } from "@/components/guide/GuideOS";
import { GuideCalendarMonth } from "@/components/guide/GuideCalendarMonth";
import { InlineLoading, ErrorState } from "@/components/design/States";
import { useAuthPrompt, useSession } from "@/lib/store";

export default function GuideCalendarPage() {
  const user = useSession((s) => s.user);
  const openAuthPrompt = useAuthPrompt((s) => s.open);
  const range = useMemo(() => {
    const start = new Date();
    const end = new Date();
    end.setDate(end.getDate() + 45);
    return { from: isoDate(start), to: isoDate(end) };
  }, []);
  const q = useQuery({
    queryKey: ["guide", "calendar", user?.id || "guest", range.from, range.to],
    queryFn: () => guide.calendar({ ...range, limit: 200 }),
    enabled: Boolean(user),
  });

  if (!user) {
    return (
      <GuideShell back={{ href: "/guide", label: "日本指南" }}>
        <div className="px-4 py-8 sm:px-7">
          <section className="kx-guide-hero p-6">
            <CalendarDays className="h-8 w-8 text-kx-accent" />
            <h1 className="mt-3 text-3xl font-black text-kx-text">登录后查看 Guide 日历</h1>
            <p className="mt-2 max-w-xl text-sm leading-7 text-kx-subtle">出愿、ES、面试、考试、签证、房租和手机费会按日期出现在这里。</p>
            <button type="button" onClick={() => openAuthPrompt("generic")} className="kx-button-primary mt-5 h-10 px-4">登录后继续</button>
          </section>
        </div>
      </GuideShell>
    );
  }

  const todos = (q.data?.items.map((item) => item.todo).filter(Boolean) as GuideTodo[] | undefined) || [];
  return (
    <GuideShell back={{ href: "/guide", label: "日本指南" }}>
      <div className="space-y-7 px-4 py-7 sm:px-7">
        <header className="kx-guide-hero p-6">
          <p className="text-xs font-black uppercase tracking-[0.12em] text-[rgb(var(--kx-living-warm))]">Guide Calendar</p>
          <h1 className="mt-2 text-3xl font-black tracking-[-0.02em] text-kx-text">你的日本计划日历</h1>
          <p className="mt-2 text-sm leading-7 text-kx-subtle">统一管理生活账单、签证、大学出愿、公司 ES、面试和日语学习任务。</p>
        </header>

        {q.isLoading ? (
          <InlineLoading />
        ) : q.isError ? (
          <ErrorState title="日历加载失败" subtitle="请稍后重试。" onRetry={() => q.refetch()} />
        ) : (
          <>
            {/* Desktop: month grid + day detail; mobile: grouped list (spec P2). */}
            <div className="hidden lg:block"><GuideCalendarMonth todos={todos} /></div>
            <div className="lg:hidden"><GuideCalendarPanel todos={todos} /></div>
          </>
        )}
      </div>
    </GuideShell>
  );
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}
