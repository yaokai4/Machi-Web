"use client";

import Link from "next/link";
import type React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  FileText,
  JapaneseYen,
  ListChecks,
  Package,
  Route,
  Settings2,
  ShieldCheck,
  TrendingUp,
  UserRoundCheck,
  WalletCards,
} from "lucide-react";
import { ErrorState, InlineLoading } from "@/components/design/States";
import { GuideAdminShell } from "@/components/guide/GuideAdminKit";
import {
  adminGuide,
  type GuideAdminOSRow,
  type GuideApplication,
  type GuideLifeItem,
  type GuidePlan,
  type GuideProfile,
  type GuideTodo,
} from "@/lib/guide";

function userLabel(row: { user?: { handle?: string; displayName?: string; email?: string } }) {
  return row.user?.displayName || row.user?.handle || row.user?.email || "未知用户";
}

function dateText(value?: string | null) {
  return value ? String(value).slice(0, 10) : "未设置";
}

function StatCard({ label, value, icon: Icon, hint }: { label: string; value: unknown; icon: typeof UserRoundCheck; hint?: string }) {
  return (
    <div className="rounded-kx-lg border border-kx-stroke/60 bg-kx-card p-4">
      <Icon className="mb-3 h-5 w-5 text-kx-accent" />
      <div className="text-xs font-semibold text-kx-muted">{label}</div>
      <div className="mt-1 text-2xl font-black text-kx-text">{String(value ?? 0)}</div>
      {hint ? <div className="mt-1 text-[11px] font-medium text-kx-subtle">{hint}</div> : null}
    </div>
  );
}

function StatGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-kx-lg border border-kx-stroke/60 bg-kx-card/70 p-4">
      <h2 className="mb-3 text-sm font-black text-kx-text">{title}</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{children}</div>
    </section>
  );
}

function pct(part?: number, total?: number) {
  return total ? Math.round(((part || 0) * 100) / total) : 0;
}

function ConfigLinkCard({
  href,
  title,
  body,
  metric,
  icon: Icon,
}: {
  href: string;
  title: string;
  body: string;
  metric: string;
  icon: typeof UserRoundCheck;
}) {
  return (
    <Link href={href} className="rounded-kx-lg border border-kx-stroke/60 bg-kx-card p-4 transition hover:-translate-y-0.5 hover:border-kx-accent/40">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-kx-md bg-kx-accentSoft text-kx-accent">
          <Icon className="h-5 w-5" />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-black text-kx-text">{title}</span>
          <span className="mt-1 block text-xs leading-5 text-kx-muted">{body}</span>
          <span className="mt-2 inline-flex rounded-full bg-kx-soft px-2 py-0.5 text-[11px] font-bold text-kx-accent">{metric}</span>
        </span>
      </div>
    </Link>
  );
}

function RuleCoverage({ label, value, detail }: { label: string; value: number; detail: string }) {
  return (
    <div className="rounded-kx-md border border-kx-stroke/50 bg-white/70 p-3">
      <div className="flex items-center justify-between gap-3 text-xs font-bold">
        <span className="text-kx-text">{label}</span>
        <span className="text-kx-accent">{value}%</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-kx-soft">
        <div className="h-full rounded-full bg-kx-accent" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </div>
      <p className="mt-2 text-[11px] leading-5 text-kx-muted">{detail}</p>
    </div>
  );
}

function Section<T extends { id?: string }>({ title, items, render }: {
  title: string;
  items: T[];
  render: (item: T) => React.ReactNode;
}) {
  return (
    <section className="rounded-kx-lg border border-kx-stroke/60 bg-kx-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-black text-kx-text">{title}</h2>
        <span className="rounded-full bg-kx-soft px-2 py-1 text-xs font-semibold text-kx-muted">{items.length}</span>
      </div>
      <div className="space-y-2">
        {items.length === 0 ? (
          <div className="rounded-kx-md bg-kx-soft p-3 text-sm text-kx-muted">暂无数据</div>
        ) : items.map((item, index) => (
          <div key={item.id || index} className="rounded-kx-md border border-kx-stroke/50 bg-white/70 p-3">
            {render(item)}
          </div>
        ))}
      </div>
    </section>
  );
}

