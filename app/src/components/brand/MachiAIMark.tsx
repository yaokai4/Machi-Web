import { forwardRef, useId, type SVGProps } from "react";
import clsx from "clsx";

// Machi AI 自有品牌标志 —— 「灵光 Spark」。Apple 风多彩渐变 squircle
// (粉→紫→蓝→青) + 一颗精致的四角星灵光 + 一颗微光点,玻璃高光带来高级的体积感。web↔iOS 像素级一致
// (见 iOS Machi/Components/MachiAIMark.swift)。
//   <MachiAIMark>   渐变 squircle 徽标 —— 头像 / 入口卡 / 应用与营销
//   <MachiAIGlyph>  单色线形灵光 —— 底部 Tab / 行内,继承 currentColor
//
// 几何(100 网格): 主灵光以 (50,50) 为心、半径 34 的四角星,四边内凹成优雅的
// 细腰; 微光点在右上 (74,28)。线形(24 网格)是同一颗四角星的描边。

const SPARK_MAIN =
  "M50 16 C51.5 38 62 48.5 84 50 C62 51.5 51.5 62 50 84 C48.5 62 38 51.5 16 50 C38 48.5 48.5 38 50 16 Z";
const SPARK_MICRO =
  "M74 21 C74.6 26 75.7 27.1 81 27.7 C75.7 28.3 74.6 29.4 74 34.4 C73.4 29.4 72.3 28.3 67 27.7 C72.3 27.1 73.4 26 74 21 Z";

// 线形(24 网格): 把主灵光缩放到 24 网格(×0.24),以 (12,12) 为心。
const SPARK_GLYPH_24 =
  "M12 3.84 C12.36 9.12 14.88 11.64 20.16 12 C14.88 12.36 12.36 14.88 12 20.16 C11.64 14.88 9.12 12.36 3.84 12 C9.12 11.64 11.64 9.12 12 3.84 Z";

/**
 * 渐变徽标形态:teal squircle + 白色灵光。自带容器,
 * 用 className 控制尺寸(默认 h-12 w-12)。
 */
export function MachiAIMark({ className }: { className?: string }) {
  const gid = useId().replace(/[:]/g, "");
  return (
    <span
      className={clsx(
        "relative inline-flex shrink-0 items-center justify-center",
        className ?? "h-12 w-12",
      )}
      aria-hidden="true"
    >
      <svg viewBox="0 0 100 100" className="h-full w-full" fill="none">
        <defs>
          <linearGradient id={`machiMark-${gid}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#FF6FB5" />
            <stop offset="0.38" stopColor="#A06BF0" />
            <stop offset="0.72" stopColor="#5B8DEF" />
            <stop offset="1" stopColor="#36D6C3" />
          </linearGradient>
          <radialGradient id={`machiGlow-${gid}`} cx="0.32" cy="0.26" r="0.75">
            <stop offset="0" stopColor="#ffffff" stopOpacity="0.24" />
            <stop offset="0.62" stopColor="#ffffff" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect x="4" y="4" width="92" height="92" rx="27" fill={`url(#machiMark-${gid})`} />
        <rect x="4" y="4" width="92" height="92" rx="27" fill={`url(#machiGlow-${gid})`} />
        <path d={SPARK_MAIN} fill="#ffffff" />
        <path d={SPARK_MICRO} fill="#ffffff" fillOpacity="0.9" />
      </svg>
    </span>
  );
}

/**
 * 单色线形形态(继承 currentColor),props 与 lucide 图标一致(forwardRef +
 * SVGProps),可直接替换导航里的 lucide 图标组件。`strokeWidth` 控制描边
 * (与 active/inactive 联动);右上保留一颗实心微光点。
 */
export const MachiAIGlyph = forwardRef<SVGSVGElement, SVGProps<SVGSVGElement>>(
  function MachiAIGlyph({ strokeWidth = 2, fill: _fill, ...rest }, ref) {
    return (
      <svg
        ref={ref}
        viewBox="0 0 24 24"
        width="24"
        height="24"
        fill="none"
        aria-hidden="true"
        {...rest}
      >
        <path
          d={SPARK_GLYPH_24}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <circle cx="19" cy="6" r="1.5" fill="currentColor" stroke="none" />
      </svg>
    );
  },
);
