"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import clsx from "clsx";
import {
  Bell,
  Bookmark,
  Compass,
  Home,
  LogOut,
  Mail,
  MoreHorizontal,
  PenSquare,
  Search,
  Settings,
  ShieldCheck,
  Sun,
  Moon,
  Newspaper,
  User as UserIcon,
  Hash,
  X,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useCompose, useSession, useSettings, useToasts } from "@/lib/store";
import { Avatar } from "@/components/design/Avatar";
import { Toaster } from "@/components/design/Toaster";
import { Composer } from "@/components/compose/Composer";
import { BrandText } from "@/components/marketing/BrandText";
import { useRealtime } from "@/lib/realtime";
import { useGlobalShortcuts } from "@/lib/keyboard";
import { ErrorBoundary } from "@/components/design/ErrorBoundary";
import { useI18n, type I18nKey } from "@/lib/i18n";

interface AppShellProps {
  children: React.ReactNode;
  right?: React.ReactNode;
}

const NAV_ITEMS = [
  { href: "/home", labelKey: "nav_home" as I18nKey, icon: Home, key: "home", badgeKey: undefined as undefined | "notifications" | "messages" },
  { href: "/explore", labelKey: "nav_explore" as I18nKey, icon: Compass, key: "explore", badgeKey: undefined },
  { href: "/news", labelKey: "nav_news" as I18nKey, icon: Newspaper, key: "news", badgeKey: undefined },
  { href: "/search", labelKey: "nav_search" as I18nKey, icon: Search, key: "search", badgeKey: undefined },
  { href: "/notifications", labelKey: "nav_notifications" as I18nKey, icon: Bell, key: "notifications", badgeKey: "notifications" as const },
  { href: "/messages", labelKey: "nav_messages" as I18nKey, icon: Mail, key: "messages", badgeKey: "messages" as const },
  { href: "/settings", labelKey: "nav_settings" as I18nKey, icon: Settings, key: "settings", badgeKey: undefined },
];

export function AppShell({ children, right }: AppShellProps) {
  const user = useSession((s) => s.user);
  const status = useSession((s) => s.status);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status === "unauthed") {
      const next = pathname && pathname !== "/" && pathname !== "/login" ? `?next=${encodeURIComponent(pathname)}` : "";
      router.replace(`/login${next}`);
    }
  }, [status, router, pathname]);

  useRealtime();
  useGlobalShortcuts();

  if (status === "loading" || status === "idle") {
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
      <div className="mx-auto max-w-kx-shell flex">
        <Sidebar pathname={pathname} user={user} />
        <main className="flex-1 min-w-0 border-x border-kx-stroke/35 lg:max-w-kx-feed bg-kx-bg/35">
          <div className="pb-28 md:pb-8">
            <ErrorBoundary>{children}</ErrorBoundary>
          </div>
        </main>
        <RightSidebar>{right}</RightSidebar>
      </div>
      <MobileTabBar pathname={pathname} />
    </div>
  );
}

