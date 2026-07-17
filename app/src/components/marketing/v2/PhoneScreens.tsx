"use client";

import type { ReactNode } from "react";
import {
  BadgeCheck, BellRing, BookOpenCheck, CalendarPlus, CheckCircle2, ClipboardList,
  FileText, Flame, Link2, MessageCircle, QrCode, Send, Sparkles, Timer, Wallet,
} from "lucide-react";
import type { V2Copy } from "./theater-copy";

// High-fidelity HTML re-creations of five app screens. All text inside the
// device is decorative UI simulation (the persuasive copy lives in the
// subtitle track next to it), so the frame is aria-hidden by its parents.

export function PhoneFrame({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`mcv2-phone ${className}`}>
      <div className="mcv2-phone-body">
        <div className="mcv2-phone-island" />
        <div className="mcv2-phone-screen">{children}</div>
      </div>
    </div>
  );
}

function ScreenChrome({ title, tone, children }: { title: string; tone: string; children: ReactNode }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-4 pb-2 pt-9">
        <span className="text-[11px] font-bold tracking-wide text-slate-400 dark:text-slate-500">9:41</span>
        <span className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold tracking-wide ${tone}`}>{title}</span>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden px-3 pb-3">{children}</div>
    </div>
  );
}

export function JlptScreen({ s }: { s: V2Copy["screens"]["jlpt"] }) {
  return (
    <ScreenChrome title={s.title} tone="bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300">
      <div className="flex h-full flex-col gap-2">
        <div className="flex items-center justify-between rounded-2xl bg-slate-950 px-3 py-2.5 text-white dark:bg-white/10">
          <span className="text-[11px] font-bold text-white/70">{s.level}</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-white/[0.12] px-2 py-0.5 text-[11px] font-extrabold tabular-nums">
            <Timer className="h-3 w-3" aria-hidden="true" />
            {s.timer}
          </span>
        </div>
        <div className="rounded-2xl border border-slate-200/80 bg-white p-3 dark:border-white/10 dark:bg-white/[0.05]">
          <p className="text-[12px] font-semibold leading-5 text-slate-900 dark:text-slate-100">{s.question}</p>
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            {s.options.map((opt, i) => (
              <span
                key={opt}
                className={`rounded-xl border px-2 py-1.5 text-center text-[11px] font-bold ${
                  i === 0
                    ? "border-emerald-400/70 bg-emerald-50 text-emerald-700 dark:border-emerald-400/40 dark:bg-emerald-400/10 dark:text-emerald-300"
                    : "border-slate-200 text-slate-600 dark:border-white/10 dark:text-slate-300"
                }`}
              >
                {opt}
              </span>
            ))}
          </div>
        </div>
        <div className="rounded-2xl bg-gradient-to-br from-[#147067] to-[#1d8a76] p-3 text-white">
          <span className="inline-flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wider text-emerald-100">
            <Sparkles className="h-3 w-3" aria-hidden="true" />
            {s.aiTag}
          </span>
          <p className="mt-1 text-[11px] leading-4 text-emerald-50/95">{s.aiNote}</p>
        </div>
        <div className="mt-auto flex gap-1.5">
          <span className="inline-flex flex-1 items-center justify-center gap-1 rounded-xl bg-orange-50 px-2 py-2 text-[11px] font-extrabold text-orange-700 dark:bg-orange-500/10 dark:text-orange-300">
            <Flame className="h-3.5 w-3.5" aria-hidden="true" />
            {s.streak} ×12
          </span>
          <span className="inline-flex flex-1 items-center justify-center gap-1 rounded-xl bg-rose-50 px-2 py-2 text-[11px] font-extrabold text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
            <BookOpenCheck className="h-3.5 w-3.5" aria-hidden="true" />
            {s.wrongbook}
          </span>
        </div>
      </div>
    </ScreenChrome>
  );
}

export function EventsScreen({ s }: { s: V2Copy["screens"]["events"] }) {
  return (
    <ScreenChrome title={s.title} tone="bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">
      <div className="flex h-full flex-col gap-2">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-3 dark:border-white/10 dark:bg-white/[0.05]">
          <p className="text-[13px] font-black text-slate-900 dark:text-white">{s.eventName}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {[s.capacity, s.waitlist, s.approval].map((chip) => (
              <span key={chip} className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-extrabold text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300">
                {chip}
              </span>
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200/80 bg-white p-3 dark:border-white/10 dark:bg-white/[0.05]">
          <span className="inline-flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
            <ClipboardList className="h-3 w-3" aria-hidden="true" />
            {s.formTitle}
          </span>
          {s.formFields.map((f) => (
            <div key={f} className="mt-1.5 rounded-lg bg-slate-100/80 px-2 py-1.5 text-[11px] font-semibold text-slate-600 dark:bg-white/[0.06] dark:text-slate-300">
              {f}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <span className="inline-flex items-center justify-center gap-1 rounded-xl bg-slate-950 px-2 py-2 text-[10px] font-extrabold text-white dark:bg-white/[0.12]">
            <QrCode className="h-3.5 w-3.5" aria-hidden="true" />
            {s.checkin}
          </span>
          <span className="inline-flex items-center justify-center gap-1 rounded-xl bg-slate-100 px-2 py-2 text-[10px] font-extrabold text-slate-700 dark:bg-white/[0.07] dark:text-slate-200">
            <Send className="h-3.5 w-3.5" aria-hidden="true" />
            {s.broadcast}
          </span>
        </div>
        <div className="mt-auto space-y-1.5">
          <span className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-indigo-300/70 px-2 py-2 text-[11px] font-bold text-indigo-600 dark:border-indigo-400/30 dark:text-indigo-300">
            <CalendarPlus className="h-3.5 w-3.5" aria-hidden="true" />
            {s.ics}
          </span>
          <span className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-slate-100/80 px-2 py-1.5 text-[10px] font-bold text-slate-500 dark:bg-white/[0.06] dark:text-slate-400">
            <Link2 className="h-3 w-3" aria-hidden="true" />
            {s.shortlink}
          </span>
        </div>
      </div>
    </ScreenChrome>
  );
}

const AVATAR_TONES = [
  "linear-gradient(135deg,#ff8a65,#d94b5f)",
  "linear-gradient(135deg,#7986cb,#4f46e5)",
  "linear-gradient(135deg,#4db6ac,#147067)",
  "linear-gradient(135deg,#f6bf62,#cf6545)",
];

export function RoomsScreen({ s }: { s: V2Copy["screens"]["rooms"] }) {
  return (
    <ScreenChrome title={s.title} tone="bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
      <div className="flex h-full flex-col gap-2">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-3 dark:border-white/10 dark:bg-white/[0.05]">
          <p className="text-[13px] font-black text-slate-900 dark:text-white">{s.roomName}</p>
          <p className="mt-0.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400">{s.time}</p>
          <div className="mt-2.5 flex items-center justify-between">
            <div className="flex -space-x-2" aria-hidden="true">
              {AVATAR_TONES.map((bg, i) => (
                <span key={i} className="mcv2-room-avatar h-7 w-7 rounded-full border-2 border-white dark:border-slate-900" style={{ background: bg, transitionDelay: `${i * 90}ms` }} />
              ))}
            </div>
            <span className="rounded-full bg-orange-100 px-2.5 py-1 text-[11px] font-extrabold text-orange-700 dark:bg-orange-500/15 dark:text-orange-300">
              {s.needs}
            </span>
          </div>
        </div>
        <div className="flex-1 rounded-2xl border border-slate-200/80 bg-white p-3 dark:border-white/10 dark:bg-white/[0.05]">
          <span className="inline-flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
            <MessageCircle className="h-3 w-3" aria-hidden="true" />
            {s.joined}
          </span>
          <div className="mt-2 space-y-1.5">
            <div className="max-w-[85%] rounded-2xl rounded-tl-md bg-slate-100 px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 dark:bg-white/[0.08] dark:text-slate-200">
              {s.chat[0]}
            </div>
            <div className="ml-auto max-w-[85%] rounded-2xl rounded-tr-md bg-[#765f78] px-2.5 py-1.5 text-[11px] font-semibold text-white">
              {s.chat[1]}
            </div>
          </div>
        </div>
        <div className="flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-2 py-2 text-[10px] font-extrabold text-white dark:bg-white/[0.12]">
          <span className="rounded bg-white/15 px-1.5 py-0.5">{s.ios}</span>
          <span className="inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" aria-hidden="true" />
          <span>{s.sync}</span>
          <span className="inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" aria-hidden="true" />
          <span className="rounded bg-white/15 px-1.5 py-0.5">{s.web}</span>
        </div>
      </div>
    </ScreenChrome>
  );
}

export function WorkspaceScreen({ s }: { s: V2Copy["screens"]["workspace"] }) {
  return (
    <ScreenChrome title={s.title} tone="bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
      <div className="flex h-full flex-col gap-2">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-3 dark:border-white/10 dark:bg-white/[0.05]">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">{s.inputHint}</span>
          <div className="mt-1.5 rounded-xl bg-slate-100/90 px-2.5 py-2 text-[12px] font-bold text-slate-800 dark:bg-white/[0.07] dark:text-slate-100">
            {s.inputText}
            <span className="mcv2-caret" aria-hidden="true" />
          </div>
          <div className="mcv2-parse-arrow my-1.5 text-center text-slate-300 dark:text-slate-600" aria-hidden="true">↓</div>
          <div className="rounded-xl border border-emerald-300/60 bg-emerald-50/80 p-2.5 dark:border-emerald-400/25 dark:bg-emerald-400/[0.07]">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1 text-[11px] font-extrabold text-emerald-800 dark:text-emerald-200">
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                {s.parsedTitle}
              </span>
              <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[9px] font-extrabold text-white">{s.parsedDue}</span>
            </div>
            <p className="mt-1 text-[10px] font-bold text-emerald-700/80 dark:text-emerald-300/80">{s.parsedTag}</p>
          </div>
        </div>
        <div className="grid flex-1 grid-cols-2 content-start gap-1.5">
          {s.cards.map((c, i) => {
            const icons = [CalendarPlus, Wallet, BadgeCheck, FileText, ClipboardList];
            const Icon = icons[i % icons.length];
            return (
              <span key={c} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200/80 bg-white px-2.5 py-2.5 text-[11px] font-extrabold text-slate-700 dark:border-white/10 dark:bg-white/[0.05] dark:text-slate-200">
                <Icon className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                {c}
              </span>
            );
          })}
        </div>
      </div>
    </ScreenChrome>
  );
}

export function AiScreen({ s }: { s: V2Copy["screens"]["ai"] }) {
  return (
    <ScreenChrome title={s.title} tone="bg-[#147067]/10 text-[#147067] dark:bg-[#5cbeb2]/15 dark:text-[#8fd8cd]">
      <div className="flex h-full flex-col gap-2">
        <div className="ml-auto max-w-[88%] rounded-2xl rounded-tr-md bg-slate-950 px-3 py-2 text-[11px] font-semibold text-white dark:bg-white/[0.12]">
          {s.q}
        </div>
        <div className="max-w-[92%] rounded-2xl rounded-tl-md border border-slate-200/80 bg-white p-3 dark:border-white/10 dark:bg-white/[0.05]">
          <p className="text-[11px] leading-[1.15rem] font-medium text-slate-700 dark:text-slate-200">{s.a}</p>
          <div className="mt-2 flex flex-wrap gap-1">
            {s.sources.map((src) => (
              <span key={src} className="inline-flex items-center gap-1 rounded-full bg-[#147067]/[0.08] px-2 py-0.5 text-[9px] font-extrabold text-[#147067] dark:bg-[#5cbeb2]/[0.12] dark:text-[#8fd8cd]">
                <FileText className="h-2.5 w-2.5" aria-hidden="true" />
                {src}
              </span>
            ))}
          </div>
        </div>
        <div className="mt-auto flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-[#147067] to-[#1d8a76] px-2 py-2 text-[10px] font-extrabold text-white">
          <BellRing className="h-3 w-3" aria-hidden="true" />
          {s.memberNote}
        </div>
      </div>
    </ScreenChrome>
  );
}
