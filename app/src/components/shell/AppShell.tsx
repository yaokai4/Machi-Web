"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";
import {
  Bell,
  BadgeCheck,
  Bookmark,
  Compass,
  Home,
  LogIn,
  LogOut,
  Languages,
  Mail,
  MapPin,
  PenSquare,
  Search,
  Settings,
  ShieldCheck,
  Sun,
  Moon,
  Newspaper,
  UserCheck,
  UserPlus,
  User as UserIcon,
  Hash,
  X,
  type LucideIcon,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuthPrompt, useCompose, useSession, useSettings, useToasts, type AuthPromptKind } from "@/lib/store";
import { Avatar } from "@/components/design/Avatar";
import { Toaster } from "@/components/design/Toaster";
import { Composer } from "@/components/compose/Composer";
import { AuthRequiredDialog, authRedirectHref } from "@/components/auth/AuthRequiredDialog";
import { BrandText } from "@/components/marketing/BrandText";
import { useRealtime } from "@/lib/realtime";
import { useGlobalShortcuts } from "@/lib/keyboard";
import { ErrorBoundary } from "@/components/design/ErrorBoundary";
import { useI18n, useUiLocale, type I18nKey, type Locale } from "@/lib/i18n";
import type { KXUser } from "@/lib/types";

interface AppShellProps {
  children: React.ReactNode;
  right?: React.ReactNode;
  requireAuth?: boolean;
}

type NavItem = {
  href: string;
  labelKey: I18nKey;
  icon: LucideIcon;
  key: string;
  badgeKey?: "notifications" | "messages";
};

// Grouped left-nav. Nothing is removed vs. the old flat list — items are
// reordered into intent groups so 资讯 sits up front under 浏览, 私信/通知
// read as 互动, and 认证会员 gets its own 信任与会员 group (no longer buried
// between feed links). Section labels show only at the `lg` width where
// the text labels are visible; the collapsed `w-16` rail just shows icons.
const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "浏览",
    items: [
      { href: "/home", labelKey: "nav_home", icon: Home, key: "home" },
      { href: "/explore", labelKey: "nav_explore", icon: Compass, key: "explore" },
      { href: "/news", labelKey: "nav_news", icon: Newspaper, key: "news" },
      { href: "/search", labelKey: "nav_search", icon: Search, key: "search" },
    ],
  },
  {
    label: "互动",
    items: [
      { href: "/notifications", labelKey: "nav_notifications", icon: Bell, key: "notifications", badgeKey: "notifications" },
      { href: "/messages", labelKey: "nav_messages", icon: Mail, key: "messages", badgeKey: "messages" },
      { href: "/home?tab=following", labelKey: "tab_following", icon: UserCheck, key: "following" },
    ],
  },
  {
    label: "信任与会员",
    items: [{ href: "/membership", labelKey: "mem_title", icon: BadgeCheck, key: "membership" }],
  },
  {
    label: "账户",
    items: [{ href: "/settings", labelKey: "nav_settings", icon: Settings, key: "settings" }],
  },
];

const AUTH_REQUIRED_NAV = new Set(["notifications", "messages", "settings", "following"]);

function currentPathForRedirect(pathname: string | null) {
  if (typeof window === "undefined") return pathname || "/home";
  const candidate = `${window.location.pathname}${window.location.search}`;
  return candidate.startsWith("/") && !candidate.startsWith("//") ? candidate : pathname || "/home";
}

