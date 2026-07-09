"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Mail, ArrowLeft, KeyRound, Loader2 } from "lucide-react";
import { api, APIError } from "@/lib/api";
import { useToasts } from "@/lib/store";
import { useI18n, appLocaleToMarketingLocale } from "@/lib/i18n";
import { PASSWORD_MIN } from "@/lib/authValidation";
import { PasswordStrength } from "@/components/design/FieldShell";

export default function ForgotPage() {
  const router = useRouter();
  const pushToast = useToasts((s) => s.push);
  const { locale } = useI18n();
  const L = (zh: string, en: string, ja: string) => (locale === "en" ? en : locale === "ja" ? ja : zh);

  // The reset endpoint (and the shared password/code validators it calls) raise
  // Chinese-only messages. Login/Register map their error codes to localized copy;
  // do the same here so ja/en users never see a raw Chinese toast on the core
  // account-recovery flow. Falls back to a generic localized message on any
  // unmapped code.
  const mapForgotError = (err: unknown): string => {
    if (err instanceof APIError) {
      switch (err.code) {
        case "invalid_code":
          return L("验证码无效或已过期，请重新获取。", "The code is invalid or expired. Please request a new one.", "確認コードが無効か期限切れです。もう一度取得してください。");
        case "code_expired":
          return L("验证码已过期，请重新获取。", "The code has expired. Please request a new one.", "確認コードの有効期限が切れました。もう一度取得してください。");
        case "too_many_attempts":
          return L("尝试次数过多，请重新获取验证码。", "Too many attempts. Please request a new code.", "試行回数が多すぎます。確認コードを取得し直してください。");
        case "weak_password":
          return L("密码至少 8 位，且需包含字母和数字。", "Password must be at least 8 characters with letters and numbers.", "パスワードは8文字以上で、英字と数字を含めてください。");
        case "invalid_password":
          return L("密码过长。", "Password is too long.", "パスワードが長すぎます。");
        case "invalid_email":
          return L("邮箱格式不正确。", "Email format is invalid.", "メールアドレスの形式が正しくありません。");
        case "code_cooldown":
          return L("验证码发送过于频繁，请稍后再试。", "Codes are being sent too frequently. Please try again shortly.", "確認コードの送信が頻繁すぎます。しばらくしてからお試しください。");
        case "rate_limited":
          return L("操作过于频繁，请稍后再试。", "Too many requests. Please try again shortly.", "操作が頻繁すぎます。しばらくしてからお試しください。");
        case "captcha_required":
        case "invalid_captcha":
        case "captcha_expired":
          return L("图形验证失败，请返回登录页重试。", "Verification failed. Please try again from the login page.", "画像認証に失敗しました。ログインページからやり直してください。");
        case "network_error":
          return L("无法连接服务器，请检查网络后重试。", "Cannot connect to the server. Please check your network.", "サーバーに接続できません。ネットワークをご確認ください。");
        case "timeout":
          return L("请求超时，请稍后再试。", "Request timed out. Please try again.", "リクエストがタイムアウトしました。もう一度お試しください。");
      }
      if (err.status === 429) {
        return L("操作过于频繁，请稍后再试。", "Too many requests. Please try again shortly.", "操作が頻繁すぎます。しばらくしてからお試しください。");
      }
    }
    return L("操作失败，请稍后再试。", "Something went wrong. Please try again.", "エラーが発生しました。しばらくしてからお試しください。");
  };

  const [step, setStep] = useState<"request" | "reset">("request");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  const requestCode = async () => {
    if (!email.trim() || busy) return;
    setBusy(true);
    try {
      await api.forgotPassword(email.trim(), appLocaleToMarketingLocale(locale));
      // The server responds generically (no account enumeration), so we
      // always advance to the reset step regardless of whether the email
      // is registered.
      pushToast({ kind: "success", message: L("验证码已发送到邮箱，请查收。", "A reset code has been sent to your email.", "確認コードをメールに送信しました。") });
      setStep("reset");
    } catch (err) {
      pushToast({ kind: "error", message: mapForgotError(err) });
    } finally {
      setBusy(false);
    }
  };

  const resetPassword = async () => {
    if (busy) return;
    if (!code.trim()) {
      pushToast({ kind: "error", message: L("请输入验证码", "Enter the code", "コードを入力してください") });
      return;
    }
    // Mirror the register/reset policy (authValidation + server
    // validate_password_strength): >= PASSWORD_MIN chars AND at least one letter
    // and one digit. Using length < 6 with no complexity check let users submit
    // passwords the server rejects with weak_password — a guaranteed-to-fail
    // round-trip and a misleading, weaker-looking policy.
    if (password.length < PASSWORD_MIN || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      pushToast({ kind: "error", message: L("密码至少 8 位，且需包含字母和数字", "Password must be at least 8 characters with letters and numbers", "パスワードは8文字以上、英字と数字を含めてください") });
      return;
    }
    if (password !== confirm) {
      pushToast({ kind: "error", message: L("两次输入不一致", "Passwords do not match", "パスワードが一致しません") });
      return;
    }
    setBusy(true);
    try {
      await api.resetPassword(email.trim(), code.trim(), password);
      pushToast({ kind: "success", message: L("密码已重置，请用新密码登录。", "Password reset. Please sign in with your new password.", "パスワードを再設定しました。新しいパスワードでログインしてください。") });
      router.push("/login");
    } catch (err) {
      pushToast({ kind: "error", message: mapForgotError(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-dvh flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md kx-glass-surface p-6 sm:p-8 space-y-4">
        <Link href="/login" className="text-kx-subtle text-sm inline-flex items-center gap-1 hover:text-kx-text transition-colors">
          <ArrowLeft className="w-4 h-4" /> {L("返回登录", "Back to sign in", "ログインに戻る")}
        </Link>
        <div className="flex items-center gap-3 pt-1">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-kx-md bg-kx-accentSoft text-kx-accent ring-1 ring-kx-accent/15">
            <KeyRound className="w-5 h-5" />
          </span>
          <h1 className="text-kx-title font-bold">{L("找回密码", "Reset password", "パスワードを再設定")}</h1>
        </div>

        {step === "request" ? (
          <>
            <p className="text-sm text-kx-subtle">
              {L("填写你账号绑定的邮箱，我们会发送一封重置验证码。", "Enter your account email and we'll send a reset code.", "アカウントのメールアドレスを入力すると、確認コードを送信します。")}
            </p>
            <label className="block">
              <span className="text-sm font-semibold text-kx-text">{L("邮箱", "Email", "メール")}</span>
              <input
                className="kx-input mt-1"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") requestCode(); }}
              />
            </label>
            <button className="kx-button-primary w-full h-11 disabled:opacity-60" onClick={requestCode} disabled={busy || !email.trim()}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
              {L("发送重置验证码", "Send reset code", "確認コードを送信")}
            </button>
          </>
        ) : (
          <>
            <p className="text-sm text-kx-subtle">
              {L(`验证码已发送到 ${email}。输入验证码并设置新密码。`, `A code was sent to ${email}. Enter it and set a new password.`, `${email} にコードを送信しました。コードを入力し、新しいパスワードを設定してください。`)}
            </p>
            <label className="block">
              <span className="text-sm font-semibold text-kx-text">{L("验证码", "Reset code", "確認コード")}</span>
              <input className="kx-input mt-1" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} />
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-kx-text">{L("新密码", "New password", "新しいパスワード")}</span>
              <input className="kx-input mt-1" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
              <PasswordStrength value={password} />
              <span className="mt-1.5 block text-xs text-kx-subtle">
                {L("至少 8 位，包含字母和数字", "At least 8 characters with letters and numbers", "8文字以上、英字と数字を含める")}
              </span>
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-kx-text">{L("确认新密码", "Confirm new password", "新しいパスワード（確認）")}</span>
              <input className="kx-input mt-1" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") resetPassword(); }} />
            </label>
            <button className="kx-button-primary w-full h-11 disabled:opacity-60" onClick={resetPassword} disabled={busy}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
              {L("重置密码", "Reset password", "パスワードを再設定")}
            </button>
            <button className="w-full text-center text-kx-subtle text-xs hover:text-kx-text transition-colors disabled:opacity-60" onClick={() => setStep("request")} disabled={busy}>
              {L("没收到？重新发送", "Didn't get it? Resend", "届かない場合は再送信")}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
