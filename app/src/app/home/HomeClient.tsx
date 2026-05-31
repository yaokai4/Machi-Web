"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useInfiniteQuery, keepPreviousData, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import {
  Bell,
  CalendarDays,
  Coffee,
  Globe2,
  Hash,
  Languages,
  MapPin,
  MessageCircle,
  MessageSquareText,
  PlusCircle,
  Search,
  ShieldCheck,
  Store,
  Utensils,
  UserCircle,
  Users,
  type LucideIcon,
} from "lucide-react";
import { api, APIError, isAuthRequiredError } from "@/lib/api";
import type { FeedMode, KXPost, Paginated } from "@/lib/types";
import { AppShell } from "@/components/shell/AppShell";
import { PostCard } from "@/components/feed/PostCard";
import { EmptyState, ErrorState, PostSkeleton } from "@/components/design/States";
import { ChannelEmptyState } from "@/components/feed/ChannelEmptyState";
import { RegionPickerDialog } from "@/components/feed/RegionPickerDialog";
import { useAuthPrompt, useCompose, useSession, useToasts } from "@/lib/store";
import { useI18n } from "@/lib/i18n";
import { Avatar } from "@/components/design/Avatar";
import { LocalNewsStrip } from "@/components/news/LocalNewsStrip";
import { regionFromUser, regionHeaderLabel, type RegionInfo } from "@/lib/regions";
import clsx from "clsx";

type HotScope = "city" | "country" | "all";

const cityPulseCards = [
  { city: "Tokyo", channel: "Dining", title: "周五涩谷有人一起吃拉面吗？", meta: "3 replies · 中文 / EN" },
  { city: "Tokyo", channel: "Housing", title: "新宿租房有哪些坑要避开？", meta: "28 answers · 中文" },
  { city: "Tokyo", channel: "Language Exchange", title: "Looking for Japanese-English exchange near Shibuya.", meta: "12 replies · EN / 日本語" },
  { city: "Tokyo", channel: "Events", title: "This weekend: indie live house near Shimokitazawa.", meta: "8 interested · EN" },
  { city: "Tokyo", channel: "Jobs", title: "Part-time cafe job, Japanese N3+ preferred.", meta: "5 saves · 中文 / 日本語" },
];

const socialEntries: Array<[string, string, LucideIcon]> = [
  ["找饭搭子", "Dining buddies", Utensils],
  ["找咖啡搭子", "Coffee companions", Coffee],
  ["找活动搭子", "Event companions", CalendarDays],
  ["找语言交换", "Language exchange", Languages],
  ["找新朋友", "New friends", Users],
  ["本地互助", "Local help", MessageSquareText],
];

const channelGroups = [
  {
    title: "City Life",
    items: [
      ["本地新闻", "城市里的政策、交通、天气和生活提醒。", "今日 18 条 · Tokyo / Osaka"],
      ["城市指南", "初到城市也能快速找到生活方法。", "热门：通勤 / 手机卡 / 区役所"],
      ["问答", "问租房、手续、学校、医疗和日常问题。", "今日 42 个问题"],
      ["避坑经验", "真实经历帮你少走弯路。", "热门：虚假房源 / 合同 / 中介"],
    ],
  },
  {
    title: "Social & Offline",
    items: [
      ["约饭 Dining", "找人一起吃饭、喝咖啡、探索城市小店。", "今日 12 个饭局 · Shibuya / Shinjuku / Ueno"],
      ["同城搭子", "找运动、活动、展览、周末同行。", "热门：跑步 / Live house / 展览"],
      ["语言交换", "用城市和语言找到合适的练习伙伴。", "中文 + English + 日本語"],
    ],
  },
  {
    title: "Opportunities",
    items: [
      ["租房", "看房源、问区域、分享避坑经验。", "热门：新宿 / 池袋 / 吉祥寺"],
      ["二手", "搬家甩卖、家电、家具和生活用品。", "今日 31 件"],
      ["找工作 / 招聘", "本地兼职、全职、招聘和经验分享。", "N3+ / Cafe / Local hiring"],
      ["优惠", "餐厅、语言学校、健身房和本地商家活动。", "商家认证入口已预留"],
    ],
  },
];

