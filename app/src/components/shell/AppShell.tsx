"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";
import { ConfirmDialog } from "@/components/design/Dialog";
import {
  Bell,
  BadgeCheck,
  Bookmark,
  Compass,
  Home,
  LayoutDashboard,
  LogIn,
  LogOut,
  Mail,
  MoreHorizontal,
  PenSquare,
  Settings,
  ShieldCheck,
  Sun,
  Moon,
  GraduationCap,
  UserPlus,
  User as UserIcon,
  Hash,
  Plus,
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
import { useI18n, type I18nKey } from "@/lib/i18n";
import type { KXUser } from "@/lib/types";

interface AppShellProps {
  children: React.ReactNode;
  right?: React.ReactNode;
  requireAuth?: boolean;
  wide?: boolean;
  /** Hide the floating mobile tab bar + compose button (for detail pages
   *  that own the bottom with their own action bar, e.g. listing contact). */
  hideBottomNav?: boolean;
}

const NAV_ITEMS = [
  { href: "/home", labelKey: "nav_home" as I18nKey, icon: Home, key: "home", badgeKey: undefined as undefined | "notifications" | "messages" },
  { href: "/explore", labelKey: "nav_explore" as I18nKey, icon: Compass, key: "explore", badgeKey: undefined },
  { href: "/guide", labelKey: "nav_guide" as I18nKey, icon: GraduationCap, key: "guide", badgeKey: undefined },
  { href: "/membership", labelKey: "mem_title" as I18nKey, icon: BadgeCheck, key: "membership", badgeKey: undefined },
  { href: "/my/features", labelKey: "nav_workbench" as I18nKey, icon: LayoutDashboard, key: "features", badgeKey: undefined },
  { href: "/notifications", labelKey: "nav_notifications" as I18nKey, icon: Bell, key: "notifications", badgeKey: "notifications" as const },
  { href: "/messages", labelKey: "nav_messages" as I18nKey, icon: Mail, key: "messages", badgeKey: "messages" as const },
  { href: "/settings", labelKey: "nav_settings" as I18nKey, icon: Settings, key: "settings", badgeKey: undefined },
];

const AUTH_REQUIRED_NAV = new Set(["notifications", "messages", "settings", "features"]);

function currentPathForRedirect(pathname: string | null) {
  return pathname || "/home";
}

function currentBrowserPathForRedirect(pathname: string | null) {
  if (typeof window === "undefined") return pathname || "/home";
  const candidate = `${window.location.pathname}${window.location.search}`;
  return candidate.startsWith("/") && !candidate.startsWith("//") ? candidate : pathname || "/home";
}

export function AppShell({ children, right, requireAuth = true, wide = false, hideBottomNav = false }: AppShellProps) {
  const user = useSession((s) => s.user);
  const status = useSession((s) => s.status);
  const router = useRouter();
  const pathname = usePathname();
  const ownsViewportBottom = pathname?.startsWith("/messages/");
  const [redirectPath, setRedirectPath] = useState(() => currentPathForRedirect(pathname));

  useEffect(() => {
    if (requireAuth && status === "unauthed") {
      const redirect = currentBrowserPathForRedirect(pathname);
      const next = redirect !== "/" && redirect !== "/login" ? `?redirect=${encodeURIComponent(redirect)}` : "";
      router.replace(`/login${next}`);
    }
  }, [status, router, pathname, requireAuth]);

  useEffect(() => {
    setRedirectPath(currentBrowserPathForRedirect(pathname));
  }, [pathname]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const root = document.documentElement;
    const viewport = window.visualViewport;
    const syncViewport = () => {
      const height = viewport?.height ?? window.innerHeight;
      const offsetTop = viewport?.offsetTop ?? 0;
      const keyboardInset = viewport
        ? Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)
        : 0;
      root.style.setProperty("--kx-visual-viewport-height", `${Math.round(height)}px`);
      root.style.setProperty("--kx-visual-viewport-offset-top", `${Math.round(offsetTop)}px`);
      root.style.setProperty("--kx-keyboard-inset", `${Math.round(keyboardInset)}px`);
    };
    syncViewport();
    viewport?.addEventListener("resize", syncViewport);
    viewport?.addEventListener("scroll", syncViewport);
    window.addEventListener("resize", syncViewport);
    window.addEventListener("orientationchange", syncViewport);
    return () => {
      viewport?.removeEventListener("resize", syncViewport);
      viewport?.removeEventListener("scroll", syncViewport);
      window.removeEventListener("resize", syncViewport);
      window.removeEventListener("orientationchange", syncViewport);
    };
  }, []);

  useRealtime();
  useGlobalShortcuts();

  const waitingForAuth = status === "loading" || status === "idle";
  if (requireAuth && (waitingForAuth || status === "unauthed")) {
    return (
      <div className="min-h-dvh flex items-center justify-center text-kx-muted">
        <span className="kx-skeleton w-32 h-4" />
      </div>
    );
  }

  return (
    <div className="kx-app-shell min-h-dvh">
      <div className="kx-grain" aria-hidden="true" />
      <Toaster />
      <Composer />
      <AuthRequiredDialog />
      <div className="relative z-[1] mx-auto flex w-full max-w-kx-shell">
        <Sidebar pathname={pathname} redirectPath={redirectPath} user={user} />
        <main className={clsx("kx-shell-main flex-1 min-w-0 border-x border-kx-stroke/35", wide ? "lg:max-w-none" : "lg:max-w-kx-feed")}>
          <div className={clsx("kx-page-enter", ownsViewportBottom ? "pb-0" : "pb-36 md:pb-8")}>
            <ErrorBoundary>{children}</ErrorBoundary>
          </div>
        </main>
        {right === null ? null : <RightSidebar>{right}</RightSidebar>}
      </div>
      {!hideBottomNav ? <MobileTabBar pathname={pathname} redirectPath={redirectPath} /> : null}
    </div>
  );
}

