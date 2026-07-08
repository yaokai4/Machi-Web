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
    signals: string[];
  }
> = {
  zh: {
    label: "Why Machi",
    title: "同样一条经验，换座城市、换个时候，未必还算数。",
    body: "一条经验有没有用，常常要看它出自哪座城市、什么时候、对什么样的人。Machi 把这些背景一并留着，你就能自己判断，也更容易照着做。",
    machi: "Machi 按城市、语言和生活场景整理信息与人。你可以找到具体的本地内容，也能看见来自同一座城市、有真实背景的回答。",
    comparisons: [
      ["群聊里的经验", "来得快，也容易沉下去。过几天再想找，往往已经翻不到了。"],
      ["社交平台上的分享", "有启发，但常常缺少具体城市、时间和个人处境，未必能直接照着做。"],
      ["分类信息网站", "适合找房源、工作或物品，却很难看见发布者的经验和后续回应。"],
      ["搜索结果", "答案很多，新旧混在一起，也未必适合你的语言和所在地区。"],
      ["本地生活平台", "擅长店铺、评分与预约，较少承载居民之间持续的问答和互助。"],
    ],
    signals: ["城市与语言", "频道与场景", "真实经验与信任"],
  },
  en: {
    label: "Why Machi",
    title: "The same advice, in another city or another year, may no longer hold.",
    body: "Local advice only makes sense with context — where it happened, when it was true, who it helped. Machi keeps that context attached, so you can judge it for yourself.",
    machi: "Machi organizes information and people by city, language, and everyday need. You can find specific local content and answers grounded in real experience nearby.",
    comparisons: [
      ["Advice in group chats", "It arrives quickly and disappears just as fast. A few days later, the useful message can be nearly impossible to find."],
      ["Posts on social platforms", "Often helpful, but the city, date, and personal circumstances may be missing, making the advice hard to apply."],
      ["Classified listings", "Useful for finding a home, job, or item, but rarely show the experience or conversation behind the listing."],
      ["Search results", "There is no shortage of answers, but old and new information mix together and may not fit your language or location."],
      ["Local review apps", "Strong on venues, ratings, and bookings; less suited to ongoing questions and mutual help between residents."],
    ],
    signals: ["City & language", "Channels & context", "Experience & trust"],
  },
  ja: {
    label: "Why Machi",
    title: "同じ経験でも、街が変われば、時期が変われば、当てはまらないこともあります。",
    body: "地域の情報は、いつ・どこで・どんな人に役立ったのかがわかって、はじめて判断できます。Machi はその背景ごと残すので、自分の目で見きわめられます。",
    machi: "Machi は、街・言語・暮らしの目的ごとに情報と人をつなぎます。具体的な地域情報と、同じ街で得られた実体験にもとづく回答を探せます。",
    comparisons: [
      ["グループチャットの情報", "すぐ届く一方で、すぐに流れてしまいます。数日後に探し直すのは簡単ではありません。"],
      ["SNS の体験談", "参考になっても、地域や時期、書いた人の状況がわからず、そのまま自分に当てはめにくいことがあります。"],
      ["クラシファイドサイト", "住まいや仕事、物を探すには便利ですが、掲載の背景やその後のやり取りは見えにくいままです。"],
      ["検索結果", "新旧の情報が混ざり、自分の言語や住んでいる地域に合うか判断しづらいことがあります。"],
      ["地域情報アプリ", "店舗検索や口コミ、予約には強い一方、住民どうしの継続的な相談や助け合いには向いていません。"],
    ],
    signals: ["街と言語", "チャンネルと目的", "実体験と信頼"],
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
                  { icon: Search, label: copy.signals[0] },
                  { icon: MessageSquareDashed, label: copy.signals[1] },
                  { icon: UsersRound, label: copy.signals[2] },
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
