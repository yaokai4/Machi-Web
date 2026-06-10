"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { useSession, useToasts } from "@/lib/store";
import { BrandMark, BrandText } from "@/components/marketing/BrandText";
import { detectAuthLocale } from "@/lib/authLocale";

const COPY = {
  zh: {
    loading: "正在完成 Google 登录…",
    denied: "Google 登录未完成，请重新尝试。",
    failed: "Google 登录已返回，但账号会话初始化失败。请重新尝试。",
    back: "返回登录",
    welcome: (name: string) => `欢迎回来，${name}`,
  },
  ja: {
    loading: "Google ログインを完了しています…",
    denied: "Google ログインが完了しませんでした。もう一度お試しください。",
    failed: "Google ログイン後のセッション初期化に失敗しました。もう一度お試しください。",
    back: "ログインへ戻る",
    welcome: (name: string) => `おかえりなさい、${name}`,
  },
  en: {
    loading: "Finishing Google sign-in…",
    denied: "Google sign-in was not completed. Please try again.",
    failed: "Google returned successfully, but the session could not be initialized.",
    back: "Back to login",
    welcome: (name: string) => `Welcome back, ${name}`,
  },
} as const;

function safeRedirectPath(raw: string | null) {
  if (!raw) return "/home";
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("://")) return "/home";
  return raw;
}

export default function GoogleCallbackPage() {
  return (
    <Suspense fallback={null}>
      <GoogleCallbackInner />
    </Suspense>
  );
}

function GoogleCallbackInner() {
  const router = useRouter();
  const search = useSearchParams();
  const setUser = useSession((s) => s.setUser);
  const pushToast = useToasts((s) => s.push);
  const error = search.get("error");
  const redirect = useMemo(() => safeRedirectPath(search.get("redirect")), [search]);
  const locale = useMemo(() => detectAuthLocale(), []);
  const copy = COPY[locale];
  const [message, setMessage] = useState<string>(error ? copy.denied : copy.loading);

  useEffect(() => {
    let cancelled = false;
    async function finish() {
      if (error) return;
      try {
        const user = await api.me();
        if (cancelled) return;
        setUser(user);
        pushToast({ kind: "success", message: copy.welcome(user.display_name) });
        router.replace(redirect);
      } catch {
        if (!cancelled) setMessage(copy.failed);
      }
    }
    void finish();
    return () => {
      cancelled = true;
    };
  }, [error, redirect, router, setUser, pushToast, copy]);

  const failed = Boolean(error || message === copy.failed);
  return (
    <main className="kx-auth-page grid min-h-dvh place-items-center px-4 py-10">
      <section className="w-full max-w-md rounded-[28px] border border-kx-stroke bg-kx-card p-6 text-center shadow-kx-glow">
        <BrandMark className="mx-auto h-14 w-14 rounded-[18px] text-2xl" />
        <h1 className="mt-4 text-2xl font-black text-kx-text"><BrandText>Machi</BrandText></h1>
        <div className="mt-5 flex items-center justify-center gap-2 text-sm font-bold text-kx-subtle">
          {failed ? <AlertCircle className="h-4 w-4 text-rose-500" /> : <Loader2 className="h-4 w-4 animate-spin text-kx-accent" />}
          <span>{message}</span>
        </div>
        {failed ? (
          <Link href={`/login?redirect=${encodeURIComponent(redirect)}`} className="kx-button-primary mt-6 inline-flex h-11 px-5">
            {copy.back}
          </Link>
        ) : null}
      </section>
    </main>
  );
}
