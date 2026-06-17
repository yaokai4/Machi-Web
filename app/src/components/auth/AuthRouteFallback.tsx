import { BrandMark, BrandText } from "@/components/marketing/BrandText";

export function AuthRouteFallback({ title = "正在打开 Machi" }: { title?: string }) {
  return (
    <main className="kx-auth-page grid min-h-dvh place-items-center px-4 py-10">
      <section className="w-full max-w-md rounded-[28px] border border-kx-stroke bg-kx-card p-6 text-center shadow-kx-glow">
        <BrandMark className="mx-auto h-14 w-14 rounded-[18px] text-2xl" />
        <h1 className="mt-4 text-2xl font-black text-kx-text"><BrandText>Machi</BrandText></h1>
        <p className="mt-2 text-sm font-bold text-kx-subtle">{title}</p>
        <div className="mt-6 space-y-3" aria-hidden="true">
          <div className="mx-auto h-3 w-44 animate-pulse rounded-full bg-kx-soft" />
          <div className="h-11 animate-pulse rounded-kx-lg bg-kx-soft" />
          <div className="h-11 animate-pulse rounded-kx-lg bg-kx-soft" />
        </div>
      </section>
    </main>
  );
}
