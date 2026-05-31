"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, Clock3, ExternalLink, FileText, RefreshCw, Rss, ShieldCheck } from "lucide-react";
import { api, APIError, type EditorialPost, type NewsItem, type NewsSource } from "@/lib/api";
import { AppShell } from "@/components/shell/AppShell";
import { EmptyState, ErrorState, InlineLoading } from "@/components/design/States";
import { NavTabs } from "@/components/design/NavTabs";
import { compactNumber, relativeTime } from "@/lib/format";
import { useToasts } from "@/lib/store";

type Tab = "home" | "sources" | "items" | "drafts" | "published" | "logs";

const tabs: Array<{ value: Tab; label: string; href: string }> = [
  { value: "home", label: "总览", href: "/admin/japan-news-crawler" },
  { value: "sources", label: "来源", href: "/admin/japan-news-crawler/sources" },
  { value: "items", label: "内容池", href: "/admin/japan-news-crawler/items" },
  { value: "drafts", label: "草稿", href: "/admin/japan-news-crawler/drafts" },
  { value: "published", label: "已发布", href: "/admin/japan-news-crawler/published" },
  { value: "logs", label: "日志", href: "/admin/japan-news-crawler/logs" },
];

const CATEGORY_OPTIONS = [
  "local_news", "traffic_alert", "weather_alert", "earthquake_alert", "typhoon_alert",
  "policy_update", "immigration_visa", "city_event", "life_notice", "housing_notice",
  "work_study", "public_safety", "economy", "technology", "culture", "sports",
  "education", "health", "travel", "digital_life", "legal_notice", "resident_service",
  "garbage_rule", "train_delay", "commute", "disaster_prevention", "food", "weekend",
  "exhibition", "meetup", "editor_pick", "weekly_digest", "other",
] as const;

const SOURCE_TIER_OPTIONS = [
  "tier_1_official",
  "tier_2_city_official",
  "tier_3_public_media",
  "tier_4_event_lifestyle",
  "tier_5_manual_reference",
] as const;

const COPYRIGHT_POLICY_OPTIONS = [
  "metadata_only",
  "official_attribution",
  "cc_by",
  "redistribution_restricted",
  "manual_review_only",
  "unknown",
] as const;

const RISK_OPTIONS = ["low", "medium", "high"] as const;

function cityName(city?: string | null) {
  if (city === "tokyo") return "Tokyo";
  if (city === "osaka") return "Osaka";
  return "Japan-wide";
}

function itemStatusClass(status?: string) {
  if (status === "fetched") return "bg-sky-400/12 text-sky-700 dark:text-sky-300";
  if (status === "draft_created") return "bg-emerald-400/12 text-emerald-700 dark:text-emerald-300";
  if (status === "ignored" || status === "duplicate") return "bg-kx-soft text-kx-muted";
  if (status === "error") return "bg-kx-danger/10 text-kx-danger";
  return "bg-kx-soft text-kx-muted";
}

export function JapanCrawlerRouteClient({ tab }: { tab: Tab }) {
  return (
    <AppShell>
      <main className="mx-auto w-full max-w-5xl px-4 py-4">
        <header className="mb-3">
          <div className="text-xs font-bold text-kx-accent">Japan Local News Desk</div>
          <h1 className="text-2xl font-black">日本资讯爬虫</h1>
          <div className="mt-2 grid gap-2 text-xs font-semibold text-kx-muted sm:grid-cols-3">
            <span className="inline-flex items-center gap-1.5 rounded-kx-md bg-kx-card px-2.5 py-2"><Rss className="h-3.5 w-3.5 text-kx-accent" /> 采集队列</span>
            <span className="inline-flex items-center gap-1.5 rounded-kx-md bg-kx-card px-2.5 py-2"><ShieldCheck className="h-3.5 w-3.5 text-emerald-600" /> 来源校验</span>
            <span className="inline-flex items-center gap-1.5 rounded-kx-md bg-kx-card px-2.5 py-2"><FileText className="h-3.5 w-3.5 text-sky-600" /> 编辑草稿</span>
          </div>
        </header>
        <div className="kx-card mb-3 p-2">
          <NavTabs
            items={tabs.map((item) => ({ value: item.value, label: item.label }))}
            value={tab}
            onChange={(value) => {
              const next = tabs.find((item) => item.value === value);
              if (next) window.location.href = next.href;
            }}
          />
        </div>
        {tab === "home" ? <Dashboard /> : null}
        {tab === "sources" ? <Sources /> : null}
        {tab === "items" ? <Items /> : null}
        {tab === "drafts" ? <Posts status="draft" /> : null}
        {tab === "published" ? <Posts status="published" /> : null}
        {tab === "logs" ? <Logs /> : null}
      </main>
    </AppShell>
  );
}

