"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, IdCard, Pencil, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { guide, type GuideDocumentReminder } from "@/lib/guide";
import { GuideShell } from "@/components/guide/GuideKit";
import { EmptyPanel } from "@/components/guide/GuideOS";
import { GuideAttachmentManager } from "@/components/guide/GuideAttachmentManager";
import { ErrorState, InlineLoading } from "@/components/design/States";
import { useAuthPrompt, useSession, useToasts } from "@/lib/store";

const categories = [
  ["residence_card", "在留卡"],
  ["passport", "护照"],
  ["my_number", "My Number"],
  ["drivers_license", "驾照"],
  ["health_insurance", "健康保险证"],
  ["other", "其他证件"],
] as const;

const emptyForm = { category: "residence_card", title: "在留卡", expiresAt: "", reminderDaysBefore: "60", notes: "" };

export default function GuideDocumentsPage() {
  const user = useSession((s) => s.user);
  const openAuthPrompt = useAuthPrompt((s) => s.open);
  const pushToast = useToasts((s) => s.push);
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const documents = useQuery({
    queryKey: ["guide", "documents", user?.id || "guest"],
    queryFn: () => guide.documents(),
    enabled: Boolean(user),
  });
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["guide", "documents"] });
    queryClient.invalidateQueries({ queryKey: ["guide", "todos"] });
    queryClient.invalidateQueries({ queryKey: ["guide", "calendar"] });
    queryClient.invalidateQueries({ queryKey: ["guide", "active-plan"] });
  };
  const save = useMutation({
    mutationFn: () => {
      const payload: Partial<GuideDocumentReminder> = { ...form, reminderDaysBefore: Number(form.reminderDaysBefore || 60) };
      return editingId ? guide.updateDocument(editingId, payload) : guide.createDocument(payload);
    },
    onSuccess: () => {
      invalidate();
      setEditingId(null);
      setForm(emptyForm);
      pushToast({ kind: "success", message: "证件到期提醒已保存" });
    },
    onError: (error) => pushToast({ kind: "error", message: error instanceof Error ? error.message : "保存失败" }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => guide.deleteDocument(id),
    onSuccess: () => { invalidate(); pushToast({ kind: "success", message: "证件提醒已删除" }); },
  });

  if (!user) {
    return (
      <GuideShell back={{ href: "/guide/manage", label: "管理" }}>
        <div className="px-4 py-8 sm:px-7">
          <section className="kx-guide-hero p-6">
            <IdCard className="h-8 w-8 text-kx-accent" />
            <h1 className="mt-3 text-3xl font-black text-kx-text">证件到期提醒</h1>
            <p className="mt-2 max-w-xl text-sm leading-7 text-kx-subtle">只填写证件名称和到期日期即可，不需要上传在留卡、护照或证件号码。</p>
            <button type="button" onClick={() => openAuthPrompt("generic")} className="kx-button-primary mt-5 min-h-11 px-4">登录后继续</button>
          </section>
        </div>
      </GuideShell>
    );
  }

  return (
    <GuideShell back={{ href: "/guide/manage", label: "管理" }}>
      <main className="space-y-7 px-4 py-7 sm:px-7">
        <header>
          <p className="text-xs font-black uppercase tracking-[0.12em] text-[rgb(var(--kx-living-warm))]">Expiry reminders</p>
          <h1 className="mt-2 text-3xl font-black text-kx-text">证件到期</h1>
          <p className="mt-2 max-w-2xl text-sm leading-7 text-kx-subtle">只保存到期日期。Machi 不要求上传证件图片，也不需要证件号码。</p>
        </header>
        <section className="rounded-2xl border border-kx-accent/20 bg-kx-accentSoft/45 p-4">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-kx-accent" />
            <p className="text-sm font-semibold leading-6 text-kx-subtle">隐私优先：日期字段完全可选；不填写任何身份信息也能使用 Todo、日历、缴费、合同与申请管理。</p>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
          <form className="kx-card space-y-4 p-5" onSubmit={(event) => { event.preventDefault(); save.mutate(); }}>
            <h2 className="text-lg font-black text-kx-text">{editingId ? "编辑提醒" : "添加证件提醒"}</h2>
            <label className="block">
              <span className="text-sm font-black text-kx-text">证件类型</span>
              <select value={form.category} onChange={(event) => {
                const title = categories.find(([key]) => key === event.target.value)?.[1] || "证件";
                setForm((f) => ({ ...f, category: event.target.value, title }));
              }} className="mt-2 min-h-11 w-full rounded-2xl border border-kx-stroke/60 bg-kx-card px-3 text-sm font-semibold outline-none focus:border-kx-accent">
                {categories.map(([key, title]) => <option key={key} value={key}>{title}</option>)}
              </select>
            </label>
            <TextField label="显示名称" value={form.title} onChange={(value) => setForm((f) => ({ ...f, title: value }))} />
            <label className="block"><span className="text-sm font-black text-kx-text">到期日期</span><input type="date" value={form.expiresAt} onChange={(event) => setForm((f) => ({ ...f, expiresAt: event.target.value }))} className="mt-2 min-h-11 w-full rounded-2xl border border-kx-stroke/60 bg-kx-card px-3 text-sm font-semibold outline-none focus:border-kx-accent" /></label>
            <TextField label="提前提醒天数" value={form.reminderDaysBefore} onChange={(value) => setForm((f) => ({ ...f, reminderDaysBefore: value }))} inputMode="numeric" />
            <label className="block"><span className="text-sm font-black text-kx-text">备注</span><textarea rows={3} value={form.notes} onChange={(event) => setForm((f) => ({ ...f, notes: event.target.value }))} className="mt-2 w-full rounded-2xl border border-kx-stroke/60 bg-kx-card px-3 py-2 text-sm font-semibold outline-none focus:border-kx-accent" /></label>
            <div className="flex gap-2">
              <button type="submit" disabled={!form.title.trim() || !form.expiresAt || save.isPending} className="kx-button-primary min-h-11 flex-1 disabled:opacity-50"><Plus className="h-4 w-4" /> 保存提醒</button>
              {editingId ? <button type="button" onClick={() => { setEditingId(null); setForm(emptyForm); }} className="kx-button-secondary min-h-11 px-4">取消</button> : null}
            </div>
          </form>

          <section>
            <h2 className="mb-3 text-xl font-black text-kx-text">我的证件提醒</h2>
            {documents.isLoading ? <InlineLoading /> : documents.isError ? (
              <ErrorState title="提醒加载失败" subtitle="请检查网络后重试。" onRetry={() => documents.refetch()} />
            ) : documents.data?.items.length ? (
              <div className="space-y-3">
                {documents.data.items.map((item) => (
                  <article key={item.id} className="kx-card flex items-start gap-3 p-4">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-kx-accentSoft text-kx-accent"><IdCard className="h-5 w-5" /></span>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-black text-kx-text">{item.title}</h3>
                      <p className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-kx-muted"><CalendarClock className="h-3.5 w-3.5" /> {item.expiresAt || "未设置日期"} · 提前 {item.reminderDaysBefore} 天</p>
                      {item.notes ? <p className="mt-2 text-sm leading-6 text-kx-subtle">{item.notes}</p> : null}
                      <div className="mt-3">
                        <GuideAttachmentManager entityType="guide_document" entityId={item.id} title="可选附件" compact />
                      </div>
                    </div>
                    <button type="button" aria-label="编辑证件提醒" onClick={() => {
                      setEditingId(item.id);
                      setForm({ category: item.category, title: item.title, expiresAt: item.expiresAt || "", reminderDaysBefore: String(item.reminderDaysBefore || 60), notes: item.notes });
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }} className="grid h-11 w-11 place-items-center rounded-xl text-kx-muted hover:bg-kx-accentSoft hover:text-kx-accent"><Pencil className="h-4 w-4" /></button>
                    <button type="button" aria-label="删除证件提醒" onClick={() => {
                      if (window.confirm(`确定删除“${item.title}”的到期提醒吗？此操作无法撤销。`)) remove.mutate(item.id);
                    }} className="grid h-11 w-11 place-items-center rounded-xl text-kx-muted hover:bg-rose-500/10 hover:text-rose-500"><Trash2 className="h-4 w-4" /></button>
                  </article>
                ))}
              </div>
            ) : <EmptyPanel title="还没有证件提醒" body="添加到期日期后，会自动生成高优先级 Todo 并显示在日历和今日页。" />}
          </section>
        </section>
      </main>
    </GuideShell>
  );
}

function TextField({ label, value, onChange, inputMode }: { label: string; value: string; onChange: (value: string) => void; inputMode?: "numeric" }) {
  return <label className="block"><span className="text-sm font-black text-kx-text">{label}</span><input value={value} onChange={(event) => onChange(event.target.value)} inputMode={inputMode} className="mt-2 min-h-11 w-full rounded-2xl border border-kx-stroke/60 bg-kx-card px-3 text-sm font-semibold outline-none focus:border-kx-accent" /></label>;
}
