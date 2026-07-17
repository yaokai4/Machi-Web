"use client";

import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { useMarketingI18n } from "../MarketingI18n";
import { v2Copy } from "./theater-copy";
import { AiScreen, EventsScreen, JlptScreen, PhoneFrame, RoomsScreen, WorkspaceScreen } from "./PhoneScreens";

// The six-act product theater. Desktop (lg+): a sticky phone plays five
// re-enacted app screens while the subtitle track scrolls past; the act
// index is driven by a rAF-coalesced scroll handler that only touches
// React state when the act actually changes (per-frame values go straight
// to CSS custom properties). Mobile / reduced-motion: the same acts render
// as a static vertical sequence — every fact stays on the page.

const ACT_COUNT = 5;

function ActScreens({ act, copy }: { act: number; copy: ReturnType<typeof pickCopy> }) {
  const screens = [
    <JlptScreen key="jlpt" s={copy.screens.jlpt} />,
    <EventsScreen key="events" s={copy.screens.events} />,
    <RoomsScreen key="rooms" s={copy.screens.rooms} />,
    <WorkspaceScreen key="workspace" s={copy.screens.workspace} />,
    <AiScreen key="ai" s={copy.screens.ai} />,
  ];
  return (
    <>
      {screens.map((screen, i) => (
        <div
          key={i}
          className={clsx("mcv2-act-screen", i === act && "mcv2-act-screen--on")}
          style={{ zIndex: i === act ? 2 : 1 }}
        >
          {screen}
        </div>
      ))}
    </>
  );
}

function pickCopy(locale: "zh" | "en" | "ja") {
  return v2Copy[locale] ?? v2Copy.zh;
}

