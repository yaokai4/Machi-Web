"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Dialog } from "@/components/design/Dialog";
import { useAuthPrompt, AUTH_PROMPT_KEYS } from "@/lib/store";
import { useI18n, type I18nKey } from "@/lib/i18n";

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
  const { t } = useI18n();
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

  // Literal overrides win; otherwise resolve the keyed copy for the prompt kind.
  const keys = prompt ? AUTH_PROMPT_KEYS[prompt.kind] : null;
  const title = prompt?.title ?? (keys ? t(keys.titleKey as I18nKey) : undefined);
  const body = prompt?.body ?? (keys ? t(keys.bodyKey as I18nKey) : undefined);

  return (
    <Dialog
      open={!!prompt}
      onClose={close}
      title={title}
      footer={
        <>
          <button type="button" className="kx-button-ghost" onClick={close}>
            {t("auth_prompt_later")}
          </button>
          <Link className="kx-button-ghost" href={links.register} onClick={close}>
            {t("register")}
          </Link>
          <Link className="kx-button-primary" href={links.login} onClick={close}>
            {t("login")}
          </Link>
        </>
      }
    >
      <p className="text-sm leading-relaxed text-kx-subtle">{body}</p>
    </Dialog>
  );
}