function Sidebar({ pathname, redirectPath, user }: { pathname: string; redirectPath: string; user: KXUser | null }) {
  const compose = useCompose((s) => s.open);
  const openAuthPrompt = useAuthPrompt((s) => s.open);
  const appearance = useSettings((s) => s.appearance);
  const setAppearance = useSettings((s) => s.setAppearance);
  const pushToast = useToasts((s) => s.push);
  const setSessionUser = useSession((s) => s.setUser);
  const queryClient = useQueryClient();
  const router = useRouter();

  const { t } = useI18n();
  const redirect = redirectPath;
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
  const siteSettings = useQuery({
    queryKey: ["site-settings"],
    queryFn: () => api.siteSettings(),
    staleTime: 300_000,
  });
  const badges = {
    notifications: notif.data?.unread_count ?? 0,
    messages: (conv.data || []).reduce((sum, c) => sum + (c.unread_count || 0), 0),
  };
  const brandTitle = siteSettings.data?.site_title || "Machi";
  const logoUrl = siteSettings.data?.logo_url || "";
  const listingPublishHref = cityListingPublishHref(pathname) || (isListingWorkspacePath(pathname) ? "/listings/create" : "");

  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const onLogout = async () => {
    try { await api.logout(); } catch { /* ignore */ }
    setSessionUser(null);
    queryClient.clear();
    pushToast({ kind: "success", message: t("logged_out") });
    router.replace("/login");
  };

  return (
    <aside className="hidden md:flex flex-col gap-1 w-16 lg:w-64 shrink-0 py-3 px-2 lg:px-3 sticky top-0 self-start h-dvh">
      <Link href="/home" className="px-3 py-3 inline-flex items-center gap-2 text-kx-text">
        <span className="w-9 h-9 overflow-hidden rounded-kx-md bg-kx-accent text-white inline-flex items-center justify-center font-bold text-lg">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            "M"
          )}
        </span>
        <BrandText className="hidden text-base font-black lg:inline">{brandTitle}</BrandText>
      </Link>
      <nav className="flex flex-col gap-0.5 mt-1">
        {NAV_ITEMS.map((item) => {
          const active = pathname?.startsWith(item.href);
          const Icon = item.icon;
          const badge = item.badgeKey ? badges[item.badgeKey] : 0;
          const requiresLogin = AUTH_REQUIRED_NAV.has(item.key);
          const content = (
            <>
              <span className="relative">
                <Icon className="w-5 h-5" fill="none" strokeWidth={active ? 2.05 : 1.5} />
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
            "kx-sidebar-nav-item flex items-center gap-3 px-3 py-2.5 rounded-full text-base transition relative",
            active ? "font-semibold text-kx-accent" : "font-medium text-kx-subtle hover:text-kx-accent hover:font-semibold",
          );
          if (!user && requiresLogin) {
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => openAuthPrompt(item.key === "messages" ? "message" : "generic")}
                data-active={active}
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
              data-active={active}
              className={itemClass}
            >
              {content}
            </Link>
          );
        })}
        {user?.role === "admin" ? (
          <Link
            href="/admin"
            data-active={pathname?.startsWith("/admin")}
            className={clsx(
              "kx-sidebar-nav-item flex items-center gap-3 px-3 py-2.5 rounded-full text-base transition relative",
              pathname?.startsWith("/admin")
                ? "font-semibold text-kx-accent"
                : "font-medium text-kx-subtle hover:text-kx-accent hover:font-semibold",
            )}
          >
            <ShieldCheck className="w-5 h-5" fill="none" strokeWidth={pathname?.startsWith("/admin") ? 2.05 : 1.5} />
            <span className="hidden lg:inline">{t("nav_admin")}</span>
          </Link>
        ) : null}
      </nav>
      {listingPublishHref ? (
        <Link href={listingPublishHref} className="kx-button-primary mt-3 h-11 px-4 text-base">
          <Plus className="w-3.5 h-3.5" />
          <span className="hidden lg:inline">{t("listing_publish_info")}</span>
        </Link>
      ) : (
        <button onClick={() => (user ? compose() : openAuthPrompt("publish"))} className="kx-button-primary mt-3 h-11 px-4 text-base">
          <PenSquare className="w-3.5 h-3.5" />
          <span className="hidden lg:inline">{t("action_compose")}</span>
        </button>
      )}

      <div className="mt-auto flex flex-col gap-1">
        <button
          onClick={() => setAppearance(appearance === "dark" ? "light" : "dark")}
          className="flex items-center gap-2 px-3 py-2 rounded-full hover:bg-kx-soft text-sm text-kx-subtle"
          aria-label={t("settings_appearance")}
        >
          {appearance === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          <span className="hidden lg:inline">{appearance === "dark" ? t("settings_appearance_light") : t("settings_appearance_dark")}</span>
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
              aria-label={t("nav_profile")}
            >
              <Avatar user={user} size={36} />
              <div className="hidden min-w-0 flex-1 flex-col lg:flex">
                <span className="truncate text-sm font-semibold">{user.display_name}</span>
                <span className="truncate text-xs text-kx-muted">@{user.handle}</span>
              </div>
            </Link>
            <button
              onClick={() => setLogoutConfirmOpen(true)}
              className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-full text-kx-muted transition hover:bg-kx-soft hover:text-kx-text lg:inline-flex"
              aria-label={t("logout")}
              title={t("logout")}
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
              <span className="hidden lg:inline">{t("login")}</span>
            </Link>
            <Link
              href={authRedirectHref("/register", redirect)}
              className="flex items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold text-kx-accent hover:bg-kx-accentSoft"
            >
              <UserPlus className="h-4 w-4" />
              <span className="hidden lg:inline">{t("register")}</span>
            </Link>
          </div>
        )}
      </div>
      <ConfirmDialog
        open={logoutConfirmOpen}
        title="确认退出登录？"
        description="退出后需要重新输入用户名和密码登录。"
        confirmLabel="退出"
        destructive
        onConfirm={onLogout}
        onCancel={() => setLogoutConfirmOpen(false)}
      />
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
  const { t } = useI18n();
  const trending = useQuery({
    queryKey: ["trending"],
    queryFn: () => api.trending(),
    staleTime: 60_000,
  });
  if (trending.isLoading && !trending.data) {
    return (
      <div className="space-y-3">
        <div className="kx-card h-32 kx-skeleton" />
        <div className="kx-card h-48 kx-skeleton" />
      </div>
    );
  }
  if (trending.isError && !trending.data) {
    return (
      <section className="kx-card">
        <h3 className="kx-section-title mb-2 px-0 text-kx-text">{t("whats_happening")}</h3>
        <p className="text-sm leading-6 text-kx-muted">{t("error_default")}</p>
        <button type="button" onClick={() => trending.refetch()} className="kx-button-ghost mt-3 h-9 text-xs">
          {t("action_retry")}
        </button>
      </section>
    );
  }
  if (!trending.data) return null;
  return (
    <>
      {/* Topics — ranked, numbered, denser. Replaces the old plain
          bullet list which read as "secondary clutter" on PC. */}
      {trending.data.topics.length > 0 ? (
        <section className="kx-card">
          <div className="flex items-center justify-between mb-3">
            <h3 className="kx-section-title px-0 inline-flex items-center gap-1.5 text-kx-text">
              <Hash className="w-4 h-4 text-kx-accent" /> {t("search_topics")}
            </h3>
            <Link href="/search?kind=topic" className="text-xs text-kx-muted hover:text-kx-accent">{t("view_more")}</Link>
          </div>
          <ul className="flex flex-col">
            {trending.data.topics.slice(0, 8).map((topic, idx) => (
              <li key={topic.tag} className="border-b border-kx-stroke/40 last:border-0">
                <Link
                  href={`/t/${encodeURIComponent(topic.tag)}`}
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
                    #{topic.tag}
                  </span>
                  <span className="text-kx-muted text-xs shrink-0">{topic.post_count} {t("search_topic_post_suffix")}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {trending.data.users.length > 0 ? (
        <section className="kx-card">
          <h3 className="kx-section-title mb-3 px-0 text-kx-text">{t("recommend_users")}</h3>
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
      ) : null}
    </>
  );
}

function MobileTabBar({ pathname, redirectPath }: { pathname: string; redirectPath: string }) {
  // Routes that own the full bottom of the viewport — conversation,
  // post detail with comment box, compose flows. Hiding the TabBar
  // there avoids covering the page's own input bar.
  const hideOn = ["/messages/", "/admin"];
  const hidden = hideOn.some((p) => pathname?.startsWith(p)) || isListingChannelPath(pathname) || isListingWorkspacePath(pathname);
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
  const listingPublishHref = cityListingPublishHref(pathname);
  const hideFloatingCompose = pathname?.startsWith("/messages") || isListingWorkspacePath(pathname);
  const openPublish = () => {
    setMoreOpen(false);
    if (!user) {
      openAuthPrompt("publish");
      return;
    }
    compose({ initialContentType: null });
  };
  const closeMore = () => setMoreOpen(false);

  // 5 slots for the mobile app shell: Home / Discover / News /
  // Messages / Mine. Publishing is a floating plus above the tab bar,
  // matching the iOS interaction without stealing a top-level tab.
  const items = [
    { kind: "link" as const, href: "/home", label: t("nav_home"), icon: Home, badge: 0 },
    { kind: "link" as const, href: "/explore", label: t("nav_explore"), icon: Compass, badge: 0 },
    { kind: "link" as const, href: "/guide", label: t("nav_guide"), icon: GraduationCap, badge: 0 },
    { kind: "messages" as const, href: "/messages", label: t("nav_messages"), icon: Mail, badge: unreadMsg },
    { kind: "mine" as const, label: t("nav_profile"), icon: user ? UserIcon : MoreHorizontal, badge: unreadNotif },
  ];
  const activeTab = getMobileActiveTab(pathname);
  const showFloatingCompose = !!listingPublishHref || !hideFloatingCompose;

  return (
    <>
      {listingPublishHref ? (
        <Link
          href={listingPublishHref}
          className="kx-mobile-floating-compose md:hidden"
          aria-label={t("listing_publish_info")}
          title={t("listing_publish_info")}
        >
          <Plus className="h-6 w-6" strokeWidth={2.2} />
        </Link>
      ) : showFloatingCompose ? (
        <button
          type="button"
          className="kx-mobile-floating-compose md:hidden"
          onClick={openPublish}
          aria-label={t("action_compose")}
          title={t("action_compose")}
        >
          <Plus className="h-6 w-6" strokeWidth={2.2} />
        </button>
      ) : null}
      <nav
        className="kx-mobile-tabbar md:hidden px-2 py-2"
        style={{ bottom: "max(1.1rem, calc(env(safe-area-inset-bottom) + 0.35rem))" }}
      >
        <ul className="relative z-[1] flex h-12 items-center justify-between">
          {items.map((item) => {
            const active =
              item.kind === "mine"
                ? activeTab === "mine"
                : item.kind === "messages"
                  ? activeTab === "messages"
                  : activeTab === item.href.slice(1);
            const Icon = item.icon;
            const badge = item.badge;
            const navClass = "kx-mobile-tabbar-item";
            const iconInner = (
              <span className="kx-mobile-tabbar-icon">
                <Icon
                  className="h-6 w-6"
                  fill="none"
                  strokeWidth={active ? 2.1 : 1.5}
                />
                {badge > 0 ? (
                  <span className="absolute -top-2 -right-2 min-w-4 h-4 px-1 rounded-full bg-kx-danger text-white text-[10px] font-bold inline-flex items-center justify-center shadow-sm">
                    {badge > 99 ? "99+" : badge}
                  </span>
                ) : null}
              </span>
            );
            if (item.kind === "mine") {
              return (
                <li key="mine" className="flex flex-1 items-center justify-center">
                  <button type="button" onClick={() => setMoreOpen(true)} aria-label={item.label} title={item.label} aria-expanded={moreOpen} data-active={active} className={navClass}>
                    {iconInner}
                  </button>
                </li>
              );
            }
            if (item.kind === "messages" && !user) {
              return (
                <li key={item.href} className="flex flex-1 items-center justify-center">
                  <button type="button" onClick={() => { closeMore(); openAuthPrompt("message"); }} aria-label={item.label} title={item.label} data-active={active} className={navClass}>
                    {iconInner}
                  </button>
                </li>
              );
            }
            return (
              <li key={item.href} className="flex flex-1 items-center justify-center">
                <Link href={item.href} aria-label={item.label} title={item.label} data-active={active} className={navClass} onClick={closeMore}>
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
        pathname={pathname}
        redirectPath={redirectPath}
        t={t}
      />
    </>
  );
}

function getMobileActiveTab(pathname?: string | null) {
  const path = pathname || "/home";
  if (path.startsWith("/messages")) return "messages";
  if (path.startsWith("/explore")) return "explore";
  if (path.startsWith("/guide")) return "guide";
  if (
    path.startsWith("/me") ||
    path.startsWith("/settings") ||
    path.startsWith("/membership") ||
    path.startsWith("/bookmarks") ||
    path.startsWith("/notifications") ||
    path.startsWith("/admin")
  ) {
    return "mine";
  }
  return "home";
}

function cityListingPublishHref(pathname?: string | null) {
  if (!pathname) return "";
  const match = pathname.match(/^\/cities\/([^/]+)\/(marketplace|rentals|jobs|services|deals|discounts)\/?$/);
  if (!match) return "";
  const city = encodeURIComponent(match[1]);
  const section = match[2];
  const type = section === "marketplace"
    ? "secondhand"
    : section === "rentals"
      ? "rental"
      : section === "jobs"
        ? "job"
        : section === "services"
          ? "local_service"
          : "discount";
  return `/listings/create?type=${type}&city=${city}`;
}

function isListingChannelPath(pathname?: string | null) {
  if (!pathname) return false;
  return /^\/cities\/[^/]+\/(marketplace|rentals|jobs|services|deals|discounts)\/?$/.test(pathname);
}

function isListingWorkspacePath(pathname?: string | null) {
  if (!pathname) return false;
  return (
    pathname.startsWith("/listings") ||
    pathname.startsWith("/marketplace/create") ||
    pathname.startsWith("/rentals/create") ||
    pathname.startsWith("/jobs/create") ||
    pathname.startsWith("/my/listings") ||
    pathname.startsWith("/my/saved-listings") ||
    pathname.startsWith("/my/favorites") ||
    /^\/cities\/[^/]+\/(marketplace|rentals|jobs|services|deals|discounts)\/[^/]+/.test(pathname)
  );
}

function MobileMoreSheet({
  open,
  onClose,
  user,
  unreadNotif,
  pathname,
  redirectPath,
  t,
}: {
  open: boolean;
  onClose: () => void;
  user: KXUser | null;
  unreadNotif: number;
  pathname: string;
  redirectPath: string;
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

  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const onLogout = async () => {
    try { await api.logout(); } catch { /* ignore */ }
    setSessionUser(null);
    queryClient.clear();
    pushToast({ kind: "success", message: t("logged_out") });
    onClose();
    router.replace("/login");
  };

  const redirect = redirectPath;
  const loginItem = { href: authRedirectHref("/login", redirect), label: t("login"), icon: LogIn };
  const registerItem = { href: authRedirectHref("/register", redirect), label: t("register"), icon: UserPlus };
  const links: Array<{ href?: string; label: string; icon: LucideIcon; badge?: number; authKind?: AuthPromptKind }> = user
    ? [
        { href: "/me", label: t("nav_profile"), icon: UserIcon },
        { href: "/membership/exclusive", label: t("mem_exclusive"), icon: BadgeCheck },
        { href: "/bookmarks", label: t("action_bookmark"), icon: Bookmark },
        { href: "/notifications", label: t("nav_notifications"), icon: Bell, badge: unreadNotif },
        { href: "/settings", label: t("nav_settings"), icon: Settings },
        { href: "/my/features", label: t("nav_workbench"), icon: LayoutDashboard },
      ]
    : [
        loginItem,
        registerItem,
        { label: t("nav_workbench"), icon: LayoutDashboard, authKind: "generic" },
        { label: t("action_bookmark"), icon: Bookmark, authKind: "bookmark" },
        { label: t("nav_notifications"), icon: Bell, authKind: "generic" },
        { label: t("nav_settings"), icon: Settings, authKind: "generic" },
      ];
  if (user?.role === "admin") {
    links.push({ href: "/admin", label: t("nav_admin"), icon: ShieldCheck });
  }

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
        aria-label={t("action_cancel")}
        className="fixed inset-0 z-[80] bg-slate-950/45 opacity-100 transition-opacity duration-200 md:hidden"
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="mobile-more-title"
        className="fixed inset-x-0 bottom-0 z-[90] max-h-[80dvh] overflow-y-auto overflow-x-hidden overscroll-contain rounded-t-3xl bg-kx-surface shadow-[0_-20px_60px_-20px_rgba(15,23,42,0.35)] transform-gpu animate-kx-slide-up md:hidden"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 12px)" }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 pt-3 pb-2">
          <div className="h-1 w-10 rounded-full bg-kx-stroke/70 mx-auto" />
        </div>
        <div className="flex items-center justify-between px-5 pt-1 pb-3">
          <h2 id="mobile-more-title" className="text-base font-black text-kx-text">{t("more_menu")}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("action_cancel")}
            className="w-9 h-9 inline-flex items-center justify-center rounded-full hover:bg-kx-soft text-kx-muted"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <Link
          href="/membership"
          onClick={onClose}
          className={clsx(
            "mx-3 mb-2 flex items-center gap-3 rounded-3xl border p-3 transition",
            pathname?.startsWith("/membership")
              ? "border-kx-accent/25 bg-kx-accentSoft text-kx-accent"
              : "border-kx-stroke/60 bg-kx-card hover:border-kx-accent/25 hover:bg-kx-accentSoft/70",
          )}
        >
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-kx-accent text-white shadow-[0_12px_30px_rgba(37,99,235,0.24)]">
            <BadgeCheck className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-black text-kx-text">{t("mem_title")}</span>
            <span className="mt-0.5 block truncate text-xs font-semibold text-kx-muted">{t("mem_mobile_summary")}</span>
          </span>
          <span className="shrink-0 rounded-full bg-kx-accent/10 px-2.5 py-1 text-xs font-black text-kx-accent">
            {user?.is_verified_member ? t("mem_status_active") : t("mem_view_plans")}
          </span>
        </Link>
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
                  <span className="flex-1 text-left">{link.label}</span>
                </>
              );
              return (
                <li key={link.href ?? link.label}>
                  {link.href ? (
                    <Link href={link.href} onClick={onClose} className={rowClass}>
                      {rowContent}
                    </Link>
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
            <span className="flex-1 text-left">{appearance === "dark" ? t("settings_appearance_light") : t("settings_appearance_dark")}</span>
          </button>
          {user ? (
            <button
              type="button"
              onClick={() => setLogoutConfirmOpen(true)}
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
      <ConfirmDialog
        open={logoutConfirmOpen}
        title="确认退出登录？"
        description="退出后需要重新输入用户名和密码登录。"
        confirmLabel="退出"
        destructive
        onConfirm={onLogout}
        onCancel={() => setLogoutConfirmOpen(false)}
      />
    </>
  );

  return createPortal(sheet, document.body);
}
