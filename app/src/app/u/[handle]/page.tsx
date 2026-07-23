"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { AppShell } from "@/components/shell/AppShell";
import { ProfileView } from "@/components/profile/ProfileView";
import { useSession } from "@/lib/store";
import { ErrorState, InlineLoading } from "@/components/design/States";
import { useI18n, type Locale } from "@/lib/i18n";

// Local three-language copy (same pattern as PostCard.localize) — the error
// state previously shipped hardcoded Simplified Chinese to ja/en users.
function localize(locale: Locale, zhHans: string, zhHant: string, en: string, ja: string): string {
  switch (locale) {
    case "en":
      return en;
    case "ja":
      return ja;
    case "zh-Hant":
      return zhHant;
    default:
      return zhHans;
  }
}

export default function HandlePage() {
  const params = useParams<{ handle: string }>();
  const handle = (params?.handle || "").replace(/^@/, "");
  const me = useSession((s) => s.user);
  const { locale } = useI18n();
  const userQuery = useQuery({
    queryKey: ["user", handle],
    queryFn: () => api.userDetail(handle),
    enabled: !!handle,
  });
  return (
    <AppShell requireAuth={false}>
      {userQuery.isLoading ? (
        <InlineLoading />
      ) : userQuery.isError || !userQuery.data ? (
        <ErrorState
          title={localize(locale, "无法打开主页", "無法開啟主頁", "Couldn't open this profile", "プロフィールを開けません")}
          subtitle={localize(
            locale,
            "用户可能不存在或已删除。",
            "用戶可能不存在或已刪除。",
            "This user may not exist or has been deleted.",
            "このユーザーは存在しないか、削除された可能性があります。",
          )}
          onRetry={() => userQuery.refetch()}
        />
      ) : (
        <ProfileView user={userQuery.data} isSelf={me?.id === userQuery.data.id} />
      )}
    </AppShell>
  );
}