const publishTypes = [
  "问一个本地问题",
  "找饭搭子",
  "找活动搭子",
  "找语言交换",
  "发布二手",
  "发布租房",
  "发布招聘",
  "发布活动",
  "分享避坑经验",
];

const searchSuggestions = ["新宿租房", "涩谷饭搭子", "Tokyo language exchange", "part-time job", "Toronto newcomer tips"];

function HomeProductIntro({
  cityLabel,
  onPickCity,
  onPublish,
  onAuthPrompt,
}: {
  cityLabel: string;
  onPickCity: () => void;
  onPublish: () => void;
  onAuthPrompt: () => void;
}) {
  return (
    <div className="space-y-4">
      <section className="relative overflow-hidden rounded-kx-lg border border-kx-stroke/60 bg-kx-card px-4 py-5 shadow-sm sm:px-5 sm:py-6">
        <div className="pointer-events-none absolute right-4 top-4 hidden h-28 w-28 rounded-full border border-kx-accent/20 sm:block" aria-hidden="true" />
        <div className="pointer-events-none absolute right-12 top-12 hidden h-12 w-12 rounded-full border border-kx-heat/25 sm:block" aria-hidden="true" />
        <div className="relative">
          <div className="mb-3 flex flex-wrap items-center gap-2 text-xs font-bold text-kx-muted">
            <span className="rounded-full bg-kx-accentSoft px-2 py-1 text-kx-accent">城市首页</span>
            <span className="rounded-full bg-kx-soft px-2 py-1">Beta sample data</span>
            <span className="rounded-full bg-kx-soft px-2 py-1">中文 + English + 日本語</span>
          </div>
          <h2 className="text-[1.9rem] font-black leading-tight tracking-normal text-kx-text sm:text-[2.55rem]">城市生活与同城连接</h2>
          <p className="mt-2 text-lg font-black leading-tight text-kx-text sm:text-xl">在每一座城市，找到生活的回声。</p>
          <div className="mt-3 grid gap-1 text-sm leading-6 text-kx-subtle">
            <p><strong className="text-kx-text">Machi</strong> · 在每一座城市，找到生活的回声。</p>
            <p><strong className="text-kx-text">Machi City</strong> · Find the echoes of life in every city.</p>
            <p><strong className="text-kx-text">Machi City</strong> · すべての街で、暮らしの響きを見つける。</p>
            <p>Machi 是按城市和语言组织的本地生活与同城社交社区。用户可以发现城市里的信息，也认识城市里的人。</p>
          </div>
          <div className="mt-4 rounded-kx-md border border-kx-stroke/50 bg-kx-soft/70 p-3">
            <div className="text-sm font-black text-kx-text">{cityLabel || "Tokyo"} 今天正在发生：</div>
            <p className="mt-1 text-sm leading-6 text-kx-subtle">
              找饭搭子、问租房、看活动、找语言交换、发现本地经验。
              <span className="hidden sm:inline">
                {" "}What’s happening in Tokyo today: meet people, ask local questions, find housing tips, discover events and join real city conversations.
              </span>
            </p>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={onPublish} className="kx-button-primary h-10 px-4">
              <PlusCircle className="h-4 w-4" /> 发布一个问题
            </button>
            <Link href="/search?q=%E9%A5%AD%E6%90%AD%E5%AD%90" className="kx-button-ghost h-10 px-4">
              <Users className="h-4 w-4" /> 寻找同城连接
            </Link>
            <button type="button" onClick={onPickCity} className="kx-button-ghost hidden h-10 px-4 sm:inline-flex">
              <MapPin className="h-4 w-4" /> 浏览 {cityLabel || "Tokyo"}
            </button>
          </div>
        </div>
      </section>

      <section className="kx-card">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-black text-kx-text">Today in City / City Pulse</h2>
            <p className="text-xs text-kx-muted">Beta sample data · Demo preview</p>
          </div>
          <Link href="/trending" className="text-xs font-bold text-kx-accent hover:underline">查看热榜</Link>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {cityPulseCards.map((card) => (
            <Link key={`${card.channel}-${card.title}`} href={`/search?q=${encodeURIComponent(card.title)}`} className="rounded-kx-md border border-kx-stroke/50 bg-kx-bg/70 p-3 transition hover:border-kx-accent/40 hover:bg-kx-accentSoft/40">
              <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-bold text-kx-muted">
                <span className="rounded-full bg-kx-soft px-2 py-0.5">{card.city}</span>
                <span className="rounded-full bg-kx-soft px-2 py-0.5">{card.channel}</span>
              </div>
              <div className="mt-2 line-clamp-2 font-bold leading-5 text-kx-text">{card.title}</div>
              <div className="mt-2 text-xs text-kx-muted">{card.meta}</div>
            </Link>
          ))}
        </div>
      </section>

      <section className="kx-card">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-xl font-black text-kx-text">不只是找信息，也是在城市里认识人。</h2>
            <p className="mt-1 text-sm text-kx-subtle">More than local information — meet people in your city.</p>
            <p className="text-sm text-kx-subtle">情報を探すだけでなく、同じ街の人とつながる。</p>
          </div>
          <div className="flex -space-x-2">
            {["M", "T", "A", "K"].map((label, index) => (
              <span key={label} className="grid h-9 w-9 place-items-center rounded-full border-2 border-kx-card bg-kx-accent text-xs font-black text-white" style={{ backgroundColor: ["#2563eb", "#16a34a", "#f97316", "#7c3aed"][index] }}>
                {label}
              </span>
            ))}
          </div>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {socialEntries.map(([label, english, Icon]) => (
            <Link key={label} href={`/search?q=${encodeURIComponent(label)}`} className="flex items-center gap-3 rounded-kx-md bg-kx-soft p-3 hover:bg-kx-stroke/40">
              <Icon className="h-5 w-5 shrink-0 text-kx-accent" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-bold text-kx-text">{label}</span>
                <span className="block truncate text-xs text-kx-muted">{english}</span>
              </span>
            </Link>
          ))}
        </div>
        <p className="mt-3 rounded-kx-md bg-kx-bg/70 px-3 py-2 text-xs font-semibold leading-5 text-kx-subtle">
          第一次见面请选择公共场所。不要提前分享住址、证件或财务信息。
        </p>
      </section>

      <section className="grid gap-3">
        {channelGroups.map((group) => (
          <div key={group.title} className="kx-card">
            <h2 className="text-base font-black text-kx-text">{group.title}</h2>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {group.items.map(([name, desc, meta]) => (
                <Link key={name} href={`/search?q=${encodeURIComponent(name)}`} className="rounded-kx-md border border-kx-stroke/50 bg-kx-card p-3 hover:border-kx-accent/40">
                  <div className="font-black text-kx-text">{name}</div>
                  <p className="mt-1 text-sm leading-5 text-kx-subtle">{desc}</p>
                  <div className="mt-2 text-xs font-bold text-kx-muted">{meta}</div>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </section>

      <section className="kx-card">
        <h2 className="text-lg font-black text-kx-text">搜索城市问题、频道和人</h2>
        <Link href="/search" className="mt-3 flex min-h-12 items-center gap-2 rounded-kx-md border border-kx-stroke bg-kx-bg px-3 text-sm text-kx-muted hover:border-kx-accent/50">
          <Search className="h-4 w-4 text-kx-accent" />
          搜索租房、饭搭子、语言交换、工作、活动、本地问题...
        </Link>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {searchSuggestions.map((item) => (
            <Link key={item} href={`/search?q=${encodeURIComponent(item)}`} className="rounded-full bg-kx-soft px-3 py-1 text-xs font-semibold text-kx-muted hover:text-kx-text">
              {item}
            </Link>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5 text-[11px] font-bold text-kx-muted">
          {["帖子", "用户", "活动", "频道", "城市", "商家", "问答"].map((item) => <span key={item} className="rounded-full bg-kx-bg px-2 py-1">{item}</span>)}
        </div>
      </section>

      <section className="grid gap-3 lg:grid-cols-2">
        <div className="kx-card">
          <h2 className="flex items-center gap-2 text-lg font-black text-kx-text"><PlusCircle className="h-5 w-5 text-kx-accent" /> 发布入口</h2>
          <p className="mt-1 text-sm text-kx-subtle">选择最贴近场景的类型，让城市里的人更快回应。</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {publishTypes.map((item) => (
              <button key={item} type="button" onClick={onPublish} className="rounded-kx-md bg-kx-soft px-3 py-2 text-left text-xs font-bold text-kx-text hover:bg-kx-stroke/40">
                {item}
              </button>
            ))}
          </div>
        </div>
        <div className="kx-card">
          <h2 className="flex items-center gap-2 text-lg font-black text-kx-text"><MessageCircle className="h-5 w-5 text-kx-accent" /> 消息、通知和个人主页</h2>
          <div className="mt-3 grid gap-2">
            <button type="button" onClick={onAuthPrompt} className="flex items-start gap-3 rounded-kx-md bg-kx-soft p-3 text-left hover:bg-kx-stroke/40">
              <MessageCircle className="mt-0.5 h-4 w-4 text-kx-accent" />
              <span><strong className="block text-sm text-kx-text">还没有消息。</strong><span className="text-xs leading-5 text-kx-subtle">加入一个饭局、发起一次语言交换，城市里的回声会从这里开始。</span></span>
            </button>
            <button type="button" onClick={onAuthPrompt} className="flex items-start gap-3 rounded-kx-md bg-kx-soft p-3 text-left hover:bg-kx-stroke/40">
              <UserCircle className="mt-0.5 h-4 w-4 text-kx-accent" />
              <span><strong className="block text-sm text-kx-text">个人主页规划</strong><span className="text-xs leading-5 text-kx-subtle">头像、昵称、城市、语言、兴趣标签、正在寻找、已发布内容、参与过的活动、认证状态和安全提示。</span></span>
            </button>
          </div>
        </div>
      </section>

      <section className="grid gap-3 lg:grid-cols-3">
        <div className="kx-card lg:col-span-2">
          <h2 className="flex items-center gap-2 text-lg font-black text-kx-text"><Languages className="h-5 w-5 text-kx-accent" /> 界面语言与内容语言分开</h2>
          <p className="mt-1 text-sm text-kx-subtle">示例：界面语言中文；内容语言中文 + English + 日本語；城市 Tokyo。</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {["全部语言", "只看中文", "Only English", "日本語のみ", "自动翻译入口预留"].map((item) => (
              <span key={item} className="rounded-full bg-kx-soft px-3 py-1 text-xs font-bold text-kx-muted">{item}</span>
            ))}
          </div>
        </div>
        <div className="kx-card">
          <h2 className="flex items-center gap-2 text-lg font-black text-kx-text"><ShieldCheck className="h-5 w-5 text-kx-accent" /> 安全和信任</h2>
          <p className="mt-2 text-sm leading-6 text-kx-subtle">支持举报、拉黑、隐私设置、线下见面提醒、饭局安全提示、语言交换安全提示、虚假房源提醒、招聘诈骗提醒、商家认证和用户认证。</p>
        </div>
      </section>

      <section className="grid gap-3 lg:grid-cols-2">
        <div className="kx-card">
          <h2 className="flex items-center gap-2 text-lg font-black text-kx-text"><Store className="h-5 w-5 text-kx-accent" /> 商家入口</h2>
          <p className="mt-2 text-sm leading-6 text-kx-subtle">创建商家主页、发布活动、发布优惠、发布招聘、申请认证、查看线索。</p>
          <div className="mt-3 grid gap-2 text-xs font-semibold text-kx-muted">
            <span>餐厅发起 ramen meetup</span>
            <span>语言学校发起 language exchange night</span>
            <span>健身房发起 weekend running group</span>
            <span>招聘者发布 local hiring</span>
          </div>
        </div>
        <div className="kx-card">
          <h2 className="flex items-center gap-2 text-lg font-black text-kx-text"><Globe2 className="h-5 w-5 text-kx-accent" /> 城市状态</h2>
          <p className="mt-2 text-sm leading-6 text-kx-subtle">这座城市的回声还在聚集。成为第一个发起问题、饭局或语言交换的人。</p>
          <p className="mt-2 text-sm leading-6 text-kx-subtle">This city is still gathering its first echoes. Start the first question, dinner plan or language exchange.</p>
          <div className="mt-3 flex flex-wrap gap-1.5 text-[11px] font-bold text-kx-muted">
            {["Loading", "Empty", "Error", "Guest", "Closed beta", "Coming soon city"].map((item) => <span key={item} className="rounded-full bg-kx-soft px-2 py-1">{item}</span>)}
          </div>
        </div>
      </section>

      <section className="kx-card">
        <h2 className="text-lg font-black text-kx-text">Feed tabs</h2>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {["For You", "City Pulse", "Social", "Questions", "Opportunities", "Latest", "Trending"].map((item) => (
            <Link key={item} href={`/search?q=${encodeURIComponent(item)}`} className="shrink-0 rounded-full bg-kx-soft px-3 py-1.5 text-xs font-bold text-kx-muted hover:text-kx-text">
              {item}
            </Link>
          ))}
        </div>
        <p className="mt-2 text-xs text-kx-muted">游客可以浏览部分内容；点赞、评论、私信、发布和收藏时会提示登录或加入 beta。</p>
      </section>
    </div>
  );
}

export default function HomeClient() {
  const [mode, setMode] = useState<FeedMode>("recommend");
  const [hotScope, setHotScope] = useState<HotScope>("city");
  const [regionPickerOpen, setRegionPickerOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [, startTransition] = useTransition();
  // Scroll-aware header: deepen the glass bar's shadow once the user scrolls
  // a little, so content reads as sliding *under* a floating bar.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  const setModeSmooth = (next: FeedMode) => startTransition(() => setMode(next));
  const user = useSession((s) => s.user);
  const setUser = useSession((s) => s.setUser);
  const openAuthPrompt = useAuthPrompt((s) => s.open);
  const compose = useCompose((s) => s.open);
  const pushToast = useToasts((s) => s.push);
  const queryClient = useQueryClient();
  const userCountry = user?.country;
  const userProvince = user?.province;
  const userCity = user?.city;
  const userRegionCode = user?.current_region_code;
  const currentRegion = regionFromUser(user);
  const { t } = useI18n();
  const MODES: { value: FeedMode; label: string }[] = [
    { value: "recommend", label: t("tab_recommend") },
    { value: "local", label: t("tab_local") },
    { value: "following", label: t("tab_following") },
    { value: "hot", label: t("tab_hot") },
  ];
  const HOT_SCOPES: { value: HotScope; label: string }[] = [
    { value: "city", label: "城市" },
    { value: "country", label: "国家" },
    { value: "all", label: "全站" },
  ];
  // Memo'd so the feed query's useMemo deps don't see a fresh object
  // reference on every render — without this the feed re-derives the
  // ranking context on every hover/key event.
  const regionOpts = useMemo(
    () =>
      userCountry || userProvince || userCity || userRegionCode
        ? {
            country: userCountry,
            province: userProvince,
            city: userCity,
            region_code: userRegionCode,
          }
        : {},
    [userCountry, userProvince, userCity, userRegionCode],
  );
  // For the hot tab the user picks the scope explicitly (city /
  // country / all). For the local tab we always filter by region.
  // Other modes default to country so the feed is at least continent-
  // aware without being all-world.
  const feedRegionOpts = useMemo(() => {
    if (mode === "local") return regionOpts;
    if (mode === "hot") {
      if (hotScope === "city") return { region_code: regionOpts.region_code, country: regionOpts.country };
      if (hotScope === "country") return { country: regionOpts.country };
      return {} as typeof regionOpts;
    }
    return { country: regionOpts.country };
  }, [mode, hotScope, regionOpts]);

  const feed = useInfiniteQuery<Paginated<KXPost> & { mode: FeedMode }>({
    queryKey: [
      "feed",
      mode,
      mode === "hot" ? hotScope : "",
      mode === "local" ? (regionOpts.region_code || regionOpts.city || "") : (regionOpts.country || ""),
    ],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => api.feed(mode, pageParam as string | undefined, feedRegionOpts),
    getNextPageParam: (last) => last.next_cursor ?? undefined,
    enabled: (mode !== "following" || !!user) && (mode !== "local" || !!(regionOpts.region_code || regionOpts.city)),
    // Show the old feed while a new mode is being fetched — no flash to
    // blank skeleton when switching 推荐 / 关注 / 热度.
    placeholderData: keepPreviousData,
    // Keep feed in cache for 30s — switching back/forth between tabs
    // no longer triggers a fresh request and the scroll position
    // survives. Garbage-collect after 5 min.
    staleTime: 30_000,
    gcTime: 5 * 60_000,
  });

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!feed.hasNextPage || feed.isFetching) return;
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) feed.fetchNextPage();
      },
      { rootMargin: "1200px 0px 1200px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [feed]);

  const items = feed.data?.pages.flatMap((p) => p.items) ?? [];

  const persistRegion = async (region: RegionInfo) => {
    try {
      const next = await api.updateMe({
        country: region.country_code,
        province: region.province_code,
        city: region.city_code,
        current_region_code: region.region_code,
      });
      setUser(next);
      queryClient.invalidateQueries({ queryKey: ["feed"] });
      queryClient.invalidateQueries({ queryKey: ["explore-hot-city"] });
      pushToast({ kind: "success", message: `已切换到 ${region.city_name}` });
    } catch (err) {
      if (isAuthRequiredError(err)) {
        openAuthPrompt("generic");
        return;
      }
      pushToast({ kind: "error", message: (err as APIError).message });
    }
  };

  return (
    <AppShell requireAuth={false}>
      <div data-scrolled={scrolled ? "true" : "false"} className="sticky top-0 z-30 kx-glass-bar px-3 pt-2 pb-2 flex flex-col gap-2">
        <div className="flex items-center gap-2">
          {user ? (
            <Link href="/me" aria-label="我的">
              <Avatar user={user} size={44} />
            </Link>
          ) : null}
          <h1 className="text-[28px] font-black tracking-tight shrink-0 leading-none md:hidden">Machi</h1>
          <button
            type="button"
            onClick={() => (user ? setRegionPickerOpen(true) : openAuthPrompt("generic"))}
            className="ml-auto inline-flex items-center gap-1 h-10 px-3 rounded-full bg-kx-soft text-xs font-bold text-kx-text hover:bg-kx-stroke/40 transition"
            title="切换地区"
          >
            <MapPin className="w-3.5 h-3.5 text-kx-accent" />
            <span className="max-w-[7rem] truncate">
              {regionHeaderLabel(currentRegion)}
            </span>
          </button>
          {user ? (
            <Link
              href="/notifications"
              className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-kx-soft hover:bg-kx-stroke/40 transition"
              aria-label={t("nav_notifications")}
            >
              <Bell className="w-4 h-4 text-kx-text" />
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => openAuthPrompt("generic")}
              className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-kx-soft hover:bg-kx-stroke/40 transition"
              aria-label={t("nav_notifications")}
            >
              <Bell className="w-4 h-4 text-kx-text" />
            </button>
          )}
        </div>
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          <Link href="/search" className="flex min-h-10 flex-1 items-center gap-2 rounded-full bg-kx-soft px-3 text-sm text-kx-muted hover:bg-kx-stroke/40">
            <Search className="h-4 w-4 text-kx-accent" />
            <span className="truncate">搜索租房、饭搭子、语言交换、工作、活动、本地问题...</span>
          </Link>
          <div className="hidden shrink-0 items-center gap-1 lg:flex">
            <Link href="/explore" className="kx-button-ghost h-10 px-3"><Hash className="h-4 w-4" /> 频道</Link>
            <button type="button" onClick={() => (user ? compose() : openAuthPrompt("publish"))} className="kx-button-primary h-10 px-3"><PlusCircle className="h-4 w-4" /> 发布</button>
            <Link href="/messages" onClick={(event) => { if (!user) { event.preventDefault(); openAuthPrompt("message"); } }} className="kx-button-ghost h-10 px-3"><MessageCircle className="h-4 w-4" /> 消息</Link>
            <Link href="/settings" onClick={(event) => { if (!user) { event.preventDefault(); openAuthPrompt("generic"); } }} className="kx-button-ghost h-10 px-3"><Languages className="h-4 w-4" /> 语言</Link>
          </div>
        </div>
        <div className="flex items-center gap-1 p-1 rounded-full bg-kx-soft kx-tap self-start">
          {MODES.map((m) => (
            <button
              key={m.value}
              className={clsx("kx-tab", "px-2.5 sm:px-3.5 h-8 text-sm")}
              data-active={mode === m.value}
              onClick={() => (m.value === "following" && !user ? openAuthPrompt("follow") : setModeSmooth(m.value))}
            >
              {m.label}
            </button>
          ))}
        </div>
        {mode === "hot" ? (
          <div className="flex items-center gap-1 self-start">
            {HOT_SCOPES.map((s) => (
              <button
                key={s.value}
                className="kx-tab px-2.5 h-7 text-xs"
                data-active={hotScope === s.value}
                onClick={() => startTransition(() => setHotScope(s.value))}
              >
                {s.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="px-3 sm:px-4 py-3 space-y-3">
        <HomeProductIntro
          cityLabel={regionHeaderLabel(currentRegion)}
          onPickCity={() => (user ? setRegionPickerOpen(true) : openAuthPrompt("generic"))}
          onPublish={() => (user ? compose() : openAuthPrompt("publish"))}
          onAuthPrompt={() => openAuthPrompt("generic")}
        />
        <LocalNewsStrip
          country={currentRegion?.country_code || userCountry}
          city={currentRegion?.city_code || userCity}
          title="本地资讯台"
        />
        {feed.isLoading ? (
          <>
            <PostSkeleton />
            <PostSkeleton />
            <PostSkeleton />
          </>
        ) : feed.isError ? (
          <ErrorState onRetry={() => feed.refetch()} subtitle="无法加载 Feed，请检查后端是否运行。" />
        ) : items.length === 0 ? (
          mode === "following" ? (
            <EmptyState
              title={t("empty_following_title")}
              subtitle={t("empty_following_subtitle")}
            />
          ) : mode === "local" && !currentRegion ? (
            <div className="flex flex-col items-center justify-center px-6 py-16 text-center text-kx-subtle">
              <div className="rounded-full bg-kx-soft p-3">
                <MapPin className="h-6 w-6 text-kx-accent" />
              </div>
              <div className="mt-3 text-base font-semibold text-kx-text">选择当前城市</div>
              <div className="mt-2 max-w-sm text-sm text-kx-subtle">同城流会根据你的当前地区展示本地动态、新闻、攻略、租房、工作、二手和活动。</div>
              <button type="button" className="kx-button-primary mt-4" onClick={() => (user ? setRegionPickerOpen(true) : openAuthPrompt("generic"))}>
                选择城市
              </button>
            </div>
          ) : (
            // Empty feed → invite the user to publish. Mirrors iOS
            // ChannelEmptyState.
            <ChannelEmptyState contentType="dynamic" />
          )
        ) : (
          items.map((post, i) => (
            <div
              key={post.id}
              className="animate-kx-slide-up"
              style={{ animationDelay: `${Math.min(i, 5) * 30}ms`, animationFillMode: "both" }}
            >
              <PostCard post={post} />
            </div>
          ))
        )}
        <div ref={sentinelRef} />
        {feed.isFetchingNextPage ? <PostSkeleton /> : null}
        {!feed.hasNextPage && items.length > 0 ? (
          <div className="text-center text-kx-muted text-xs py-6">{t("no_more")}</div>
        ) : null}
      </div>
      <RegionPickerDialog
        open={regionPickerOpen}
        onClose={() => setRegionPickerOpen(false)}
        onSelect={persistRegion}
        initialCountry={user?.country || currentRegion?.country_code}
        allowsAnyCountry={!user?.country}
        recentCodes={user?.recent_region_codes}
      />
    </AppShell>
  );
}
