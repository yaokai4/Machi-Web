"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Award,
  BadgeCheck,
  Ban,
  History,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Snowflake,
  UserRoundCheck,
} from "lucide-react";
import { api, APIError } from "@/lib/api";
import { AppShell } from "@/components/shell/AppShell";
import { ErrorState, InlineLoading } from "@/components/design/States";
import { useSession, useToasts } from "@/lib/store";
import { fullDateTime } from "@/lib/format";
import type { KXReputationBadge, KXReputationEvent, KXReputationProfile, KXUser } from "@/lib/types";

type ReputationUserRow = {
  user: KXUser;
  reputation: KXReputationProfile;
};

type RiskReview = {
  id?: string;
  user_id?: string;
  target_kind?: string;
  target_id?: string;
  reason?: string;
  status?: string;
  risk_score?: number;
  created_at?: string;
  user?: KXUser | null;
};

const STATUS_FILTERS = [
  { value: "", label: "全部" },
  { value: "normal", label: "正常" },
  { value: "watch", label: "观察" },
  { value: "limited", label: "限制" },
  { value: "restricted", label: "高危" },
  { value: "blocked", label: "冻结" },
];

export default function AdminReputationPage() {
  const router = useRouter();
  const user = useSession((s) => s.user);
  const status = useSession((s) => s.status);

  useEffect(() => {
    if (status === "unauthed") router.replace("/login?redirect=/admin/reputation");
  }, [router, status]);

  if (status === "loading" || status === "idle") {
    return (
      <AppShell>
        <InlineLoading />
      </AppShell>
    );
  }
  if (!user) return null;
  if (user.role !== "admin") {
    return (
      <AppShell>
        <main className="px-6 py-16 text-center font-bold">无权访问</main>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <header className="sticky top-0 z-30 kx-glass-bar px-3 py-2">
        <Link href="/admin" className="inline-flex items-center gap-1 text-xs font-bold text-kx-muted hover:text-kx-accent">
          <ArrowLeft className="h-4 w-4" /> 管理后台
        </Link>
        <h1 className="mt-1 inline-flex items-center gap-2 text-lg font-black">
          <ShieldCheck className="h-5 w-5 text-kx-accent" /> 城市声望与信任
        </h1>
      </header>
      <AdminReputationWorkspace />
    </AppShell>
  );
}

function AdminReputationWorkspace() {
  const queryClient = useQueryClient();
  const pushToast = useToasts((s) => s.push);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [minRisk, setMinRisk] = useState(31);
  const users = useQuery({
    queryKey: ["admin-reputation-users", q, status],
    queryFn: () => api.adminReputationUsers({ q: q || undefined, status: status || undefined }),
  });
  const risk = useQuery({
    queryKey: ["admin-reputation-risk", minRisk],
    queryFn: () => api.adminReputationRisk(minRisk) as Promise<RiskReview[]>,
  });
  const events = useQuery({
    queryKey: ["admin-reputation-events", selectedUserId],
    queryFn: () => api.adminReputationEvents({ user_id: selectedUserId || undefined }),
  });
  const badges = useQuery({
    queryKey: ["reputation-badges"],
    queryFn: () => api.reputationBadges(),
  });

  const selected = useMemo(
    () => users.data?.find((row) => row.user.id === selectedUserId) || users.data?.[0] || null,
    [selectedUserId, users.data],
  );

  useEffect(() => {
    if (!selectedUserId && users.data?.[0]?.user.id) setSelectedUserId(users.data[0].user.id);
  }, [selectedUserId, users.data]);

  const refreshAll = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["admin-reputation-users"] }),
      queryClient.invalidateQueries({ queryKey: ["admin-reputation-risk"] }),
      queryClient.invalidateQueries({ queryKey: ["admin-reputation-events"] }),
    ]);
  };

  const reportError = (error: unknown) => {
    pushToast({ kind: "error", message: (error as APIError).message || "操作失败" });
  };

  return (
    <main className="space-y-3 px-3 py-3 sm:px-4">
      <section className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="kx-card">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-base font-black">信任用户池</h2>
              <p className="mt-1 text-xs text-kx-muted">按声望状态筛查用户，快速定位高风险或高贡献账号。</p>
            </div>
            <button className="kx-button-ghost h-9 px-3 text-xs" onClick={refreshAll}>
              <RefreshCw className="h-4 w-4" />刷新
            </button>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_10rem]">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-kx-muted" />
              <input className="kx-input h-9 pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜索 handle、昵称、邮箱" />
            </label>
            <select className="kx-input h-9" value={status} onChange={(e) => setStatus(e.target.value)}>
              {STATUS_FILTERS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </div>
          {users.isError ? <ErrorState title="声望用户加载失败" onRetry={() => users.refetch()} /> : null}
          {!users.data && users.isLoading ? <InlineLoading /> : null}
          {users.data ? (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="text-left text-xs text-kx-muted">
                  <tr>
                    <th className="py-2">用户</th>
                    <th>等级</th>
                    <th>声望</th>
                    <th>风险</th>
                    <th>状态</th>
                    <th>能力</th>
                  </tr>
                </thead>
                <tbody>
                  {users.data.map((row) => (
                    <UserTrustRow
                      key={row.user.id}
                      row={row}
                      selected={row.user.id === selectedUserId}
                      onSelect={() => setSelectedUserId(row.user.id)}
                    />
                  ))}
                </tbody>
              </table>
              {!users.data.length ? <p className="py-6 text-center text-sm text-kx-muted">没有匹配用户。</p> : null}
            </div>
          ) : null}
        </div>

        <ActionPanel
          selected={selected}
          badges={badges.data || []}
          onDone={refreshAll}
          onError={reportError}
        />
      </section>

      <section className="grid gap-3 lg:grid-cols-[24rem_minmax(0,1fr)]">
        <RiskQueue risk={risk.data || []} minRisk={minRisk} setMinRisk={setMinRisk} isLoading={risk.isLoading} isError={risk.isError} onRetry={() => risk.refetch()} />
        <EventLog events={events.data || []} selected={selected} isLoading={events.isLoading} isError={events.isError} onRetry={() => events.refetch()} />
      </section>
    </main>
  );
}

