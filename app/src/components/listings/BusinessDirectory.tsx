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
import { useI18n } from "@/lib/i18n";
import { RatingStars, ServiceCard } from "@/components/listings/ListingKit";

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

/// 认证商家目录 —— 按评分、服务类型和城市筛选审核通过的商家。
export function BusinessDirectoryPage({ citySlug }: { citySlug?: string }) {
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
          <Link href={`/cities/${city.slug}/services`} className="grid h-10 w-10 place-items-center rounded-full bg-white text-slate-700 shadow-[0_8px_24px_rgba(15,23,42,0.08)]">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <span className="grid h-10 w-10 place-items-center rounded-2xl bg-emerald-600 text-white">
            <Store className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-black text-slate-950">{city.name} · 认证商家</h1>
            <p className="truncate text-xs font-semibold text-slate-500">资质审核通过的本地商家、旅行服务方和生活服务者</p>
          </div>
        </div>
        <form
          className="mt-3 flex h-11 items-center gap-2 rounded-2xl border border-slate-200/70 bg-white px-3 text-sm shadow-[0_8px_30px_rgba(15,23,42,0.04)]"
          onSubmit={(event) => {
            event.preventDefault();
            setSubmittedQuery(query.trim());
          }}
        >
          <Search className="h-4 w-4 text-emerald-600" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="min-w-0 flex-1 bg-transparent font-semibold outline-none placeholder:text-slate-400"
            placeholder="搜索商家名称、服务类型…"
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
                  className="h-10 shrink-0 rounded-full border border-slate-200 bg-white px-3.5 text-sm font-black text-slate-600 transition data-[active=true]:border-emerald-600 data-[active=true]:bg-emerald-600 data-[active=true]:text-white hover:border-emerald-300 hover:text-emerald-700"
                >
                  {chip}
                </button>
              ))}
            </div>
          </div>
          {directory.isLoading ? (
            <SectionLoading title="正在加载认证商家" rows={3} />
          ) : directory.isError ? (
            <ErrorState title="商家目录暂时无法加载" onRetry={() => directory.refetch()} />
          ) : items.length ? (
            <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
              {items.map((business) => <BusinessDirectoryCard key={business.id} business={business} />)}
            </div>
          ) : (
            <PremiumEmptyState
              icon={Store}
              title="这个分类暂时没有认证商家"
              subtitle="商家可以在「工作台 → 商家服务后台」提交认证申请，审核通过后会展示在这里。"
            />
          )}
        </section>
      </main>
    </AppShell>
  );
}

