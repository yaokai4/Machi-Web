"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ChevronRight, Search, X } from "lucide-react";
import clsx from "clsx";
import {
  REGION_COUNTRIES,
  citiesFor,
  countryByCode,
  hotCitiesForCountry,
  provincesFor,
  regionDisplayName,
  regionHeaderLabel,
  resolveRegion,
  searchRegions,
  type RegionCountry,
  type RegionInfo,
  type RegionProvince,
} from "@/lib/regions";

const FIRST_TIER_REGION_CODES: Record<string, string[]> = {
  cn: ["cn.beijing.beijing", "cn.shanghai.shanghai", "cn.guangdong.shenzhen", "cn.guangdong.guangzhou"],
  jp: ["jp.tokyo.tokyo", "jp.osaka.osaka", "jp.kyoto.kyoto", "jp.aichi.nagoya", "jp.fukuoka.fukuoka"],
  us: ["us.ny.nyc", "us.ca.la", "us.ca.sf", "us.wa.seattle", "us.tx.austin"],
  uk: ["uk.london", "uk.manchester", "uk.edinburgh"],
  ca: ["ca.toronto", "ca.vancouver", "ca.montreal"],
  au: ["au.sydney", "au.melbourne", "au.brisbane"],
  sg: ["sg.singapore"],
  kr: ["kr.seoul", "kr.busan"],
  th: ["th.bangkok"],
  my: ["my.kl", "my.penang"],
  de: ["de.berlin", "de.munich", "de.hamburg"],
  fr: ["fr.paris", "fr.lyon"],
  nl: ["nl.amsterdam"],
};

function firstTierRegionsForCountry(countryCode?: string): RegionInfo[] {
  const code = countryCode?.toLowerCase() || "jp";
  const configured = FIRST_TIER_REGION_CODES[code] || [];
  const regions = configured
    .map((regionCode) => resolveRegion(regionCode))
    .filter((region): region is RegionInfo => Boolean(region));
  if (regions.length) return regions;
  return hotCitiesForCountry(code).slice(0, 5);
}

interface RegionPickerDialogProps {
  open: boolean;
  onClose: () => void;
  onSelect: (region: RegionInfo) => void;
  initialCountry?: string;
  allowsAnyCountry?: boolean;
  recentCodes?: string[];
}

