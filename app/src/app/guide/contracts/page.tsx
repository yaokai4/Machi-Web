"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, CalendarClock, FileSignature, Pencil, Plus, Trash2 } from "lucide-react";
import { guide, type GuideContract } from "@/lib/guide";
import { GuideShell } from "@/components/guide/GuideKit";
import { EmptyPanel } from "@/components/guide/GuideOS";
import { GuideAttachmentManager } from "@/components/guide/GuideAttachmentManager";
import { ErrorState, InlineLoading } from "@/components/design/States";
import { useAuthPrompt, useSession, useToasts } from "@/lib/store";

const categories = [
  ["housing", "租房合同"],
  ["phone", "手机合约"],
  ["internet", "网络合约"],
  ["insurance", "保险合同"],
  ["school", "学校合同"],
  ["employment", "工作合同"],
  ["subscription", "订阅服务"],
  ["other", "其他合同"],
] as const;

const emptyForm = {
  category: "housing",
  title: "",
  provider: "",
  startDate: "",
  endDate: "",
  cancellationWindowStart: "",
  cancellationWindowEnd: "",
  autoRenew: false,
  monthlyCost: "",
  yearlyCost: "",
  reminderDaysBefore: "30",
  contactInfo: "",
  notes: "",
};

export default function GuideContractsPage() {
  const user = useSession((s) => s.user);
  const openAuthPrompt = useAuthPrompt((s) => s.open);
  const pushToast = useToasts((s) => s.push);
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const contracts = useQuery({
    queryKey: ["guide", "contracts", user?.id || "guest"],
    queryFn: () => guide.contracts(),
    enabled: Boolean(user),
  });
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["guide", "contracts"] });
    queryClient.invalidateQueries({ queryKey: ["guide", "todos"] });
    queryClient.invalidateQueries({ queryKey: ["guide", "calendar"] });
    queryClient.invalidateQueries({ queryKey: ["guide", "active-plan"] });
  };
  const save = useMutation({
    mutationFn: () => {
      const payload: Partial<GuideContract> = {
        ...form,
        monthlyCost: Number(form.monthlyCost || 0),
        yearlyCost: Number(form.yearlyCost || 0),
        reminderDaysBefore: Number(form.reminderDaysBefore || 30),
      };
      return editingId ? guide.updateContract(editingId, payload) : guide.createContract(payload);
    },
    onSuccess: () => {
      invalidate();
      setEditingId(null);
      setForm(emptyForm);
      pushToast({ kind: "success", message: "合同提醒已保存" });
    },
    onError: (error) => pushToast({ kind: "error", message: error instanceof Error ? error.message : "保存失败" }),
  });
  const archive = useMutation({
    mutationFn: (id: string) => guide.updateContract(id, { status: "archived" }),
    onSuccess: () => { invalidate(); pushToast({ kind: "success", message: "合同已归档" }); },
  });
  const remove = useMutation({
    mutationFn: (id: string) => guide.deleteContract(id),
    onSuccess: () => { invalidate(); pushToast({ kind: "success", message: "合同和关联提醒已删除" }); },
  });

  if (!user) {
    return (
      <GuideShell back={{ href: "/guide/manage", label: "管理" }}>
        <GuestPanel title="合同管理" body="记录到期日和解约窗口，系统会自动生成 Todo 与日历提醒。" onLogin={() => openAuthPrompt("generic")} />
      </GuideShell>
    );
  }

  return (
    <GuideShell back={{ href: "/guide/manage", label: "管理" }}>
      <main className="space-y-7 px-4 py-7 sm:px-7">
        <header>
          <p className="text-xs font-black uppercase tracking-[0.12em] text-[rgb(var(--kx-living-warm))]">Contracts</p>
          <h1 className="mt-2 text-3xl font-black text-kx-text">合同管理</h1>
          <p className="mt-2 max-w-2xl text-sm leading-7 text-kx-subtle">管理续约、解约窗口和费用。系统只保存你主动填写的信息，不要求上传合同文件。</p>
        </header>

        <section className="grid gap-6 xl:grid-cols-[390px_minmax(0,1fr)]">
          <form className="kx-card space-y-4 p-5" onSubmit={(event) => { event.preventDefault(); save.mutate(); }}>
            <h2 className="text-lg font-black text-kx-text">{editingId ? "编辑合同" : "添加合同"}</h2>
            <SelectField label="合同类型" value={form.category} onChange={(value) => setForm((f) => ({ ...f, category: value }))} options={categories} />
            <TextField label="合同名称" value={form.title} onChange={(value) => setForm((f) => ({ ...f, title: value }))} placeholder="东京公寓租赁合同" />
            <TextField label="机构 / 对方" value={form.provider} onChange={(value) => setForm((f) => ({ ...f, provider: value }))} placeholder="管理会社 / 运营商 / 公司" />
            <div className="grid grid-cols-2 gap-3">
              <DateField label="开始日期" value={form.startDate} onChange={(value) => setForm((f) => ({ ...f, startDate: value }))} />
              <DateField label="到期日期" value={form.endDate} onChange={(value) => setForm((f) => ({ ...f, endDate: value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <DateField label="解约窗口开始" value={form.cancellationWindowStart} onChange={(value) => setForm((f) => ({ ...f, cancellationWindowStart: value }))} />
              <DateField label="解约窗口结束" value={form.cancellationWindowEnd} onChange={(value) => setForm((f) => ({ ...f, cancellationWindowEnd: value }))} />
            </div>
            <label className="flex min-h-11 items-center justify-between rounded-2xl border border-kx-stroke/60 bg-kx-card px-3">
              <span className="text-sm font-black text-kx-text">自动续约</span>
              <input type="checkbox" checked={form.autoRenew} onChange={(event) => setForm((f) => ({ ...f, autoRenew: event.target.checked }))} className="h-5 w-5 accent-kx-accent" />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <TextField label="月费 JPY" value={form.monthlyCost} onChange={(value) => setForm((f) => ({ ...f, monthlyCost: value }))} inputMode="numeric" />
              <TextField label="年费 JPY" value={form.yearlyCost} onChange={(value) => setForm((f) => ({ ...f, yearlyCost: value }))} inputMode="numeric" />
            </div>
            <TextField label="提前提醒天数" value={form.reminderDaysBefore} onChange={(value) => setForm((f) => ({ ...f, reminderDaysBefore: value }))} inputMode="numeric" />
            <TextField label="联系方式" value={form.contactInfo} onChange={(value) => setForm((f) => ({ ...f, contactInfo: value }))} placeholder="电话、邮箱或客服链接" />
            <TextArea label="备注" value={form.notes} onChange={(value) => setForm((f) => ({ ...f, notes: value }))} />
            <div className="flex gap-2">
              <button type="submit" disabled={!form.title.trim() || save.isPending} className="kx-button-primary min-h-11 flex-1 disabled:opacity-50">
                <Plus className="h-4 w-4" /> {save.isPending ? "保存中" : "保存合同"}
              </button>
              {editingId ? <button type="button" onClick={() => { setEditingId(null); setForm(emptyForm); }} className="kx-button-secondary min-h-11 px-4">取消</button> : null}
            </div>
          </form>

          <section>
            <h2 className="mb-3 text-xl font-black text-kx-text">我的合同</h2>
            {contracts.isLoading ? <InlineLoading /> : contracts.isError ? (
              <ErrorState title="合同加载失败" subtitle="请检查网络后重试。" onRetry={() => contracts.refetch()} />
            ) : contracts.data?.items.length ? (
              <div className="space-y-3">
                {contracts.data.items.map((item) => (
                  <ContractCard
                    key={item.id}
                    item={item}
                    onEdit={() => {
                      setEditingId(item.id);
                      setForm({
                        category: item.category,
                        title: item.title,
                        provider: item.provider,
                        startDate: item.startDate || "",
                        endDate: item.endDate || "",
                        cancellationWindowStart: item.cancellationWindowStart || "",
                        cancellationWindowEnd: item.cancellationWindowEnd || "",
                        autoRenew: item.autoRenew,
                        monthlyCost: item.monthlyCost ? String(item.monthlyCost) : "",
                        yearlyCost: item.yearlyCost ? String(item.yearlyCost) : "",
                        reminderDaysBefore: String(item.reminderDaysBefore || 30),
                        contactInfo: item.contactInfo,
                        notes: item.notes,
                      });
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                    onArchive={() => archive.mutate(item.id)}
                    onDelete={() => {
                      if (window.confirm(`确定删除“${item.title}”及其关联提醒吗？此操作无法撤销。`)) remove.mutate(item.id);
                    }}
                  />
                ))}
              </div>
            ) : <EmptyPanel title="还没有合同" body="添加租房、手机、网络、保险、学校或工作合同，到期日会进入 Todo 和日历。" />}
          </section>
        </section>
      </main>
    </GuideShell>
  );
}

function ContractCard({ item, onEdit, onArchive, onDelete }: { item: GuideContract; onEdit: () => void; onArchive: () => void; onDelete: () => void }) {
  const due = item.cancellationWindowStart || item.endDate;
  const cost = item.monthlyCost ? `每月 ¥${item.monthlyCost.toLocaleString()}` : item.yearlyCost ? `每年 ¥${item.yearlyCost.toLocaleString()}` : "";
  return (
    <article className="kx-card p-4">
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-kx-accentSoft text-kx-accent"><FileSignature className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-black text-kx-text">{item.title}</h3>
            {item.autoRenew ? <span className="rounded-full bg-kx-soft px-2 py-0.5 text-[11px] font-bold text-kx-muted">自动续约</span> : null}
          </div>
          {item.provider ? <p className="mt-1 text-xs text-kx-muted">{item.provider}</p> : null}
          <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-bold text-kx-subtle">
            {due ? <span className="inline-flex items-center gap-1 rounded-full bg-kx-soft px-2 py-1"><CalendarClock className="h-3 w-3" /> {due}</span> : null}
            {cost ? <span className="rounded-full bg-kx-soft px-2 py-1">{cost}</span> : null}
          </div>
        </div>
        <div className="flex gap-1">
          <IconButton label="编辑合同" onClick={onEdit}><Pencil className="h-4 w-4" /></IconButton>
          {item.status === "active" ? <IconButton label="归档合同" onClick={onArchive}><Archive className="h-4 w-4" /></IconButton> : null}
          <IconButton label="删除合同" danger onClick={onDelete}><Trash2 className="h-4 w-4" /></IconButton>
        </div>
      </div>
      <div className="mt-4 border-t border-kx-stroke/60 pt-4">
        <GuideAttachmentManager entityType="guide_contract" entityId={item.id} title="合同附件" compact />
      </div>
    </article>
  );
}

function GuestPanel({ title, body, onLogin }: { title: string; body: string; onLogin: () => void }) {
  return <div className="px-4 py-8 sm:px-7"><section className="kx-guide-hero p-6"><FileSignature className="h-8 w-8 text-kx-accent" /><h1 className="mt-3 text-3xl font-black text-kx-text">{title}</h1><p className="mt-2 max-w-xl text-sm leading-7 text-kx-subtle">{body}</p><button type="button" onClick={onLogin} className="kx-button-primary mt-5 min-h-11 px-4">登录后继续</button></section></div>;
}

function IconButton({ label, onClick, danger = false, children }: { label: string; onClick: () => void; danger?: boolean; children: React.ReactNode }) {
  return <button type="button" aria-label={label} onClick={onClick} className={`grid h-11 w-11 place-items-center rounded-xl transition ${danger ? "text-kx-muted hover:bg-rose-500/10 hover:text-rose-500" : "text-kx-muted hover:bg-kx-accentSoft hover:text-kx-accent"}`}>{children}</button>;
}

function TextField({ label, value, onChange, placeholder, inputMode }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; inputMode?: "numeric" }) {
  return <label className="block"><span className="text-sm font-black text-kx-text">{label}</span><input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} inputMode={inputMode} className="mt-2 min-h-11 w-full rounded-2xl border border-kx-stroke/60 bg-kx-card px-3 text-sm font-semibold outline-none focus:border-kx-accent" /></label>;
}

function DateField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="block"><span className="text-sm font-black text-kx-text">{label}</span><input type="date" value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 min-h-11 w-full rounded-2xl border border-kx-stroke/60 bg-kx-card px-3 text-sm font-semibold outline-none focus:border-kx-accent" /></label>;
}

function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: readonly (readonly [string, string])[] }) {
  return <label className="block"><span className="text-sm font-black text-kx-text">{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 min-h-11 w-full rounded-2xl border border-kx-stroke/60 bg-kx-card px-3 text-sm font-semibold outline-none focus:border-kx-accent">{options.map(([key, title]) => <option key={key} value={key}>{title}</option>)}</select></label>;
}

function TextArea({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="block"><span className="text-sm font-black text-kx-text">{label}</span><textarea rows={3} value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 w-full rounded-2xl border border-kx-stroke/60 bg-kx-card px-3 py-2 text-sm font-semibold outline-none focus:border-kx-accent" /></label>;
}
