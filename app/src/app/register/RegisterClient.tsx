"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  AlertCircle,
  ChevronRight,
  Eye,
  EyeOff,
  Loader2,
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
  isRegisterValid,
  sanitizeRegisterHandle,
  validateRegister,
} from "@/lib/authValidation";

type Errors = Partial<Record<"handle" | "displayName" | "email" | "password" | "region", string>>;

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
      return { field: "handle", message: "用户名只能用小写字母、数字和下划线，2–24 位。" };
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
  const router = useRouter();
  const setUser = useSession((s) => s.setUser);
  const status = useSession((s) => s.status);
  const pushToast = useToasts((s) => s.push);
  const [handle, setHandle] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [email, setEmail] = useState("");
  const [selectedRegion, setSelectedRegion] = useState<RegionInfo | null>(null);
  const [regionOpen, setRegionOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [serverError, setServerError] = useState<{ field?: keyof Errors; message: string } | null>(null);

  useEffect(() => {
    if (status === "authed") router.replace("/home");
  }, [status, router]);

  const errors: Errors = useMemo(() => {
    return validateRegister(
      { handle, displayName, email, password, hasRegion: !!selectedRegion },
      touched,
    );
  }, [touched, handle, displayName, email, password, selectedRegion]);

  const isValid = isRegisterValid({ handle, displayName, email, password, hasRegion: !!selectedRegion });
  const canSubmit = !loading;

  const fieldError = (k: keyof Errors): string | undefined => {
    if (errors[k]) return errors[k];
    if (serverError?.field === k) return serverError.message;
    return undefined;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched({ handle: true, displayName: true, email: true, password: true, region: true });
    if (!isValid) return;
    setLoading(true);
    setServerError(null);
    try {
      const { user } = await api.register({
        handle,
        display_name: displayName.trim(),
        password,
        email: email.trim() || undefined,
        country: selectedRegion!.country_code,
        province: selectedRegion!.province_code,
        city: selectedRegion!.city_code,
        current_region_code: selectedRegion!.region_code,
      });
      setUser(user);
      pushToast({ kind: "success", message: `欢迎加入 Machi，${user.display_name}` });
      router.replace("/home");
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
                <div className="text-3xl font-black tracking-tight"><BrandText>Machi City</BrandText></div>
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
                <div className="text-2xl font-black tracking-tight"><BrandText>Machi City</BrandText></div>
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
              hint="a–z, 0–9, _，2–24 位"
              success={!fieldError("handle") && HANDLE_RE.test(handle)}
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
                maxLength={24}
              />
            </FieldShell>

            <FieldShell
              label="显示名称"
              htmlFor="reg-displayName"
              error={fieldError("displayName")}
              hint="支持中文"
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
              hint="可选 · 找回密码用"
              success={!fieldError("email") && !!email && EMAIL_RE.test(email)}
              className="sm:col-span-2"
            >
              <input
                id="reg-email"
                className="kx-input"
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
            </FieldShell>

            <FieldShell
              label="密码"
              htmlFor="reg-password"
              error={fieldError("password")}
              hint="至少 6 位"
              success={!fieldError("password") && password.length >= PASSWORD_MIN}
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
                  placeholder="6 位以上，建议混合数字 / 符号"
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
                <span className="text-[11px] font-semibold text-kx-muted">必填</span>
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
                  {selectedRegion ? "首页、发现和热榜将同步到该地区" : "选择后自动同步 Web 和 App 的地区内容"}
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

          <button
            type="submit"
            className="kx-button-primary mt-6 h-12 w-full text-base disabled:opacity-60"
            disabled={!canSubmit}
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
            <span>{loading ? "正在创建账号…" : "注册"}</span>
          </button>
          <p className="mt-4 text-center text-xs text-kx-muted">
            注册即表示同意我们的
            <Link href="/legal/terms" className="kx-link mx-1">用户协议</Link>
            与
            <Link href="/legal/privacy" className="kx-link ml-1">隐私政策</Link>
          </p>
          <div className="mt-4 text-center text-sm text-kx-subtle">
            已有账号？
            <Link className="kx-link ml-1 font-bold" href="/login">直接登录</Link>
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
