"use client";

import Link from "next/link";
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
      await api.japanNewsCrawlerFetchAll();
      refresh();
      pushToast({ kind: "success", message: "批量抓取已执行" });
    } catch (e) {
      pushToast({ kind: "error", message: (e as APIError).message });
    }
  };
  if (q.isError) return <ErrorState onRetry={() => q.refetch()} />;
  if (!q.data) return <InlineLoading />;
  return (
    <section className="kx-card p-0">
      <div className="flex items-center justify-between border-b border-kx-stroke/40 p-3">
        <div className="text-sm font-black">日本来源</div>
        <button className="kx-button-ghost h-8" onClick={runAll}><RefreshCw className="h-4 w-4" /> 抓取全部启用来源</button>
      </div>
      <div className="divide-y divide-kx-stroke/40">
        {q.data.map((source) => (
          <div key={source.id} className="flex flex-col gap-2 p-3 md:flex-row md:items-center">
            <div className="min-w-0 flex-1">
              <div className="font-bold">{source.name}</div>
              <div className="text-xs text-kx-muted">{source.source_type} / {source.crawl_strategy} · {source.city || "Japan-wide"} · {source.default_category}</div>
              <div className="mt-1 truncate text-xs text-kx-muted">{source.source_url || source.homepage_url || "manual"}</div>
              {source.last_error ? <div className="mt-1 text-xs text-kx-danger">{source.last_error}</div> : null}
            </div>
            <button className="kx-button-ghost h-8" onClick={() => api.japanNewsCrawlerToggleSource(source.id).then(refresh)}>{source.is_active ? "停用" : "启用"}</button>
            <button className="kx-button-ghost h-8" onClick={() => run(source)}><Rss className="h-4 w-4" /> 抓取</button>
          </div>
        ))}
      </div>
    </section>
  );
}

function Items() {
  const pushToast = useToasts((s) => s.push);
  const q = useQuery({ queryKey: ["japan-crawler-items"], queryFn: () => api.japanNewsCrawlerItems({ status: "fetched", country: "jp", limit: 80 }) });
  const createDraft = async (item: NewsItem) => {
    try {
      await api.japanNewsCrawlerCreateDraftFromItem(item.id);
      q.refetch();
      pushToast({ kind: "success", message: "已创建草稿" });
    } catch (e) {
      pushToast({ kind: "error", message: (e as APIError).message });
    }
  };
  if (q.isError) return <ErrorState onRetry={() => q.refetch()} />;
  if (!q.data) return <InlineLoading />;
  return (
    <section className="kx-card p-0">
      <div className="border-b border-kx-stroke/40 p-3 text-sm font-black">待处理内容池</div>
      <div className="divide-y divide-kx-stroke/40">
        {q.data.items.map((item) => (
          <div key={item.id} className="flex flex-col gap-2 p-3 md:flex-row md:items-start">
            <div className="min-w-0 flex-1">
              <div className="line-clamp-2 font-bold">{item.original_title}</div>
              <div className="mt-1 text-xs text-kx-muted">{item.source_name} · {item.city || "Japan-wide"} · {item.category}</div>
              {item.original_summary ? <div className="mt-1 line-clamp-2 text-sm text-kx-subtle">{item.original_summary}</div> : null}
            </div>
            {item.original_url ? <a className="kx-button-ghost h-8" href={item.original_url} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" /></a> : null}
            <button className="kx-button-primary h-8" onClick={() => createDraft(item)}>创建草稿</button>
          </div>
        ))}
        {!q.data.items.length ? <EmptyState title="暂无待处理内容" /> : null}
      </div>
    </section>
  );
}

function Posts({ status }: { status: "draft" | "published" }) {
  const q = useQuery({
    queryKey: ["japan-crawler-posts", status],
    queryFn: () => api.adminEditorialPosts({ status, country: "jp", limit: 80 }),
  });
  if (q.isError) return <ErrorState onRetry={() => q.refetch()} />;
  if (!q.data) return <InlineLoading />;
  return (
    <section className="kx-card">
      <h2 className="mb-3 text-sm font-black">{status === "published" ? "已发布" : "草稿"}</h2>
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
