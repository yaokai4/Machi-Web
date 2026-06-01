"use client";

import { Coffee, HeartHandshake, Languages, MessageCircle, Soup, UsersRound } from "lucide-react";
import clsx from "clsx";
import type { MarketingLocale } from "@/data/machi-home";
import { BrandPhrase } from "./BrandText";
import { useMarketingI18n } from "./MarketingI18n";

const socialCopy: Record<
  MarketingLocale,
  {
    label: string;
    title: string;
    body: string;
    city: string;
    peopleTitle: string;
    peopleMeta: string;
    chips: string[];
    cards: Array<{ title: string; body: string; meta: string; icon: "dining" | "language" | "event" | "help" }>;
    bubbles: string[];
  }
> = {
  zh: {
    label: "Social Connection",
    title: "不只是找信息，也是在城市里认识人。",
    body: "饭搭子、咖啡搭子、活动搭子、运动搭子、语言交换伙伴、周末同行、新朋友、本地互助、同城兴趣小组，以及初到城市的生活支持。",
    city: "Tokyo · 同城连接",
    peopleTitle: "附近的人",
    peopleMeta: "同城朋友 · 饭搭子 · 语言交换",
    chips: ["饭搭子", "咖啡搭子", "活动搭子", "运动搭子", "语言交换伙伴", "周末同行", "新朋友", "本地互助", "同城兴趣小组", "初到城市的生活支持"],
    cards: [
      { title: "饭搭子卡片", body: "周五涩谷拉面，有人一起吗？", meta: "3 people nearby", icon: "dining" },
      { title: "语言交换卡片", body: "EN / 日本語 exchange near Shibuya.", meta: "12 replies", icon: "language" },
      { title: "活动搭子卡片", body: "周末展览 + 咖啡，有同行吗？", meta: "5 interested", icon: "event" },
      { title: "本地互助卡片", body: "刚到东京，想问办卡和找房顺序。", meta: "Answered by locals", icon: "help" },
    ],
    bubbles: ["我也在附近，可以一起去。", "先约公共场所比较安心。"],
  },
  en: {
    label: "Social Connection",
    title: "More than local information — meet people in your city.",
    body: "Dining buddies, coffee companions, event companions, sports partners, language exchange partners, weekend plans, new friends, local help, city-based interest groups and support when you are new to a city.",
    city: "Tokyo · Local connections",
    peopleTitle: "People nearby",
    peopleMeta: "local friends · dining buddies · language exchange",
    chips: ["dining buddies", "coffee companions", "event companions", "sports partners", "language exchange partners", "weekend plans", "new friends", "local help", "city-based interest groups", "support when you are new to a city"],
    cards: [
      { title: "Dining buddy", body: "Ramen in Shibuya this Friday?", meta: "3 people nearby", icon: "dining" },
      { title: "Language exchange", body: "EN / 日本語 exchange near Shibuya.", meta: "12 replies", icon: "language" },
      { title: "Event companion", body: "Weekend gallery + coffee?", meta: "5 interested", icon: "event" },
      { title: "Local help", body: "New in Tokyo. What should I set up first?", meta: "Answered by locals", icon: "help" },
    ],
    bubbles: ["I am nearby too. Want to join?", "Public places first feels safer."],
  },
  ja: {
    label: "Social Connection",
    title: "情報を探すだけでなく、同じ街の人とつながる。",
    body: "食事仲間、カフェ仲間、イベント仲間、スポーツ仲間、言語交換パートナー、週末の予定、新しい友達、ローカルな助け合い、都市別の趣味グループ、新しい街での生活サポート。",
    city: "Tokyo · 同じ街のつながり",
    peopleTitle: "近くの人",
    peopleMeta: "友達 · 食事仲間 · 言語交換",
    chips: ["食事仲間", "カフェ仲間", "イベント仲間", "スポーツ仲間", "言語交換パートナー", "週末の予定", "新しい友達", "ローカルな助け合い", "都市別の趣味グループ", "新しい街での生活サポート"],
    cards: [
      { title: "食事仲間", body: "金曜に渋谷でラーメンに行ける人？", meta: "3 people nearby", icon: "dining" },
      { title: "言語交換", body: "EN / 日本語 exchange near Shibuya.", meta: "12 replies", icon: "language" },
      { title: "イベント仲間", body: "週末の展示とカフェ、一緒に行ける人？", meta: "5 interested", icon: "event" },
      { title: "ローカルな助け合い", body: "東京に来たばかり。手続きの順番を知りたい。", meta: "Answered by locals", icon: "help" },
    ],
    bubbles: ["近くにいます。一緒に行けます。", "初回は公共の場所が安心です。"],
  },
};

