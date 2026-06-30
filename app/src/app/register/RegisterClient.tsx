"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Eye,
  EyeOff,
  Languages,
  Loader2,
  Mail,
  MapPin,
  UserPlus,
} from "lucide-react";
import { api, APIError } from "@/lib/api";
import { useSession, useToasts } from "@/lib/store";
import { safeRedirectPath } from "@/lib/safeRedirect";
import { BrandMark, BrandText } from "@/components/marketing/BrandText";
import { RegionPickerDialog } from "@/components/feed/RegionPickerDialog";
import { regionDisplayName, type RegionInfo } from "@/lib/regions";
import { FieldShell, PasswordStrength } from "@/components/design/FieldShell";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";
import { CaptchaBox, EMPTY_CAPTCHA, type CaptchaState } from "@/components/auth/CaptchaBox";
import {
  EMAIL_RE,
  HANDLE_RE,
  PASSWORD_MIN,
  RESERVED_HANDLES,
  isRegisterValid,
  sanitizeRegisterHandle,
  validateRegister,
} from "@/lib/authValidation";
import { AUTH_COPY, AUTH_LOCALE_KEY, AUTH_LOCALE_OPTIONS, detectAuthLocale, type AuthLocale } from "@/lib/authLocale";

type Errors = Partial<Record<"handle" | "displayName" | "email" | "password" | "code" | "terms" | "region" | "captcha", string>>;
type Availability = { status: "idle" | "checking" | "available" | "unavailable"; message: string };

