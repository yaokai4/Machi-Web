"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  BadgeCheck,
  Clock,
  ExternalLink,
  Globe,
  MapPin,
  MessageSquare,
  Phone,
  Search,
  Store,
} from "lucide-react";
import { api } from "@/lib/api";
import type { KXBusinessPublic } from "@/lib/types";
import { AppShell } from "@/components/shell/AppShell";
import { ErrorState, PremiumEmptyState, SectionLoading } from "@/components/design/States";
import { Avatar } from "@/components/design/Avatar";
import { getCityBySlug, getDefaultCity } from "@/config/cities";
import { useI18n, appLocaleToMarketingLocale, type Locale } from "@/lib/i18n";
import { RatingStars, ServiceCard } from "@/components/listings/ListingKit";

/// 目录分类:value=后端过滤用的规范中文键,展示时按 locale 本地化(见 CATEGORY_LABELS)。
const DIRECTORY_CATEGORIES = [
  "全部",
  "餐饮点评",
  "优惠预约",
  "景点门票",
  "一日游",
  "本地向导",
  "机场接送",
  "车站接送",
  "包车",
  "翻译手续",
  "租房申请协助",
  "搬家清洁",
  "生活开通",
  "美容健康",
];

const CATEGORY_LABELS: Record<string, [string, string, string]> = {
  "全部": ["全部", "すべて", "All"],
  "餐饮点评": ["餐饮点评", "グルメ", "Dining"],
  "优惠预约": ["优惠预约", "予約特典", "Deals & booking"],
  "景点门票": ["景点门票", "チケット", "Tickets"],
  "一日游": ["一日游", "日帰りツアー", "Day tours"],
  "本地向导": ["本地向导", "現地ガイド", "Local guides"],
  "机场接送": ["机场接送", "空港送迎", "Airport transfer"],
  "车站接送": ["车站接送", "駅送迎", "Station transfer"],
  "包车": ["包车", "チャーター", "Charter"],
  "翻译手续": ["翻译手续", "翻訳・手続き", "Paperwork"],
  "租房申请协助": ["租房申请协助", "賃貸申込サポート", "Rental support"],
  "搬家清洁": ["搬家清洁", "引越し・清掃", "Moving & cleaning"],
  "生活开通": ["生活开通", "生活手続き", "Life setup"],
  "美容健康": ["美容健康", "美容・健康", "Beauty & health"],
};

/// 目录页一次性三语选择:value 保持中文键给后端,label 走本地化。
function pick(locale: Locale, zh: string, ja: string, en: string): string {
  const m = appLocaleToMarketingLocale(locale);
  return m === "ja" ? ja : m === "en" ? en : zh;
}

function categoryLabel(chip: string, locale: Locale): string {
  const copy = CATEGORY_LABELS[chip];
  return copy ? pick(locale, copy[0], copy[1], copy[2]) : chip;
}

