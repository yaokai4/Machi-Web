"use client";

import Link from "next/link";
import { BookOpen, ChevronLeft, Sparkles } from "lucide-react";
import { AppShell } from "@/components/shell/AppShell";

export function NewsListClient({
  title = "Machi Guide",
  subtitle = "旧本地资讯页面已迁移到日本指南。",
}: {
  presetCity?: string;
  title?: string;
  subtitle?: string;
}) {
  return (
    <AppShell requireAuth={false}>
      <header className="sticky top-0 z-30 flex items-center gap-2 px-3 py-2 kx-glass-bar">
        <Link href="/guide" className="grid h-9 w-9 place-items-center rounded-full hover:bg-kx-soft" aria-label="返回指南">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <BookOpen className="h-5 w-5 text-kx-accent" />
        <h1 className="min-w-0 truncate text-lg font-black text-kx-text">{title}</h1>
      </header>
      <div className="px-3 py-4 sm:px-4">
        <section className="kx-card text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-kx-accentSoft text-kx-accent">
            <Sparkles className="h-6 w-6" />
          </span>
          <h2 className="mt-3 text-xl font-black text-kx-text">请使用 Machi Guide</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-7 text-kx-subtle">{subtitle}</p>
          <Link href="/guide" className="kx-button-primary mt-4 inline-flex h-10 px-5">
            打开日本指南
          </Link>
        </section>
      </div>
    </AppShell>
  );
}
