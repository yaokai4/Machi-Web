"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, CheckCircle2, IdCard, LocateFixed, Save, ShieldCheck } from "lucide-react";
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
  const [locating, setLocating] = useState(false);
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [generatedCount, setGeneratedCount] = useState<number | null>(null);
  useEffect(() => {
    if (q.data?.profile) setForm(q.data.profile);
  }, [q.data?.profile]);
  const save = useMutation({
    mutationFn: () => guide.updateProfile(form),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["guide", "profile"] });
      queryClient.invalidateQueries({ queryKey: ["guide", "active-plan"] });
      const count = res.generatedTodoCount ?? previewItems(form).filter((item) => item.active).length;
      setGeneratedCount(count);
      pushToast({ kind: "success", message: count ? `提醒设置已保存，已同步 ${count} 项 Todo / 日历` : "提醒设置已保存" });
    },
    onError: (err) => pushToast({ kind: "error", message: err instanceof Error ? err.message : "保存失败" }),
  });
  const identity = form.identityType || "";
  const isSchool = /语言学校|大学生|大学院|升学|准备赴日|刚到日本/.test(identity);
  const isCareer = /新卒|转职|社会人/.test(identity);
  const isResident = Boolean(form.isInJapan) || /在日|社会人|大学生|语言学校|家族/.test(identity);
  const locate = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      pushToast({ kind: "error", message: "当前浏览器不支持定位。" });
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        let label = `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&accept-language=zh-CN`);
          const json = await res.json();
          const address = json?.address || {};
          label = address.city || address.town || address.village || address.state || label;
        } catch {
          // Keep the coordinate fallback; city can be edited manually.
        }
        setForm((f) => ({ ...f, city: label, isInJapan: true }));
        setLocating(false);
      },
      () => {
        setLocating(false);
        pushToast({ kind: "error", message: "定位失败，可以手动填写城市。" });
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300_000 },
    );
  };

  if (!user) {
    return (
      <GuideShell back={{ href: "/guide", label: "今日" }}>
        <div className="px-4 py-8 sm:px-7">
          <section className="kx-guide-hero p-6">
            <IdCard className="h-8 w-8 text-kx-accent" />
            <h1 className="mt-3 text-3xl font-black text-kx-text">登录后设置个人提醒</h1>
            <p className="mt-2 text-sm leading-7 text-kx-subtle">只填写你希望被提醒的日期和目标偏好，Machi 会生成 Todo、倒数日、日历和资料建议。</p>
            <button type="button" onClick={() => openAuthPrompt("generic")} className="kx-button-primary mt-5 h-10 px-4">登录后继续</button>
          </section>
        </div>
      </GuideShell>
    );
  }

  return (
    <GuideShell back={{ href: "/guide", label: "今日" }}>
      <div className="space-y-6 px-4 py-7 sm:px-7">
        <header className="kx-guide-hero p-6">
          <p className="text-xs font-black uppercase tracking-[0.12em] text-[rgb(var(--kx-living-warm))]">Reminder Settings</p>
          <h1 className="mt-2 text-3xl font-black text-kx-text">个人提醒设置</h1>
          <p className="mt-2 max-w-2xl text-sm leading-7 text-kx-subtle">不需要上传在留卡、护照或敏感证件。填好在留 / 毕业 / 入社等日期后，Machi 会自动生成<span className="font-bold text-kx-text">倒数日、Todo、日历提醒</span>和上下文资料推荐。</p>
        </header>
        {q.isLoading ? <InlineLoading /> : q.isError ? <ErrorState title="提醒设置加载失败" subtitle="请稍后重试。" onRetry={() => q.refetch()} /> : (
          <section className="kx-card p-5">
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
              <div className="space-y-5">
                <StepTabs step={step} onChange={setStep} />
                {step === 0 ? (
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm font-black text-kx-text">当前状态</label>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {identities.map((id) => (
                          <button key={id} type="button" onClick={() => setForm((f) => ({ ...f, identityType: id }))} className={(form.identityType === id ? "border-kx-accent bg-kx-accentSoft text-kx-accent" : "border-kx-stroke/60 bg-kx-card text-kx-subtle") + " rounded-full border px-3 py-1.5 text-sm font-bold"}>
                            {id}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <Field label="城市" value={form.city || ""} onChange={(v) => setForm((f) => ({ ...f, city: v }))} placeholder="东京 / 大阪 / 福冈" />
                        <button type="button" onClick={locate} disabled={locating} className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-kx-accentSoft px-3 py-1.5 text-xs font-bold text-kx-accent disabled:opacity-60">
                          <LocateFixed className="h-3.5 w-3.5" /> {locating ? "获取中" : "使用当前位置"}
                        </button>
                      </div>
                      <Field label="签证状态" value={form.visaStatus || ""} onChange={(v) => setForm((f) => ({ ...f, visaStatus: v }))} placeholder="留学 / 技人国 / 家族滞在" />
                      {isResident ? <Field label="在留期限" type="date" value={form.visaExpiresAt || ""} onChange={(v) => setForm((f) => ({ ...f, visaExpiresAt: v }))} /> : null}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Toggle label="已经在日本" checked={Boolean(form.isInJapan)} onChange={(v) => setForm((f) => ({ ...f, isInJapan: v }))} />
                    </div>
                    <PermanentResidencyHint profile={form} />
                  </div>
                ) : null}
                {step === 1 ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Select label="当前日语" value={form.japaneseLevel || ""} options={levels} onChange={(v) => setForm((f) => ({ ...f, japaneseLevel: v }))} />
                    <Select label="目标日语" value={form.targetJapaneseLevel || form.targetLevel || ""} options={levels} onChange={(v) => setForm((f) => ({ ...f, targetJapaneseLevel: v }))} />
                    {isSchool ? <Field label="毕业 / 修了预计" type="date" value={form.graduationDate || ""} onChange={(v) => setForm((f) => ({ ...f, graduationDate: v }))} /> : null}
                    {isSchool ? <Field label="目标入学期" value={form.targetEntryTerm || ""} onChange={(v) => setForm((f) => ({ ...f, targetEntryTerm: v }))} placeholder="2027 年 4 月" /> : null}
                    {isSchool ? <Field label="目标学校类型" value={form.targetSchoolType || ""} onChange={(v) => setForm((f) => ({ ...f, targetSchoolType: v }))} placeholder="大学院 / 学部 / 专门 / 语言学校" /> : null}
                    {isCareer ? <Field label="目标入社期" value={form.targetEntryTerm || ""} onChange={(v) => setForm((f) => ({ ...f, targetEntryTerm: v }))} placeholder="2027 年 4 月 / 随时" /> : null}
                    {(isCareer || isSchool) ? <Field label="目标行业 / 研究方向" value={form.targetIndustry || ""} onChange={(v) => setForm((f) => ({ ...f, targetIndustry: v }))} placeholder="IT / 商社 / 设计 / 研究" /> : null}
                    <Field label="每周可投入分钟" type="number" value={String(form.weeklyAvailableMinutes || 360)} onChange={(v) => setForm((f) => ({ ...f, weeklyAvailableMinutes: Number(v) || 0 }))} />
                  </div>
                ) : null}
                {step === 2 ? (
                  <div className="space-y-4">
                    <div className="flex flex-wrap gap-2">
                      <Toggle label="需要资料" checked={Boolean(form.needsMaterials)} onChange={(v) => setForm((f) => ({ ...f, needsMaterials: v }))} />
                      <Toggle label="需要服务/咨询" checked={Boolean(form.needsServices)} onChange={(v) => setForm((f) => ({ ...f, needsServices: v }))} />
                    </div>
                  </div>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  {step > 0 ? <button type="button" onClick={() => setStep((s) => Math.max(0, s - 1) as 0 | 1 | 2)} className="kx-button-secondary h-11 px-5">上一步</button> : null}
                  {step < 2 ? <button type="button" onClick={() => setStep((s) => Math.min(2, s + 1) as 0 | 1 | 2)} className="kx-button-primary h-11 px-5">下一步</button> : null}
                  <button type="button" onClick={() => save.mutate()} disabled={save.isPending} className="kx-button-primary h-11 px-5 disabled:opacity-60">
                    <Save className="h-4 w-4" /> {save.isPending ? "保存中" : "保存提醒设置"}
                  </button>
                </div>
              </div>
              <aside className="space-y-3">
                <GuideProfilePreview profile={form} generatedCount={generatedCount} />
              </aside>
            </div>
          </section>
        )}
      </div>
    </GuideShell>
  );
}

