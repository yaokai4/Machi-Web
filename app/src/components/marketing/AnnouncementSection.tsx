"use client";

import { Bell, FileText, Megaphone, Newspaper, Smartphone, type LucideIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { Announcement } from "@/data/machi-home";
import { BrandPhrase } from "./BrandText";
import { useMarketingI18n } from "./MarketingI18n";

// Match every category the admin CMS can publish, plus the legacy ones.
// Anything that doesn't match falls back to <FileText/>.
const ICON_BY_TYPE: Record<string, LucideIcon> = {
  // zh
  "公告": Megaphone,
  "新闻": Newspaper,
  "App 更新": Smartphone,
  "App更新": Smartphone,
  "通知": Bell,
  "信息": FileText,
  // en
  "Announcement": Megaphone,
  "News": Newspaper,
  "App Update": Smartphone,
  "Notice": Bell,
  "Info": FileText,
  // ja
  "お知らせ": Megaphone,
  "ニュース": Newspaper,
  "アプリ更新": Smartphone,
  "ご案内": Bell,
  "トピック": FileText,
  "情報": FileText,
};
function iconFor(type: string): LucideIcon {
  return ICON_BY_TYPE[type] || FileText;
}

// Public-facing announcement list for official updates.
export function AnnouncementSection() {
  const { copy, locale } = useMarketingI18n();
  const [items, setItems] = useState<Announcement[]>(copy.announcementsSection.defaultItems);

  const storageKey = useMemo(() => `machi-marketing-announcements-${locale}`, [locale]);

  useEffect(() => {
    const defaults = copy.announcementsSection.defaultItems;
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (!stored) {
        setItems(defaults);
        return;
      }
      const parsed = JSON.parse(stored);
      // Defensive: only accept a non-empty array of well-shaped items.
      // A previous deploy may have written a different schema here and
      // a missing field would crash <BrandPhrase /> on render.
      if (!Array.isArray(parsed) || parsed.length === 0) {
        setItems(defaults);
        return;
      }
      const valid: Announcement[] = parsed
        .filter(
          (item): item is Announcement =>
            !!item &&
            typeof item === "object" &&
            typeof (item as Announcement).title === "string" &&
            typeof (item as Announcement).body === "string" &&
            typeof (item as Announcement).type === "string" &&
            typeof (item as Announcement).date === "string",
        );
      setItems(valid.length > 0 ? valid : defaults);
    } catch {
      setItems(defaults);
    }
  }, [copy.announcementsSection.defaultItems, storageKey]);

  return (
    <section id="announcements" className="relative px-5 py-14 sm:px-6 lg:py-20">
      <div className="mx-auto grid max-w-[1120px] gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
        <div className="mc-reveal max-w-xl">
          <p className="text-sm font-black text-sky-700 dark:text-sky-300">{copy.announcementsSection.label}</p>
          <h2 className="mt-4 text-3xl font-black leading-tight text-slate-950 sm:text-5xl dark:text-white">
            <BrandPhrase text={copy.announcementsSection.title} />
          </h2>
          <p className="mt-5 text-base leading-8 text-slate-600 sm:text-lg dark:text-slate-300">
            <BrandPhrase text={copy.announcementsSection.body} />
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            {copy.announcementsSection.tabs.map((tab) => (
              <span
                key={tab}
                className="rounded-full border border-sky-100 bg-white/80 px-3 py-1.5 text-xs font-black text-slate-600 shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/5 dark:text-slate-300"
              >
                {tab}
              </span>
            ))}
          </div>
        </div>

        <div className="mc-reveal grid gap-3 md:grid-cols-2">
          {items.slice(0, 6).map((item, index) => {
            const Icon = iconFor(item.type);
            return (
              <article
                key={`${item.title}-${index}`}
                className={`rounded-[26px] border border-slate-200/80 bg-white/[0.85] p-5 shadow-[0_20px_60px_-46px_rgba(15,23,42,0.7)] backdrop-blur transition duration-300 hover:-translate-y-1 hover:bg-white hover:border-slate-300/80 dark:border-white/15 dark:bg-white/[0.06] dark:hover:bg-white/[0.09] dark:hover:border-white/20 ${
                  index === 0 ? "md:col-span-2" : ""
                }`}
              >
                <div className="flex items-start gap-3">
                  <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-700 ring-1 ring-indigo-100 dark:bg-indigo-500/10 dark:text-indigo-300 dark:ring-indigo-400/20">
                    <Icon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-600 dark:bg-white/10 dark:text-slate-300">
                        {item.type}
                      </span>
                      <span className="text-xs font-bold text-slate-400 dark:text-slate-500">{item.date}</span>
                    </div>
                    <h3 className="mt-3 text-lg font-black leading-6 text-slate-950 dark:text-white"><BrandPhrase text={item.title} /></h3>
                    <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-400"><BrandPhrase text={item.body} /></p>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
