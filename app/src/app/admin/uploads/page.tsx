"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, Download, ExternalLink, FileWarning, HardDrive, RotateCcw, Search, ShieldCheck, Trash2 } from "lucide-react";
import { api, APIError, type AdminUploadedFileItem } from "@/lib/api";
import { AppShell } from "@/components/shell/AppShell";
import { EmptyState, ErrorState, InlineLoading } from "@/components/design/States";
import { useSession, useToasts } from "@/lib/store";

const STATUSES = ["", "pending", "uploaded", "processing", "ready", "failed", "deleted"];
const PURPOSES = [
  "",
  "avatar",
  "profile_cover",
  "post_image",
  "post_video",
  "post_audio",
  "article_image",
  "article_video",
  "experience_image",
  "experience_video",
  "question_image",
  "group_post_image",
  "group_post_video",
  "message_image",
  "message_video",
  "message_file",
  "video_thumbnail",
  "video_processed_file",
  "secondhand_image",
  "secondhand_video",
  "rental_image",
  "rental_video",
  "job_image",
  "job_video",
  "service_image",
  "service_video",
  "discount_image",
  "discount_video",
  "guide_article_image",
  "guide_product_preview",
  "guide_product_file",
  "member_resource_file",
  "business_logo",
  "business_cover",
  "business_verification_file",
];

function bytes(value: number) {
  if (!value) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let size = value;
  let idx = 0;
  while (size >= 1024 && idx < units.length - 1) {
    size /= 1024;
    idx += 1;
  }
  return `${size.toFixed(idx === 0 ? 0 : 1)} ${units[idx]}`;
}

function statusTone(status: string) {
  if (status === "ready") return "bg-emerald-50 text-emerald-700";
  if (status === "failed" || status === "deleted") return "bg-rose-50 text-rose-700";
  return "bg-amber-50 text-amber-700";
}

