"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Mail, ArrowLeft, KeyRound, Loader2 } from "lucide-react";
import { api, APIError } from "@/lib/api";
import { useToasts } from "@/lib/store";
import { useI18n, appLocaleToMarketingLocale } from "@/lib/i18n";

export default function ForgotPage() {
  const router = useRouter();
  const pushToast = useToasts((s) => s.push);
  const { locale } = useI18n();
  const L = (zh: string, en: string, ja: string) => (locale === "en" ? en : locale === "ja" ? ja : zh);

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
      pushToast({ kind: "error", message: (err as APIError).message });
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
    if (password.length < 6) {
      pushToast({ kind: "error", message: L("密码至少 6 位", "Password must be at least 6 characters", "パスワードは6文字以上") });
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
      pushToast({ kind: "error", message: (err as APIError).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-dvh flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md kx-glass-surface p-6 sm:p-8 space-y-4">
        <Link href="/login" className="text-kx-subtle text-sm inline-flex items-center gap-1 hover:text-kx-text">
          <ArrowLeft className="w-4 h-4" /> {L("返回登录", "Back to sign in", "ログインに戻る")}
        </Link>
        <h1 className="text-kx-title font-bold">{L("找回密码", "Reset password", "パスワードを再設定")}</h1>

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
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-kx-text">{L("确认新密码", "Confirm new password", "新しいパスワード（確認）")}</span>
              <input className="kx-input mt-1" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") resetPassword(); }} />
            </label>
            <button className="kx-button-primary w-full h-11 disabled:opacity-60" onClick={resetPassword} disabled={busy}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
              {L("重置密码", "Reset password", "パスワードを再設定")}
            </button>
            <button className="text-kx-subtle text-xs hover:text-kx-text" onClick={() => setStep("request")} disabled={busy}>
              {L("没收到？重新发送", "Didn't get it? Resend", "届かない場合は再送信")}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