// Maps backend errors into a field + friendly message. The server has
// codes for the common cases — `handle_taken`, `weak_password`,
// `invalid_email` — and we surface them at the matching field instead
// of a vague toast.
function mapRegisterError(err: unknown, c: (typeof AUTH_COPY)[AuthLocale]): { field?: keyof Errors; message: string } {
  if (err instanceof APIError) {
    if (err.code === "handle_taken" || /already.*(taken|exists)/i.test(err.message)) {
      return { field: "handle", message: c.handleTaken };
    }
    if (err.code === "invalid_handle" || /handle/i.test(err.message)) {
      return { field: "handle", message: c.invalidHandle };
    }
    if (err.code === "reserved_handle") {
      return { field: "handle", message: c.reservedHandle };
    }
    if (err.code === "weak_password") {
      return { field: "password", message: c.weakPassword };
    }
    if (err.code === "invalid_email") {
      return { field: "email", message: c.invalidEmail };
    }
    if (err.code === "email_taken") {
      return { field: "email", message: c.emailTaken };
    }
    if (err.code === "invalid_code" || err.code === "code_expired") {
      return { field: "code", message: err.message || c.invalidCode };
    }
    if (err.code === "captcha_required") {
      return { field: "captcha", message: c.captchaRequired };
    }
    if (err.code === "invalid_captcha" || err.code === "captcha_expired") {
      return { field: "captcha", message: err.message || c.invalidCaptcha };
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
  return { message: c.registerFailed };
}

export default function RegisterClient() {
  return <RegisterForm />;
}

function RegisterForm() {
  const router = useRouter();
  const search = useSearchParams();
  const setUser = useSession((s) => s.setUser);
  const status = useSession((s) => s.status);
  const pushToast = useToasts((s) => s.push);
  const [handle, setHandle] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [selectedRegion, setSelectedRegion] = useState<RegionInfo | null>(null);
  const [regionOpen, setRegionOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [locale, setLocale] = useState<AuthLocale>(() => detectAuthLocale());
  const [sendingCode, setSendingCode] = useState(false);
  const [codeCooldown, setCodeCooldown] = useState(0);
  const [handleAvailability, setHandleAvailability] = useState<Availability>({ status: "idle", message: "" });
  const [emailAvailability, setEmailAvailability] = useState<Availability>({ status: "idle", message: "" });
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [serverError, setServerError] = useState<{ field?: keyof Errors; message: string } | null>(null);
  const [captcha, setCaptcha] = useState<CaptchaState>(EMPTY_CAPTCHA);
  // Bumped only when a challenge is actually rejected — the server burns it on
  // a failed verify, so a retry needs a fresh image. A *successful* send keeps
  // the user's input intact (the collapsed "verified" badge below).
  const [captchaRefresh, setCaptchaRefresh] = useState(0);
  // Bumped to pull keyboard focus back to the captcha after a rejection.
  const [captchaFocus, setCaptchaFocus] = useState(0);
  // Once the email code is sent the captcha is spent; show a confirmation badge
  // instead of re-prompting. A resend (cooldown end) re-arms a fresh challenge.
  const [captchaVerified, setCaptchaVerified] = useState(false);
  // Secondary note on the captcha row when a non-captcha failure still forced a
  // refresh (e.g. rate limit) — tells the user the cleared field is expected.
  const [captchaNote, setCaptchaNote] = useState("");
  const handleCaptchaState = useCallback((state: CaptchaState) => {
    setCaptcha(state);
    if (state.code) setCaptchaNote("");
  }, []);
  const redirect = useMemo(() => safeRedirectPath(search.get("redirect") || search.get("next")), [search]);
  const c = AUTH_COPY[locale];

  const changeLocale = (next: AuthLocale) => {
    setLocale(next);
    try {
      window.localStorage.setItem(AUTH_LOCALE_KEY, next);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (status === "authed") router.replace(redirect);
  }, [status, router, redirect]);

  useEffect(() => {
    if (codeCooldown <= 0) {
      // Cooldown ended: a resend needs a brand-new challenge (the prior one was
      // consumed), so drop the "verified" badge to remount a fresh captcha.
      if (captchaVerified) setCaptchaVerified(false);
      return;
    }
    const timer = window.setTimeout(() => setCodeCooldown((v) => Math.max(0, v - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [codeCooldown, captchaVerified]);

  useEffect(() => {
    const value = handle.trim();
    if (!value || !HANDLE_RE.test(value) || RESERVED_HANDLES.has(value)) {
      setHandleAvailability({ status: "idle", message: "" });
      return;
    }
    setHandleAvailability({ status: "checking", message: locale === "ja" ? "ユーザー名を確認しています…" : locale === "en" ? "Checking username…" : "正在检查用户名…" });
    const timer = window.setTimeout(() => {
      api.checkUsername(value)
        .then((res) => setHandleAvailability({ status: res.available ? "available" : "unavailable", message: res.message }))
        .catch(() => setHandleAvailability({ status: "idle", message: "" }));
    }, 450);
    return () => window.clearTimeout(timer);
  }, [handle, locale]);

  useEffect(() => {
    const value = email.trim();
    if (!value || !EMAIL_RE.test(value)) {
      setEmailAvailability({ status: "idle", message: "" });
      return;
    }
    setEmailAvailability({ status: "checking", message: locale === "ja" ? "メールを確認しています…" : locale === "en" ? "Checking email…" : "正在检查邮箱…" });
    const timer = window.setTimeout(() => {
      api.checkEmail(value)
        .then((res) => setEmailAvailability({ status: res.available ? "available" : "unavailable", message: res.message }))
        .catch(() => setEmailAvailability({ status: "idle", message: "" }));
    }, 450);
    return () => window.clearTimeout(timer);
  }, [email, locale]);

  const errors: Errors = useMemo(() => {
    return validateRegister(
      { handle, displayName, email, password, confirmPassword, code, acceptedTerms, hasRegion: !!selectedRegion },
      touched,
      locale,
    );
  }, [touched, handle, displayName, email, password, confirmPassword, code, acceptedTerms, selectedRegion, locale]);

  const isValid = isRegisterValid({ handle, displayName, email, password, confirmPassword, code, acceptedTerms, hasRegion: !!selectedRegion });
  const canSubmit =
    !loading &&
    isValid &&
    handleAvailability.status === "available" &&
    emailAvailability.status === "available";

  const fieldError = (k: keyof Errors): string | undefined => {
    if (errors[k]) return errors[k];
    if (serverError?.field === k) return serverError.message;
    if (k === "handle" && handleAvailability.status === "unavailable") return handleAvailability.message;
    if (k === "email" && emailAvailability.status === "unavailable") return emailAvailability.message;
    return undefined;
  };

  const fieldSuccess = (k: "handle" | "email"): string | undefined => {
    const state = k === "handle" ? handleAvailability : emailAvailability;
    if (state.status === "available") return state.message;
    if (state.status === "checking") return state.message;
    return undefined;
  };

  const sendCode = async () => {
    setTouched((t) => ({ ...t, email: true }));
    if (!EMAIL_RE.test(email.trim())) return;
    if (captcha.enabled && captcha.captchaId && !captcha.code) {
      setServerError({ field: "captcha", message: c.captchaRequired });
      return;
    }
    setSendingCode(true);
    setServerError(null);
    try {
      const check = await api.checkEmail(email.trim());
      if (!check.available) {
        setEmailAvailability({ status: "unavailable", message: check.message });
        return;
      }
      await api.sendEmailCode(
        email.trim(),
        "register",
        locale,
        captcha.enabled && captcha.captchaId
          ? { captcha_id: captcha.captchaId, captcha_code: captcha.code }
          : undefined,
      );
      // Success: the server consumed the captcha and registration won't ask for
      // it again. Don't wipe the field — collapse it into a "verified" badge.
      if (captcha.enabled && captcha.captchaId) {
        setCaptchaVerified(true);
        setCaptchaNote("");
      }
      setCodeCooldown(60);
      pushToast({ kind: "success", message: c.codeSent });
    } catch (err) {
      // The challenge reached the server, which burns it on every verify — so
      // any verdict needs a fresh image. Refresh, surface the reason, and pull
      // focus back to the captcha so re-entry is obvious.
      const mapped = mapRegisterError(err, c);
      setServerError(mapped);
      if (captcha.enabled && captcha.captchaId) {
        setCaptchaRefresh((v) => v + 1);
        setCaptchaFocus((v) => v + 1);
        // A non-captcha failure still cleared the field — say so explicitly.
        setCaptchaNote(mapped.field === "captcha" ? "" : c.captchaRefreshed);
      }
    } finally {
      setSendingCode(false);
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

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched({ handle: true, displayName: true, email: true, password: true, code: true, terms: true });
    if (!canSubmit) return;
    setLoading(true);
    setServerError(null);
    try {
      const payload = {
        handle,
        display_name: displayName.trim() || handle,
        password,
        email: email.trim(),
        code: code.trim(),
        language: locale === "zh" ? "zh-Hans" : locale,
        ...(selectedRegion
          ? {
              country: selectedRegion.country_code,
              province: selectedRegion.province_code,
              city: selectedRegion.city_code,
              current_region_code: selectedRegion.region_code,
            }
          : {}),
      };
      const { user } = await api.register(payload);
      setUser(user);
      pushToast({ kind: "success", message: c.welcomeJoin(user.display_name) });
      router.replace(redirect);
    } catch (err) {
      setServerError(mapRegisterError(err, c));
    } finally {
      setLoading(false);
    }
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

            <p className="mt-10 text-sm font-semibold leading-7 text-kx-subtle">
              {c.leftRegisterIntro}
            </p>
            <p className="mt-3 text-sm font-black leading-7 text-kx-text">
              {c.leftRegisterAccent}
            </p>

            <ol className="mt-8 space-y-2.5">
              {c.leftRegisterSteps.map((step, idx) => (
                <li key={step} className="flex items-start gap-3 rounded-2xl border border-white/60 bg-white/45 p-3 shadow-[0_10px_30px_-24px_rgba(15,23,42,0.45)] backdrop-blur-sm">
                  <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-kx-accent/12 text-kx-accent text-xs font-black ring-1 ring-kx-accent/20">
                    {idx + 1}
                  </span>
                  <span className="text-sm font-semibold leading-6 text-kx-text">{step}</span>
                </li>
              ))}
            </ol>
          </div>
          <div className="relative grid grid-cols-3 gap-3 text-center">
            {[["12", c.statChannels], ["8+", c.statCategories], [c.statCountries, c.currentCity]].map(([n, label], i) => (
              <div key={i} className="rounded-kx-lg border border-white/60 bg-white/55 px-3 py-4 shadow-[0_10px_30px_-24px_rgba(15,23,42,0.45)] backdrop-blur-sm">
                <div className="text-xl font-black text-kx-accent">{n}</div>
                <div className="mt-1 text-[11px] font-bold text-kx-subtle">{label}</div>
              </div>
            ))}
          </div>
        </aside>

        {/* ─────────── RIGHT form pane ─────────── */}
        <form onSubmit={submit} className="flex min-w-0 flex-col justify-center px-5 py-7 sm:px-8 lg:px-10" noValidate aria-busy={loading}>
          <header className="mb-6">
            <div className="mb-5 flex items-start justify-between gap-3">
              <div className="flex min-w-0 flex-1 items-center gap-3 lg:hidden">
                <BrandMark className="h-12 w-12 shrink-0 rounded-[16px] text-xl" />
                <div className="min-w-0">
                  <div className="text-2xl font-black tracking-tight"><BrandText>Machi</BrandText></div>
                  <p className="break-words text-sm font-semibold leading-snug text-kx-subtle">{c.brandTagline}</p>
                </div>
              </div>
              <label className="ml-auto inline-flex shrink-0 items-center gap-2 rounded-full bg-kx-soft px-3 py-2 text-xs font-bold text-kx-subtle ring-1 ring-kx-stroke/70">
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
            <p className="text-xs font-black uppercase tracking-[0.16em] text-kx-accent">{c.registerEyebrow}</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-kx-text sm:text-4xl">{c.registerTitle}</h1>
            <p className="mt-2 text-sm font-semibold leading-6 text-kx-subtle">
              {c.registerSubtitle}
            </p>
          </header>

          {/* Top-of-form banner for non-field errors */}
          {serverError && !serverError.field ? (
            <div
              role="alert"
              className="mb-4 flex items-start gap-2 rounded-2xl bg-rose-50 px-3 py-2.5 text-sm font-bold text-rose-700 ring-1 ring-rose-100 dark:bg-rose-500/10 dark:text-rose-200 dark:ring-rose-400/20"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{serverError.message}</span>
            </div>
            ) : null}

          <GoogleSignInButton
            label={c.google}
            loadingLabel={c.googleLoading}
            loading={googleLoading}
            onClick={startGoogleLogin}
          />

          <div className="mb-4 mt-5 flex items-center gap-3">
            <span className="h-px flex-1 bg-kx-stroke/70" />
            <span className="text-[11px] font-black uppercase tracking-[0.16em] text-kx-muted">{c.orContinue}</span>
            <span className="h-px flex-1 bg-kx-stroke/70" />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <FieldShell
              label={c.username}
              htmlFor="reg-handle"
              error={fieldError("handle")}
              hint={fieldSuccess("handle") || c.usernameHint}
              success={!fieldError("handle") && handleAvailability.status === "available"}
            >
              <input
                id="reg-handle"
                className="kx-input"
                autoComplete="username"
                inputMode="text"
                spellCheck={false}
                placeholder={c.usernamePlaceholder}
                value={handle}
                onChange={(e) => {
                  // Auto-lowercase + strip illegal chars so users see
                  // the rule before they hit "submit".
                  setHandle(sanitizeRegisterHandle(e.target.value));
                  if (serverError?.field === "handle") setServerError(null);
                }}
                onBlur={() => setTouched((t) => ({ ...t, handle: true }))}
                aria-invalid={!!fieldError("handle") || undefined}
                aria-describedby={fieldError("handle") ? "reg-handle-error" : undefined}
                maxLength={20}
              />
            </FieldShell>

            <FieldShell
              label={c.displayName}
              htmlFor="reg-displayName"
              error={fieldError("displayName")}
              hint={c.displayNameHint}
              success={!fieldError("displayName") && displayName.trim().length > 0}
            >
              <input
                id="reg-displayName"
                className="kx-input"
                value={displayName}
                onChange={(e) => {
                  setDisplayName(e.target.value);
                  if (serverError?.field === "displayName") setServerError(null);
                }}
                onBlur={() => setTouched((t) => ({ ...t, displayName: true }))}
                placeholder={c.displayNamePlaceholder}
                maxLength={32}
                aria-invalid={!!fieldError("displayName") || undefined}
                aria-describedby={fieldError("displayName") ? "reg-displayName-error" : undefined}
              />
            </FieldShell>

            {captchaVerified ? (
              <div className="sm:col-span-2">
                <span className="mb-1.5 block text-xs font-bold text-kx-muted">{c.captcha}</span>
                <div className="flex h-11 items-center gap-2 rounded-kx-lg border border-emerald-500/30 bg-emerald-500/10 px-3 text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  {c.captchaVerified}
                </div>
              </div>
            ) : (
              <CaptchaBox
                scene="register"
                idPrefix="reg"
                className="sm:col-span-2"
                error={fieldError("captcha") || captchaNote || undefined}
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
            )}

            <FieldShell
              label={c.email}
              htmlFor="reg-email"
              error={fieldError("email")}
              hint={fieldSuccess("email") || c.emailHint}
              success={!fieldError("email") && emailAvailability.status === "available"}
              className="sm:col-span-2"
            >
              <div className="flex gap-2">
                <input
                  id="reg-email"
                  className="kx-input min-w-0 flex-1"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  spellCheck={false}
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (serverError?.field === "email") setServerError(null);
                  }}
                  onBlur={() => setTouched((t) => ({ ...t, email: true }))}
                  placeholder="you@example.com"
                  aria-invalid={!!fieldError("email") || undefined}
                  aria-describedby={fieldError("email") ? "reg-email-error" : undefined}
                />
                <button
                  type="button"
                  onClick={sendCode}
                  disabled={sendingCode || codeCooldown > 0 || !!fieldError("email") || !EMAIL_RE.test(email.trim())}
                  className="kx-button-ghost h-11 shrink-0 px-3 text-sm disabled:opacity-60"
                >
                  {sendingCode ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                  <span className="hidden sm:inline">{codeCooldown > 0 ? `${codeCooldown}s` : c.sendCode}</span>
                </button>
              </div>
            </FieldShell>

            <FieldShell
              label={c.code}
              htmlFor="reg-code"
              error={fieldError("code")}
              hint={c.codeHint}
              success={!fieldError("code") && code.trim().length >= 4}
              className="sm:col-span-2"
            >
              <input
                id="reg-code"
                className="kx-input"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => {
                  setCode(e.target.value.replace(/\D/g, "").slice(0, 8));
                  if (serverError?.field === "code") setServerError(null);
                }}
                onBlur={() => setTouched((t) => ({ ...t, code: true }))}
                placeholder={c.codePlaceholder}
                aria-invalid={!!fieldError("code") || undefined}
                aria-describedby={fieldError("code") ? "reg-code-error" : undefined}
              />
            </FieldShell>

            <FieldShell
              label={c.password}
              htmlFor="reg-password"
              error={fieldError("password")}
              hint={c.passwordHint}
              success={!fieldError("password") && password.length >= PASSWORD_MIN && /[A-Za-z]/.test(password) && /\d/.test(password)}
              className="sm:col-span-2"
            >
              <div className="relative">
                <input
                  id="reg-password"
                  className="kx-input pr-10"
                  type={showPw ? "text" : "password"}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (serverError?.field === "password") setServerError(null);
                  }}
                  onBlur={() => setTouched((t) => ({ ...t, password: true }))}
                  placeholder={c.passwordPlaceholder}
                  maxLength={128}
                  aria-invalid={!!fieldError("password") || undefined}
                  aria-describedby={fieldError("password") ? "reg-password-error" : undefined}
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
              <PasswordStrength value={password} />
            </FieldShell>

            <FieldShell
              label={c.confirmPassword}
              htmlFor="reg-confirm-password"
              error={confirmPassword && confirmPassword !== password ? (locale === "ja" ? "パスワードが一致しません" : locale === "en" ? "Passwords do not match" : "两次输入的密码不一致") : undefined}
              hint={c.confirmPasswordHint}
              success={!!confirmPassword && confirmPassword === password}
              className="sm:col-span-2"
            >
              <input
                id="reg-confirm-password"
                className="kx-input"
                type={showPw ? "text" : "password"}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, password: true }))}
                placeholder={c.confirmPasswordPlaceholder}
                maxLength={128}
                aria-invalid={(!!confirmPassword && confirmPassword !== password) || undefined}
              />
            </FieldShell>
          </div>

          <section className="mt-5">
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-sm font-bold text-kx-text">
                <MapPin className="h-4 w-4 text-kx-accent" />
                {c.currentCity}
              </span>
              {fieldError("region") ? null : selectedRegion ? (
                <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-300">{c.selected}</span>
              ) : (
                <span className="text-[11px] font-semibold text-kx-muted">{c.optional}</span>
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                setRegionOpen(true);
                setTouched((t) => ({ ...t, region: true }));
              }}
              data-invalid={!!fieldError("region") || undefined}
              className="flex min-h-16 w-full items-center gap-3 rounded-kx-lg border border-kx-stroke bg-kx-soft px-4 py-3 text-left text-kx-text transition hover:border-kx-accent/45 hover:bg-kx-accent/5 focus:outline-none focus:ring-2 focus:ring-kx-accent/35 data-[invalid=true]:border-rose-300 data-[invalid=true]:bg-rose-50/40 dark:data-[invalid=true]:border-rose-400/40 dark:data-[invalid=true]:bg-rose-500/5"
              aria-describedby={fieldError("region") ? "reg-region-error" : undefined}
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white text-xl shadow-sm dark:bg-white/10">
                {selectedRegion?.country_emoji || "🌐"}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-black">
                  {selectedRegion ? regionDisplayName(selectedRegion, locale) : c.pickCity}
                </span>
                <span className="mt-0.5 block truncate text-xs font-semibold text-kx-muted">
                  {selectedRegion ? c.pickedCityHint : c.pickCityHint}
                </span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-kx-muted" />
            </button>
            {fieldError("region") ? (
              <p id="reg-region-error" role="alert" className="mt-1.5 flex items-center gap-1 text-xs font-bold text-rose-600 dark:text-rose-300">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {fieldError("region")}
              </p>
            ) : null}
          </section>

          <label className="mt-5 flex items-start gap-3 rounded-2xl bg-kx-soft px-3 py-3 text-sm font-semibold text-kx-subtle">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 rounded border-kx-stroke accent-kx-accent"
              checked={acceptedTerms}
              onChange={(e) => {
                setAcceptedTerms(e.target.checked);
                setTouched((t) => ({ ...t, terms: true }));
              }}
            />
            <span>
              {c.termsPrefix}
              <Link href="/legal/terms" className="kx-link mx-1">{c.terms}</Link>
              {c.and}
              <Link href="/legal/privacy" className="kx-link ml-1">{c.privacy}</Link>
            </span>
          </label>
          {fieldError("terms") ? (
            <p role="alert" className="mt-1.5 flex items-center gap-1 text-xs font-bold text-rose-600 dark:text-rose-300">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {fieldError("terms")}
            </p>
          ) : null}

          <button
            type="submit"
            className="kx-button-primary mt-6 h-12 w-full text-base disabled:opacity-60"
            disabled={!canSubmit}
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
            <span>{loading ? c.registerLoading : c.registerButton}</span>
          </button>
          <p className="mt-4 text-center text-xs text-kx-muted">{c.registerFootnote}</p>
          <div className="mt-4 text-center text-sm text-kx-subtle">
            {c.hasAccount}
            <Link className="kx-link ml-1 font-bold" href={`/login?redirect=${encodeURIComponent(redirect)}`}>{c.loginNow}</Link>
          </div>
        </form>
      </div>
      <RegionPickerDialog
        open={regionOpen}
        onClose={() => setRegionOpen(false)}
        onSelect={(r) => {
          setSelectedRegion(r);
          if (serverError?.field === "region") setServerError(null);
        }}
        allowsAnyCountry
      />
    </div>
  );
}
