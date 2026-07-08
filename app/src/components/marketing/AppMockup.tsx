"use client";

import { Flame, Languages, MapPin, MessageCircle, Radio, UsersRound } from "lucide-react";
import clsx from "clsx";
import type { MarketingLocale } from "@/data/machi-home";
import { useMarketingI18n } from "./MarketingI18n";

const pulseCopy: Record<
  MarketingLocale,
  {
    title: string;
    subtitle: string;
    live: string;
    languageLabel: string;
    sceneLabel: string;
    cities: string[];
    scenes: string[];
    languages: string[];
    messages: string[];
    posts: Array<{ meta: string; title: string; replies: string; heat: string }>;
  }
> = {
  zh: {
    title: "城市回声",
    subtitle: "有用的信息被留下，也有人在此刻回应。",
    live: "东京正在发生",
    languageLabel: "语言",
    sceneLabel: "生活场景",
    cities: ["东京", "大阪", "京都"],
    scenes: ["美食", "线下活动", "租房", "语言交换", "城市活动"],
    languages: ["中文", "EN", "日本語"],
    messages: ["刚到涩谷，有没有适合一个人去的拉面店？", "这个周末附近有什么社区活动？"],
    posts: [
      { meta: "东京 · 美食", title: "周五晚上，涩谷有哪些拉面店值得去？", replies: "3 条本地回复 · 中文 / EN", heat: "热度上升" },
      { meta: "东京 · 语言交换", title: "想在涩谷附近找日英语言交换。", replies: "12 条回复 · EN / 日本語", heat: "正在热门" },
      { meta: "东京 · 租房", title: "第一次在新宿租房，有哪些细节容易忽略？", replies: "28 条经验 · 中文", heat: "经验较多" },
    ],
  },
  en: {
    title: "City Pulse",
    subtitle: "Local information and local people, organized by city and language.",
    live: "Tokyo pulse",
    languageLabel: "Languages",
    sceneLabel: "Social scenes",
    cities: ["Tokyo", "Osaka", "Kyoto"],
    scenes: ["Dining", "Meetups", "Housing", "Language Exchange", "Events"],
    languages: ["中文", "EN", "日本語"],
    messages: ["I just moved near Shibuya — any good ramen spots?", "Any local events this weekend?"],
    posts: [
      { meta: "Tokyo · Dining", title: "Good ramen spots in Shibuya for Friday night?", replies: "3 community replies · 中文 / EN", heat: "Rising" },
      { meta: "Tokyo · Language Exchange", title: "Looking for Japanese-English exchange near Shibuya.", replies: "12 replies · EN / 日本語", heat: "Hot" },
      { meta: "Tokyo · Housing", title: "What should I avoid when renting in Shinjuku?", replies: "28 answers · 中文", heat: "Trusted" },
    ],
  },
  ja: {
    title: "街のいま",
    subtitle: "必要な情報と、同じ街で暮らす人の経験が行き交います。",
    live: "東京でいま",
    languageLabel: "言語",
    sceneLabel: "暮らしの場面",
    cities: ["東京", "大阪", "京都"],
    scenes: ["食事", "地域の集まり", "住まい", "言語交換", "イベント"],
    languages: ["中文", "EN", "日本語"],
    messages: ["渋谷に来たばかりです。一人でも入りやすいラーメン店はありますか？", "今週末、近くで参加できる地域イベントはありますか？"],
    posts: [
      { meta: "東京 · 食事", title: "金曜の夜、渋谷で一人でも入りやすいラーメン店は？", replies: "地域から3件の返信 · 中文 / EN", heat: "注目度上昇" },
      { meta: "東京 · 言語交換", title: "渋谷の近くで、日英の言語交換を探しています。", replies: "12件の返信 · EN / 日本語", heat: "話題" },
      { meta: "東京 · 住まい", title: "新宿で初めて部屋を借りるとき、何に気をつければいい？", replies: "28件の経験談 · 中文", heat: "参考多数" },
    ],
  },
};

// Avatar dots stay inside the two brand families (warm coral / cool
// indigo) — emerald + amber here pushed the card into rainbow territory.
const avatarColors = [
  "from-orange-300 to-rose-400",
  "from-indigo-300 to-sky-400",
  "from-rose-300 to-orange-400",
  "from-sky-300 to-indigo-400",
];

