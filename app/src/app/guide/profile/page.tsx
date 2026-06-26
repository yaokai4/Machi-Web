"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, IdCard, LocateFixed, Save, ShieldCheck } from "lucide-react";
import { guide, type GuideProfile } from "@/lib/guide";
import { GuideShell } from "@/components/guide/GuideKit";
import { InlineLoading, ErrorState } from "@/components/design/States";
import { useAuthPrompt, useSession, useToasts } from "@/lib/store";

const identities = ["准备赴日", "刚到日本", "语言学校在读", "大学生 / 大学院生", "准备大学院申请", "新卒就活", "社会人转职", "在日生活中", "日语备考中", "经营者 / 自营业", "家族滞在 / 配偶签"];

export default function GuideProfilePage() {
  const user = useSession((s) => s.user);
  const openAuthPrompt = useAuthPrompt((s) => s.open);
  const pushToast = useToasts((s) => s.push);
  const queryClient = useQueryClient();
  const q = useQuery({ queryKey: ["guide", "profile", user?.id || "guest"], queryFn: () => guide.profile(), enabled: Boolean(user) });
  const [form, setForm] = useState<Partial<GuideProfile>>({});
  const [locating, setLocating] = useState(false);
  const [generatedCount, setGeneratedCount] = useState<number | null>(null);
  useEffect(() => {
    if (q.data?.profile) setForm(q.data.profile);
  }, [q.data?.profile]);
  const save = useMutation({
    mutationFn: () => guide.updateProfile(form),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["guide", "profile"] });
      queryClient.invalidateQueries({ queryKey: ["guide", "active-plan"] });
      const fallback = (form.visaExpiresAt ? 1 : 0) + (form.graduationDate ? 1 : 0);
      const count = res.generatedTodoCount ?? fallback;
      setGeneratedCount(count);
      pushToast({ kind: "success", message: count ? `提醒设置已保存，已同步 ${count} 项 Todo / 日历` : "提醒设置已保存" });
    },
    onError: (err) => pushToast({ kind: "error", message: err instanceof Error ? err.message : "保存失败" }),
  });
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
          <div className="space-y-4">
            {/* Concrete reminder cards — each states its payoff up front, so there
                is no abstract identity wizard to puzzle over. */}
            <ReminderDateCard
              icon={<IdCard className="h-5 w-5" />}
              tone="bg-cyan-500/10 text-cyan-700"
              title="在留卡 / 签证到期"
              payoff="填了之后：在到期前自动生成续签倒排 Todo 和日历提醒。"
              value={form.visaExpiresAt || ""}
              onChange={(v) => setForm((f) => ({ ...f, visaExpiresAt: v }))}
            />
            <ReminderDateCard
              icon={<CalendarClock className="h-5 w-5" />}
              tone="bg-kx-accentSoft text-kx-accent"
              title="毕业 / 入社日"
              payoff="填了之后：自动生成升学或就活的时间线提醒。"
              value={form.graduationDate || ""}
              onChange={(v) => setForm((f) => ({ ...f, graduationDate: v }))}
            />

            <PermanentResidencyHint profile={form} />

            <section className="kx-card space-y-3 p-5">
              <div>
                <h3 className="text-base font-black text-kx-text">你的身份（可选）</h3>
                <p className="mt-1 text-xs leading-5 text-kx-muted">仅用于把最相关的指南排在前面，可以不选。</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {identities.map((id) => (
                  <button key={id} type="button" onClick={() => setForm((f) => ({ ...f, identityType: f.identityType === id ? "" : id }))} className={(form.identityType === id ? "border-kx-accent bg-kx-accentSoft text-kx-accent" : "border-kx-stroke/60 bg-kx-card text-kx-subtle") + " rounded-full border px-3 py-1.5 text-sm font-bold"}>
                    {id}
                  </button>
                ))}
              </div>
            </section>

            <section className="kx-card space-y-3 p-5">
              <h3 className="text-base font-black text-kx-text">城市（可选）</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Field label="城市" value={form.city || ""} onChange={(v) => setForm((f) => ({ ...f, city: v }))} placeholder="东京 / 大阪 / 福冈" />
                  <button type="button" onClick={locate} disabled={locating} className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-kx-accentSoft px-3 py-1.5 text-xs font-bold text-kx-accent disabled:opacity-60">
                    <LocateFixed className="h-3.5 w-3.5" /> {locating ? "获取中" : "使用当前位置"}
                  </button>
                </div>
                <div className="flex items-end">
                  <Toggle label="目前在日本" checked={Boolean(form.isInJapan)} onChange={(v) => setForm((f) => ({ ...f, isInJapan: v }))} />
                </div>
              </div>
            </section>

            <div className="flex flex-wrap items-center gap-3">
              <button type="button" onClick={() => save.mutate()} disabled={save.isPending} className="kx-button-primary h-11 px-5 disabled:opacity-60">
                <Save className="h-4 w-4" /> {save.isPending ? "保存中" : "保存提醒设置"}
              </button>
              {generatedCount !== null ? (
                <span className="rounded-full bg-kx-accentSoft px-3 py-1.5 text-xs font-black text-kx-accent">已同步 {generatedCount} 项 Todo / 日历提醒</span>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </GuideShell>
  );
}

// A single optional reminder: an explained card with a date input. The payoff
// line tells the user exactly what filling it in does.
function ReminderDateCard({ icon, tone, title, payoff, value, onChange }: { icon: ReactNode; tone: string; title: string; payoff: string; value: string; onChange: (v: string) => void }) {
  return (
    <section className="kx-card p-5">
      <div className="flex items-start gap-3">
        <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${tone}`}>{icon}</span>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-black text-kx-text">{title}</h3>
          <p className="mt-0.5 text-xs leading-5 text-kx-muted">{payoff}</p>
          <input
            type="date"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="mt-3 h-11 w-full rounded-2xl border border-kx-stroke/60 bg-kx-card px-3 text-sm font-semibold outline-none focus:border-kx-accent sm:max-w-xs"
          />
        </div>
      </div>
    </section>
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

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className={(checked ? "border-kx-accent bg-kx-accentSoft text-kx-accent" : "border-kx-stroke/60 bg-kx-card text-kx-subtle") + " rounded-full border px-3 py-1.5 text-sm font-bold"}>
      {label}
    </button>
  );
}
