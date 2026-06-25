"use client";

// "我的资料 / 我的服务 / 我的订单" — the unified purchase-after center. Reads
// GET /api/guide/my-library (owned + member-unlocked materials, the user's
// service requests, and a merged order history). No paid content is shown here;
// each material links to its product page, which gates the actual download.

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { BadgeCheck, Coins, Download, FileText, Lock, Wrench } from "lucide-react";
import { guide } from "@/lib/guide";
import { GuideShell } from "@/components/guide/GuideKit";
import { InlineLoading, ErrorState } from "@/components/design/States";
import { useSession, useAuthPrompt } from "@/lib/store";
import { formatPrice } from "@/lib/format";
import { useI18n, appLocaleToGuideLanguage } from "@/lib/i18n";

type Tab = "materials" | "services" | "orders";

export default function MyLibraryPage() {
  const user = useSession((s) => s.user);
  const openAuthPrompt = useAuthPrompt((s) => s.open);
  const { locale } = useI18n();
  const tt = (zh: string, en: string, ja: string) => (locale === "en" ? en : locale === "ja" ? ja : zh);
  const [tab, setTab] = useState<Tab>("materials");

  const q = useQuery({
    queryKey: ["guide", "my-library", user?.id || "anon"],
    queryFn: () => guide.myLibrary(appLocaleToGuideLanguage(locale)),
    enabled: !!user,
    staleTime: 15_000,
  });

  const back = { href: "/guide", label: tt("Guide", "Guide", "Guide") };

  if (!user) {
    return (
      <GuideShell back={back}>
        <div className="px-4 py-10 text-center">
          <p className="text-kx-subtle">{tt("登录后查看你购买的资料、预约的服务和订单。", "Sign in to see your materials, services and orders.", "ログインすると、購入した資料・予約・注文を確認できます。")}</p>
          <button type="button" onClick={() => openAuthPrompt("generic")} className="kx-button-primary mx-auto mt-3 justify-center">
            {tt("登录 / 注册", "Log in / Sign up", "ログイン / 登録")}
          </button>
        </div>
      </GuideShell>
    );
  }

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "materials", label: tt("我的资料", "Materials", "資料"), count: q.data?.materials.length ?? 0 },
    { key: "services", label: tt("我的服务", "Services", "サービス"), count: q.data?.services.length ?? 0 },
    { key: "orders", label: tt("我的订单", "Orders", "注文"), count: q.data?.orders.length ?? 0 },
  ];

  return (
    <GuideShell back={back}>
      <div className="px-4 py-4 sm:px-6">
        <h1 className="mb-3 text-xl font-black text-kx-text">{tt("我的资料库", "My library", "マイライブラリ")}</h1>

        <div className="mb-4 flex gap-1 rounded-kx-lg border border-kx-stroke/50 bg-kx-card p-1">
          {tabs.map((tb) => (
            <button
              key={tb.key}
              type="button"
              onClick={() => setTab(tb.key)}
              className={`flex-1 rounded-lg px-3 py-2 text-sm font-bold transition ${tab === tb.key ? "bg-kx-accent text-white" : "text-kx-subtle hover:bg-kx-soft"}`}
            >
              {tb.label}{tb.count > 0 ? ` (${tb.count})` : ""}
            </button>
          ))}
        </div>

        {q.isLoading ? (
          <InlineLoading />
        ) : q.isError ? (
          <ErrorState
            title={tt("加载失败", "Couldn't load", "読み込み失敗")}
            subtitle={tt("请稍后重试。", "Please try again.", "後ほどお試しください。")}
            onRetry={() => q.refetch()}
          />
        ) : tab === "materials" ? (
          <MaterialsTab data={q.data?.materials ?? []} tt={tt} />
        ) : tab === "services" ? (
          <ServicesTab data={q.data?.services ?? []} tt={tt} />
        ) : (
          <OrdersTab data={q.data?.orders ?? []} tt={tt} />
        )}

        <p className="mt-4 rounded-kx-lg border border-kx-stroke/50 bg-kx-card p-3 text-xs text-kx-muted">
          {tt("下载失败或需要退款/售后,请前往设置中的反馈与客服。", "For download issues, refunds or support, use Feedback in Settings.", "ダウンロードの不具合・返金・サポートは設定のフィードバックからご連絡ください。")}
        </p>
      </div>
    </GuideShell>
  );
}

type TT = (zh: string, en: string, ja: string) => string;

