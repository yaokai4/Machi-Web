"use client";

import Link from "next/link";
import { ArrowLeft, Home, ShoppingBag, Briefcase, Sparkles, Ticket } from "lucide-react";
import { AppShell } from "@/components/shell/AppShell";
import { useI18n } from "@/lib/i18n";

type Channel = {
  href: string;
  Icon: typeof Home;
  zh: string;
  ja: string;
  en: string;
  zhSub: string;
  jaSub: string;
  enSub: string;
};

const CHANNELS: Channel[] = [
  { href: "/rentals", Icon: Home, zh: "租房 · 住宿", ja: "賃貸・住まい", en: "Housing & stays", zhSub: "长租与民宿，全国房源", jaSub: "長期賃貸と民泊", enSub: "Rentals & homestays nationwide" },
  { href: "/marketplace", Icon: ShoppingBag, zh: "二手市场", ja: "フリマ", en: "Marketplace", zhSub: "闲置好物，跨城淘货", jaSub: "中古品をまとめて", enSub: "Buy & sell second-hand" },
  { href: "/jobs", Icon: Briefcase, zh: "招聘求职", ja: "求人・仕事", en: "Jobs", zhSub: "全国职位与招聘", jaSub: "全国の求人", enSub: "Roles & hiring nationwide" },
  { href: "/services", Icon: Sparkles, zh: "本地服务", ja: "ローカルサービス", en: "Local services", zhSub: "搬家、维修、生活服务", jaSub: "引越し・修理など", enSub: "Moving, repairs & more" },
  { href: "/deals", Icon: Ticket, zh: "商家优惠", ja: "お得情報", en: "Deals", zhSub: "门店折扣与团购", jaSub: "店舗の割引・特典", enSub: "Discounts & group buys" },
];

export default function ListingsHubPage() {
  const { locale } = useI18n();
  const isJa = locale === "ja";
  const isEn = locale === "en";
  const pick = (zh: string, ja: string, en: string) => (isEn ? en : isJa ? ja : zh);

  return (
    <AppShell requireAuth={false} wide right={null}>
      <div className="kx-listing-page">
        <header className="kx-listing-header sticky top-0 z-30 px-3 pb-3 pt-2">
          <div className="flex items-center gap-2">
            <Link href="/explore" className="kx-listing-icon-button" aria-label={pick("返回", "戻る", "Back")}>
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-xl font-black text-[rgb(var(--kx-living-ink))]">
                {pick("全部信息", "すべての情報", "All listings")}
              </h1>
              <p className="truncate text-xs font-semibold text-[rgb(var(--kx-living-muted))]">
                {pick("不限城市，按频道浏览全国信息", "都市を問わず、全国の情報をチャンネル別に", "Browse nationwide by channel — no city required")}
              </p>
            </div>
          </div>
        </header>

        <main className="px-3 py-5 sm:px-5">
          <section className="mx-auto grid min-w-0 max-w-4xl grid-cols-1 gap-3 sm:grid-cols-2">
            {CHANNELS.map((c) => (
              <Link
                key={c.href}
                href={c.href}
                className="group flex items-center gap-4 rounded-2xl border border-[rgb(var(--kx-living-soft))] bg-[rgb(var(--kx-living-surface))] px-4 py-4 transition hover:-translate-y-px hover:border-[rgb(var(--kx-living-accent))]/40 hover:shadow-[0_18px_40px_-30px_rgba(15,23,42,0.6)]"
              >
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-[rgb(var(--kx-living-accent))]/10 text-[rgb(var(--kx-living-accent))]">
                  <c.Icon className="h-6 w-6" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-base font-black text-[rgb(var(--kx-living-ink))]">
                    {pick(c.zh, c.ja, c.en)}
                  </span>
                  <span className="block truncate text-xs font-semibold text-[rgb(var(--kx-living-muted))]">
                    {pick(c.zhSub, c.jaSub, c.enSub)}
                  </span>
                </span>
              </Link>
            ))}
          </section>
        </main>
      </div>
    </AppShell>
  );
}