function previewItems(profile: Partial<GuideProfile>) {
  return [
    { title: "在留更新倒排", body: profile.visaExpiresAt ? `到期日 ${profile.visaExpiresAt}` : "填写在留期限后生成续签 Todo 与提醒", active: Boolean(profile.visaExpiresAt) },
    { title: "毕业 / 入社时间线", body: profile.graduationDate ? `关键日期 ${profile.graduationDate}` : "填写毕业或入社时间后生成倒排计划", active: Boolean(profile.graduationDate) },
    { title: "资料 / 服务推荐", body: profile.needsMaterials || profile.needsServices ? "会按目标、日期和 Todo 推荐资料、模板与服务" : "勾选需要资料或服务后会在任务下方出现", active: Boolean(profile.needsMaterials || profile.needsServices) },
  ];
}

function StepTabs({ step, onChange }: { step: 0 | 1 | 2; onChange: (step: 0 | 1 | 2) => void }) {
  const steps = ["状态与位置", "目标与时间", "生成预览"] as const;
  return (
    <div className="grid gap-2 rounded-kx-lg bg-kx-soft p-1 sm:grid-cols-3">
      {steps.map((label, index) => (
        <button
          key={label}
          type="button"
          onClick={() => onChange(index as 0 | 1 | 2)}
          className={(step === index ? "bg-kx-card text-kx-accent shadow-kx-soft" : "text-kx-muted hover:text-kx-text") + " rounded-kx-md px-3 py-2 text-sm font-black"}
        >
          {index + 1}. {label}
        </button>
      ))}
    </div>
  );
}

