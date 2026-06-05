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
  CHANNEL_GROUPS,
  parseDiscoverEntrances,
  getChannelByKey,
  getChannelContentTypes,
  normalizeChannelKey,
  type ChannelConfig,
  type ChannelKey,
} from "@/config/channels";

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
  const siteSettings = useQuery({ queryKey: ["site-settings"], queryFn: () => api.siteSettings(), staleTime: 300_000 });
  const entrances = parseDiscoverEntrances(siteSettings.data?.discover_entrances);
  const primaryEntries = entrances
    .filter((e) => e.enabled && e.tier === "primary")
    .flatMap((e) => {
      const spec = CHANNEL_BY_SLUG.get(e.channel);
      return spec ? [{ spec, title: e.title, subtitle: e.subtitle }] : [];
    });
  const secondaryEntries = entrances
    .filter((e) => e.enabled && e.tier === "secondary")
    .flatMap((e) => {
      const spec = CHANNEL_BY_SLUG.get(e.channel);
      return spec ? [{ spec, title: e.title }] : [];
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
              <h2 className="text-lg font-black text-kx-text">城市入口</h2>
              <p className="mt-1 text-sm leading-5 text-kx-subtle">二手、租房、找工作、本地服务……每件事都有自己的入口。选好城市，直接进到你现在需要的板块，浏览和发布都更快一步。</p>
            </div>
            <button
              data-explore-all-channels
              type="button"
              aria-label="打开更多频道"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setIsChannelDialogOpen(true);
              }}
              className="group inline-flex h-9 w-fit shrink-0 items-center gap-1.5 rounded-full border border-kx-accent/25 bg-kx-accentSoft/70 px-3 text-xs font-black text-kx-accent shadow-[0_10px_28px_-20px_rgba(37,99,235,0.55)] transition hover:border-kx-accent/45 hover:bg-kx-accentSoft"
            >
              <Sparkles className="h-3.5 w-3.5" />
              更多频道
              <ChevronRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
            </button>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-2.5 p-3 sm:grid-cols-2 sm:p-4">
          {primaryEntries.map(({ spec, title, subtitle }) => (
            getChannelHref ? (
              <ChannelHeroLink
                key={spec.slug}
                spec={spec}
                title={title}
                subtitle={subtitle}
                active={selectedChannel === spec.slug}
                href={getChannelHref(spec.slug)}
              />
            ) : (
              <ChannelHeroButton
                key={spec.slug}
                spec={spec}
                title={title}
                subtitle={subtitle}
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

function ChannelHeroButton({ spec, title, subtitle, active, onClick }: { spec: ExploreChannelSpec; title?: string; subtitle?: string; active?: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={channelHeroClass(active)}>
      <ChannelHeroInner spec={spec} title={title} subtitle={subtitle} />
    </button>
  );
}

function ChannelHeroLink({ spec, title, subtitle, active, href }: { spec: ExploreChannelSpec; title?: string; subtitle?: string; active?: boolean; href: string }) {
  return (
    <Link href={href} className={channelHeroClass(active)}>
      <ChannelHeroInner spec={spec} title={title} subtitle={subtitle} />
    </Link>
  );
}

function AllChannelDialog({
  selectedChannel,
  getChannelHref,
  onClose,
  onSelect,
}: {
  selectedChannel?: ExploreChannelSlug;
  getChannelHref?: (slug: ExploreChannelSlug) => string;
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

  return createPortal(
    <div className="fixed inset-0 z-[90]">
      <button
        type="button"
        aria-label="关闭更多频道"
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
            <h3 id="all-channel-title" className="text-lg font-semibold text-kx-text">全部频道</h3>
            <p className="mt-1 text-sm text-kx-subtle">按使用场景分组，投票、长文、匿名提问只作为发布工具。</p>
          </div>
          <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full border border-kx-stroke/55 text-kx-muted transition hover:bg-kx-soft hover:text-kx-text">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[calc(75dvh-92px)] overflow-y-auto px-5 py-4 md:max-h-[calc(100vh-220px)]">
          <div className="space-y-5">
            {CHANNEL_GROUPS.map((group) => (
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
                          {item.tool ? <span className="mt-1 inline-flex rounded-full bg-kx-soft px-2 py-0.5 text-[10px] font-bold text-kx-subtle">发布工具</span> : null}
                        </span>
                      </>
                    );
                    return getChannelHref ? (
                      <Link
                        key={`${group.title}-${item.label}`}
                        href={getChannelHref(slug)}
                        aria-label={`查看${item.label}`}
                        onClick={onClose}
                        className={itemClass}
                      >
                        {itemContent}
                      </Link>
                    ) : (
                      <button
                        key={`${group.title}-${item.label}`}
                        type="button"
                        aria-label={`查看${item.label}`}
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

function ChannelHeroInner({ spec, title, subtitle }: { spec: ExploreChannelSpec; title?: string; subtitle?: string }) {
  return (
    <>
      <ChannelIcon spec={spec} size="lg" />
      <span className="relative min-w-0 flex-1">
        <span className="block text-[15px] font-black text-kx-text">{title || spec.title}</span>
        <span className="mt-1 block text-[13px] leading-5 text-kx-subtle">{subtitle || spec.subtitle}</span>
      </span>
      <span className="relative mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-kx-soft text-kx-muted transition-all duration-200 group-hover:bg-kx-text group-hover:text-kx-card">
        <ChevronRight className="h-4 w-4" />
      </span>
    </>
  );
}

function channelHeroClass(active?: boolean) {
  return [
    "group relative flex min-h-[112px] items-start gap-3.5 overflow-hidden rounded-kx-lg border p-4 text-left",
    "bg-kx-card/[0.78] shadow-[0_10px_34px_-26px_rgba(15,23,42,0.5)] transition-all duration-200 ease-out",
    "hover:-translate-y-0.5 hover:border-kx-accent/35 hover:bg-kx-accentSoft/30 hover:shadow-[0_22px_52px_-32px_rgba(15,23,42,0.55)]",
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
