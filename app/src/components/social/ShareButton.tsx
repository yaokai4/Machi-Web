"use client";

// 通用分享按钮:优先系统分享面板(navigator.share),不支持则复制链接。
// 全站复用——活动、房间、帖子、个人主页都用它,链接打开即 web 端。

import { useState } from "react";
import { Check, Share2 } from "lucide-react";

interface ShareButtonProps {
  /** Absolute or relative URL to share. Relative is resolved against the current origin. */
  url: string;
  title?: string;
  text?: string;
  /** Icon-only round button (for toolbars). Otherwise a labelled pill. */
  compact?: boolean;
  label?: string;
  className?: string;
}

function absolute(url: string): string {
  if (typeof window === "undefined") return url;
  try {
    return new URL(url, window.location.origin).toString();
  } catch {
    return url;
  }
}

export function ShareButton({ url, title, text, compact = false, label = "分享", className }: ShareButtonProps) {
  const [copied, setCopied] = useState(false);

  async function handleShare() {
    const link = absolute(url);
    // navigator.share 需要安全上下文 + 用户手势;失败一律回落到复制。
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title, text, url: link });
        return;
      } catch {
        /* 用户取消或不支持 → 复制 */
      }
    }
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      // 极端环境(无 clipboard 权限)兜底:选中提示
      window.prompt("复制此链接分享:", link);
      return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  if (compact) {
    return (
      <button
        type="button"
        onClick={handleShare}
        aria-label={label}
        className={
          className ??
          "rounded-full p-2 text-kx-muted transition hover:bg-kx-soft hover:text-kx-text"
        }
      >
        {copied ? <Check className="h-4 w-4 text-kx-accent" /> : <Share2 className="h-4 w-4" />}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleShare}
      className={
        className ??
        "inline-flex items-center gap-1.5 rounded-full bg-kx-card/85 px-3.5 py-2 text-xs font-black shadow-sm backdrop-blur transition hover:bg-kx-card"
      }
    >
      {copied ? <Check className="h-3.5 w-3.5 text-kx-accent" /> : <Share2 className="h-3.5 w-3.5" />}
      {copied ? "已复制链接" : label}
    </button>
  );
}
