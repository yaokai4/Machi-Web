import { Suspense } from "react";
import { AuthRouteFallback } from "@/components/auth/AuthRouteFallback";
import RegisterClient from "./RegisterClient";

export default function RegisterPage() {
  return (
    <Suspense fallback={<AuthRouteFallback title="正在打开注册页" />}>
      <RegisterClient />
    </Suspense>
  );
}
