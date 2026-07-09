"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BriefcaseBusiness,
  CalendarClock,
  Columns3,
  GraduationCap,
  List,
  History,
  Plus,
  Search,
  Star,
  Trash2,
} from "lucide-react";
import { guide, type GuideApplication, type GuideCompany, type GuideSchool } from "@/lib/guide";
import { GuideShell } from "@/components/guide/GuideKit";
import { EmptyPanel } from "@/components/guide/GuideOS";
import { ErrorState, InlineLoading } from "@/components/design/States";
import { useAuthPrompt, useSession, useToasts } from "@/lib/store";
import { useI18n } from "@/lib/i18n";

type AppView = "board" | "list" | "timeline";

const STAGES = [
  ["saved", "收藏"],
  ["preparing", "准备资料"],
  ["submitted", "已投递"],
  ["es", "ES"],
  ["web_test", "Web Test"],
  ["interview_1", "一面"],
  ["interview_2", "二面"],
  ["final", "最终面"],
  ["offer", "Offer"],
  ["rejected", "拒绝"],
  ["withdrawn", "放弃"],
] as const;

const TYPES = [
  ["school", "", "学校 / 大学 / 大学院"],
  ["vocational", "", "专门学校"],
  ["language_school", "", "语言学校"],
  ["company", "shinsotsu", "新卒就职"],
  ["company", "tenshoku", "社会人转职"],
  ["internship", "", "实习"],
  ["scholarship", "", "奖学金"],
  ["visa", "", "签证申请"],
  ["jlpt", "", "JLPT / 考试"],
  ["other", "", "其他申请"],
] as const;

const emptyForm = {
  type: "company",
  careerTrack: "shinsotsu",
  name: "",
  department: "",
  position: "",
  deadline: "",
  interviewAt: "",
  resultAt: "",
  stage: "saved",
  priority: "normal",
  favorite: false,
  websiteUrl: "",
  interviewLocation: "",
  meetingUrl: "",
  contactName: "",
  contactEmail: "",
  tags: "",
  notes: "",
};

