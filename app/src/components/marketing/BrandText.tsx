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
        "relative inline-flex shrink-0 items-center justify-center rounded-[30%] bg-gradient-to-br from-[#2BB089] via-[#1A9C76] to-[#138C68] text-white shadow-[0_16px_42px_-22px_rgba(26,156,118,0.9)]",
        className,
      )}
      aria-hidden="true"
    >
      {/* Rooftop "M": the two peaks read as a small skyline — local life in a city. */}
      <svg viewBox="0 0 100 100" className="h-[56%] w-[56%]" fill="none">
        <polyline points="24,70 24,34 50,57 76,34 76,70" stroke="currentColor" strokeWidth="13" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {/* Locator dot — the "echo" that pins the brand to a place. */}
      <span className="absolute -right-1 -top-1 h-[26%] w-[26%] rounded-full bg-[#F4A33A] ring-2 ring-white dark:ring-slate-950" />
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
