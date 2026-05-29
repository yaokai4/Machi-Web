import clsx from "clsx";

type CardProps = {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
};

export function Card({ children, className, hover = true }: CardProps) {
  return (
    <div
      className={clsx(
        "rounded-[28px] border border-slate-200/80 bg-white/80 shadow-[0_24px_60px_-40px_rgba(15,23,42,0.55)] backdrop-blur-xl",
        "dark:border-white/15 dark:bg-white/[0.05] dark:shadow-[0_24px_60px_-40px_rgba(0,0,0,0.9)]",
        hover && "transition duration-300 ease-out hover:-translate-y-0.5 hover:bg-white/95 hover:shadow-[0_28px_72px_-40px_rgba(15,23,42,0.7)] hover:border-slate-300/80 dark:hover:bg-white/[0.08] dark:hover:border-white/20",
        className,
      )}
    >
      {children}
    </div>
  );
}
