"use client";

import { AlertCircle, Bell, CheckCircle2, Loader2, Mail, Send, ShieldCheck, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "./Button";
import { BrandPhrase } from "./BrandText";
import { useMarketingI18n } from "./MarketingI18n";

type FormState =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "success" }
  | { kind: "error"; message: string };

// Production-quality email check: not a full RFC validator, just rules
// out the obvious typos that would otherwise make a waitlist email
// undeliverable.
const EMAIL_RE = /^[^\s@]+@[^\s@.]+\.[^\s@.]+$/;

export function DownloadCTA() {
  const { copy } = useMarketingI18n();
  const [email, setEmail] = useState("");
  const [city, setCity] = useState(copy.download.cityOptions[0]);
  const [language, setLanguage] = useState(copy.download.languageOptions[0]);
  const [intent, setIntent] = useState(copy.download.intentOptions[0]);
  const [state, setState] = useState<FormState>({ kind: "idle" });
  const isSending = state.kind === "sending";
  const isSuccess = state.kind === "success";
  const isError = state.kind === "error";
  const inputState: "default" | "focus" | "error" | "success" | "sending" =
    isSuccess ? "success" : isSending ? "sending" : isError ? "error" : "default";

  useEffect(() => {
    setCity(copy.download.cityOptions[0]);
    setLanguage(copy.download.languageOptions[0]);
    setIntent(copy.download.intentOptions[0]);
  }, [copy.download.cityOptions, copy.download.languageOptions, copy.download.intentOptions]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSending) return;
    const value = email.trim();
    if (!EMAIL_RE.test(value)) {
      setState({ kind: "error", message: copy.download.errorInvalid });
      return;
    }
    setState({ kind: "sending" });
    try {
      const payload = { email: value, city, language, intent };
      void payload;
      // Mock submit. Wire to a real endpoint when ready — the shape is
      // intentionally minimal so it's a drop-in for any waitlist backend.
      await new Promise((resolve) => setTimeout(resolve, 720));
      setState({ kind: "success" });
    } catch {
      setState({ kind: "error", message: copy.download.errorSubmit });
    }
  }

  return (
    <section id="download" className="px-5 py-14 sm:px-6 lg:px-16 lg:py-20 xl:px-20">
      <div className="mx-auto max-w-[1180px]">
        <div className="relative overflow-hidden rounded-[32px] border border-white/70 bg-white/75 p-3 shadow-[0_30px_90px_-58px_rgba(15,23,42,0.6)] backdrop-blur-xl sm:rounded-[36px] sm:p-4 dark:border-white/10 dark:bg-white/[0.05]">
          <div className="mc-map-grid pointer-events-none absolute inset-0 opacity-30 dark:opacity-10" />
          <div className="pointer-events-none absolute left-8 top-8 h-32 w-32 rounded-full bg-indigo-500/15 blur-3xl" />
          <div className="pointer-events-none absolute bottom-6 right-8 h-36 w-36 rounded-full bg-sky-400/15 blur-3xl" />

          <div className="relative grid items-stretch gap-4 lg:grid-cols-2">
            {/* ─────────── LEFT — dark pitch ─────────── */}
            <div className="relative overflow-hidden rounded-[28px] bg-[linear-gradient(145deg,#25211f_0%,#3b2d31_56%,#4c3544_100%)] px-6 py-8 text-white shadow-[0_24px_80px_-48px_rgba(55,40,43,0.88)] sm:px-9 sm:py-10 lg:px-10">
              <div className="pointer-events-none absolute -left-24 -top-24 h-64 w-64 rounded-full bg-indigo-500/25 blur-3xl" />
              <div className="pointer-events-none absolute -bottom-28 left-1/3 h-64 w-64 rounded-full bg-sky-400/20 blur-3xl" />

              <div className="relative flex h-full flex-col">
                <p className="inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-sky-200">
                  <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                  {copy.download.label}
                </p>
                <h2 className="mt-4 max-w-xl text-3xl font-black leading-[1.1] sm:text-[2.5rem]">
                  <BrandPhrase text={copy.download.title} />
                </h2>
                <p className="mt-5 max-w-xl text-base leading-7 text-white/70 sm:text-lg">
                  <BrandPhrase text={copy.download.body} />
                </p>

                <div className="mt-6 grid gap-2 sm:grid-cols-2">
                  {copy.download.webFeatures.map((feature) => (
                    <span key={feature} className="rounded-2xl bg-white/8 px-3 py-2 text-xs font-black text-white/72 ring-1 ring-white/10">
                      {feature}
                    </span>
                  ))}
                </div>

                <div className="mt-7 max-w-sm">
                  <Button
                    href="#waitlist-form"
                    size="lg"
                    fullWidth
                    className="h-14 text-base font-black"
                    iconLeft={<Bell className="h-5 w-5" />}
                  >
                    {copy.download.primary}
                  </Button>
                </div>

                <div className="mt-auto pt-8">
                  <div className="flex flex-wrap gap-2">
                    {[copy.download.appStore, copy.download.googlePlay, copy.download.webBeta].map((status) => (
                      <span key={status} className="rounded-full bg-white/10 px-3 py-2 text-xs font-black text-white/74 ring-1 ring-white/10">
                        {status}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* ─────────── RIGHT — form + benefits ─────────── */}
            <div className="rounded-[28px] border border-white/70 bg-white/95 p-5 text-slate-950 shadow-[0_18px_70px_-54px_rgba(15,23,42,0.8)] sm:p-7 dark:border-white/15 dark:bg-white/[0.06] dark:text-white">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#ff7657_0%,#d94b5f_50%,#84658f_100%)] text-white shadow-[0_18px_34px_-18px_rgba(201,74,88,0.68)]">
                  <Mail className="h-5 w-5" aria-hidden="true" />
                </span>
                <div>
                  <p className="text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    {copy.download.formLabel}
                  </p>
                  <h3 className="text-2xl font-black">{copy.download.formTitle}</h3>
                </div>
              </div>

              <form
                id="waitlist-form"
                className="mt-6 space-y-3"
                onSubmit={onSubmit}
                noValidate
                aria-busy={isSending}
              >
                <label className="block">
                  <span className="mb-1.5 block text-xs font-black uppercase text-slate-500 dark:text-slate-400">{copy.download.email}</span>
                  {/* Email field — explicit visual states:
                      default / focus / error / success / sending. */}
                  <div className="relative">
                    <input
                      name="email"
                      type="email"
                      autoComplete="email"
                      inputMode="email"
                      spellCheck={false}
                      required
                      disabled={isSending || isSuccess}
                      aria-invalid={isError || undefined}
                      aria-describedby={isError ? "waitlist-error" : isSuccess ? "waitlist-success" : undefined}
                      data-state={inputState}
                      className="h-14 w-full rounded-2xl border bg-white px-4 pr-12 text-base font-semibold text-slate-950 outline-none transition placeholder:text-slate-400 disabled:cursor-not-allowed disabled:opacity-70 dark:bg-white/[0.06] dark:text-white dark:placeholder:text-slate-400
                                 border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100
                                 data-[state=error]:border-rose-400 data-[state=error]:ring-2 data-[state=error]:ring-rose-100
                                 data-[state=success]:border-emerald-300 data-[state=success]:ring-2 data-[state=success]:ring-emerald-100
                                 dark:border-white/15 dark:focus:ring-indigo-500/20
                                 dark:data-[state=error]:border-rose-400/40 dark:data-[state=error]:ring-rose-500/15
                                 dark:data-[state=success]:border-emerald-400/40 dark:data-[state=success]:ring-emerald-500/15"
                      placeholder={copy.download.email}
                      value={email}
                      onChange={(event) => {
                        setEmail(event.target.value);
                        if (state.kind !== "idle" && state.kind !== "sending") {
                          setState({ kind: "idle" });
                        }
                      }}
                    />
                    <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500">
                      {isSending ? (
                        <Loader2 className="h-5 w-5 animate-spin text-indigo-500" aria-hidden="true" />
                      ) : isSuccess ? (
                        <CheckCircle2 className="h-5 w-5 text-emerald-500" aria-hidden="true" />
                      ) : isError ? (
                        <AlertCircle className="h-5 w-5 text-rose-500" aria-hidden="true" />
                      ) : (
                        <Mail className="h-5 w-5" aria-hidden="true" />
                      )}
                    </span>
                  </div>
                </label>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-black uppercase text-slate-500 dark:text-slate-400">{copy.download.cityLabel}</span>
                    <select
                      value={city}
                      onChange={(event) => setCity(event.target.value)}
                      disabled={isSending || isSuccess}
                      className="h-12 w-full rounded-2xl border border-slate-300 bg-white px-3 text-sm font-bold text-slate-950 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:opacity-70 dark:border-white/15 dark:bg-white/[0.06] dark:text-white dark:focus:ring-indigo-500/20"
                    >
                      {copy.download.cityOptions.map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-black uppercase text-slate-500 dark:text-slate-400">{copy.download.languageLabel}</span>
                    <select
                      value={language}
                      onChange={(event) => setLanguage(event.target.value)}
                      disabled={isSending || isSuccess}
                      className="h-12 w-full rounded-2xl border border-slate-300 bg-white px-3 text-sm font-bold text-slate-950 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:opacity-70 dark:border-white/15 dark:bg-white/[0.06] dark:text-white dark:focus:ring-indigo-500/20"
                    >
                      {copy.download.languageOptions.map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                  </label>
                </div>

                <label className="block">
                  <span className="mb-1.5 block text-xs font-black uppercase text-slate-500 dark:text-slate-400">{copy.download.intentLabel}</span>
                  <select
                    value={intent}
                    onChange={(event) => setIntent(event.target.value)}
                    disabled={isSending || isSuccess}
                    className="h-12 w-full rounded-2xl border border-slate-300 bg-white px-3 text-sm font-bold text-slate-950 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:opacity-70 dark:border-white/15 dark:bg-white/[0.06] dark:text-white dark:focus:ring-indigo-500/20"
                  >
                    {copy.download.intentOptions.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </label>
                <Button
                  type="submit"
                  fullWidth
                  size="lg"
                  className="h-14 text-base font-black disabled:cursor-not-allowed disabled:opacity-70"
                  iconLeft={
                    isSending ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <Send className="h-5 w-5" aria-hidden="true" />
                  }
                  disabled={isSending || isSuccess}
                >
                  {isSending ? copy.download.sending : isSuccess ? copy.download.success.split("，")[0].split(".")[0] : copy.download.notify}
                </Button>
              </form>

              <div className="mt-3 min-h-[2.5rem]" aria-live="polite">
                {isSuccess ? (
                  <div
                    id="waitlist-success"
                    role="status"
                    className="flex items-center gap-2 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700 ring-1 ring-emerald-100 dark:bg-emerald-400/10 dark:text-emerald-200 dark:ring-emerald-300/20"
                  >
                    <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>{copy.download.success}</span>
                  </div>
                ) : null}
                {isError ? (
                  <div
                    id="waitlist-error"
                    role="alert"
                    className="flex items-center gap-2 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700 ring-1 ring-rose-100 dark:bg-rose-500/10 dark:text-rose-200 dark:ring-rose-300/20"
                  >
                    <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>{state.message}</span>
                  </div>
                ) : null}
              </div>

              <div className="mt-6 border-t border-slate-200/80 pt-6 dark:border-white/10">
                <p className="text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  {copy.download.benefitsTitle}
                </p>
                <ul className="mt-4 space-y-3">
                  {copy.download.benefits.map(([title, body]) => (
                    <li key={title} className="flex items-start gap-3">
                      <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-400/20">
                        <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-black text-slate-950 dark:text-white">{title}</p>
                        <p className="mt-0.5 text-xs leading-5 text-slate-500 dark:text-slate-400">{body}</p>
                      </div>
                    </li>
                  ))}
                </ul>

                <p className="mt-5 flex items-start gap-2 rounded-2xl bg-slate-50 px-3 py-2.5 text-[11px] leading-5 text-slate-500 ring-1 ring-slate-200/70 dark:bg-white/[0.04] dark:text-slate-400 dark:ring-white/10">
                  <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-300" aria-hidden="true" />
                  <span>{copy.download.privacy}</span>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
