import Link from "next/link";
import clsx from "clsx";

type ButtonVariant = "primary" | "secondary" | "ghost" | "text" | "dark";
type ButtonSize = "sm" | "md" | "lg";

type ButtonProps = {
  children: React.ReactNode;
  className?: string;
  href?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  iconLeft?: React.ReactNode;
  iconRight?: React.ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>;

const variants: Record<ButtonVariant, string> = {
  primary:
    "bg-gradient-to-r from-[#ff6b4a] via-[#ff7a45] to-[#ff4d6d] text-white shadow-[0_18px_46px_-24px_rgba(255,107,74,0.95)] hover:shadow-[0_22px_52px_-24px_rgba(255,107,74,1)]",
  secondary:
    "bg-white/90 text-slate-950 ring-1 ring-slate-200/80 shadow-[0_16px_38px_-28px_rgba(15,23,42,0.7)] backdrop-blur hover:bg-white dark:bg-white/10 dark:text-white dark:ring-white/15 dark:hover:bg-white/15",
  ghost:
    "bg-slate-950/5 text-slate-800 ring-1 ring-slate-900/10 hover:bg-slate-950/10 dark:bg-white/10 dark:text-slate-100 dark:ring-white/15 dark:hover:bg-white/15",
  text: "bg-transparent text-orange-700 hover:text-stone-950 dark:text-orange-300 dark:hover:text-white",
  dark: "bg-slate-950 text-white shadow-[0_18px_44px_-26px_rgba(15,23,42,0.95)] hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-10 px-4 text-sm",
  md: "h-11 px-5 text-[15px]",
  lg: "h-12 px-6 text-base",
};

export function Button({
  children,
  className,
  href,
  variant = "primary",
  size = "md",
  fullWidth = false,
  iconLeft,
  iconRight,
  type = "button",
  ...props
}: ButtonProps) {
  const { onClick, ...buttonProps } = props;
  const classes = clsx(
    "group inline-flex items-center justify-center gap-2 rounded-full font-semibold transition duration-300 ease-out",
    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500",
    "active:scale-[0.98] disabled:pointer-events-none disabled:opacity-60",
    "hover:-translate-y-0.5",
    sizes[size],
    variants[variant],
    fullWidth && "w-full",
    className,
  );

  const content = (
    <>
      {iconLeft ? <span className="shrink-0">{iconLeft}</span> : null}
      <span className="min-w-0 text-center leading-tight">{children}</span>
      {iconRight ? <span className="shrink-0 transition group-hover:translate-x-0.5">{iconRight}</span> : null}
    </>
  );

  if (href) {
    return (
      <Link href={href} className={classes} onClick={onClick as React.MouseEventHandler<HTMLAnchorElement> | undefined}>
        {content}
      </Link>
    );
  }

  return (
    <button className={classes} type={type} onClick={onClick} {...buttonProps}>
      {content}
    </button>
  );
}
