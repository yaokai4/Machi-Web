"use client";

import Link from "next/link";
import { Compass, Home } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-dvh flex items-center justify-center px-6">
      <div className="kx-glass-surface max-w-md w-full p-8 text-center space-y-4 animate-kx-scale-in">
        <div className="text-6xl font-bold text-kx-accent tracking-tight">404</div>
        <h1 className="text-xl font-bold text-kx-text">这里没东西可看</h1>
        <p className="text-sm text-kx-subtle leading-relaxed">
          你访问的页面可能已被删除、改名，或者从来没有存在过。
        </p>
        <div className="flex items-center justify-center gap-2 pt-2">
          <Link href="/home" className="kx-button-primary">
            <Home className="w-4 h-4" /> 回首页
          </Link>
          <Link href="/explore" className="kx-button-ghost">
            <Compass className="w-4 h-4" /> 去发现
          </Link>
        </div>
      </div>
    </div>
  );
}