export function RegionPickerDialog({
  open,
  onClose,
  onSelect,
  initialCountry,
  allowsAnyCountry = true,
  recentCodes = [],
}: RegionPickerDialogProps) {
  const [query, setQuery] = useState("");
  const [country, setCountry] = useState<RegionCountry | null>(null);
  const [province, setProvince] = useState<RegionProvince | null>(null);
  const [mounted, setMounted] = useState(false);
  const allowedCountry = allowsAnyCountry ? undefined : initialCountry?.toLowerCase();
  const homeCountryCode = (initialCountry || allowedCountry || "jp").toLowerCase();

  const availableCountries = useMemo(
    () => (allowedCountry ? REGION_COUNTRIES.filter((item) => item.code === allowedCountry) : REGION_COUNTRIES),
    [allowedCountry],
  );
  const currentPopular = useMemo(
    () => firstTierRegionsForCountry(homeCountryCode),
    [homeCountryCode],
  );
  const recentRegions = useMemo(
    () =>
      recentCodes
        .map((code) => resolveRegion(code))
        .filter((region): region is RegionInfo => Boolean(region))
        .filter((region) => region.country_code === homeCountryCode)
        .slice(0, 8),
    [recentCodes, homeCountryCode],
  );
  const matches = useMemo(() => searchRegions(query, allowedCountry), [query, allowedCountry]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setCountry(allowedCountry ? countryByCode(allowedCountry) ?? null : null);
    setProvince(null);
  }, [open, allowedCountry]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  if (!open || !mounted) return null;

  const deliver = (region: RegionInfo) => {
    onSelect(region);
    onClose();
  };

  const goBack = () => {
    if (province) {
      setProvince(null);
      return;
    }
    if (country && !allowedCountry) setCountry(null);
  };

  const title = province?.name || country?.name || "选择国家 / 城市";
  const canGoBack = Boolean(province || (country && !allowedCountry));

  const node = (
    <div
      className="fixed inset-0 z-[120] flex items-end justify-center bg-slate-950/45 px-3 py-0 backdrop-blur-sm sm:items-center sm:px-4 sm:py-4"
      onMouseDown={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="选择地区"
    >
      <div
        className="flex max-h-[88dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-[28px] bg-kx-bg shadow-2xl ring-1 ring-kx-stroke sm:rounded-[28px]"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="kx-glass-bar flex items-center gap-2 px-4 py-3">
          {canGoBack ? (
            <button
              type="button"
              onClick={goBack}
              className="grid h-9 w-9 place-items-center rounded-full bg-kx-soft text-kx-text"
              aria-label="返回上一级"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          ) : null}
          <h2 className="min-w-0 flex-1 truncate text-base font-black">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-full bg-kx-soft text-kx-muted hover:text-kx-text"
            aria-label="关闭"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="overflow-y-auto px-4 py-4">
          <label className="mb-4 flex h-11 items-center gap-2 rounded-kx-lg bg-kx-soft px-3 ring-1 ring-kx-stroke/70">
            <Search className="h-4 w-4 text-kx-muted" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索国家、省份或城市"
              className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none placeholder:text-kx-muted"
            />
            {query ? (
              <button type="button" onClick={() => setQuery("")} className="text-kx-muted" aria-label="清空搜索">
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </label>

          {query.trim() ? (
            <SearchResultList matches={matches} onSelect={deliver} />
          ) : country ? (
            <CountryDrilldown country={country} province={province} onProvince={setProvince} onSelect={deliver} />
          ) : (
            <RegionPickerLanding
              availableCountries={availableCountries}
              homeCountryCode={homeCountryCode}
              currentPopular={currentPopular}
              recentRegions={recentRegions}
              onCountry={setCountry}
              onSelect={deliver}
            />
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(node, document.body);
}

function RegionPickerLanding({
  availableCountries,
  homeCountryCode,
  currentPopular,
  recentRegions,
  onCountry,
  onSelect,
}: {
  availableCountries: RegionCountry[];
  homeCountryCode: string;
  currentPopular: RegionInfo[];
  recentRegions: RegionInfo[];
  onCountry: (country: RegionCountry) => void;
  onSelect: (region: RegionInfo) => void;
}) {
  const homeCountry = countryByCode(homeCountryCode);

  return (
    <div className="space-y-5">
      {currentPopular.length ? (
        <RegionChipSection
          title={`${homeCountry?.emoji || ""} 本国热门城市`}
          regions={currentPopular}
          onSelect={onSelect}
        />
      ) : null}
      {recentRegions.length ? <RegionChipSection title="最近选择" regions={recentRegions} onSelect={onSelect} /> : null}
      <section>
        <h3 className="kx-section-title mb-2 px-0">按国家切换</h3>
        <div className="overflow-hidden rounded-kx-lg bg-kx-card ring-1 ring-kx-stroke/70">
          {availableCountries.map((country) => (
            <button
              key={country.code}
              type="button"
              onClick={() => onCountry(country)}
            className="flex w-full min-w-0 items-center gap-3 border-b border-kx-stroke/40 px-4 py-3 text-left last:border-0 hover:bg-kx-soft/70"
          >
            <span className="text-xl">{country.emoji}</span>
              <span className="min-w-0 flex-1 truncate font-semibold">{country.name}</span>
              <ChevronRight className="ml-auto h-4 w-4 text-kx-muted" />
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function CountryDrilldown({
  country,
  province,
  onProvince,
  onSelect,
}: {
  country: RegionCountry;
  province: RegionProvince | null;
  onProvince: (province: RegionProvince) => void;
  onSelect: (region: RegionInfo) => void;
}) {
  if (!country.has_provinces) {
    return <CityList country={country} onSelect={onSelect} />;
  }
  if (province) {
    return <CityList country={country} province={province} onSelect={onSelect} />;
  }
  const provinces = provincesFor(country.code);
  return (
    <div className="overflow-hidden rounded-kx-lg bg-kx-card ring-1 ring-kx-stroke/70">
      {provinces.map((item) => (
        <button
          key={item.code}
          type="button"
          onClick={() => onProvince(item)}
          className="flex w-full min-w-0 items-center gap-3 border-b border-kx-stroke/40 px-4 py-3 text-left last:border-0 hover:bg-kx-soft/70"
        >
          <span className="min-w-0 flex-1 truncate font-semibold">{item.name}</span>
          <ChevronRight className="ml-auto h-4 w-4 text-kx-muted" />
        </button>
      ))}
    </div>
  );
}

function CityList({
  country,
  province,
  onSelect,
}: {
  country: RegionCountry;
  province?: RegionProvince;
  onSelect: (region: RegionInfo) => void;
}) {
  const cities = citiesFor(country.code, province?.code);
  return (
    <div className="overflow-hidden rounded-kx-lg bg-kx-card ring-1 ring-kx-stroke/70">
      {cities.map((city) => {
        const region = resolveRegion(
          country.has_provinces ? `${country.code}.${province?.code}.${city.code}` : `${country.code}.${city.code}`,
        );
        return (
          <button
            key={city.code}
            type="button"
            onClick={() => region && onSelect(region)}
            className="flex w-full min-w-0 items-center gap-3 border-b border-kx-stroke/40 px-4 py-3 text-left last:border-0 hover:bg-kx-soft/70"
            disabled={!region}
          >
            <span className="min-w-0 flex-1 truncate font-semibold">{city.name}</span>
            <span className="ml-auto max-w-[65%] truncate text-xs font-semibold text-kx-muted">{region ? regionDisplayName(region) : ""}</span>
          </button>
        );
      })}
    </div>
  );
}

function SearchResultList({ matches, onSelect }: { matches: RegionInfo[]; onSelect: (region: RegionInfo) => void }) {
  if (!matches.length) {
    return <div className="py-12 text-center text-sm font-semibold text-kx-muted">没有匹配的地区</div>;
  }
  return (
    <div className="overflow-hidden rounded-kx-lg bg-kx-card ring-1 ring-kx-stroke/70">
      {matches.map((region) => (
        <button
          key={region.region_code}
          type="button"
          onClick={() => onSelect(region)}
          className="flex w-full min-w-0 items-center gap-3 border-b border-kx-stroke/40 px-4 py-3 text-left last:border-0 hover:bg-kx-soft/70"
        >
          <span className="text-xl">{region.country_emoji}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-bold">{region.city_name}</span>
            <span className="block truncate text-xs font-semibold text-kx-muted">{regionDisplayName(region)}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

function RegionChipSection({ title, regions, onSelect }: { title: string; regions: RegionInfo[]; onSelect: (region: RegionInfo) => void }) {
  return (
    <section>
      <h3 className="kx-section-title mb-2 px-0">{title}</h3>
      <RegionChipGrid regions={regions} onSelect={onSelect} />
    </section>
  );
}

function RegionChipGrid({ regions, onSelect }: { regions: RegionInfo[]; onSelect: (region: RegionInfo) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {regions.map((region) => (
        <button
          key={region.region_code}
          type="button"
          onClick={() => onSelect(region)}
          className={clsx(
            "inline-flex h-9 items-center gap-1.5 rounded-full border border-kx-stroke/70 bg-kx-card px-3 text-sm font-semibold",
            "transition hover:border-kx-accent/50 hover:bg-kx-accentSoft hover:text-kx-accent",
          )}
          title={regionDisplayName(region)}
        >
          <span>{region.country_emoji}</span>
          <span>{regionHeaderLabel(region).replace(`${region.country_emoji} `, "")}</span>
        </button>
      ))}
    </div>
  );
}