export function AppMockup() {
  const { locale } = useMarketingI18n();
  const copy = pulseCopy[locale];

  return (
    <div className="mc-hero-device relative mx-auto w-full max-w-[520px]">
      <div className="mc-echo-field absolute inset-0 -z-10" aria-hidden="true">
        <span className="mc-echo-ring mc-echo-ring-a" />
        <span className="mc-echo-ring mc-echo-ring-b" />
        <span className="mc-city-dot left-[18%] top-[26%]" />
        <span className="mc-city-dot right-[17%] top-[36%]" />
        <span className="mc-city-dot bottom-[18%] left-[48%]" />
      </div>

      <div className="mc-float relative overflow-hidden rounded-[32px] border border-white/80 bg-white/86 p-4 shadow-[0_34px_100px_-58px_rgba(28,25,23,0.5)] backdrop-blur-xl dark:border-white/10 dark:bg-white/[0.06] sm:p-5">
        <div className="mc-map-grid pointer-events-none absolute inset-0 opacity-60 dark:opacity-15" />
        <div className="relative">
          <header className="flex items-start justify-between gap-4 rounded-[24px] bg-[#151515] p-4 text-white shadow-[0_22px_50px_-30px_rgba(15,15,15,0.8)]">
            <div>
              <p className="inline-flex items-center gap-1.5 text-[11px] font-black uppercase text-orange-200">
                <Radio className="h-3.5 w-3.5" aria-hidden="true" />
                {copy.live}
              </p>
              <h3 className="mt-2 text-2xl font-black leading-tight sm:text-3xl">{copy.title}</h3>
              <p className="mt-2 max-w-xs text-sm leading-6 text-white/68">{copy.subtitle}</p>
            </div>
            <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-orange-400/18 text-orange-200 ring-1 ring-orange-200/20">
              <Flame className="h-5 w-5" aria-hidden="true" />
            </span>
          </header>

          <div className="mt-4 flex flex-wrap gap-2">
            {copy.cities.map((city) => (
              <span key={city} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-white px-3 text-xs font-black text-stone-700 ring-1 ring-stone-200/80 dark:bg-white/10 dark:text-stone-100 dark:ring-white/10">
                <MapPin className="h-3.5 w-3.5 text-orange-500" aria-hidden="true" />
                {city}
              </span>
            ))}
          </div>

          <div className="mt-4 grid gap-3">
            {copy.posts.map((post, index) => (
              <article
                key={post.title}
                className={clsx(
                  "relative overflow-hidden rounded-[24px] border bg-white/92 p-4 shadow-[0_18px_46px_-36px_rgba(28,25,23,0.5)] backdrop-blur dark:border-white/10 dark:bg-white/[0.07]",
                  index === 1 ? "border-indigo-100" : "border-orange-100/90",
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-black text-orange-600 dark:text-orange-300">{post.meta}</p>
                  <span className="rounded-full bg-orange-50 px-2.5 py-1 text-[10px] font-black text-orange-700 ring-1 ring-orange-100 dark:bg-orange-500/10 dark:text-orange-200 dark:ring-orange-300/20">
                    {post.heat}
                  </span>
                </div>
                <h4 className="mt-2 text-base font-black leading-snug text-stone-950 dark:text-white">{post.title}</h4>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <p className="text-xs font-bold text-stone-500 dark:text-stone-400">{post.replies}</p>
                  <div className="flex -space-x-2" aria-label="people replied">
                    {avatarColors.slice(0, index + 2).map((color, avatarIndex) => (
                      <span
                        key={`${post.title}-${avatarIndex}`}
                        className={clsx("h-7 w-7 rounded-full bg-gradient-to-br ring-2 ring-white dark:ring-stone-950", color)}
                      />
                    ))}
                  </div>
                </div>
              </article>
            ))}
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-[0.9fr_1.1fr]">
            <div className="rounded-[24px] border border-stone-200/70 bg-white/86 p-4 dark:border-white/10 dark:bg-white/[0.05]">
              <div className="flex items-center gap-2 text-xs font-black text-stone-500 dark:text-stone-400">
                <Languages className="h-4 w-4 text-indigo-500" aria-hidden="true" />
                {copy.languageLabel}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {copy.languages.map((language) => (
                  <span key={language} className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-black text-indigo-700 ring-1 ring-indigo-100 dark:bg-indigo-500/10 dark:text-indigo-200 dark:ring-indigo-300/20">
                    {language}
                  </span>
                ))}
              </div>
            </div>

            <div className="rounded-[24px] border border-stone-200/70 bg-white/86 p-4 dark:border-white/10 dark:bg-white/[0.05]">
              <div className="flex items-center gap-2 text-xs font-black text-stone-500 dark:text-stone-400">
                <UsersRound className="h-4 w-4 text-orange-500" aria-hidden="true" />
                {copy.sceneLabel}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {copy.scenes.map((scene) => (
                  <span key={scene} className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-black text-stone-700 dark:bg-white/10 dark:text-stone-200">
                    {scene}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-4 space-y-2">
            {copy.messages.map((message, index) => (
              <div
                key={message}
                className={clsx(
                  "flex items-start gap-2",
                  index % 2 === 1 && "justify-end",
                )}
              >
                {index % 2 === 0 ? <MessageCircle className="mt-2 h-4 w-4 text-orange-500" aria-hidden="true" /> : null}
                <p className={clsx(
                  "max-w-[78%] rounded-2xl px-3 py-2 text-sm font-bold leading-5 shadow-sm",
                  index % 2 === 0
                    ? "bg-orange-50 text-stone-800 ring-1 ring-orange-100 dark:bg-orange-500/10 dark:text-orange-50 dark:ring-orange-300/20"
                    : "bg-[#765f78] text-white",
                )}>
                  {message}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
