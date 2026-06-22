"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { IdCard, Save } from "lucide-react";
import { guide, type GuideProfile } from "@/lib/guide";
import { GuideShell } from "@/components/guide/GuideKit";
import { InlineLoading, ErrorState } from "@/components/design/States";
import { useAuthPrompt, useSession, useToasts } from "@/lib/store";

const identities = ["准备赴日", "刚到日本", "语言学校在读", "大学生 / 大学院生", "准备大学院申请", "新卒就活", "社会人转职", "在日生活中", "日语备考中", "经营者 / 自营业", "家族滞在 / 配偶签"];
const levels = ["", "N5", "N4", "N3", "N2", "N1", "EJU", "商务日语"];

export default function GuideProfilePage() {
  const user = useSession((s) => s.user);
  const openAuthPrompt = useAuthPrompt((s) => s.open);
  const pushToast = useToasts((s) => s.push);
  const queryClient = useQueryClient();
  const q = useQuery({ queryKey: ["guide", "profile", user?.id || "guest"], queryFn: () => guide.profile(), enabled: Boolean(user) });
  const [form, setForm] = useState<Partial<GuideProfile>>({});
  useEffect(() => {
    if (q.data?.profile) setForm(q.data.profile);
  }, [q.data?.profile]);
  const save = useMutation({
    mutationFn: () => guide.updateProfile(form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["guide", "profile"] });
      queryClient.invalidateQueries({ queryKey: ["guide", "active-plan"] });
      pushToast({ kind: "success", message: "身份已保存" });
    },
    onError: (err) => pushToast({ kind: "error", message: err instanceof Error ? err.message : "保存失败" }),
  });

  if (!user) {
    return (
      <GuideShell back={{ href: "/guide", label: "日本指南" }}>
        <div className="px-4 py-8 sm:px-7">
          <section className="kx-guide-hero p-6">
            <IdCard className="h-8 w-8 text-kx-accent" />
            <h1 className="mt-3 text-3xl font-black text-kx-text">登录后设置 Guide 身份</h1>
            <p className="mt-2 text-sm leading-7 text-kx-subtle">身份会决定 Machi 推荐生活、升学、就职、转职、日语和签证计划的方式。</p>
            <button type="button" onClick={() => openAuthPrompt("generic")} className="kx-button-primary mt-5 h-10 px-4">登录后继续</button>
          </section>
        </div>
      </GuideShell>
    );
  }

  return (
    <GuideShell back={{ href: "/guide", label: "日本指南" }}>
      <div className="space-y-6 px-4 py-7 sm:px-7">
        <header className="kx-guide-hero p-6">
          <p className="text-xs font-black uppercase tracking-[0.12em] text-[rgb(var(--kx-living-warm))]">Guide Profile</p>
          <h1 className="mt-2 text-3xl font-black text-kx-text">设置你的日本身份</h1>
          <p className="mt-2 max-w-2xl text-sm leading-7 text-kx-subtle">Machi 会按你的身份生成更合适的 Todo、日历提醒、资料和服务推荐。</p>
        </header>
        {q.isLoading ? <InlineLoading /> : q.isError ? <ErrorState title="身份加载失败" subtitle="请稍后重试。" onRetry={() => q.refetch()} /> : (
          <section className="kx-card space-y-5 p-5">
            <div>
              <label className="text-sm font-black text-kx-text">当前身份</label>
              <div className="mt-2 flex flex-wrap gap-2">
                {identities.map((id) => (
                  <button key={id} type="button" onClick={() => setForm((f) => ({ ...f, identityType: id }))} className={(form.identityType === id ? "border-kx-accent bg-kx-accentSoft text-kx-accent" : "border-kx-stroke/60 bg-kx-card text-kx-subtle") + " rounded-full border px-3 py-1.5 text-sm font-bold"}>
                    {id}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="城市" value={form.city || ""} onChange={(v) => setForm((f) => ({ ...f, city: v }))} placeholder="东京 / 大阪 / 福冈" />
              <Field label="签证状态" value={form.visaStatus || ""} onChange={(v) => setForm((f) => ({ ...f, visaStatus: v }))} placeholder="留学 / 技人国 / 家族滞在" />
              <Select label="当前日语" value={form.japaneseLevel || ""} options={levels} onChange={(v) => setForm((f) => ({ ...f, japaneseLevel: v }))} />
              <Select label="目标日语" value={form.targetJapaneseLevel || form.targetLevel || ""} options={levels} onChange={(v) => setForm((f) => ({ ...f, targetJapaneseLevel: v }))} />
              <Field label="目标入学期" value={form.targetEntryTerm || ""} onChange={(v) => setForm((f) => ({ ...f, targetEntryTerm: v }))} placeholder="2027 年 4 月" />
              <Field label="目标行业" value={form.targetIndustry || ""} onChange={(v) => setForm((f) => ({ ...f, targetIndustry: v }))} placeholder="IT / 商社 / 设计 / 研究" />
            </div>
            <div className="flex flex-wrap gap-2">
              <Toggle label="需要资料" checked={Boolean(form.needsMaterials)} onChange={(v) => setForm((f) => ({ ...f, needsMaterials: v }))} />
              <Toggle label="需要服务/咨询" checked={Boolean(form.needsServices)} onChange={(v) => setForm((f) => ({ ...f, needsServices: v }))} />
              <Toggle label="已经在日本" checked={Boolean(form.isInJapan)} onChange={(v) => setForm((f) => ({ ...f, isInJapan: v }))} />
            </div>
            <button type="button" onClick={() => save.mutate()} disabled={save.isPending} className="kx-button-primary h-11 px-5 disabled:opacity-60">
              <Save className="h-4 w-4" /> 保存身份
            </button>
          </section>
        )}
      </div>
    </GuideShell>
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

function Select({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="text-sm font-black text-kx-text">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="mt-2 h-11 w-full rounded-2xl border border-kx-stroke/60 bg-kx-card px-3 text-sm font-semibold outline-none focus:border-kx-accent">
        {options.map((o) => <option key={o} value={o}>{o || "未设置"}</option>)}
      </select>
    </label>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className={(checked ? "border-kx-accent bg-kx-accentSoft text-kx-accent" : "border-kx-stroke/60 bg-kx-card text-kx-subtle") + " rounded-full border px-3 py-1.5 text-sm font-bold"}>
      {label}
    </button>
  );
}
