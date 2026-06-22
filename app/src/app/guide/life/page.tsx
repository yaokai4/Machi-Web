"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Home, Plus, Trash2, WalletCards } from "lucide-react";
import { guide } from "@/lib/guide";
import type { GuideLifeItem } from "@/lib/guide";
import { GuideShell } from "@/components/guide/GuideKit";
import { EmptyPanel, GuideTodoCard } from "@/components/guide/GuideOS";
import { InlineLoading } from "@/components/design/States";
import { useAuthPrompt, useSession, useToasts } from "@/lib/store";

const lifeTypes = [
  ["rent", "房租"],
  ["electricity", "电费"],
  ["gas", "燃气费"],
  ["water", "水费"],
  ["internet", "网络费"],
  ["phone", "手机费"],
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
  const [form, setForm] = useState({ type: "rent", title: "房租", provider: "", amount: "", dueDay: "27", reminderDaysBefore: "3", paymentMethod: "", notes: "" });
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
      recurrence: "monthly",
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
      <GuideShell back={{ href: "/guide", label: "日本指南" }}>
        <div className="px-4 py-8 sm:px-7">
          <section className="kx-guide-hero p-6">
            <WalletCards className="h-8 w-8 text-kx-accent" />
            <h1 className="mt-3 text-3xl font-black text-kx-text">登录后管理生活日程</h1>
            <p className="mt-2 text-sm leading-7 text-kx-subtle">房租、水电网络、手机费、签证更新和保险年金都会同步到 Guide 日历。</p>
            <button type="button" onClick={() => openAuthPrompt("generic")} className="kx-button-primary mt-5 h-10 px-4">登录后继续</button>
          </section>
        </div>
      </GuideShell>
    );
  }

  return (
    <GuideShell back={{ href: "/guide", label: "日本指南" }}>
      <div className="space-y-7 px-4 py-7 sm:px-7">
        <header className="kx-guide-hero p-6">
          <p className="text-xs font-black uppercase tracking-[0.12em] text-[rgb(var(--kx-living-warm))]">Life Plan</p>
          <h1 className="mt-2 text-3xl font-black text-kx-text">日本生活日程管家</h1>
          <p className="mt-2 max-w-2xl text-sm leading-7 text-kx-subtle">管理房租、水电网络、手机费、保险、年金、住民税、签证和房屋契约更新。</p>
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
                const label = lifeTypes.find(([k]) => k === e.target.value)?.[1] || "";
                setForm((f) => ({ ...f, type: e.target.value, title: label }));
              }} className="mt-2 h-11 w-full rounded-2xl border border-kx-stroke/60 bg-kx-card px-3 text-sm font-semibold outline-none focus:border-kx-accent">
                {lifeTypes.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </select>
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
  const amount = item.amount ? `${item.currency || "JPY"} ${item.amount.toLocaleString()}` : "";
  const due = item.dueDay ? `每月 ${item.dueDay} 号` : (item.dueAt || "");
  return (
    <div className="kx-card flex items-start gap-3 p-4">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-kx-accentSoft text-kx-accent">
        <WalletCards className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
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
      </div>
      <button
        type="button"
        onClick={onDelete}
        disabled={deleting}
        aria-label="删除生活事项"
        className="shrink-0 rounded-xl p-2 text-kx-muted transition hover:bg-rose-500/10 hover:text-rose-500 disabled:opacity-50"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="block">
      <span className="text-sm font-black text-kx-text">{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="mt-2 h-11 w-full rounded-2xl border border-kx-stroke/60 bg-kx-card px-3 text-sm font-semibold outline-none focus:border-kx-accent" />
    </label>
  );
}