/// 认证商家目录 —— 按评分、服务类型和城市筛选审核通过的商家。
export function BusinessDirectoryPage({ citySlug }: { citySlug?: string }) {
  const { locale } = useI18n();
  const city = getCityBySlug(citySlug || "") || getDefaultCity();
  const [category, setCategory] = useState("全部");
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const directory = useQuery({
    queryKey: ["businesses-directory", city.slug, category, submittedQuery],
    queryFn: () => api.businessesDirectory({
      city: city.slug,
      category: category === "全部" ? undefined : category,
      q: submittedQuery || undefined,
    }),
    staleTime: 60_000,
  });
  const items = directory.data?.items || [];
  return (
    <AppShell requireAuth={false} wide right={null}>
      <header className="sticky top-0 z-30 kx-glass-bar px-3 pt-2 pb-3">
        <div className="flex items-center gap-2">
          <Link href={`/cities/${city.slug}/services`} className="grid h-10 w-10 place-items-center rounded-full bg-kx-card text-kx-muted shadow-kx-card transition hover:text-kx-text">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <span className="grid h-10 w-10 place-items-center rounded-2xl bg-kx-accent text-white shadow-[0_10px_24px_-14px_rgb(var(--kx-accent)/0.9)]">
            <Store className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-black text-kx-text">{city.name} · {pick(locale, "认证商家", "認証店舗", "Verified")}</h1>
            <p className="truncate text-xs font-semibold text-kx-muted">{pick(locale, "资质审核通过的本地商家、旅行服务方和生活服务者", "審査を通過した地元店舗・旅行・生活サービスの提供者", "Vetted local shops, travel and life-service providers")}</p>
          </div>
        </div>
        <form
          className="mt-3 flex h-11 items-center gap-2 rounded-2xl border border-kx-stroke/60 bg-kx-card px-3 text-sm shadow-[0_8px_30px_-24px_rgb(var(--kx-shadow)/0.5)]"
          onSubmit={(event) => {
            event.preventDefault();
            setSubmittedQuery(query.trim());
          }}
        >
          <Search className="h-4 w-4 text-kx-accent" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="min-w-0 flex-1 bg-transparent font-semibold text-kx-text outline-none placeholder:text-kx-subtle"
            placeholder={pick(locale, "搜索商家名称、服务类型…", "店舗名・サービス種別を検索…", "Search shops, service types…")}
          />
        </form>
      </header>
      <main className="px-3 py-4 sm:px-4">
        <section className="mx-auto min-w-0 max-w-6xl">
          <div className="-mx-1 mb-4 min-w-0 overflow-x-auto px-1">
            <div className="flex gap-2 pb-0.5">
              {DIRECTORY_CATEGORIES.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => setCategory(chip)}
                  data-active={category === chip}
                  className="h-10 shrink-0 rounded-full border border-kx-stroke/60 bg-kx-card px-3.5 text-sm font-black text-kx-muted transition data-[active=true]:border-kx-accent data-[active=true]:bg-kx-accent data-[active=true]:text-white hover:border-kx-accent/50 hover:text-kx-accent"
                >
                  {categoryLabel(chip, locale)}
                </button>
              ))}
            </div>
          </div>
          {directory.isLoading ? (
            <SectionLoading title={pick(locale, "正在加载认证商家", "認証店舗を読み込み中", "Loading verified businesses")} rows={3} />
          ) : directory.isError ? (
            <ErrorState title={pick(locale, "商家目录暂时无法加载", "店舗一覧を読み込めませんでした", "Couldn't load the business directory")} onRetry={() => directory.refetch()} />
          ) : items.length ? (
            <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
              {items.map((business) => <BusinessDirectoryCard key={business.id} business={business} locale={locale} />)}
            </div>
          ) : (
            <PremiumEmptyState
              icon={Store}
              title={pick(locale, "这个分类暂时没有认证商家", "このカテゴリの認証店舗はまだありません", "No verified businesses in this category yet")}
              subtitle={pick(locale, "商家可以在「工作台 → 商家服务后台」提交认证申请，审核通过后会展示在这里。", "店舗は「ワークベンチ → 店舗サービス管理」から認証を申請でき、審査通過後にここに表示されます。", "Merchants can apply from Workbench → Business console; approved shops appear here.")}
            />
          )}
        </section>
      </main>
    </AppShell>
  );
}