export default function GuideApplicationsPage() {
  const user = useSession((s) => s.user);
  const openAuthPrompt = useAuthPrompt((s) => s.open);
  const pushToast = useToasts((s) => s.push);
  const queryClient = useQueryClient();
  const [view, setView] = useState<AppView>("board");
  const [stageFilter, setStageFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const applications = useQuery({
    queryKey: ["guide", "applications", user?.id || "guest", stageFilter, typeFilter, priorityFilter, search],
    queryFn: () => guide.applications({
      stage: stageFilter || undefined,
      type: typeFilter || undefined,
      priority: priorityFilter || undefined,
      q: search.trim() || undefined,
    }),
    enabled: Boolean(user),
  });
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["guide", "applications"] });
    queryClient.invalidateQueries({ queryKey: ["guide", "todos"] });
    queryClient.invalidateQueries({ queryKey: ["guide", "calendar"] });
    queryClient.invalidateQueries({ queryKey: ["guide", "active-plan"] });
  };
  const create = useMutation({
    mutationFn: () => guide.createApplication({
      ...form,
      tags: form.tags.split(/[,，]/).map((item) => item.trim()).filter(Boolean),
    }),
    onSuccess: () => {
      invalidate();
      setForm(emptyForm);
      setShowCreate(false);
      pushToast({ kind: "success", message: "申请已添加，相关截止日已同步到 Todo 和日历" });
    },
    onError: (error) => pushToast({ kind: "error", message: error instanceof Error ? error.message : "添加失败" }),
  });
  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<GuideApplication> & { stageNote?: string } }) => guide.updateApplication(id, patch),
    onSuccess: () => { invalidate(); pushToast({ kind: "success", message: "申请已更新" }); },
    onError: (error) => pushToast({ kind: "error", message: error instanceof Error ? error.message : "更新失败" }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => guide.deleteApplication(id),
    onSuccess: () => { invalidate(); pushToast({ kind: "success", message: "申请及关联 Todo 已删除" }); },
  });

  if (!user) {
    return (
      <GuideShell back={{ href: "/guide/manage", label: "管理" }}>
        <div className="px-4 py-8 sm:px-7">
          <section className="kx-guide-hero p-6">
            <BriefcaseBusiness className="h-8 w-8 text-kx-accent" />
            <h1 className="mt-3 text-3xl font-black text-kx-text">申请管理</h1>
            <p className="mt-2 max-w-xl text-sm leading-7 text-kx-subtle">用看板管理大学、大学院、新卒、转职、实习、奖学金、签证与考试申请。</p>
            <button type="button" onClick={() => openAuthPrompt("generic")} className="kx-button-primary mt-5 min-h-11 px-4">登录后继续</button>
          </section>
        </div>
      </GuideShell>
    );
  }

  const items = applications.data?.items || [];
  return (
    <GuideShell back={{ href: "/guide/manage", label: "管理" }}>
      <main className="space-y-6 px-4 py-7 sm:px-7">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.12em] text-[rgb(var(--kx-living-warm))]">Applications</p>
            <h1 className="mt-2 text-3xl font-black text-kx-text">申请管理</h1>
            <p className="mt-2 max-w-2xl text-sm leading-7 text-kx-subtle">几十家公司或学校也能按阶段、截止日和优先级清晰推进。</p>
          </div>
          <button type="button" onClick={() => setShowCreate((value) => !value)} className="kx-button-primary min-h-11 px-5">
            <Plus className="h-4 w-4" /> 新建申请
          </button>
        </header>

        {showCreate ? <ApplicationCreateForm form={form} setForm={setForm} onSubmit={() => create.mutate()} saving={create.isPending} /> : null}

        <section className="space-y-3">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="inline-flex w-fit rounded-2xl border border-kx-stroke/60 bg-kx-card p-1">
              <ViewButton active={view === "board"} onClick={() => setView("board")} icon={<Columns3 className="h-4 w-4" />} label="看板" />
              <ViewButton active={view === "list"} onClick={() => setView("list")} icon={<List className="h-4 w-4" />} label="列表" />
              <ViewButton active={view === "timeline"} onClick={() => setView("timeline")} icon={<History className="h-4 w-4" />} label="时间线" />
            </div>
            <div className="flex flex-wrap gap-2">
              <FilterSelect label="全部阶段" value={stageFilter} onChange={setStageFilter} options={STAGES} />
              <FilterSelect label="全部类型" value={typeFilter} onChange={setTypeFilter} options={[
                ["school", "学校"],
                ["company", "公司"],
                ["internship", "实习"],
                ["scholarship", "奖学金"],
                ["visa", "签证"],
                ["jlpt", "考试"],
              ]} />
              <FilterSelect label="全部优先级" value={priorityFilter} onChange={setPriorityFilter} options={[["high", "高"], ["normal", "普通"], ["low", "低"]]} />
              <label className="flex min-h-11 min-w-0 items-center gap-2 rounded-2xl border border-kx-stroke/60 bg-kx-card px-3">
                <Search className="h-4 w-4 text-kx-muted" />
                <span className="sr-only">搜索申请</span>
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="公司、学校、岗位、标签" className="w-52 bg-transparent text-sm font-semibold outline-none placeholder:text-kx-muted" />
              </label>
            </div>
          </div>

          {applications.isLoading ? <InlineLoading /> : applications.isError ? (
            <ErrorState title="申请加载失败" subtitle="请检查网络后重试。" onRetry={() => applications.refetch()} />
          ) : !items.length ? (
            <EmptyPanel title="还没有申请" body="点击“新建申请”，截止日、面试和结果日期会自动进入 Todo 与日历。" />
          ) : view === "board" ? (
            <ApplicationBoard items={items} onStage={(id, stage) => update.mutate({ id, patch: { stage, stageNote: "从申请看板更新" } })} onDelete={(item) => confirmDelete(item, remove.mutate)} />
          ) : view === "timeline" ? (
            <ApplicationTimeline items={items} />
          ) : (
            <ApplicationList items={items} onStage={(id, stage) => update.mutate({ id, patch: { stage, stageNote: "从申请列表更新" } })} onFavorite={(item) => update.mutate({ id: item.id, patch: { favorite: !item.favorite } })} onDelete={(item) => confirmDelete(item, remove.mutate)} />
          )}
        </section>
      </main>
    </GuideShell>
  );
}