function GuideProfilePreview({ profile, generatedCount }: { profile: Partial<GuideProfile>; generatedCount: number | null }) {
  const items = previewItems(profile);
  return (
    <div className="rounded-kx-lg border border-kx-stroke/60 bg-kx-card/80 p-4">
      <p className="text-xs font-black uppercase tracking-[0.12em] text-kx-muted">保存后会生成</p>
      <h3 className="mt-1 text-lg font-black text-kx-text">你的 Guide 计划输入源</h3>
      <div className="mt-3 space-y-2">
        {items.map((item) => (
          <div key={item.title} className="flex items-start gap-2 rounded-kx-md bg-kx-soft/70 p-3">
            <CheckCircle2 className={(item.active ? "text-kx-accent" : "text-kx-muted") + " mt-0.5 h-4 w-4 shrink-0"} />
            <div>
              <p className="text-sm font-black text-kx-text">{item.title}</p>
              <p className="mt-0.5 text-xs leading-5 text-kx-muted">{item.body}</p>
            </div>
          </div>
        ))}
      </div>
      {generatedCount !== null ? (
        <p className="mt-3 rounded-full bg-kx-accentSoft px-3 py-2 text-xs font-black text-kx-accent">
          已同步 {generatedCount} 项 Todo / 日历提醒
        </p>
      ) : null}
    </div>
  );
}

function PermanentResidencyHint({ profile }: { profile: Partial<GuideProfile> }) {
  const expiryDays = profile.visaExpiresAt ? daysUntil(profile.visaExpiresAt) : null;
  return (
    <div className="rounded-kx-lg border border-kx-accent/20 bg-kx-accentSoft/35 p-4">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-kx-md bg-kx-card text-kx-accent">
          <ShieldCheck className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h3 className="text-sm font-black text-kx-text">长期在日与永住准备</h3>
          <p className="mt-1 text-xs leading-6 text-kx-muted">
            Guide 会优先帮你保存城市、在留资格、在留期限、毕业/入社时间和日语目标。未来做永住/高度人才/签证更新判断时，通常需要回看居住年数、纳税年金、收入稳定性、在留期限和材料连续性；具体条件以出入国在留管理厅最新公告为准。
          </p>
          {expiryDays !== null ? (
            <p className={(expiryDays <= 120 ? "text-amber-700" : "text-kx-accent") + " mt-2 inline-flex items-center gap-1 rounded-full bg-kx-card px-2.5 py-1 text-xs font-bold"}>
              <CalendarClock className="h-3.5 w-3.5" /> 在留期限倒数 {expiryDays < 0 ? "已过期" : `${expiryDays} 天`}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function daysUntil(value: string) {
  const today = new Date(new Date().toISOString().slice(0, 10)).getTime();
  const target = new Date(value).getTime();
  return Math.ceil((target - today) / 86_400_000);
}

function Field({ label, value, onChange, placeholder, type = "text" }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return (
    <label className="block">
      <span className="text-sm font-black text-kx-text">{label}</span>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="mt-2 h-11 w-full rounded-2xl border border-kx-stroke/60 bg-kx-card px-3 text-sm font-semibold outline-none focus:border-kx-accent" />
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