function UserTrustRow({ row, selected, onSelect }: { row: ReputationUserRow; selected: boolean; onSelect: () => void }) {
  const r = row.reputation;
  return (
    <tr
      className={selected ? "cursor-pointer border-t border-kx-accent/30 bg-kx-accentSoft/40" : "cursor-pointer border-t border-kx-stroke/40 hover:bg-kx-soft/40"}
      onClick={onSelect}
    >
      <td className="py-2">
        <div className="font-bold">@{row.user.handle}</div>
        <div className="text-xs text-kx-muted">{row.user.display_name}</div>
      </td>
      <td className="font-black">Lv.{r.level}</td>
      <td>{r.reputation_score ?? 0}</td>
      <td className={Number(r.risk_score || 0) >= 60 ? "font-black text-rose-600" : "font-semibold text-kx-text"}>{r.risk_score ?? 0}</td>
      <td><TrustPill profile={r} /></td>
      <td className="text-xs text-kx-muted">
        {r.limits.can_publish_rental ? "房源 " : ""}
        {r.limits.can_publish_job ? "招聘 " : ""}
        {r.limits.can_publish_service ? "服务" : ""}
        {!r.limits.can_publish_rental && !r.limits.can_publish_job && !r.limits.can_publish_service ? "基础发布" : null}
      </td>
    </tr>
  );
}

