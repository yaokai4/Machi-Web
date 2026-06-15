"use client";

import { MapPin, MessageCircle, Radio, Sparkles, UsersRound } from "lucide-react";
import type { MarketingLocale } from "@/data/machi-home";
import { BrandPhrase } from "./BrandText";
import { useMarketingI18n } from "./MarketingI18n";

const copyByLocale: Record<
  MarketingLocale,
  {
    label: string;
    title: string;
    body: string;
    pulse: string;
    cities: Array<[string, string]>;
    echoes: Array<[string, string]>;
  }
> = {
  zh: {
    label: "城市回声",
    title: "当一座城市开始回应你，陌生感就会慢慢退去。",
    body: "一个问题、一段经验、一次相约，看似微小，却共同构成城市正在发生的生活。Machi 让这些声音彼此抵达。",
    pulse: "让发问、分享与回应，发生在同一座城市。",
    cities: [["Tokyo", "Dining · Language Exchange"], ["Los Angeles", "Jobs · Events"], ["Toronto", "Housing · Q&A"]],
    echoes: [["有人发问", "新宿租房有哪些坑要避开？"], ["有人回应", "我去年住过这个区，可以分享合同注意点。"], ["有人连接", "周五涩谷拉面局，还有两个位置。"]],
  },
  en: {
    label: "City Echo",
    title: "A city begins to feel less unfamiliar when it answers back.",
    body: "A question, a piece of experience, an invitation: each is small, yet together they reveal the life already unfolding around you. Machi helps those voices reach one another.",
    pulse: "Questions, experience, and replies, grounded in the same city.",
    cities: [["Tokyo", "Dining · Language Exchange"], ["Los Angeles", "Jobs · Events"], ["Toronto", "Housing · Q&A"]],
    echoes: [["Someone asks", "What should I avoid when renting in Shinjuku?"], ["Someone answers", "I lived there last year. Here is what to check in the contract."], ["Someone connects", "Friday ramen in Shibuya. Two seats left."]],
  },
  ja: {
    label: "街のこだま",
    title: "街から返事が届くと、知らない場所は少しずつ自分の居場所になります。",
    body: "一つの問い、一つの経験、一度の誘い。どれも小さく見えて、いま街で営まれている暮らしを形づくっています。Machi は、その声どうしが届く道をつくります。",
    pulse: "問い、経験、返事を、同じ街の中でつなぐ。",
    cities: [["Tokyo", "Dining · Language Exchange"], ["Los Angeles", "Jobs · Events"], ["Toronto", "Housing · Q&A"]],
    echoes: [["誰かが聞く", "新宿で部屋を借りる時の注意点は？"], ["誰かが答える", "去年そのエリアに住んでいました。契約で見る点を共有できます。"], ["誰かとつながる", "金曜の渋谷ラーメン会、あと二席あります。"]],
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
          <h2 className="mt-4 text-3xl font-black leading-tight text-slate-950 sm:text-5xl dark:text-white">
            <BrandPhrase text={copy.title} />
          </h2>
          <p className="mt-5 max-w-2xl text-base leading-8 text-slate-700 sm:text-lg dark:text-slate-300">
            <BrandPhrase text={copy.body} />
          </p>
          <p className="mt-6 inline-flex rounded-full bg-[#151515] px-4 py-2 text-sm font-black text-white shadow-[0_18px_44px_-28px_rgba(21,21,21,0.7)]">
            {copy.pulse}
          </p>
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
                <article key={title} className="rounded-[24px] bg-white/92 p-4 shadow-[0_18px_46px_-40px_rgba(28,25,23,0.65)] ring-1 ring-stone-200/70 dark:bg-white/[0.07] dark:ring-white/10">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-orange-50 text-orange-600 ring-1 ring-orange-100 dark:bg-orange-500/10 dark:text-orange-200 dark:ring-orange-300/20">
                      {index === 0 ? <MessageCircle className="h-4 w-4" /> : index === 1 ? <Sparkles className="h-4 w-4" /> : <UsersRound className="h-4 w-4" />}
                    </span>
                    <p className="text-xs font-black uppercase text-stone-500 dark:text-stone-400">{title}</p>
                  </div>
                  <p className="mt-3 text-base font-black leading-7 text-stone-950 dark:text-white">{body}</p>
                </article>
              ))}
            </div>

            <div className="rounded-[24px] bg-slate-950 p-4 text-white shadow-[0_22px_60px_-40px_rgba(15,23,42,0.9)] ring-1 ring-white/10">
              <p className="flex items-center gap-2 text-sm font-black">
                <Radio className="h-4 w-4 text-orange-400" aria-hidden="true" />
                City Pulse
                <span className="ml-auto inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-white/45">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" aria-hidden="true" />
                  Live
                </span>
              </p>
              <div className="mt-4 grid grid-cols-3 gap-2">
                {[72, 48, 64].map((height) => (
                  <span key={height} className="rounded-xl bg-white/[0.07] p-2 ring-1 ring-white/10">
                    <span className="block rounded-lg bg-gradient-to-t from-orange-400/85 to-indigo-400/85" style={{ height }} />
                    <span className="mt-2 block h-2 rounded-full bg-white/20" />
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
