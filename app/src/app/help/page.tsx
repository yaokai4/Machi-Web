"use client";

import Link from "next/link";
import { ArrowLeft, HelpCircle, MessageSquareWarning, FileText, Shield } from "lucide-react";
import { AppShell } from "@/components/shell/AppShell";
import { BrandPhrase } from "@/components/marketing/BrandText";

const FAQS = [
  { q: "Web 端的数据和 iOS App 是同步的吗？", a: "是的。Web 端与 iOS App 共享同一个 API 与数据库。你在 Web 上发布、点赞、评论、转发、关注、私信、收藏的所有操作都会立即同步给 App，反之亦然。" },
  { q: "如何上传图片或视频？", a: "投稿面板里点击「媒体」按钮选择文件，或直接拖拽进入面板。单个文件最大 50MB。" },
  { q: "如何关注或屏蔽某个用户？", a: "进入对方主页，点击「关注」即可。屏蔽请点击主页右侧的「拉黑」。" },
  { q: "怎么导出我的数据？", a: "设置 → 数据导出。会下载一份包含你所有公开帖子与评论的 JSON 文件。" },
  { q: "私信发送失败怎么办？", a: "Web 端会在状态栏提示，发送失败的消息会保留在输入框，可点击重新发送。" },
];

export default function HelpPage() {
  return (
    <AppShell>
      <header className="sticky top-0 z-30 kx-glass-bar px-3 py-2 flex items-center gap-2">
        <Link href="/settings" className="kx-button-ghost h-9 w-9 p-0"><ArrowLeft className="w-4 h-4" /></Link>
        <h1 className="text-lg font-bold">帮助中心</h1>
      </header>
      <div className="px-3 sm:px-4 py-3 space-y-3">
        <section className="kx-card flex items-start gap-3">
          <HelpCircle className="w-5 h-5 text-kx-accent shrink-0 mt-0.5" />
          <div>
            <h2 className="font-semibold text-base"><BrandPhrase text="关于 Machi" /></h2>
            <p className="text-sm text-kx-subtle mt-1 leading-relaxed">
              <BrandPhrase text="Machi 是一个按城市组织真实生活经验的社区。Web 与 iOS App 共用同一套账号、数据与 API；新闻、租房、工作、二手、美食、活动、问答和避坑经验都围绕你选择的城市展开。" />
            </p>
          </div>
        </section>
        <section className="kx-card">
          <h3 className="kx-section-title mb-3 px-0">常见问题</h3>
          <ul className="space-y-3">
            {FAQS.map((f) => (
              <li key={f.q}>
                <div className="font-semibold text-sm text-kx-text">{f.q}</div>
                <p className="text-sm text-kx-subtle mt-1 leading-relaxed">{f.a}</p>
              </li>
            ))}
          </ul>
        </section>
        <section className="kx-card p-0 overflow-hidden">
          <Link href="/feedback" className="kx-row text-sm">
            <span className="inline-flex items-center gap-2"><MessageSquareWarning className="w-4 h-4 text-kx-muted" /> 反馈问题</span>
            <span>›</span>
          </Link>
          <Link href="/legal/terms" className="kx-row text-sm border-t border-kx-stroke/30">
            <span className="inline-flex items-center gap-2"><FileText className="w-4 h-4 text-kx-muted" /> 用户协议</span>
            <span>›</span>
          </Link>
          <Link href="/legal/privacy" className="kx-row text-sm border-t border-kx-stroke/30">
            <span className="inline-flex items-center gap-2"><Shield className="w-4 h-4 text-kx-muted" /> 隐私政策</span>
            <span>›</span>
          </Link>
        </section>
      </div>
    </AppShell>
  );
}
