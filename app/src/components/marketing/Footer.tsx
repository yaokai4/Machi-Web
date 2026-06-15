"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandMark, BrandPhrase, BrandText } from "./BrandText";
import { useMarketingI18n } from "./MarketingI18n";

const socials = ["X", "Instagram", "TikTok", "YouTube", "LinkedIn"];

/// Real routes for every footer link. Order matches the labels in
/// `copy.footer.groups` so the i18n table stays drop-in. Each href
/// must point at an actual page under `src/app/*` — never a dead
/// anchor — or the user lands on a 404.
const groupHrefs: string[][] = [
  // 导航 / Navigation / ナビ
  ["/about", "/features", "/guide", "/business", "/safety", "/faq"],
  // 合作 / Partners
  ["/business", "/ads", "/jobs-promotion", "/housing-promotion", "/partners"],
  // 法律 / Legal
  [
    "/legal/privacy",
    "/legal/terms",
    "/legal/membership-terms",
    "/legal/service-terms",
    "/legal/refund-policy",
    "/legal/community-guidelines",
    "/legal/commercial-disclosure",
    "/legal/cookie-policy",
    "/contact",
  ],
];

export function Footer() {
  const { copy } = useMarketingI18n();
  const pathname = usePathname();
  const localePrefix = pathname === "/zh" || pathname.startsWith("/zh/")
    ? "/zh"
    : pathname === "/en" || pathname.startsWith("/en/")
      ? "/en"
      : pathname === "/ja" || pathname.startsWith("/ja/")
        ? "/ja"
        : "";
  const hrefFor = (href: string) => {
    if (!localePrefix) return href;
    if (href === "/") return localePrefix;
    return `${localePrefix}${href}`;
  };

  return (
    <footer className="bg-white/48 px-5 py-12 shadow-[inset_0_1px_0_rgba(255,255,255,0.62)] backdrop-blur sm:px-6 dark:bg-slate-950/42">
      <div className="mx-auto grid max-w-[1120px] gap-10 lg:grid-cols-[1.2fr_1.8fr]">
        <div>
          <Link href={hrefFor("/")} className="inline-flex items-center gap-3">
            <BrandMark className="h-12 w-12 text-lg" />
            <span>
              <BrandText className="block text-xl font-black">Machi</BrandText>
              <span className="mt-1 block text-sm font-semibold text-slate-500 dark:text-slate-400">{copy.footer.tagline}</span>
            </span>
          </Link>
          <p className="mt-6 max-w-sm text-sm leading-6 text-slate-600 dark:text-slate-400">
            <BrandPhrase text={copy.footer.description} />
          </p>
          <ul className="mt-6 flex flex-wrap gap-2" aria-label="Machi social channels">
            {socials.map((social) => (
              <li key={social}>
                <a
                  href="#top"
                  aria-label={`${social} — coming soon`}
                  className="inline-flex rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600 transition hover:bg-slate-950 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:bg-white/10 dark:text-slate-300 dark:hover:bg-white dark:hover:text-slate-950"
                >
                  {social}
                </a>
              </li>
            ))}
          </ul>
        </div>

        <div className="grid gap-8 sm:grid-cols-3">
          {copy.footer.groups.map(([title, links], groupIndex) => (
            <div key={title}>
              <h3 className="text-sm font-black text-slate-950 dark:text-white">{title}</h3>
              <ul className="mt-4 space-y-3">
                {links.map((label, linkIndex) => {
                  const href = groupHrefs[groupIndex]?.[linkIndex] ?? "/";
                  return (
                    <li key={`${title}-${label}`}>
                      <Link
                        href={hrefFor(href)}
                        className="text-sm font-semibold text-slate-500 transition hover:text-slate-950 dark:text-slate-400 dark:hover:text-white"
                      >
                        {label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </div>

      <div className="mx-auto mt-10 flex max-w-[1120px] flex-col gap-3 pt-6 text-sm font-semibold text-slate-500 sm:flex-row sm:items-center sm:justify-between dark:text-slate-500">
        <p>© 2026 <BrandText className="font-black">Machi</BrandText>. All rights reserved.</p>
        <p className="flex items-center gap-2.5">
          <a
            href="https://yaokai.me/about"
            target="_blank"
            rel="noopener noreferrer"
            className="transition hover:text-slate-950 dark:hover:text-white"
          >
            Made by YAOKAI · yaokai.me
          </a>
          <span aria-hidden="true" className="text-slate-300 dark:text-white/20">·</span>
          <span>machicity.com</span>
        </p>
      </div>
    </footer>
  );
}
