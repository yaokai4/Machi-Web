"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ChevronRight,
  Sparkles,
  X,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  ALL_CHANNELS,
  parseDiscoverEntrances,
  getChannelByKey,
  getChannelCopy,
  getChannelToolLabel,
  getLocalizedChannelGroups,
  getChannelContentTypes,
  normalizeChannelKey,
  type ChannelConfig,
  type ChannelKey,
} from "@/config/channels";
import { useI18n } from "@/lib/i18n";

export type ExploreChannelSlug = ChannelKey;
export type ExploreChannelSpec = ChannelConfig;
export const EXPLORE_CHANNELS = ALL_CHANNELS;
export const CORE_EXPLORE_CHANNELS = ALL_CHANNELS;

const CHANNEL_BY_SLUG = new Map(EXPLORE_CHANNELS.map((spec) => [spec.slug, spec]));

export const getExploreChannelSpec = getChannelByKey;
export const getExploreChannelContentTypes = getChannelContentTypes;
export const normalizeExploreChannel = normalizeChannelKey;

export function DiscoverShortcutGrid({
  selectedChannel,
  onSelectChannel,
  getChannelHref,
}: {
  selectedChannel?: ExploreChannelSlug;
  onSelectChannel: (slug: ExploreChannelSlug) => void;
  getChannelHref?: (slug: ExploreChannelSlug) => string;
}) {
  const [isChannelDialogOpen, setIsChannelDialogOpen] = useState(false);
  const { locale } = useI18n();
  const siteSettings = useQuery({ queryKey: ["site-settings"], queryFn: () => api.siteSettings(), staleTime: 300_000 });
  const copy = discoverShortcutCopy(locale);
  const entrances = parseDiscoverEntrances(siteSettings.data?.discover_entrances);
  const primaryEntries = entrances
    .filter((e) => e.enabled && e.tier === "primary")
    .flatMap((e) => {
      const spec = CHANNEL_BY_SLUG.get(e.channel);
      return spec ? [{ spec, title: entranceTitle(spec, e.title, locale), subtitle: entranceSubtitle(spec, e.subtitle, locale) }] : [];
    });
  const secondaryEntries = entrances
    .filter((e) => e.enabled && e.tier === "secondary")
    .flatMap((e) => {
      const spec = CHANNEL_BY_SLUG.get(e.channel);
      return spec ? [{ spec, title: entranceTitle(spec, e.title, locale) }] : [];
    });

  const closeDialog = () => {
    setIsChannelDialogOpen(false);
    requestAnimationFrame(() => {
      const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-explore-all-channels]"));
      const visibleButton = buttons.find((button) => button.offsetParent !== null) || buttons[0];
      visibleButton?.focus();
    });
  };

  return (
    <section className="space-y-4">
      <section className="kx-discover-panel">
        <div className="kx-discover-panel-header">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h2 className="text-[17px] font-extrabold text-kx-text/90">{copy.title}</h2>
              <p className="mt-1 text-sm leading-5 text-kx-subtle">{copy.subtitle}</p>
            </div>
            <button
              data-explore-all-channels
              type="button"
              aria-label={copy.openMoreAria}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setIsChannelDialogOpen(true);
              }}
              className="group inline-flex h-9 w-fit shrink-0 items-center gap-1.5 rounded-full border border-kx-accent/25 bg-kx-accentSoft/70 px-3 text-xs font-black text-kx-accent shadow-[0_10px_28px_-20px_rgba(37,99,235,0.55)] transition hover:border-kx-accent/45 hover:bg-kx-accentSoft"
            >
              <Sparkles className="h-3.5 w-3.5" />
              {copy.more}
              <ChevronRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2.5 p-3 sm:p-4">
          {primaryEntries.map(({ spec, title, subtitle }) => (
            getChannelHref ? (
              <ChannelHeroLink
                key={spec.slug}
                spec={spec}
                title={title}
                subtitle={subtitle}
                locale={locale}
                active={selectedChannel === spec.slug}
                href={getChannelHref(spec.slug)}
              />
            ) : (
              <ChannelHeroButton
                key={spec.slug}
                spec={spec}
                title={title}
                subtitle={subtitle}
                locale={locale}
                active={selectedChannel === spec.slug}
                onClick={() => onSelectChannel(spec.slug)}
              />
            )
          ))}
        </div>
        {secondaryEntries.length ? (
          <div className="flex flex-wrap gap-2 border-t border-kx-stroke/30 px-3 py-3 sm:px-4">
            {secondaryEntries.map(({ spec, title }) => (
              getChannelHref ? (
                <Link key={spec.slug} href={getChannelHref(spec.slug)} className={secondaryChipClass(selectedChannel === spec.slug)}>
                  <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-lg ${toneClass(spec.tone)}`}><spec.Icon className="h-3.5 w-3.5" /></span>
                  {title || spec.title}
                </Link>
              ) : (
                <button key={spec.slug} type="button" onClick={() => onSelectChannel(spec.slug)} className={secondaryChipClass(selectedChannel === spec.slug)}>
                  <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-lg ${toneClass(spec.tone)}`}><spec.Icon className="h-3.5 w-3.5" /></span>
                  {title || spec.title}
                </button>
              )
            ))}
          </div>
        ) : null}
      </section>
      {isChannelDialogOpen ? (
        <AllChannelDialog
          selectedChannel={selectedChannel}
          getChannelHref={getChannelHref}
          locale={locale}
          onClose={closeDialog}
          onSelect={(slug) => {
            onSelectChannel(slug);
            closeDialog();
          }}
        />
      ) : null}
    </section>
  );
}

