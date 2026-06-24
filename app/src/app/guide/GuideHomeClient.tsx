"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  CalendarClock,
  CalendarDays,
  ClipboardCheck,
  FilePlus2,
  FolderKanban,
  IdCard,
  ListChecks,
  Plus,
  Receipt,
  Route,
  Sparkles,
  Wallet,
  WalletCards,
  type LucideIcon,
} from "lucide-react";
import { guide, type GuideActivePlanResponse, type GuideDigest, type GuideHomeResponse, type GuideJourney, type GuideTodo } from "@/lib/guide";
import {
  CategoryCard,
  GuideShell,
  GuideComingSoon,
  ResourceEntryCard,
  useGuideCountry,
} from "@/components/guide/GuideKit";
import { EmptyPanel, GuideQuickAddTodo, GuideTodoCard } from "@/components/guide/GuideOS";
import { ErrorState } from "@/components/design/States";
import { useAuthPrompt, useSession, useToasts } from "@/lib/store";
import { appLocaleToGuideLanguage, useI18n } from "@/lib/i18n";

type QuickAction = {
  href: string;
  title: string;
  body: string;
  icon: LucideIcon;
  tone: string;
};

const QUICK_ACTIONS: QuickAction[] = [
  { href: "#quick-todo", title: "新建待办", body: "直接输入一句话", icon: Plus, tone: "text-kx-accent bg-kx-accentSoft" },
  { href: "/guide/calendar", title: "新建日程", body: "安排日期和提醒", icon: CalendarDays, tone: "text-indigo-600 bg-indigo-500/10" },
  { href: "/guide/manage#life", title: "添加缴费/合同", body: "房租、水电、合约", icon: WalletCards, tone: "text-orange-600 bg-orange-500/10" },
  { href: "/guide/manage#applications", title: "添加申请", body: "学校、ES、面试", icon: FilePlus2, tone: "text-rose-600 bg-rose-500/10" },
];

const MODULES = [
  { href: "/guide", label: "今日", icon: ClipboardCheck, active: true },
  { href: "/guide/calendar", label: "日历", icon: CalendarDays },
  { href: "/guide/tasks", label: "待办", icon: ListChecks },
  { href: "/guide/manage", label: "管理", icon: FolderKanban },
  { href: "/guide/goals", label: "路径", icon: Route },
];

const SUPPORT_CATEGORY_KEYS = [
  "study_japan",
  "career_japan",
  "study_abroad_japan",
  "jlpt",
  "life_japan",
  "guide_services",
];

