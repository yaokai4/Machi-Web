"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { AppShell } from "@/components/shell/AppShell";
import { ProfileView } from "@/components/profile/ProfileView";
import { useSession } from "@/lib/store";
import { ErrorState, InlineLoading } from "@/components/design/States";

export default function HandlePage() {
  const params = useParams<{ handle: string }>();
  const handle = (params?.handle || "").replace(/^@/, "");
  const me = useSession((s) => s.user);
  const userQuery = useQuery({
    queryKey: ["user", handle],
    queryFn: () => api.userDetail(handle),
    enabled: !!handle,
  });
  return (
    <AppShell>
      {userQuery.isLoading ? (
        <InlineLoading />
      ) : userQuery.isError || !userQuery.data ? (
        <ErrorState title="无法打开主页" subtitle="用户可能不存在或已删除。" onRetry={() => userQuery.refetch()} />
      ) : (
        <ProfileView user={userQuery.data} isSelf={me?.id === userQuery.data.id} />
      )}
    </AppShell>
  );
}
