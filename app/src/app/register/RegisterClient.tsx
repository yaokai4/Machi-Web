"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  AlertCircle,
  ChevronRight,
  Eye,
  EyeOff,
  Loader2,
  Mail,
  MapPin,
  UserPlus,
} from "lucide-react";
import { api, APIError } from "@/lib/api";
import { useSession, useToasts } from "@/lib/store";
import { BrandMark, BrandText } from "@/components/marketing/BrandText";
import { RegionPickerDialog } from "@/components/feed/RegionPickerDialog";
import { regionDisplayName, type RegionInfo } from "@/lib/regions";
import { FieldShell, PasswordStrength } from "@/components/design/FieldShell";
import {
  EMAIL_RE,
  HANDLE_RE,
  PASSWORD_MIN,
  RESERVED_HANDLES,
  isRegisterValid,
  sanitizeRegisterHandle,
  validateRegister,
} from "@/lib/authValidation";

type Errors = Partial<Record<"handle" | "displayName" | "email" | "password" | "code" | "terms" | "region", string>>;
type Availability = { status: "idle" | "checking" | "available" | "unavailable"; message: string };

// Maps backend errors into a field + friendly message. The server has
// codes for the common cases — `handle_taken`, `weak_password`,
// `invalid_email` — and we surface them at the matching field instead
// of a vague toast.
function mapRegisterError(err: unknown): { field?: keyof Errors; message: string } {
  if (err instanceof APIError) {
    if (err.code === "handle_taken" || /already.*(taken|exists)/i.test(err.message)) {
      return { field: "handle", message: "这个用户名已被使用，换一个试试。" };
    }
    if (err.code === "invalid_handle" || /handle/i.test(err.message)) {
      return { field: "handle", message: "用户名只能用小写字母、数字、下划线和点，3–20 位。" };
    }
    if (err.code === "reserved_handle") {
      return { field: "handle", message: "这个用户名不可使用。" };
    }
    if (err.code === "weak_password") {
      return { field: "password", message: "密码强度不足，请尝试更长或加入数字 / 符号。" };
    }
    if (err.code === "invalid_email") {
      return { field: "email", message: "邮箱格式不正确。" };
    }
    if (err.code === "email_taken") {
      return { field: "email", message: "这个邮箱已被注册过。" };
    }
    if (err.code === "invalid_code" || err.code === "code_expired") {
      return { field: "code", message: err.message || "验证码无效或已过期。" };
    }
    if (err.status === 429 || err.code === "rate_limited") {
      return { message: "尝试过多，请稍等 30 秒后再试。" };
    }
    if (err.status === 0 || err.code === "network_error") {
      return { message: "无法连接服务器，请检查网络后重试。" };
    }
    if (err.code === "timeout") {
      return { message: "请求超时，请稍后再试。" };
    }
    if (err.message) return { message: err.message };
  }
  return { message: "注册失败，请稍后再试。" };
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="min-h-dvh grid place-items-center text-kx-muted text-sm">加载中…</div>}>
      <RegisterForm />
    </Suspense>
  );
}

