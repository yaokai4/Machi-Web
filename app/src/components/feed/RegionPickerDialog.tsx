"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ChevronRight, Search, X } from "lucide-react";
import {
  REGION_COUNTRIES,
  JP_METRO_CIRCLES,
  regionsForMetroCircle,
  citiesFor,
  cityDisplayName,
  countryDisplayName,
  provincesFor,
  provinceDisplayName,
  regionDisplayName,
  resolveRegion,
  searchRegions,
  type RegionCountry,
  type RegionInfo,
  type RegionProvince,
} from "@/lib/regions";
import { useI18n } from "@/lib/i18n";

interface RegionPickerDialogProps {
  open: boolean;
  onClose: () => void;
  onSelect: (region: RegionInfo) => void;
  initialCountry?: string;
  allowsAnyCountry?: boolean;
}

export function RegionPickerDialog({
  open,
  onClose,
  onSelect,
  initialCountry,
  allowsAnyCountry = true,
}: RegionPickerDialogProps) {
  const [query, setQuery] = useState("");
  const [country, setCountry] = useState<RegionCountry | null>(null);
  const [province, setProvince] = useState<RegionProvince | null>(null);
  const [circle, setCircle] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const { t, locale } = useI18n();
  const allowedCountry = allowsAnyCountry ? undefined : initialCountry?.toLowerCase();

  const availableCountries = useMemo(
    () =>
      allowedCountry
        ? REGION_COUNTRIES.filter((item) => item.code === allowedCountry)
        : REGION_COUNTRIES,
    [allowedCountry],
  );
  const lockedCountry = allowedCountry ? (availableCountries[0] ?? null) : null;
  const matches = useMemo(() => {
    return searchRegions(query, allowedCountry);
  }, [query, allowedCountry]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setCountry(null);
    setProvince(null);
    setCircle(null);
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

  const isJapan = country?.code === "jp";
  const activeCircle = circle ? JP_METRO_CIRCLES.find((item) => item.code === circle) : null;

  const goBack = () => {
    if (circle) {
      setCircle(null);
      return;
    }
    if (province) {
      setProvince(null);
      return;
    }
    if (country && !allowedCountry) setCountry(null);
  };

  const title = activeCircle
    ? activeCircle.name
    : province
      ? provinceDisplayName(country?.code, province.code, province.name, locale)
      : country
        ? countryDisplayName(country, locale)
        : lockedCountry
          ? countryDisplayName(lockedCountry, locale)
          : t("region_picker_title");
  const canGoBack = Boolean(circle || province || (country && !allowedCountry));

  return createPortal(
    <div
      className="fixed inset-0 z-[1000] flex items-end justify-center bg-slate-950/45 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onMouseDown={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={t("region_picker_title")}
    >
      <div
        className="flex max-h-[88dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-[28px] bg-kx-bg shadow-2xl ring-1 ring-kx-stroke sm:rounded-[28px]"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="kx-glass-bar flex items-center gap-2 px-4 py-3">
          {canGoBack ? (
            <button
              type="button"
              onClick={goBack}
              className="grid h-9 w-9 place-items-center rounded-full bg-kx-soft text-kx-text"
              aria-label={t("region_back")}
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          ) : null}
          <h2 className="min-w-0 flex-1 truncate text-base font-black">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-full bg-kx-soft text-kx-muted hover:text-kx-text"
            aria-label={t("region_close")}
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
              placeholder={t("region_search_placeholder")}
              className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none placeholder:text-kx-muted"
            />
            {query ? (
              <button type="button" onClick={() => setQuery("")} className="text-kx-muted" aria-label={t("action_cancel")}>
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </label>

          {query.trim() ? (
            <SearchResultList matches={matches} onSelect={deliver} noMatchesLabel={t("region_no_matches")} locale={locale} />
          ) : (isJapan || lockedCountry?.code === "jp") ? (
            // 日本：都市圈 → 城市（关东圈/关西圈/名古屋…），避免一长串都道府县。
            <JapanCircleDrilldown circle={circle} onCircle={setCircle} onSelect={deliver} locale={locale} />
          ) : country ? (
            <CountryDrilldown country={country} province={province} onProvince={setProvince} onSelect={deliver} locale={locale} />
          ) : lockedCountry ? (
            <CountryDrilldown country={lockedCountry} province={province} onProvince={setProvince} onSelect={deliver} locale={locale} />
          ) : (
            // 落地页只展示国家列表；选定国家后再下钻，不再重复堆叠「本国城市」。
            <RegionPickerLanding
              availableCountries={availableCountries}
              onCountry={setCountry}
              showCountryList={!allowedCountry}
              labels={{ switchCountry: t("region_switch_country") }}
              locale={locale}
            />
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function RegionPickerLanding({
  availableCountries,
  onCountry,
  showCountryList,
  labels,
  locale,
}: {
  availableCountries: RegionCountry[];
  onCountry: (country: RegionCountry) => void;
  showCountryList: boolean;
  labels: { switchCountry: string };
  locale: string;
}) {
  if (!showCountryList) return null;
  return (
    <section>
      <h3 className="kx-section-title mb-2 px-0">{labels.switchCountry}</h3>
      <div className="overflow-hidden rounded-kx-lg bg-kx-card ring-1 ring-kx-stroke/70">
        {availableCountries.map((country) => (
          <button
            key={country.code}
            type="button"
            onClick={() => onCountry(country)}
            className="flex w-full items-center gap-3 border-b border-kx-stroke/40 px-4 py-3 text-left last:border-0 hover:bg-kx-soft/70"
          >
            <span className="text-xl">{country.emoji}</span>
            <span className="font-semibold">{countryDisplayName(country, locale)}</span>
            <ChevronRight className="ml-auto h-4 w-4 text-kx-muted" />
          </button>
        ))}
      </div>
    </section>
  );
}

/// Japan picker: metro circles first (关东圈/关西圈/名古屋…), then the cities
/// inside the chosen circle — far easier to locate than a flat 都道府县 list.
function JapanCircleDrilldown({
  circle,
  onCircle,
  onSelect,
  locale,
}: {
  circle: string | null;
  onCircle: (code: string) => void;
  onSelect: (region: RegionInfo) => void;
  locale: string;
}) {
  if (circle) {
    const regions = regionsForMetroCircle(circle);
    return (
      <div className="overflow-hidden rounded-kx-lg bg-kx-card ring-1 ring-kx-stroke/70">
        {regions.map((region) => (
          <button
            key={region.region_code}
            type="button"
            onClick={() => onSelect(region)}
            className="flex w-full items-center gap-3 border-b border-kx-stroke/40 px-4 py-3 text-left last:border-0 hover:bg-kx-soft/70"
          >
            <span className="font-semibold">{cityDisplayName(region.country_code, region.province_code, region.city_code, region.city_name, locale)}</span>
            <span className="ml-auto text-xs font-semibold text-kx-muted">{provinceDisplayName(region.country_code, region.province_code, region.province_name, locale)}</span>
          </button>
        ))}
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-kx-lg bg-kx-card ring-1 ring-kx-stroke/70">
      {JP_METRO_CIRCLES.map((item) => {
        const count = regionsForMetroCircle(item.code).length;
        return (
          <button
            key={item.code}
            type="button"
            onClick={() => onCircle(item.code)}
            className="flex w-full items-center gap-3 border-b border-kx-stroke/40 px-4 py-3 text-left last:border-0 hover:bg-kx-soft/70"
          >
            <span className="font-semibold">{item.name}</span>
            <span className="ml-auto text-xs font-semibold text-kx-muted">{count} 城</span>
            <ChevronRight className="h-4 w-4 text-kx-muted" />
          </button>
        );
      })}
    </div>
  );
}

function CountryDrilldown({
  country,
  province,
  onProvince,
  onSelect,
  locale,
}: {
  country: RegionCountry;
  province: RegionProvince | null;
  onProvince: (province: RegionProvince) => void;
  onSelect: (region: RegionInfo) => void;
  locale: string;
}) {
  if (!country.has_provinces) {
    return <CityList country={country} onSelect={onSelect} locale={locale} />;
  }
  if (province) {
    return <CityList country={country} province={province} onSelect={onSelect} locale={locale} />;
  }
  const provinces = provincesFor(country.code);
  return (
    <div className="overflow-hidden rounded-kx-lg bg-kx-card ring-1 ring-kx-stroke/70">
      {provinces.map((item) => (
        <button
          key={item.code}
          type="button"
          onClick={() => onProvince(item)}
          className="flex w-full items-center gap-3 border-b border-kx-stroke/40 px-4 py-3 text-left last:border-0 hover:bg-kx-soft/70"
        >
          <span className="font-semibold">{provinceDisplayName(country.code, item.code, item.name, locale)}</span>
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
  locale,
}: {
  country: RegionCountry;
  province?: RegionProvince;
  onSelect: (region: RegionInfo) => void;
  locale: string;
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
            className="flex w-full items-center gap-3 border-b border-kx-stroke/40 px-4 py-3 text-left last:border-0 hover:bg-kx-soft/70"
            disabled={!region}
          >
            <span className="font-semibold">{cityDisplayName(country.code, province?.code, city.code, city.name, locale)}</span>
            <span className="ml-auto text-xs font-semibold text-kx-muted">{region ? regionDisplayName(region, locale) : ""}</span>
          </button>
        );
      })}
    </div>
  );
}

function SearchResultList({
  matches,
  onSelect,
  noMatchesLabel,
  locale,
}: {
  matches: RegionInfo[];
  onSelect: (region: RegionInfo) => void;
  noMatchesLabel: string;
  locale: string;
}) {
  if (!matches.length) {
    return <div className="py-12 text-center text-sm font-semibold text-kx-muted">{noMatchesLabel}</div>;
  }
  return (
    <div className="overflow-hidden rounded-kx-lg bg-kx-card ring-1 ring-kx-stroke/70">
      {matches.map((region) => (
        <button
          key={region.region_code}
          type="button"
          onClick={() => onSelect(region)}
          className="flex w-full items-center gap-3 border-b border-kx-stroke/40 px-4 py-3 text-left last:border-0 hover:bg-kx-soft/70"
        >
          <span className="text-xl">{region.country_emoji}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-bold">{cityDisplayName(region.country_code, region.province_code, region.city_code, region.city_name, locale)}</span>
            <span className="block truncate text-xs font-semibold text-kx-muted">{regionDisplayName(region, locale)}</span>
          </span>
        </button>
      ))}
    </div>
  );
}
