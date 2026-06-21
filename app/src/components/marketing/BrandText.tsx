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
        // Matches the iOS app icon: soft light-green squircle + emerald "M",
        // no dot. Faint ring keeps the light tile defined on white surfaces.
        "relative inline-flex shrink-0 items-center justify-center rounded-[30%] bg-gradient-to-br from-[#CFEBD9] to-[#A4D9BB] text-[#1F8A6C] shadow-[0_16px_42px_-22px_rgba(15,91,79,0.45)] ring-1 ring-[#0F5B4F]/10",
        className,
      )}
      aria-hidden="true"
    >
      <svg viewBox="0 0 100 100" className="h-[56%] w-[56%]" fill="none">
        <polyline points="24,70 24,34 50,57 76,34 76,70" stroke="currentColor" strokeWidth="13" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
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