export default function AdminUploadsPage() {
  const router = useRouter();
  const user = useSession((s) => s.user);
  const sessionStatus = useSession((s) => s.status);
  const pushToast = useToasts((s) => s.push);
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [purpose, setPurpose] = useState("");
  const [checkObject, setCheckObject] = useState(false);
  const [incomplete, setIncomplete] = useState(false);
  const [openingFileId, setOpeningFileId] = useState("");

  useEffect(() => {
    if (sessionStatus === "unauthed") router.replace("/login?redirect=/admin/uploads");
  }, [sessionStatus, router]);

  const queryArgs = useMemo(() => ({ q, status, purpose, checkObject, incomplete, limit: 150 }), [q, status, purpose, checkObject, incomplete]);
  const uploads = useQuery({
    queryKey: ["admin-uploads", queryArgs],
    queryFn: () => api.adminUploads(queryArgs),
    enabled: user?.role === "admin",
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin-uploads"] });
  const patch = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Parameters<typeof api.adminUpdateUpload>[1] }) => api.adminUpdateUpload(id, body),
    onSuccess: () => { invalidate(); pushToast({ kind: "success", message: "已更新文件状态" }); },
    onError: (e) => pushToast({ kind: "error", message: e instanceof APIError ? e.message : "更新失败" }),
  });
  const del = useMutation({
    mutationFn: (id: string) => api.adminDeleteUpload(id),
    onSuccess: () => { invalidate(); pushToast({ kind: "success", message: "已标记删除" }); },
    onError: (e) => pushToast({ kind: "error", message: e instanceof APIError ? e.message : "删除失败" }),
  });
  const cleanup = useMutation({
    mutationFn: () => api.adminCleanupTempUploads({ hours: 24 }),
    onSuccess: (r) => { invalidate(); pushToast({ kind: "success", message: `已清理 ${r.count} 条记录` }); },
    onError: (e) => pushToast({ kind: "error", message: e instanceof APIError ? e.message : "清理失败" }),
  });
  const openPrivateFile = async (file: AdminUploadedFileItem) => {
    setOpeningFileId(file.id);
    try {
      const { url } = await api.uploadPrivateViewUrl(file.id);
      const link = document.createElement("a");
      link.href = url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.download = file.objectKey.split("/").pop() || file.id;
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (e) {
      pushToast({ kind: "error", message: e instanceof APIError ? e.message : "私密文件打开失败" });
    } finally {
      setOpeningFileId("");
    }
  };

  if (sessionStatus === "loading" || sessionStatus === "idle") return <AppShell><InlineLoading /></AppShell>;
  if (!user) return null;
  if (user.role !== "admin") {
    return <AppShell><div className="px-6 py-16 text-center"><AlertCircle className="mx-auto h-8 w-8 text-kx-danger" /><h1 className="mt-2 text-xl font-bold">无权访问</h1></div></AppShell>;
  }

  return (
    <AppShell>
      <header className="sticky top-0 z-30 kx-glass-bar px-3 py-2">
        <div className="flex items-center gap-2">
          <HardDrive className="h-5 w-5 text-kx-accent" />
          <h1 className="text-lg font-bold">文件管理</h1>
          <Link href="/admin" className="ml-auto inline-flex h-8 items-center gap-1 rounded-kx-md border border-kx-stroke/60 px-2 text-xs font-bold text-kx-subtle hover:text-kx-accent">
            <ShieldCheck className="h-3.5 w-3.5" /> 后台
          </Link>
        </div>
      </header>

      <main className="space-y-3 px-3 py-3 sm:px-4">
        <div className="kx-card space-y-3">
          <div className="grid gap-2 md:grid-cols-[minmax(220px,1fr)_160px_220px_auto_auto]">
            <label className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-kx-muted" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜索 ID / object key / 用户" className="kx-input h-10 w-full pl-9" />
            </label>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="kx-input h-10">
              {STATUSES.map((s) => <option key={s || "all"} value={s}>{s || "全部状态"}</option>)}
            </select>
            <select value={purpose} onChange={(e) => setPurpose(e.target.value)} className="kx-input h-10">
              {PURPOSES.map((p) => <option key={p || "all"} value={p}>{p || "全部用途"}</option>)}
            </select>
            <label className="inline-flex h-10 items-center gap-2 rounded-kx-md border border-kx-stroke/60 px-3 text-sm">
              <input type="checkbox" checked={incomplete} onChange={(e) => setIncomplete(e.target.checked)} /> 未完成
            </label>
            <label className="inline-flex h-10 items-center gap-2 rounded-kx-md border border-kx-stroke/60 px-3 text-sm">
              <input type="checkbox" checked={checkObject} onChange={(e) => setCheckObject(e.target.checked)} /> HEAD
            </label>
          </div>
          <button type="button" onClick={() => cleanup.mutate()} disabled={cleanup.isPending} className="kx-button h-9">
            <Trash2 className="h-4 w-4" /> 清理 24h temp / pending
          </button>
        </div>

        {uploads.isLoading ? <InlineLoading /> : uploads.isError ? (
          <ErrorState title="文件记录暂时无法加载" onRetry={() => uploads.refetch()} />
        ) : (uploads.data?.items.length ?? 0) === 0 ? (
          <EmptyState title="暂无文件记录" />
        ) : (
          <div className="overflow-x-auto rounded-kx-lg border border-kx-stroke/60 bg-kx-card">
            <table className="min-w-[1120px] w-full text-left text-xs">
              <thead className="bg-kx-soft/70 text-kx-muted">
                <tr>
                  <th className="px-3 py-2">文件</th>
                  <th className="px-3 py-2">用户</th>
                  <th className="px-3 py-2">用途</th>
                  <th className="px-3 py-2">业务关联</th>
                  <th className="px-3 py-2">大小</th>
                  <th className="px-3 py-2">状态</th>
                  <th className="px-3 py-2">对象</th>
                  <th className="px-3 py-2">操作</th>
                </tr>
              </thead>
              <tbody>
                {uploads.data!.items.map((f: AdminUploadedFileItem) => (
                  <tr key={f.id} className="border-t border-kx-stroke/50 align-top">
                    <td className="px-3 py-2">
                      <div className="font-mono text-[11px] text-kx-text">{f.id}</div>
                      <div className="mt-1 max-w-[280px] truncate font-mono text-[11px] text-kx-muted">{f.objectKey}</div>
                      {f.thumbnailUrl ? <Image src={f.thumbnailUrl} alt="" width={64} height={48} className="mt-2 h-12 w-16 rounded-kx-sm object-cover" /> : null}
                    </td>
                    <td className="px-3 py-2">{f.ownerName || f.ownerHandle || f.userId}</td>
                    <td className="px-3 py-2">{f.purpose}<div className="text-kx-muted">{f.contentType}</div></td>
                    <td className="px-3 py-2">{f.entityType || "—"}<div className="font-mono text-[11px] text-kx-muted">{f.entityId || "—"}</div></td>
                    <td className="px-3 py-2">{bytes(f.fileSize)}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full px-2 py-1 font-bold ${statusTone(f.status)}`}>{f.status}</span>
                      {f.objectExists !== undefined ? (
                        <div className="mt-2 inline-flex items-center gap-1 text-[11px] text-kx-muted">
                          {f.objectExists ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : <FileWarning className="h-3.5 w-3.5 text-rose-600" />}
                          S3 object
                        </div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">
                      {f.cdnUrl ? (
                        <a href={f.cdnUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-kx-accent hover:underline">
                          <ExternalLink className="h-3.5 w-3.5" /> CDN
                        </a>
                      ) : f.isPrivate ? (
                        <span className="text-kx-muted">私密加密对象</span>
                      ) : (
                        <span className="text-kx-muted">无 CDN</span>
                      )}
                      <div className="mt-1 text-kx-muted">{f.bucket}</div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1.5">
                        {f.isPrivate && ["uploaded", "processing", "ready"].includes(f.status) ? (
                          <button
                            type="button"
                            onClick={() => void openPrivateFile(f)}
                            disabled={openingFileId === f.id}
                            className="kx-button h-8 px-2"
                            aria-label="下载私密文件"
                            title="下载私密文件"
                          >
                            <Download className="h-3.5 w-3.5" />
                          </button>
                        ) : null}
                        {["failed", "deleted"].includes(f.status) ? (
                          <button
                            type="button"
                            onClick={() => patch.mutate({ id: f.id, body: { action: "restore" } })}
                            className="kx-button h-8 px-2"
                            aria-label="恢复文件"
                            title="恢复文件"
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                          </button>
                        ) : null}
                        {f.status !== "deleted" ? (
                          <button
                            type="button"
                            onClick={() => patch.mutate({ id: f.id, body: { action: "flag" } })}
                            className="kx-button h-8 px-2"
                            aria-label="标记异常"
                            title="标记异常"
                          >
                            <FileWarning className="h-3.5 w-3.5" />
                          </button>
                        ) : null}
                        {f.status !== "deleted" ? (
                          <button
                            type="button"
                            onClick={() => {
                              if (window.confirm("确认将该文件标记为已删除？")) del.mutate(f.id);
                            }}
                            className="kx-button h-8 px-2 text-kx-danger"
                            aria-label="删除文件"
                            title="删除文件"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </AppShell>
  );
}