function ApplicationCreateForm({ form, setForm, onSubmit, saving }: { form: typeof emptyForm; setForm: React.Dispatch<React.SetStateAction<typeof emptyForm>>; onSubmit: () => void; saving: boolean }) {
  const isSchool = ["school", "vocational", "language_school"].includes(form.type);
  const isExam = form.type === "jlpt";
  return (
    <form className="rounded-3xl border border-kx-stroke/50 bg-kx-card/80 p-5 shadow-sm" onSubmit={(event) => { event.preventDefault(); onSubmit(); }}>
      <div className="grid gap-4 lg:grid-cols-3">
        <label className="block">
          <FieldLabel>申请类型</FieldLabel>
          <select value={`${form.type}:${form.careerTrack}`} onChange={(event) => {
            const [type, careerTrack = ""] = event.target.value.split(":");
            setForm((f) => ({ ...f, type, careerTrack }));
          }} className="mt-2 min-h-11 w-full rounded-2xl border border-kx-stroke/60 bg-kx-card px-3 text-sm font-semibold outline-none focus:border-kx-accent">
            {TYPES.map(([type, track, label]) => <option key={`${type}:${track}`} value={`${type}:${track}`}>{label}</option>)}
          </select>
        </label>
        <div className="lg:col-span-2"><LibraryPickerField type={isSchool ? "school" : "company"} value={form.name} onChange={(value) => setForm((f) => ({ ...f, name: value }))} disabled={isExam || ["visa", "scholarship", "other"].includes(form.type)} /></div>
        <TextField label={isSchool ? "学部 / 研究科 / 专攻" : "职位 / 项目"} value={isSchool ? form.department : form.position} onChange={(value) => setForm((f) => ({ ...f, [isSchool ? "department" : "position"]: value }))} />
        <TextField label="截止日期" type="date" value={form.deadline} onChange={(value) => setForm((f) => ({ ...f, deadline: value }))} />
        <TextField label="面试时间" type="datetime-local" value={form.interviewAt} onChange={(value) => setForm((f) => ({ ...f, interviewAt: value }))} />
        <TextField label="结果 / Offer 日期" type="date" value={form.resultAt} onChange={(value) => setForm((f) => ({ ...f, resultAt: value }))} />
        <TextField label="官网链接" value={form.websiteUrl} onChange={(value) => setForm((f) => ({ ...f, websiteUrl: value }))} />
        <TextField label="面试地点" value={form.interviewLocation} onChange={(value) => setForm((f) => ({ ...f, interviewLocation: value }))} />
        <TextField label="Zoom / Meet 链接" value={form.meetingUrl} onChange={(value) => setForm((f) => ({ ...f, meetingUrl: value }))} />
        <TextField label="联系人" value={form.contactName} onChange={(value) => setForm((f) => ({ ...f, contactName: value }))} />
        <TextField label="联系邮箱" value={form.contactEmail} onChange={(value) => setForm((f) => ({ ...f, contactEmail: value }))} />
        <TextField label="标签（逗号分隔）" value={form.tags} onChange={(value) => setForm((f) => ({ ...f, tags: value }))} />
        <label className="block"><FieldLabel>当前阶段</FieldLabel><select value={form.stage} onChange={(event) => setForm((f) => ({ ...f, stage: event.target.value }))} className="mt-2 min-h-11 w-full rounded-2xl border border-kx-stroke/60 bg-kx-card px-3 text-sm font-semibold">{STAGES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label className="block"><FieldLabel>优先级</FieldLabel><select value={form.priority} onChange={(event) => setForm((f) => ({ ...f, priority: event.target.value }))} className="mt-2 min-h-11 w-full rounded-2xl border border-kx-stroke/60 bg-kx-card px-3 text-sm font-semibold"><option value="high">高</option><option value="normal">普通</option><option value="low">低</option></select></label>
        <label className="flex min-h-11 items-center justify-between self-end rounded-2xl border border-kx-stroke/60 bg-kx-card px-3"><span className="text-sm font-black text-kx-text">收藏 / 重点关注</span><input type="checkbox" checked={form.favorite} onChange={(event) => setForm((f) => ({ ...f, favorite: event.target.checked }))} className="h-5 w-5 accent-kx-accent" /></label>
        <label className="block lg:col-span-3"><FieldLabel>备注</FieldLabel><textarea rows={3} value={form.notes} onChange={(event) => setForm((f) => ({ ...f, notes: event.target.value }))} className="mt-2 w-full rounded-2xl border border-kx-stroke/60 bg-kx-card px-3 py-2 text-sm font-semibold outline-none focus:border-kx-accent" /></label>
      </div>
      <div className="mt-4 flex justify-end">
        <button type="submit" disabled={!form.name.trim() || saving} className="kx-button-primary min-h-11 px-5 disabled:opacity-50"><Plus className="h-4 w-4" /> {saving ? "保存中" : "保存并生成计划"}</button>
      </div>
    </form>
  );
}

function ApplicationBoard({ items, onStage, onDelete }: { items: GuideApplication[]; onStage: (id: string, stage: string) => void; onDelete: (item: GuideApplication) => void }) {
  const visibleStages = STAGES.filter(([key]) => items.some((item) => item.stage === key) || ["saved", "preparing", "submitted", "interview_1", "offer"].includes(key));
  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex min-w-max gap-3">
        {visibleStages.map(([stage, label]) => {
          const stageItems = items.filter((item) => item.stage === stage);
          return (
            <section key={stage} className="w-[285px] shrink-0 rounded-2xl bg-kx-soft/55 p-3">
              <div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-black text-kx-text">{label}</h2><span className="rounded-full bg-kx-card px-2 py-0.5 text-xs font-bold text-kx-muted">{stageItems.length}</span></div>
              <div className="space-y-2">
                {stageItems.map((item) => <ApplicationCard key={item.id} item={item} compact onStage={onStage} onDelete={onDelete} />)}
                {!stageItems.length ? <p className="rounded-xl border border-dashed border-kx-stroke/60 px-3 py-5 text-center text-xs text-kx-muted">暂无申请</p> : null}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function ApplicationList({ items, onStage, onFavorite, onDelete }: { items: GuideApplication[]; onStage: (id: string, stage: string) => void; onFavorite: (item: GuideApplication) => void; onDelete: (item: GuideApplication) => void }) {
  return <div className="space-y-3">{items.map((item) => <ApplicationCard key={item.id} item={item} onStage={onStage} onFavorite={onFavorite} onDelete={onDelete} />)}</div>;
}

function ApplicationTimeline({ items }: { items: GuideApplication[] }) {
  const entries = useMemo(() => items.flatMap((item) => [
    item.deadline ? { date: item.deadline, label: "截止", item } : null,
    item.interviewAt ? { date: item.interviewAt, label: "面试", item } : null,
    item.resultAt ? { date: item.resultAt, label: "结果", item } : null,
  ].filter(Boolean) as { date: string; label: string; item: GuideApplication }[]).sort((a, b) => a.date.localeCompare(b.date)), [items]);
  return entries.length ? <div className="space-y-3">{entries.map((entry, index) => (
    <Link key={`${entry.item.id}-${entry.label}-${index}`} href={`/guide/applications/${entry.item.id}`} className="kx-card flex min-h-16 items-center gap-3 p-4 transition hover:border-kx-accent/35">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-kx-accentSoft text-kx-accent"><CalendarClock className="h-5 w-5" /></span>
      <span className="min-w-0 flex-1"><span className="block text-xs font-bold text-kx-muted">{entry.date} · {entry.label}</span><span className="mt-0.5 block truncate text-sm font-black text-kx-text">{entry.item.name}</span></span>
      <span className="rounded-full bg-kx-soft px-2 py-1 text-[11px] font-bold text-kx-muted">{stageLabel(entry.item.stage)}</span>
    </Link>
  ))}</div> : <EmptyPanel title="还没有时间线事项" body="为申请填写截止、面试或结果日期后会出现在这里。" />;
}

function ApplicationCard({ item, compact = false, onStage, onFavorite, onDelete }: { item: GuideApplication; compact?: boolean; onStage: (id: string, stage: string) => void; onFavorite?: (item: GuideApplication) => void; onDelete: (item: GuideApplication) => void }) {
  const { t } = useI18n();
  return (
    <article className="kx-card p-4">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-kx-accentSoft text-kx-accent">{item.type === "school" ? <GraduationCap className="h-5 w-5" /> : <BriefcaseBusiness className="h-5 w-5" />}</span>
        <div className="min-w-0 flex-1">
          <Link href={`/guide/applications/${item.id}`} className="block text-sm font-black text-kx-text hover:text-kx-accent">{item.name}</Link>
          <p className="mt-0.5 truncate text-xs text-kx-muted">{item.department || item.position || typeLabel(item)}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {item.deadline ? <Badge>{item.deadline.slice(0, 10)} 截止</Badge> : null}
            {item.interviewAt ? <Badge>{item.interviewAt.slice(0, 16).replace("T", " ")} 面试</Badge> : null}
            {item.priority === "high" ? <Badge warn>高优先级</Badge> : null}
          </div>
          <select value={item.stage} onChange={(event) => onStage(item.id, event.target.value)} aria-label={t("aria_update_stage").replace("{name}", item.name)} className="mt-3 min-h-11 w-full rounded-xl border border-kx-stroke/60 bg-kx-card px-2 text-xs font-bold text-kx-subtle">{STAGES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
          {!compact && item.stages.length ? <p className="mt-2 text-[11px] text-kx-muted">阶段记录 {item.stages.length} 条 · 最近更新 {item.updatedAt?.slice(0, 10)}</p> : null}
        </div>
        <div className="flex flex-col">
          {onFavorite ? <button type="button" aria-label={item.favorite ? t("aria_unbookmark") : t("action_bookmark")} onClick={() => onFavorite(item)} className={`grid h-11 w-11 place-items-center rounded-xl ${item.favorite ? "text-amber-500" : "text-kx-muted hover:text-amber-500"}`}><Star className="h-4 w-4" fill={item.favorite ? "currentColor" : "none"} /></button> : null}
          <button type="button" aria-label={t("aria_delete_application")} onClick={() => onDelete(item)} className="grid h-11 w-11 place-items-center rounded-xl text-kx-muted hover:bg-rose-500/10 hover:text-rose-500"><Trash2 className="h-4 w-4" /></button>
        </div>
      </div>
    </article>
  );
}

function LibraryPickerField({ type, value, onChange, disabled }: { type: "school" | "company"; value: string; onChange: (value: string) => void; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const scope = type === "school" ? "schools" : "companies";
  const q = useQuery({ queryKey: ["guide", "app-library", scope, value.trim()], queryFn: () => guide.search(value.trim(), "jp", "zh-CN", scope), enabled: !disabled && open && value.trim().length >= 2 });
  const results = (type === "school" ? q.data?.groups.schools : q.data?.groups.companies) || [];
  return (
    <label className="relative block">
      <FieldLabel>{disabled ? "申请名称" : type === "school" ? "学校 / 研究科名称" : "公司名称"}</FieldLabel>
      <input value={value} onChange={(event) => { onChange(event.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} placeholder="直接输入，或从资料库选择" className="mt-2 min-h-11 w-full rounded-2xl border border-kx-stroke/60 bg-kx-card px-3 text-sm font-semibold outline-none focus:border-kx-accent" />
      {open && results.length ? <div className="absolute z-30 mt-1 max-h-60 w-full overflow-auto rounded-2xl border border-kx-stroke/60 bg-kx-card shadow-lg">{results.slice(0, 6).map((result) => {
        const name = type === "school" ? (result as GuideSchool).schoolName : (result as GuideCompany).companyName;
        return <button key={result.id} type="button" onMouseDown={(event) => { event.preventDefault(); onChange(name); setOpen(false); }} className="block min-h-11 w-full px-3 py-2 text-left text-sm font-semibold hover:bg-kx-accentSoft">{name}</button>;
      })}</div> : null}
    </label>
  );
}

function TextField({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return <label className="block"><FieldLabel>{label}</FieldLabel><input type={type} value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 min-h-11 w-full rounded-2xl border border-kx-stroke/60 bg-kx-card px-3 text-sm font-semibold outline-none focus:border-kx-accent" /></label>;
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="text-sm font-black text-kx-text">{children}</span>;
}

function ViewButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return <button type="button" onClick={onClick} className={`inline-flex min-h-11 items-center gap-1.5 rounded-xl px-4 text-sm font-black ${active ? "bg-kx-accent text-white" : "text-kx-muted hover:bg-kx-soft"}`}>{icon}{label}</button>;
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: readonly (readonly [string, string])[] }) {
  return <select value={value} aria-label={label} onChange={(event) => onChange(event.target.value)} className="min-h-11 rounded-2xl border border-kx-stroke/60 bg-kx-card px-3 text-sm font-bold text-kx-subtle"><option value="">{label}</option>{options.map(([key, title]) => <option key={key} value={key}>{title}</option>)}</select>;
}

function Badge({ children, warn = false }: { children: React.ReactNode; warn?: boolean }) {
  return <span className={`rounded-full px-2 py-1 text-[11px] font-bold ${warn ? "bg-amber-400/15 text-amber-700 dark:text-amber-300" : "bg-kx-soft text-kx-muted"}`}>{children}</span>;
}

function stageLabel(stage: string) {
  return STAGES.find(([key]) => key === stage)?.[1] || stage;
}

function typeLabel(item: GuideApplication) {
  return TYPES.find(([type, track]) => type === item.type && (!track || track === item.careerTrack))?.[2] || "申请";
}

function confirmDelete(item: GuideApplication, remove: (id: string) => void) {
  if (window.confirm(`确定删除“${item.name}”以及关联的 Todo、日历提醒和阶段记录吗？此操作无法撤销。`)) remove(item.id);
}
