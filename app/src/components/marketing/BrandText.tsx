import clsx from "clsx";

export function BrandText({
  children = "Machi City",
  className,
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return <span className={clsx("mc-brand-gradient", className)}>{children}</span>;
}

export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      className={clsx(
        "relative inline-flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-600 via-violet-600 to-sky-500 font-black text-white shadow-[0_16px_42px_-22px_rgba(79,70,229,0.95)]",
        className,
      )}
    >
      M
      <span className="absolute -right-1 -top-1 h-[28%] w-[28%] rounded-full bg-orange-400 ring-2 ring-white dark:ring-slate-950" />
    </span>
  );
}

export function BrandPhrase({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const parts = text.split(/(Machi City|Machi)/g);
  return (
    <>
      {parts.map((part, index) =>
        part === "Machi City" || part === "Machi" ? (
          <BrandText key={`${part}-${index}`} className={className}>{part}</BrandText>
        ) : (
          part
        ),
      )}
    </>
  );
}
