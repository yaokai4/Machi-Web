"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  AlertCircle,
  Compass,
  Eye,
  EyeOff,
  Languages,
  Loader2,
  LogIn,
  MapPin,
  Megaphone,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { api, APIError } from "@/lib/api";
import { useSession, useToasts } from "@/lib/store";
import { BrandMark, BrandText } from "@/components/marketing/BrandText";
import { FieldShell } from "@/components/design/FieldShell";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";
import { CaptchaBox, EMPTY_CAPTCHA, type CaptchaState } from "@/components/auth/CaptchaBox";
import { normalizeHandle, validateLogin } from "@/lib/authValidation";
import { AUTH_COPY, AUTH_LOCALE_KEY, AUTH_LOCALE_OPTIONS, detectAuthLocale, type AuthLocale } from "@/lib/authLocale";

export default function LoginClient() {
  return <LoginForm />;
}

// Translates backend error codes / status into something the user can
// act on instead of the raw "请求失败 (401)".
function mapLoginError(err: unknown, c: (typeof AUTH_COPY)[AuthLocale]): { field?: "handle" | "password" | "captcha"; message: string } {
  if (err instanceof APIError) {
    if (err.code === "captcha_required") {
      return { field: "captcha", message: c.captchaRequired };
    }
    if (err.code === "invalid_captcha" || err.code === "captcha_expired") {
      return { field: "captcha", message: err.message || c.invalidCaptcha };
    }
    if (err.status === 401 || err.code === "invalid_credentials") {
      return { field: "password", message: c.loginInvalid };
    }
    if (err.status === 404 || err.code === "user_not_found") {
      return { field: "handle", message: c.userNotFound };
    }
    if (err.status === 429 || err.code === "rate_limited") {
      return { message: c.rateLimited };
    }
    if (err.status === 0 || err.code === "network_error") {
      return { message: c.network };
    }
    if (err.code === "timeout") {
      return { message: c.timeout };
    }
    if (err.message) return { message: err.message };
  }
  return { message: c.loginFailed };
}

function safeRedirectPath(raw: string | null) {
  if (!raw) return "/home";
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("://")) return "/home";
  return raw;
}

