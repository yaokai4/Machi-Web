"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, ExternalLink, Mail, MapPin, Video } from "lucide-react";
import { guide } from "@/lib/guide";
import { GuideShell } from "@/components/guide/GuideKit";
import { GuideTodoCard } from "@/components/guide/GuideOS";
import { GuideAttachmentManager } from "@/components/guide/GuideAttachmentManager";
import { ErrorState, InlineLoading } from "@/components/design/States";
import { useToasts } from "@/lib/store";

const stages = [
  ["saved", "收藏"], ["preparing", "准备资料"], ["submitted", "已投递"], ["es", "ES"],
  ["web_test", "Web Test"], ["interview_1", "一面"], ["interview_2", "二面"],
  ["final", "最终面"], ["offer", "Offer"], ["rejected", "拒绝"], ["withdrawn", "放弃"],
] as const;

export default function GuideApplicationDetailPage() {
  const params = useParams<{ id: string }>();
  const id = String(params.id || "");
  const pushToast = useToasts((s) => s.push);
  const queryClient = useQueryClient();
  const q = useQuery({ queryKey: ["guide", "application", id], queryFn: () => guide.application(id), enabled: Boolean(id) });
  const update = useMutation({
    mutationFn: (stage: string) => guide.updateApplication(id, { stage, stageNote: "从申请详情更新" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["guide", "application", id] });
      queryClient.invalidateQueries({ queryKey: ["guide", "applications"] });
      pushToast({ kind: "success", message: "申请阶段已更新" });
    },
  });
  if (q.isLoading) return <GuideShell back={{ href: "/guide/applications", label: "申请管理" }}><div className="px-4 py-8 sm:px-7"><InlineLoading /></div></GuideShell>;
  if (q.isError || !q.data) return <GuideShell back={{ href: "/guide/applications", label: "申请管理" }}><div className="px-4 py-8 sm:px-7"><ErrorState title="申请加载失败" subtitle="请稍后重试。" onRetry={() => q.refetch()} /></div></GuideShell>;
  const app = q.data.application;
  return (
    <GuideShell back={{ href: "/guide/applications", label: "申请管理" }}>
      <main className="space-y-7 px-4 py-7 sm:px-7">
        <header>
          <p className="text-xs font-black uppercase tracking-[0.12em] text-[rgb(var(--kx-living-warm))]">Application</p>
          <h1 className="mt-2 text-3xl font-black text-kx-text">{app.name}</h1>
          <p className="mt-2 text-sm text-kx-muted">{app.department || app.position || "申请详情"}</p>
        </header>
        <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-5">
            <div className="kx-card p-5">
              <h2 className="text-lg font-black text-kx-text">阶段</h2>
              <select value={app.stage} onChange={(event) => update.mutate(event.target.value)} className="mt-3 min-h-11 w-full rounded-2xl border border-kx-stroke/60 bg-kx-card px-3 text-sm font-bold">{stages.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
              <div className="mt-5 border-l-2 border-kx-accentSoft pl-4">
                {app.stages.map((stage) => <div key={stage.id} className="relative pb-5 last:pb-0"><span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-kx-accent" /><p className="text-sm font-black text-kx-text">{stages.find(([key]) => key === stage.stage)?.[1] || stage.stage}</p><p className="mt-0.5 text-xs text-kx-muted">{stage.occurredAt?.slice(0, 16).replace("T", " ")}{stage.note ? ` · ${stage.note}` : ""}</p></div>)}
              </div>
            </div>
            <section>
              <h2 className="mb-3 text-xl font-black text-kx-text">关联 Todo</h2>
              <div className="space-y-3">{q.data.todos.map((todo) => <GuideTodoCard key={todo.id} todo={todo} />)}</div>
            </section>
          </div>
          <aside className="kx-card h-fit space-y-4 p-5">
            <h2 className="text-lg font-black text-kx-text">关键信息</h2>
            <Info icon={<CalendarClock className="h-4 w-4" />} label="截止" value={app.deadline || "未设置"} />
            <Info icon={<CalendarClock className="h-4 w-4" />} label="面试" value={app.interviewAt || "未设置"} />
            <Info icon={<MapPin className="h-4 w-4" />} label="地点" value={app.interviewLocation || "未设置"} />
            <Info icon={<Mail className="h-4 w-4" />} label="联系人" value={[app.contactName, app.contactEmail].filter(Boolean).join(" · ") || "未设置"} />
            {app.websiteUrl ? <Link href={app.websiteUrl} target="_blank" rel="noreferrer" className="kx-button-secondary min-h-11 w-full"><ExternalLink className="h-4 w-4" /> 官网</Link> : null}
            {app.meetingUrl ? <Link href={app.meetingUrl} target="_blank" rel="noreferrer" className="kx-button-primary min-h-11 w-full"><Video className="h-4 w-4" /> 加入会议</Link> : null}
            {app.notes ? <p className="rounded-xl bg-kx-soft p-3 text-sm leading-6 text-kx-subtle">{app.notes}</p> : null}
            <GuideAttachmentManager entityType="guide_application" entityId={app.id} title="申请附件" compact />
          </aside>
        </section>
      </main>
    </GuideShell>
  );
}

function Info({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div className="flex items-start gap-2"><span className="mt-0.5 text-kx-accent">{icon}</span><span><span className="block text-xs font-bold text-kx-muted">{label}</span><span className="mt-0.5 block break-all text-sm font-semibold text-kx-text">{value}</span></span></div>;
}
