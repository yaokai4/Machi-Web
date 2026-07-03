"use client";

// 邀请裂变 通用邀请落地页 /i/{code}.
// - 未登录:自动跳转到 /register?ref={code}(预填邀请码),并渲染带 CTA 的落地卡作为兜底。
// - 已登录:提供「绑定这个邀请码」的动作(POST /api/referral/bind),每账号仅可绑定一次。
// 契约见 server_referral.referral_summary / bind_referral 与 server.py /api/referral/*。

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { CheckCircle2, Gift, Link2, Loader2, Sparkles, XCircle } from "lucide-react";
import { api } from "@/lib/api";
import { AppShell } from "@/components/shell/AppShell";
import { useSession, useToasts } from "@/lib/store";
import { useI18n } from "@/lib/i18n";
import { BrandMark, BrandText } from "@/components/marketing/BrandText";

export default function ReferralLandingPage() {
  const params = useParams<{ code: string }>();
  const { t } = useI18n();
  const router = useRouter();
  const status = useSession((s) => s.status);
  const pushToast = useToasts((s) => s.push);

  // Sanitize the path param to the same alphabet the backend mints codes with.
  const code = useMemo(() => {
    const raw = decodeURIComponent(String(params?.code || "")).trim();
    return raw.replace(/[^A-Za-z0-9]/g, "").slice(0, 24);
  }, [params?.code]);

  const registerHref = `/register?ref=${encodeURIComponent(code)}`;
  const loginHref = `/login?redirect=${encodeURIComponent(registerHref)}`;

  const [bindState, setBindState] = useState<"idle" | "binding" | "ok" | "noop">("idle");

  // Guests get bounced straight into registration with the code prefilled. The
  // card below still renders as a no-JS / slow-redirect fallback.
  useEffect(() => {
    if (status === "unauthed" && code) {
      router.replace(registerHref);
    }
  }, [status, code, router, registerHref]);

  const bind = async () => {
    if (!code || bindState === "binding") return;
    setBindState("binding");
    try {
      const res = await api.referralBind(code);
      if (res.bound) {
        setBindState("ok");
        pushToast({ kind: "success", message: t("referral_landing_bind_ok") });
      } else {
        setBindState("noop");
        pushToast({ kind: "info", message: t("referral_landing_bind_noop") });
      }
    } catch {
      setBindState("noop");
      pushToast({ kind: "error", message: t("referral_landing_bind_noop") });
    }
  };

  const codeLine = t("referral_landing_code").replace("{code}", code);

  return (
    <AppShell>
      <main className="mx-auto w-full max-w-kx-feed px-3 py-8 sm:px-4">
        <section className="kx-card overflow-hidden">
          <div className="mb-4 flex items-center gap-3">
            <BrandMark className="h-12 w-12 rounded-[16px] text-xl" />
            <div className="min-w-0">
              <div className="text-xl font-black tracking-tight">
                <BrandText>Machi</BrandText>
              </div>
              <p className="text-sm font-semibold text-kx-muted">{t("referral_landing_title")}</p>
            </div>
          </div>

          <p className="text-sm font-semibold leading-6 text-kx-subtle">{t("referral_landing_subtitle")}</p>

          {code ? (
            <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-kx-accent/10 px-3 py-1.5 text-sm font-black text-kx-accent ring-1 ring-kx-accent/20">
              <Gift className="h-4 w-4" />
              {codeLine}
            </div>
          ) : null}

          {/* Guest / resolving path — register & login CTAs (also the redirect fallback). */}
          {status === "unauthed" || status === "idle" || status === "loading" ? (
            <div className="mt-6 grid gap-2.5">
              <Link href={registerHref} className="kx-button-primary h-12 w-full justify-center text-base">
                <Sparkles className="h-4 w-4" />
                {t("referral_landing_cta_register")}
              </Link>
              <Link href={loginHref} className="kx-button-ghost h-11 w-full justify-center text-sm">
                {t("referral_landing_cta_login")}
              </Link>
            </div>
          ) : (
            /* Authed path — offer to late-bind the code. */
            <div className="mt-6">
              <div className="rounded-kx-lg border border-kx-stroke/60 bg-kx-soft/50 p-4">
                <h2 className="flex items-center gap-2 text-sm font-black text-kx-text">
                  <Link2 className="h-4 w-4 text-kx-accent" />
                  {t("referral_landing_bind_title")}
                </h2>
                <p className="mt-1.5 text-xs font-semibold leading-5 text-kx-muted">{t("referral_landing_bind_sub")}</p>

                {bindState === "ok" ? (
                  <div className="mt-3 flex items-center gap-2 rounded-kx-md bg-emerald-500/10 px-3 py-2.5 text-sm font-bold text-emerald-700 dark:text-emerald-300">
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                    {t("referral_landing_bind_ok")}
                  </div>
                ) : bindState === "noop" ? (
                  <div className="mt-3 flex items-center gap-2 rounded-kx-md bg-kx-soft px-3 py-2.5 text-sm font-semibold text-kx-subtle">
                    <XCircle className="h-4 w-4 shrink-0" />
                    {t("referral_landing_bind_noop")}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={bind}
                    disabled={!code || bindState === "binding"}
                    className="kx-button-primary mt-3 h-11 w-full justify-center text-sm disabled:opacity-60"
                  >
                    {bindState === "binding" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Gift className="h-4 w-4" />}
                    {t("referral_landing_bind_cta")}
                  </button>
                )}
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-center gap-4">
                <Link href="/home" className="text-sm font-bold text-kx-accent hover:underline">
                  {t("referral_landing_go_home")}
                </Link>
                <Link href="/my/referrals" className="text-sm font-bold text-kx-accent hover:underline">
                  {t("referral_landing_my_invites")}
                </Link>
              </div>
            </div>
          )}
        </section>
      </main>
    </AppShell>
  );
}
