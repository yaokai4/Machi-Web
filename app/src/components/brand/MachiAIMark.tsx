import { forwardRef, useId, type SVGProps } from "react";
import clsx from "clsx";

// Machi AI 自有品牌标志 —— 复用 Machi 的「M」字标(见 marketing/BrandText.tsx 的
// BrandMark polyline),在 M 的怀抱里嵌一颗四角星「灵光」。不是通用 sparkles。
// 两种形态,web↔iOS 像素级一致:
//   <MachiAIMark>  渐变 squircle 徽标 —— 头像 / 入口卡 / 应用与营销
//   <MachiAIGlyph> 单色线形字符 —— 底部 Tab / 行内,继承 currentColor
//
// M 顶点: 左下(30,72) 左上(30,40) 谷底(50,58) 右上(70,40) 右下(70,72)
// 灵光: 以谷底上方 (50,47) 为心的四角星,落在 M 的怀抱里。

const M_POLYLINE = "30,72 30,40 50,58 70,40 70,72";
const SPARK_PATH =
  "M50 39.5 L52.8 44.2 L57.5 47 L52.8 49.8 L50 54.5 L47.2 49.8 L42.5 47 L47.2 44.2 Z";

// 线形(24 网格): M + 谷底怀抱里的小灵光
const M_POLYLINE_24 = "5,18 5,8 12,14 19,8 19,18";
const SPARK_PATH_24 =
  "M12 8 L12.9 9.7 L14.2 10.6 L12.9 11.5 L12 13.2 L11.1 11.5 L9.8 10.6 L11.1 9.7 Z";

/**
 * 渐变徽标形态:teal squircle + 白色 M + 白色灵光。自带容器,
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
            <stop offset="0" stopColor="#23AC92" />
            <stop offset="1" stopColor="#0C5247" />
          </linearGradient>
        </defs>
        <rect x="4" y="4" width="92" height="92" rx="27" fill={`url(#machiMark-${gid})`} />
        <polyline
          points={M_POLYLINE}
          fill="none"
          stroke="#ffffff"
          strokeWidth="11"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d={SPARK_PATH} fill="#ffffff" />
      </svg>
    </span>
  );
}

/**
 * 单色线形形态(继承 currentColor),props 与 lucide 图标一致(forwardRef +
 * SVGProps),可直接替换导航里的 lucide 图标组件。`strokeWidth` 控制 M 笔画
 * (与 active/inactive 联动);灵光始终实心填充,不随 fill="none" 消失。
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
        <polyline
          points={M_POLYLINE_24}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d={SPARK_PATH_24} fill="currentColor" stroke="none" />
      </svg>
    );
  },
);
