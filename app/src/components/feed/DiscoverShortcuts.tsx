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
            <h2 className="text-[17px] font-bold text-kx-text">{copy.title}</h2>
            <button
              data-explore-all-channels
              type="button"
              aria-label={copy.openMoreAria}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setIsChannelDialogOpen(true);
              }}
              className="group inline-flex h-9 w-fit shrink-0 items-center gap-1.5 rounded-full border border-kx-accent/25 bg-kx-accentSoft/70 px-3 text-xs font-bold text-kx-accent shadow-[0_10px_28px_-20px_rgb(var(--kx-accent)/0.4)] transition hover:border-kx-accent/45 hover:bg-kx-accentSoft"
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
        className="absolute inset-x-0 bottom-0 max-h-[75dvh] overflow-hidden rounded-t-kx-sheet bg-kx-card text-kx-text shadow-[0_32px_80px_rgb(var(--kx-shadow)/0.25)] md:left-1/2 md:top-1/2 md:bottom-auto md:w-[min(820px,calc(100vw-48px))] md:max-h-[calc(100vh-120px)] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-kx-sheet"
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
                      "group flex min-h-14 items-center gap-3 rounded-kx-md border px-3 py-2.5 text-left transition-[border-color,background-color] duration-200 ease-out",
                      "hover:border-kx-accent/30 hover:bg-kx-accentSoft/40",
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
        <span className="line-clamp-2 break-words text-[15px] font-bold leading-snug text-kx-text">{title || spec.title}</span>
        <span className="mt-1 line-clamp-2 break-words text-xs leading-5 text-kx-subtle">{subtitle || spec.subtitle}</span>
      </span>
      <span className="relative mt-0.5 hidden h-8 w-8 shrink-0 place-items-center rounded-full bg-kx-soft text-kx-muted transition-all duration-200 group-hover:bg-kx-accent group-hover:text-kx-onAccent sm:grid">
        <ChevronRight className="h-4 w-4" />
      </span>
    </>
  );
}

function channelHeroClass(_channel: ExploreChannelSlug, active?: boolean) {
  // One quiet card language for every channel (mirrors iOS KXCard): flat
  // warm-white surface, hairline stroke, soft resting shadow. The old
  // per-channel pastel gradients + white glow blob + hover lift are gone —
  // hover only deepens the border and washes in the 墨绿 accent-soft tint,
  // and both themes resolve through tokens (no dark: patches).
  return [
    "group relative flex min-h-[104px] min-w-0 flex-row items-center gap-3 rounded-kx-lg border p-3 text-left sm:gap-3.5 sm:p-3.5",
    "bg-kx-card shadow-[0_1px_2px_rgb(var(--kx-shadow)/0.04),0_12px_34px_-28px_rgb(var(--kx-shadow)/0.28)]",
    "transition-[border-color,background-color,box-shadow] duration-200 ease-out",
    "hover:border-kx-accent/35 hover:bg-kx-accentSoft/40 hover:shadow-kx-float",
    active ? "border-kx-accent/50 bg-kx-accentSoft/60 ring-2 ring-kx-accent/20" : "border-kx-stroke/45",
  ].join(" ");
}

function secondaryChipClass(active?: boolean) {
  return [
    "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[13px] font-bold transition-all duration-200",
    active ? "border-kx-accent/45 bg-kx-accentSoft/70 text-kx-accent" : "border-kx-stroke/45 bg-kx-card/80 text-kx-subtle hover:border-kx-accent/35 hover:bg-kx-soft hover:text-kx-text",
  ].join(" ");
}

function ChannelIcon({ spec, size = "md" }: { spec: ExploreChannelSpec; size?: "sm" | "md" | "lg" }) {
  // Hero tiles get a slightly stronger accent-soft chip; smaller sizes use
  // the lighter 0.095 tint. Same single accent family at every size.
  const classes = size === "lg" ? solidToneClass(spec.tone) : toneClass(spec.tone);
  const box = size === "lg" ? "h-12 w-12 rounded-[18px]" : size === "sm" ? "h-8 w-8 rounded-xl" : "h-9 w-9 rounded-xl";
  const icon = size === "lg" ? "h-6 w-6" : size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";
  return (
    <span className={`grid shrink-0 place-items-center ${box} ${classes}`}>
      <spec.Icon className={icon} />
    </span>
  );
}

// Icon chips read in a single 墨绿 accent family (mirrors iOS CategoryChip:
// soft accent tint + hairline stroke). The per-tone saturated gradients and
// their hardcoded rgba shadows are gone — hierarchy comes from chip size,
// not from eight competing hues.
function solidToneClass(_tone: ExploreChannelSpec["tone"]) {
  return "bg-kx-accentSoft text-kx-accent ring-1 ring-inset ring-kx-accent/[0.16] shadow-[0_10px_24px_-16px_rgb(var(--kx-accent)/0.45)]";
}

function toneClass(_tone: ExploreChannelSpec["tone"]) {
  return "bg-kx-accent/[0.095] text-kx-accent ring-1 ring-inset ring-kx-accent/[0.14]";
}
