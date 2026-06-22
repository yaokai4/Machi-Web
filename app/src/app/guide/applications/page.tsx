"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Briefcase, CalendarClock, GraduationCap, Plus, Trash2 } from "lucide-react";
import { guide } from "@/lib/guide";
import type { GuideApplication, GuideSchool, GuideCompany } from "@/lib/guide";
import { GuideShell } from "@/components/guide/GuideKit";
import { EmptyPanel, GuideTodoCard } from "@/components/guide/GuideOS";
import { InlineLoading } from "@/components/design/States";
import { useAuthPrompt, useSession, useToasts } from "@/lib/store";

export default function GuideApplicationsPage() {
  const user = useSession((s) => s.user);
  const openAuthPrompt = useAuthPrompt((s) => s.open);
  const pushToast = useToasts((s) => s.push);
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ type: "school", careerTrack: "", name: "", department: "", position: "", deadline: "", interviewAt: "", resultAt: "", notes: "" });
  const todos = useQuery({
    queryKey: ["guide", "todos", "applications", user?.id || "guest"],
    queryFn: () => guide.todos({ status: "open", limit: 80 }),
    enabled: Boolean(user),
    select: (data) => ({ ...data, items: data.items.filter((t) => ["school_application", "school_interview", "company_es", "company_interview", "application_result"].includes(t.todoType)) }),
  });
  const applications = useQuery({
    queryKey: ["guide", "applications", user?.id || "guest"],
    queryFn: () => guide.applications(),
    enabled: Boolean(user),
  });
  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["guide", "applications"] });
    queryClient.invalidateQueries({ queryKey: ["guide", "todos"] });
    queryClient.invalidateQueries({ queryKey: ["guide", "calendar"] });
  };
  const create = useMutation({
    mutationFn: () => guide.createApplication(form),
    onSuccess: () => {
      invalidateAll();
      pushToast({ kind: "success", message: "申请日程已添加" });
      setForm((f) => ({ ...f, name: "", department: "", position: "", deadline: "", interviewAt: "", resultAt: "", notes: "" }));
    },
    onError: (err) => pushToast({ kind: "error", message: err instanceof Error ? err.message : "添加失败" }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => guide.deleteApplication(id),
    onSuccess: () => { invalidateAll(); pushToast({ kind: "success", message: "已删除该申请及其待办" }); },
    onError: (err) => pushToast({ kind: "error", message: err instanceof Error ? err.message : "删除失败" }),
  });

  if (!user) {
    return (
      <GuideShell back={{ href: "/guide", label: "日本指南" }}>
        <div className="px-4 py-8 sm:px-7">
          <section className="kx-guide-hero p-6">
            <GraduationCap className="h-8 w-8 text-kx-accent" />
            <h1 className="mt-3 text-3xl font-black text-kx-text">登录后管理出愿、ES 和面试</h1>
            <p className="mt-2 text-sm leading-7 text-kx-subtle">大学出愿、公司 ES、面试时间和结果发表会自动进入 Guide Todo 与日历。</p>
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
          <p className="text-xs font-black uppercase tracking-[0.12em] text-[rgb(var(--kx-living-warm))]">Applications</p>
          <h1 className="mt-2 text-3xl font-black text-kx-text">出愿 / ES / 面试管理</h1>
          <p className="mt-2 max-w-2xl text-sm leading-7 text-kx-subtle">大学、大学院、语言学校、公司新卒和社会人转职都可以统一管理截止日期。</p>
        </header>

        <section className="grid gap-5 lg:grid-cols-[380px_minmax(0,1fr)]">
          <form className="kx-card space-y-4 p-5" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
            <div className="flex items-center gap-2">
              {form.type === "school" ? <GraduationCap className="h-5 w-5 text-kx-accent" /> : <Briefcase className="h-5 w-5 text-kx-accent" />}
              <h2 className="text-lg font-black text-kx-text">添加申请</h2>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {([
                { key: "school", track: "", label: "学校出愿" },
                { key: "company", track: "shinsotsu", label: "新卒就活" },
                { key: "company", track: "tenshoku", label: "社会人转职" },
                { key: "jlpt", track: "", label: "JLPT 考试" },
              ] as const).map((opt) => {
                const active = form.type === opt.key && (form.careerTrack || "") === opt.track;
                return (
                  <button key={opt.label} type="button" onClick={() => setForm((f) => ({ ...f, type: opt.key, careerTrack: opt.track }))}
                    className={(active ? "border-kx-accent bg-kx-accentSoft text-kx-accent" : "border-kx-stroke/60 bg-kx-card text-kx-subtle") + " rounded-2xl border px-3 py-2 text-sm font-black"}>
                    {opt.label}
                  </button>
                );
              })}
            </div>
            {form.type === "jlpt"
              ? <Field label="考试 / 级别" value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} placeholder="JLPT N2" />
              : <LibraryPickerField type={form.type} value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} />}
            {form.type !== "jlpt" ? (
              <Field label={form.type === "school" ? "研究科 / 专攻" : "岗位 / 职种"} value={form.type === "school" ? form.department : form.position} onChange={(v) => setForm((f) => ({ ...f, [form.type === "school" ? "department" : "position"]: v }))} />
            ) : null}
            <Field label={form.type === "school" ? "出愿截止" : form.type === "jlpt" ? "考试日期" : "ES 截止"} value={form.deadline} onChange={(v) => setForm((f) => ({ ...f, deadline: v }))} placeholder="2026-09-10" />
            <p className="-mt-1 text-xs leading-5 text-kx-muted">填写{form.type === "jlpt" ? "考试日期" : "截止日期"}后，Machi 会自动生成 T-90 → T-0 的倒排准备计划（套磁 / ES / 模考…）和提醒。</p>
            {form.type !== "jlpt" ? (
              <>
                <Field label="面试时间" value={form.interviewAt} onChange={(v) => setForm((f) => ({ ...f, interviewAt: v }))} placeholder="2026-10-05 14:00" />
                <Field label="结果发表 / Offer 日期" value={form.resultAt} onChange={(v) => setForm((f) => ({ ...f, resultAt: v }))} placeholder="2026-11-01" />
              </>
            ) : null}
            <button type="submit" disabled={create.isPending || !form.name.trim() || !form.deadline.trim()} className="kx-button-primary h-11 w-full disabled:opacity-60">
              <Plus className="h-4 w-4" /> 生成 Todo
            </button>
          </form>

          <div className="space-y-7">
            {applications.data?.items.length ? (
              <section>
                <h2 className="mb-3 text-xl font-black text-kx-text">我的申请</h2>
                <div className="space-y-3">
                  {applications.data.items.map((app) => (
                    <ApplicationCard key={app.id} app={app} onDelete={() => remove.mutate(app.id)} deleting={remove.isPending && remove.variables === app.id} />
                  ))}
                </div>
              </section>
            ) : null}

            <section>
              <h2 className="mb-3 text-xl font-black text-kx-text">申请待办</h2>
              {todos.isLoading ? <InlineLoading /> : todos.data?.items.length ? (
                <div className="space-y-3">
                  {todos.data.items.map((todo) => <GuideTodoCard key={todo.id} todo={todo} />)}
                </div>
              ) : (
                <EmptyPanel title="还没有申请待办" body="添加大学出愿、公司 ES 或面试时间后，Machi 会自动生成倒排 Todo 和提醒。" />
              )}
            </section>
          </div>
        </section>
      </div>
    </GuideShell>
  );
}

