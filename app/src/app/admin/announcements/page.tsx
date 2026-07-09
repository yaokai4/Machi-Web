"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, FileText, Megaphone, Newspaper, Plus, Send, Smartphone, Trash2, ArrowLeft } from "lucide-react";
import clsx from "clsx";
import { AppShell } from "@/components/shell/AppShell";
import { useSession, useToasts } from "@/lib/store";
import { useI18n } from "@/lib/i18n";
import { ConfirmDialog } from "@/components/design/Dialog";

// Categories that can be published from the admin CMS. The 公告 /
// 通知 / 信息 trio matches the legacy storage so old entries keep
// rendering; 新闻 and App 更新 were added at the user's request to
// support news-style and app-release posts as well.
type AnnouncementType = "公告" | "新闻" | "App 更新" | "通知" | "信息";
interface Announcement {
  id: string;
  type: AnnouncementType;
  title: string;
  body: string;
  date: string;
  status: "draft" | "published";
  /// Languages this announcement is published in. Empty = all.
  locales: string[];
}

const TYPE_OPTIONS: { value: AnnouncementType; Icon: React.ComponentType<{ className?: string }>; tint: string }[] = [
  { value: "公告", Icon: Megaphone, tint: "text-indigo-700 bg-indigo-50 ring-indigo-200 dark:text-indigo-300 dark:bg-indigo-500/15 dark:ring-indigo-400/20" },
  { value: "新闻", Icon: Newspaper, tint: "text-sky-700 bg-sky-50 ring-sky-200 dark:text-sky-300 dark:bg-sky-500/15 dark:ring-sky-400/20" },
  { value: "App 更新", Icon: Smartphone, tint: "text-emerald-700 bg-emerald-50 ring-emerald-200 dark:text-emerald-300 dark:bg-emerald-500/15 dark:ring-emerald-400/20" },
  { value: "通知", Icon: Bell, tint: "text-violet-700 bg-violet-50 ring-violet-200 dark:text-violet-300 dark:bg-violet-500/15 dark:ring-violet-400/20" },
  { value: "信息", Icon: FileText, tint: "text-amber-700 bg-amber-50 ring-amber-200 dark:text-amber-300 dark:bg-amber-500/15 dark:ring-amber-400/20" },
];

const LOCALES: { value: string; label: string }[] = [
  { value: "zh", label: "中文" },
  { value: "en", label: "English" },
  { value: "ja", label: "日本語" },
];

const STORAGE_KEY = "machi-marketing-announcements-zh";

