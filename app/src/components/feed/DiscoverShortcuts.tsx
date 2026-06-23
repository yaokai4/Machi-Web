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
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[17px] font-extrabold text-kx-text/90">{copy.title}</h2>
            <button
              data-explore-all-channels
              type="button"
              aria-label={copy.openMoreAria}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setIsChannelDialogOpen(true);
              }}
              className="group inline-flex h-9 w-fit shrink-0 items-center gap-1.5 rounded-full border border-kx-accent/25 bg-kx-accentSoft/70 px-3 text-xs font-black text-kx-accent shadow-[0_10px_28px_-20px_rgba(20,112,103,0.45)] transition hover:border-kx-accent/45 hover:bg-kx-accentSoft"
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
        title: "Life Features",
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
        title: "生活機能",
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
        title: "生活功能入口",
        subtitle: "二手、租房、找工作、本地服務，每件事都有自己的入口。選好城市，直接進到你現在需要的板塊。",
        more: "更多功能",
        openMoreAria: "打開更多頻道",
        closeMoreAria: "關閉更多頻道",
        allChannels: "全部頻道",
        allChannelsSubtitle: "按使用場景分組，投票、長文、匿名提問只作為發布工具。",
        viewChannel: (label: string) => `查看${label}`,
      };
    default:
      return {
        title: "生活功能入口",
        subtitle: "二手、租房、找工作、本地服务，每件事都有自己的入口。选好城市，直接进到你现在需要的板块。",
        more: "更多功能",
        openMoreAria: "打开更多功能",
        closeMoreAria: "关闭更多功能",
        allChannels: "全部频道",
        allChannelsSubtitle: "按使用场景分组，投票、长文、匿名提问只作为发布工具。",
        viewChannel: (label: string) => `查看${label}`,
      };
  }
}

function ChannelHeroInner({ spec, title, subtitle }: { spec: ExploreChannelSpec; title?: string; subtitle?: string; locale: ReturnType<typeof useI18n>["locale"] }) {
  return (
    <>
      <ChannelIcon spec={spec} size="lg" />
      <span className="relative min-w-0 w-full flex-1">
        <span className="line-clamp-2 break-words text-[15px] font-extrabold leading-snug text-kx-text/90">{title || spec.title}</span>
        <span className="mt-1 line-clamp-2 break-words text-xs leading-5 text-kx-subtle">{subtitle || spec.subtitle}</span>
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
    "group relative flex min-h-[112px] min-w-0 flex-row items-center gap-3 overflow-hidden rounded-kx-lg border p-3 text-left sm:gap-3.5 sm:p-3.5",
    "bg-gradient-to-br shadow-[0_10px_34px_-26px_rgba(15,23,42,0.5)] transition-all duration-200 ease-out",
    "before:absolute before:-right-12 before:-top-14 before:h-28 before:w-28 before:rounded-full before:bg-white/45 before:blur-2xl before:content-['']",
    "hover:-translate-y-0.5 hover:shadow-[0_22px_52px_-32px_rgba(15,23,42,0.55)]",
    accent[channel],
    active ? "border-kx-accent/45 bg-kx-accentSoft/60 ring-2 ring-kx-accent/20" : "border-kx-stroke/45",
  ].join(" ");
}

function secondaryChipClass(active?: boolean) {
  return [
    "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[13px] font-bold transition-all duration-200",
    active ? "border-kx-accent/45 bg-kx-accentSoft/70 text-kx-accent" : "border-kx-stroke/45 bg-kx-card/80 text-kx-subtle hover:border-kx-accent/35 hover:bg-kx-soft hover:text-kx-text",
  ].join(" ");
}

function ChannelIcon({ spec, size = "md" }: { spec: ExploreChannelSpec; size?: "sm" | "md" | "lg" }) {
  // Large hero tiles use a vibrant, solid-filled icon (white glyph + soft
  // colored shadow) so the city entrances read as premium app launchers
  // rather than flat tinted chips. Smaller sizes keep the light tint.
  const classes = size === "lg" ? solidToneClass(spec.tone) : toneClass(spec.tone);
  const box = size === "lg" ? "h-12 w-12 rounded-[18px]" : size === "sm" ? "h-8 w-8 rounded-xl" : "h-9 w-9 rounded-xl";
  const icon = size === "lg" ? "h-6 w-6" : size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";
  return (
    <span className={`grid shrink-0 place-items-center ${box} ${classes}`}>
      <spec.Icon className={icon} />
    </span>
  );
}

// Vibrant, solid-filled icon backgrounds for the large city-entrance tiles —
// a saturated gradient + matching soft shadow, with a white glyph on top.
function solidToneClass(tone: ExploreChannelSpec["tone"]) {
  switch (tone) {
    case "blue":
      return "bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-[0_12px_26px_-12px_rgba(37,99,235,0.65)]";
    case "emerald":
      return "bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-[0_12px_26px_-12px_rgba(16,185,129,0.6)]";
    case "indigo":
      return "bg-gradient-to-br from-indigo-500 to-indigo-600 text-white shadow-[0_12px_26px_-12px_rgba(99,102,241,0.65)]";
    case "violet":
      return "bg-gradient-to-br from-violet-500 to-violet-600 text-white shadow-[0_12px_26px_-12px_rgba(139,92,246,0.65)]";
    case "teal":
      return "bg-gradient-to-br from-teal-500 to-teal-600 text-white shadow-[0_12px_26px_-12px_rgba(20,184,166,0.6)]";
    case "rose":
      return "bg-gradient-to-br from-rose-500 to-rose-600 text-white shadow-[0_12px_26px_-12px_rgba(244,63,94,0.6)]";
    case "orange":
      return "bg-gradient-to-br from-orange-400 to-orange-500 text-white shadow-[0_12px_26px_-12px_rgba(249,115,22,0.6)]";
    case "fuchsia":
      return "bg-gradient-to-br from-fuchsia-500 to-fuchsia-600 text-white shadow-[0_12px_26px_-12px_rgba(217,70,239,0.6)]";
    default:
      return "bg-gradient-to-br from-slate-500 to-slate-600 text-white shadow-[0_12px_26px_-12px_rgba(71,85,105,0.55)]";
  }
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
