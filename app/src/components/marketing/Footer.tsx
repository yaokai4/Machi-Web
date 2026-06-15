"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { BrandMark, BrandPhrase, BrandText } from "./BrandText";
import { useMarketingI18n } from "./MarketingI18n";
import { api, type SiteSettings } from "@/lib/api";

const socialChannels: Array<{ key: keyof SiteSettings; label: string; tone: string; mark: string }> = [
  { key: "social_x_url", label: "X", tone: "from-slate-950 to-slate-700", mark: "X" },
  { key: "social_instagram_url", label: "Instagram", tone: "from-[#f97316] via-[#ec4899] to-[#6366f1]", mark: "IG" },
  { key: "social_tiktok_url", label: "TikTok", tone: "from-slate-950 via-[#111827] to-[#ef4444]", mark: "TT" },
  { key: "social_youtube_url", label: "YouTube", tone: "from-[#ef4444] to-[#b91c1c]", mark: "YT" },
  { key: "social_linkedin_url", label: "LinkedIn", tone: "from-[#0a66c2] to-[#164e8a]", mark: "in" },
  { key: "social_xiaohongshu_url", label: "小红书", tone: "from-[#ff2442] to-[#c91834]", mark: "红" },
  { key: "social_douyin_url", label: "抖音", tone: "from-slate-950 via-[#111827] to-[#06b6d4]", mark: "抖" },
];

/// Real routes for every footer link. Order matches the labels in
/// `copy.footer.groups` so the i18n table stays drop-in. Each href
/// must point at an actual page under `src/app/*` — never a dead
/// anchor — or the user lands on a 404.
const groupHrefs: string[][] = [
  // 导航 / Navigation / ナビ
  ["/about", "/features", "/guide", "/business", "/safety", "/faq", "/cities", "/download"],
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
  const siteSettings = useQuery({
    queryKey: ["site-settings"],
    queryFn: () => api.siteSettings(),
    staleTime: 300_000,
  });
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
            {socialChannels.map((social) => {
              const href = (siteSettings.data?.[social.key] || "").trim();
              const active = /^https?:\/\//i.test(href);
              return (
              <li key={social.key}>
                <a
                  href={active ? href : "#top"}
                  target={active ? "_blank" : undefined}
                  rel={active ? "noopener noreferrer" : undefined}
                  aria-label={active ? social.label : `${social.label} link not configured`}
                  aria-disabled={!active}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 ${
                    active
                      ? "bg-slate-100 text-slate-700 hover:bg-slate-950 hover:text-white dark:bg-white/10 dark:text-slate-300 dark:hover:bg-white dark:hover:text-slate-950"
                      : "cursor-default bg-slate-100/70 text-slate-400 dark:bg-white/7 dark:text-slate-500"
                  }`}
                >
                  <SocialGlyph mark={social.mark} tone={social.tone} />
                  <span>{social.label}</span>
                </a>
              </li>
              );
            })}
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
        </p>
      </div>
    </footer>
  );
}

function SocialGlyph({ mark, tone }: { mark: string; tone: string }) {
  return (
    <span className={`grid h-5 w-5 place-items-center rounded-full bg-gradient-to-br ${tone} text-[9px] font-black leading-none text-white shadow-sm`}>
      {mark}
    </span>
  );
}