/// Blog-style admin tool for posting Machi marketing
/// announcements. Lives behind `/admin/announcements`, gated by
/// AppShell's auth guard + a role check. Persists to the same
/// localStorage key the public AnnouncementSection consumes so the
/// preview updates instantly without backend round-tripping.
export default function AdminAnnouncementsPage() {
  const me = useSession((s) => s.user);
  const router = useRouter();
  const pushToast = useToasts((s) => s.push);
  const { t } = useI18n();

  const isAdmin = me?.role === "admin";

  useEffect(() => {
    if (me && !isAdmin) {
      pushToast({ kind: "error", message: "需要管理员权限" });
      router.replace("/home");
    }
  }, [me, isAdmin, router, pushToast]);

  const [list, setList] = useState<Announcement[]>([]);
  const [editing, setEditing] = useState<Announcement | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Announcement | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          // Older format had no id/status — backfill so the UI doesn't
          // have to guard every render.
          setList(parsed.map((a, i) => ({
            id: a.id || `legacy-${i}`,
            type: a.type || "公告",
            title: a.title || "",
            body: a.body || "",
            date: a.date || todayMonth(),
            status: a.status || "published",
            locales: Array.isArray(a.locales) ? a.locales : [],
          })));
          return;
        }
      }
    } catch {}
    setList([]);
  }, []);

  const persist = (next: Announcement[]) => {
    setList(next);
    try {
      // Mirror to all three locale-suffixed keys so AnnouncementSection
      // reflects the change regardless of UI language.
      const publicView = next.filter((a) => a.status === "published").map((a) => ({
        type: a.type,
        title: a.title,
        body: a.body,
        date: a.date,
      }));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(publicView));
      LOCALES.forEach((l) => {
        localStorage.setItem(`machi-marketing-announcements-${l.value}`, JSON.stringify(publicView));
      });
    } catch {}
  };

  const save = (form: Announcement) => {
    if (!form.title.trim() || !form.body.trim()) {
      pushToast({ kind: "error", message: "标题和正文都必填" });
      return;
    }
    const existing = list.findIndex((a) => a.id === form.id);
    const next = [...list];
    if (existing >= 0) next[existing] = form;
    else next.unshift(form);
    persist(next);
    setEditing(null);
    pushToast({ kind: "success", message: form.status === "published" ? "已发布" : "已存为草稿" });
  };

  const remove = (announcement: Announcement) => {
    persist(list.filter((a) => a.id !== announcement.id));
    setConfirmDelete(null);
    pushToast({ kind: "success", message: "已删除" });
  };

  const togglePublish = (a: Announcement) => {
    save({ ...a, status: a.status === "published" ? "draft" : "published" });
  };

  if (!me || !isAdmin) {
    return (
      <AppShell right={null} wide>
        <div className="p-8 text-center text-kx-muted">仅管理员可访问。</div>
      </AppShell>
    );
  }

  return (
    <AppShell right={null} wide>
      <header className="sticky top-0 z-30 kx-glass-bar px-4 py-3 flex items-center gap-3">
        <Link href="/admin" className="kx-button-ghost h-8 w-8 inline-flex items-center justify-center" aria-label={t("msg_back")}>
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold truncate">公告管理</h1>
          <p className="text-xs text-kx-muted truncate">发布、编辑或撤回 Machi 官网首页的公告 / 通知 / 信息条目</p>
        </div>
        <button
          type="button"
          onClick={() =>
            setEditing({
              id: `a_${Date.now().toString(36)}`,
              type: "公告",
              title: "",
              body: "",
              date: todayMonth(),
              status: "published",
              locales: [],
            })
          }
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full bg-kx-accent text-white text-sm font-bold hover:opacity-95"
        >
          <Plus className="w-4 h-4" />
          新建
        </button>
      </header>

      <div className="px-4 py-3 space-y-3">
        {list.length === 0 ? (
          <div className="kx-card text-center py-12 px-6">
            <Megaphone className="w-8 h-8 mx-auto text-kx-muted" />
            <p className="mt-3 font-bold">还没有公告</p>
            <p className="mt-1 text-sm text-kx-muted">点击右上角“新建”发布第一条。</p>
          </div>
        ) : (
          list.map((a) => (
            <article key={a.id} className="kx-card flex items-start gap-3">
              <TypeIcon type={a.type} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-bold text-kx-text">{a.type}</span>
                  <span className="text-kx-muted">{a.date}</span>
                  <span
                    className={clsx(
                      "rounded-full px-2 py-0.5 font-bold",
                      a.status === "published"
                        ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                        : "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
                    )}
                  >
                    {a.status === "published" ? "已发布" : "草稿"}
                  </span>
                </div>
                <h3 className="mt-1 font-bold text-base truncate">{a.title || "(无标题)"}</h3>
                <p className="mt-1 text-sm text-kx-muted line-clamp-2">{a.body}</p>
                <div className="mt-3 flex items-center gap-2">
                  <button className="kx-button-ghost h-8 px-3 text-xs" onClick={() => setEditing(a)}>
                    编辑
                  </button>
                  <button className="kx-button-ghost h-8 px-3 text-xs" onClick={() => togglePublish(a)}>
                    {a.status === "published" ? "撤回为草稿" : "立即发布"}
                  </button>
                  <button
                    className="kx-button-ghost h-8 px-3 text-xs text-kx-danger"
                    onClick={() => setConfirmDelete(a)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    删除
                  </button>
                </div>
              </div>
            </article>
          ))
        )}
      </div>

      {editing ? (
        <Editor
          initial={editing}
          onCancel={() => setEditing(null)}
          onSave={save}
        />
      ) : null}

      <ConfirmDialog
        open={!!confirmDelete}
        title="删除这条公告?"
        description="删除后官网首页立即停止展示。"
        confirmLabel="删除"
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => confirmDelete && remove(confirmDelete)}
        destructive
      />
    </AppShell>
  );
}

