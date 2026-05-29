"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Send, Loader2 } from "lucide-react";
import { api, APIError } from "@/lib/api";
import { AppShell } from "@/components/shell/AppShell";
import { useToasts } from "@/lib/store";

const CATEGORIES = [
  { value: "bug", label: "Bug / 异常" },
  { value: "feature", label: "新功能建议" },
  { value: "design", label: "界面 / 体验" },
  { value: "performance", label: "性能" },
  { value: "general", label: "其他" },
];

export default function FeedbackPage() {
  const router = useRouter();
  const pushToast = useToasts((s) => s.push);
  const [category, setCategory] = useState("bug");
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!content.trim()) return;
    setSubmitting(true);
    try {
      await api.submitFeedback({ category, content: content.trim() });
      pushToast({ kind: "success", message: "反馈已提交，感谢！" });
      router.replace("/settings");
    } catch (err) {
      pushToast({ kind: "error", message: (err as APIError).message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AppShell>
      <header className="sticky top-0 z-30 kx-glass-bar px-3 py-2 flex items-center gap-2">
        <Link href="/settings" className="kx-button-ghost h-9 w-9 p-0"><ArrowLeft className="w-4 h-4" /></Link>
        <h1 className="text-lg font-bold">反馈问题</h1>
      </header>
      <div className="px-3 sm:px-4 py-3 space-y-3">
        <div className="kx-card">
          <label className="block">
            <span className="text-sm font-semibold">问题类型</span>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {CATEGORIES.map((c) => (
                <button
                  key={c.value}
                  className={`text-xs px-3 h-8 rounded-full font-semibold transition ${
                    category === c.value ? "bg-kx-accent text-white" : "bg-kx-soft text-kx-text hover:bg-kx-stroke/40"
                  }`}
                  onClick={() => setCategory(c.value)}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </label>
          <label className="block mt-3">
            <span className="text-sm font-semibold">详细描述</span>
            <textarea
              className="kx-textarea mt-1 h-40"
              placeholder="请描述你遇到的问题或想要的功能。"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              maxLength={2000}
            />
            <span className="text-xs text-kx-muted">{content.length} / 2000</span>
          </label>
          <div className="flex justify-end mt-3">
            <button className="kx-button-primary" onClick={submit} disabled={submitting || !content.trim()}>
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              提交
            </button>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
