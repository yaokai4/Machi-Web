import clsx from "clsx";

export function BrandText({
  children = "Machi",
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
        "relative inline-flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#ff7a3d] via-[#ff6b4a] to-[#ff4d6d] font-black text-white shadow-[0_16px_42px_-22px_rgba(255,107,74,0.95)]",
        className,
      )}
    >
      M
      <span className="absolute -right-1 -top-1 h-[28%] w-[28%] rounded-full bg-amber-300 ring-2 ring-white dark:ring-slate-950" />
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
  const parts = text.split(/(Machi|Machi)/g);
  return (
    <>
      {parts.map((part, index) =>
        part === "Machi" || part === "Machi" ? (
          <BrandText key={`${part}-${index}`} className={className}>{part}</BrandText>
        ) : (
          part
        ),
      )}
    </>
  );
}
