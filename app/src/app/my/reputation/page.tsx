"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Award, BadgeCheck, ChevronRight, History, ShieldCheck, Sparkles } from "lucide-react";
import { api } from "@/lib/api";
import type { KXReputationEvent, KXReputationLevel } from "@/lib/types";
import { AppShell } from "@/components/shell/AppShell";
import { ErrorState, InlineLoading } from "@/components/design/States";
import { useSession } from "@/lib/store";
import { fullDateTime } from "@/lib/format";

export default function MyReputationPage() {
  const router = useRouter();
  const status = useSession((s) => s.status);

  useEffect(() => {
    if (status === "unauthed") router.replace("/login?redirect=/my/reputation");
  }, [status, router]);

  const reputation = useQuery({
    queryKey: ["reputation-me"],
    queryFn: () => api.reputationMe(),
    enabled: status === "authed",
  });
  const logs = useQuery({
    queryKey: ["reputation-logs-me"],
    queryFn: () => api.reputationLogsMe(80),
    enabled: status === "authed",
  });
  const levels = useQuery({
    queryKey: ["reputation-levels"],
    queryFn: () => api.reputationLevels(),
    enabled: status === "authed",
  });

  if (status === "loading" || status === "idle") {
    return (
      <AppShell wide right={null}>
        <InlineLoading />
      </AppShell>
    );
  }

  return (
    <AppShell wide right={null}>
      <header className="sticky top-0 z-30 kx-glass-bar px-4 py-3">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => router.back()}
              aria-label="返回"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-kx-stroke/60 bg-kx-card text-kx-text transition hover:border-kx-accent/40 hover:text-kx-accent active:scale-95"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-wide text-kx-muted">Machi Reputation</p>
              <h1 className="text-xl font-black text-kx-text">城市声望</h1>
            </div>
          </div>
          <Link href="/me" className="inline-flex h-10 items-center gap-1.5 rounded-full border border-kx-stroke px-3 text-sm font-bold text-kx-text">
            我的主页 <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-3 px-4 py-4 pb-[calc(96px+env(safe-area-inset-bottom))] md:pb-8">
        {reputation.isError ? <ErrorState title="城市声望暂时无法加载" onRetry={() => reputation.refetch()} /> : null}
        {reputation.isLoading ? <InlineLoading /> : null}
        {reputation.data ? (
          <>
            <section className="kx-card">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="inline-flex h-9 items-center gap-2 rounded-full bg-kx-accentSoft px-3 text-sm font-black text-kx-accent">
                    <ShieldCheck className="h-4 w-4" />
                    {reputation.data.reputation_label}
                  </div>
                  <h2 className="mt-3 text-2xl font-black text-kx-text">Lv.{reputation.data.level} {reputation.data.level_name}</h2>
                  <p className="mt-1 max-w-xl text-sm leading-6 text-kx-subtle">{reputation.data.level_description}</p>
                </div>
                <div className="rounded-kx-lg border border-kx-stroke/70 bg-kx-soft/40 px-4 py-3 text-left sm:text-right">
                  <p className="text-xs font-bold text-kx-muted">当前 XP</p>
                  <p className="mt-1 text-2xl font-black text-kx-text">{reputation.data.xp ?? 0}</p>
                  {reputation.data.next_level_xp ? (
                    <p className="mt-1 text-xs font-semibold text-kx-muted">距离下一等级 {reputation.data.xp_to_next ?? 0} XP</p>
                  ) : (
                    <p className="mt-1 text-xs font-semibold text-kx-muted">已达到当前最高等级</p>
                  )}
                </div>
              </div>

              <ProgressBar current={reputation.data.xp ?? 0} start={reputation.data.current_level_xp || 0} end={reputation.data.next_level_xp || reputation.data.xp || 1} />

              <div className="mt-4 grid gap-2 sm:grid-cols-4">
                <Metric label="帮助用户" value={reputation.data.stats.helpedUsers} />
                <Metric label="优质内容" value={reputation.data.stats.qualityPosts} />
                <Metric label="被收藏" value={reputation.data.stats.favoritesReceived} />
                <Metric label="无违规天数" value={reputation.data.stats.violationFreeDays} />
              </div>
            </section>

            <section className="grid gap-3 md:grid-cols-2">
              <div className="kx-card">
                <h3 className="flex items-center gap-2 text-base font-black text-kx-text"><BadgeCheck className="h-4 w-4 text-kx-accent" /> 当前权益</h3>
                <div className="mt-3 space-y-2">
                  {reputation.data.privileges.slice(0, 8).map((item) => (
                    <div key={`${item.level}-${item.key}`} className="rounded-kx-md border border-kx-stroke/60 px-3 py-2">
                      <p className="text-sm font-bold text-kx-text">{item.title_zh}</p>
                      <p className="text-xs text-kx-muted">Lv.{item.level}</p>
                    </div>
                  ))}
                  {!reputation.data.privileges.length ? <p className="text-sm text-kx-muted">继续贡献真实城市信息后会解锁更多权益。</p> : null}
                </div>
              </div>
              <div className="kx-card">
                <h3 className="flex items-center gap-2 text-base font-black text-kx-text"><Award className="h-4 w-4 text-kx-accent" /> 徽章与奖励</h3>
                <div className="mt-3 flex flex-wrap gap-2">
                  {reputation.data.badges.map((badge) => (
                    <span key={badge.key} className="inline-flex h-8 items-center rounded-full border border-kx-stroke bg-kx-soft px-3 text-xs font-black text-kx-text">
                      {badge.name_zh}
                    </span>
                  ))}
                  {!reputation.data.badges.length ? <span className="text-sm text-kx-muted">暂无徽章</span> : null}
                </div>
                <div className="mt-4 space-y-2">
                  {reputation.data.rewards.slice(0, 4).map((reward) => (
                    <div key={reward.user_reward_id || reward.key} className="rounded-kx-md bg-kx-soft/60 px-3 py-2 text-sm font-semibold text-kx-text">
                      {reward.name_zh}
                    </div>
                  ))}
                  {!reputation.data.rewards.length ? <p className="text-sm text-kx-muted">升级后会获得发布额度、优先审核或 Guide 优惠等非游戏化奖励。</p> : null}
                </div>
              </div>
            </section>

            <section className="kx-card">
              <h3 className="flex items-center gap-2 text-base font-black text-kx-text"><Sparkles className="h-4 w-4 text-kx-accent" /> 当前发布能力</h3>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <Capability label="二手发布" ok={reputation.data.limits.can_publish_secondhand} detail={reputation.data.limits.secondhand_requires_review ? "可能进入审核或抽检" : "可正常发布"} />
                <Capability label="房源发布" ok={reputation.data.limits.can_publish_rental} detail="需要 Lv.3 且声望正常" />
                <Capability label="招聘发布" ok={reputation.data.limits.can_publish_job} detail="需要 Lv.3 且声望良好" />
                <Capability label="本地服务" ok={reputation.data.limits.can_publish_service} detail="需要 Lv.3 且声望良好" />
              </div>
            </section>

            <section className="kx-card">
              <h3 className="flex items-center gap-2 text-base font-black text-kx-text"><History className="h-4 w-4 text-kx-accent" /> 最近记录</h3>
              <div className="mt-3 space-y-2">
                {logs.isLoading ? <InlineLoading /> : null}
                {(logs.data || []).map((event) => <EventRow key={event.id} event={event} />)}
                {!logs.isLoading && !(logs.data || []).length ? <p className="text-sm text-kx-muted">还没有声望记录。</p> : null}
              </div>
            </section>

            <section className="kx-card">
              <h3 className="text-base font-black text-kx-text">等级路径</h3>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {(levels.data || []).map((level) => (
                  <LevelRow key={level.level} level={level} current={reputation.data.level} />
                ))}
              </div>
            </section>
          </>
        ) : null}
      </main>
    </AppShell>
  );
}

