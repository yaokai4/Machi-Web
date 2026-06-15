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
    note: string;
    city: string;
    peopleTitle: string;
    peopleMeta: string;
    chips: string[];
    cards: Array<{ title: string; body: string; meta: string; icon: "dining" | "language" | "event" | "help" }>;
    bubbles: string[];
  }
> = {
  zh: {
    label: "同城社区",
    title: "一座城市开始熟悉，常常只是因为有人愿意多说一句。",
    body: "在 Machi，你可以问一个具体的问题，分享自己走过的路，也可以加入城市话题、语言交换、本地活动与兴趣小组。",
    note: "交流从公开、具体的城市生活开始。彼此尊重、保留边界，也为线下见面留好安全余地。",
    city: "Tokyo · 同城社区",
    peopleTitle: "同城社区",
    peopleMeta: "城市话题 · 本地小组 · 语言交换",
    chips: ["一起吃饭", "咖啡与聊天", "周末活动", "运动小组", "语言交换", "展览与散步", "本地互助", "兴趣小组", "新住民支持"],
    cards: [
      { title: "一起吃饭", body: "周五晚上去涩谷吃拉面，还有人想一起吗？", meta: "3 条回复", icon: "dining" },
      { title: "语言交换", body: "涩谷附近的 English / 日本語 交流小组。", meta: "12 条回复", icon: "language" },
      { title: "周末活动", body: "周六看完展览，附近找家咖啡店坐坐。", meta: "5 人感兴趣", icon: "event" },
      { title: "本地互助", body: "刚到东京，想问办卡和找房的顺序。", meta: "本地用户已解答", icon: "help" },
    ],
    bubbles: ["我也对这个本地活动感兴趣。", "线下社区活动请选择公共场所，并遵守安全提示。"],
  },
  en: {
    label: "Local community",
    title: "A city starts to feel familiar when someone takes a moment to share what they know.",
    body: "Ask a specific question, leave useful experience behind, or join a city discussion, language exchange, local event, or interest group.",
    note: "Conversations begin in public, with a clear local purpose. Respect, personal boundaries, and safer in-person choices come first.",
    city: "Tokyo · City community",
    peopleTitle: "Local community",
    peopleMeta: "city topics · local groups · language exchange",
    chips: ["Shared meals", "Coffee & conversation", "Weekend plans", "Sports groups", "Language exchange", "Galleries & walks", "Local help", "Interest groups", "Newcomer support"],
    cards: [
      { title: "Dinner plans", body: "Ramen in Shibuya on Friday night. Anyone want to join?", meta: "3 replies", icon: "dining" },
      { title: "Language exchange", body: "English / 日本語 exchange group near Shibuya.", meta: "12 replies", icon: "language" },
      { title: "Weekend plans", body: "Gallery on Saturday, then coffee somewhere nearby.", meta: "5 interested", icon: "event" },
      { title: "Local help", body: "New in Tokyo. What should I set up first?", meta: "Answered by locals", icon: "help" },
    ],
    bubbles: ["I'm also interested in this local event.", "For offline community activities, meet in public places and follow safety guidelines."],
  },
  ja: {
    label: "地域コミュニティ",
    title: "誰かがひと言教えてくれるだけで、街は少し身近になります。",
    body: "具体的な質問をしたり、自分の経験を次の人へ残したり。街の話題、言語交換、地域の催し、趣味のグループにも参加できます。",
    note: "やり取りは、公開された明確な目的から始めます。相手への敬意と適切な距離を保ち、対面するときの安全も大切にします。",
    city: "Tokyo · 街のコミュニティ",
    peopleTitle: "街のコミュニティ",
    peopleMeta: "街の話題 · 地域グループ · 言語交換",
    chips: ["一緒にごはん", "カフェで交流", "週末の予定", "スポーツ", "言語交換", "展示と街歩き", "地域の助け合い", "趣味のグループ", "新生活サポート"],
    cards: [
      { title: "一緒にごはん", body: "金曜の夜、渋谷でラーメンを食べませんか。", meta: "返信 3 件", icon: "dining" },
      { title: "言語交換", body: "渋谷周辺の English / 日本語 交流グループ。", meta: "返信 12 件", icon: "language" },
      { title: "週末の予定", body: "土曜に展示を見たあと、近くでコーヒーでも。", meta: "興味あり 5 人", icon: "event" },
      { title: "地域の助け合い", body: "東京に来たばかり。手続きは何から始めればいい？", meta: "地域のユーザーが回答", icon: "help" },
    ],
    bubbles: ["この地域イベントに興味があります。", "オフラインのコミュニティ活動は公共の場所で、安全ガイドラインに従ってください。"],
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
      <div className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,rgba(255,248,242,0)_0%,rgba(255,248,242,0.82)_45%,rgba(255,248,242,0)_100%)] dark:bg-[linear-gradient(180deg,rgba(11,13,18,0)_0%,rgba(28,25,23,0.55)_48%,rgba(11,13,18,0)_100%)]" />
      <div className="mx-auto grid max-w-[1180px] gap-10 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
        <div className="mc-reveal">
          <p className="mc-eyebrow">{copy.label}</p>
          <h2 className="mt-4 text-3xl font-black leading-tight text-slate-950 sm:text-5xl dark:text-white">
            <BrandPhrase text={copy.title} />
          </h2>
          <p className="mt-5 max-w-2xl text-base leading-8 text-slate-700 sm:text-lg dark:text-slate-300">
            <BrandPhrase text={copy.body} />
          </p>
          <p className="mt-4 max-w-2xl rounded-2xl border border-stone-200/70 bg-white/70 px-4 py-3 text-sm leading-7 text-stone-500 dark:border-white/10 dark:bg-white/[0.04] dark:text-stone-400">
            {copy.note}
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
              <div className="flex -space-x-2" aria-label="city community">
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
                    : "bg-[#765f78] text-white",
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
