"use client";

import { useState } from "react";
import Link from "next/link";
import { Mail, ArrowLeft } from "lucide-react";
import { useToasts } from "@/lib/store";

export default function ForgotPage() {
  const [email, setEmail] = useState("");
  const pushToast = useToasts((s) => s.push);
  return (
    <div className="min-h-dvh flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md kx-glass-surface p-6 sm:p-8 space-y-4">
        <Link href="/login" className="text-kx-subtle text-sm inline-flex items-center gap-1 hover:text-kx-text">
          <ArrowLeft className="w-4 h-4" /> 返回登录
        </Link>
        <h1 className="text-kx-title font-bold">找回密码</h1>
        <p className="text-sm text-kx-subtle">
          填写你账号绑定的邮箱，我们会发送一封重置邮件。
        </p>
        <label className="block">
          <span className="text-sm font-semibold text-kx-text">邮箱</span>
          <input className="kx-input mt-1" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <button
          className="kx-button-primary w-full h-11"
          onClick={() => {
            if (!email.trim()) return;
            pushToast({ kind: "info", message: "重置邮件功能将由后端开通后启用" });
          }}
        >
          <Mail className="w-4 h-4" />
          发送重置邮件
        </button>
      </div>
    </div>
  );
}
