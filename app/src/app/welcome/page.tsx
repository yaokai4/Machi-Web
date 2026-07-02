"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { guide, type GuideProfile } from "@/lib/guide";
import { useSession, useToasts } from "@/lib/store";
import { safeRedirectPath } from "@/lib/safeRedirect";
import { BrandMark } from "@/components/marketing/BrandText";
import { AuthRouteFallback } from "@/components/auth/AuthRouteFallback";
import { detectAuthLocale } from "@/lib/authLocale";

// Contract values shared with the backend + iOS: guide profile `arrivalStage`.
const ARRIVAL_STAGES = ["pre_arrival", "just_arrived", "first_year", "long_term"] as const;
type ArrivalStage = (typeof ARRIVAL_STAGES)[number];

// Answers that mean "still settling in" land on the Guide, where the
// arrival journeys live; everyone else continues to their original target.
const GUIDE_STAGES: ReadonlySet<string> = new Set(["pre_arrival", "just_arrived"]);

const COPY = {
  zh: {
    eyebrow: "欢迎加入",
    title: "你现在处于哪个阶段？",
    subtitle: "告诉我们你的来日阶段，Machi 会优先展示对你最有用的内容。",
    stages: {
      pre_arrival: "还没来日本",
      just_arrived: "刚到日本（3 个月内）",
      first_year: "来日 1 年内",
      long_term: "来日 1 年以上",
    },
    submit: "开始使用",
    saving: "正在保存…",
    skip: "跳过",
    saveFailed: "保存失败，请稍后在指南中再设置。",
  },
  ja: {
    eyebrow: "ようこそ",
    title: "いまはどの段階ですか？",
    subtitle: "来日の段階を教えてください。Machi があなたに合う情報を優先表示します。",
    stages: {
      pre_arrival: "まだ日本に来ていない",
      just_arrived: "来日したばかり（3 か月以内）",
      first_year: "来日 1 年以内",
      long_term: "来日 1 年以上",
    },
    submit: "はじめる",
    saving: "保存しています…",
    skip: "スキップ",
    saveFailed: "保存に失敗しました。あとでガイドから設定できます。",
  },
  en: {
    eyebrow: "Welcome",
    title: "Where are you on your journey?",
    subtitle: "Tell us your stage and Machi will surface what helps you most.",
    stages: {
      pre_arrival: "Not in Japan yet",
      just_arrived: "Just arrived (within 3 months)",
      first_year: "In Japan under a year",
      long_term: "In Japan over a year",
    },
    submit: "Get started",
    saving: "Saving…",
    skip: "Skip",
    saveFailed: "Could not save — you can set this later in the Guide.",
  },
} as const;

export default function WelcomePage() {
  return (
    <Suspense fallback={<AuthRouteFallback title="正在打开 Machi" />}>
      <WelcomeInner />
    </Suspense>
  );
}

function WelcomeInner() {
  const router = useRouter();
  const search = useSearchParams();
  const status = useSession((s) => s.status);
  const pushToast = useToasts((s) => s.push);
  const redirect = useMemo(() => safeRedirectPath(search.get("redirect")), [search]);
  const locale = useMemo(() => detectAuthLocale(), []);
  const copy = COPY[locale];
  const [profile, setProfile] = useState<GuideProfile | null>(null);
  const [profileLoadFailed, setProfileLoadFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const [selected, setSelected] = useState<ArrivalStage | null>(null);
  const [saving, setSaving] = useState(false);

  // Gate: guests bounce straight through, and users who already answered
  // (profile.arrivalStage set) are never re-prompted.
  useEffect(() => {
    if (status === "unauthed") {
      router.replace(redirect);
      return;
    }
    if (status !== "authed" && status !== "degraded") return;
    let cancelled = false;
    guide.profile()
      .then((res) => {
        if (cancelled) return;
        if (res.profile?.arrivalStage) {
          router.replace(redirect);
          return;
        }
        setProfile(res.profile ?? null);
        setProfileLoadFailed(false);
        setReady(true);
      })
      .catch(() => {
        // Profile unavailable — still show the form; skip always works.
        // Flag the failure so submit re-fetches before PATCHing: the update
        // endpoint rewrites the whole row, and a bare {arrivalStage} would
        // wipe an existing profile (visa, language level, …).
        if (!cancelled) {
          setProfileLoadFailed(true);
          setReady(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [status, redirect, router]);

  const submit = async () => {
    if (!selected || saving) return;
    setSaving(true);
    const target = GUIDE_STAGES.has(selected) ? "/guide" : redirect;
    try {
      // PATCH /api/guide/profile rewrites the whole row, so resend the
      // fields we loaded alongside the new arrivalStage. If the initial GET
      // failed we retry it here — sending {arrivalStage} alone would clear
      // every other profile field; if it fails again we bail to the catch
      // (skip semantics) instead of wiping the row.
      let base = profile;
      if (profileLoadFailed) {
        base = (await guide.profile()).profile ?? null;
      }
      await guide.updateProfile({ ...(base ?? {}), arrivalStage: selected });
      router.replace(target);
    } catch {
      pushToast({ kind: "error", message: copy.saveFailed });
      router.replace(target);
    }
  };

  if (!ready) {
    return <AuthRouteFallback title="正在打开 Machi" />;
  }

  return (
    <main className="kx-auth-page grid min-h-dvh place-items-center px-4 py-10">
      <section className="w-full max-w-md rounded-[28px] border border-kx-stroke bg-kx-card p-6 shadow-kx-glow sm:p-8">
        <BrandMark className="h-12 w-12 rounded-[16px] text-xl" />
        <p className="mt-5 text-xs font-black uppercase tracking-[0.16em] text-kx-accent">{copy.eyebrow}</p>
        <h1 className="mt-2 text-2xl font-black tracking-tight text-kx-text">{copy.title}</h1>
        <p className="mt-2 text-sm font-semibold leading-6 text-kx-subtle">{copy.subtitle}</p>

        <div className="mt-6 grid gap-2.5" role="radiogroup" aria-label={copy.title}>
          {ARRIVAL_STAGES.map((stage) => {
            const active = selected === stage;
            return (
              <button
                key={stage}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setSelected(stage)}
                className={`flex items-center justify-between gap-3 rounded-kx-lg border px-4 py-3.5 text-left text-sm font-bold transition focus:outline-none focus:ring-2 focus:ring-kx-accent/35 ${
                  active
                    ? "border-kx-accent/60 bg-kx-accent/10 text-kx-text"
                    : "border-kx-stroke bg-kx-soft text-kx-text hover:border-kx-accent/45 hover:bg-kx-accent/5"
                }`}
              >
                <span>{copy.stages[stage]}</span>
                {active ? <Check className="h-4 w-4 shrink-0 text-kx-accent" aria-hidden="true" /> : null}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={submit}
          disabled={!selected || saving}
          className="kx-button-primary mt-6 h-12 w-full text-base disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
          <span>{saving ? copy.saving : copy.submit}</span>
        </button>
        <button
          type="button"
          onClick={() => router.replace(redirect)}
          disabled={saving}
          className="mt-3 h-11 w-full rounded-kx-lg text-sm font-bold text-kx-muted transition hover:bg-kx-soft hover:text-kx-text disabled:opacity-60"
        >
          {copy.skip}
        </button>
      </section>
    </main>
  );
}
