"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Globe, Save } from "lucide-react";
import { api, APIError } from "@/lib/api";
import { ErrorState, InlineLoading } from "@/components/design/States";
import { useToasts } from "@/lib/store";
import { marketingCopy, type MarketingLocale } from "@/data/machi-home";
import { marketingPageLabels, marketingPages, type MarketingPageId } from "@/data/marketing-pages";
import { flattenMarketingCopyStrings, scopeMarketingCopyOverrides } from "@/lib/marketingCopyOverrides";

type SitePageKey = MarketingPageId | "home";

const PAGE_OPTIONS: Array<{ value: SitePageKey; label: string }> = [
  { value: "home", label: "首页" },
  ...(Object.entries(marketingPageLabels) as Array<[MarketingPageId, string]>).map(([value, label]) => ({ value, label })),
];

const LOCALES: Array<{ value: MarketingLocale; label: string }> = [
  { value: "zh", label: "中文" },
  { value: "en", label: "English" },
  { value: "ja", label: "日本語" },
] as const;

export function MasterCopyEditorCard() {
  const queryClient = useQueryClient();
  const pushToast = useToasts((s) => s.push);
  const [pageKey, setPageKey] = useState<SitePageKey>("home");
  const [locale, setLocale] = useState<MarketingLocale>("zh");
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const overridesQuery = useQuery({
    queryKey: ["admin-marketing-copy-overrides", locale],
    queryFn: () => api.adminMarketingCopyOverrides(locale),
  });
  const prefix = pageKey === "home" ? "home." : `pages.${pageKey}.`;
  const defaults = useMemo(() => {
    const source = pageKey === "home"
      ? marketingCopy[locale]
      : marketingPages[pageKey][locale] ?? marketingPages[pageKey].zh;
    return flattenMarketingCopyStrings(source);
  }, [locale, pageKey]);
  const scopedOverrides = useMemo(
    () => scopeMarketingCopyOverrides(overridesQuery.data?.overrides, prefix),
    [overridesQuery.data?.overrides, prefix],
  );
  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return Object.entries(defaults)
      .filter(([path, value]) => {
        if (!needle) return true;
        return path.toLowerCase().includes(needle) || value.toLowerCase().includes(needle) || (draft[path] || "").toLowerCase().includes(needle);
      })
      .sort(([a], [b]) => a.localeCompare(b, "en"));
  }, [defaults, draft, search]);

  // The draft must be rebuilt when the admin intentionally switches page/locale,
  // and once the server overrides for that selection first arrive — but NEVER on
  // a background refetch. refetchOnReconnect is on (queryClient default), so a
  // wifi blip mid-edit would otherwise swap overridesQuery.data's reference and
  // silently overwrite dozens of unsaved 中/日/英 edits with the old server copy.
  // `hydratedRef` records the selection whose overrides are already applied, so a
  // reconnect refetch of that same selection is ignored.
  const signature = `${pageKey}|${locale}`;
  const hydratedRef = useRef<string>("");
  useEffect(() => {
    const overridesReady = !overridesQuery.isLoading;
    if (hydratedRef.current === signature && overridesReady) return;
    const next: Record<string, string> = {};
    for (const [path, value] of Object.entries(defaults)) {
      next[path] = scopedOverrides[path] ?? value;
    }
    setDraft(next);
    if (overridesReady) hydratedRef.current = signature;
  }, [signature, defaults, scopedOverrides, overridesQuery.isLoading]);

  const save = async () => {
    setBusy(true);
    try {
      const values: Record<string, string> = {};
      for (const [path, defaultValue] of Object.entries(defaults)) {
        const current = (draft[path] ?? "").trim();
        values[`${prefix}${path}`] = current === defaultValue.trim() ? "" : current;
      }
      await api.adminUpdateMarketingCopyOverrides(locale, values);
      await queryClient.invalidateQueries({ queryKey: ["admin-marketing-copy-overrides", locale] });
      await queryClient.invalidateQueries({ queryKey: ["marketing-copy-overrides", locale] });
      pushToast({ kind: "success", message: "官网主文案已保存，前台会读取最新覆盖内容" });
    } catch (e) {
      pushToast({ kind: "error", message: (e as APIError).message });
    } finally {
      setBusy(false);
    }
  };

  const resetVisible = () => {
    setDraft((prev) => {
      const next = { ...prev };
      for (const [path, value] of rows) next[path] = value;
      return next;
    });
    pushToast({ kind: "success", message: "已把当前筛选结果恢复为代码默认文案，保存后生效" });
  };

  if (overridesQuery.isError) return <ErrorState title="官网主文案加载失败" onRetry={() => overridesQuery.refetch()} />;

  return (
    <section className="kx-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="inline-flex items-center gap-2 text-base font-bold"><Globe className="h-4 w-4 text-kx-accent" />官网文案编辑</h2>
          <p className="mt-1 text-xs text-kx-muted">读取代码里的中 / 日 / 英官网文案，按页面和字段直接修改。保存的是覆盖值，清空覆盖即可回到默认文案。</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="kx-button-ghost h-9 px-3 text-xs" onClick={resetVisible}>恢复当前筛选默认</button>
          <button type="button" className="kx-button-primary h-9 px-3 text-xs" onClick={save} disabled={busy || overridesQuery.isLoading}>
            <Save className="h-3.5 w-3.5" /> {busy ? "保存中..." : "保存主文案"}
          </button>
        </div>
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-[minmax(0,1fr)_11rem_11rem]">
        <input className="kx-input h-10" placeholder="搜索字段名或当前文案..." value={search} onChange={(event) => setSearch(event.target.value)} />
        <select className="kx-input h-10" value={pageKey} onChange={(event) => setPageKey(event.target.value as SitePageKey)}>
          {PAGE_OPTIONS.map((page) => <option key={page.value} value={page.value}>{page.label}</option>)}
        </select>
        <select className="kx-input h-10" value={locale} onChange={(event) => setLocale(event.target.value as MarketingLocale)}>
          {LOCALES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
      </div>

      {overridesQuery.isLoading ? <InlineLoading /> : null}
      <div className="mt-3 max-h-[720px] space-y-2 overflow-y-auto pr-1">
        {rows.map(([path, defaultValue]) => {
          const value = draft[path] ?? defaultValue;
          const isOverridden = scopedOverrides[path] !== undefined && value.trim() !== defaultValue.trim();
          const isLong = value.length > 72 || defaultValue.length > 72 || value.includes("\n") || defaultValue.includes("\n");
          return (
            <div key={path} className="rounded-kx-md border border-kx-stroke/60 bg-kx-soft/30 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-black text-kx-text">{copyFieldLabel(path)}</div>
                  <div className="mt-0.5 font-mono text-[11px] text-kx-muted">{prefix}{path}</div>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-black ${isOverridden ? "bg-kx-accentSoft text-kx-accent" : "bg-kx-card text-kx-muted"}`}>
                  {isOverridden ? "已覆盖" : "默认"}
                </span>
              </div>
              {isLong ? (
                <textarea
                  className="kx-textarea mt-2 min-h-24"
                  value={value}
                  onChange={(event) => setDraft((prev) => ({ ...prev, [path]: event.target.value }))}
                />
              ) : (
                <input
                  className="kx-input mt-2 h-10"
                  value={value}
                  onChange={(event) => setDraft((prev) => ({ ...prev, [path]: event.target.value }))}
                />
              )}
            </div>
          );
        })}
        {!rows.length ? <div className="rounded-kx-md bg-kx-soft p-6 text-center text-sm font-semibold text-kx-muted">没有匹配的文案字段。</div> : null}
      </div>
    </section>
  );
}

function copyFieldLabel(path: string) {
  return path
    .split(".")
    .map((part) => (/^\d+$/.test(part) ? `#${Number(part) + 1}` : part.replace(/([A-Z])/g, " $1")))
    .join(" / ");
}
