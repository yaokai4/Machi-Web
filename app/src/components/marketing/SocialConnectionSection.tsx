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
    label: "City Community",
    title: "一座城市真正的入口，是有人愿意与你分享生活。",
    body: "在 Machi，你可以寻找信息，也可以留下经验；可以参加城市话题、语言交换与本地活动，也可以在需要时认真问一句。",
    note: "所有连接都从公开、具体的城市生活开始，并以尊重、边界与安全为前提。",
    city: "Tokyo · 同城社区",
    peopleTitle: "同城社区",
    peopleMeta: "城市话题 · 本地小组 · 语言交换",
    chips: ["美食聚会", "本地咖啡讨论", "活动小组", "运动小组", "语言交换小组", "周末本地活动", "社区连接", "本地互助", "同城兴趣小组", "初到城市的生活支持"],
    cards: [
      { title: "美食聚会讨论", body: "周五涩谷拉面聚会，有人想一起讨论吗？", meta: "3 条社区回复", icon: "dining" },
      { title: "语言交换小组", body: "涩谷附近 EN / 日本語 语言交换小组。", meta: "12 条回复", icon: "language" },
      { title: "本地活动讨论", body: "周末展览 + 咖啡的本地活动讨论。", meta: "5 人感兴趣", icon: "event" },
      { title: "本地互助", body: "刚到东京，想问办卡和找房的顺序。", meta: "本地用户已解答", icon: "help" },
    ],
    bubbles: ["我也对这个本地活动感兴趣。", "线下社区活动请选择公共场所，并遵守安全提示。"],
  },
  en: {
    label: "City Community",
    title: "The truest way into a city is through people willing to share how life works there.",
    body: "On Machi, you can look for practical information and leave something useful behind. Join a city discussion, find a language exchange or local event, or ask an honest question when you need help.",
    note: "Every connection begins with public, specific city life and is shaped by respect, boundaries, and safety.",
    city: "Tokyo · City community",
    peopleTitle: "Local community",
    peopleMeta: "city topics · local groups · language exchange",
    chips: ["food meetups", "local café discussions", "event groups", "sports groups", "language exchange groups", "weekend community posts", "community connections", "local help", "city interest groups", "newcomer support"],
    cards: [
      { title: "Food meetup", body: "Shibuya ramen meetup discussion for this Friday.", meta: "3 community replies", icon: "dining" },
      { title: "Language exchange group", body: "EN / 日本語 exchange group near Shibuya.", meta: "12 replies", icon: "language" },
      { title: "Event participation", body: "Weekend local event discussion (gallery + coffee).", meta: "5 interested", icon: "event" },
      { title: "Local help", body: "New in Tokyo. What should I set up first?", meta: "Answered by locals", icon: "help" },
    ],
    bubbles: ["I'm also interested in this local event.", "For offline community activities, meet in public places and follow safety guidelines."],
  },
  ja: {
    label: "City Community",
    title: "街へのいちばん自然な入口は、暮らしを分けてくれる人との出会いです。",
    body: "Machi では、必要な情報を探すだけでなく、自分の経験を次の人へ残せます。街の話題に参加し、言語交換や地域の催しを見つけ、困ったときには率直に尋ねることができます。",
    note: "つながりの起点は、公開された具体的な街の暮らしです。互いへの敬意、適切な距離、安全を大切にします。",
    city: "Tokyo · 街のコミュニティ",
    peopleTitle: "街のコミュニティ",
    peopleMeta: "都市トピック · 地域グループ · 言語交換",
    chips: ["食事の集まり", "地域カフェ討論", "イベントグループ", "スポーツグループ", "言語交換グループ", "週末の地域イベント", "コミュニティのつながり", "ローカルな助け合い", "都市別の趣味グループ", "新しい街での生活サポート"],
    cards: [
      { title: "食事の集まり", body: "金曜に渋谷でラーメンの集まりを相談。", meta: "コミュニティ返信 3 件", icon: "dining" },
      { title: "言語交換グループ", body: "渋谷周辺の EN / 日本語 言語交換グループ。", meta: "返信 12 件", icon: "language" },
      { title: "地域イベント", body: "週末の展示とカフェの地域イベント討論。", meta: "興味あり 5 人", icon: "event" },
      { title: "ローカルな助け合い", body: "東京に来たばかり。手続きの順番を知りたい。", meta: "地域ユーザーが回答", icon: "help" },
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