function BusinessDirectoryCard({ business, locale }: { business: KXBusinessPublic; locale: Locale }) {
  const ratingCount = Number(business.rating_count || 0);
  return (
    <Link
      href={`/businesses/${encodeURIComponent(business.id)}`}
      className="group overflow-hidden rounded-[20px] border border-kx-stroke/60 bg-kx-card shadow-kx-card transition hover:-translate-y-0.5 hover:border-kx-accent/50 hover:shadow-kx-float"
    >
      <div className="relative h-24 overflow-hidden bg-kx-accentSoft bg-[radial-gradient(circle_at_20%_10%,rgb(var(--kx-accent)/0.18),transparent_46%)]">
        {business.cover_url ? (
          <Image src={business.cover_url} alt={business.business_name} fill sizes="360px" className="object-cover" unoptimized />
        ) : null}
        <span className="absolute right-2.5 top-2.5 inline-flex items-center gap-1 rounded-full bg-kx-accent/95 px-2 py-1 text-[10px] font-black text-white shadow-sm">
          <BadgeCheck className="h-3 w-3" />
          {pick(locale, "已认证", "認証済み", "Verified")}
        </span>
      </div>
      <div className="p-3.5">
        <div className="-mt-8 flex items-end gap-2.5">
          <span className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-2xl bg-kx-card text-kx-accent shadow-kx-card ring-2 ring-kx-card">
            {business.logo_url ? (
              <Image src={business.logo_url} alt={business.business_name} width={56} height={56} className="h-14 w-14 object-cover" unoptimized />
            ) : (
              <Store className="h-6 w-6" />
            )}
          </span>
          <div className="min-w-0 flex-1 pb-0.5">
            <h2 className="truncate text-[15px] font-black text-kx-text">{business.business_name}</h2>
            <p className="truncate text-xs font-bold text-kx-subtle">{business.business_type || (business.service_categories || [])[0] || pick(locale, "本地商家", "地元店舗", "Local business")}</p>
          </div>
        </div>
        <div className="mt-2.5 flex items-center justify-between">
          {ratingCount > 0 ? (
            <RatingStars value={Number(business.rating_avg || 0)} count={ratingCount} />
          ) : (
            <span className="text-xs font-bold text-kx-subtle">{pick(locale, "暂无点评", "口コミなし", "No reviews")}</span>
          )}
          <span className="text-xs font-black text-kx-muted">{pick(locale, `${business.published_listing_count || 0} 个在线服务`, `オンラインサービス${business.published_listing_count || 0}件`, `${business.published_listing_count || 0} services`)}</span>
        </div>
        {business.description ? <p className="mt-2 line-clamp-2 text-xs font-semibold leading-5 text-kx-muted">{business.description}</p> : null}
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {(business.service_categories || []).slice(0, 4).map((item) => (
            <span key={item} className="rounded-md bg-kx-accentSoft px-2 py-0.5 text-[11px] font-black text-kx-accent ring-1 ring-kx-accent/15">{item}</span>
          ))}
        </div>
      </div>
    </Link>
  );
}