function ActionPanel({
  selected,
  badges,
  onDone,
  onError,
}: {
  selected: ReputationUserRow | null;
  badges: KXReputationBadge[];
  onDone: () => Promise<void>;
  onError: (error: unknown) => void;
}) {
  const pushToast = useToasts((s) => s.push);
  const [xpDelta, setXpDelta] = useState("0");
  const [repDelta, setRepDelta] = useState("0");
  const [riskDelta, setRiskDelta] = useState("0");
  const [reason, setReason] = useState("");
  const [badgeKey, setBadgeKey] = useState("");
  const [freezeDays, setFreezeDays] = useState("7");
  const activeBadges = badges.filter((badge) => badge.is_active !== false);

  useEffect(() => {
    if (!badgeKey && activeBadges[0]?.key) setBadgeKey(activeBadges[0].key);
  }, [activeBadges, badgeKey]);

  const mutation = useMutation({
    mutationFn: async (action: "adjust" | "grant" | "revoke" | "freeze" | "unfreeze") => {
      if (!selected) throw new Error("请先选择用户");
      const user_id = selected.user.id;
      const trimmedReason = reason.trim() || "管理员人工处理";
      if (action === "adjust") {
        return api.adminReputationAdjust({
          user_id,
          xp_delta: Number(xpDelta || 0),
          reputation_delta: Number(repDelta || 0),
          risk_delta: Number(riskDelta || 0),
          reason: trimmedReason,
        });
      }
      if (action === "grant") return api.adminReputationGrantBadge({ user_id, badge_key: badgeKey, reason: trimmedReason });
      if (action === "revoke") return api.adminReputationRevokeBadge({ user_id, badge_key: badgeKey, reason: trimmedReason });
      if (action === "freeze") return api.adminReputationFreeze({ user_id, days: Number(freezeDays || 7), reason: trimmedReason });
      return api.adminReputationUnfreeze({ user_id, reason: trimmedReason });
    },
    onSuccess: async () => {
      pushToast({ kind: "success", message: "声望记录已更新" });
      await onDone();
    },
    onError,
  });

  if (!selected) {
    return (
      <aside className="kx-card">
        <h2 className="text-base font-black">人工处置</h2>
        <p className="mt-2 text-sm text-kx-muted">选择一个用户后可调整 XP、声望、风险、徽章和冻结状态。</p>
      </aside>
    );
  }

  return (
    <aside className="kx-card">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-black">人工处置</h2>
          <p className="mt-1 text-xs text-kx-muted">@{selected.user.handle} · Lv.{selected.reputation.level} · {selected.reputation.reputation_label}</p>
        </div>
        <TrustPill profile={selected.reputation} />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <NumberField label="XP" value={xpDelta} onChange={setXpDelta} />
        <NumberField label="声望" value={repDelta} onChange={setRepDelta} />
        <NumberField label="风险" value={riskDelta} onChange={setRiskDelta} />
      </div>
      <textarea
        className="kx-input mt-2 min-h-20 resize-y"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="处理原因，会写入管理员审计日志"
      />
      <button className="kx-button-primary mt-2 h-9 w-full" onClick={() => mutation.mutate("adjust")} disabled={mutation.isPending}>
        <UserRoundCheck className="h-4 w-4" />保存人工调整
      </button>

      <div className="mt-4 rounded-kx-md border border-kx-stroke/60 p-3">
        <label className="text-xs font-bold text-kx-muted">徽章</label>
        <select className="kx-input mt-1 h-9" value={badgeKey} onChange={(e) => setBadgeKey(e.target.value)}>
          {activeBadges.map((badge) => <option key={badge.key} value={badge.key}>{badge.name_zh}</option>)}
        </select>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button className="kx-button-ghost h-9 px-2 text-xs" onClick={() => mutation.mutate("grant")} disabled={mutation.isPending || !badgeKey}>
            <Award className="h-4 w-4" />授予
          </button>
          <button className="kx-button-ghost h-9 px-2 text-xs" onClick={() => mutation.mutate("revoke")} disabled={mutation.isPending || !badgeKey}>
            <Ban className="h-4 w-4" />撤销
          </button>
        </div>
      </div>

      <div className="mt-3 rounded-kx-md border border-kx-stroke/60 p-3">
        <label className="text-xs font-bold text-kx-muted">成长冻结天数</label>
        <input className="kx-input mt-1 h-9" type="number" min={1} max={365} value={freezeDays} onChange={(e) => setFreezeDays(e.target.value)} />
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button className="kx-button-ghost h-9 px-2 text-xs" onClick={() => mutation.mutate("freeze")} disabled={mutation.isPending}>
            <Snowflake className="h-4 w-4" />冻结
          </button>
          <button className="kx-button-ghost h-9 px-2 text-xs" onClick={() => mutation.mutate("unfreeze")} disabled={mutation.isPending}>
            <ShieldCheck className="h-4 w-4" />解冻
          </button>
        </div>
      </div>
    </aside>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="text-xs font-bold text-kx-muted">{label}</span>
      <input className="kx-input mt-1 h-9" type="number" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function RiskQueue({
  risk,
  minRisk,
  setMinRisk,
  isLoading,
  isError,
  onRetry,
}: {
  risk: RiskReview[];
  minRisk: number;
  setMinRisk: (value: number) => void;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}) {
  return (
    <section className="kx-card">
      <div className="flex items-center justify-between gap-2">
        <h2 className="inline-flex items-center gap-2 text-base font-black">
          <ShieldAlert className="h-4 w-4 text-amber-600" /> 风险队列
        </h2>
        <input className="kx-input h-8 w-20" type="number" min={0} max={100} value={minRisk} onChange={(e) => setMinRisk(Number(e.target.value || 0))} />
      </div>
      {isError ? <ErrorState title="风险队列加载失败" onRetry={onRetry} /> : null}
      {isLoading ? <InlineLoading /> : null}
      <div className="mt-3 space-y-2">
        {risk.map((item) => (
          <div key={item.id || `${item.user_id}-${item.target_id}-${item.created_at}`} className="rounded-kx-md border border-kx-stroke/60 px-3 py-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-black text-kx-text">@{item.user?.handle || item.user_id || "unknown"}</p>
                <p className="mt-0.5 line-clamp-2 text-xs text-kx-muted">{item.reason || item.target_kind || "需要复核"}</p>
              </div>
              <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-black text-amber-700">{item.risk_score ?? "-"}</span>
            </div>
            <p className="mt-1 text-xs text-kx-muted">{item.created_at ? fullDateTime(item.created_at) : ""}</p>
          </div>
        ))}
        {!isLoading && !risk.length ? <p className="text-sm text-kx-muted">当前没有超过阈值的风险复核。</p> : null}
      </div>
    </section>
  );
}

function EventLog({
  events,
  selected,
  isLoading,
  isError,
  onRetry,
}: {
  events: KXReputationEvent[];
  selected: ReputationUserRow | null;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}) {
  return (
    <section className="kx-card">
      <h2 className="inline-flex items-center gap-2 text-base font-black">
        <History className="h-4 w-4 text-kx-accent" /> 声望日志
      </h2>
      <p className="mt-1 text-xs text-kx-muted">{selected ? `当前筛选 @${selected.user.handle}` : "全部用户最近记录"}</p>
      {isError ? <ErrorState title="声望日志加载失败" onRetry={onRetry} /> : null}
      {isLoading ? <InlineLoading /> : null}
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="text-left text-xs text-kx-muted">
            <tr>
              <th className="py-2">时间</th>
              <th>规则</th>
              <th>目标</th>
              <th>XP</th>
              <th>声望</th>
              <th>风险</th>
              <th>原因</th>
            </tr>
          </thead>
          <tbody>
            {events.map((event) => (
              <tr key={event.id} className="border-t border-kx-stroke/40">
                <td className="whitespace-nowrap py-2 text-xs text-kx-muted">{fullDateTime(event.created_at)}</td>
                <td className="font-semibold">{event.rule_key}</td>
                <td className="text-xs text-kx-muted">{event.target_kind || "-"}</td>
                <td className={event.xp_delta > 0 ? "font-black text-emerald-600" : event.xp_delta < 0 ? "font-black text-rose-600" : ""}>{formatDelta(event.xp_delta)}</td>
                <td className={event.reputation_delta > 0 ? "font-black text-emerald-600" : event.reputation_delta < 0 ? "font-black text-rose-600" : ""}>{formatDelta(event.reputation_delta)}</td>
                <td className={event.risk_delta > 0 ? "font-black text-rose-600" : event.risk_delta < 0 ? "font-black text-emerald-600" : ""}>{formatDelta(event.risk_delta)}</td>
                <td className="max-w-64 truncate text-xs text-kx-muted">{event.reason || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!isLoading && !events.length ? <p className="py-6 text-center text-sm text-kx-muted">暂无声望事件。</p> : null}
      </div>
    </section>
  );
}

function TrustPill({ profile }: { profile: KXReputationProfile }) {
  const status = profile.reputation_status;
  const className =
    status === "normal"
      ? "bg-emerald-100 text-emerald-700"
      : status === "watch"
        ? "bg-amber-100 text-amber-700"
        : "bg-rose-100 text-rose-700";
  return (
    <span className={`inline-flex h-7 items-center rounded-full px-2.5 text-xs font-black ${className}`}>
      <BadgeCheck className="mr-1 h-3.5 w-3.5" />
      {profile.reputation_label || status}
    </span>
  );
}

function formatDelta(value: number) {
  if (!value) return "0";
  return value > 0 ? `+${value}` : String(value);
}
