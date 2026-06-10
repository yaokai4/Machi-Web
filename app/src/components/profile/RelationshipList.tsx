"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, UserCheck, UserPlus, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, APIError, isAuthRequiredError } from "@/lib/api";
import { AppShell } from "@/components/shell/AppShell";
import { Avatar, VerifiedBadge } from "@/components/design/Avatar";
import { EmptyState, ErrorState, InlineLoading } from "@/components/design/States";
import { useAuthPrompt, useSession, useToasts } from "@/lib/store";
import type { KXUser } from "@/lib/types";
import { showVerifiedBadge } from "@/lib/types";

interface RelationshipListProps {
  handle: string;
  kind: "followers" | "following";
}

export function RelationshipList({ handle, kind }: RelationshipListProps) {
  const me = useSession((s) => s.user);
  const openAuthPrompt = useAuthPrompt((s) => s.open);
  const pushToast = useToasts((s) => s.push);
  const router = useRouter();

  const target = useQuery({
    queryKey: ["user", handle],
    queryFn: () => api.userDetail(handle),
    enabled: !!handle,
  });

  const listQuery = useQuery<KXUser[]>({
    queryKey: ["relationship", handle, kind],
    queryFn: () => (kind === "followers" ? api.followers(handle) : api.following(handle)),
    enabled: !!handle,
  });

  const [following, setFollowing] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const toggle = async (uid: string, current: boolean) => {
    if (!me) {
      openAuthPrompt("follow");
      return;
    }
    const next = !current;
    setFollowing((prev) => ({ ...prev, [uid]: next }));
    setBusy(uid);
    try {
      await api.follow(uid, next);
    } catch (e) {
      setFollowing((prev) => ({ ...prev, [uid]: current }));
      if (isAuthRequiredError(e)) {
        openAuthPrompt("follow");
        return;
      }
      pushToast({ kind: "error", message: (e as APIError).message });
    } finally {
      setBusy(null);
    }
  };

  const title = kind === "followers" ? "粉丝" : "关注";

  return (
    <AppShell requireAuth={false}>
      <header className="sticky top-0 z-30 kx-glass-bar px-3 py-2 flex items-center gap-2">
        <button onClick={() => router.back()} className="kx-button-ghost h-9 w-9 p-0" aria-label="返回">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <h1 className="font-semibold leading-tight">{target.data?.display_name || handle}</h1>
          <div className="text-xs text-kx-muted">{title}</div>
        </div>
      </header>

      {listQuery.isLoading ? (
        <InlineLoading />
      ) : listQuery.isError ? (
        <ErrorState onRetry={() => listQuery.refetch()} />
      ) : !listQuery.data || listQuery.data.length === 0 ? (
        <EmptyState
          title={kind === "followers" ? "还没有粉丝" : "还没有关注任何人"}
          subtitle={kind === "followers" ? "发布更多内容会吸引到更多读者。" : "去发现页找些感兴趣的账号吧。"}
          icon={Users}
        />
      ) : (
        <ul className="divide-y divide-kx-stroke/30">
          {listQuery.data.map((u) => {
            const isFollowingNow = following[u.id] ?? u.is_following ?? false;
            const isSelf = me?.id === u.id;
            return (
              <li key={u.id} className="px-3 sm:px-4 py-3 flex items-start gap-3 hover:bg-kx-soft/60">
                <Avatar user={u} size={44} href={`/u/${u.handle}`} />
                <div className="flex-1 min-w-0">
                  <Link href={`/u/${u.handle}`} className="font-semibold inline-flex items-center gap-1 hover:underline">
                    {u.display_name}
                    {showVerifiedBadge(u) ? <VerifiedBadge /> : null}
                    {u.is_mutual || (u.follows_viewer && (following[u.id] ?? u.is_following)) ? (
                      <span className="rounded-full bg-kx-accent/10 px-1.5 py-0.5 text-[10px] font-bold text-kx-accent">互相关注</span>
                    ) : u.follows_viewer ? (
                      <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-500 dark:bg-white/10 dark:text-slate-300">关注了你</span>
                    ) : null}
                  </Link>
                  <div className="text-xs text-kx-muted">@{u.handle}</div>
                  {u.bio ? <p className="text-sm text-kx-subtle line-clamp-2 mt-1">{u.bio}</p> : null}
                </div>
                {!isSelf ? (
                  <button
                    className={isFollowingNow ? "kx-button-ghost h-8 px-3 text-xs" : "kx-button-primary h-8 px-3 text-xs"}
                    onClick={() => toggle(u.id, isFollowingNow)}
                    disabled={busy === u.id}
                  >
                    {isFollowingNow ? (
                      <><UserCheck className="w-3.5 h-3.5" /> 已关注</>
                    ) : (
                      <><UserPlus className="w-3.5 h-3.5" /> 关注</>
                    )}
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </AppShell>
  );
}
