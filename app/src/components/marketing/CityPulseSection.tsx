"use client";

import { MapPin, MessageCircle, Radio, Sparkles, UsersRound } from "lucide-react";
import type { MarketingLocale } from "@/data/machi-home";
import { BrandPhrase } from "./BrandText";
import { useMarketingI18n } from "./MarketingI18n";

// Community section: local Q&A plus groups, merged into one story.
// Sample content deliberately differs from the hero mockup (Osaka /
// Kyoto / Yokohama scenes) so the page reads as breadth, not template.
const copyByLocale: Record<
  MarketingLocale,
  {
    label: string;
    title: string;
    body: string;
    pulse: string;
    panelTitle: string;
    liveLabel: string;
    cities: Array<[string, string]>;
    echoes: Array<[string, string]>;
    groupsLabel: string;
    groups: string[];
    topics: Array<[string, string]>;
  }
> = {
  zh: {
    label: "同城社区",
    title: "你遇到的问题，这座城市里也许已经有人走过。",
    body: "租房合同怎么看，手续先办哪一项，周末附近有什么活动。问题落在具体的城市里，回答才有真正可用的背景。",
    pulse: "同一座城市，让经验离需要它的人更近。",
    panelTitle: "本周话题",
    liveLabel: "正在发生",
    cities: [["东京", "美食 · 语言交换"], ["大阪", "租房 · 工作"], ["京都", "住宿 · 漫步"]],
    echoes: [
      ["有人发问", "大阪梅田上班，一个人住哪个区通勤方便？"],
      ["有人回应", "我在福岛区住了两年，房租和通勤都可以细说。"],
      ["有人约起", "周日鸭川边散步，慢走闲聊，还差三个人。"],
    ],
    groupsLabel: "本地小组",
    groups: ["一起吃饭", "咖啡与聊天", "周末活动", "运动小组", "语言交换", "城市漫步", "本地互助", "新住民支持"],
    topics: [
      ["横滨有推荐的日语教室吗？", "12 条回应"],
      ["搬家前，大件家具怎么处理？", "9 条回应"],
      ["三月末退税，需要准备什么？", "7 条回应"],
    ],
  },
  en: {
    label: "Local community",
    title: "Someone in the city has probably faced the same question.",
    body: "How to read a lease, which paperwork comes first, what is happening nearby this weekend. An answer becomes useful when it comes with a real place and context.",
    pulse: "Keep local experience close to the people who need it.",
    panelTitle: "This week",
    liveLabel: "Happening now",
    cities: [["Tokyo", "Dining · Languages"], ["Osaka", "Housing · Jobs"], ["Kyoto", "Stays · Walks"]],
    echoes: [
      ["Someone asks", "Working near Umeda, Osaka — which area is easy to commute from?"],
      ["Someone answers", "Two years in Fukushima ward. Happy to break down rent and the commute."],
      ["Someone connects", "Sunday walk along the Kamo river. Slow pace, good talk — three spots left."],
    ],
    groupsLabel: "Local groups",
    groups: ["Dinner together", "Coffee & chat", "Weekend plans", "Sports", "Language exchange", "City walks", "Mutual help", "Newcomer support"],
    topics: [
      ["Any good Japanese classes in Yokohama?", "12 replies"],
      ["Moving out — what to do with big furniture?", "9 replies"],
      ["Tax refund in March: what do I prepare?", "7 replies"],
    ],
  },
  ja: {
    label: "街のコミュニティ",
    title: "その困りごと、同じ街で先に経験した人がいるかもしれません。",
    body: "賃貸契約の見方、手続きの順番、週末に参加できる催し。具体的な街と背景があってこそ、回答は実際の暮らしに役立ちます。",
    pulse: "街の経験を、必要としている人の近くに。",
    panelTitle: "今週の話題",
    liveLabel: "いま",
    cities: [["東京", "食事 · 言語交換"], ["大阪", "住まい · 仕事"], ["京都", "宿 · 街歩き"]],
    echoes: [
      ["誰かが聞く", "梅田で働く予定です。一人暮らしにおすすめのエリアは？"],
      ["誰かが答える", "福島区に2年住んでいました。家賃と通勤事情、詳しくお伝えできます。"],
      ["誰かとつながる", "日曜、鴨川沿いをゆっくり歩きませんか。あと三人入れます。"],
    ],
    groupsLabel: "地域グループ",
    groups: ["ごはん会", "コーヒーと雑談", "週末の予定", "スポーツ", "言語交換", "街歩き", "助け合い", "新生活サポート"],
    topics: [
      ["横浜でおすすめの日本語教室は？", "回答 12 件"],
      ["引っ越し前、大きな家具はどうする？", "回答 9 件"],
      ["3月の還付申告、何を準備すればいい？", "回答 7 件"],
    ],
  },
};

