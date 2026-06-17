import { Suspense } from "react";
import { AuthRouteFallback } from "@/components/auth/AuthRouteFallback";
import LoginClient from "./LoginClient";

export default function LoginPage() {
  return (
    <Suspense fallback={<AuthRouteFallback title="正在打开登录页" />}>
      <LoginClient />
    </Suspense>
  );
}
