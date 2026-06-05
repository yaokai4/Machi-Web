"use client";

import { CheckCircle2, CircleSlash, MessageSquareDashed, Search, UsersRound } from "lucide-react";
import type { MarketingLocale } from "@/data/machi-home";
import { BrandPhrase } from "./BrandText";
import { useMarketingI18n } from "./MarketingI18n";

const whyCopy: Record<
  MarketingLocale,
  {
    label: string;
    title: string;
    body: string;
    machi: string;
    comparisons: Array<[string, string]>;
  }
> = {
  zh: {
    label: "Why Machi",
    title: "Machi 不是普通信息平台，而是城市生活信息 + 本地经验 + 同城社区 + 真实的本地连接。",
    body: "它的独特价值不是“信息很多”，而是在每一座城市，找到生活的回声；在生活的回声里，遇到能搭把手的人。",
    machi: "Machi 按城市、语言、频道、兴趣和真实生活场景组织信息与人，让你不仅能找到本地信息，也能在同一座城市里互相帮上忙。",
    comparisons: [
      ["微信群 / Line 群", "信息沉底、无法搜索、容易错过重点，也很难认识群外的新朋友。"],
      ["Facebook Groups", "噪音多、分类弱、跨语言体验差，社交连接不够精确。"],
      ["Craigslist / 传统分类站", "偏交易，缺少真实经验、问答和人与人之间的连接。"],
      ["小红书 / 社交媒体", "内容分散，城市结构不稳定，适合浏览，但不一定适合建立本地关系。"],
      ["点评 / 黄页类 App", "偏商户评分和列表，缺少真实经验、问答和人与人之间的本地互助。"],
    ],
  },
  en: {
    label: "Why Machi",
    title: "Machi is not a classifieds board. It is local life information + lived experience + city-based community + real local connection.",
    body: "The value is not “more posts.” It is finding the echoes of life in every city, then finding people who can actually help inside those echoes.",
    machi: "Machi organizes information and people by city, language, channel, interest and real-life scene, so you can find local information and help each other in the same city.",
    comparisons: [
      ["WeChat / LINE groups", "Information sinks, search is weak, important things are missed and it is hard to connect with people beyond the group."],
      ["Facebook Groups", "Noisy, weakly categorized, poor cross-language experience and imprecise social connection."],
      ["Craigslist / classifieds", "Transaction-heavy, with little lived experience, Q&A or person-to-person connection."],
      ["Social media feeds", "Content is scattered, city structure is unstable and browsing does not always build local relationships."],
      ["Review / listing apps", "Focused on ratings and listings, with little lived experience, Q&A or local mutual help between people."],
    ],
  },
  ja: {
    label: "Why Machi",
    title: "Machi は単なる情報サイトではなく、地域情報 + 生活経験 + 同じ街のコミュニティ + 本物のローカルなつながりの場所です。",
    body: "価値は「情報が多い」ことではありません。すべての街で暮らしのこだまを見つけ、そのこだまの中で助け合える人とつながることです。",
    machi: "Machi は都市、言語、チャンネル、興味、生活シーンで情報と人を整理し、地域情報だけでなく同じ街の人と助け合えるようにします。",
    comparisons: [
      ["WeChat / LINE グループ", "情報が流れて沈み、検索しづらく、重要な内容を逃しやすく、グループ外の新しい人とも出会いにくい。"],
      ["Facebook Groups", "ノイズが多く、分類が弱く、多言語体験が弱く、つながりが精密ではありません。"],
      ["Craigslist / 従来の分類サイト", "取引中心で、生活経験、Q&A、人と人のつながりが不足しています。"],
      ["SNS フィード", "内容が散らばり、都市構造が安定せず、見るには良いが地域関係を作るには弱い。"],
      ["レビュー / 名簿系アプリ", "店舗評価や一覧が中心で、生活経験、Q&A、人どうしの助け合いが不足しています。"],
    ],
  },
};

export function WhyMachiSection() {
  const { locale } = useMarketingI18n();
  const copy = whyCopy[locale];

  return (
    <section id="why" className="relative px-5 py-14 sm:px-6 lg:py-20">
      <div className="absolute inset-0 -z-10 overflow-hidden">
        <div className="mc-aurora" />
      </div>
      <div className="mx-auto max-w-[1180px]">
        <div className="mc-reveal mx-auto max-w-4xl text-center">
          <p className="mc-eyebrow">{copy.label}</p>
          <h2 className="mt-4 text-3xl font-black leading-tight text-slate-950 sm:text-5xl dark:text-white">
            <BrandPhrase text={copy.title} />
          </h2>
          <p className="mt-5 text-base leading-8 text-slate-700 sm:text-lg dark:text-slate-300">
            <BrandPhrase text={copy.body} />
          </p>
        </div>

        <div className="mt-10 grid gap-4 lg:grid-cols-[1.08fr_0.92fr]">
          <div className="grid gap-3">
            {copy.comparisons.map(([name, problem]) => (
              <article key={name} className="mc-reveal rounded-[24px] border border-stone-200/70 bg-white/82 p-4 shadow-[0_16px_44px_-38px_rgba(28,25,23,0.55)] dark:border-white/10 dark:bg-white/[0.05]">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-stone-100 text-stone-600 ring-1 ring-stone-200 dark:bg-white/10 dark:text-stone-300 dark:ring-white/10">
                    <CircleSlash className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <div>
                    <h3 className="font-black text-stone-950 dark:text-white">{name}</h3>
                    <p className="mt-1 text-sm leading-6 text-stone-600 dark:text-stone-300">{problem}</p>
                  </div>
                </div>
              </article>
            ))}
          </div>

          <article className="mc-reveal relative overflow-hidden rounded-[32px] bg-[#151515] p-6 text-white shadow-[0_30px_80px_-48px_rgba(21,21,21,0.8)] sm:p-8">
            <div className="mc-echo-field absolute inset-0 opacity-35" aria-hidden="true">
              <span className="mc-echo-ring mc-echo-ring-a" />
              <span className="mc-echo-ring mc-echo-ring-b" />
            </div>
            <div className="relative">
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-400/18 text-orange-200 ring-1 ring-orange-200/20">
                <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
              </span>
              <h3 className="mt-6 text-3xl font-black">Machi</h3>
              <p className="mt-4 text-base font-semibold leading-8 text-white/74">
                <BrandPhrase text={copy.machi} />
              </p>
              <div className="mt-8 grid gap-3">
                {[
                  { icon: Search, label: "city + language" },
                  { icon: MessageSquareDashed, label: "channels + scenes" },
                  { icon: UsersRound, label: "people + trust" },
                ].map(({ icon: Icon, label }) => (
                  <div key={label} className="flex items-center gap-3 rounded-2xl bg-white/8 px-4 py-3">
                    <Icon className="h-4 w-4 text-orange-200" aria-hidden="true" />
                    <span className="text-sm font-black">{label}</span>
                  </div>
                ))}
              </div>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}
