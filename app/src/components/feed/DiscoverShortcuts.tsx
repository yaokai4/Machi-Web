"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ChevronRight,
  Sparkles,
  X,
} from "lucide-react";
import type { RegionInfo } from "@/lib/regions";
import {
  ALL_CHANNELS,
  CHANNEL_GROUPS,
  MORE_CHANNEL_SUMMARY,
  PRIMARY_CHANNELS,
  getChannelByKey,
  getChannelContentTypes,
  normalizeChannelKey,
  type ChannelConfig,
  type ChannelKey,
} from "@/config/channels";

export type ExploreChannelSlug = ChannelKey;
export type ExploreChannelSpec = ChannelConfig;
export const EXPLORE_CHANNELS = ALL_CHANNELS;
export const CORE_EXPLORE_CHANNELS = PRIMARY_CHANNELS;

const CHANNEL_BY_SLUG = new Map(EXPLORE_CHANNELS.map((spec) => [spec.slug, spec]));

export const getExploreChannelSpec = getChannelByKey;
export const getExploreChannelContentTypes = getChannelContentTypes;
export const normalizeExploreChannel = normalizeChannelKey;

export function DiscoverShortcutGrid({
  region,
  selectedChannel,
  onSelectChannel,
  getChannelHref,
}: {
  region?: RegionInfo;
  selectedChannel?: ExploreChannelSlug;
  onSelectChannel: (slug: ExploreChannelSlug) => void;
  getChannelHref?: (slug: ExploreChannelSlug) => string;
}) {
  const [isChannelDialogOpen, setIsChannelDialogOpen] = useState(false);
  const cityName = region?.city_name || "本地";

  const closeDialog = () => {
    setIsChannelDialogOpen(false);
    requestAnimationFrame(() => {
      const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-explore-all-channels]"));
      const visibleButton = buttons.find((button) => button.offsetParent !== null) || buttons[0];
      visibleButton?.focus();
    });
  };

  return (
    <section className="overflow-hidden rounded-[28px] border border-slate-200/70 bg-white shadow-[0_10px_34px_rgba(15,23,42,0.055)]">
      <div className="border-b border-slate-200/60 bg-gradient-to-br from-white via-blue-50/30 to-slate-50/70 px-4 py-4 sm:px-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-slate-950">探索{cityName}</h2>
            <p className="mt-1 text-sm text-slate-500">默认显示本城内容，进入频道后可切到全国范围。</p>
          </div>
          <span className="hidden shrink-0 rounded-full border border-blue-200/70 bg-white px-3 py-1 text-xs font-semibold text-blue-700 shadow-[0_8px_24px_rgba(37,99,235,0.07)] sm:inline-flex">
            {region?.country_emoji || "🌐"} {cityName}
          </span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 p-4 sm:p-5 lg:grid-cols-3">
        {CORE_EXPLORE_CHANNELS.map((spec) => (
          getChannelHref ? (
            <ChannelCardLink
              key={spec.slug}
              spec={spec}
              active={selectedChannel === spec.slug}
              href={getChannelHref(spec.slug)}
            />
          ) : (
            <ChannelCard
              key={spec.slug}
              spec={spec}
              active={selectedChannel === spec.slug}
              onClick={() => onSelectChannel(spec.slug)}
            />
          )
        ))}
        <button
          data-explore-all-channels
          type="button"
          aria-label="打开更多频道"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setIsChannelDialogOpen(true);
          }}
          className="group col-span-2 flex min-h-[64px] items-center gap-3 rounded-2xl border border-blue-200/70 bg-gradient-to-br from-blue-50 via-white to-slate-50 px-3.5 py-3 text-left shadow-[0_10px_30px_rgba(37,99,235,0.08)] transition-all duration-200 ease-out hover:-translate-y-px hover:border-blue-300 hover:shadow-[0_12px_40px_rgba(37,99,235,0.09)] active:scale-[0.99] lg:col-span-1"
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-blue-600 text-white shadow-[0_10px_24px_rgba(37,99,235,0.22)] sm:bg-blue-600/10 sm:text-blue-600 sm:shadow-none">
            <Sparkles className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold text-slate-900">更多频道</span>
            <span className="mt-0.5 block truncate text-xs font-medium text-slate-500">
              {MORE_CHANNEL_SUMMARY}
            </span>
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-blue-500" />
        </button>
      </div>
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