export default function AdminGuideOSPage() {
  const q = useQuery({
    queryKey: ["admin-guide", "os"],
    queryFn: () => adminGuide.os({ limit: 30 }),
    staleTime: 30_000,
  });

  return (
    <GuideAdminShell title="Guide OS 运营台" subtitle="关注身份画像、计划留存、Todo 完成、截止风险，以及资料/服务的自然转化。">
      {q.isLoading ? <InlineLoading /> : null}
      {q.error ? <ErrorState subtitle={(q.error as Error).message} onRetry={() => q.refetch()} /> : null}
      {q.data ? (
        <div className="space-y-4">
          <StatGroup title="留存与完成">
            <StatCard label="身份画像" value={q.data.stats.profiles} icon={UserRoundCheck} hint="已完成 Guide Profile" />
            <StatCard label="活跃计划" value={q.data.stats.activePlans} icon={ListChecks} hint={`30 天新建 ${q.data.stats.plansStarted30d ?? 0}`} />
            <StatCard label="计划完成率" value={`${q.data.stats.planCompletionRate ?? 0}%`} icon={TrendingUp} hint={`${q.data.stats.completedPlans ?? 0}/${q.data.stats.totalPlans ?? 0} 个计划`} />
            <StatCard label="Todo 完成率" value={`${q.data.stats.todoCompletionRate ?? 0}%`} icon={CheckCircle2} hint={`近 7 天完成 ${q.data.stats.completedTodos7d ?? 0}`} />
          </StatGroup>

          <StatGroup title="截止风险">
            <StatCard label="未完成 Todo" value={q.data.stats.openTodos} icon={CalendarClock} />
            <StatCard label="已逾期 Todo" value={q.data.stats.overdueTodos} icon={AlertTriangle} />
            <StatCard label="7 天内截止" value={q.data.stats.dueIn7Days} icon={CalendarClock} hint={`申请/面试 ${q.data.stats.applicationDeadlines7d ?? 0}`} />
            <StatCard label="生活缴费" value={q.data.stats.lifeItems} icon={WalletCards} hint={`7 天内 ${q.data.stats.lifeDue7d ?? 0}`} />
          </StatGroup>

          <StatGroup title="资料与服务转化">
            <StatCard label="订单转化率" value={`${q.data.stats.orderConversionRate ?? 0}%`} icon={TrendingUp} hint={`${q.data.stats.paidGuideOrders ?? 0}/${q.data.stats.guideOrders ?? 0} 单`} />
            <StatCard label="资料订单" value={q.data.stats.materialOrders} icon={ListChecks} />
            <StatCard label="服务转化率" value={`${q.data.stats.serviceConversionRate ?? 0}%`} icon={TrendingUp} hint={`${q.data.stats.convertedServiceRequests ?? 0}/${q.data.stats.serviceRequests ?? 0} 个请求`} />
            <StatCard label="Guide 收入" value={q.data.stats.guideRevenue} icon={JapaneseYen} hint="按订单原币金额合计" />
          </StatGroup>

          <section className="rounded-kx-lg border border-kx-stroke/60 bg-kx-card/70 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-black text-kx-text">Guide OS 配置作战室</h2>
                <p className="mt-1 text-xs leading-5 text-kx-muted">从运营数据直接回到模板、步骤、文章来源、资料和服务配置，保证 Guide 不是说明页，而是可执行系统。</p>
              </div>
              <span className="inline-flex items-center gap-1 rounded-full bg-kx-accentSoft px-2.5 py-1 text-xs font-bold text-kx-accent">
                <Settings2 className="h-3.5 w-3.5" /> 规则入口
              </span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <ConfigLinkCard
                href="/admin/guide/journeys"
                title="身份路径与计划模板"
                body="维护大学生、语言学校、社会人、转职、升学、日语学习等路径模板。"
                metric={`${q.data.stats.publishedJourneys ?? 0} 路径 · ${q.data.stats.publishedJourneySteps ?? 0} 步骤`}
                icon={Route}
              />
              <ConfigLinkCard
                href="/admin/guide/journeys"
                title="Step 到 Todo 映射"
                body="检查每个 Step 是否能生成明确行动、建议日期、截止提示和上下文资料。"
                metric={`${q.data.stats.stepsWithArticles ?? 0} 挂文章 · ${q.data.stats.stepsWithProducts ?? 0} 挂资料`}
                icon={ListChecks}
              />
              <ConfigLinkCard
                href="/admin/guide/articles"
                title="可信内容来源"
                body="补全 sourceUrl、sourceLabel、verifiedAt、staleAfterDays，减少过期政策风险。"
                metric={`${q.data.stats.articlesWithSources ?? 0}/${q.data.stats.publishedArticles ?? 0} 有来源`}
                icon={ShieldCheck}
              />
              <ConfigLinkCard
                href="/admin/guide/products"
                title="资料与服务库"
                body="维护履历书、研究计划书、JLPT、面试辅导、签证/租房服务等可转化资源。"
                metric={`${q.data.stats.publishedMaterials ?? 0} 资料 · ${q.data.stats.publishedServices ?? 0} 服务`}
                icon={Package}
              />
              <ConfigLinkCard
                href="/admin/guide/service-requests"
                title="服务线索处理"
                body="跟进从 Todo 上下文进入的咨询、代办、修改和面试辅导请求。"
                metric={`${q.data.stats.convertedServiceRequests ?? 0}/${q.data.stats.serviceRequests ?? 0} 已转化`}
                icon={CalendarClock}
              />
              <ConfigLinkCard
                href="/admin/guide/orders"
                title="资料订单复盘"
                body="观察哪些任务带来资料购买，用于调整推荐 slugs 和套餐组合。"
                metric={`${q.data.stats.paidGuideOrders ?? 0} 付费订单`}
                icon={FileText}
              />
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <RuleCoverage
                label="文章来源覆盖"
                value={pct(q.data.stats.articlesWithSources, q.data.stats.publishedArticles)}
                detail={`${q.data.stats.articlesWithSources ?? 0} 篇已挂来源，${q.data.stats.articlesVerified ?? 0} 篇已核验。`}
              />
              <RuleCoverage
                label="步骤资料覆盖"
                value={pct(q.data.stats.stepsWithProducts, q.data.stats.publishedJourneySteps)}
                detail="关键 Step 需要关联资料/服务，用户完成任务时才会自然转化。"
              />
              <RuleCoverage
                label="服务端提醒沉淀"
                value={pct(q.data.stats.activeReminders, q.data.stats.openTodos)}
                detail={`${q.data.stats.activeReminders ?? 0} 个活跃提醒存放在服务端，不依赖 iOS 本地计划状态。`}
              />
            </div>
          </section>

          <div className="grid gap-4 lg:grid-cols-2">
            <Section<GuideAdminOSRow<GuideProfile>> title="最近身份路径" items={q.data.profiles} render={(item) => (
              <div>
                <div className="font-bold text-kx-text">{userLabel(item)}</div>
                <div className="mt-1 text-xs leading-5 text-kx-muted">
                  身份 {item.identityType || "未设置"} · 城市 {item.city || "未设置"} · 日语 {item.japaneseLevel || "-"} → {item.targetJapaneseLevel || "-"}
                </div>
              </div>
            )} />
            <Section<GuideAdminOSRow<GuidePlan>> title="最近计划" items={q.data.plans} render={(item) => (
              <div>
                <div className="font-bold text-kx-text">{item.title || "未命名计划"}</div>
                <div className="mt-1 text-xs leading-5 text-kx-muted">
                  {userLabel(item)} · {item.status} · {item.progressPercent}% · Todo {item.todoDone ?? 0}/{item.todoTotal ?? 0}
                </div>
              </div>
            )} />
            <Section<GuideAdminOSRow<GuideTodo>> title="最紧急 Todo" items={q.data.todos} render={(item) => (
              <div>
                <div className="font-bold text-kx-text">{item.title}</div>
                <div className="mt-1 text-xs leading-5 text-kx-muted">
                  {userLabel(item)} · {item.todoType} · {item.priority} · {dateText(item.plannedDate || item.dueAt || item.reminderAt)}
                </div>
              </div>
            )} />
            <Section<GuideAdminOSRow<GuideApplication>> title="出愿 / ES / 面试" items={q.data.applications} render={(item) => (
              <div>
                <div className="font-bold text-kx-text">{item.name}</div>
                <div className="mt-1 text-xs leading-5 text-kx-muted">
                  {userLabel(item)} · {item.type} · 截止 {dateText(item.deadline)} · 面试 {dateText(item.interviewAt)}
                </div>
              </div>
            )} />
            <Section<GuideAdminOSRow<GuideLifeItem>> title="生活缴费提醒" items={q.data.lifeItems} render={(item) => (
              <div>
                <div className="font-bold text-kx-text">{item.title}</div>
                <div className="mt-1 text-xs leading-5 text-kx-muted">
                  {userLabel(item)} · {item.type} · {item.provider || "未填机构"} · {dateText(item.dueAt)} · {item.amount ? `${item.amount} ${item.currency}` : "金额未填"}
                </div>
              </div>
            )} />
          </div>
        </div>
      ) : null}
    </GuideAdminShell>
  );
}