// Name field that supports BOTH free typing and picking from the school /
// company library — type ≥2 chars and matches from the库 appear as suggestions;
// "库里没有？直接输入名称即可" keeps manual entry first-class.
function LibraryPickerField({ type, value, onChange }: { type: string; value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const scope = type === "school" ? "schools" : "companies";
  const q = useQuery({
    queryKey: ["guide", "app-library", scope, value.trim()],
    queryFn: () => guide.search(value.trim(), "jp", "zh-CN", scope),
    enabled: open && value.trim().length >= 2,
  });
  const results = (type === "school" ? q.data?.groups.schools : q.data?.groups.companies) || [];
  const label = type === "school" ? "学校 / 研究科名称" : "公司名称";
  return (
    <label className="relative block">
      <span className="text-sm font-black text-kx-text">{label}</span>
      <input
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={type === "school" ? "输入或从学校库选择，如 东京大学大学院" : "输入或从公司库选择，如 Mercari"}
        className="mt-2 h-11 w-full rounded-2xl border border-kx-stroke/60 bg-kx-card px-3 text-sm font-semibold outline-none focus:border-kx-accent"
      />
      {open && value.trim().length >= 2 && results.length > 0 ? (
        <div className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-2xl border border-kx-stroke/60 bg-kx-card shadow-lg">
          {results.slice(0, 6).map((r) => {
            const nm = type === "school" ? (r as GuideSchool).schoolName : (r as GuideCompany).companyName;
            const sub = type === "school" ? (r as GuideSchool).prefecture : (r as GuideCompany).industry;
            return (
              <button
                key={(r as GuideSchool | GuideCompany).id}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); onChange(nm); setOpen(false); }}
                className="block w-full px-3 py-2 text-left text-sm font-semibold text-kx-text hover:bg-kx-accentSoft"
              >
                {nm}{sub ? <span className="ml-2 text-xs font-medium text-kx-subtle">{sub}</span> : null}
              </button>
            );
          })}
          <div className="px-3 py-1.5 text-[11px] text-kx-subtle">库里没有？直接输入名称即可</div>
        </div>
      ) : null}
    </label>
  );
}

// A saved application with its key dates and a delete affordance. Deleting
// removes the application AND its generated reverse-countdown todos + reminders.
function ApplicationCard({ app, onDelete, deleting }: { app: GuideApplication; onDelete: () => void; deleting: boolean }) {
  const isSchool = app.type === "school";
  const chips: { label: string; value: string }[] = [];
  if (app.deadline) chips.push({ label: isSchool ? "出愿截止" : "ES 截止", value: app.deadline });
  if (app.interviewAt) chips.push({ label: "面试", value: app.interviewAt });
  if (app.resultAt) chips.push({ label: "结果", value: app.resultAt });
  return (
    <div className="kx-card flex items-start gap-3 p-4">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-kx-accentSoft text-kx-accent">
        {isSchool ? <GraduationCap className="h-5 w-5" /> : <Briefcase className="h-5 w-5" />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-black text-kx-text">{app.name}</p>
          <span className="shrink-0 rounded-full bg-kx-accentSoft px-2 py-0.5 text-[11px] font-bold text-kx-accent">{isSchool ? "升学" : "就职/转职"}</span>
        </div>
        {(app.department || app.position) ? <p className="mt-0.5 truncate text-xs text-kx-muted">{app.department || app.position}</p> : null}
        {chips.length ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {chips.map((c) => (
              <span key={c.label} className="inline-flex items-center gap-1 rounded-full border border-kx-stroke/60 bg-kx-card px-2 py-0.5 text-[11px] font-semibold text-kx-subtle">
                <CalendarClock className="h-3 w-3" /> {c.label} · {c.value}
              </span>
            ))}
          </div>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onDelete}
        disabled={deleting}
        aria-label="删除申请"
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