function BusinessDirectoryCard({ business }: { business: KXBusinessPublic }) {
  const ratingCount = Number(business.rating_count || 0);
  return (
    <Link
      href={`/businesses/${encodeURIComponent(business.id)}`}
      className="group overflow-hidden rounded-[20px] border border-slate-200/70 bg-white shadow-[0_10px_30px_-26px_rgba(15,23,42,0.6)] transition hover:-translate-y-0.5 hover:border-emerald-300/70 hover:shadow-[0_18px_44px_-30px_rgba(15,23,42,0.62)]"
    >
      <div className="relative h-24 overflow-hidden bg-[radial-gradient(circle_at_20%_10%,rgba(16,185,129,0.18),transparent_42%),linear-gradient(135deg,#f0fdf4,#ecfeff_60%,#f0f9ff)]">
        {business.cover_url ? (
          <Image src={business.cover_url} alt={business.business_name} fill sizes="360px" className="object-cover" unoptimized />
        ) : null}
        <span className="absolute right-2.5 top-2.5 inline-flex items-center gap-1 rounded-full bg-emerald-600/94 px-2 py-1 text-[10px] font-black text-white shadow-sm">
          <BadgeCheck className="h-3 w-3" />
          已认证
        </span>
      </div>
      <div className="p-3.5">
        <div className="-mt-8 flex items-end gap-2.5">
          <span className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-2xl bg-white text-emerald-700 shadow-[0_10px_24px_-14px_rgba(15,23,42,0.5)] ring-2 ring-white">
            {business.logo_url ? (
              <Image src={business.logo_url} alt={business.business_name} width={56} height={56} className="h-14 w-14 object-cover" unoptimized />
            ) : (
              <Store className="h-6 w-6" />
            )}
          </span>
          <div className="min-w-0 flex-1 pb-0.5">
            <h2 className="truncate text-[15px] font-black text-slate-950">{business.business_name}</h2>
            <p className="truncate text-xs font-bold text-slate-400">{business.business_type || (business.service_categories || [])[0] || "本地商家"}</p>
          </div>
        </div>
        <div className="mt-2.5 flex items-center justify-between">
          {ratingCount > 0 ? (
            <RatingStars value={Number(business.rating_avg || 0)} count={ratingCount} />
          ) : (
            <span className="text-xs font-bold text-slate-400">暂无点评</span>
          )}
          <span className="text-xs font-black text-slate-500">{business.published_listing_count || 0} 个在线服务</span>
        </div>
        {business.description ? <p className="mt-2 line-clamp-2 text-xs font-semibold leading-5 text-slate-500">{business.description}</p> : null}
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {(business.service_categories || []).slice(0, 4).map((item) => (
            <span key={item} className="rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-black text-emerald-700 ring-1 ring-emerald-100">{item}</span>
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
        <main className="px-3 py-4 sm:px-4"><SectionLoading title="正在加载商家主页" rows={4} /></main>
      </AppShell>
    );
  }
  if (profile.isError || !profile.data?.business) {
    return (
      <AppShell requireAuth={false} wide right={null}>
        <main className="px-3 py-4 sm:px-4"><ErrorState title="商家不存在或未通过认证" onRetry={() => profile.refetch()} /></main>
      </AppShell>
    );
  }
  const { business, listings, reviews } = profile.data;
  const ratingCount = Number(business.rating_count || 0);
  const serviceCategories = business.service_categories || [];
  const primaryType = business.business_type || serviceCategories[0] || "本地商家";
  const publishedCount = Number(business.published_listing_count || 0);
  const hours = business.opening_hours || {};
  const hoursText = Object.entries(hours)
    .map(([day, value]) => `${day} ${value}`)
    .join(" · ");
  return (
    <AppShell requireAuth={false} wide right={null}>
      <header className="sticky top-0 z-30 kx-glass-bar px-3 py-2">
        <div className="flex items-center gap-2">
          <Link href={`/businesses?city=${encodeURIComponent(business.city_slug || "tokyo")}`} className="grid h-10 w-10 place-items-center rounded-full bg-white text-slate-700 shadow-[0_8px_24px_rgba(15,23,42,0.08)]">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="min-w-0">
            <p className="text-xs font-bold text-slate-500">认证商家</p>
            <h1 className="truncate text-lg font-black text-slate-950">{business.business_name}</h1>
          </div>
        </div>
      </header>
      <main className="px-3 py-4 sm:px-4">
        <div className="mx-auto min-w-0 max-w-6xl space-y-4">
          <section className="rounded-kx-sheet border border-slate-200/70 bg-white p-4 shadow-[0_14px_42px_rgba(15,23,42,0.06)] sm:p-5">
            <div className={business.cover_url ? "grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(260px,340px)] lg:items-stretch" : "min-w-0"}>
              <div className="min-w-0">
                <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start">
                  <span className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-kx-lg bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100 sm:h-24 sm:w-24">
                    {business.logo_url ? (
                      <Image src={business.logo_url} alt={business.business_name} width={96} height={96} className="h-full w-full object-cover" unoptimized />
                    ) : (
                      <Store className="h-9 w-9" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="min-w-0 break-words text-2xl font-black leading-tight text-slate-950 sm:text-3xl">{business.business_name}</h2>
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-black text-emerald-700 ring-1 ring-emerald-200">
                        <BadgeCheck className="h-3.5 w-3.5" />
                        已认证
                      </span>
                    </div>
                    <p className="mt-1 text-sm font-bold text-slate-500">{primaryType}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                      {ratingCount > 0 ? (
                        <RatingStars value={Number(business.rating_avg || 0)} count={ratingCount} size="md" />
                      ) : (
                        <span className="text-sm font-bold text-slate-400">暂无点评</span>
                      )}
                      <span className="text-sm font-bold text-slate-500">{publishedCount} 个在线服务</span>
                    </div>
                  </div>
                </div>
                {business.description ? <p className="mt-4 max-w-3xl whitespace-pre-line break-words text-sm leading-7 text-slate-600">{business.description}</p> : null}
                {serviceCategories.length ? (
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {serviceCategories.map((item) => (
                      <span key={item} className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-black text-emerald-700 ring-1 ring-emerald-100">{item}</span>
                    ))}
                  </div>
                ) : null}
              </div>
              {business.cover_url ? (
                <div className="relative min-h-44 overflow-hidden rounded-kx-lg bg-slate-100 sm:min-h-56 lg:min-h-full">
                  <Image src={business.cover_url} alt={business.business_name} fill sizes="(max-width: 1024px) 100vw, 340px" className="object-cover" unoptimized />
                </div>
              ) : null}
            </div>
            <dl className="mt-4 grid gap-2 sm:grid-cols-2">
              {business.address ? <InfoRow icon={MapPin} label="地址" value={business.address} /> : null}
              {hoursText ? <InfoRow icon={Clock} label="营业时间" value={hoursText} /> : null}
              {business.contact_method ? <InfoRow icon={Phone} label="联系方式" value={business.contact_method} /> : null}
              {business.website ? (
                <a href={business.website} target="_blank" rel="noopener noreferrer" className="flex items-start gap-2.5 rounded-2xl bg-slate-50 p-3 transition hover:bg-blue-50/70">
                  <Globe className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                  <span className="min-w-0">
                    <span className="block text-xs font-bold text-slate-400">官网 / 社媒</span>
                    <span className="mt-0.5 flex min-w-0 items-center gap-1 text-sm font-black text-blue-600"><span className="min-w-0 break-all">{business.website}</span><ExternalLink className="h-3 w-3 shrink-0" /></span>
                  </span>
                </a>
              ) : null}
            </dl>
            {business.owner ? (
              <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-slate-200/70 bg-slate-50/60 p-3 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <Avatar user={business.owner} size={40} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-black text-slate-900">{business.owner.display_name || business.owner.handle}</p>
                    <p className="text-xs font-bold text-slate-400">商家负责人 · 站内可私信</p>
                  </div>
                </div>
                <Link href={`/u/${business.owner.handle}`} className="inline-flex h-9 w-full shrink-0 items-center justify-center gap-1.5 rounded-full bg-slate-950 px-3.5 text-xs font-black text-white sm:w-auto">
                  <MessageSquare className="h-3.5 w-3.5" />
                  联系商家
                </Link>
              </div>
            ) : null}
          </section>

          <section>
            <h3 className="px-1 text-lg font-black text-slate-950">在线服务 ({listings.length})</h3>
            {listings.length ? (
              <div className="mt-3 grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
                {listings.map((listing) => <ServiceCard key={listing.id} listing={listing} locale={locale} />)}
              </div>
            ) : (
              <p className="mt-3 rounded-2xl bg-white p-5 text-sm font-semibold text-slate-500">商家暂未发布在线服务。</p>
            )}
          </section>

          {reviews.length ? (
            <section className="rounded-kx-sheet border border-slate-200/70 bg-white p-5">
              <h3 className="text-lg font-black text-slate-950">最新点评</h3>
              <div className="mt-3 space-y-4">
                {reviews.map((review) => (
                  <article key={review.id} className="border-t border-slate-100 pt-4 first:border-0 first:pt-0">
                    <div className="flex items-center gap-2.5">
                      <Avatar user={review.author || undefined} size={36} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-black text-slate-900">{review.author?.display_name || review.author?.handle || "Machi 用户"}</p>
                        <p className="flex items-center gap-2 text-xs text-slate-400">
                          <RatingStars value={review.rating} showValue={false} />
                          <span className="font-bold">{(review.created_at || "").slice(0, 10)}</span>
                          {review.listing_title ? <span className="truncate font-bold">· {review.listing_title}</span> : null}
                        </p>
                      </div>
                    </div>
                    {review.content ? <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-700">{review.content}</p> : null}
                    {review.owner_reply ? (
                      <div className="mt-2.5 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-100">
                        <p className="flex items-center gap-1 text-xs font-black text-slate-500"><Store className="h-3.5 w-3.5" /> 商家回复</p>
                        <p className="mt-1 text-sm leading-6 text-slate-600">{review.owner_reply}</p>
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
    <div className="flex items-start gap-2.5 rounded-2xl bg-slate-50 p-3">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
      <span className="min-w-0">
        <span className="block text-xs font-bold text-slate-400">{label}</span>
        <span className="mt-0.5 block break-words text-sm font-black text-slate-800">{value}</span>
      </span>
    </div>
  );
}
