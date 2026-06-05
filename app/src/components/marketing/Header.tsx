"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Globe2, Menu, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { localeOptions } from "@/data/machi-home";
import { Button } from "./Button";
import { BrandMark, BrandText } from "./BrandText";
import { useMarketingI18n } from "./MarketingI18n";
import { ThemeToggle } from "./ThemeToggle";
import { api } from "@/lib/api";

// Marketing site header with compact brand, locale switcher and auth entry.
// Adds a subtle "scrolled" state that lifts the capsule with a deeper
// shadow / stronger glass once the user has moved past the hero, so the
// header reads as floating without ever being intrusive.
export function Header() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { copy, locale, setLocale } = useMarketingI18n();
  const siteSettings = useQuery({
    queryKey: ["site-settings"],
    queryFn: () => api.siteSettings(),
    staleTime: 300_000,
  });
  const brandTitle = siteSettings.data?.site_title || "Machi";
  const logoUrl = siteSettings.data?.logo_url || "";
  const pathname = usePathname();
  const router = useRouter();
  const explicitLocale = pathname === "/zh" || pathname.startsWith("/zh/")
    ? "zh"
    : pathname === "/en" || pathname.startsWith("/en/")
      ? "en"
      : pathname === "/ja" || pathname.startsWith("/ja/")
        ? "ja"
        : null;
  const stripLocalePrefix = (path: string) => {
    const stripped = path.replace(/^\/(zh|en|ja)(?=\/|$)/, "");
    return stripped || "/";
  };
  const prefixFor = (targetLocale: "zh" | "en" | "ja") => `/${targetLocale}`;
  const routeLocale = explicitLocale ?? locale;
  const localePrefix = explicitLocale ? prefixFor(routeLocale) : routeLocale === "zh" ? "" : prefixFor(routeLocale);
  const hrefFor = (href: string) => {
    if (href.startsWith("#")) return pathname !== "/" ? `${localePrefix || ""}/${href}` : href;
    if (!localePrefix || !href.startsWith("/")) return href;
    if (href === "/") return localePrefix;
    if (href.startsWith("/#")) return `${localePrefix}${href}`;
    return `${localePrefix}${href}`;
  };
  const hrefForLocale = (targetLocale: "zh" | "en" | "ja") => {
    const stripped = stripLocalePrefix(pathname);
    if (stripped === "/") return prefixFor(targetLocale);
    return `${prefixFor(targetLocale)}${stripped}`;
  };
  const switchLocale = (targetLocale: "zh" | "en" | "ja") => {
    setLocale(targetLocale);
    router.push(hrefForLocale(targetLocale));
    setOpen(false);
  };

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      setScrolled(window.scrollY > 12);
    };
    const onScroll = () => {
      if (raf) return;
      raf = window.requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      if (raf) window.cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const scrollY = window.scrollY;
    const previousBodyOverflow = document.body.style.overflow;
    const previousBodyPosition = document.body.style.position;
    const previousBodyTop = document.body.style.top;
    const previousBodyLeft = document.body.style.left;
    const previousBodyRight = document.body.style.right;
    const previousBodyWidth = document.body.style.width;
    const previousRootOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.left = "0";
    document.body.style.right = "0";
    document.body.style.width = "100%";
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.body.style.position = previousBodyPosition;
      document.body.style.top = previousBodyTop;
      document.body.style.left = previousBodyLeft;
      document.body.style.right = previousBodyRight;
      document.body.style.width = previousBodyWidth;
      document.documentElement.style.overflow = previousRootOverflow;
      window.scrollTo(0, scrollY);
    };
  }, [open]);

  return (
    <header className="mc-site-header fixed inset-x-0 top-0 z-[80] px-4 sm:px-5">
      {open ? (
        <button
          type="button"
          aria-label={copy.nav.closeMenu}
          className="fixed inset-0 z-10 bg-slate-950/10 backdrop-blur-[2px] md:hidden dark:bg-black/30"
          onClick={() => setOpen(false)}
        />
      ) : null}
      <div
        className={clsx(
          "relative z-30 mx-auto w-full max-w-[1080px] rounded-full border px-3 py-2 backdrop-blur-2xl transition-all duration-300 lg:w-fit",
          // Resting state — light, airy. Scrolled state — a bit more
          // opaque, deeper shadow, so the bar visibly separates from
          // content underneath.
          scrolled
            ? "border-white/80 bg-white/[0.86] shadow-[0_14px_44px_-22px_rgba(15,23,42,0.32)] dark:border-white/15 dark:bg-slate-950/80 dark:shadow-[0_20px_60px_-32px_rgba(0,0,0,0.95)]"
            : "border-white/70 bg-white/[0.7] shadow-[0_10px_30px_-22px_rgba(15,23,42,0.22)] dark:border-white/10 dark:bg-slate-950/55 dark:shadow-[0_14px_42px_-28px_rgba(0,0,0,0.8)]",
          open && "shadow-[0_28px_90px_-54px_rgba(79,70,229,0.92)]",
        )}
      >
        <div className="flex items-center gap-3 lg:gap-5">
          <Link
            href={hrefFor("/")}
            className="flex shrink-0 items-center gap-2.5 rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-indigo-500"
          >
            {logoUrl ? (
              <span
                className="h-9 w-9 shrink-0 rounded-full bg-cover bg-center bg-no-repeat shadow-[0_16px_42px_-22px_rgba(79,70,229,0.95)] ring-1 ring-slate-900/10 sm:h-10 sm:w-10"
                style={{ backgroundImage: `url("${logoUrl.replace(/"/g, "%22")}")` }}
                role="img"
                aria-label={brandTitle}
              />
            ) : (
              <BrandMark className="h-9 w-9 text-sm sm:h-10 sm:w-10 sm:text-base" />
            )}
            <span className="hidden leading-none min-[360px]:flex">
              <BrandText className="whitespace-nowrap text-base font-black sm:text-lg">{brandTitle}</BrandText>
            </span>
          </Link>

          <nav className="hidden min-w-0 items-center justify-center gap-0.5 lg:flex">
            {copy.nav.items.map(([label, href]) => (
              <Link
                key={href}
                href={hrefFor(href)}
                className="whitespace-nowrap rounded-full px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-950/[0.05] hover:text-slate-950 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white xl:px-3.5"
              >
                {label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto hidden shrink-0 items-center gap-2 md:flex lg:ml-0">
            <div
              className="flex items-center gap-0.5 rounded-full bg-slate-950/[0.05] p-1 ring-1 ring-slate-900/[0.08] dark:bg-white/10 dark:ring-white/15"
              aria-label={copy.nav.language}
            >
              <Globe2 className="ml-2 h-4 w-4 text-slate-500 dark:text-slate-400" />
              {localeOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => switchLocale(option.value)}
                  className={clsx(
                    "h-8 rounded-full px-2.5 text-xs font-black transition",
                    locale === option.value
                      ? "bg-white text-indigo-700 shadow-sm dark:bg-slate-900 dark:text-sky-300"
                      : "text-slate-500 hover:text-slate-950 dark:text-slate-400 dark:hover:text-white",
                  )}
                >
                  {option.shortLabel}
                </button>
              ))}
            </div>
            <ThemeToggle compact />
            <Button href="/register" variant="text" size="sm" className="shrink-0 whitespace-nowrap">
              {copy.nav.register}
            </Button>
            <Button href="/login" variant="dark" size="sm" className="shrink-0 whitespace-nowrap">
              {copy.nav.signIn}
            </Button>
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-1.5 md:hidden">
            <span className="inline-flex">
              <ThemeToggle compact />
            </span>
            <Link
              href="/login"
              className="hidden h-9 items-center justify-center whitespace-nowrap rounded-full bg-slate-950 px-3 text-xs font-black text-white shadow-sm min-[420px]:inline-flex dark:bg-white dark:text-slate-950"
            >
              {copy.nav.signIn}
            </Link>
            <button
              type="button"
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-950/[0.05] text-slate-800 ring-1 ring-slate-900/[0.08] transition hover:bg-slate-950/10 active:scale-95 dark:bg-white/10 dark:text-slate-100 dark:ring-white/15 dark:hover:bg-white/20"
              aria-label={open ? copy.nav.closeMenu : copy.nav.openMenu}
              aria-expanded={open}
              onClick={() => setOpen((value) => !value)}
            >
              <span className="relative h-5 w-5">
                <Menu className={clsx("absolute inset-0 h-5 w-5 transition duration-200", open ? "scale-75 opacity-0" : "scale-100 opacity-100")} />
                <X className={clsx("absolute inset-0 h-5 w-5 transition duration-200", open ? "scale-100 opacity-100" : "scale-75 opacity-0")} />
              </span>
            </button>
          </div>
        </div>
      </div>

      <div
        className={clsx(
          "absolute left-4 right-4 top-[calc(100%+0.55rem)] z-40 mx-auto max-w-[1080px] md:hidden",
          "origin-top transform-gpu transition duration-[240ms] ease-out",
          open ? "pointer-events-auto translate-y-0 scale-100 opacity-100" : "pointer-events-none -translate-y-2 scale-[0.985] opacity-0",
        )}
      >
        <nav className="rounded-[28px] border border-white/75 bg-white/[0.94] p-2 shadow-[0_30px_90px_-58px_rgba(15,23,42,0.9)] backdrop-blur-2xl dark:border-white/10 dark:bg-slate-950/[0.9]">
          {copy.nav.items.map(([label, href], index) => (
            <Link
              key={href}
              href={hrefFor(href)}
              onClick={() => setOpen(false)}
              className="mc-menu-item flex items-center justify-between rounded-2xl px-4 py-3 text-base font-bold text-slate-700 transition hover:bg-slate-950/[0.05] dark:text-slate-200 dark:hover:bg-white/10"
              style={{ animationDelay: `${index * 34}ms` }}
            >
              <span>{label}</span>
              <span className="h-1.5 w-1.5 rounded-full bg-gradient-to-r from-indigo-500 to-sky-400 opacity-60" />
            </Link>
          ))}
          <div className="grid grid-cols-3 gap-2 px-1 pt-2">
            {localeOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => switchLocale(option.value)}
                className={clsx(
                  "h-10 rounded-2xl text-sm font-black ring-1 transition active:scale-[0.98]",
                  locale === option.value
                    ? "bg-gradient-to-r from-indigo-600 via-violet-600 to-sky-500 text-white ring-transparent shadow-[0_12px_34px_-22px_rgba(79,70,229,0.95)]"
                    : "bg-white text-slate-600 ring-slate-200 hover:text-slate-950 dark:bg-white/10 dark:text-slate-200 dark:ring-white/15",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="grid gap-2 px-1 pt-2">
            <Button href="/login" variant="dark" fullWidth onClick={() => setOpen(false)}>
              {copy.nav.signIn}
            </Button>
            <Button href="/register" variant="secondary" fullWidth onClick={() => setOpen(false)}>
              {copy.nav.register}
            </Button>
          </div>
        </nav>
      </div>
    </header>
  );
}
