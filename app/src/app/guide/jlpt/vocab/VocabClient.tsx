"use client";

import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { BookOpenCheck, Loader, Check, X, Lock, ArrowLeft, Sparkles, ChevronRight } from "lucide-react";
import {
  guide,
  type GuideJlptVocabDeck,
  type GuideJlptVocabWord,
  type GuideJlptVocabQuizStart,
  type GuideJlptVocabQuizResult,
} from "@/lib/guide";
import { APIError, isAuthRequiredError } from "@/lib/api";
import { useAuthPrompt, useToasts } from "@/lib/store";
import { GuideShell, GuideSectionTitle } from "@/components/guide/GuideKit";
import { InlineLoading, ErrorState } from "@/components/design/States";
import { appLocaleToGuideLanguage, useI18n } from "@/lib/i18n";
import {
  LevelPicker,
  JlptDisclaimer,
  JlptNarrow,
  JlptPageHeader,
  JlptStateCard,
  JlptScoreHero,
  JLPT_LEVELS,
  fmtDuration,
  type Tri,
} from "../JlptKit";

type View = "decks" | "deck" | "quiz";

export function VocabClient() {
  const { locale } = useI18n();
  const language = appLocaleToGuideLanguage(locale);
  const t: Tri = (zh, ja, en) => (language === "ja" ? ja : language === "en" ? en : zh);
  const openAuthPrompt = useAuthPrompt((s) => s.open);
  const pushToast = useToasts((s) => s.push);
  const qc = useQueryClient();

  const [level, setLevel] = useState<string>("");
  const [view, setView] = useState<View>("decks");
  const [activeDeck, setActiveDeck] = useState<GuideJlptVocabDeck | null>(null);

  const back = { href: "/guide/jlpt", label: t("JLPT 备考", "JLPT 対策", "JLPT prep") };

  const decksQ = useQuery({
    queryKey: ["guide", "jlpt-vocab-decks", level],
    queryFn: () => guide.jlptVocabDecks(level || undefined),
    staleTime: 60_000,
  });

  const deckDetailQ = useQuery({
    queryKey: ["guide", "jlpt-vocab-deck", activeDeck?.id],
    queryFn: () => guide.jlptVocabDeck(activeDeck!.id),
    enabled: view === "deck" && !!activeDeck,
    retry: false,
  });

  const mark = useMutation({
    mutationFn: (v: { wordId: string; state: "learning" | "mastered" }) => guide.jlptVocabMark(v),
    onMutate: async (v) => {
      // optimistic toggle on the cached deck detail
      qc.setQueryData(
        ["guide", "jlpt-vocab-deck", activeDeck?.id],
        (old: { deck: GuideJlptVocabDeck; words: GuideJlptVocabWord[]; status: string } | undefined) =>
          old
            ? { ...old, words: old.words.map((w) => (w.id === v.wordId ? { ...w, mastered: v.state === "mastered" } : w)) }
            : old,
      );
    },
    onError: (err, _v) => {
      qc.invalidateQueries({ queryKey: ["guide", "jlpt-vocab-deck", activeDeck?.id] });
      if (isAuthRequiredError(err)) {
        openAuthPrompt({ kind: "generic", title: t("登录后记录单词", "ログインして単語を記録", "Log in to track vocab") });
        return;
      }
      pushToast({ kind: "error", message: (err as APIError).message });
    },
  });

  const openDeck = (deck: GuideJlptVocabDeck) => {
    setActiveDeck(deck);
    setView("deck");
  };

  // ── deck list ──
  if (view === "decks") {
    return (
      <GuideShell back={back}>
        <JlptNarrow>
          <JlptPageHeader
            eyebrow={`JLPT · ${t("单词", "単語", "Vocab")}`}
            title={t("高频单词", "頻出単語", "Vocabulary decks")}
            subtitle={t("按等级背词表,再用「考单词」检验记忆。", "レベル別に単語帳、そして「単語テスト」で定着を確認。", "Study decks by level, then check recall with the vocab quiz.")}
          />

          <div className="mt-6">
            <LevelPicker
              value={level}
              onChange={setLevel}
              levels={["", ...(JLPT_LEVELS as readonly string[])]}
              allLabel={t("全部", "すべて", "All")}
            />
          </div>

          {decksQ.isLoading ? (
            <div className="mt-6">
              <InlineLoading />
            </div>
          ) : decksQ.isError ? (
            <div className="mt-6">
              <ErrorState />
            </div>
          ) : !decksQ.data?.decks?.length ? (
            <JlptStateCard
              icon={BookOpenCheck}
              title={t("该等级暂无词表", "このレベルの単語帳はまだありません", "No decks for this level yet")}
              body={t("换个等级看看。", "他のレベルをご覧ください。", "Try another level.")}
            />
          ) : (
            <section className="mt-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {decksQ.data.decks.map((deck) => (
                  <button
                    key={deck.id}
                    type="button"
                    onClick={() => openDeck(deck)}
                    className="group flex items-start gap-3.5 rounded-[22px] border border-[rgb(var(--kx-living-ink))]/[0.07] bg-[rgb(var(--kx-living-surface))] p-[18px] text-left shadow-[0_20px_44px_-40px_rgb(var(--kx-shadow)/0.7)] transition duration-200 hover:-translate-y-0.5 hover:border-[rgb(var(--kx-living-accent))]/35 hover:shadow-[0_26px_52px_-34px_rgb(var(--kx-shadow)/0.7)]"
                  >
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[rgb(var(--kx-living-accent))]/[0.1] text-sm font-black text-[rgb(var(--kx-living-accent))]">
                      {deck.level}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 text-[15px] font-black leading-tight text-[rgb(var(--kx-living-ink))]">
                        {deck.title}
                        {deck.isMemberOnly ? <Lock className="h-3.5 w-3.5 shrink-0 text-[rgb(var(--kx-living-accent))]" /> : null}
                      </p>
                      {deck.description ? (
                        <p className="mt-1 line-clamp-2 text-xs font-medium leading-snug text-[rgb(var(--kx-living-muted))]">
                          {deck.description}
                        </p>
                      ) : null}
                      <p className="mt-1.5 text-[11px] font-bold text-[rgb(var(--kx-living-muted))]">
                        {t(`${deck.wordCount} 词`, `${deck.wordCount} 語`, `${deck.wordCount} words`)}
                      </p>
                    </div>
                    <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[rgb(var(--kx-living-ink))]/[0.05] text-[rgb(var(--kx-living-muted))] transition group-hover:translate-x-0.5 group-hover:bg-[rgb(var(--kx-living-accent))]/[0.14] group-hover:text-[rgb(var(--kx-living-accent))]">
                      <ChevronRight className="h-3.5 w-3.5" />
                    </span>
                  </button>
                ))}
              </div>
            </section>
          )}

          <JlptDisclaimer t={t} />
        </JlptNarrow>
      </GuideShell>
    );
  }

  // ── quiz view ──
  if (view === "quiz" && activeDeck) {
    return (
      <GuideShell back={back}>
        <JlptNarrow>
          <VocabQuiz
            t={t}
            deck={activeDeck}
            onExit={() => setView("deck")}
            onAuthRequired={() => openAuthPrompt({ kind: "generic", title: t("登录后开始测验", "ログインしてテスト開始", "Log in to start the quiz") })}
          />
        </JlptNarrow>
      </GuideShell>
    );
  }

  // ── deck detail ──
  const memberBlocked =
    deckDetailQ.isError && (deckDetailQ.error as APIError)?.status === 403;
  const authBlocked = deckDetailQ.isError && isAuthRequiredError(deckDetailQ.error);

  return (
    <GuideShell back={back}>
      <JlptNarrow>
        <button
          type="button"
          onClick={() => setView("decks")}
          className="inline-flex items-center gap-1.5 pt-2 text-sm font-semibold text-kx-muted hover:text-kx-accent"
        >
          <ArrowLeft className="h-4 w-4" /> {t("全部词表", "単語帳一覧", "All decks")}
        </button>

        <JlptPageHeader
          eyebrow={`${activeDeck?.level} · ${t("单词", "単語", "Vocab")}`}
          title={activeDeck?.title || ""}
        />

        {deckDetailQ.isLoading ? (
          <div className="mt-6">
            <InlineLoading />
          </div>
        ) : authBlocked ? (
          <JlptStateCard
            icon={Lock}
            tone="accent"
            title={t("登录后解锁全部单词", "ログインして全単語を解除", "Log in to unlock all words")}
            action={
              <button
                type="button"
                onClick={() => openAuthPrompt("generic")}
                className="rounded-full bg-[rgb(var(--kx-living-accent))] px-5 py-2.5 text-sm font-bold text-[rgb(var(--kx-on-accent))] shadow-[0_14px_28px_-16px_rgb(var(--kx-living-accent)/0.8)] transition hover:opacity-90"
              >
                {t("登录", "ログイン", "Log in")}
              </button>
            }
          />
        ) : memberBlocked ? (
          <JlptStateCard
            icon={Lock}
            tone="accent"
            title={t("这是会员专属词表", "会員限定の単語帳です", "This deck is members-only")}
            body={t(
              "开通会员即可解锁全部单词与「考单词」测验。",
              "会員になると全単語と「単語テスト」が解放されます。",
              "Membership unlocks all words and the vocab quiz.",
            )}
            action={
              <a
                href="/membership"
                className="rounded-full bg-[rgb(var(--kx-living-accent))] px-5 py-2.5 text-sm font-bold text-[rgb(var(--kx-on-accent))] shadow-[0_14px_28px_-16px_rgb(var(--kx-living-accent)/0.8)] transition hover:opacity-90"
              >
                {t("了解会员", "会員について", "See membership")}
              </a>
            }
          />
        ) : deckDetailQ.isError ? (
          <div className="mt-6">
            <ErrorState />
          </div>
        ) : deckDetailQ.data ? (
          <>
            <button
              type="button"
              onClick={() => {
                if (!deckDetailQ.data.words.length) return;
                setView("quiz");
              }}
              className="mt-5 inline-flex items-center gap-2 rounded-full bg-[rgb(var(--kx-living-accent))] px-5 py-2.5 text-sm font-bold text-[rgb(var(--kx-on-accent))] shadow-[0_14px_28px_-16px_rgb(var(--kx-living-accent)/0.8)] transition hover:opacity-90"
            >
              <Sparkles className="h-4 w-4" /> {t("考单词", "単語テスト", "Vocab quiz")}
            </button>

            <GuideSectionTitle title={t("单词表", "単語一覧", "Words")} />
            <div className="mt-2 space-y-2.5">
              {deckDetailQ.data.words.map((w) => (
                <div
                  key={w.id}
                  className="flex items-start gap-3 rounded-2xl border border-[rgb(var(--kx-living-ink))]/[0.07] bg-[rgb(var(--kx-living-surface))] px-4 py-3.5 shadow-[0_16px_38px_-38px_rgb(var(--kx-shadow)/0.7)]"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      <span className="text-[19px] font-black leading-tight text-[rgb(var(--kx-living-ink))]">{w.word}</span>
                      {w.reading ? (
                        <span className="text-xs font-bold text-[rgb(var(--kx-living-accent))]">{w.reading}</span>
                      ) : null}
                      {w.pos ? (
                        <span className="rounded-md bg-[rgb(var(--kx-living-ink))]/[0.06] px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-[rgb(var(--kx-living-muted))]">
                          {w.pos}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-sm font-bold text-[rgb(var(--kx-living-ink))]">
                      {w.meaningZh}
                      {w.meaningEn ? <span className="ml-2 text-xs font-medium text-[rgb(var(--kx-living-muted))]">{w.meaningEn}</span> : null}
                    </p>
                    {w.example ? (
                      <div className="mt-2 rounded-xl bg-[rgb(var(--kx-living-ink))]/[0.03] px-3 py-2">
                        <p className="text-xs font-semibold leading-relaxed text-[rgb(var(--kx-living-ink))]">{w.example}</p>
                        {w.exampleZh ? (
                          <p className="mt-0.5 text-[11px] font-medium leading-relaxed text-[rgb(var(--kx-living-muted))]">{w.exampleZh}</p>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => mark.mutate({ wordId: w.id, state: w.mastered ? "learning" : "mastered" })}
                    className={[
                      "inline-flex shrink-0 items-center gap-1 self-start rounded-full px-3 py-1.5 text-xs font-black transition",
                      w.mastered
                        ? "bg-emerald-500/[0.14] text-emerald-600 ring-1 ring-emerald-500/25 dark:text-emerald-400"
                        : "bg-[rgb(var(--kx-living-ink))]/[0.06] text-[rgb(var(--kx-living-muted))] hover:bg-[rgb(var(--kx-living-ink))]/[0.1]",
                    ].join(" ")}
                  >
                    <Check className="h-3.5 w-3.5" />
                    {w.mastered ? t("已掌握", "習得済み", "Mastered") : t("标记掌握", "習得にする", "Mark")}
                  </button>
                </div>
              ))}
            </div>
          </>
        ) : null}

        <JlptDisclaimer t={t} />
      </JlptNarrow>
    </GuideShell>
  );
}

// ── vocab quiz sub-component ──────────────────────────────────────────────────
function VocabQuiz({
  t,
  deck,
  onExit,
  onAuthRequired,
}: {
  t: Tri;
  deck: GuideJlptVocabDeck;
  onExit: () => void;
  onAuthRequired: () => void;
}) {
  const pushToast = useToasts((s) => s.push);
  const [quiz, setQuiz] = useState<GuideJlptVocabQuizStart | null>(null);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [result, setResult] = useState<GuideJlptVocabQuizResult | null>(null);

  const start = useMutation({
    mutationFn: () => guide.jlptVocabQuizStart({ deckId: deck.id, level: deck.level, count: 10 }),
    onSuccess: (data) => {
      setQuiz(data);
      setAnswers({});
      setResult(null);
    },
    onError: (err) => {
      if (isAuthRequiredError(err)) {
        onAuthRequired();
        return;
      }
      const ae = err as APIError;
      if (ae.code === "not_enough_words") {
        pushToast({ kind: "info", message: t("该词表词汇不足以生成测验", "テスト生成には単語が足りません", "Not enough words to build a quiz") });
        return;
      }
      pushToast({ kind: "error", message: ae.message });
    },
  });

  const submit = useMutation({
    mutationFn: () =>
      guide.jlptVocabQuizSubmit({
        sessionId: quiz!.sessionId,
        answers: quiz!.questions.map((_, i) => (answers[i] ?? -1)),
      }),
    onSuccess: (data) => setResult(data),
    onError: (err) => pushToast({ kind: "error", message: (err as APIError).message }),
  });

  // Auto-start the quiz exactly once when this sub-view mounts.
  const startRef = useRef(start.mutate);
  startRef.current = start.mutate;
  useEffect(() => {
    startRef.current();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <button
        type="button"
        onClick={onExit}
        className="inline-flex items-center gap-1.5 pt-2 text-sm font-semibold text-kx-muted hover:text-kx-accent"
      >
        <ArrowLeft className="h-4 w-4" /> {deck.title}
      </button>
      <JlptPageHeader
        eyebrow={`${deck.level} · ${t("考单词", "単語テスト", "Vocab quiz")}`}
        title={t("考单词", "単語テスト", "Vocab quiz")}
      />

      {start.isPending ? (
        <div className="mt-6">
          <InlineLoading />
        </div>
      ) : !quiz ? (
        <JlptStateCard
          icon={Sparkles}
          tone="accent"
          title={t("准备好开始了吗?", "始める準備はいい?", "Ready to start?")}
          action={
            <button
              type="button"
              onClick={() => start.mutate()}
              className="rounded-full bg-[rgb(var(--kx-living-accent))] px-5 py-2.5 text-sm font-bold text-[rgb(var(--kx-on-accent))] shadow-[0_14px_28px_-16px_rgb(var(--kx-living-accent)/0.8)] transition hover:opacity-90"
            >
              {t("重新开始", "もう一度", "Start")}
            </button>
          }
        />
      ) : result ? (
        <div className="mt-6">
          <JlptScoreHero
            t={t}
            score={result.score}
            metaLine={`${t(`答对 ${result.correct} / ${result.total}`, `${result.correct} / ${result.total} 正解`, `${result.correct} / ${result.total} correct`)} · ${fmtDuration(result.durationSeconds)}`}
          />
          <div className="mt-4 space-y-2.5">
            {quiz.questions.map((q, i) => {
              const row = result.results[i];
              const ok = row?.correct;
              return (
                <div
                  key={q.wordId}
                  className={[
                    "rounded-2xl border px-4 py-3.5 shadow-[0_16px_38px_-40px_rgb(var(--kx-shadow)/0.7)]",
                    ok ? "border-emerald-500/40 bg-emerald-500/[0.06]" : "border-red-500/40 bg-red-500/[0.06]",
                  ].join(" ")}
                >
                  <div className="flex items-start gap-2.5">
                    <span
                      className={[
                        "mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-lg text-white",
                        ok ? "bg-emerald-500" : "bg-red-500",
                      ].join(" ")}
                    >
                      {ok ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-black text-[rgb(var(--kx-living-ink))]">
                        {q.word}
                        {q.reading ? <span className="ml-2 text-xs font-bold text-[rgb(var(--kx-living-accent))]">{q.reading}</span> : null}
                      </p>
                      <p className="mt-1 text-xs font-bold text-[rgb(var(--kx-living-ink))]">
                        {t("正确", "正解", "Answer")}: {q.choices[row?.correctIndex ?? 0]}
                      </p>
                      {!ok ? (
                        <p className="mt-0.5 text-xs font-semibold text-red-600 dark:text-red-400">
                          {t("你选了", "あなたの回答", "You chose")}: {row?.selectedIndex >= 0 ? q.choices[row.selectedIndex] : t("未作答", "未回答", "—")}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => start.mutate()}
            className="mt-5 w-full rounded-full bg-[rgb(var(--kx-living-accent))] px-5 py-3 text-sm font-bold text-[rgb(var(--kx-on-accent))] shadow-[0_16px_32px_-18px_rgb(var(--kx-living-accent)/0.8)] transition hover:opacity-90"
          >
            {t("再考一次", "もう一度", "Retake")}
          </button>
        </div>
      ) : (
        <div className="mt-5">
          <div className="space-y-3">
            {quiz.questions.map((q, i) => (
              <div key={q.wordId} className="rounded-[24px] border border-[rgb(var(--kx-living-ink))]/[0.07] bg-[rgb(var(--kx-living-surface))] p-5 shadow-[0_22px_50px_-44px_rgb(var(--kx-shadow)/0.7)]">
                <p className="text-[11px] font-black uppercase tracking-wide tabular-nums text-[rgb(var(--kx-living-muted))]">
                  {i + 1} / {quiz.questions.length}
                </p>
                <p className="mt-2 text-[17px] font-bold leading-relaxed text-[rgb(var(--kx-living-ink))]">{q.stem}</p>
                <div className="mt-4 grid gap-2.5">
                  {q.choices.map((choice, ci) => {
                    const sel = answers[i] === ci;
                    return (
                      <button
                        key={ci}
                        type="button"
                        onClick={() => setAnswers((prev) => ({ ...prev, [i]: ci }))}
                        className={[
                          "flex items-center gap-3 rounded-2xl border px-4 py-3.5 text-left text-sm font-semibold transition",
                          sel
                            ? "border-[rgb(var(--kx-living-accent))]/70 bg-[rgb(var(--kx-living-accent))]/[0.08]"
                            : "border-[rgb(var(--kx-living-ink))]/[0.09] hover:border-[rgb(var(--kx-living-accent))]/45 hover:bg-[rgb(var(--kx-living-accent))]/[0.04]",
                        ].join(" ")}
                      >
                        <span
                          className={[
                            "grid h-7 w-7 shrink-0 place-items-center rounded-lg text-xs font-black transition",
                            sel ? "bg-[rgb(var(--kx-living-accent))] text-[rgb(var(--kx-on-accent))]" : "bg-[rgb(var(--kx-living-ink))]/[0.07] text-[rgb(var(--kx-living-muted))]",
                          ].join(" ")}
                        >
                          {String.fromCharCode(65 + ci)}
                        </span>
                        <span className="flex-1 text-[rgb(var(--kx-living-ink))]">{choice}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => submit.mutate()}
            disabled={Object.keys(answers).length !== quiz.questions.length || submit.isPending}
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[rgb(var(--kx-living-accent))] px-5 py-3.5 text-sm font-bold text-[rgb(var(--kx-on-accent))] shadow-[0_16px_32px_-18px_rgb(var(--kx-living-accent)/0.8)] transition hover:opacity-90 disabled:opacity-50"
          >
            {submit.isPending ? <Loader className="h-4 w-4 animate-spin" /> : null}
            {Object.keys(answers).length === quiz.questions.length
              ? t("交卷", "採点する", "Submit")
              : t(`还剩 ${quiz.questions.length - Object.keys(answers).length} 题`, `残り ${quiz.questions.length - Object.keys(answers).length} 問`, `${quiz.questions.length - Object.keys(answers).length} left`)}
          </button>
        </div>
      )}

      <JlptDisclaimer t={t} />
    </div>
  );
}