const icons = {
  dining: Soup,
  language: Languages,
  event: Coffee,
  help: HeartHandshake,
};

const avatarClassNames = [
  "from-orange-300 to-rose-400",
  "from-indigo-300 to-sky-400",
  "from-emerald-300 to-teal-500",
  "from-amber-200 to-orange-400",
  "from-fuchsia-300 to-indigo-400",
];

export function SocialConnectionSection() {
  const { locale } = useMarketingI18n();
  const copy = socialCopy[locale];

  return (
    <section id="social" className="relative overflow-hidden px-5 py-14 sm:px-6 lg:py-20">
      <div className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,rgba(255,240,236,0)_0%,rgba(255,217,214,0.82)_45%,rgba(255,240,236,0)_100%)] dark:bg-[linear-gradient(180deg,rgba(11,13,18,0)_0%,rgba(42,22,26,0.55)_48%,rgba(11,13,18,0)_100%)]" />
      <div className="mx-auto grid max-w-[1180px] gap-10 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
        <div className="mc-reveal">
          <p className="mc-eyebrow">{copy.label}</p>
          <h2 className="mt-4 text-3xl font-black leading-tight text-slate-950 sm:text-5xl dark:text-white">
            <BrandPhrase text={copy.title} />
          </h2>
          <p className="mt-5 max-w-2xl text-base leading-8 text-slate-700 sm:text-lg dark:text-slate-300">
            <BrandPhrase text={copy.body} />
          </p>
          <div className="mt-7 flex flex-wrap gap-2">
            {copy.chips.map((chip) => (
              <span key={chip} className="rounded-full bg-white/84 px-3 py-2 text-xs font-black text-stone-700 ring-1 ring-stone-200/80 dark:bg-white/10 dark:text-stone-200 dark:ring-white/10">
                {chip}
              </span>
            ))}
          </div>
        </div>

        <div className="mc-reveal relative rounded-[32px] border border-white/80 bg-white/82 p-4 shadow-[0_28px_90px_-58px_rgba(28,25,23,0.55)] backdrop-blur-xl dark:border-white/10 dark:bg-white/[0.05] sm:p-6">
          <div className="relative rounded-[28px] bg-[#151515] p-4 text-white">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-black text-orange-200">{copy.city}</p>
                <h3 className="mt-2 text-2xl font-black">{copy.peopleTitle}</h3>
              </div>
              <div className="flex -space-x-2" aria-label="local people">
                {avatarClassNames.map((color) => (
                  <span key={color} className={clsx("h-10 w-10 rounded-full bg-gradient-to-br ring-2 ring-[#151515]", color)} />
                ))}
              </div>
            </div>
            <div className="mt-4 flex items-center gap-2 rounded-2xl bg-white/10 px-3 py-2 text-sm font-bold text-white/78">
              <UsersRound className="h-4 w-4 text-orange-200" aria-hidden="true" />
              {copy.peopleMeta}
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {copy.cards.map((card) => {
              const Icon = icons[card.icon];
              return (
                <article key={card.title} className="rounded-[24px] border border-stone-200/70 bg-white/94 p-4 shadow-[0_18px_46px_-40px_rgba(28,25,23,0.65)] dark:border-white/10 dark:bg-white/[0.07]">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-orange-50 text-orange-600 ring-1 ring-orange-100 dark:bg-orange-500/10 dark:text-orange-200 dark:ring-orange-300/20">
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <h3 className="mt-3 text-base font-black text-stone-950 dark:text-white">{card.title}</h3>
                  <p className="mt-2 text-sm font-bold leading-6 text-stone-700 dark:text-stone-300">{card.body}</p>
                  <p className="mt-3 text-xs font-black text-stone-400">{card.meta}</p>
                </article>
              );
            })}
          </div>

          <div className="mt-4 space-y-2">
            {copy.bubbles.map((bubble, index) => (
              <div key={bubble} className={clsx("flex", index === 1 && "justify-end")}>
                <p className={clsx(
                  "inline-flex max-w-[82%] items-center gap-2 rounded-2xl px-3 py-2 text-sm font-bold shadow-sm",
                  index === 0
                    ? "bg-orange-50 text-stone-800 ring-1 ring-orange-100 dark:bg-orange-500/10 dark:text-orange-50 dark:ring-orange-300/20"
                    : "bg-indigo-600 text-white",
                )}>
                  <MessageCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {bubble}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