export function TheaterSection() {
  const { locale } = useMarketingI18n();
  const copy = pickCopy(locale);
  const acts = copy.theater.acts;

  const sectionRef = useRef<HTMLElement | null>(null);
  const [act, setAct] = useState(0);
  const actRef = useRef(0);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;
    const fine = window.matchMedia("(min-width: 1024px)");
    let raf = 0;

    // Note: this keeps running under prefers-reduced-motion — switching the
    // visible act is content navigation, not decoration; the global CSS
    // kill-switch already collapses the transitions to ~0ms.
    const update = () => {
      raf = 0;
      if (!fine.matches) return;
      const rect = section.getBoundingClientRect();
      const vh = window.innerHeight;
      const total = rect.height - vh;
      const p = total > 0 ? Math.min(Math.max(-rect.top / total, 0), 1) : 0;
      const scaled = p * ACT_COUNT;
      const next = Math.min(Math.floor(scaled), ACT_COUNT - 1);
      section.style.setProperty("--tp", p.toFixed(4));
      section.style.setProperty("--ap", (scaled - next).toFixed(4));
      if (next !== actRef.current) {
        actRef.current = next;
        setAct(next);
        section.dataset.act = String(next);
      }
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    update();
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <section id="theater" ref={sectionRef} data-act="0" className="mcv2-theater mcv2-cv-off relative">
      {/* ————— intro ————— */}
      <div className="mx-auto max-w-[1180px] px-5 pb-10 pt-20 text-center sm:px-8 lg:pb-16">
        <span className="mc-eyebrow mc-reveal">{copy.theater.label}</span>
        <h2 className="mc-section-title mc-reveal mx-auto mt-4 max-w-2xl text-balance">{copy.theater.title}</h2>
        <p className="mc-section-lead mc-reveal mx-auto mt-4">{copy.theater.body}</p>
      </div>

      {/* ————— desktop sticky stage ————— */}
      <div className="mcv2-stage-outer relative hidden lg:block" style={{ height: `${ACT_COUNT * 120 + 40}vh` }}>
        <div className="mcv2-stage sticky top-0 flex h-screen items-center overflow-hidden">
          {/* JLPT act dims the particle field while this marker covers the stage. */}
          <div data-echo-dim hidden={act !== 0} aria-hidden="true" className="pointer-events-none absolute inset-0" />
          <div className="mx-auto grid w-full max-w-[1180px] grid-cols-[1.05fr_0.95fr] items-center gap-16 px-8">
            {/* subtitle track */}
            <div className="relative">
              {acts.map((a, i) => (
                <article
                  key={a.key}
                  className={clsx("mcv2-track-act", i === act && "mcv2-track-act--on")}
                  aria-hidden={i !== act}
                >
                  <p className="text-[12px] font-extrabold uppercase tracking-[0.18em] text-orange-600/90 dark:text-orange-300/90">
                    {copy.theater.actLabel(i + 1)} · {a.kicker}
                  </p>
                  <h3 className="mt-3 text-balance text-[clamp(1.7rem,2.6vw,2.5rem)] font-black leading-[1.14] tracking-[-0.02em] text-slate-950 dark:text-white">
                    {a.title}
                  </h3>
                  <p className="mt-4 max-w-[34rem] text-[1.05rem] leading-7 text-slate-600 dark:text-slate-300">{a.body}</p>
                  <ul className="mt-6 space-y-3">
                    {a.points.map(([t, d], j) => (
                      <li key={t} className="mcv2-track-point flex gap-3" style={{ transitionDelay: `${120 + j * 70}ms` }}>
                        <span className="mt-[7px] inline-block h-1.5 w-1.5 flex-none rounded-full bg-gradient-to-r from-orange-500 to-rose-500" aria-hidden="true" />
                        <p className="text-[15px] leading-6 text-slate-700 dark:text-slate-200">
                          <strong className="font-extrabold text-slate-950 dark:text-white">{t}</strong>
                          <span className="mx-1.5 text-slate-300 dark:text-slate-600" aria-hidden="true">—</span>
                          {d}
                        </p>
                      </li>
                    ))}
                  </ul>
                </article>
              ))}

              {/* act progress rail */}
              <div className="mt-10 flex items-center gap-2" aria-hidden="true">
                {acts.map((a, i) => (
                  <span key={a.key} className={clsx("mcv2-act-dot", i === act && "mcv2-act-dot--on")}>
                    <span className="mcv2-act-dot-label">{a.name}</span>
                  </span>
                ))}
              </div>
            </div>

            {/* sticky phone — decorative re-enactment; copy lives in the track */}
            <div className="relative flex justify-center" aria-hidden="true">
              <div className="mcv2-spotlight" data-on={act === 0 ? "1" : "0"} />
              <PhoneFrame className="mcv2-phone--stage">
                <ActScreens act={act} copy={copy} />
              </PhoneFrame>
            </div>
          </div>
        </div>
      </div>

      {/* ————— mobile static theater ————— */}
      <div className="space-y-16 px-5 pb-20 sm:px-8 lg:hidden">
        {acts.map((a, i) => {
          const screens = [
            <JlptScreen key="jlpt" s={copy.screens.jlpt} />,
            <EventsScreen key="events" s={copy.screens.events} />,
            <RoomsScreen key="rooms" s={copy.screens.rooms} />,
            <WorkspaceScreen key="workspace" s={copy.screens.workspace} />,
            <AiScreen key="ai" s={copy.screens.ai} />,
          ];
          return (
            <article key={a.key} className="mc-reveal mx-auto max-w-[640px]">
              <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-orange-600/90 dark:text-orange-300/90">
                {copy.theater.actLabel(i + 1)} · {a.kicker}
              </p>
              <h3 className="mt-2 text-balance text-[1.6rem] font-black leading-[1.18] tracking-[-0.015em] text-slate-950 dark:text-white">
                {a.title}
              </h3>
              <p className="mt-3 text-[15px] leading-7 text-slate-600 dark:text-slate-300">{a.body}</p>
              <div className="mt-6 flex justify-center" aria-hidden="true">
                <PhoneFrame className="mcv2-phone--inline">{screens[i]}</PhoneFrame>
              </div>
              <ul className="mt-6 space-y-2.5">
                {a.points.map(([t, d]) => (
                  <li key={t} className="flex gap-2.5">
                    <span className="mt-[7px] inline-block h-1.5 w-1.5 flex-none rounded-full bg-gradient-to-r from-orange-500 to-rose-500" aria-hidden="true" />
                    <p className="text-[14px] leading-6 text-slate-700 dark:text-slate-200">
                      <strong className="font-extrabold text-slate-950 dark:text-white">{t}</strong>
                      <span className="mx-1.5 text-slate-300 dark:text-slate-600" aria-hidden="true">—</span>
                      {d}
                    </p>
                  </li>
                ))}
              </ul>
            </article>
          );
        })}
      </div>
    </section>
  );
}