function MaterialsTab({ data, tt }: { data: import("@/lib/guide").GuideLibraryMaterial[]; tt: TT }) {
  if (data.length === 0) {
    return <Empty text={tt("还没有已购买或会员解锁的资料。", "No purchased or member-unlocked materials yet.", "購入・メンバー特典の資料はまだありません。")} />;
  }
  return (
    <ul className="space-y-2">
      {data.map((m) => (
        <li key={m.id}>
          <Link href={`/guide/products/${encodeURIComponent(m.slug)}`} className="flex items-start gap-3 rounded-kx-lg border border-kx-stroke/50 bg-kx-card p-4 transition hover:border-kx-accent/60">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-kx-accentSoft text-kx-accent">
              {m.isService ? <Wrench className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="truncate font-bold text-kx-text">{m.title}</span>
                {m.entitlementSource === "member" ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-kx-accentSoft px-2 py-0.5 text-[11px] font-bold text-kx-accent"><BadgeCheck className="h-3 w-3" />{tt("会员解锁", "Member", "メンバー")}</span>
                ) : (
                  <span className="rounded-full bg-emerald-400/15 px-2 py-0.5 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">{tt("已购买", "Owned", "購入済み")}</span>
                )}
              </div>
              {m.subtitle ? <p className="mt-0.5 truncate text-xs text-kx-subtle">{m.subtitle}</p> : null}
            </div>
            <span className="shrink-0 self-center text-kx-muted">
              {m.hasFile ? <Download className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function ServicesTab({ data, tt }: { data: import("@/lib/guide").GuideLibraryService[]; tt: TT }) {
  if (data.length === 0) {
    return <Empty text={tt("还没有预约或咨询服务。", "No service requests yet.", "予約・相談はまだありません。")} />;
  }
  return (
    <ul className="space-y-2">
      {data.map((s) => (
        <li key={s.id} className="rounded-kx-lg border border-kx-stroke/50 bg-kx-card p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="font-bold text-kx-text">{s.productTitle || s.serviceType || tt("服务", "Service", "サービス")}</span>
            <StatusBadge status={s.status} tt={tt} />
          </div>
          {s.adminNote ? <p className="mt-1 text-xs text-kx-subtle">{s.adminNote}</p> : null}
          <p className="mt-1 text-[11px] text-kx-muted">{formatDate(s.createdAt)}</p>
        </li>
      ))}
    </ul>
  );
}

function OrdersTab({ data, tt }: { data: import("@/lib/guide").GuideLibraryOrder[]; tt: TT }) {
  if (data.length === 0) {
    return <Empty text={tt("还没有订单记录。", "No orders yet.", "注文履歴はまだありません。")} />;
  }
  return (
    <ul className="space-y-2">
      {data.map((o) => (
        <li key={`${o.kind}-${o.orderNo}`} className="flex items-center justify-between gap-3 rounded-kx-lg border border-kx-stroke/50 bg-kx-card p-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {o.kind === "topup" ? <Coins className="h-4 w-4 text-amber-500" /> : <FileText className="h-4 w-4 text-kx-muted" />}
              <span className="truncate font-bold text-kx-text">{o.title || (o.kind === "topup" ? tt("充值", "Top-up", "チャージ") : tt("购买", "Purchase", "購入"))}</span>
            </div>
            <p className="mt-0.5 text-[11px] text-kx-muted">{o.orderNo} · {formatDate(o.createdAt)}</p>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-sm font-bold text-kx-text">
              {o.kind === "topup"
                ? `+${o.pricePoints.toLocaleString()} ${tt("币", "coins", "コイン")}`
                : o.pricePoints > 0
                  ? `${o.pricePoints.toLocaleString()} ${tt("币", "coins", "コイン")}`
                  : formatPrice({ price: o.amount, currency: o.currency })}
            </div>
            <StatusBadge status={o.status} tt={tt} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function StatusBadge({ status, tt }: { status: string; tt: TT }) {
  const label = ((): string => {
    switch (status) {
      case "paid": case "fulfilled": return tt("已完成", "Completed", "完了");
      case "pending": return tt("处理中", "Pending", "処理中");
      case "in_progress": return tt("进行中", "In progress", "進行中");
      case "completed": return tt("已完成", "Completed", "完了");
      case "refunded": return tt("已退款", "Refunded", "返金済み");
      case "cancelled": case "closed": return tt("已取消", "Cancelled", "取消");
      case "replied": return tt("已回复", "Replied", "返信済み");
      default: return status || "—";
    }
  })();
  const tone = ["paid", "fulfilled", "completed"].includes(status)
    ? "bg-emerald-400/15 text-emerald-600 dark:text-emerald-400"
    : ["refunded", "cancelled", "closed"].includes(status)
      ? "bg-rose-400/15 text-rose-600 dark:text-rose-400"
      : "bg-kx-soft text-kx-subtle";
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${tone}`}>{label}</span>;
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-kx-lg border border-dashed border-kx-stroke/60 bg-kx-card px-4 py-10 text-center text-sm text-kx-subtle">{text}</div>;
}

function formatDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso.slice(0, 10) : d.toLocaleDateString();
}