export function CityPulseSection() {
  const { locale } = useMarketingI18n();
  const copy = copyByLocale[locale];

  return (
    <section id="pulse" className="relative overflow-hidden px-5 py-14 sm:px-6 lg:py-20">
      <div className="mc-echo-field absolute left-1/2 top-1/2 -z-10 h-[680px] w-[680px] -translate-x-1/2 -translate-y-1/2 opacity-70" aria-hidden="true">
        <span className="mc-echo-ring mc-echo-ring-a" />
        <span className="mc-echo-ring mc-echo-ring-b" />
        <span className="mc-city-dot left-[22%] top-[36%]" />
        <span className="mc-city-dot right-[26%] top-[25%]" />
        <span className="mc-city-dot bottom-[22%] left-[48%]" />
      </div>

      <div className="mx-auto grid max-w-[1180px] gap-8 lg:grid-cols-[0.92fr_1.08fr] lg:items-center">
        <div className="mc-reveal">
          <p className="mc-eyebrow">{copy.label}</p>
          <h2 className="mt-4 text-3xl font-black leading-tight tracking-[-0.015em] text-slate-950 sm:text-5xl dark:text-white">
            <BrandPhrase text={copy.title} />
          </h2>
          <p className="mt-5 max-w-2xl text-base leading-8 text-slate-700 sm:text-lg dark:text-slate-300">
            <BrandPhrase text={copy.body} />
          </p>
          <p className="mt-6 inline-flex rounded-full bg-[#151515] px-4 py-2 text-sm font-bold text-white shadow-[0_18px_44px_-28px_rgba(21,21,21,0.7)]">
            {copy.pulse}
          </p>

          <p className="mt-8 text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
            {copy.groupsLabel}
          </p>
          <div className="mt-3 flex max-w-xl flex-wrap gap-2">
            {copy.groups.map((group) => (
              <span
                key={group}
                className="rounded-full border border-white/70 bg-white/80 px-3.5 py-1.5 text-[13px] font-bold text-slate-700 shadow-[0_8px_22px_-18px_rgba(15,23,42,0.5)] backdrop-blur dark:border-white/10 dark:bg-white/[0.06] dark:text-slate-200"
              >
                {group}
              </span>
            ))}
          </div>
        </div>

        <div className="mc-reveal relative rounded-[32px] border border-white/80 bg-white/82 p-4 shadow-[0_28px_90px_-58px_rgba(28,25,23,0.55)] backdrop-blur-xl dark:border-white/10 dark:bg-white/[0.05] sm:p-6">
          <div className="mc-map-grid pointer-events-none absolute inset-0 opacity-60 dark:opacity-15" />
          <div className="relative grid gap-4">
            <div className="flex flex-wrap gap-2">
              {copy.cities.map(([city, scenes]) => (
                <span key={city} className="inline-flex items-center gap-2 rounded-full bg-stone-950 px-3 py-2 text-xs font-black text-white">
                  <MapPin className="h-3.5 w-3.5 text-orange-300" aria-hidden="true" />
                  {city}
                  <span className="text-white/55">{scenes}</span>
                </span>
              ))}
            </div>

            <div className="grid gap-3">
              {copy.echoes.map(([title, body], index) => (
                <article key={title} className={`mc-reveal mc-reveal-${index + 1} rounded-[24px] bg-white/92 p-4 shadow-[0_18px_46px_-40px_rgba(28,25,23,0.65)] ring-1 ring-stone-200/70 dark:bg-white/[0.07] dark:ring-white/10`}>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-orange-50 text-orange-600 ring-1 ring-orange-100 dark:bg-orange-500/10 dark:text-orange-200 dark:ring-orange-300/20">
                      {index === 0 ? <MessageCircle className="h-4 w-4" /> : index === 1 ? <Sparkles className="h-4 w-4" /> : <UsersRound className="h-4 w-4" />}
                    </span>
                    <p className="text-xs font-black uppercase text-stone-500 dark:text-stone-400">{title}</p>
                  </div>
                  <p className="mt-3 text-base font-bold leading-7 text-stone-950 dark:text-white">{body}</p>
                </article>
              ))}
            </div>

            <div className="rounded-[24px] bg-[#282321] p-4 text-white shadow-[0_22px_60px_-40px_rgba(55,40,43,0.85)] ring-1 ring-white/10">
              <p className="flex items-center gap-2 text-sm font-black">
                <Radio className="h-4 w-4 text-orange-400" aria-hidden="true" />
                {copy.panelTitle}
                <span className="ml-auto inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-white/45">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" aria-hidden="true" />
                  {copy.liveLabel}
                </span>
              </p>
              <ul className="mt-3 divide-y divide-white/[0.08]">
                {copy.topics.map(([topic, meta]) => (
                  <li key={topic} className="flex items-baseline justify-between gap-3 py-2.5">
                    <span className="min-w-0 flex-1 truncate text-sm font-bold text-white/90">{topic}</span>
                    <span className="shrink-0 text-[11px] font-semibold text-white/40">{meta}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
