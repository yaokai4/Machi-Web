"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2, FileText, Edit3 } from "lucide-react";
import { api, APIError } from "@/lib/api";
import { AppShell } from "@/components/shell/AppShell";
import { EmptyState, ErrorState, InlineLoading } from "@/components/design/States";
import { fullDateTime } from "@/lib/format";
import { useCompose, useToasts } from "@/lib/store";

export default function DraftsPage() {
  const compose = useCompose((s) => s.open);
  const pushToast = useToasts((s) => s.push);
  const queryClient = useQueryClient();
  const q = useQuery({ queryKey: ["drafts"], queryFn: () => api.drafts() });

  const remove = async (id: string) => {
    try {
      await api.deleteDraft(id);
      queryClient.invalidateQueries({ queryKey: ["drafts"] });
    } catch (err) {
      pushToast({ kind: "error", message: (err as APIError).message });
    }
  };

  return (
    <AppShell>
      <header className="sticky top-0 z-30 kx-glass-bar px-3 py-2">
        <h1 className="text-lg font-bold">草稿箱</h1>
      </header>
      <div className="px-3 sm:px-4 py-3 space-y-3">
        {q.isLoading ? (
          <InlineLoading />
        ) : q.isError ? (
          <ErrorState onRetry={() => q.refetch()} />
        ) : !q.data?.length ? (
          <EmptyState title="没有草稿" subtitle="发布前可以保存为草稿，便于稍后继续编辑。" icon={FileText} action={{ label: "写第一条", onClick: () => compose() }} />
        ) : (
          q.data.map((d) => (
            <article key={d.id} className="kx-card flex items-start gap-3">
              <FileText className="w-4 h-4 text-kx-muted mt-1" />
              <div className="flex-1 min-w-0">
                <p className="text-kx-text whitespace-pre-wrap break-words line-clamp-4 text-sm">{d.content || "（空内容）"}</p>
                <div className="text-xs text-kx-muted mt-1">{fullDateTime(d.updated_at)}</div>
                {d.tags?.length ? (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {d.tags.map((t) => (
                      <span key={t} className="text-xs px-2 py-0.5 rounded-full bg-kx-accentSoft text-kx-accent">#{t}</span>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="flex flex-col gap-1.5">
                <button
                  className="kx-button-ghost h-8 px-3 text-xs"
                  onClick={() => compose({ draftId: d.id, initialContent: d.content, initialTags: d.tags, initialMediaIds: d.media_ids })}
                >
                  <Edit3 className="w-3.5 h-3.5" /> 编辑
                </button>
                <button
                  className="kx-button-ghost h-8 px-3 text-xs text-kx-danger"
                  onClick={() => remove(d.id)}
                >
                  <Trash2 className="w-3.5 h-3.5" /> 删除
                </button>
              </div>
            </article>
          ))
        )}
      </div>
    </AppShell>
  );
}