export default function GuideHomeClient({ initialHome }: { initialHome?: GuideHomeResponse }) {
  const country = useGuideCountry();
  const { locale } = useI18n();
  const language = appLocaleToGuideLanguage(locale);
  const user = useSession((s) => s.user);
  const openAuthPrompt = useAuthPrompt((s) => s.open);

  const home = useQuery({
    queryKey: ["guide", "home", country, language],
    queryFn: () => guide.home(country, language),
    initialData: country === "jp" ? initialHome : undefined,
    initialDataUpdatedAt: initialHome ? Date.now() : undefined,
    staleTime: 60_000,
  });
  const activePlan = useQuery({
    queryKey: ["guide", "active-plan", user?.id || "guest", language],
    queryFn: () => guide.activePlan(language),
    enabled: Boolean(user),
    staleTime: 30_000,
    retry: false,
  });
  const digest = useQuery({
    queryKey: ["guide", "digest", user?.id || "guest"],
    queryFn: () => guide.digest(14),
    enabled: Boolean(user),
    staleTime: 30_000,
    retry: false,
  });

  const sortedJourneys = useMemo(
    () => orderJourneys(home.data?.journeys || [], activePlan.data),
    [home.data?.journeys, activePlan.data],
  );
  const supportCategories = useMemo(() => {
    const categories = (home.data?.categories || []).filter((category) => !category.parentKey);
    return SUPPORT_CATEGORY_KEYS
      .map((key) => categories.find((category) => category.key === key))
      .filter((category): category is NonNullable<typeof category> => Boolean(category));
  }, [home.data?.categories]);

  if (home.isLoading) {
    return (
      <GuideShell>
        <TodaySkeleton />
      </GuideShell>
    );
  }
  if (home.isError || !home.data) {
    return (
      <GuideShell>
        <div className="px-4 py-8 sm:px-7">
          <ErrorState title="Guide 加载失败" subtitle="请稍后重试。" onRetry={() => home.refetch()} />
        </div>
      </GuideShell>
    );
  }
  if (home.data.status === "coming_soon") {
    return (
      <GuideShell>
        <GuideComingSoon empty={home.data.emptyState} />
      </GuideShell>
    );
  }

  const todayTodos = activePlan.data?.todayTodos || [];
  const upcomingTodos = activePlan.data?.upcomingTodos || activePlan.data?.openTodos || [];
  const focusTodos = pickTodayFocus(todayTodos, activePlan.data?.openTodos || []);
  const sampleMode = !user;

  return (
    <GuideShell>
      <main className="space-y-8 px-4 py-6 sm:px-7">
        <header className="rounded-[2rem] border border-kx-stroke/40 bg-kx-card/80 px-5 py-6 shadow-[0_18px_50px_-42px_rgba(20,112,103,0.42)] sm:px-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <p className="inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.14em] text-[rgb(var(--kx-living-warm))]">
                <Sparkles className="h-3.5 w-3.5" /> Machi Guide OS
              </p>
              <h1 className="mt-3 text-3xl font-black leading-tight tracking-[-0.02em] text-kx-text sm:text-4xl">今日</h1>
              <p className="mt-2 max-w-2xl text-sm font-semibold leading-7 text-kx-subtle">把今天最重要的事情完成。</p>
              <p className="mt-1 max-w-2xl text-xs leading-6 text-kx-muted">
                Todo、日历、账单、合同、申请和路径都统一到一套行动系统里；资料只在你需要完成任务时出现。
              </p>
            </div>
            {sampleMode ? (
              <button type="button" onClick={() => openAuthPrompt("generic")} className="kx-button-primary h-11 shrink-0 px-5">
                登录后同步计划
              </button>
            ) : (
              <Link href="/guide/tasks" className="kx-button-primary h-11 shrink-0 px-5">
                查看全部待办
              </Link>
            )}
          </div>
          <GuideModuleNav />
        </header>

        {activePlan.isError ? (
          <div className="rounded-2xl border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-sm font-semibold text-amber-700 dark:text-amber-300">
            个人计划暂时加载失败，今日页仍可继续使用。请稍后重试或刷新。
          </div>
        ) : null}

        {!sampleMode && digest.data && !digest.data.hasSetup ? <GuideQuickSetupCard /> : null}
        {!sampleMode && digest.data && digest.data.hasSetup ? <GuideDigestCard data={digest.data} /> : null}

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
          <TodayFocusSection todos={focusTodos} sampleMode={sampleMode} />
          <UpcomingSection todos={upcomingTodos} sampleMode={sampleMode} />
        </section>

        <section id="quick-todo" className="scroll-mt-24">
          <SectionHeading title="快速添加" subtitle="3 次点击以内新增待办、日程、缴费/合同或申请。" />
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
            <GuideQuickAddTodo />
            <div className="grid grid-cols-2 gap-3">
              {QUICK_ACTIONS.map((action) => {
                const Icon = action.icon;
                return (
                  <Link key={action.title} href={action.href} className="kx-card group flex min-h-[112px] flex-col justify-between p-4 transition hover:-translate-y-0.5 hover:border-kx-accent/35">
                    <span className={`grid h-10 w-10 place-items-center rounded-2xl ${action.tone}`}>
                      <Icon className="h-5 w-5" />
                    </span>
                    <span>
                      <span className="block text-sm font-black text-kx-text group-hover:text-kx-accent">{action.title}</span>
                      <span className="mt-0.5 block text-xs leading-5 text-kx-muted">{action.body}</span>
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>

        <section>
          <SectionHeading title="我的进行中目标" subtitle="路径只保留为目标系统；真正推进靠 Todo 和日历。" href="/guide/goals" />
          <ActiveGoals data={activePlan.data} journeys={sortedJourneys} sampleMode={sampleMode} />
        </section>

        <section className="border-t border-kx-stroke/35 pt-8">
          <SectionHeading
            title="六大指南与资料"
            subtitle="上面推进 Todo、日历和截止日；需要查方法、学校、就职信息或购买服务时，从这里进入。"
          />
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            {supportCategories.map((category) => (
              <CategoryCard key={category.key} category={category} />
            ))}
          </div>
        </section>

        {(home.data.resourceEntries || []).length ? (
          <section>
            <SectionHeading
              title="学校与公司资料库"
              subtitle="查询大学、大学院、专门学校、语言学校，以及适合外国人就职的日本公司。"
            />
            <div className="grid gap-3 md:grid-cols-2">
              {(home.data.resourceEntries || []).map((entry) => (
                <ResourceEntryCard key={entry.key} entry={entry} />
              ))}
            </div>
          </section>
        ) : null}
      </main>
    </GuideShell>
  );
}

function GuideModuleNav() {
  return (
    <nav className="mt-5 grid grid-cols-5 gap-1 rounded-2xl border border-kx-stroke/45 bg-kx-soft/60 p-1" aria-label="Guide modules">
      {MODULES.map((item) => {
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={
              "flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-2 text-xs font-black transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kx-accent " +
              (item.active ? "bg-kx-card text-kx-accent shadow-sm" : "text-kx-muted hover:bg-kx-card/70 hover:text-kx-text")
            }
          >
            <Icon className="h-4 w-4" />
            <span className="hidden sm:inline">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function TodayFocusSection({ todos, sampleMode }: { todos: GuideTodo[]; sampleMode: boolean }) {
  return (
    <section>
      <SectionHeading title="今日重点" subtitle="最多显示 3 件真正该处理的事。" />
      {sampleMode ? (
        <GuestPreview
          icon={<ClipboardCheck className="h-5 w-5" />}
          title="今天先处理最紧急的 3 件事"
          rows={["确认本周 ES / 出愿截止", "安排房租或手机费提醒", "把 JLPT 学习拆成今日 Todo"]}
        />
      ) : todos.length ? (
        <div className="space-y-3">
          {todos.slice(0, 3).map((todo) => <GuideTodoCard key={todo.id} todo={todo} compact />)}
        </div>
      ) : (
        <EmptyPanel title="今天还没有重点任务" body="可以直接添加 Todo，或从申请、生活缴费、目标路径生成任务。" />
      )}
    </section>
  );
}

function UpcomingSection({ todos, sampleMode }: { todos: GuideTodo[]; sampleMode: boolean }) {
  const deadlines = sortByUrgency(todos).slice(0, 5);
  return (
    <section>
      <SectionHeading title="即将到期" subtitle="未来 14 天，逾期和 3 天内优先。" href="/guide/calendar" />
      {sampleMode ? (
        <GuestPreview
          icon={<Bell className="h-5 w-5" />}
          title="截止日会自动汇总到这里"
          rows={["在留卡 / 护照到期", "房租、水电、手机费、学费", "ES、面试、考试、学校出愿"]}
        />
      ) : deadlines.length ? (
        <div className="space-y-3">
          {deadlines.map((todo) => <GuideTodoCard key={todo.id} todo={todo} compact />)}
        </div>
      ) : (
        <EmptyPanel title="14 天内没有截止事项" body="添加账单、合同、申请或日程后，这里会显示倒数日。" />
      )}
    </section>
  );
}

function ActiveGoals({
  data,
  journeys,
  sampleMode,
}: {
  data?: GuideActivePlanResponse;
  journeys: GuideJourney[];
  sampleMode: boolean;
}) {
  const activePlan = data?.plan;
  const cards = journeys.slice(0, 3);
  if (sampleMode) {
    return (
      <div className="grid gap-3 md:grid-cols-3">
        {["JLPT N1", "2027 新卒就职", "在留资格更新"].map((title) => (
          <Link key={title} href="/guide/goals" className="kx-card p-4 transition hover:-translate-y-0.5 hover:border-kx-accent/35">
            <p className="text-sm font-black text-kx-text">{title}</p>
            <p className="mt-1 text-xs leading-5 text-kx-muted">登录后生成关键任务、截止日期和提醒。</p>
          </Link>
        ))}
      </div>
    );
  }
  if (activePlan) {
    return (
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <Link href="/guide/tasks" className="kx-card p-5 transition hover:-translate-y-0.5 hover:border-kx-accent/35">
          <p className="text-xs font-black uppercase tracking-[0.12em] text-[rgb(var(--kx-living-warm))]">进行中</p>
          <h3 className="mt-2 text-xl font-black text-kx-text">{activePlan.title}</h3>
          <p className="mt-1 text-sm leading-6 text-kx-muted">{activePlan.subtitle || "把关键事项按日期一步步完成。"}</p>
          <div className="mt-4">
            <div className="mb-1 flex items-center justify-between text-xs font-bold">
              <span className="text-kx-accent">已完成 {activePlan.todoDone ?? 0}/{activePlan.todoTotal ?? 0}</span>
              <span className="text-kx-muted">{activePlan.progressPercent}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-kx-soft">
              <div className="h-full rounded-full bg-kx-accent" style={{ width: `${activePlan.progressPercent}%` }} />
            </div>
          </div>
        </Link>
        <div className="kx-card p-5">
          <p className="text-xs font-bold text-kx-muted">下一步</p>
          <p className="mt-1 text-base font-black text-kx-text">{activePlan.nextTodo?.title || "所有任务都完成了"}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/guide/tasks" className="kx-button-primary h-10 px-4 text-sm">进入待办</Link>
            <Link href="/guide/calendar" className="kx-button-secondary h-10 px-4 text-sm">看日历</Link>
          </div>
        </div>
      </div>
    );
  }
  if (!cards.length) {
    return <EmptyPanel title="还没有目标模板" body="你仍然可以先添加 Todo、日程、缴费或申请。" />;
  }
  return (
    <div className="grid gap-3 md:grid-cols-3">
      {cards.map((j, index) => (
        <Link key={j.key} href={`/guide/goals/${encodeURIComponent(j.key)}`} className="kx-card p-4 transition hover:-translate-y-0.5 hover:border-kx-accent/35">
          <span className="rounded-full bg-kx-accentSoft px-2 py-1 text-[11px] font-black text-kx-accent">{index === 0 ? "推荐目标" : `${j.stepCount || 0} 步`}</span>
          <h3 className="mt-3 text-base font-black text-kx-text">{j.title}</h3>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-kx-muted">{j.subtitle}</p>
        </Link>
      ))}
    </div>
  );
}

function SectionHeading({ title, subtitle, href }: { title: string; subtitle?: string; href?: string }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-xl font-black leading-tight tracking-[-0.01em] text-kx-text">{title}</h2>
        {subtitle ? <p className="mt-0.5 text-xs leading-5 text-kx-muted">{subtitle}</p> : null}
      </div>
      {href ? (
        <Link href={href} className="shrink-0 text-xs font-bold text-kx-accent hover:underline">
          查看
        </Link>
      ) : null}
    </div>
  );
}

function GuestPreview({ icon, title, rows }: { icon: ReactNode; title: string; rows: string[] }) {
  return (
    <div className="kx-card p-5">
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-kx-accentSoft text-kx-accent">{icon}</span>
        <div className="min-w-0">
          <h3 className="text-base font-black text-kx-text">{title}</h3>
          <div className="mt-3 space-y-2">
            {rows.map((row) => (
              <div key={row} className="flex items-center gap-2 rounded-xl bg-kx-soft/70 px-3 py-2 text-sm font-semibold text-kx-subtle">
                <span className="h-2 w-2 rounded-full bg-kx-accent" />
                {row}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function TodaySkeleton() {
  return (
    <div className="space-y-8 px-4 py-6 sm:px-7">
      <div className="rounded-[2rem] border border-kx-stroke/40 bg-kx-card/70 p-7">
        <div className="h-3 w-32 animate-pulse rounded-full bg-kx-soft" />
        <div className="mt-4 h-9 w-40 animate-pulse rounded-full bg-kx-soft" />
        <div className="mt-3 h-4 w-full max-w-xl animate-pulse rounded-full bg-kx-soft" />
        <div className="mt-5 grid grid-cols-5 gap-1 rounded-2xl bg-kx-soft/60 p-1">
          {MODULES.map((m) => <div key={m.href} className="h-11 animate-pulse rounded-xl bg-kx-card/70" />)}
        </div>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <div className="h-64 animate-pulse rounded-[1.5rem] bg-kx-card" />
        <div className="h-64 animate-pulse rounded-[1.5rem] bg-kx-card" />
      </div>
    </div>
  );
}

function pickTodayFocus(today: GuideTodo[], open: GuideTodo[]) {
  if (today.length) return sortByUrgency(today);
  return sortByUrgency(open).slice(0, 3);
}

function sortByUrgency(todos: GuideTodo[]) {
  const today = isoDate(new Date());
  return [...todos]
    .filter((t) => t.status !== "done")
    .sort((a, b) => {
      const ad = (a.dueAt || a.plannedDate || "9999-99-99").slice(0, 10);
      const bd = (b.dueAt || b.plannedDate || "9999-99-99").slice(0, 10);
      const aw = ad < today ? -2 : ad === today ? -1 : 0;
      const bw = bd < today ? -2 : bd === today ? -1 : 0;
      if (aw !== bw) return aw - bw;
      if (a.priority !== b.priority) return a.priority === "high" ? -1 : b.priority === "high" ? 1 : 0;
      return ad.localeCompare(bd);
    });
}

function orderJourneys(journeys: GuideJourney[], data?: GuideActivePlanResponse) {
  const order = data?.suggestedJourneys?.map((s) => s.key) ?? [];
  return [...journeys].sort((a, b) => {
    const ia = order.indexOf(a.key);
    const ib = order.indexOf(b.key);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
}

function isoDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const yen = (n: number) => "¥" + (n || 0).toLocaleString("en-US");
const dleftLabel = (n: number) => (n <= 0 ? "今天" : `${n} 天后`);

// 本月要点 — the digest card that unifies bills, contract windows, document
// expiries, budget alerts and the month's balance into one glance on Guide home.
function GuideDigestCard({ data }: { data: GuideDigest }) {
  const rows: { icon: LucideIcon; tone: string; text: ReactNode; href: string }[] = [];
  for (const b of data.upcomingBills) rows.push({ icon: Receipt, tone: "text-orange-600", href: "/guide/life", text: <><b>{b.title}</b>{b.amount > 0 ? ` ${yen(b.amount)}` : ""} · <span className="text-kx-muted">{dleftLabel(b.daysLeft)}扣款</span></> });
  for (const w of data.contractWindows) rows.push({ icon: CalendarClock, tone: "text-kx-accent", href: "/guide/contracts", text: <><b>{w.title}</b> · <span className={w.open ? "font-bold text-kx-accent" : "text-kx-muted"}>{w.open ? "现在可解约" : `${dleftLabel(w.daysLeft)}进入解约窗口`}</span></> });
  for (const a of data.budgetAlerts) rows.push({ icon: Wallet, tone: a.over ? "text-rose-500" : "text-amber-600", href: "/guide/finance", text: <><b>{a.category}</b> 预算{a.over ? "已超" : "接近上限"} · <span className={a.over ? "font-bold text-rose-500" : "text-kx-muted"}>{yen(a.spent)} / {yen(a.limit)}</span></> });
  for (const d of data.documentExpiries) rows.push({ icon: IdCard, tone: d.daysLeft < 0 ? "text-rose-500" : "text-cyan-600", href: "/guide/documents", text: <><b>{d.title}</b> · <span className="text-kx-muted">{d.daysLeft < 0 ? "已过期" : `${dleftLabel(d.daysLeft)}到期`}</span></> });

  return (
    <section className="rounded-[1.75rem] border border-kx-stroke/40 bg-kx-card/80 p-5 shadow-[0_18px_50px_-44px_rgba(20,112,103,0.4)] sm:p-6">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-black text-kx-text"><Sparkles className="h-4 w-4 text-kx-accent" /> 本月要点</h2>
        <Link href="/guide/finance" className="text-xs font-bold text-kx-accent">收支详情 →</Link>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <DigestStat label="本月收入" value={yen(data.finance.income)} />
        <DigestStat label="本月支出" value={yen(data.finance.expense)} tone={data.finance.expense > data.finance.income && data.finance.income > 0 ? "rose" : undefined} />
        <DigestStat label="结余" value={yen(data.finance.net)} tone={data.finance.net < 0 ? "rose" : "accent"} />
      </div>
      {rows.length ? (
        <ul className="mt-4 space-y-1.5">
          {rows.slice(0, 6).map((r, i) => (
            <li key={i}>
              <Link href={r.href} className="flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm font-semibold text-kx-text transition hover:bg-kx-soft/60">
                <r.icon className={`h-4 w-4 shrink-0 ${r.tone}`} />
                <span className="min-w-0 flex-1 truncate">{r.text}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 rounded-xl bg-kx-soft/50 px-3 py-3 text-sm font-semibold text-kx-muted">近期没有要扣款的账单、解约窗口或到期证件。继续保持 👍</p>
      )}
    </section>
  );
}

function DigestStat({ label, value, tone }: { label: string; value: string; tone?: "rose" | "accent" }) {
  return (
    <div className="rounded-2xl bg-kx-soft/50 px-2 py-3">
      <div className="text-[11px] font-bold text-kx-muted">{label}</div>
      <div className={`mt-0.5 text-base font-black ${tone === "rose" ? "text-rose-500" : tone === "accent" ? "text-kx-accent" : "text-kx-text"}`}>{value}</div>
    </div>
  );
}

// 30-second cold start — pick a situation, seed a budget template.
function GuideQuickSetupCard() {
  const qc = useQueryClient();
  const pushToast = useToasts((s) => s.push);
  const [done, setDone] = useState(false);
  const setup = useMutation({
    mutationFn: (profile: string) => guide.quickSetup(profile),
    onSuccess: (r) => {
      setDone(true);
      qc.invalidateQueries({ queryKey: ["guide", "digest"] });
      pushToast({ kind: "success", message: r.created > 0 ? `已为你设好 ${r.created} 项预算模板` : "预算已就绪" });
    },
    onError: (e) => pushToast({ kind: "error", message: e instanceof Error ? e.message : "设置失败" }),
  });
  if (done) return null;
  return (
    <section className="rounded-[1.75rem] border border-kx-accent/25 bg-kx-accentSoft/40 p-5 sm:p-6">
      <h2 className="flex items-center gap-2 text-lg font-black text-kx-text"><Wallet className="h-4 w-4 text-kx-accent" /> 30 秒搭好你的生活管理</h2>
      <p className="mt-1.5 text-sm font-semibold leading-6 text-kx-subtle">选一个最接近你的身份，我们先帮你设好一份月度预算模板，记账时自动对照。之后在「收支记账」「生活缴费」里填上你的真实数字即可。</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {([["student", "我是学生"], ["worker", "我在工作"], ["general", "其他"]] as const).map(([p, label]) => (
          <button key={p} type="button" onClick={() => setup.mutate(p)} disabled={setup.isPending}
            className="kx-button-primary h-10 px-4 disabled:opacity-60">{label}</button>
        ))}
      </div>
    </section>
  );
}
