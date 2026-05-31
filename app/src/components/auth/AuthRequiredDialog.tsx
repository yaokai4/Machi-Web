"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Dialog } from "@/components/design/Dialog";
import { useAuthPrompt } from "@/lib/store";

function currentRedirectPath() {
  if (typeof window === "undefined") return "/";
  const candidate = `${window.location.pathname}${window.location.search}`;
  if (!candidate.startsWith("/") || candidate.startsWith("//")) return "/";
  return candidate;
}

export function authRedirectHref(target: "/login" | "/register", redirect: string) {
  const safeRedirect = redirect.startsWith("/") && !redirect.startsWith("//") ? redirect : "/";
  return `${target}?redirect=${encodeURIComponent(safeRedirect)}`;
}

export function AuthRequiredDialog() {
  const pathname = usePathname();
  const prompt = useAuthPrompt((s) => s.prompt);
  const close = useAuthPrompt((s) => s.close);
  const [redirect, setRedirect] = useState("/");

  useEffect(() => {
    setRedirect(currentRedirectPath());
  }, [pathname, prompt]);

  const links = useMemo(
    () => ({
      login: authRedirectHref("/login", redirect),
      register: authRedirectHref("/register", redirect),
    }),
    [redirect],
  );

  return (
    <Dialog
      open={!!prompt}
      onClose={close}
      title={prompt?.title}
      footer={
        <>
          <button type="button" className="kx-button-ghost" onClick={close}>
            稍后再说
          </button>
          <Link className="kx-button-ghost" href={links.register} onClick={close}>
            注册
          </Link>
          <Link className="kx-button-primary" href={links.login} onClick={close}>
            登录
          </Link>
        </>
      }
    >
      <p className="text-sm leading-relaxed text-kx-subtle">{prompt?.body}</p>
    </Dialog>
  );
}