function ProgressBar({ current, start, end }: { current: number; start: number; end: number }) {
  const total = Math.max(1, end - start);
  const pct = Math.max(0, Math.min(100, ((current - start) / total) * 100));
  return (
    <div className="mt-4">
      <div className="h-2 overflow-hidden rounded-full bg-kx-soft">
        <div className="h-full rounded-full bg-kx-accent" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-kx-md bg-kx-soft/60 px-3 py-2">
      <p className="text-xs font-bold text-kx-muted">{label}</p>
      <p className="mt-1 text-lg font-black text-kx-text">{value}</p>
    </div>
  );
}

function Capability({ label, ok, detail }: { label: string; ok?: boolean; detail: string }) {
  return (
    <div className="rounded-kx-md border border-kx-stroke/60 px-3 py-2">
      <p className="flex items-center justify-between gap-2 text-sm font-black text-kx-text">
        {label}
        <span className={ok ? "text-emerald-600" : "text-amber-600"}>{ok ? "可用" : "受限"}</span>
      </p>
      <p className="mt-1 text-xs text-kx-muted">{detail}</p>
    </div>
  );
}

function EventRow({ event }: { event: KXReputationEvent }) {
  const xp = event.xp_delta;
  const rep = event.reputation_delta;
  return (
    <div className="flex items-start justify-between gap-3 rounded-kx-md border border-kx-stroke/60 px-3 py-2">
      <div className="min-w-0">
        <p className="truncate text-sm font-bold text-kx-text">{event.reason || event.rule_key || "城市声望记录"}</p>
        <p className="mt-0.5 text-xs text-kx-muted">{fullDateTime(event.created_at)}</p>
      </div>
      <div className="shrink-0 text-right text-xs font-black">
        {xp ? <p className={xp > 0 ? "text-emerald-600" : "text-rose-600"}>{xp > 0 ? "+" : ""}{xp} XP</p> : null}
        {rep ? <p className={rep > 0 ? "text-emerald-600" : "text-rose-600"}>{rep > 0 ? "+" : ""}{rep} 声望</p> : null}
      </div>
    </div>
  );
}

function LevelRow({ level, current }: { level: KXReputationLevel; current: number }) {
  const active = level.level <= current;
  return (
    <div className={active ? "rounded-kx-md border border-kx-accent/30 bg-kx-accentSoft/40 px-3 py-2" : "rounded-kx-md border border-kx-stroke/60 px-3 py-2"}>
      <p className="text-sm font-black text-kx-text">Lv.{level.level} {level.name_zh}</p>
      <p className="mt-0.5 text-xs text-kx-muted">{level.xp_required} XP</p>
    </div>
  );
}