function ChannelHeroButton({ spec, title, subtitle, locale, active, onClick }: { spec: ExploreChannelSpec; title?: string; subtitle?: string; locale: ReturnType<typeof useI18n>["locale"]; active?: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={channelHeroClass(spec.slug, active)}>
      <ChannelHeroInner spec={spec} title={title} subtitle={subtitle} locale={locale} />
    </button>
  );
}

function ChannelHeroLink({ spec, title, subtitle, locale, active, href }: { spec: ExploreChannelSpec; title?: string; subtitle?: string; locale: ReturnType<typeof useI18n>["locale"]; active?: boolean; href: string }) {
  return (
    <Link href={href} className={channelHeroClass(spec.slug, active)}>
      <ChannelHeroInner spec={spec} title={title} subtitle={subtitle} locale={locale} />
    </Link>
  );
}

function AllChannelDialog({
  selectedChannel,
  getChannelHref,
  locale,
  onClose,
  onSelect,
}: {
  selectedChannel?: ExploreChannelSlug;
  getChannelHref?: (slug: ExploreChannelSlug) => string;
  locale: ReturnType<typeof useI18n>["locale"];
  onClose: () => void;
  onSelect: (slug: ExploreChannelSlug) => void;
}) {
  const [mounted, setMounted] = useState(false);
  const sheetRef = useRef<HTMLElement | null>(null);
  const touchStartY = useRef<number | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const previousOverflow = document.body.style.overflow;
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  if (!mounted) return null;
  const copy = discoverShortcutCopy(locale);
  const groups = getLocalizedChannelGroups(locale);
  const toolLabel = getChannelToolLabel(locale);

  return createPortal(
    <div className="fixed inset-0 z-[90]">
      <button
        type="button"
        aria-label={copy.closeMoreAria}
        onClick={onClose}
        className="absolute inset-0 bg-kx-text/35 backdrop-blur-[2px]"
      />
      <section
        ref={sheetRef}
        className="absolute inset-x-0 bottom-0 max-h-[75dvh] overflow-hidden rounded-t-kx-sheet bg-kx-card text-kx-text shadow-[0_32px_80px_rgba(15,23,42,0.22)] md:left-1/2 md:top-1/2 md:bottom-auto md:w-[min(820px,calc(100vw-48px))] md:max-h-[calc(100vh-120px)] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-kx-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="all-channel-title"
        onTouchStart={(event) => {
          touchStartY.current = event.touches[0]?.clientY ?? null;
        }}
        onTouchMove={(event) => {
          if (touchStartY.current == null) return;
          if ((event.touches[0]?.clientY ?? 0) - touchStartY.current > 90) onClose();
        }}
      >
        <div className="mx-auto mt-3 h-1.5 w-12 rounded-full bg-kx-stroke/55 md:hidden" />
        <div className="flex items-start justify-between gap-4 border-b border-kx-stroke/40 px-5 py-4">
          <div>
            <h3 id="all-channel-title" className="text-lg font-semibold text-kx-text">{copy.allChannels}</h3>
            <p className="mt-1 text-sm text-kx-subtle">{copy.allChannelsSubtitle}</p>
          </div>
          <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full border border-kx-stroke/55 text-kx-muted transition hover:bg-kx-soft hover:text-kx-text">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[calc(75dvh-92px)] overflow-y-auto px-5 py-4 md:max-h-[calc(100vh-220px)]">
          <div className="space-y-5">
            {groups.map((group) => (
              <div key={group.title}>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-kx-muted">{group.title}</h4>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {group.items.map((item) => {
                    const spec = CHANNEL_BY_SLUG.get(item.channel)!;
                    const Icon = item.Icon || spec.Icon;
                    const slug = item.channel;
                    const itemClass = [
                      "group flex min-h-14 items-center gap-3 rounded-kx-md border px-3 py-2.5 text-left transition-all duration-200 ease-out",
                      "hover:-translate-y-px hover:bg-kx-soft/70 hover:shadow-[0_12px_40px_rgba(15,23,42,0.07)]",
                      selectedChannel === slug ? "border-kx-accent/35 bg-kx-accentSoft/70" : "border-kx-stroke/45 bg-kx-card/80",
                    ].join(" ");
                    const itemContent = (
                      <>
                        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-2xl ${toneClass(spec.tone)}`}>
                          <Icon className="h-4 w-4" />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold text-kx-text">{item.label}</span>
                          <span className="block truncate text-xs text-kx-subtle">{item.subtitle}</span>
                          {item.tool ? <span className="mt-1 inline-flex rounded-full bg-kx-soft px-2 py-0.5 text-[10px] font-bold text-kx-subtle">{toolLabel}</span> : null}
                        </span>
                      </>
                    );
                    return getChannelHref ? (
                      <Link
                        key={`${group.title}-${item.label}`}
                        href={getChannelHref(slug)}
                        aria-label={copy.viewChannel(item.label)}
                        onClick={onClose}
                        className={itemClass}
                      >
                        {itemContent}
                      </Link>
                    ) : (
                      <button
                        key={`${group.title}-${item.label}`}
                        type="button"
                        aria-label={copy.viewChannel(item.label)}
                        onClick={() => onSelect(slug)}
                        className={itemClass}
                      >
                        {itemContent}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>,
    document.body,
  );
}

function entranceTitle(spec: ExploreChannelSpec, title: string | undefined, locale: ReturnType<typeof useI18n>["locale"]) {
  if (locale === "zh-Hans" || locale === "zh-Hant") return title || getChannelCopy(spec, locale).title;
  return getChannelCopy(spec, locale).title;
}

function entranceSubtitle(spec: ExploreChannelSpec, subtitle: string | undefined, locale: ReturnType<typeof useI18n>["locale"]) {
  if (locale === "zh-Hans" || locale === "zh-Hant") return subtitle || getChannelCopy(spec, locale).subtitle;
  return getChannelCopy(spec, locale).subtitle;
}

function discoverShortcutCopy(locale: ReturnType<typeof useI18n>["locale"]) {
  switch (locale) {
    case "en":
      return {
        title: "City Entrances",
        subtitle: "Marketplace, housing, jobs, and local services each have their own lane. Pick a city and jump straight into the section you need.",
        more: "More Channels",
        openMoreAria: "Open more channels",
        closeMoreAria: "Close more channels",
        allChannels: "All Channels",
        allChannelsSubtitle: "Grouped by use case. Polls, long posts, and anonymous questions are publishing tools.",
        viewChannel: (label: string) => `View ${label}`,
      };
    case "ja":
      return {
        title: "街の入口",
        subtitle: "フリマ、住まい、仕事、ローカルサービスを用途別に整理。街を選ぶだけで必要な場所へすぐ移動できます。",
        more: "さらに表示",
        openMoreAria: "さらにチャンネルを開く",
        closeMoreAria: "チャンネル一覧を閉じる",
        allChannels: "すべてのチャンネル",
        allChannelsSubtitle: "用途別に整理しています。投票、長文、匿名質問は投稿ツールです。",
        viewChannel: (label: string) => `${label}を見る`,
      };
    case "zh-Hant":
      return {
        title: "城市入口",
        subtitle: "二手、租房、找工作、本地服務，每件事都有自己的入口。選好城市，直接進到你現在需要的板塊。",
        more: "更多頻道",
        openMoreAria: "打開更多頻道",
        closeMoreAria: "關閉更多頻道",
        allChannels: "全部頻道",
        allChannelsSubtitle: "按使用場景分組，投票、長文、匿名提問只作為發布工具。",
        viewChannel: (label: string) => `查看${label}`,
      };
    default:
      return {
        title: "城市入口",
        subtitle: "二手、租房、找工作、本地服务，每件事都有自己的入口。选好城市，直接进到你现在需要的板块。",
        more: "更多频道",
        openMoreAria: "打开更多频道",
        closeMoreAria: "关闭更多频道",
        allChannels: "全部频道",
        allChannelsSubtitle: "按使用场景分组，投票、长文、匿名提问只作为发布工具。",
        viewChannel: (label: string) => `查看${label}`,
      };
  }
}

function ChannelHeroInner({ spec, title, subtitle, locale }: { spec: ExploreChannelSpec; title?: string; subtitle?: string; locale: ReturnType<typeof useI18n>["locale"] }) {
  const details = channelHeroDetails(spec.slug, locale);
  return (
    <>
      <ChannelIcon spec={spec} size="lg" />
      <span className="relative min-w-0 w-full flex-1 sm:w-auto">
        <span className="block break-words text-[15px] font-extrabold text-kx-text/90">{title || spec.title}</span>
        <span className="mt-1 block break-words text-xs leading-4 text-kx-subtle sm:text-[13px] sm:leading-5">{subtitle || spec.subtitle}</span>
        <span className="mt-2 flex flex-wrap gap-1.5">
          {details.tags.map((tag) => (
            <span key={tag} className="rounded-full bg-white/72 px-2 py-0.5 text-[10px] font-black text-kx-text/70 ring-1 ring-kx-stroke/35 dark:bg-white/10">
              {tag}
            </span>
          ))}
        </span>
        <span className="mt-2 inline-flex text-[11px] font-black text-kx-accent">{details.cta}</span>
      </span>
      <span className="relative mt-0.5 hidden h-8 w-8 shrink-0 place-items-center rounded-full bg-kx-soft text-kx-muted transition-all duration-200 group-hover:bg-kx-accent group-hover:text-white sm:grid">
        <ChevronRight className="h-4 w-4" />
      </span>
    </>
  );
}

function channelHeroClass(channel: ExploreChannelSlug, active?: boolean) {
  const accent = {
    market: "from-emerald-50/90 via-white to-teal-50/90 hover:border-emerald-300/70",
    housing: "from-indigo-50/90 via-white to-sky-50/90 hover:border-indigo-300/70",
    jobs: "from-violet-50/90 via-white to-fuchsia-50/80 hover:border-violet-300/70",
    services: "from-orange-50/95 via-white to-rose-50/80 hover:border-orange-300/70",
    guide: "from-emerald-50/80 via-white to-white hover:border-emerald-300/60",
    news: "from-blue-50/80 via-white to-white hover:border-blue-300/60",
    deals: "from-rose-50/80 via-white to-white hover:border-rose-300/60",
    groups: "from-fuchsia-50/80 via-white to-white hover:border-fuchsia-300/60",
    qa: "from-blue-50/80 via-white to-white hover:border-blue-300/60",
  } satisfies Record<ExploreChannelSlug, string>;
  return [
    "group relative flex min-h-[184px] min-w-0 flex-col items-start gap-3 overflow-hidden rounded-kx-lg border p-3 text-left sm:min-h-[156px] sm:flex-row sm:gap-3.5 sm:p-4",
    "bg-gradient-to-br shadow-[0_10px_34px_-26px_rgba(15,23,42,0.5)] transition-all duration-200 ease-out",
    "before:absolute before:-right-12 before:-top-14 before:h-28 before:w-28 before:rounded-full before:bg-white/45 before:blur-2xl before:content-['']",
    "hover:-translate-y-0.5 hover:shadow-[0_22px_52px_-32px_rgba(15,23,42,0.55)]",
    accent[channel],
    active ? "border-kx-accent/45 bg-kx-accentSoft/60 ring-2 ring-kx-accent/20" : "border-kx-stroke/45",
  ].join(" ");
}

function channelHeroDetails(channel: ExploreChannelSlug, locale: ReturnType<typeof useI18n>["locale"]) {
  const zh = {
    market: { tags: ["估价", "求购", "交易安全"], cta: "像闲鱼 / Mercari 一样找同城好物" },
    housing: { tags: ["通勤", "看房预约", "房源核验"], cta: "像 SUUMO / 安居客 一样筛房源" },
    jobs: { tags: ["薪资", "申请进度", "雇主认证"], cta: "像 Indeed / BOSS 一样找机会" },
    services: { tags: ["点评", "预约", "酒店景点"], cta: "像美团 / 大众点评一样找服务" },
    guide: { tags: ["攻略", "手续", "避坑"], cta: "查看城市生活指南" },
    news: { tags: ["交通", "天气", "公告"], cta: "查看本地快讯" },
    deals: { tags: ["折扣", "团购", "到店"], cta: "查看附近优惠" },
    groups: { tags: ["饭局", "语言交换", "活动"], cta: "加入城市小组" },
    qa: { tags: ["提问", "互助", "匿名"], cta: "发起本地求助" },
  } satisfies Record<ExploreChannelSlug, { tags: string[]; cta: string }>;
  const en = {
    market: { tags: ["Pricing", "Wanted", "Safety"], cta: "Find city deals like Mercari" },
    housing: { tags: ["Commute", "Viewing", "Verified"], cta: "Filter rentals like SUUMO" },
    jobs: { tags: ["Salary", "Apply", "Employers"], cta: "Find work like Indeed" },
    services: { tags: ["Reviews", "Bookings", "Travel"], cta: "Find services, stays, and attractions" },
    guide: { tags: ["Guides", "Procedures", "Safety"], cta: "Open city guides" },
    news: { tags: ["Transit", "Weather", "Notices"], cta: "Open local news" },
    deals: { tags: ["Deals", "Coupons", "Stores"], cta: "Browse nearby deals" },
    groups: { tags: ["Meetups", "Language", "Events"], cta: "Join local groups" },
    qa: { tags: ["Questions", "Help", "Anon"], cta: "Ask the city" },
  } satisfies Record<ExploreChannelSlug, { tags: string[]; cta: string }>;
  const ja = {
    market: { tags: ["相場", "探し物", "安全取引"], cta: "Mercari のように街の品を探す" },
    housing: { tags: ["通勤", "内見予約", "物件確認"], cta: "SUUMO のように住まいを探す" },
    jobs: { tags: ["給与", "応募管理", "雇用主認証"], cta: "Indeed のように仕事を探す" },
    services: { tags: ["口コミ", "予約", "宿泊・観光"], cta: "地域サービスと観光を探す" },
    guide: { tags: ["攻略", "手続き", "注意"], cta: "街のガイドを見る" },
    news: { tags: ["交通", "天気", "告知"], cta: "地域ニュースを見る" },
    deals: { tags: ["割引", "特典", "店舗"], cta: "近くのお得情報を見る" },
    groups: { tags: ["食事会", "言語交換", "イベント"], cta: "地域グループへ" },
    qa: { tags: ["質問", "助け合い", "匿名"], cta: "街に相談する" },
  } satisfies Record<ExploreChannelSlug, { tags: string[]; cta: string }>;
  if (locale === "en") return en[channel];
  if (locale === "ja") return ja[channel];
  return zh[channel];
}

function secondaryChipClass(active?: boolean) {
  return [
    "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[13px] font-bold transition-all duration-200",
    active ? "border-kx-accent/45 bg-kx-accentSoft/70 text-kx-accent" : "border-kx-stroke/45 bg-kx-card/80 text-kx-subtle hover:border-kx-accent/35 hover:bg-kx-soft hover:text-kx-text",
  ].join(" ");
}

function ChannelIcon({ spec, size = "md" }: { spec: ExploreChannelSpec; size?: "sm" | "md" | "lg" }) {
  const classes = toneClass(spec.tone);
  const box = size === "lg" ? "h-12 w-12 rounded-[18px]" : size === "sm" ? "h-8 w-8" : "h-9 w-9";
  const icon = size === "lg" ? "h-5 w-5" : size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";
  return (
    <span className={`grid shrink-0 place-items-center ${box} ${classes}`}>
      <spec.Icon className={icon} />
    </span>
  );
}

function toneClass(tone: ExploreChannelSpec["tone"]) {
  switch (tone) {
    case "blue":
      return "bg-blue-600/10 text-blue-600";
    case "emerald":
      return "bg-emerald-600/10 text-emerald-600";
    case "indigo":
      return "bg-indigo-600/10 text-indigo-600";
    case "violet":
      return "bg-violet-600/10 text-violet-600";
    case "teal":
      return "bg-teal-600/10 text-teal-600";
    case "rose":
      return "bg-rose-600/10 text-rose-600";
    case "orange":
      return "bg-orange-500/10 text-orange-600";
    case "fuchsia":
      return "bg-fuchsia-600/10 text-fuchsia-600";
    default:
      return "bg-kx-soft text-kx-subtle";
  }
}