export function AppShell({ children, right, requireAuth = true }: AppShellProps) {
  const user = useSession((s) => s.user);
  const status = useSession((s) => s.status);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (requireAuth && status === "unauthed") {
      const redirect = currentPathForRedirect(pathname);
      const next = redirect !== "/" && redirect !== "/login" ? `?redirect=${encodeURIComponent(redirect)}` : "";
      router.replace(`/login${next}`);
    }
  }, [status, router, pathname, requireAuth]);

  useRealtime();
  useGlobalShortcuts();
  const ownsViewportBottom = ["/messages/", "/admin"].some((p) => pathname?.startsWith(p));

  if (status === "loading" || status === "idle" || (requireAuth && status === "unauthed")) {
    return (
      <div className="min-h-dvh flex items-center justify-center text-kx-muted">
        <span className="kx-skeleton w-32 h-4" />
      </div>
    );
  }

  return (
    <div className="min-h-dvh">
      <Toaster />
      <Composer />
      <AuthRequiredDialog />
      <div className="mx-auto max-w-kx-shell flex">
        <Sidebar pathname={pathname} user={user} />
        <main className="flex-1 min-w-0 border-x border-kx-stroke/35 lg:max-w-kx-feed bg-kx-bg/35">
          <div className={clsx("kx-page-enter", ownsViewportBottom ? "pb-0" : "pb-28 md:pb-8")}>
            <ErrorBoundary>{children}</ErrorBoundary>
          </div>
        </main>
        <RightSidebar>{right}</RightSidebar>
      </div>
      <MobileTabBar pathname={pathname} />
    </div>
  );
}

function Sidebar({ pathname, user }: { pathname: string; user: KXUser | null }) {
  const compose = useCompose((s) => s.open);
  const openAuthPrompt = useAuthPrompt((s) => s.open);
  const appearance = useSettings((s) => s.appearance);
  const setAppearance = useSettings((s) => s.setAppearance);
  const pushToast = useToasts((s) => s.push);
  const setSessionUser = useSession((s) => s.setUser);
  const queryClient = useQueryClient();
  const router = useRouter();

  const { t } = useI18n();
  const redirect = currentPathForRedirect(pathname);
  const notif = useQuery({
    queryKey: ["notifications", "all"],
    queryFn: () => api.notifications("all"),
    enabled: !!user,
    refetchInterval: 60000,
  });
  const conv = useQuery({
    queryKey: ["conversations"],
    queryFn: () => api.conversations(),
    enabled: !!user,
    refetchInterval: 60000,
  });
  const badges = {
    notifications: notif.data?.unread_count ?? 0,
    messages: (conv.data || []).reduce((sum, c) => sum + (c.unread_count || 0), 0),
  };

  const renderNavItem = (item: NavItem) => {
    const active = pathname?.startsWith(item.href);
    const Icon = item.icon;
    const badge = item.badgeKey ? badges[item.badgeKey] : 0;
    const requiresLogin = AUTH_REQUIRED_NAV.has(item.key);
    const content = (
      <>
        <span className="relative">
          <Icon className="w-5 h-5" />
          {badge > 0 ? (
            <span className="absolute -top-1.5 -right-2 min-w-4 h-4 px-1 rounded-full bg-kx-danger text-white text-[10px] font-bold inline-flex items-center justify-center">
              {badge > 99 ? "99+" : badge}
            </span>
          ) : null}
        </span>
        <span className="hidden lg:inline">{t(item.labelKey)}</span>
      </>
    );
    const itemClass = clsx(
      "flex items-center gap-3 px-3 py-2.5 rounded-full font-semibold text-base transition relative",
      "hover:bg-kx-soft",
      active && "bg-kx-accentSoft text-kx-accent",
    );
    if (!user && requiresLogin) {
      return (
        <button
          key={item.key}
          type="button"
          onClick={() => openAuthPrompt(item.key === "messages" ? "message" : "generic")}
          className={clsx(itemClass, "text-left")}
        >
          {content}
        </button>
      );
    }
    return (
      <Link
        key={item.key}
        href={item.href}
        className={itemClass}
        onClick={() => {
          if (item.key === "following") {
            window.dispatchEvent(new CustomEvent("machi:home-tab", { detail: "following" }));
          }
        }}
      >
        {content}
      </Link>
    );
  };

  const onLogout = async () => {
    try { await api.logout(); } catch { /* ignore */ }
    setSessionUser(null);
    queryClient.clear();
    pushToast({ kind: "success", message: "已退出登录" });
    router.replace("/login");
  };

  return (
    <aside className="hidden md:flex flex-col gap-1 w-16 lg:w-60 shrink-0 py-3 px-2 lg:px-3 sticky top-0 self-start h-dvh">
      <Link href="/home" className="px-3 py-3 inline-flex items-center gap-2 text-kx-text">
        <span className="w-9 h-9 rounded-kx-md bg-kx-accent text-white inline-flex items-center justify-center font-bold text-lg">
          M
        </span>
        <BrandText className="hidden text-base font-black lg:inline">Machi</BrandText>
      </Link>
      <nav className="flex flex-col mt-1">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="flex flex-col gap-0.5">
            <div className="hidden lg:block px-3 pt-3 pb-1 text-[11px] font-bold uppercase tracking-wide text-kx-muted/80">
              {group.label}
            </div>
            {group.items.map(renderNavItem)}
          </div>
        ))}
        {user?.role === "admin" ? (
          <Link
            href="/admin"
            className={clsx(
              "mt-0.5 flex items-center gap-3 px-3 py-2.5 rounded-full font-semibold text-base transition relative hover:bg-kx-soft",
              pathname?.startsWith("/admin") && "bg-kx-accentSoft text-kx-accent",
            )}
          >
            <ShieldCheck className="w-5 h-5" />
            <span className="hidden lg:inline">后台</span>
          </Link>
        ) : null}
      </nav>
      <button onClick={() => (user ? compose() : openAuthPrompt("publish"))} className="kx-button-primary mt-3 h-11 px-4 text-base">
        <PenSquare className="w-4 h-4" />
        <span className="hidden lg:inline">{t("action_compose")}</span>
      </button>

      <div className="mt-auto flex flex-col gap-1">
        <button
          onClick={() => setAppearance(appearance === "dark" ? "light" : "dark")}
          className="flex items-center gap-2 px-3 py-2 rounded-full hover:bg-kx-soft text-sm text-kx-subtle"
          aria-label="切换主题"
        >
          {appearance === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          <span className="hidden lg:inline">{appearance === "dark" ? "浅色模式" : "深色模式"}</span>
        </button>
        {user ? (
          <div
            className={clsx(
              "flex items-center gap-2 rounded-full p-1.5 transition",
              pathname?.startsWith("/me") ? "bg-kx-accentSoft" : "hover:bg-kx-soft",
            )}
          >
            <Link
              href="/me"
              className="flex min-w-0 flex-1 items-center gap-3 rounded-full px-0.5 py-0.5 text-left"
              aria-label="进入我的页面"
            >
              <Avatar user={user} size={36} />
              <div className="hidden min-w-0 flex-1 flex-col lg:flex">
                <span className="truncate text-sm font-semibold">{user.display_name}</span>
                <span className="truncate text-xs text-kx-muted">@{user.handle}</span>
              </div>
            </Link>
            <button
              onClick={onLogout}
              className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-full text-kx-muted transition hover:bg-kx-soft hover:text-kx-text lg:inline-flex"
              aria-label="退出登录"
              title="退出登录"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-1 rounded-kx-lg bg-kx-soft/60 p-2">
            <Link
              href={authRedirectHref("/login", redirect)}
              className="flex items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold text-kx-text hover:bg-kx-surface"
            >
              <LogIn className="h-4 w-4" />
              <span className="hidden lg:inline">登录</span>
            </Link>
            <Link
              href={authRedirectHref("/register", redirect)}
              className="flex items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold text-kx-accent hover:bg-kx-accentSoft"
            >
              <UserPlus className="h-4 w-4" />
              <span className="hidden lg:inline">注册</span>
            </Link>
          </div>
        )}
      </div>
    </aside>
  );
}

