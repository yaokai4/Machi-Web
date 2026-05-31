"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/shell/AppShell";
import { ProfileView } from "@/components/profile/ProfileView";
import { useSession } from "@/lib/store";
import { InlineLoading } from "@/components/design/States";

export default function MePage() {
  const user = useSession((s) => s.user);
  const status = useSession((s) => s.status);
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthed") router.replace("/login?redirect=/me");
  }, [status, router]);

  if (!user) {
    return (
      <AppShell>
        <InlineLoading />
      </AppShell>
    );
  }
  return (
    <AppShell>
      <ProfileView user={user} isSelf />
    </AppShell>
  );
}
