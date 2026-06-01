"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, RefreshCw, Rss } from "lucide-react";
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
  "education", "health", "travel", "editor_pick", "weekly_digest", "other",
] as const;

export function JapanCrawlerRouteClient({ tab }: { tab: Tab }) {
  return (
    <AppShell>
      <main className="mx-auto w-full max-w-5xl px-4 py-4">
        <header className="mb-3">
          <div className="text-xs font-bold text-kx-accent">Japan Local News Desk</div>
          <h1 className="text-2xl font-black">日本资讯爬虫</h1>
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
    source_type: "webpage",
    crawl_strategy: "meta_only",
    source_url: "",
    homepage_url: "",
    allowed_domain: "",
    country: "jp",
    city: "",
    language: "ja",
    default_category: "local_news",
    credibility_level: "official",
    crawl_interval_minutes: 120,
    max_items_per_run: 30,
    request_timeout_ms: 15000,
    require_manual_review: true,
    is_active: true,
    auto_create_draft: false,
    official_auto_publish: false,
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
  const runAll = async () => {
    try {
      const res = await api.japanNewsCrawlerFetchJapanAll();
      refresh();
      pushToast({ kind: "success", message: `日本来源抓取完成：新增 ${String(res.new_count ?? 0)} 条` });
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
      pushToast({ kind: "success", message: `已初始化 ${res.total} 个日本来源，启用 ${res.active} 个` });
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
          <select className="kx-input h-9" value={draft.source_type || "webpage"} onChange={(e) => setDraft({ ...draft, source_type: e.target.value as NewsSource["source_type"] })}>
            <option value="rss">rss</option><option value="webpage">webpage</option><option value="html_list">html_list</option><option value="manual">manual</option>
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
          <select className="kx-input h-9" value={draft.language || "ja"} onChange={(e) => setDraft({ ...draft, language: e.target.value })}>
            <option value="ja">ja</option><option value="zh-CN">zh-CN</option><option value="en">en</option>
          </select>
          <select className="kx-input h-9" value={draft.default_category || "local_news"} onChange={(e) => setDraft({ ...draft, default_category: e.target.value as NewsSource["default_category"] })}>
            {CATEGORY_OPTIONS.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
          </select>
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
          <label className="inline-flex items-center gap-2"><input type="checkbox" checked={!!draft.auto_create_draft} onChange={(e) => setDraft({ ...draft, auto_create_draft: e.target.checked })} />自动建草稿</label>
          <label className="inline-flex items-center gap-2"><input type="checkbox" checked={!!draft.official_auto_publish} onChange={(e) => setDraft({ ...draft, official_auto_publish: e.target.checked })} />官方自动发布</label>
          <button className="kx-button-primary h-9" onClick={create}>创建来源</button>
        </div>
      </section>
      <section className="kx-card p-0">
        <div className="flex items-center justify-between border-b border-kx-stroke/40 p-3">
          <div className="text-sm font-black">日本来源</div>
          <div className="flex flex-wrap gap-1.5">
            <button className="kx-button-ghost h-8" onClick={seedPresets}>初始化日本资讯源</button>
            <button className="kx-button-ghost h-8" onClick={runAll}><RefreshCw className="h-4 w-4" /> 抓取日本全部启用来源</button>
          </div>
        </div>
        <div className="divide-y divide-kx-stroke/40">
          {q.data.map((source) => (
            <div key={source.id} className="flex flex-col gap-2 p-3 md:flex-row md:items-center">
              <div className="min-w-0 flex-1">
                <div className="font-bold">{source.name}</div>
                <div className="text-xs text-kx-muted">{source.source_type} / {source.crawl_strategy} · {source.city || "Japan-wide"} · {source.default_category}</div>
                <div className="mt-1 truncate text-xs text-kx-muted">{source.source_url || source.homepage_url || "manual"}</div>
                <div className="mt-1 text-xs text-kx-muted">fetched {source.last_fetched_count ?? 0} · new {source.last_new_count ?? 0} · duplicate {source.last_duplicate_count ?? 0} · robots {source.last_robots_status || "-"} · http {source.last_http_status ?? "-"} · parser {source.last_parser_status || "-"}</div>
                {source.last_error ? <div className="mt-1 text-xs text-kx-danger">{source.last_error}</div> : null}
              </div>
              <button className="kx-button-ghost h-8" onClick={() => api.japanNewsCrawlerToggleSource(source.id).then(refresh)}>{source.is_active ? "停用" : "启用"}</button>
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
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const q = useQuery({
    queryKey: ["japan-crawler-items", status, keyword, sourceId, city, language, category],
    queryFn: () => api.japanNewsCrawlerItems({ status, keyword, source_id: sourceId, country: "jp", city, language, category, limit: 80 }),
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
        <div className="text-sm font-black">内容池</div>
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
          <button className="kx-button-primary h-9" disabled={!selectedIds.length} onClick={bulkCreate}>将选中内容创建为编辑部草稿</button>
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
              <div className="line-clamp-2 font-bold">{item.original_title}</div>
              <div className="mt-1 text-xs text-kx-muted">{item.source_name} · {item.city || "Japan-wide"} · {item.category}</div>
              {item.original_summary ? <div className="mt-1 line-clamp-2 text-sm text-kx-subtle">{item.original_summary}</div> : null}
            </div>
            {item.original_url ? <a className="kx-button-ghost h-8" href={item.original_url} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" /></a> : null}
            <button className="kx-button-primary h-8" onClick={() => createDraft(item)}>创建草稿</button>
            <button className="kx-button-ghost h-8" onClick={() => createDraft(item)}>发布到本地资讯</button>
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
    <section className="kx-card">
      <h2 className="mb-3 text-sm font-black">采集日志</h2>
      <div className="space-y-2">
        {q.data.fetch_logs.map((log) => (
          <div key={String(log.id)} className="rounded-kx-md bg-kx-soft px-3 py-2 text-sm">
            <div className="font-bold">{String(log.source_name || log.source_id || "source")} · {String(log.status)}</div>
            <div className="text-xs text-kx-muted">new {String(log.new_count ?? 0)} · duplicate {String(log.duplicate_count ?? 0)} · {String(log.created_at || "")}</div>
            {log.error_message ? <div className="mt-1 text-xs text-kx-danger">{String(log.error_message)}</div> : null}
          </div>
        ))}
      </div>
    </section>
  );
}

function PostLink({ post }: { post: EditorialPost }) {
  return (
    <Link href={`/news/${post.id}`} className="block rounded-kx-md bg-kx-soft px-3 py-2 hover:bg-kx-stroke/30">
      <div className="line-clamp-1 text-sm font-bold">{post.title}</div>
      <div className="mt-0.5 text-xs text-kx-muted">{post.author_display_name} · {post.city || "Japan-wide"} · {post.published_at ? relativeTime(post.published_at) : post.status}</div>
    </Link>
  );
}