function Dashboard() {
  const q = useQuery({ queryKey: ["japan-crawler-dashboard"], queryFn: () => api.japanNewsCrawlerDashboard() });
  if (q.isError) return <ErrorState onRetry={() => q.refetch()} />;
  if (!q.data) return <InlineLoading />;
  const cards = [
    ["今日采集", q.data.stats.today_fetched],
    ["今日新增", q.data.stats.today_new ?? 0],
    ["待建草稿", q.data.stats.pending_items ?? 0],
    ["待审核", q.data.stats.pending_drafts],
    ["已发布", q.data.stats.published],
    ["失败来源", q.data.stats.failed_sources],
    ["成功来源", q.data.stats.successful_sources ?? 0],
    ["前台可见", q.data.stats.front_visible ?? 0],
    ["自动草稿源", q.data.stats.auto_draft_sources ?? 0],
  ];
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {cards.map(([label, value]) => (
          <div key={String(label)} className="kx-card">
            <div className="text-xs text-kx-muted">{label}</div>
            <div className="mt-1 text-2xl font-black">{compactNumber(Number(value))}</div>
          </div>
        ))}
      </div>
      <section className="grid gap-3 md:grid-cols-3">
        <div className="kx-card">
          <div className="flex items-center gap-2 text-sm font-black"><Rss className="h-4 w-4 text-kx-accent" /> 采集</div>
          <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] font-semibold text-kx-muted">
            <span className="rounded-full bg-kx-soft px-2 py-1">RSS</span>
            <span className="rounded-full bg-kx-soft px-2 py-1">meta</span>
            <span className="rounded-full bg-kx-soft px-2 py-1">html_list</span>
          </div>
        </div>
        <div className="kx-card">
          <div className="flex items-center gap-2 text-sm font-black"><BadgeCheck className="h-4 w-4 text-emerald-600" /> 去重</div>
          <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] font-semibold text-kx-muted">
            <span className="rounded-full bg-kx-soft px-2 py-1">source</span>
            <span className="rounded-full bg-kx-soft px-2 py-1">city</span>
            <span className="rounded-full bg-kx-soft px-2 py-1">hash</span>
          </div>
        </div>
        <div className="kx-card">
          <div className="flex items-center gap-2 text-sm font-black"><FileText className="h-4 w-4 text-sky-600" /> 发布</div>
          <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] font-semibold text-kx-muted">
            <span className="rounded-full bg-kx-soft px-2 py-1">draft</span>
            <span className="rounded-full bg-kx-soft px-2 py-1">review</span>
            <span className="rounded-full bg-kx-soft px-2 py-1">publish</span>
          </div>
        </div>
      </section>
      <section className="grid gap-3 md:grid-cols-2">
        <div className="kx-card">
          <h2 className="mb-2 text-sm font-black">诊断提示</h2>
          <div className="space-y-1.5 text-sm text-kx-subtle">
            {(q.data.diagnostics?.top_issues || []).map((issue) => (
              <div key={issue} className="rounded-kx-md bg-kx-soft px-3 py-2">{issue}</div>
            ))}
            {!q.data.diagnostics?.top_issues?.length ? <div className="text-kx-muted">暂无明显阻塞项</div> : null}
          </div>
        </div>
        <div className="kx-card">
          <h2 className="mb-2 text-sm font-black">失败原因排行</h2>
          <div className="space-y-1.5 text-sm">
            {(q.data.diagnostics?.failure_reasons || []).map((item) => (
              <div key={item.reason} className="flex items-center justify-between gap-2 rounded-kx-md bg-kx-soft px-3 py-2">
                <span className="truncate text-kx-subtle">{item.reason}</span>
                <strong>{item.count}</strong>
              </div>
            ))}
            {!q.data.diagnostics?.failure_reasons?.length ? <div className="text-kx-muted">最近没有失败记录</div> : null}
          </div>
        </div>
      </section>
      <section className="kx-card">
        <h2 className="mb-3 text-sm font-black">最近发布</h2>
        <div className="space-y-2">
          {q.data.recent_posts.map((post) => <PostLink key={post.id} post={post} />)}
          {!q.data.recent_posts.length ? <EmptyState title="暂无发布内容" /> : null}
        </div>
      </section>
    </div>
  );
}