function ChannelCard({ spec, active, onClick }: { spec: ExploreChannelSpec; active?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={channelCardClass(active)}
    >
      <ChannelIcon spec={spec} />
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-slate-900">{spec.title}</span>
        <span className="mt-0.5 block truncate text-xs text-slate-500">{spec.subtitle}</span>
      </span>
    </button>
  );
}

function ChannelCardLink({ spec, active, href }: { spec: ExploreChannelSpec; active?: boolean; href: string }) {
  return (
    <Link href={href} className={channelCardClass(active)}>
      <ChannelIcon spec={spec} />
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-slate-900">{spec.title}</span>
        <span className="mt-0.5 block truncate text-xs text-slate-500">{spec.subtitle}</span>
      </span>
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
        className="absolute inset-0 bg-slate-950/35 backdrop-blur-[2px]"
      />
      <section
        ref={sheetRef}
        className="absolute inset-x-0 bottom-0 max-h-[75dvh] overflow-hidden rounded-t-[24px] bg-white text-slate-900 shadow-[0_32px_80px_rgba(15,23,42,0.22)] md:left-1/2 md:top-1/2 md:bottom-auto md:w-[min(820px,calc(100vw-48px))] md:max-h-[calc(100vh-120px)] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-[24px]"
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
        <div className="mx-auto mt-3 h-1.5 w-12 rounded-full bg-slate-200 md:hidden" />
        <div className="flex items-start justify-between gap-4 border-b border-slate-200/70 px-5 py-4">
          <div>
            <h3 id="all-channel-title" className="text-lg font-semibold text-slate-900">更多频道</h3>
            <p className="mt-1 text-sm text-slate-500">问答、服务、招聘、商家和本地提醒</p>
          </div>
          <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-900">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[calc(75dvh-92px)] overflow-y-auto px-5 py-4 md:max-h-[calc(100vh-220px)]">
          <div className="space-y-5">
            {CHANNEL_GROUPS.map((group) => (
              <div key={group.title}>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">{group.title}</h4>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {group.items.map((slug) => {
                    const spec = CHANNEL_BY_SLUG.get(slug)!;
                    const itemClass = [
                      "group flex min-h-14 items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition-all duration-200 ease-out",
                      "hover:-translate-y-px hover:bg-slate-50/80 hover:shadow-[0_12px_40px_rgba(15,23,42,0.07)]",
                      selectedChannel === slug ? "border-blue-200 bg-blue-50/70" : "border-slate-200/70 bg-white",
                    ].join(" ");
                    const itemContent = (
                      <>
                        <ChannelIcon spec={spec} />
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold text-slate-900">{spec.title}</span>
                          <span className="block truncate text-xs text-slate-500">{spec.subtitle}</span>
                        </span>
                      </>
                    );
                    return getChannelHref ? (
                      <Link
                        key={slug}
                        href={getChannelHref(slug)}
                        aria-label={`查看${spec.title}频道`}
                        onClick={onClose}
                        className={itemClass}
                      >
                        {itemContent}
                      </Link>
                    ) : (
                      <button
                        key={slug}
                        type="button"
                        aria-label={`查看${spec.title}频道`}
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

function channelCardClass(active?: boolean) {
  return [
    "group flex min-h-[72px] items-center gap-3 rounded-2xl border px-3 py-3 text-left",
    "bg-white shadow-[0_8px_26px_rgba(15,23,42,0.035)] transition-all duration-200 ease-out",
    "hover:-translate-y-px hover:shadow-[0_12px_36px_rgba(15,23,42,0.075)]",
    active ? "border-blue-300 bg-blue-50/75 ring-2 ring-blue-100/80" : "border-slate-200/70 hover:border-blue-200/80 hover:bg-slate-50/45",
  ].join(" ");
}

function ChannelIcon({ spec, size = "md" }: { spec: ExploreChannelSpec; size?: "sm" | "md" }) {
  const classes = toneClass(spec.tone);
  return (
    <span className={`grid shrink-0 place-items-center rounded-2xl ${size === "sm" ? "h-8 w-8" : "h-9 w-9"} ${classes}`}>
      <spec.Icon className={size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"} />
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
      return "bg-slate-600/10 text-slate-600";
  }
}