/// 商家公开主页 —— 店铺资料 + 在线服务 + 点评。
export function BusinessPublicPage({ businessId }: { businessId: string }) {
  const { locale } = useI18n();
  const profile = useQuery({
    queryKey: ["business-public", businessId],
    queryFn: () => api.businessPublic(businessId),
    staleTime: 60_000,
  });
  if (profile.isLoading) {
    return (
      <AppShell requireAuth={false} wide right={null}>
        <main className="px-3 py-4 sm:px-4"><SectionLoading title={pick(locale, "正在加载商家主页", "店舗ページを読み込み中", "Loading business page")} rows={4} /></main>
      </AppShell>
    );
  }
  if (profile.isError || !profile.data?.business) {
    return (
      <AppShell requireAuth={false} wide right={null}>
        <main className="px-3 py-4 sm:px-4"><ErrorState title={pick(locale, "商家不存在或未通过认证", "店舗が存在しないか、認証されていません", "This business doesn't exist or isn't verified")} onRetry={() => profile.refetch()} /></main>
      </AppShell>
    );
  }
  const { business, listings, reviews } = profile.data;
  const ratingCount = Number(business.rating_count || 0);
  const serviceCategories = business.service_categories || [];
  const primaryType = business.business_type || serviceCategories[0] || pick(locale, "本地商家", "地元店舗", "Local business");
  const publishedCount = Number(business.published_listing_count || 0);
  const hours = business.opening_hours || {};
  const hoursText = Object.entries(hours)
    .map(([day, value]) => `${day} ${value}`)
    .join(" · ");
  const verifiedLabel = pick(locale, "已认证", "認証済み", "Verified");
  const servicesLabel = pick(locale, `${publishedCount} 个在线服务`, `オンラインサービス${publishedCount}件`, `${publishedCount} services`);
  const noReviews = pick(locale, "暂无点评", "口コミなし", "No reviews");
  return (
    <AppShell requireAuth={false} wide right={null}>
      <header className="sticky top-0 z-30 kx-glass-bar px-3 py-2">
        <div className="flex items-center gap-2">
          <Link href={`/businesses?city=${encodeURIComponent(business.city_slug || "tokyo")}`} className="grid h-10 w-10 place-items-center rounded-full bg-kx-card text-kx-muted shadow-kx-card transition hover:text-kx-text">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="min-w-0">
            <p className="text-xs font-bold text-kx-muted">{pick(locale, "认证商家", "認証店舗", "Verified business")}</p>
            <h1 className="truncate text-lg font-black text-kx-text">{business.business_name}</h1>
          </div>
        </div>
      </header>
      <main className="px-3 py-4 sm:px-4">
        <div className="mx-auto min-w-0 max-w-6xl space-y-4">
          <section className="rounded-kx-sheet border border-kx-stroke/60 bg-kx-card p-4 shadow-kx-float sm:p-5">
            <div className={business.cover_url ? "grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(260px,340px)] lg:items-stretch" : "min-w-0"}>
              <div className="min-w-0">
                <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start">
                  <span className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-kx-lg bg-kx-accentSoft text-kx-accent ring-1 ring-kx-accent/15 sm:h-24 sm:w-24">
                    {business.logo_url ? (
                      <Image src={business.logo_url} alt={business.business_name} width={96} height={96} className="h-full w-full object-cover" unoptimized />
                    ) : (
                      <Store className="h-9 w-9" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="min-w-0 break-words text-2xl font-black leading-tight text-kx-text sm:text-3xl">{business.business_name}</h2>
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-kx-accentSoft px-2.5 py-1 text-xs font-black text-kx-accent ring-1 ring-kx-accent/20">
                        <BadgeCheck className="h-3.5 w-3.5" />
                        {verifiedLabel}
                      </span>
                    </div>
                    <p className="mt-1 text-sm font-bold text-kx-muted">{primaryType}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                      {ratingCount > 0 ? (
                        <RatingStars value={Number(business.rating_avg || 0)} count={ratingCount} size="md" />
                      ) : (
                        <span className="text-sm font-bold text-kx-subtle">{noReviews}</span>
                      )}
                      <span className="text-sm font-bold text-kx-muted">{servicesLabel}</span>
                    </div>
                  </div>
                </div>
                {business.description ? <p className="mt-4 max-w-3xl whitespace-pre-line break-words text-sm leading-7 text-kx-muted">{business.description}</p> : null}
                {serviceCategories.length ? (
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {serviceCategories.map((item) => (
                      <span key={item} className="rounded-full bg-kx-accentSoft px-2.5 py-1 text-xs font-black text-kx-accent ring-1 ring-kx-accent/15">{item}</span>
                    ))}
                  </div>
                ) : null}
              </div>
              {business.cover_url ? (
                <div className="relative min-h-44 overflow-hidden rounded-kx-lg bg-kx-surface sm:min-h-56 lg:min-h-full">
                  <Image src={business.cover_url} alt={business.business_name} fill sizes="(max-width: 1024px) 100vw, 340px" className="object-cover" unoptimized />
                </div>
              ) : null}
            </div>
            <dl className="mt-4 grid gap-2 sm:grid-cols-2">
              {business.address ? <InfoRow icon={MapPin} label={pick(locale, "地址", "住所", "Address")} value={business.address} /> : null}
              {hoursText ? <InfoRow icon={Clock} label={pick(locale, "营业时间", "営業時間", "Hours")} value={hoursText} /> : null}
              {business.contact_method ? <InfoRow icon={Phone} label={pick(locale, "联系方式", "連絡先", "Contact")} value={business.contact_method} /> : null}
              {business.website ? (
                <a href={business.website} target="_blank" rel="noopener noreferrer" className="flex items-start gap-2.5 rounded-2xl bg-kx-surface p-3 transition hover:bg-kx-accentSoft/70">
                  <Globe className="mt-0.5 h-4 w-4 shrink-0 text-kx-accent" />
                  <span className="min-w-0">
                    <span className="block text-xs font-bold text-kx-subtle">{pick(locale, "官网 / 社媒", "公式サイト / SNS", "Website / social")}</span>
                    <span className="mt-0.5 flex min-w-0 items-center gap-1 text-sm font-black text-kx-accent"><span className="min-w-0 break-all">{business.website}</span><ExternalLink className="h-3 w-3 shrink-0" /></span>
                  </span>
                </a>
              ) : null}
            </dl>
            {business.owner ? (
              <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-kx-stroke/60 bg-kx-surface/70 p-3 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <Avatar user={business.owner} size={40} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-black text-kx-text">{business.owner.display_name || business.owner.handle}</p>
                    <p className="text-xs font-bold text-kx-subtle">{pick(locale, "商家负责人 · 站内可私信", "店舗担当者 · アプリ内でメッセージ可", "Business owner · DM in-app")}</p>
                  </div>
                </div>
                <Link href={`/u/${business.owner.handle}`} className="inline-flex h-9 w-full shrink-0 items-center justify-center gap-1.5 rounded-full bg-kx-accent px-3.5 text-xs font-black text-white transition hover:bg-kx-accent/90 sm:w-auto">
                  <MessageSquare className="h-3.5 w-3.5" />
                  {pick(locale, "联系商家", "店舗に連絡", "Contact")}
                </Link>
              </div>
            ) : null}
          </section>

          <section>
            <h3 className="px-1 text-lg font-black text-kx-text">{pick(locale, "在线服务", "オンラインサービス", "Online services")} ({listings.length})</h3>
            {listings.length ? (
              <div className="mt-3 grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
                {listings.map((listing) => <ServiceCard key={listing.id} listing={listing} locale={locale} />)}
              </div>
            ) : (
              <p className="mt-3 rounded-2xl bg-kx-card p-5 text-sm font-semibold text-kx-muted">{pick(locale, "商家暂未发布在线服务。", "オンラインサービスはまだ掲載されていません。", "This business hasn't posted any online services yet.")}</p>
            )}
          </section>

          {reviews.length ? (
            <section className="rounded-kx-sheet border border-kx-stroke/60 bg-kx-card p-5">
              <h3 className="text-lg font-black text-kx-text">{pick(locale, "最新点评", "最新の口コミ", "Latest reviews")}</h3>
              <div className="mt-3 space-y-4">
                {reviews.map((review) => (
                  <article key={review.id} className="border-t border-kx-stroke/40 pt-4 first:border-0 first:pt-0">
                    <div className="flex items-center gap-2.5">
                      <Avatar user={review.author || undefined} size={36} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-black text-kx-text">{review.author?.display_name || review.author?.handle || pick(locale, "Machi 用户", "Machi ユーザー", "Machi user")}</p>
                        <p className="flex items-center gap-2 text-xs text-kx-subtle">
                          <RatingStars value={review.rating} showValue={false} />
                          <span className="font-bold">{(review.created_at || "").slice(0, 10)}</span>
                          {review.listing_title ? <span className="truncate font-bold">· {review.listing_title}</span> : null}
                        </p>
                      </div>
                    </div>
                    {review.content ? <p className="mt-2 whitespace-pre-line text-sm leading-6 text-kx-muted">{review.content}</p> : null}
                    {review.owner_reply ? (
                      <div className="mt-2.5 rounded-xl bg-kx-surface p-3 ring-1 ring-kx-stroke/40">
                        <p className="flex items-center gap-1 text-xs font-black text-kx-muted"><Store className="h-3.5 w-3.5" /> {pick(locale, "商家回复", "店舗からの返信", "Merchant reply")}</p>
                        <p className="mt-1 text-sm leading-6 text-kx-muted">{review.owner_reply}</p>
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </main>
    </AppShell>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: typeof MapPin; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2.5 rounded-2xl bg-kx-surface p-3">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-kx-accent" />
      <span className="min-w-0">
        <span className="block text-xs font-bold text-kx-subtle">{label}</span>
        <span className="mt-0.5 block break-words text-sm font-black text-kx-text">{value}</span>
      </span>
    </div>
  );
}
