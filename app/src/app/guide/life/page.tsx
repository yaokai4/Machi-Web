"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, CheckCircle2, ChevronDown, History, Home, Plus, Trash2, WalletCards } from "lucide-react";
import { guide } from "@/lib/guide";
import type { GuideLifeItem } from "@/lib/guide";
import { GuideShell } from "@/components/guide/GuideKit";
import { EmptyPanel, GuideTodoCard } from "@/components/guide/GuideOS";
import { GuideAttachmentManager } from "@/components/guide/GuideAttachmentManager";
import { InlineLoading } from "@/components/design/States";
import { useAuthPrompt, useSession, useToasts } from "@/lib/store";

const lifeTypes = [
  ["rent", "房租"],
  ["electricity", "电费"],
  ["gas", "燃气费"],
  ["water", "水费"],
  ["internet", "网络费"],
  ["phone", "手机费"],
  ["tuition", "学费"],
  ["transport", "交通定期"],
  ["credit_card", "信用卡"],
  ["insurance", "国民健康保险"],
  ["pension", "年金"],
  ["tax", "住民税"],
  ["visa", "签证 / 在留卡"],
  ["housing_contract", "房屋契约"],
];

export default function GuideLifePage() {
  const user = useSession((s) => s.user);
  const openAuthPrompt = useAuthPrompt((s) => s.open);
  const pushToast = useToasts((s) => s.push);
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ type: "rent", title: "房租", provider: "", amount: "", dueDay: "27", reminderDaysBefore: "3", recurrence: "monthly", paymentMethod: "", notes: "" });
  const presets = useQuery({
    queryKey: ["guide", "life-presets"],
    queryFn: () => guide.lifePresets(),
    staleTime: 1000 * 60 * 30,
  });
  const todos = useQuery({
    queryKey: ["guide", "todos", "life", user?.id || "guest"],
    queryFn: () => guide.todos({ type: "life_payment", status: "open", limit: 60 }),
    enabled: Boolean(user),
  });
  const items = useQuery({
    queryKey: ["guide", "life-items", user?.id || "guest"],
    queryFn: () => guide.lifeItems(),
    enabled: Boolean(user),
  });
  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["guide", "life-items"] });
    queryClient.invalidateQueries({ queryKey: ["guide", "todos"] });
    queryClient.invalidateQueries({ queryKey: ["guide", "calendar"] });
  };
  const create = useMutation({
    mutationFn: () => guide.createLifeItem({
      type: form.type,
      title: form.title,
      provider: form.provider,
      amount: Number(form.amount || 0),
      dueDay: Number(form.dueDay || 0),
      reminderDaysBefore: Number(form.reminderDaysBefore || 3),
      paymentMethod: form.paymentMethod,
      notes: form.notes,
      recurrence: form.recurrence,
    }),
    onSuccess: () => {
      invalidateAll();
      pushToast({ kind: "success", message: "生活事项已添加" });
    },
    onError: (err) => pushToast({ kind: "error", message: err instanceof Error ? err.message : "添加失败" }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => guide.deleteLifeItem(id),
    onSuccess: () => { invalidateAll(); pushToast({ kind: "success", message: "已删除该生活事项及其待办" }); },
    onError: (err) => pushToast({ kind: "error", message: err instanceof Error ? err.message : "删除失败" }),
  });

  if (!user) {
    return (
      <GuideShell back={{ href: "/guide", label: "今日" }}>
        <div className="px-4 py-8 sm:px-7">
          <section className="kx-guide-hero p-6">
            <WalletCards className="h-8 w-8 text-kx-accent" />
            <h1 className="mt-3 text-3xl font-black text-kx-text">登录后管理生活日程</h1>
            <p className="mt-2 text-sm leading-7 text-kx-subtle">房租、学费、水电网络、手机费、签证更新和保险年金都会同步到 Guide 日历。</p>
            <button type="button" onClick={() => openAuthPrompt("generic")} className="kx-button-primary mt-5 h-10 px-4">登录后继续</button>
          </section>
        </div>
      </GuideShell>
    );
  }

  return (
    <GuideShell back={{ href: "/guide", label: "今日" }}>
      <div className="space-y-7 px-4 py-7 sm:px-7">
        <header className="kx-guide-hero p-6">
          <p className="text-xs font-black uppercase tracking-[0.12em] text-[rgb(var(--kx-living-warm))]">Life Plan</p>
          <h1 className="mt-2 text-3xl font-black text-kx-text">生活缴费与合同提醒</h1>
          <p className="mt-2 max-w-2xl text-sm leading-7 text-kx-subtle">管理房租、学费、水电网络、手机费、保险、年金、住民税、签证和房屋契约更新。</p>
        </header>

        <section className="grid gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
          <form className="kx-card space-y-4 p-5" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
            <div className="flex items-center gap-2">
              <Home className="h-5 w-5 text-kx-accent" />
              <h2 className="text-lg font-black text-kx-text">添加生活事项</h2>
            </div>
            <label className="block">
              <span className="text-sm font-black text-kx-text">类型</span>
              <select value={form.type} onChange={(e) => {
                const p = presets.data?.items.find((x) => x.type === e.target.value);
                const label = p?.label || lifeTypes.find(([k]) => k === e.target.value)?.[1] || "";
                // Selecting a preset pre-fills its smart defaults (recurrence +
                // 提前提醒天数) so the user doesn't have to know them (spec P1).
                setForm((f) => ({
                  ...f,
                  type: e.target.value,
                  title: label,
                  recurrence: p?.recurrence || f.recurrence,
                  reminderDaysBefore: p ? String(p.reminderDaysBefore) : f.reminderDaysBefore,
                }));
              }} className="mt-2 h-11 w-full rounded-2xl border border-kx-stroke/60 bg-kx-card px-3 text-sm font-semibold outline-none focus:border-kx-accent">
                {(presets.data?.items.length
                  ? presets.data.items.map((p) => [p.type, p.label] as const)
                  : lifeTypes
                ).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </select>
              {form.recurrence ? <span className="mt-1 block text-[11px] font-semibold text-kx-muted">默认周期：{recurrenceLabel(form.recurrence)} · 提前 {form.reminderDaysBefore} 天提醒</span> : null}
            </label>
            <Field label="标题" value={form.title} onChange={(v) => setForm((f) => ({ ...f, title: v }))} />
            <Field label="服务商 / 备注" value={form.provider} onChange={(v) => setForm((f) => ({ ...f, provider: v }))} placeholder="ahamo / 东京电力 / 房东" />
            <div className="grid grid-cols-2 gap-3">
              <Field label="金额 JPY" value={form.amount} onChange={(v) => setForm((f) => ({ ...f, amount: v }))} placeholder="80000" />
              <Field label="每月几号" value={form.dueDay} onChange={(v) => setForm((f) => ({ ...f, dueDay: v }))} placeholder="27" />
            </div>
            <Field label="提前几天提醒" value={form.reminderDaysBefore} onChange={(v) => setForm((f) => ({ ...f, reminderDaysBefore: v }))} placeholder="3" />
            <Field label="支付方式" value={form.paymentMethod} onChange={(v) => setForm((f) => ({ ...f, paymentMethod: v }))} placeholder="银行转账 / 信用卡 / 口座振替" />
            <button type="submit" disabled={create.isPending} className="kx-button-primary h-11 w-full disabled:opacity-60">
              <Plus className="h-4 w-4" /> 添加到日历
            </button>
          </form>

          <div className="space-y-7">
            {items.data?.items.length ? (
              <section>
                <h2 className="mb-3 text-xl font-black text-kx-text">我的生活事项</h2>
                <div className="space-y-3">
                  {items.data.items.map((item) => (
                    <LifeItemCard key={item.id} item={item} onDelete={() => remove.mutate(item.id)} deleting={remove.isPending && remove.variables === item.id} />
                  ))}
                </div>
              </section>
            ) : null}

            <section>
              <h2 className="mb-3 text-xl font-black text-kx-text">生活待办</h2>
              {todos.isLoading ? <InlineLoading /> : todos.data?.items.length ? (
                <div className="space-y-3">
                  {todos.data.items.map((todo) => <GuideTodoCard key={todo.id} todo={todo} />)}
                </div>
              ) : (
                <EmptyPanel title="还没有生活待办" body="添加房租、手机费、网络费、签证到期等事项后，会自动生成 Todo 和日历提醒。" />
              )}
            </section>
          </div>
        </section>
      </div>
    </GuideShell>
  );
}

// A saved life item with its amount + due day and a delete affordance. Deleting
// removes the item AND its generated payment todos + reminders.
function LifeItemCard({ item, onDelete, deleting }: { item: GuideLifeItem; onDelete: () => void; deleting: boolean }) {
  const [open, setOpen] = useState(false);
  const [paidAt, setPaidAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [amountInput, setAmountInput] = useState(String(item.amount || ""));
  const [method, setMethod] = useState(item.paymentMethod || "");
  const [notes, setNotes] = useState("");
  const queryClient = useQueryClient();
  const pushToast = useToasts((state) => state.push);
  const history = useQuery({
    queryKey: ["guide", "life-payments", item.id],
    queryFn: () => guide.lifePayments(item.id),
    enabled: open,
  });
  const pay = useMutation({
    mutationFn: () => guide.createLifePayment(item.id, {
      amount: Number(amountInput || item.amount || 0),
      currency: item.currency,
      paymentMethod: method,
      paidAt,
      notes,
    }),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ["guide", "life-payments", item.id] });
      queryClient.invalidateQueries({ queryKey: ["guide", "life-items"] });
      queryClient.invalidateQueries({ queryKey: ["guide", "todos"] });
      queryClient.invalidateQueries({ queryKey: ["guide", "calendar"] });
      setNotes("");
      pushToast({ kind: "success", message: response.nextDueAt ? `已记录支付，下一期 ${response.nextDueAt}` : "已记录支付" });
    },
    onError: (error) => pushToast({ kind: "error", message: error instanceof Error ? error.message : "支付记录保存失败" }),
  });
  const amount = item.amount ? `${item.currency || "JPY"} ${item.amount.toLocaleString()}` : "";
  const due = item.dueDay ? `每月 ${item.dueDay} 号` : (item.dueAt || "");
  return (
    <div className="kx-card p-4">
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-kx-accentSoft text-kx-accent">
          <WalletCards className="h-5 w-5" />
        </span>
        <button type="button" onClick={() => setOpen((value) => !value)} className="min-w-0 flex-1 text-left" aria-expanded={open}>
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-black text-kx-text">{item.title}</p>
            {amount ? <span className="shrink-0 rounded-full bg-kx-accentSoft px-2 py-0.5 text-[11px] font-bold text-kx-accent">{amount}</span> : null}
          </div>
          {item.provider ? <p className="mt-0.5 truncate text-xs text-kx-muted">{item.provider}</p> : null}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {due ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-kx-stroke/60 bg-kx-card px-2 py-0.5 text-[11px] font-semibold text-kx-subtle">
                <CalendarClock className="h-3 w-3" /> {due}
              </span>
            ) : null}
            {item.paymentMethod ? (
              <span className="rounded-full border border-kx-stroke/60 bg-kx-card px-2 py-0.5 text-[11px] font-semibold text-kx-subtle">{item.paymentMethod}</span>
            ) : null}
          </div>
        </button>
        <button type="button" onClick={() => setOpen((value) => !value)} className="grid min-h-11 min-w-11 place-items-center rounded-xl text-kx-muted hover:bg-kx-soft" aria-label={open ? "收起支付详情" : "展开支付详情"}>
          <ChevronDown className={"h-4 w-4 transition " + (open ? "rotate-180" : "")} />
        </button>
        <button
          type="button"
          onClick={() => {
            if (window.confirm(`删除「${item.title}」及其待办和支付历史？`)) onDelete();
          }}
          disabled={deleting}
          aria-label="删除生活事项"
          className="grid min-h-11 min-w-11 place-items-center rounded-xl text-kx-muted transition hover:bg-rose-500/10 hover:text-rose-500 disabled:opacity-50"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      {open ? (
        <div className="mt-4 border-t border-kx-stroke/60 pt-4">
          <div className="grid gap-3 sm:grid-cols-4">
            <label className="grid gap-1 text-xs font-bold text-kx-muted">支付日期<input type="date" value={paidAt} onChange={(event) => setPaidAt(event.target.value)} className="min-h-11 rounded-xl border border-kx-stroke/60 bg-kx-bg px-3 text-sm text-kx-text" /></label>
            <label className="grid gap-1 text-xs font-bold text-kx-muted">金额<input inputMode="numeric" value={amountInput} onChange={(event) => setAmountInput(event.target.value)} className="min-h-11 rounded-xl border border-kx-stroke/60 bg-kx-bg px-3 text-sm text-kx-text" /></label>
            <label className="grid gap-1 text-xs font-bold text-kx-muted">支付方式<input value={method} onChange={(event) => setMethod(event.target.value)} className="min-h-11 rounded-xl border border-kx-stroke/60 bg-kx-bg px-3 text-sm text-kx-text" /></label>
            <button type="button" onClick={() => pay.mutate()} disabled={pay.isPending || !paidAt} className="kx-button-primary min-h-11 self-end px-4 disabled:opacity-60">
              <CheckCircle2 className="h-4 w-4" /> {pay.isPending ? "保存中" : "标记已支付"}
            </button>
          </div>
          <label className="mt-3 grid gap-1 text-xs font-bold text-kx-muted">备注<input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="例如：口座振替成功" className="min-h-11 rounded-xl border border-kx-stroke/60 bg-kx-bg px-3 text-sm text-kx-text" /></label>
          <div className="mt-4">
            <GuideAttachmentManager entityType="guide_life_item" entityId={item.id} title="缴费附件" compact />
          </div>
          <div className="mt-4">
            <h4 className="flex items-center gap-2 text-sm font-black text-kx-text"><History className="h-4 w-4 text-kx-accent" />支付历史</h4>
            {history.isLoading ? <p className="mt-2 text-xs text-kx-muted">加载中…</p> : history.data?.items.length ? (
              <div className="mt-2 divide-y divide-kx-stroke/50">
                {history.data.items.map((payment) => (
                  <div key={payment.id} className="flex items-center justify-between gap-3 py-2 text-xs">
                    <span className="font-semibold text-kx-text">{payment.paidAt.slice(0, 10)} · {payment.paymentMethod || "未注明方式"}</span>
                    <span className="font-black text-kx-accent">{payment.currency} {payment.amount.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            ) : <p className="mt-2 text-xs text-kx-muted">还没有支付记录。</p>}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function recurrenceLabel(r: string): string {
  return { monthly: "每月", quarterly: "每季", semester: "每学期", yearly: "每年", once: "一次性", weekly: "每周" }[r] || r;
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="block">
      <span className="text-sm font-black text-kx-text">{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="mt-2 h-11 w-full rounded-2xl border border-kx-stroke/60 bg-kx-card px-3 text-sm font-semibold outline-none focus:border-kx-accent" />
    </label>
  );
}
