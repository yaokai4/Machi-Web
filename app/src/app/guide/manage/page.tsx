"use client";

import Link from "next/link";
import {
  Bell,
  BriefcaseBusiness,
  FileArchive,
  IdCard,
  PackageCheck,
  Route,
  ShieldCheck,
  Wallet,
  WalletCards,
} from "lucide-react";
import { GuideShell } from "@/components/guide/GuideKit";
import { useAuthPrompt, useSession } from "@/lib/store";

const MANAGE_GROUPS = [
  {
    id: "goals",
    href: "/guide/goals",
    title: "目标 / 路径",
    body: "可选模板：就职、升学、JLPT、租房等。套用后会生成一组可删的待办，想要才用。",
    icon: Route,
    tone: "bg-blue-500/10 text-blue-600",
  },
  {
    id: "finance",
    href: "/guide/finance",
    title: "收支记账",
    body: "记一笔收入/支出、看本月结余、设分类预算、掌握每月固定成本。不连银行，只记你填的数。",
    icon: Wallet,
    tone: "bg-emerald-500/10 text-emerald-600",
  },
  {
    id: "life",
    href: "/guide/life",
    title: "生活缴费",
    body: "房租、水费、电费、煤气、网络、手机费、保险、年金、住民税、学费。",
    icon: WalletCards,
    tone: "bg-orange-500/10 text-orange-600",
  },
  {
    id: "contracts",
    href: "/guide/contracts",
    title: "合同管理",
    body: "租房合同、手机合约、网络合约、保险合同、学校/工作合同的续约和解约窗口。",
    icon: FileArchive,
    tone: "bg-emerald-500/10 text-emerald-700",
  },
  {
    id: "documents",
    href: "/guide/documents",
    title: "证件到期",
    body: "在留卡、护照、My Number、驾照、健康保险证。只填日期，不需要上传证件。",
    icon: IdCard,
    tone: "bg-cyan-500/10 text-cyan-700",
  },
  {
    id: "applications",
    href: "/guide/applications",
    title: "申请管理",
    body: "大学、大学院、语言学校、新卒就职、转职、JLPT、奖学金、签证申请。",
    icon: BriefcaseBusiness,
    tone: "bg-rose-500/10 text-rose-600",
  },
  {
    id: "profile",
    href: "/guide/profile",
    title: "个人提醒设置",
    body: "可选填写城市、目标、毕业时间、在留/护照到期日，用于生成提醒。",
    icon: Bell,
    tone: "bg-indigo-500/10 text-indigo-600",
  },
  {
    id: "resources",
    href: "/guide/services",
    title: "文件与资料",
    body: "履历书、研究计划书、JLPT、面试、签证、租房和生活资料服务。",
    icon: PackageCheck,
    tone: "bg-violet-500/10 text-violet-600",
  },
];

export default function GuideManagePage() {
  const user = useSession((s) => s.user);
  const openAuthPrompt = useAuthPrompt((s) => s.open);
  return (
    <GuideShell back={{ href: "/my/features", label: "我的工作台" }}>
      <main className="space-y-7 px-4 py-7 sm:px-7">
        <header className="rounded-[2rem] border border-kx-stroke/40 bg-kx-card/80 p-6 sm:p-7">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.12em] text-[rgb(var(--kx-living-warm))]">Manage</p>
              <h1 className="mt-2 text-3xl font-black tracking-[-0.02em] text-kx-text">管理</h1>
              <p className="mt-2 max-w-2xl text-sm leading-7 text-kx-subtle">
                把生活缴费、合同、证件到期、申请和资料服务放在一个地方，所有日期都会回到 Todo 和日历。
              </p>
            </div>
            {!user ? (
              <button type="button" onClick={() => openAuthPrompt("generic")} className="kx-button-primary h-11 px-5">
                登录后同步管理项
              </button>
            ) : null}
          </div>
        </header>

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {MANAGE_GROUPS.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.id}
                id={item.id}
                href={item.href}
                className="kx-card group flex min-h-[178px] flex-col justify-between p-5 transition hover:-translate-y-0.5 hover:border-kx-accent/35"
              >
                <span className={`grid h-12 w-12 place-items-center rounded-2xl ${item.tone}`}>
                  <Icon className="h-5 w-5" />
                </span>
                <span>
                  <span className="block text-lg font-black text-kx-text group-hover:text-kx-accent">{item.title}</span>
                  <span className="mt-1 block text-sm leading-6 text-kx-muted">{item.body}</span>
                </span>
              </Link>
            );
          })}
        </section>

        <section className="rounded-2xl border border-kx-stroke/50 bg-kx-card/75 p-5">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-kx-accentSoft text-kx-accent">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-base font-black text-kx-text">隐私原则</h2>
              <p className="mt-1 text-sm leading-7 text-kx-muted">
                个人提醒设置只需要日期和目标偏好，不需要上传在留卡、护照或任何敏感证件。你也可以完全不填写，Guide 的 Todo、日历、缴费和申请管理仍然可用。
              </p>
            </div>
          </div>
        </section>
      </main>
    </GuideShell>
  );
}
