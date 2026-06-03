"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  AlertCircle,
  Compass,
  Eye,
  EyeOff,
  Loader2,
  LogIn,
  MapPin,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { api, APIError } from "@/lib/api";
import { useSession, useToasts } from "@/lib/store";
import { BrandMark, BrandText } from "@/components/marketing/BrandText";
import { FieldShell } from "@/components/design/FieldShell";
import { normalizeHandle, validateLogin } from "@/lib/authValidation";

/// Next.js 15 requires every `useSearchParams()` user to live under a
/// Suspense boundary, otherwise the dev/prod server bails out with a
/// 500. The form lives in the inner component; the page just provides
/// the boundary.
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

// Translates backend error codes / status into something the user can
// act on instead of the raw "请求失败 (401)".
function mapLoginError(err: unknown): { field?: "handle" | "password"; message: string } {
  if (err instanceof APIError) {
    if (err.status === 401 || err.code === "invalid_credentials") {
      return { field: "password", message: "用户名或密码错误，请检查后重试。" };
    }
    if (err.status === 404 || err.code === "user_not_found") {
      return { field: "handle", message: "用户名不存在，要不要先注册一个？" };
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
  return { message: "登录失败，请稍后再试。" };
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
  const [serverError, setServerError] = useState<{ field?: "handle" | "password"; message: string } | null>(null);
  const [touched, setTouched] = useState<{ handle: boolean; password: boolean }>({ handle: false, password: false });
  const redirect = useMemo(() => safeRedirectPath(search.get("redirect") || search.get("next")), [search]);

  useEffect(() => {
    if (status === "authed") {
      router.replace(redirect);
    }
  }, [status, router, redirect]);

  const errors = useMemo(() => {
    return validateLogin({ handle, password }, touched);
  }, [handle, password, touched]);

  const isValid = normalizeHandle(handle).length > 0 && password.length > 0;
  const canSubmit = !loading;

  const submit = async () => {
    setTouched({ handle: true, password: true });
    const _h = normalizeHandle(handle);
    const _p = password;
    if (!isValid) return;
    setLoading(true);
    setServerError(null);
    try {
      const { user } = await api.login(_h, _p);
      setUser(user);
      pushToast({ kind: "success", message: `欢迎回来，${user.display_name}` });
      router.replace(redirect);
    } catch (err) {
      const mapped = mapLoginError(err);
      setServerError(mapped);
    } finally {
      setLoading(false);
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

            <ul className="mt-10 space-y-4">
              {[
                { Icon: MapPin,       title: "城市优先",      body: "按当前城市展示新闻、活动、租房、二手和招聘。" },
                { Icon: Compass,      title: "找到附近的人",  body: "搭子、约饭、问答与城市脉搏，真实经验一目了然。" },
                { Icon: Sparkles,     title: "iOS + Web 同步", body: "Web 和 App 共用账号、城市、消息和草稿。" },
                { Icon: ShieldCheck,  title: "本地安全机制",  body: "举报、审核、商家认证和交易提醒已内置。" },
              ].map(({ Icon, title, body }) => (
                <li key={title} className="flex items-start gap-3">
                  <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-kx-accent/10 text-kx-accent ring-1 ring-kx-accent/20">
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

          <div className="rounded-kx-lg bg-white/70 p-4 ring-1 ring-white/80 dark:bg-white/[0.05] dark:ring-white/10">
            <div className="text-[11px] font-black uppercase tracking-[0.16em] text-kx-accent">City-first feed</div>
            <p className="mt-2 text-sm font-semibold leading-6 text-kx-subtle">
              按当前城市组织信息，让散落的问题、经验和机会被看见、被找到、被回应。
            </p>
          </div>
        </aside>

        {/* ─────────── RIGHT form pane ─────────── */}
        <div className="flex flex-col justify-center px-5 py-7 sm:px-8 lg:px-10">
          <header className="mb-6">
            <div className="mb-5 flex items-center gap-3 lg:hidden">
              <BrandMark className="h-12 w-12 rounded-[16px] text-xl" />
              <div>
                <div className="text-2xl font-black tracking-tight"><BrandText>Machi</BrandText></div>
                <p className="text-sm font-semibold text-kx-subtle">在每一座城市，找到生活的回声。</p>
              </div>
            </div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-kx-accent">Sign In</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-kx-text sm:text-4xl">欢迎回来</h1>
            <p className="mt-2 text-sm font-semibold leading-6 text-kx-subtle">
              登录后继续同步你的城市内容、消息、收藏和本地频道。
            </p>
          </header>

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

            <FieldShell label="用户名" htmlFor="login-handle" error={fieldError("handle")}>
              <input
                id="login-handle"
                className="kx-input"
                autoFocus
                autoComplete="username"
                inputMode="text"
                spellCheck={false}
                placeholder="例如 machi"
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

            <FieldShell label="密码" htmlFor="login-password" error={fieldError("password")}>
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
                  aria-label={showPw ? "隐藏密码" : "显示密码"}
                  tabIndex={-1}
                >
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </FieldShell>

            <button
              type="submit"
              className="kx-button-primary h-12 w-full text-base disabled:opacity-60"
              disabled={!canSubmit}
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
              <span>{loading ? "登录中…" : "登录"}</span>
            </button>
          </form>

          <div className="mt-5 text-center text-sm text-kx-subtle">
            还没有账号？
            <Link className="kx-link ml-1 font-bold" href={`/register?redirect=${encodeURIComponent(redirect)}`}>立即注册</Link>
          </div>
          <div className="mt-5 flex items-center justify-center gap-3 text-xs text-kx-muted">
            <Link href="/legal/terms" className="hover:underline">用户协议</Link>
            <span>·</span>
            <Link href="/legal/privacy" className="hover:underline">隐私政策</Link>
            <span>·</span>
            <Link href="/forgot" className="hover:underline">忘记密码</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
