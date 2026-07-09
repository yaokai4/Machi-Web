"use client";

// 统一的后台角色门控。全站 /admin/* 页面此前门控不一致:一部分自己内联了
// `user.role !== "admin"` 判断,另一部分只靠 AppShell 的 requireAuth(仅拦
// 未登录),导致任意已登录普通用户都能完整渲染后台骨架并发起 admin API,防御
// 纵深完全压在后端每个端点上。把 loading / denied / 未登录跳转逻辑收敛到这里,
// 让所有后台路由走同一套门控,同时避免非管理员触发后台数据请求。
//
// 用法:把页面主体拆成一个内容组件,用 <AdminGuard> 包裹即可 —— 未授权时内容
// 组件根本不会挂载,其内部的 admin useQuery 也就不会发出。
//
//   export default function AdminXxxPage() {
//     return (
//       <AdminGuard>
//         <AdminXxxContent />
//       </AdminGuard>
//     );
//   }
//
// 后台是面向运营的内部工具,文案沿用既有后台一致的中文(与 admin/page.tsx、
// GuideAdminShell 等保持统一),不接入三语用户界面通道。

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { AppShell } from "@/components/shell/AppShell";
import { InlineLoading } from "@/components/design/States";
import { useSession } from "@/lib/store";
import type { KXUser } from "@/lib/types";

export function useAdminGuard(redirect = "/admin") {
  const router = useRouter();
  const user = useSession((s) => s.user) as KXUser | null;
  const status = useSession((s) => s.status);
  const loading = status === "loading" || status === "idle";
  const isAdmin = !loading && !!user && user.role === "admin";
  // 只有在明确知道用户身份后(非 loading)且不是管理员时才判定 denied,避免
  // 会话引导期把 403 闪给真正的管理员。
  const denied = !loading && status !== "degraded" && (!user || user.role !== "admin");
  const login = () => router.replace(`/login?redirect=${encodeURIComponent(redirect)}`);
  return { user, status, loading, denied, isAdmin, login };
}

export function AdminGuard({
  children,
  redirect = "/admin",
}: {
  children: React.ReactNode;
  redirect?: string;
}) {
  const router = useRouter();
  const { user, status, loading, isAdmin } = useAdminGuard(redirect);

  // 未登录 → 跳登录并带回跳地址;和 admin/page.tsx 现有行为保持一致。
  useEffect(() => {
    if (status === "unauthed") router.replace(`/login?redirect=${encodeURIComponent(redirect)}`);
  }, [status, router, redirect]);

  // 会话身份尚未确定时(引导中 / 未登录正在跳转 / 探活降级但还不知道是谁),
  // 渲染带骨架的加载态而非「无权访问」,避免把 403 闪给可能是管理员的用户。
  const sessionUnknown = loading || status === "unauthed" || (status === "degraded" && !user);
  if (sessionUnknown) {
    return (
      <AppShell right={null} wide>
        <InlineLoading />
      </AppShell>
    );
  }

  if (!isAdmin) {
    return (
      <AppShell right={null} wide>
        <div className="px-6 py-16 text-center">
          <div className="mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-kx-danger/10 text-kx-danger">
            <AlertCircle className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-bold">无权访问</h1>
          <p className="mt-1 text-sm text-kx-subtle">这个页面仅限管理员。</p>
          <Link href="/home" className="kx-button-primary mt-4 inline-flex">回首页</Link>
        </div>
      </AppShell>
    );
  }

  return <>{children}</>;
}