function RightSidebar({ children }: { children?: React.ReactNode }) {
  return (
    <aside className="hidden xl:flex flex-col gap-3 w-80 shrink-0 py-3 pl-6 sticky top-0 self-start h-dvh overflow-y-auto">
      {children ?? <DefaultRight />}
    </aside>
  );
}

function DefaultRight() {
  const trending = useQuery({
    queryKey: ["trending"],
    queryFn: () => api.trending(),
    staleTime: 60_000,
  });
  if (!trending.data) {
    return (
      <div className="space-y-3">
        <div className="kx-card h-32 kx-skeleton" />
        <div className="kx-card h-48 kx-skeleton" />
      </div>
    );
  }
  return (
    <>
      <section className="kx-card">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-full bg-kx-verified/15 text-kx-verified">
            <BadgeCheck className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="font-black text-kx-text">Machi 认证会员</h3>
            <p className="mt-1 text-xs leading-5 text-kx-muted">认证标识、高信任发布、优先审核和会员专属城市内容。</p>
            <Link href="/membership" className="mt-3 inline-flex text-xs font-bold text-kx-accent hover:underline">
              查看权益
            </Link>
          </div>
        </div>
      </section>
      {/* Topics — ranked, numbered, denser. Replaces the old plain
          bullet list which read as "secondary clutter" on PC. */}
      <section className="kx-card">
        <div className="flex items-center justify-between mb-3">
          <h3 className="kx-section-title px-0 inline-flex items-center gap-1.5 text-kx-text">
            <Hash className="w-4 h-4 text-kx-accent" /> 话题
          </h3>
          <Link href="/search?kind=topic" className="text-xs text-kx-muted hover:text-kx-accent">查看全部</Link>
        </div>
        <ul className="flex flex-col">
          {trending.data.topics.slice(0, 8).map((t, idx) => (
            <li key={t.tag} className="border-b border-kx-stroke/40 last:border-0">
              <Link
                href={`/t/${encodeURIComponent(t.tag)}`}
                className="group flex items-center gap-2.5 py-2 hover:bg-kx-soft/60 -mx-1 px-1 rounded-md"
              >
                <span
                  className={clsx(
                    "w-5 text-right font-black text-xs",
                    idx < 3 ? "text-kx-heat" : "text-kx-muted",
                  )}
                >
                  {idx + 1}
                </span>
                <span className="min-w-0 flex-1 font-semibold text-sm text-kx-text group-hover:text-kx-accent truncate">
                  #{t.tag}
                </span>
                <span className="text-kx-muted text-xs shrink-0">{t.post_count} 帖</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <section className="kx-card">
        <h3 className="kx-section-title mb-3 px-0 text-kx-text">推荐关注</h3>
        <ul className="flex flex-col gap-3">
          {trending.data.users.slice(0, 5).map((u) => (
            <li key={u.id} className="flex items-center gap-2">
              <Avatar user={u} size={36} href={`/u/${u.handle}`} />
              <div className="min-w-0 flex-1">
                <Link href={`/u/${u.handle}`} className="font-semibold text-sm hover:underline truncate block">
                  {u.display_name}
                </Link>
                <span className="text-kx-muted text-xs">@{u.handle}</span>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

function MobileTabBar({ pathname }: { pathname: string }) {
  // Routes that own the full bottom of the viewport — conversation,
  // post detail with comment box, compose flows. Hiding the TabBar
  // there avoids covering the page's own input bar.
  const hideOn = ["/messages/", "/admin"];
  const hidden = hideOn.some((p) => pathname?.startsWith(p));
  const compose = useCompose((s) => s.open);
  const openAuthPrompt = useAuthPrompt((s) => s.open);
  const user = useSession((s) => s.user);
  const { t } = useI18n();
  const [moreOpen, setMoreOpen] = useState(false);

  // Close the More sheet whenever we navigate away from any route.
  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  const notif = useQuery({
    queryKey: ["notifications", "all"],
    queryFn: () => api.notifications("all"),
    enabled: !!user && !hidden,
    refetchInterval: 60000,
  });
  const conv = useQuery({
    queryKey: ["conversations"],
    queryFn: () => api.conversations(),
    enabled: !!user && !hidden,
    refetchInterval: 60000,
  });

  if (hidden) return null;

  const unreadNotif = notif.data?.unread_count ?? 0;
  const unreadMsg = (conv.data || []).reduce((sum, c) => sum + (c.unread_count || 0), 0);

  // 5 slots for the mobile app shell: Home / Discover / Publish / News /
  // Mine. 资讯 is now a first-class entry; 私信 stays reachable from the
  // per-page top bar and the Mine "More" sheet so nothing is orphaned.
  const items = [
    { kind: "link" as const, href: "/home", label: t("nav_home"), icon: Home, badge: 0 },
    { kind: "link" as const, href: "/explore", label: t("nav_explore"), icon: Compass, badge: 0 },
    { kind: "compose" as const },
    { kind: "link" as const, href: "/news", label: t("nav_news"), icon: Newspaper, badge: 0 },
    { kind: "mine" as const, label: user ? t("nav_profile") : "登录", icon: user ? UserIcon : LogIn, badge: unreadNotif },
  ];

  return (
    <>
      <nav
        className="kx-glass-capsule md:hidden fixed left-1/2 z-40 w-[min(calc(100vw-1rem),24rem)] -translate-x-1/2 px-2 py-1 shadow-[0_16px_40px_-22px_rgba(15,23,42,0.5)]"
        style={{ bottom: "max(1.1rem, calc(env(safe-area-inset-bottom) + 0.35rem))" }}
      >
        <ul className="flex h-[3.9rem] items-stretch justify-between px-1">
          {items.map((item, idx) => {
            // Center compose: gradient blue + soft blue glow,极度想点击.
            if (item.kind === "compose") {
              return (
                <li key={`compose-${idx}`} className="flex flex-1 flex-col items-center justify-center gap-0.5 px-1">
                  <button
                    className="relative flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-tr from-kx-accent to-blue-500 text-white shadow-[0_8px_24px_-6px_rgb(var(--kx-accent)/0.6)] hover:shadow-[0_12px_30px_-6px_rgb(var(--kx-accent)/0.85)] active:scale-95 transition-all duration-200"
                    onClick={() => (user ? compose() : openAuthPrompt("publish"))}
                    aria-label="发布"
                  >
                    <PenSquare className="h-5 w-5" strokeWidth={2.25} />
                  </button>
                  <span className="text-[10px] font-bold leading-none text-kx-accent">发布</span>
                </li>
              );
            }
            // Clean line icons — no circle wrapper. Active = brand blue +
            // bolder stroke + a 4px dot underneath; inactive = muted thin line.
            const active =
              item.kind === "mine"
                ? moreOpen || pathname?.startsWith("/me") || pathname?.startsWith("/settings")
                : pathname?.startsWith(item.href);
            const Icon = item.icon;
            const badge = item.badge;
            const navClass = clsx(
              "flex h-full w-full flex-col items-center justify-center gap-0.5 active:scale-90 transition-transform duration-150",
              active ? "text-kx-accent" : "text-kx-muted hover:text-kx-text",
            );
            const iconInner = (
              <>
                <span className="relative inline-flex items-center justify-center">
                  <Icon className="h-[22px] w-[22px]" strokeWidth={active ? 2.5 : 1.75} />
                  {badge > 0 ? (
                    <span className="absolute -top-1.5 -right-2 min-w-4 h-4 px-1 rounded-full bg-kx-danger text-white text-[10px] font-bold inline-flex items-center justify-center">
                      {badge > 99 ? "99+" : badge}
                    </span>
                  ) : null}
                </span>
                <span className="max-w-[3.75rem] truncate text-[10px] font-bold leading-none">
                  {item.label}
                </span>
                <span
                  className={clsx(
                    "h-1 w-1 rounded-full bg-kx-accent transition-all duration-200",
                    active ? "scale-100 opacity-100" : "scale-0 opacity-0",
                  )}
                />
              </>
            );
            if (item.kind === "mine") {
              return (
                <li key="mine" className="flex-1">
                  <button type="button" onClick={() => setMoreOpen(true)} aria-label={item.label} aria-expanded={moreOpen} className={navClass}>
                    {iconInner}
                  </button>
                </li>
              );
            }
            return (
              <li key={item.href} className="flex-1">
                <Link href={item.href} aria-label={item.label} className={navClass}>
                  {iconInner}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <MobileMoreSheet
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        user={user}
        unreadNotif={unreadNotif}
        unreadMsg={unreadMsg}
        pathname={pathname}
        t={t}
      />
    </>
  );
}

function MobileMoreSheet({
  open,
  onClose,
  user,
  unreadNotif,
  unreadMsg,
  pathname,
  t,
}: {
  open: boolean;
  onClose: () => void;
  user: KXUser | null;
  unreadNotif: number;
  unreadMsg: number;
  pathname: string;
  t: (key: I18nKey) => string;
}) {
  const [mounted, setMounted] = useState(false);
  const queryClient = useQueryClient();
  const router = useRouter();
  const setSessionUser = useSession((s) => s.setUser);
  const pushToast = useToasts((s) => s.push);
  const openAuthPrompt = useAuthPrompt((s) => s.open);
  const appearance = useSettings((s) => s.appearance);
  const setAppearance = useSettings((s) => s.setAppearance);
  const setStoredSettings = useSettings((s) => s.setSettings);
  const setLocaleOverride = useUiLocale((s) => s.setOverride);
  const { locale } = useI18n();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const body = document.body;
    const previousOverflow = body.style.overflow;
    const previousPaddingRight = body.style.paddingRight;
    const scrollbarGap = window.innerWidth - document.documentElement.clientWidth;
    document.addEventListener("keydown", onKey);
    body.style.overflow = "hidden";
    if (scrollbarGap > 0) body.style.paddingRight = `${scrollbarGap}px`;
    return () => {
      document.removeEventListener("keydown", onKey);
      body.style.overflow = previousOverflow;
      body.style.paddingRight = previousPaddingRight;
    };
  }, [open, onClose]);

  const onLogout = async () => {
    try { await api.logout(); } catch { /* ignore */ }
    setSessionUser(null);
    queryClient.clear();
    pushToast({ kind: "success", message: "已退出登录" });
    onClose();
    router.replace("/login");
  };

  const redirect = currentPathForRedirect(pathname);
  const localeOrder: Locale[] = ["zh-Hans", "en", "ja"];
  const localeLabel = locale === "en" ? "English" : locale === "ja" ? "日本語" : "中文";
  const switchLanguage = () => {
    const next = localeOrder[(Math.max(0, localeOrder.indexOf(locale)) + 1) % localeOrder.length];
    setLocaleOverride(next);
    if (user) {
      void api
        .updateSettings({ language: next })
        .then(setStoredSettings)
        .catch(() => pushToast({ kind: "error", message: "语言已在本机切换，但同步到账号失败。" }));
    }
  };
  const openCitySwitcher = () => {
    onClose();
    if (!pathname?.startsWith("/home")) {
      router.push("/home");
      setTimeout(() => window.dispatchEvent(new CustomEvent("machi:open-region-picker")), 120);
      return;
    }
    window.dispatchEvent(new CustomEvent("machi:open-region-picker"));
  };
  const loginItem = { href: authRedirectHref("/login", redirect), label: "登录", icon: LogIn };
  const registerItem = { href: authRedirectHref("/register", redirect), label: "注册", icon: UserPlus };
  const primaryLinks: Array<{ href?: string; label: string; icon: LucideIcon; badge?: number; authKind?: AuthPromptKind; onClick?: () => void; description?: string }> = [
    { href: "/membership", label: t("mem_title"), icon: BadgeCheck, description: "高信任发布、优先审核、高级收藏" },
    { href: "/search", label: t("nav_search"), icon: Search },
    user
      ? { href: "/notifications", label: t("nav_notifications"), icon: Bell, badge: unreadNotif }
      : { label: t("nav_notifications"), icon: Bell, authKind: "generic" },
    user
      ? { href: "/messages", label: t("nav_messages"), icon: Mail, badge: unreadMsg }
      : { label: t("nav_messages"), icon: Mail, authKind: "message" },
    { label: "切换城市", icon: MapPin, onClick: openCitySwitcher },
    { label: `切换语言 · ${localeLabel}`, icon: Languages, onClick: switchLanguage },
    user ? { href: "/settings", label: t("nav_settings"), icon: Settings } : { label: t("nav_settings"), icon: Settings, authKind: "generic" },
  ];
  const secondaryLinks: typeof primaryLinks = [
    ...(user ? [{ href: "/me", label: t("nav_profile"), icon: UserIcon }] : [loginItem, registerItem]),
    ...(user ? [{ href: "/bookmarks", label: t("action_bookmark"), icon: Bookmark }] : []),
  ];
  const links = [...primaryLinks];
  if (user?.role === "admin") {
    links.push({ href: "/admin", label: "管理后台", icon: ShieldCheck });
  }
  links.push(...secondaryLinks);

  const promptLogin = (kind: AuthPromptKind) => {
    onClose();
    setTimeout(() => openAuthPrompt(kind), 0);
  };

  if (!mounted || !open) return null;

  const sheet = (
    <>
      <button
        type="button"
        onClick={onClose}
        aria-label="关闭"
        className="fixed inset-0 z-[80] bg-slate-950/45 opacity-100 transition-opacity duration-200 md:hidden"
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="mobile-more-title"
        className="fixed inset-x-0 bottom-0 z-[90] max-h-[70dvh] overflow-y-auto overflow-x-hidden overscroll-contain rounded-t-3xl bg-kx-surface shadow-[0_-20px_60px_-20px_rgba(15,23,42,0.35)] transform-gpu animate-kx-slide-up md:hidden"
        style={{ paddingBottom: "calc(16px + env(safe-area-inset-bottom))" }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 pt-3 pb-2">
          <div className="h-1 w-10 rounded-full bg-kx-stroke/70 mx-auto" />
        </div>
        <div className="flex items-center justify-between px-5 pt-1 pb-3">
          <h2 id="mobile-more-title" className="text-base font-black text-kx-text">更多</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="w-9 h-9 inline-flex items-center justify-center rounded-full hover:bg-kx-soft text-kx-muted"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <nav className="px-3 pb-2">
          <ul>
            {links.map((link) => {
              const hrefPath = link.href?.split("?")[0] ?? "";
              const active = hrefPath && pathname?.startsWith(hrefPath);
              const Icon = link.icon;
              const rowClass = clsx(
                "flex w-full items-center gap-3 rounded-2xl px-3 py-3 font-semibold text-[15px] transition",
                active ? "bg-kx-accentSoft text-kx-accent" : "text-kx-text hover:bg-kx-soft",
              );
              const rowContent = (
                <>
                  <span className="relative inline-flex w-9 h-9 items-center justify-center rounded-full bg-kx-soft text-kx-subtle">
                    <Icon className="w-5 h-5" />
                    {link.badge && link.badge > 0 ? (
                      <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-kx-danger text-white text-[10px] font-bold inline-flex items-center justify-center">
                        {link.badge > 99 ? "99+" : link.badge}
                      </span>
                    ) : null}
                  </span>
                  <span className="min-w-0 flex-1 text-left">
                    <span className="block truncate">{link.label}</span>
                    {link.description ? (
                      <span className="mt-0.5 block truncate text-xs font-semibold text-kx-muted">{link.description}</span>
                    ) : null}
                  </span>
                </>
              );
              return (
                <li key={link.href ?? link.label}>
                  {link.href ? (
                    <Link href={link.href} onClick={onClose} className={rowClass}>
                      {rowContent}
                    </Link>
                  ) : link.onClick ? (
                    <button type="button" onClick={link.onClick} className={rowClass}>
                      {rowContent}
                    </button>
                  ) : (
                    <button type="button" onClick={() => promptLogin(link.authKind ?? "generic")} className={rowClass}>
                      {rowContent}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="border-t border-kx-stroke/40 mt-2 px-3 pt-3 pb-2 space-y-1">
          <button
            type="button"
            onClick={() => {
              setAppearance(appearance === "dark" ? "light" : "dark");
            }}
            className="w-full flex items-center gap-3 rounded-2xl px-3 py-3 text-[15px] font-semibold text-kx-text hover:bg-kx-soft"
          >
            <span className="inline-flex w-9 h-9 items-center justify-center rounded-full bg-kx-soft text-kx-subtle">
              {appearance === "dark" ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </span>
            <span className="flex-1 text-left">{appearance === "dark" ? "浅色模式" : "深色模式"}</span>
          </button>
          {user ? (
            <button
              type="button"
              onClick={onLogout}
              className="w-full flex items-center gap-3 rounded-2xl px-3 py-3 text-[15px] font-semibold text-kx-danger hover:bg-kx-danger/10"
            >
              <span className="inline-flex w-9 h-9 items-center justify-center rounded-full bg-kx-danger/10 text-kx-danger">
                <LogOut className="w-5 h-5" />
              </span>
              <span className="flex-1 text-left">{t("logout")}</span>
            </button>
          ) : null}
        </div>
      </section>
    </>
  );

  return createPortal(sheet, document.body);
}