function todayMonth() {
  const d = new Date();
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function TypeIcon({ type }: { type: AnnouncementType }) {
  const spec = TYPE_OPTIONS.find((o) => o.value === type) ?? TYPE_OPTIONS[0];
  const Icon = spec.Icon;
  return (
    <span className={clsx("shrink-0 inline-flex h-10 w-10 items-center justify-center rounded-2xl ring-1", spec.tint)}>
      <Icon className="w-5 h-5" />
    </span>
  );
}

function Editor({
  initial,
  onCancel,
  onSave,
}: {
  initial: Announcement;
  onCancel: () => void;
  onSave: (a: Announcement) => void;
}) {
  const [form, setForm] = useState<Announcement>(initial);

  const update = <K extends keyof Announcement>(key: K, value: Announcement[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-3 py-6" onClick={onCancel}>
      <div
        className="relative w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-3xl bg-white p-5 shadow-xl dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold">{form.id.startsWith("a_") ? "新建公告" : "编辑公告"}</h2>

        <div className="mt-4 grid gap-3">
          <label className="grid gap-1.5">
            <span className="text-xs font-bold text-kx-muted">类型</span>
            <div className="flex flex-wrap gap-2">
              {TYPE_OPTIONS.map((o) => {
                const I = o.Icon;
                return (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => update("type", o.value)}
                    className={clsx(
                      "inline-flex items-center gap-1.5 h-9 px-3 rounded-full text-sm font-bold ring-1 transition",
                      form.type === o.value
                        ? "bg-slate-950 text-white ring-slate-950 dark:bg-white dark:text-slate-950 dark:ring-white"
                        : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50 dark:bg-white/5 dark:text-slate-200 dark:ring-white/10",
                    )}
                  >
                    <I className="w-4 h-4" />
                    {o.value}
                  </button>
                );
              })}
            </div>
          </label>

          <label className="grid gap-1.5">
            <span className="text-xs font-bold text-kx-muted">标题</span>
            <input
              className="kx-input h-11 px-3"
              value={form.title}
              onChange={(e) => update("title", e.target.value)}
              placeholder="例如:东京城市频道即将开放"
              maxLength={120}
            />
          </label>

          <label className="grid gap-1.5">
            <span className="text-xs font-bold text-kx-muted">正文</span>
            <textarea
              className="kx-input min-h-40 px-3 py-3"
              value={form.body}
              onChange={(e) => update("body", e.target.value)}
              placeholder="写下公告、通知或信息内容"
              maxLength={1000}
            />
            <span className="text-[11px] text-kx-muted text-right">{form.body.length}/1000</span>
          </label>

          <label className="grid gap-1.5">
            <span className="text-xs font-bold text-kx-muted">日期</span>
            <input
              className="kx-input h-11 px-3 max-w-[160px]"
              value={form.date}
              onChange={(e) => update("date", e.target.value)}
              placeholder="2026.05"
            />
          </label>

          <fieldset className="grid gap-1.5">
            <span className="text-xs font-bold text-kx-muted">状态</span>
            <div className="flex gap-2">
              {(["published", "draft"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => update("status", s)}
                  className={clsx(
                    "inline-flex items-center gap-1.5 h-9 px-3 rounded-full text-sm font-bold ring-1 transition",
                    form.status === s
                      ? "bg-slate-950 text-white ring-slate-950 dark:bg-white dark:text-slate-950 dark:ring-white"
                      : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50 dark:bg-white/5 dark:text-slate-200 dark:ring-white/10",
                  )}
                >
                  {s === "published" ? "立即发布" : "存为草稿"}
                </button>
              ))}
            </div>
          </fieldset>
        </div>

        <div className="mt-6 flex items-center justify-end gap-2">
          <button className="kx-button-ghost h-10 px-4" onClick={onCancel}>取消</button>
          <button
            className="kx-button-primary inline-flex items-center gap-1.5 h-10 px-4"
            onClick={() => onSave(form)}
          >
            <Send className="w-4 h-4" />
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