function LoginForm() {
  const router = useRouter();
  const search = useSearchParams();
  const setUser = useSession((s) => s.setUser);
  const status = useSession((s) => s.status);
  const pushToast = useToasts((s) => s.push);
  const [handle, setHandle] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [locale, setLocale] = useState<AuthLocale>(() => detectAuthLocale());
  const [serverError, setServerError] = useState<{ field?: "handle" | "password" | "captcha"; message: string } | null>(null);
  const [touched, setTouched] = useState<{ handle: boolean; password: boolean }>({ handle: false, password: false });
  const [captcha, setCaptcha] = useState<CaptchaState>(EMPTY_CAPTCHA);
  // Bumped after every attempt: the server burns the challenge per submission.
  const [captchaRefresh, setCaptchaRefresh] = useState(0);
  const [captchaFocus, setCaptchaFocus] = useState(0);
  const handleCaptchaState = useCallback((state: CaptchaState) => setCaptcha(state), []);
  const redirect = useMemo(() => safeRedirectPath(search.get("redirect") || search.get("next")), [search]);
  const c = AUTH_COPY[locale];
  // Admin-editable login announcement (site_settings.login_announcement).
  // Empty string = nothing rendered.
  const [announcement, setAnnouncement] = useState("");
  useEffect(() => {
    let alive = true;
    api
      .siteSettings()
      .then((s) => {
        if (alive) setAnnouncement((s.login_announcement || "").trim());
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  const announcementLabel = locale === "en" ? "Announcement" : locale === "ja" ? "お知らせ" : "公告";

  const changeLocale = (next: AuthLocale) => {
    setLocale(next);
    try {
      window.localStorage.setItem(AUTH_LOCALE_KEY, next);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (status === "authed") {
      router.replace(redirect);
    }
  }, [status, router, redirect]);

  const errors = useMemo(() => {
    return validateLogin({ handle, password }, touched, locale);
  }, [handle, password, touched, locale]);

  const isValid = normalizeHandle(handle).length > 0 && password.length > 0;
  const canSubmit = !loading;

  const submit = async () => {
    setTouched({ handle: true, password: true });
    const _h = normalizeHandle(handle);
    const _p = password;
    if (!isValid) return;
    if (captcha.enabled && captcha.captchaId && !captcha.code) {
      setServerError({ field: "captcha", message: c.captchaRequired });
      return;
    }
    setLoading(true);
    setServerError(null);
    try {
      const { user } = await api.login(
        _h,
        _p,
        captcha.enabled && captcha.captchaId
          ? { captcha_id: captcha.captchaId, captcha_code: captcha.code }
          : undefined,
      );
      setUser(user);
      pushToast({ kind: "success", message: c.welcomeBack(user.display_name) });
      router.replace(redirect);
    } catch (err) {
      const mapped = mapLoginError(err, c);
      setServerError(mapped);
      // Every attempt consumes the challenge server-side — show a fresh one and,
      // when a captcha is enforced, pull focus back so re-entry is obvious.
      setCaptchaRefresh((v) => v + 1);
      if (captcha.enabled && captcha.captchaId) setCaptchaFocus((v) => v + 1);
    } finally {
      setLoading(false);
    }
  };

  const startGoogleLogin = async () => {
    setGoogleLoading(true);
    setServerError(null);
    try {
      const result = await api.googleAuthStart("web", redirect);
      window.location.href = result.authorization_url || result.url || "";
    } catch {
      setServerError({ message: c.googleError });
      setGoogleLoading(false);
    }
  };

  const fieldError = (name: "handle" | "password"): string | undefined => {
    if (errors[name]) return errors[name];
    if (serverError?.field === name) return serverError.message;
    return undefined;
  };

  return (
    <div className="kx-auth-page px-4 py-6 sm:py-10">
      <div className="mx-auto grid min-h-[calc(100dvh-3rem)] w-full max-w-5xl overflow-hidden rounded-[28px] border border-kx-stroke/70 bg-kx-card shadow-kx-glow lg:grid-cols-[0.9fr_1.1fr]">
        {/* ─────────── LEFT brand pane — soft layered pastel mesh, light & airy ─────────── */}
        <aside
          className="relative hidden flex-col justify-between overflow-hidden p-9 lg:flex"
          style={{
            background: [
              "radial-gradient(at 16% 10%, rgba(56,199,154,0.20) 0px, transparent 46%)",
              "radial-gradient(at 84% 6%, rgba(120,196,255,0.16) 0px, transparent 44%)",
              "radial-gradient(at 78% 86%, rgba(255,178,138,0.18) 0px, transparent 46%)",
              "radial-gradient(at 22% 82%, rgba(108,220,182,0.22) 0px, transparent 50%)",
              "radial-gradient(at 50% 50%, rgba(196,232,255,0.10) 0px, transparent 60%)",
              "linear-gradient(160deg, #FBFDFB 0%, #F3FAF6 48%, #FCF7F2 100%)",
            ].join(", "),
          }}
        >
          {/* Soft floating colour orbs layered on top for depth (very light). */}
          <div className="pointer-events-none absolute -left-20 top-10 h-64 w-64 rounded-full opacity-60 blur-3xl" style={{ background: "radial-gradient(circle, rgba(56,199,154,0.30), transparent 70%)" }} aria-hidden="true" />
          <div className="pointer-events-none absolute -right-16 bottom-24 h-72 w-72 rounded-full opacity-50 blur-3xl" style={{ background: "radial-gradient(circle, rgba(255,186,150,0.28), transparent 70%)" }} aria-hidden="true" />

          <div className="relative">
            <div className="inline-flex items-center gap-3">
              <BrandMark className="h-14 w-14 rounded-[18px] text-2xl shadow-[0_16px_36px_-18px_rgba(20,112,103,0.55)]" />
              <div>
                <div className="text-3xl font-black tracking-tight"><BrandText>Machi</BrandText></div>
                <p className="mt-1 text-sm font-semibold text-kx-subtle">{c.brandTagline}</p>
              </div>
            </div>

            <ul className="mt-10 space-y-3.5">
              {[
                { Icon: MapPin, title: c.leftLoginItems[0][0], body: c.leftLoginItems[0][1] },
                { Icon: Compass, title: c.leftLoginItems[1][0], body: c.leftLoginItems[1][1] },
                { Icon: Sparkles, title: c.leftLoginItems[2][0], body: c.leftLoginItems[2][1] },
                { Icon: ShieldCheck, title: c.leftLoginItems[3][0], body: c.leftLoginItems[3][1] },
              ].map(({ Icon, title, body }) => (
                <li key={title} className="flex items-start gap-3 rounded-2xl border border-white/60 bg-white/45 p-3 shadow-[0_10px_30px_-24px_rgba(15,23,42,0.45)] backdrop-blur-sm">
                  <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-kx-accent/12 text-kx-accent ring-1 ring-kx-accent/20">
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-black text-kx-text">{title}</p>
                    <p className="mt-0.5 text-[13px] leading-5 text-kx-subtle">{body}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="relative space-y-3">
            {announcement ? (
              <div className="rounded-kx-lg border border-kx-accent/25 bg-white/65 p-4 shadow-[0_12px_34px_-26px_rgba(15,23,42,0.5)] backdrop-blur-sm">
                <div className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.16em] text-kx-accent">
                  <Megaphone className="h-3.5 w-3.5" />
                  {announcementLabel}
                </div>
                <p className="mt-2 whitespace-pre-line text-sm font-semibold leading-6 text-kx-text/85">{announcement}</p>
              </div>
            ) : null}
            <div className="rounded-kx-lg border border-white/60 bg-white/45 p-4 shadow-[0_12px_34px_-26px_rgba(15,23,42,0.5)] backdrop-blur-sm">
              <div className="text-[11px] font-black uppercase tracking-[0.16em] text-kx-accent">{c.cityFirstFeed}</div>
              <p className="mt-2 text-sm font-semibold leading-6 text-kx-subtle">
                {c.cityFirstBody}
              </p>
            </div>
          </div>
        </aside>

        {/* ─────────── RIGHT form pane ─────────── */}
        <div className="flex flex-col justify-center px-5 py-7 sm:px-8 lg:px-10">
          <header className="mb-6">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 lg:hidden">
              <BrandMark className="h-12 w-12 rounded-[16px] text-xl" />
              <div>
                <div className="text-2xl font-black tracking-tight"><BrandText>Machi</BrandText></div>
                <p className="text-sm font-semibold text-kx-subtle">{c.brandTagline}</p>
              </div>
              </div>
              <label className="ml-auto inline-flex items-center gap-2 rounded-full bg-kx-soft px-3 py-2 text-xs font-bold text-kx-subtle ring-1 ring-kx-stroke/70">
                <Languages className="h-3.5 w-3.5" />
                <span className="sr-only">{c.localeLabel}</span>
                <select
                  value={locale}
                  onChange={(event) => changeLocale(event.target.value as AuthLocale)}
                  className="bg-transparent font-bold outline-none"
                  aria-label={c.localeLabel}
                >
                  {AUTH_LOCALE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              </div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-kx-accent">{c.signInEyebrow}</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-kx-text sm:text-4xl">{c.loginTitle}</h1>
            <p className="mt-2 text-sm font-semibold leading-6 text-kx-subtle">
              {c.loginSubtitle}
            </p>
          </header>

          {announcement ? (
            <div className="mb-4 rounded-kx-lg border border-kx-accent/30 bg-kx-accent/[0.08] p-3.5 lg:hidden">
              <div className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.16em] text-kx-accent">
                <Megaphone className="h-3.5 w-3.5" />
                {announcementLabel}
              </div>
              <p className="mt-1.5 whitespace-pre-line text-sm font-semibold leading-6 text-kx-text">{announcement}</p>
            </div>
          ) : null}

          <GoogleSignInButton
            label={c.google}
            loadingLabel={c.googleLoading}
            loading={googleLoading}
            onClick={startGoogleLogin}
          />

          <div className="my-5 flex items-center gap-3">
            <span className="h-px flex-1 bg-kx-stroke/70" />
            <span className="text-[11px] font-black uppercase tracking-[0.16em] text-kx-muted">{c.orContinue}</span>
            <span className="h-px flex-1 bg-kx-stroke/70" />
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
            className="space-y-4"
            noValidate
            aria-busy={loading}
          >
            {/* Top-of-form banner for non-field errors */}
            {serverError && !serverError.field ? (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-2xl bg-rose-50 px-3 py-2.5 text-sm font-bold text-rose-700 ring-1 ring-rose-100 dark:bg-rose-500/10 dark:text-rose-200 dark:ring-rose-400/20"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{serverError.message}</span>
              </div>
            ) : null}

            <FieldShell label={c.loginIdentifier} htmlFor="login-handle" error={fieldError("handle")}>
              <input
                id="login-handle"
                className="kx-input"
                autoFocus
                autoComplete="username"
                inputMode="text"
                spellCheck={false}
                placeholder={c.loginUsernamePlaceholder}
                value={handle}
                onChange={(e) => {
                  setHandle(e.target.value);
                  if (serverError) setServerError(null);
                }}
                onBlur={() => setTouched((t) => ({ ...t, handle: true }))}
                aria-invalid={!!fieldError("handle") || undefined}
                aria-describedby={fieldError("handle") ? "login-handle-error" : undefined}
              />
            </FieldShell>

            <FieldShell label={c.password} htmlFor="login-password" error={fieldError("password")}>
              <div className="relative">
                <input
                  id="login-password"
                  className="kx-input pr-10"
                  type={showPw ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (serverError) setServerError(null);
                  }}
                  onBlur={() => setTouched((t) => ({ ...t, password: true }))}
                  aria-invalid={!!fieldError("password") || undefined}
                  aria-describedby={fieldError("password") ? "login-password-error" : undefined}
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-2 text-kx-muted hover:bg-kx-soft hover:text-kx-text"
                  aria-label={showPw ? "Hide password" : "Show password"}
                  tabIndex={-1}
                >
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </FieldShell>

            <CaptchaBox
              scene="login"
              idPrefix="login"
              error={serverError?.field === "captcha" ? serverError.message : undefined}
              refreshSignal={captchaRefresh}
              focusSignal={captchaFocus}
              onState={handleCaptchaState}
              labels={{
                label: c.captcha,
                placeholder: c.captchaPlaceholder,
                hint: c.captchaHint,
                refresh: c.captchaRefresh,
                loadFailed: c.captchaLoadFailed,
              }}
            />

            <button
              type="submit"
              className="kx-button-primary h-12 w-full text-base disabled:opacity-60"
              disabled={!canSubmit}
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
              <span>{loading ? c.loginLoading : c.loginButton}</span>
            </button>
          </form>

          <div className="mt-5 text-center text-sm text-kx-subtle">
            {c.noAccount}
            <Link className="kx-link ml-1 font-bold" href={`/register?redirect=${encodeURIComponent(redirect)}`}>{c.createNow}</Link>
          </div>
          <div className="mt-5 flex items-center justify-center gap-3 text-xs text-kx-muted">
            <Link href="/legal/terms" className="hover:underline">{c.termsLink}</Link>
            <span>·</span>
            <Link href="/legal/privacy" className="hover:underline">{c.privacyLink}</Link>
            <span>·</span>
            <Link href="/forgot" className="hover:underline">{c.forgot}</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
