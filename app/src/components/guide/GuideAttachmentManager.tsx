"use client";

import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, FileText, Loader2, Paperclip, Trash2, Upload } from "lucide-react";
import { api, type UploadedFile } from "@/lib/api";
import { guide } from "@/lib/guide";
import { useToasts } from "@/lib/store";
import { useI18n } from "@/lib/i18n";

type GuideAttachmentEntity =
  | "guide_task"
  | "guide_application"
  | "guide_life_item"
  | "guide_contract"
  | "guide_document"
  | "guide_goal"
  | "guide_calendar_event";

export function GuideAttachmentManager({
  entityType,
  entityId,
  title = "附件",
  compact = false,
}: {
  entityType: GuideAttachmentEntity;
  entityId: string;
  title?: string;
  compact?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const pushToast = useToasts((s) => s.push);
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [progress, setProgress] = useState("");
  const queryKey = ["guide", "attachments", entityType, entityId];
  const attachments = useQuery({
    queryKey,
    queryFn: () => guide.attachments({ entityType, entityId }),
    enabled: Boolean(entityId),
    staleTime: 1000 * 30,
  });

  const upload = useMutation({
    mutationFn: async (files: FileList) => {
      const selected = Array.from(files).slice(0, 10);
      for (const file of selected) {
        setProgress(`上传 ${file.name}`);
        await api.uploadFile(file, {
          purpose: "guide_attachment",
          entityType,
          entityId,
          metadata: { fileName: file.name },
          onProgress: (event) => {
            const pct = Math.round((event.progress || 0) * 100);
            setProgress(`${file.name} ${pct}%`);
          },
        });
      }
    },
    onSuccess: () => {
      setProgress("");
      queryClient.invalidateQueries({ queryKey });
      pushToast({ kind: "success", message: "附件已上传" });
      if (inputRef.current) inputRef.current.value = "";
    },
    onError: (error) => {
      setProgress("");
      pushToast({ kind: "error", message: error instanceof Error ? error.message : "上传失败，请重试" });
      if (inputRef.current) inputRef.current.value = "";
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.deleteUploadedFile(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      pushToast({ kind: "success", message: "附件已删除" });
    },
    onError: (error) => pushToast({ kind: "error", message: error instanceof Error ? error.message : "删除失败" }),
  });

  const openFile = async (file: UploadedFile) => {
    try {
      const direct = file.cdnUrl || file.publicUrl || file.url;
      const url = file.isPrivate ? (await api.uploadPrivateViewUrl(file.id)).url : direct;
      if (!url) throw new Error("文件暂时不可查看");
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (error) {
      pushToast({ kind: "error", message: error instanceof Error ? error.message : "打开失败，请稍后重试" });
    }
  };

  if (!entityId) return null;
  const items = attachments.data?.items || [];

  return (
    <section className={compact ? "space-y-3" : "kx-card space-y-4 p-4"}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Paperclip className="h-4 w-4 text-kx-accent" />
          <h3 className="text-sm font-black text-kx-text">{title}</h3>
          {items.length ? <span className="rounded-full bg-kx-accentSoft px-2 py-0.5 text-xs font-bold text-kx-accent">{items.length}</span> : null}
        </div>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={upload.isPending}
          className="inline-flex min-h-11 items-center gap-2 rounded-2xl bg-kx-accent px-4 text-sm font-black text-white shadow-sm transition hover:-translate-y-0.5 disabled:opacity-60"
        >
          {upload.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          上传附件
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/*,application/pdf"
          className="sr-only"
          onChange={(event) => {
            if (event.target.files?.length) upload.mutate(event.target.files);
          }}
        />
      </div>

      {progress ? <p className="rounded-2xl bg-kx-accentSoft px-3 py-2 text-xs font-bold text-kx-accent">{progress}</p> : null}
      {attachments.isLoading ? <p className="text-sm text-kx-muted">附件加载中...</p> : null}
      {attachments.isError ? (
        <button type="button" onClick={() => attachments.refetch()} className="min-h-11 rounded-2xl border border-kx-stroke px-4 text-sm font-bold text-kx-text">
          附件加载失败，点击重试
        </button>
      ) : null}
      {!attachments.isLoading && !items.length ? (
        <p className="rounded-2xl bg-kx-bg px-3 py-3 text-sm leading-6 text-kx-muted">可上传合同、缴费凭证、履历书、ES 草稿、PDF 或截图。文件为私密附件，只绑定在当前 Guide 项目。</p>
      ) : null}
      {items.length ? (
        <div className="grid gap-2">
          {items.map((file) => (
            <div key={file.id} className="flex items-center gap-3 rounded-2xl border border-kx-stroke/60 bg-kx-card px-3 py-2">
              <FileText className="h-5 w-5 shrink-0 text-kx-accent" />
              <button type="button" onClick={() => openFile(file)} className="min-h-11 min-w-0 flex-1 text-left">
                <span className="block truncate text-sm font-black text-kx-text">{file.fileName || file.originalFileName || file.objectKey.split("/").pop() || "附件"}</span>
                <span className="block text-xs text-kx-muted">{formatBytes(file.fileSize)} · {file.contentType || file.fileType}</span>
              </button>
              <button type="button" onClick={() => openFile(file)} className="grid h-11 w-11 place-items-center rounded-2xl text-kx-accent hover:bg-kx-accentSoft" aria-label={t("aria_view_attachment")}>
                <ExternalLink className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  if (window.confirm("确定删除这个附件吗？")) remove.mutate(file.id);
                }}
                disabled={remove.isPending && remove.variables === file.id}
                className="grid h-11 w-11 place-items-center rounded-2xl text-red-500 hover:bg-red-50 disabled:opacity-60"
                aria-label={t("aria_delete_attachment")}
              >
                {remove.isPending && remove.variables === file.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function formatBytes(value: number) {
  if (!value) return "0 KB";
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}