function safeRedirectPath(raw: string | null) {
  if (!raw) return "/home";
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("://")) return "/home";
  return raw;
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
  const [sendingCode, setSendingCode] = useState(false);
  const [codeCooldown, setCodeCooldown] = useState(0);
  const [handleAvailability, setHandleAvailability] = useState<Availability>({ status: "idle", message: "" });
  const [emailAvailability, setEmailAvailability] = useState<Availability>({ status: "idle", message: "" });
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [serverError, setServerError] = useState<{ field?: keyof Errors; message: string } | null>(null);
  const redirect = useMemo(() => safeRedirectPath(search.get("redirect") || search.get("next")), [search]);

  useEffect(() => {
    if (status === "authed") router.replace(redirect);
  }, [status, router, redirect]);

  useEffect(() => {
    if (codeCooldown <= 0) return;
    const timer = window.setTimeout(() => setCodeCooldown((v) => Math.max(0, v - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [codeCooldown]);

  useEffect(() => {
    const value = handle.trim();
    if (!value || !HANDLE_RE.test(value) || RESERVED_HANDLES.has(value)) {
      setHandleAvailability({ status: "idle", message: "" });
      return;
    }
    setHandleAvailability({ status: "checking", message: "正在检查用户名…" });
    const timer = window.setTimeout(() => {
      api.checkUsername(value)
        .then((res) => setHandleAvailability({ status: res.available ? "available" : "unavailable", message: res.message }))
        .catch(() => setHandleAvailability({ status: "idle", message: "" }));
    }, 450);
    return () => window.clearTimeout(timer);
  }, [handle]);

  useEffect(() => {
    const value = email.trim();
    if (!value || !EMAIL_RE.test(value)) {
      setEmailAvailability({ status: "idle", message: "" });
      return;
    }
    setEmailAvailability({ status: "checking", message: "正在检查邮箱…" });
    const timer = window.setTimeout(() => {
      api.checkEmail(value)
        .then((res) => setEmailAvailability({ status: res.available ? "available" : "unavailable", message: res.message }))
        .catch(() => setEmailAvailability({ status: "idle", message: "" }));
    }, 450);
    return () => window.clearTimeout(timer);
  }, [email]);

  const errors: Errors = useMemo(() => {
    return validateRegister(
      { handle, displayName, email, password, confirmPassword, code, acceptedTerms, hasRegion: !!selectedRegion },
      touched,
    );
  }, [touched, handle, displayName, email, password, confirmPassword, code, acceptedTerms, selectedRegion]);

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
    setSendingCode(true);
    setServerError(null);
    try {
      const check = await api.checkEmail(email.trim());
      if (!check.available) {
        setEmailAvailability({ status: "unavailable", message: check.message });
        return;
      }
      await api.sendEmailCode(email.trim(), "register");
      setCodeCooldown(60);
      pushToast({ kind: "success", message: "验证码已发送，请检查邮箱" });
    } catch (err) {
      setServerError(mapRegisterError(err));
    } finally {
      setSendingCode(false);
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
      pushToast({ kind: "success", message: `欢迎加入 Machi，${user.display_name}` });
      router.replace(redirect);
    } catch (err) {
      setServerError(mapRegisterError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-dvh bg-kx-bg px-4 py-6 sm:py-10">
      <div className="mx-auto grid min-h-[calc(100dvh-3rem)] w-full max-w-5xl overflow-hidden rounded-[28px] border border-kx-stroke/70 bg-kx-card shadow-kx-glow lg:grid-cols-[0.9fr_1.1fr]">
        {/* ─────────── LEFT brand pane ─────────── */}
        <aside className="hidden flex-col justify-between bg-gradient-to-br from-kx-accent/14 via-kx-card to-sky-100/70 p-8 lg:flex dark:from-kx-accent/20 dark:via-kx-card dark:to-sky-500/10">
          <div>
            <div className="inline-flex items-center gap-3">
              <BrandMark className="h-14 w-14 rounded-[18px] text-2xl" />
              <div>
                <div className="text-3xl font-black tracking-tight"><BrandText>Machi</BrandText></div>
                <p className="mt-1 text-sm font-semibold text-kx-subtle">在每一座城市，找到生活的回声。</p>
              </div>
            </div>

            <p className="mt-10 text-sm font-semibold leading-7 text-kx-subtle">
              按国家和城市组织本地新闻、生活经验、租房、二手、工作、招聘、搭子、约饭、活动和问答。
            </p>
            <p className="mt-3 text-sm font-bold leading-7 text-kx-accent">
              注册时选择当前城市，首页、发现和热榜会自动围绕该地区展开。
            </p>

            <ol className="mt-8 space-y-3">
              {[
                "填写用户名、显示名和密码",
                "选择当前国家和城市",
                "登录后即可浏览本地内容、参与互动、发表帖子",
              ].map((step, idx) => (
                <li key={step} className="flex items-start gap-3">
                  <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-kx-accent text-white text-xs font-black shadow-sm">
                    {idx + 1}
                  </span>
                  <span className="text-sm font-semibold leading-6 text-kx-text">{step}</span>
                </li>
              ))}
            </ol>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-kx-lg bg-white/70 px-3 py-4 ring-1 ring-white/80 dark:bg-white/[0.05] dark:ring-white/10">
              <div className="text-xl font-black text-kx-text">12</div>
              <div className="mt-1 text-[11px] font-bold text-kx-muted">本地频道</div>
            </div>
            <div className="rounded-kx-lg bg-white/70 px-3 py-4 ring-1 ring-white/80 dark:bg-white/[0.05] dark:ring-white/10">
              <div className="text-xl font-black text-kx-text">8+</div>
              <div className="mt-1 text-[11px] font-bold text-kx-muted">核心分类</div>
            </div>
            <div className="rounded-kx-lg bg-white/70 px-3 py-4 ring-1 ring-white/80 dark:bg-white/[0.05] dark:ring-white/10">
              <div className="text-xl font-black text-kx-text">多国</div>
              <div className="mt-1 text-[11px] font-bold text-kx-muted">城市切换</div>
            </div>
          </div>
        </aside>

        {/* ─────────── RIGHT form pane ─────────── */}
        <form onSubmit={submit} className="flex flex-col justify-center px-5 py-7 sm:px-8 lg:px-10" noValidate aria-busy={loading}>
          <header className="mb-6">
            <div className="mb-5 flex items-center gap-3 lg:hidden">
              <BrandMark className="h-12 w-12 rounded-[16px] text-xl" />
              <div>
                <div className="text-2xl font-black tracking-tight"><BrandText>Machi</BrandText></div>
                <p className="text-sm font-semibold text-kx-subtle">在每一座城市，找到生活的回声。</p>
              </div>
            </div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-kx-accent">Create Account</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-kx-text sm:text-4xl">创建账号</h1>
            <p className="mt-2 text-sm font-semibold leading-6 text-kx-subtle">
              填写基础资料并选择当前城市，Machi 会优先展示该地区的本地内容。
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

          <div className="grid gap-4 sm:grid-cols-2">
            <FieldShell
              label="用户名"
              htmlFor="reg-handle"
              error={fieldError("handle")}
              hint={fieldSuccess("handle") || "a–z, 0–9, _ 和 .，3–20 位"}
              success={!fieldError("handle") && handleAvailability.status === "available"}
            >
              <input
                id="reg-handle"
                className="kx-input"
                autoComplete="username"
                inputMode="text"
                spellCheck={false}
                placeholder="例如 machi_2026"
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
              label="显示名称"
              htmlFor="reg-displayName"
              error={fieldError("displayName")}
              hint="可选 · 支持中文"
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
                placeholder="他人会看到的名字"
                maxLength={32}
                aria-invalid={!!fieldError("displayName") || undefined}
                aria-describedby={fieldError("displayName") ? "reg-displayName-error" : undefined}
              />
            </FieldShell>

            <FieldShell
              label="邮箱"
              htmlFor="reg-email"
              error={fieldError("email")}
              hint={fieldSuccess("email") || "必填 · 用于验证码和找回密码"}
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
                  <span className="hidden sm:inline">{codeCooldown > 0 ? `${codeCooldown}s` : "发送验证码"}</span>
                </button>
              </div>
            </FieldShell>

            <FieldShell
              label="邮箱验证码"
              htmlFor="reg-code"
              error={fieldError("code")}
              hint="检查邮箱中的 6 位数字"
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
                placeholder="输入验证码"
                aria-invalid={!!fieldError("code") || undefined}
                aria-describedby={fieldError("code") ? "reg-code-error" : undefined}
              />
            </FieldShell>

            <FieldShell
              label="密码"
              htmlFor="reg-password"
              error={fieldError("password")}
              hint={`至少 ${PASSWORD_MIN} 位，包含字母和数字`}
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
                  placeholder="8 位以上，包含字母和数字"
                  maxLength={128}
                  aria-invalid={!!fieldError("password") || undefined}
                  aria-describedby={fieldError("password") ? "reg-password-error" : undefined}
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-2 text-kx-muted hover:bg-kx-soft hover:text-kx-text"
                  aria-label={showPw ? "隐藏密码" : "显示密码"}
                  tabIndex={-1}
                >
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <PasswordStrength value={password} />
            </FieldShell>

            <FieldShell
              label="确认密码"
              htmlFor="reg-confirm-password"
              error={confirmPassword && confirmPassword !== password ? "两次输入的密码不一致" : undefined}
              hint="再次输入密码"
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
                placeholder="再次输入密码"
                maxLength={128}
                aria-invalid={(!!confirmPassword && confirmPassword !== password) || undefined}
              />
            </FieldShell>
          </div>

          <section className="mt-5">
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-sm font-bold text-kx-text">
                <MapPin className="h-4 w-4 text-kx-accent" />
                当前地区
              </span>
              {fieldError("region") ? null : selectedRegion ? (
                <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-300">已选择</span>
              ) : (
                <span className="text-[11px] font-semibold text-kx-muted">可选</span>
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
                  {selectedRegion ? regionDisplayName(selectedRegion) : "选择国家 / 城市"}
                </span>
                <span className="mt-0.5 block truncate text-xs font-semibold text-kx-muted">
                  {selectedRegion ? "首页、发现和热榜将同步到该地区" : "不选也可以先注册，之后在设置里切换"}
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
              我已阅读并同意
              <Link href="/legal/terms" className="kx-link mx-1">《服务条款》</Link>
              和
              <Link href="/legal/privacy" className="kx-link ml-1">《隐私政策》</Link>
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
            <span>{loading ? "正在创建账号…" : "注册"}</span>
          </button>
          <p className="mt-4 text-center text-xs text-kx-muted">注册成功后 Web 与 iOS 会共享同一套账号、城市、会员和内容数据。</p>
          <div className="mt-4 text-center text-sm text-kx-subtle">
            已有账号？
            <Link className="kx-link ml-1 font-bold" href={`/login?redirect=${encodeURIComponent(redirect)}`}>直接登录</Link>
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