function Sidebar({ pathname, user }: { pathname: string; user: import("@/lib/types").KXUser | null }) {
  const compose = useCompose((s) => s.open);
  const appearance = useSettings((s) => s.appearance);
  const setAppearance = useSettings((s) => s.setAppearance);
  const pushToast = useToasts((s) => s.push);
  const setSessionUser = useSession((s) => s.setUser);
  const queryClient = useQueryClient();
  const router = useRouter();

  const { t } = useI18n();
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

  const onLogout = async () => {
    try { await api.logout(); } catch { /* ignore */ }
    setSessionUser(null);
    queryClient.clear();
    pushToast({ kind: "success", message: "已退出登录" });
    router.replace("/login");
  };

  return (
    <aside className="hidden md:flex flex-col gap-1 w-16 lg:w-64 shrink-0 py-3 px-2 lg:px-3 sticky top-0 self-start h-dvh">
      <Link href="/home" className="px-3 py-3 inline-flex items-center gap-2 text-kx-text">
        <span className="w-9 h-9 rounded-kx-md bg-kx-accent text-white inline-flex items-center justify-center font-bold text-lg">
          M
        </span>
        <BrandText className="hidden text-base font-black lg:inline">Machi</BrandText>
      </Link>
      <nav className="flex flex-col gap-0.5 mt-1">
        {NAV_ITEMS.map((item) => {
          const active = pathname?.startsWith(item.href);
          const Icon = item.icon;
          const badge = item.badgeKey ? badges[item.badgeKey] : 0;
          return (
            <Link
              key={item.key}
              href={item.href}
              className={clsx(
                "flex items-center gap-3 px-3 py-2.5 rounded-full font-semibold text-base transition relative",
                "hover:bg-kx-soft",
                active && "bg-kx-accentSoft text-kx-accent",
              )}
            >
              <span className="relative">
                <Icon className="w-5 h-5" />
                {badge > 0 ? (
                  <span className="absolute -top-1.5 -right-2 min-w-4 h-4 px-1 rounded-full bg-kx-danger text-white text-[10px] font-bold inline-flex items-center justify-center">
                    {badge > 99 ? "99+" : badge}
                  </span>
                ) : null}
              </span>
              <span className="hidden lg:inline">{t(item.labelKey)}</span>
            </Link>
          );
        })}
        {user?.role === "admin" ? (
          <Link
            href="/admin"
            className={clsx(
              "flex items-center gap-3 px-3 py-2.5 rounded-full font-semibold text-base transition relative hover:bg-kx-soft",
              pathname?.startsWith("/admin") && "bg-kx-accentSoft text-kx-accent",
            )}
          >
            <ShieldCheck className="w-5 h-5" />
            <span className="hidden lg:inline">后台</span>
          </Link>
        ) : null}
      </nav>
      <button onClick={() => compose()} className="kx-button-primary mt-3 h-11 px-4 text-base">
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
        ) : null}
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
  const user = useSession((s) => s.user);
  const { t } = useI18n();
  const [moreOpen, setMoreOpen] = useState(false);

  // Close the More sheet whenever we navigate away from any route.
  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  // Disable background scroll while the More sheet is open.
  useEffect(() => {
    if (!moreOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [moreOpen]);

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

  // 5 slots: Home / Explore / [Compose] / Notifications / More
  // "More" opens a sheet with Search / Messages / Bookmarks / Settings / Profile / Logout etc.
  const items = [
    { kind: "link" as const, href: "/home", label: t("nav_home"), icon: Home, badge: 0 },
    { kind: "link" as const, href: "/explore", label: t("nav_explore"), icon: Compass, badge: 0 },
    { kind: "compose" as const },
    { kind: "link" as const, href: "/notifications", label: t("nav_notifications"), icon: Bell, badge: unreadNotif },
    { kind: "more" as const, label: "更多", icon: MoreHorizontal, badge: unreadMsg },
  ];

  return (
    <>
      <nav
        className="kx-glass-capsule md:hidden fixed left-1/2 z-40 w-[min(calc(100vw-4.5rem),22rem)] -translate-x-1/2 px-1 py-0.5 shadow-[0_16px_34px_-24px_rgba(15,23,42,0.46)]"
        style={{ bottom: "max(0.45rem, env(safe-area-inset-bottom))" }}
      >
        <ul className="flex h-[3.3rem] items-stretch justify-between gap-0 px-0">
          {items.map((item, idx) => {
            if (item.kind === "compose") {
              return (
                <li key={`compose-${idx}`} className="flex items-center justify-center w-1/5">
                  <button
                    className="relative flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border border-kx-accent/35 bg-kx-accent text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.5),0_10px_22px_-16px_rgba(37,99,235,0.62)] active:scale-95 transition"
                    onClick={() => compose()}
                    aria-label="投稿"
                  >
                    <PenSquare className="h-[18px] w-[18px]" />
                  </button>
                </li>
              );
            }
            if (item.kind === "more") {
              const Icon = item.icon;
              return (
                <li key="more" className="flex-1">
                  <button
                    type="button"
                    onClick={() => setMoreOpen(true)}
                    aria-label={item.label}
                    aria-expanded={moreOpen}
                    className={clsx(
                      "flex h-full w-full flex-col items-center justify-center gap-0 text-[10px] font-semibold relative active:scale-[0.97] transition",
                      moreOpen ? "text-kx-accent" : "text-kx-text",
                    )}
                  >
                    <span
                      data-active={moreOpen ? "true" : "false"}
                      className="kx-liquid-button relative inline-flex h-7 min-w-7 items-center justify-center px-1.5"
                    >
                      <Icon className="h-[18px] w-[18px]" />
                      {item.badge > 0 ? (
                        <span className="absolute -top-1.5 -right-2 min-w-4 h-4 px-1 rounded-full bg-kx-danger text-white text-[10px] font-bold inline-flex items-center justify-center">
                          {item.badge > 99 ? "99+" : item.badge}
                        </span>
                      ) : null}
                    </span>
                    <span>{item.label}</span>
                  </button>
                </li>
              );
            }
            const active = pathname?.startsWith(item.href);
            const Icon = item.icon;
            return (
              <li key={item.href} className="flex-1">
                <Link
                  href={item.href}
                  className={clsx(
                    "flex h-full flex-col items-center justify-center gap-0 text-[10px] font-semibold relative active:scale-[0.97] transition",
                    active ? "text-kx-accent" : "text-kx-text",
                  )}
                >
                  <span
                    data-active={active ? "true" : "false"}
                    className="kx-liquid-button relative inline-flex h-7 min-w-7 items-center justify-center px-1.5"
                  >
                    <Icon className="h-[18px] w-[18px]" />
                    {item.badge > 0 ? (
                      <span className="absolute -top-1.5 -right-2 min-w-4 h-4 px-1 rounded-full bg-kx-danger text-white text-[10px] font-bold inline-flex items-center justify-center">
                        {item.badge > 99 ? "99+" : item.badge}
                      </span>
                    ) : null}
                  </span>
                  <span>{item.label}</span>
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
  unreadMsg,
  pathname,
  t,
}: {
  open: boolean;
  onClose: () => void;
  user: import("@/lib/types").KXUser | null;
  unreadMsg: number;
  pathname: string;
  t: (key: I18nKey) => string;
}) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const setSessionUser = useSession((s) => s.setUser);
  const pushToast = useToasts((s) => s.push);
  const appearance = useSettings((s) => s.appearance);
  const setAppearance = useSettings((s) => s.setAppearance);

  const onLogout = async () => {
    try { await api.logout(); } catch { /* ignore */ }
    setSessionUser(null);
    queryClient.clear();
    pushToast({ kind: "success", message: "已退出登录" });
    onClose();
    router.replace("/login");
  };

  const links: Array<{ href: string; label: string; icon: typeof Search; badge?: number }> = [
    { href: "/search", label: t("nav_search"), icon: Search },
    { href: "/messages", label: t("nav_messages"), icon: Mail, badge: unreadMsg },
    { href: "/bookmarks", label: t("action_bookmark"), icon: Bookmark },
    { href: "/me", label: t("nav_profile"), icon: UserIcon },
    { href: "/settings", label: t("nav_settings"), icon: Settings },
  ];
  if (user?.role === "admin") {
    links.push({ href: "/admin", label: "管理后台", icon: ShieldCheck });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-hidden={!open}
      className={clsx(
        "md:hidden fixed inset-0 z-50 transition-opacity duration-200",
        open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
      )}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="关闭"
        className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm"
      />
      <div
        className={clsx(
          "absolute inset-x-0 bottom-0 rounded-t-3xl bg-kx-surface shadow-[0_-20px_60px_-20px_rgba(15,23,42,0.35)]",
          "transform-gpu transition-transform duration-[260ms] ease-out",
          open ? "translate-y-0" : "translate-y-full",
        )}
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 12px)" }}
      >
        <div className="flex items-center justify-between px-4 pt-3 pb-2">
          <div className="h-1 w-10 rounded-full bg-kx-stroke/70 mx-auto" />
        </div>
        <div className="flex items-center justify-between px-5 pt-1 pb-3">
          <h2 className="text-base font-black text-kx-text">更多</h2>
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
              const active = pathname?.startsWith(link.href);
              const Icon = link.icon;
              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    onClick={onClose}
                    className={clsx(
                      "flex items-center gap-3 rounded-2xl px-3 py-3 font-semibold text-[15px] transition",
                      active ? "bg-kx-accentSoft text-kx-accent" : "text-kx-text hover:bg-kx-soft",
                    )}
                  >
                    <span className="relative inline-flex w-9 h-9 items-center justify-center rounded-full bg-kx-soft text-kx-subtle">
                      <Icon className="w-5 h-5" />
                      {link.badge && link.badge > 0 ? (
                        <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-kx-danger text-white text-[10px] font-bold inline-flex items-center justify-center">
                          {link.badge > 99 ? "99+" : link.badge}
                        </span>
                      ) : null}
                    </span>
                    <span className="flex-1">{link.label}</span>
                  </Link>
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
      </div>
    </div>
  );
}