function Sources() {
  const queryClient = useQueryClient();
  const pushToast = useToasts((s) => s.push);
  const [draft, setDraft] = useState<Partial<NewsSource>>({
    name: "",
    source_type: "metadata",
    crawl_strategy: "meta_only",
    source_url: "",
    homepage_url: "",
    allowed_domain: "",
    country: "jp",
    city: "",
    language: "ja",
    default_category: "local_news",
    source_tier: "tier_2_city_official",
    credibility_level: "official",
    copyright_policy: "metadata_only",
    risk_level: "low",
    crawl_interval_minutes: 120,
    max_items_per_run: 30,
    request_timeout_ms: 15000,
    require_manual_review: true,
    is_active: true,
    allow_auto_draft: true,
    allow_auto_publish: false,
    content_rewrite_required: true,
  });
  const q = useQuery({ queryKey: ["japan-crawler-sources"], queryFn: () => api.japanNewsCrawlerSources({ country: "jp" }) });
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["japan-crawler-sources"] });
    queryClient.invalidateQueries({ queryKey: ["japan-crawler-dashboard"] });
  };
  const run = async (source: NewsSource) => {
    try {
      await api.japanNewsCrawlerFetchSource(source.id);
      refresh();
      pushToast({ kind: "success", message: "抓取已执行" });
    } catch (e) {
      pushToast({ kind: "error", message: (e as APIError).message });
    }
  };
  const patchSource = async (source: NewsSource, patch: Partial<NewsSource>) => {
    try {
      await api.japanNewsCrawlerUpdateSource(source.id, patch);
      refresh();
      pushToast({ kind: "success", message: "来源配置已更新" });
    } catch (e) {
      pushToast({ kind: "error", message: (e as APIError).message });
    }
  };
  const runAll = async () => {
    try {
      const res = await api.japanNewsCrawlerFetchJapanAll();
      refresh();
      pushToast({ kind: "success", message: `日本来源抓取完成：新增 ${String(res.new_count ?? 0)} 条` });
    } catch (e) {
      pushToast({ kind: "error", message: (e as APIError).message });
    }
  };
  const runScope = async (scope: "official" | "tokyo" | "osaka") => {
    try {
      const res = scope === "official"
        ? await api.japanNewsCrawlerFetchOfficial()
        : scope === "tokyo"
          ? await api.japanNewsCrawlerFetchTokyo()
          : await api.japanNewsCrawlerFetchOsaka();
      refresh();
      pushToast({ kind: "success", message: `${scope} 抓取完成：新增 ${String(res.new_count ?? 0)} 条` });
    } catch (e) {
      pushToast({ kind: "error", message: (e as APIError).message });
    }
  };
  const create = async () => {
    try {
      await api.japanNewsCrawlerCreateSource(draft);
      setDraft((d) => ({ ...d, name: "", source_key: "", source_url: "", homepage_url: "", allowed_domain: "" }));
      refresh();
      pushToast({ kind: "success", message: "来源已创建" });
    } catch (e) {
      pushToast({ kind: "error", message: (e as APIError).message });
    }
  };
  const seedPresets = async () => {
    try {
      const res = await api.japanNewsCrawlerSeedSourcePresets();
      refresh();
      pushToast({ kind: "success", message: `日本来源已更新：新增 ${res.created ?? 0}，更新 ${res.updated ?? 0}，启用 ${res.active}` });
    } catch (e) {
      pushToast({ kind: "error", message: (e as APIError).message });
    }
  };
  if (q.isError) return <ErrorState onRetry={() => q.refetch()} />;
  if (!q.data) return <InlineLoading />;
  return (
    <div className="space-y-3">
      <section className="kx-card">
        <div className="mb-2 text-sm font-black">新增日本来源</div>
        <div className="grid gap-2 md:grid-cols-4">
          <input className="kx-input h-9" placeholder="name" value={draft.name || ""} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          <select className="kx-input h-9" value={draft.source_type || "metadata"} onChange={(e) => setDraft({ ...draft, source_type: e.target.value as NewsSource["source_type"] })}>
            <option value="rss">rss</option><option value="metadata">metadata</option><option value="webpage">webpage</option><option value="html_list">html_list</option><option value="manual_reference">manual_reference</option><option value="api">api</option><option value="manual">manual</option>
          </select>
          <select className="kx-input h-9" value={draft.crawl_strategy || "meta_only"} onChange={(e) => setDraft({ ...draft, crawl_strategy: e.target.value as NewsSource["crawl_strategy"] })}>
            <option value="rss">rss</option><option value="meta_only">meta_only</option><option value="html_list">html_list</option><option value="manual">manual</option>
          </select>
          <input className="kx-input h-9" placeholder="source_url" value={draft.source_url || ""} onChange={(e) => setDraft({ ...draft, source_url: e.target.value })} />
          <input className="kx-input h-9" placeholder="homepage_url" value={draft.homepage_url || ""} onChange={(e) => setDraft({ ...draft, homepage_url: e.target.value })} />
          <input className="kx-input h-9" placeholder="allowed_domain" value={draft.allowed_domain || ""} onChange={(e) => setDraft({ ...draft, allowed_domain: e.target.value })} />
          <select className="kx-input h-9" value={draft.city || ""} onChange={(e) => setDraft({ ...draft, city: e.target.value })}>
            <option value="">Japan-wide</option><option value="tokyo">Tokyo</option><option value="osaka">Osaka</option>
          </select>
          <input className="kx-input h-9" placeholder="sub_city / ward" value={draft.sub_city || ""} onChange={(e) => setDraft({ ...draft, sub_city: e.target.value })} />
          <select className="kx-input h-9" value={draft.language || "ja"} onChange={(e) => setDraft({ ...draft, language: e.target.value })}>
            <option value="ja">ja</option><option value="zh-CN">zh-CN</option><option value="en">en</option>
          </select>
          <select className="kx-input h-9" value={draft.source_tier || "tier_2_city_official"} onChange={(e) => setDraft({ ...draft, source_tier: e.target.value as NewsSource["source_tier"] })}>
            {SOURCE_TIER_OPTIONS.map((tier) => <option key={tier} value={tier}>{tier}</option>)}
          </select>
          <select className="kx-input h-9" value={draft.credibility_level || "official"} onChange={(e) => setDraft({ ...draft, credibility_level: e.target.value as NewsSource["credibility_level"] })}>
            <option value="official">official</option><option value="media">media</option><option value="community">community</option><option value="commercial">commercial</option><option value="event_platform">event_platform</option>
          </select>
          <select className="kx-input h-9" value={draft.copyright_policy || "metadata_only"} onChange={(e) => setDraft({ ...draft, copyright_policy: e.target.value as NewsSource["copyright_policy"] })}>
            {COPYRIGHT_POLICY_OPTIONS.map((policy) => <option key={policy} value={policy}>{policy}</option>)}
          </select>
          <select className="kx-input h-9" value={draft.risk_level || "low"} onChange={(e) => setDraft({ ...draft, risk_level: e.target.value as NewsSource["risk_level"] })}>
            {RISK_OPTIONS.map((risk) => <option key={risk} value={risk}>{risk}</option>)}
          </select>
          <select className="kx-input h-9" value={draft.default_category || "local_news"} onChange={(e) => setDraft({ ...draft, default_category: e.target.value as NewsSource["default_category"] })}>
            {CATEGORY_OPTIONS.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
          </select>
          <input className="kx-input h-9" type="number" min={30} max={1440} value={draft.crawl_interval_minutes || 120} onChange={(e) => setDraft({ ...draft, crawl_interval_minutes: Number(e.target.value) || 120 })} />
          <input className="kx-input h-9" type="number" min={1} max={50} value={draft.max_items_per_run || 30} onChange={(e) => setDraft({ ...draft, max_items_per_run: Number(e.target.value) || 30 })} />
          <input className="kx-input h-9" type="number" min={1000} max={30000} value={draft.request_timeout_ms || 15000} onChange={(e) => setDraft({ ...draft, request_timeout_ms: Number(e.target.value) || 15000 })} />
          <input className="kx-input h-9" placeholder="list_selector" value={draft.list_selector || ""} onChange={(e) => setDraft({ ...draft, list_selector: e.target.value })} />
          <input className="kx-input h-9" placeholder="item_selector" value={draft.item_selector || ""} onChange={(e) => setDraft({ ...draft, item_selector: e.target.value })} />
          <input className="kx-input h-9" placeholder="title_selector" value={draft.title_selector || ""} onChange={(e) => setDraft({ ...draft, title_selector: e.target.value })} />
          <input className="kx-input h-9" placeholder="link_selector" value={draft.link_selector || ""} onChange={(e) => setDraft({ ...draft, link_selector: e.target.value })} />
          <input className="kx-input h-9" placeholder="summary_selector" value={draft.summary_selector || ""} onChange={(e) => setDraft({ ...draft, summary_selector: e.target.value })} />
          <input className="kx-input h-9" placeholder="date_selector" value={draft.date_selector || ""} onChange={(e) => setDraft({ ...draft, date_selector: e.target.value })} />
          <input className="kx-input h-9" placeholder="date_format" value={draft.date_format || ""} onChange={(e) => setDraft({ ...draft, date_format: e.target.value })} />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-4 text-sm font-semibold">
          <label className="inline-flex items-center gap-2"><input type="checkbox" checked={!!draft.is_active} onChange={(e) => setDraft({ ...draft, is_active: e.target.checked })} />启用</label>
          <label className="inline-flex items-center gap-2"><input type="checkbox" checked={!!draft.require_manual_review} onChange={(e) => setDraft({ ...draft, require_manual_review: e.target.checked })} />人工审核</label>
          <label className="inline-flex items-center gap-2"><input type="checkbox" checked={!!draft.allow_auto_draft} onChange={(e) => setDraft({ ...draft, allow_auto_draft: e.target.checked })} />自动抓取后建草稿</label>
          <label className="inline-flex items-center gap-2"><input type="checkbox" checked={!!draft.allow_auto_publish} onChange={(e) => setDraft({ ...draft, allow_auto_publish: e.target.checked })} />低风险官方自动发布</label>
          <label className="inline-flex items-center gap-2"><input type="checkbox" checked={draft.content_rewrite_required !== false} onChange={(e) => setDraft({ ...draft, content_rewrite_required: e.target.checked })} />必须编辑部重写</label>
          <button className="kx-button-primary h-9" onClick={create}>创建来源</button>
        </div>
      </section>
      <section className="kx-card p-0">
        <div className="flex items-center justify-between border-b border-kx-stroke/40 p-3">
          <div className="text-sm font-black">日本来源</div>
          <div className="flex flex-wrap gap-1.5">
            <button className="kx-button-ghost h-8" onClick={seedPresets}>初始化日本资讯源</button>
            <button className="kx-button-ghost h-8" onClick={runAll}><RefreshCw className="h-4 w-4" /> 抓取日本全部启用来源</button>
            <button className="kx-button-ghost h-8" onClick={() => runScope("official")}>抓取官方来源</button>
            <button className="kx-button-ghost h-8" onClick={() => runScope("tokyo")}>抓取东京</button>
            <button className="kx-button-ghost h-8" onClick={() => runScope("osaka")}>抓取大阪</button>
          </div>
        </div>
        <div className="divide-y divide-kx-stroke/40">
          {q.data.map((source) => (
            <div key={source.id} className="flex flex-col gap-2 p-3 md:flex-row md:items-center">
              <div className="min-w-0 flex-1">
                <div className="font-bold">{source.name}</div>
                <div className="mt-1 flex flex-wrap gap-1.5 text-[11px] font-bold">
                  <span className="rounded-full bg-kx-accentSoft px-2 py-1 text-kx-accent">{source.source_tier}</span>
                  <span className="rounded-full bg-kx-soft px-2 py-1 text-kx-muted">{source.copyright_policy}</span>
                  <span className="rounded-full bg-kx-soft px-2 py-1 text-kx-muted">{source.risk_level || "low"}</span>
                  {source.allow_auto_draft ? <span className="rounded-full bg-emerald-400/12 px-2 py-1 text-emerald-700 dark:text-emerald-300">auto draft</span> : null}
                  {source.allow_auto_publish ? <span className="rounded-full bg-amber-400/12 px-2 py-1 text-amber-700 dark:text-amber-300">auto publish</span> : null}
                </div>
                <div className="mt-1 text-xs text-kx-muted">{source.source_type} / {source.crawl_strategy} · {source.city || "Japan-wide"}{source.sub_city ? ` / ${source.sub_city}` : ""} · {source.default_category}</div>
                <div className="mt-1 truncate text-xs text-kx-muted">{source.source_url || source.homepage_url || "manual"}</div>
                <div className="mt-1 text-xs text-kx-muted">fetched {source.last_fetched_count ?? 0} · new {source.last_new_count ?? 0} · duplicate {source.last_duplicate_count ?? 0} · robots {source.last_robots_status || "-"} · http {source.last_http_status ?? "-"} · parser {source.last_parser_status || "-"}</div>
                {source.last_error ? <div className="mt-1 text-xs text-kx-danger">{source.last_error}</div> : null}
              </div>
              <button className="kx-button-ghost h-8" onClick={() => api.japanNewsCrawlerToggleSource(source.id).then(refresh)}>{source.is_active ? "停用" : "启用"}</button>
              <button className="kx-button-ghost h-8" onClick={() => patchSource(source, { allow_auto_draft: !source.allow_auto_draft })}>{source.allow_auto_draft ? "关闭草稿" : "自动草稿"}</button>
              <button className="kx-button-ghost h-8" onClick={() => patchSource(source, { allow_auto_publish: !source.allow_auto_publish })}>{source.allow_auto_publish ? "关闭发布" : "自动发布"}</button>
              <button className="kx-button-ghost h-8" onClick={() => run(source)}><Rss className="h-4 w-4" /> 抓取</button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Items() {
  const pushToast = useToasts((s) => s.push);
  const [status, setStatus] = useState("fetched");
  const [keyword, setKeyword] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [city, setCity] = useState("");
  const [language, setLanguage] = useState("");
  const [category, setCategory] = useState("");
  const [sourceTier, setSourceTier] = useState("");
  const [riskLevel, setRiskLevel] = useState("");
  const [minRelevance, setMinRelevance] = useState("60");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const q = useQuery({
    queryKey: ["japan-crawler-items", status, keyword, sourceId, city, language, category, sourceTier, riskLevel, minRelevance],
    queryFn: () => api.japanNewsCrawlerItems({ status, keyword, source_id: sourceId, country: "jp", city, language, category, source_tier: sourceTier, risk_level: riskLevel, minRelevance: Number(minRelevance) || undefined, limit: 80 }),
  });
  const createDraft = async (item: NewsItem) => {
    try {
      await api.japanNewsCrawlerCreateDraftFromItem(item.id);
      q.refetch();
      pushToast({ kind: "success", message: "已创建草稿" });
    } catch (e) {
      pushToast({ kind: "error", message: (e as APIError).message });
    }
  };
  const toggle = (id: string) => setSelectedIds((ids) => ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);
  const bulkCreate = async () => {
    try {
      const res = await api.japanNewsCrawlerCreateDraftsFromItems({ itemIds: selectedIds, targetLanguage: "zh-CN", createMode: "editor_template" });
      setSelectedIds([]);
      q.refetch();
      pushToast({ kind: "success", message: `已创建 ${res.created} 条草稿` });
    } catch (e) {
      pushToast({ kind: "error", message: (e as APIError).message });
    }
  };
  const bulkStatus = async (next: "ignored" | "duplicate") => {
    await Promise.all(selectedIds.map((id) => api.japanNewsCrawlerUpdateItemStatus(id, next).catch(() => null)));
    setSelectedIds([]);
    q.refetch();
  };
  const bulkDelete = async () => {
    await Promise.all(selectedIds.map((id) => api.japanNewsCrawlerDeleteItem(id).catch(() => null)));
    setSelectedIds([]);
    q.refetch();
  };
  if (q.isError) return <ErrorState onRetry={() => q.refetch()} />;
  if (!q.data) return <InlineLoading />;
  return (
    <section className="kx-card p-0">
      <div className="space-y-2 border-b border-kx-stroke/40 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-sm font-black">内容池</div>
            <div className="text-xs text-kx-muted">{selectedIds.length ? `已选择 ${selectedIds.length} 条` : "待处理抓取结果"}</div>
          </div>
          <button className="kx-button-primary h-9" disabled={!selectedIds.length} onClick={bulkCreate}>生成编辑部草稿</button>
        </div>
        <div className="flex flex-wrap gap-2">
          <select className="kx-input h-9 w-36" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="fetched">fetched</option><option value="draft_created">draft_created</option><option value="ignored">ignored</option><option value="duplicate">duplicate</option><option value="error">error</option><option value="deleted">deleted</option>
          </select>
          <input className="kx-input h-9 w-44" placeholder="keyword" value={keyword} onChange={(e) => setKeyword(e.target.value)} />
          <input className="kx-input h-9 w-44" placeholder="source_id" value={sourceId} onChange={(e) => setSourceId(e.target.value)} />
          <select className="kx-input h-9 w-36" value={city} onChange={(e) => setCity(e.target.value)}>
            <option value="">全部城市</option><option value="tokyo">Tokyo</option><option value="osaka">Osaka</option>
          </select>
          <select className="kx-input h-9 w-36" value={language} onChange={(e) => setLanguage(e.target.value)}>
            <option value="">全部语言</option><option value="ja">ja</option><option value="zh-CN">zh-CN</option><option value="en">en</option>
          </select>
          <select className="kx-input h-9 w-44" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">全部分类</option>
            {CATEGORY_OPTIONS.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
          </select>
          <select className="kx-input h-9 w-48" value={sourceTier} onChange={(e) => setSourceTier(e.target.value)}>
            <option value="">全部 tier</option>
            {SOURCE_TIER_OPTIONS.map((tier) => <option key={tier} value={tier}>{tier}</option>)}
          </select>
          <select className="kx-input h-9 w-36" value={riskLevel} onChange={(e) => setRiskLevel(e.target.value)}>
            <option value="">全部风险</option>
            {RISK_OPTIONS.map((risk) => <option key={risk} value={risk}>{risk}</option>)}
          </select>
          <select className="kx-input h-9 w-40" value={minRelevance} onChange={(e) => setMinRelevance(e.target.value)}>
            <option value="0">全部相关性</option>
            <option value="40">40+</option>
            <option value="60">60+</option>
            <option value="80">80+</option>
          </select>
          <button className="kx-button-ghost h-9" disabled={!selectedIds.length} onClick={() => bulkStatus("ignored")}>忽略</button>
          <button className="kx-button-ghost h-9" disabled={!selectedIds.length} onClick={() => bulkStatus("duplicate")}>标记重复</button>
          <button className="kx-button-ghost h-9 text-kx-danger" disabled={!selectedIds.length} onClick={bulkDelete}>删除</button>
        </div>
      </div>
      <div className="divide-y divide-kx-stroke/40">
        {q.data.items.map((item) => (
          <div key={item.id} className="flex flex-col gap-2 p-3 md:flex-row md:items-start">
            <input className="mt-1 h-4 w-4" type="checkbox" checked={selectedIds.includes(item.id)} onChange={() => toggle(item.id)} aria-label="选择内容" />
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex flex-wrap items-center gap-1.5">
                <span className={`inline-flex h-6 items-center rounded-full px-2 text-[11px] font-bold ${itemStatusClass(item.status)}`}>
                  {item.status}
                </span>
                <span className="inline-flex h-6 items-center gap-1 rounded-full bg-kx-soft px-2 text-[11px] font-semibold text-kx-muted">
                  <Clock3 className="h-3 w-3" />
                  {item.published_at ? relativeTime(item.published_at) : item.fetched_at ? relativeTime(item.fetched_at) : "no time"}
                </span>
              </div>
              <div className="line-clamp-2 font-bold leading-snug">{item.original_title}</div>
              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-kx-muted">
                <span>{item.source_name}</span>
                <span>·</span>
                <span>{cityName(item.city)}</span>
                <span>·</span>
                <span>{item.original_language}</span>
                <span>·</span>
                <span>{item.category}</span>
                <span>·</span>
                <span>{item.source_tier || "tier"}</span>
                <span>·</span>
                <span>相关 {item.relevance_score ?? 0}</span>
                <span>·</span>
                <span>质量 {item.quality_score ?? 0}</span>
              </div>
              {item.relevance_reason ? <div className="mt-1 text-xs text-kx-muted">相关性原因：{item.relevance_reason}</div> : null}
              {item.original_summary ? <div className="mt-1 line-clamp-2 text-sm text-kx-subtle">{item.original_summary}</div> : null}
            </div>
            <div className="flex shrink-0 flex-wrap gap-1.5 md:justify-end">
              {item.original_url ? <a className="kx-button-ghost h-8" href={item.original_url} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" /> 原文</a> : null}
              {item.status === "draft_created" ? (
                <span className="inline-flex h-8 items-center rounded-kx-sm bg-emerald-400/12 px-2 text-xs font-bold text-emerald-700 dark:text-emerald-300">已建草稿</span>
              ) : (
                <button className="kx-button-primary h-8" onClick={() => createDraft(item)}>生成草稿</button>
              )}
            </div>
          </div>
        ))}
        {!q.data.items.length ? <EmptyState title="暂无待处理内容" /> : null}
      </div>
    </section>
  );
}

function Posts({ status }: { status: "draft" | "published" }) {
  const pushToast = useToasts((s) => s.push);
  const q = useQuery({
    queryKey: ["japan-crawler-posts", status],
    queryFn: () => api.adminEditorialPosts({ status, country: "jp", limit: 80 }),
  });
  const bulkPublish = async () => {
    try {
      const res = await api.adminEditorialBulkPublish({ postIds: (q.data?.items || []).map((item) => item.id) });
      q.refetch();
      pushToast({ kind: "success", message: `已发布 ${res.published} 条` });
    } catch (e) {
      pushToast({ kind: "error", message: (e as APIError).message });
    }
  };
  if (q.isError) return <ErrorState onRetry={() => q.refetch()} />;
  if (!q.data) return <InlineLoading />;
  return (
    <section className="kx-card">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-black">{status === "published" ? "已发布" : "草稿"}</h2>
        {status === "draft" ? <button className="kx-button-ghost h-8" onClick={bulkPublish}>发布已审核官方来源草稿</button> : null}
      </div>
      <div className="space-y-2">
        {q.data.items.map((post) => <PostLink key={post.id} post={post} />)}
        {!q.data.items.length ? <EmptyState title="暂无内容" /> : null}
      </div>
    </section>
  );
}

function Logs() {
  const q = useQuery({ queryKey: ["japan-crawler-logs"], queryFn: () => api.japanNewsCrawlerLogs(120) });
  if (q.isError) return <ErrorState onRetry={() => q.refetch()} />;
  if (!q.data) return <InlineLoading />;
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <section className="kx-card">
        <h2 className="mb-3 text-sm font-black">采集日志</h2>
        <div className="space-y-2">
          {q.data.fetch_logs.map((log) => (
            <div key={String(log.id)} className="rounded-kx-md bg-kx-soft px-3 py-2 text-sm">
              <div className="font-bold">{String(log.source_name || log.source_id || "source")} · {String(log.status)}</div>
              <div className="text-xs text-kx-muted">new {String(log.new_count ?? 0)} · duplicate {String(log.duplicate_count ?? 0)} · http {String(log.http_status ?? "-")} · parser {String(log.parser_status || "-")} · {String(log.created_at || "")}</div>
              {log.error_message ? <div className="mt-1 text-xs text-kx-danger">{String(log.error_message)}</div> : null}
            </div>
          ))}
        </div>
      </section>
      <section className="kx-card">
        <h2 className="mb-3 text-sm font-black">编辑部动作</h2>
        <div className="space-y-2">
          {q.data.action_logs.map((log) => (
            <div key={String(log.id)} className="rounded-kx-md bg-kx-soft px-3 py-2 text-sm">
              <div className="font-bold">{String(log.action || "action")} · {String(log.target_type || "")}</div>
              <div className="text-xs text-kx-muted">{String(log.created_at || "")}</div>
            </div>
          ))}
          {!q.data.action_logs.length ? <div className="text-sm text-kx-muted">暂无动作日志</div> : null}
        </div>
      </section>
    </div>
  );
}

function PostLink({ post }: { post: EditorialPost }) {
  return (
    <Link href={`/news/${post.id}`} className="block rounded-kx-md bg-kx-soft px-3 py-2 hover:bg-kx-stroke/30">
      <div className="line-clamp-1 text-sm font-bold">{post.title}</div>
      <div className="mt-0.5 text-xs text-kx-muted">{post.author_display_name} · {post.city || "Japan-wide"} · 质量 {post.quality_score ?? 0} · 相关 {post.relevance_score ?? 0} · {post.published_at ? relativeTime(post.published_at) : post.status}</div>
    </Link>
  );
}
