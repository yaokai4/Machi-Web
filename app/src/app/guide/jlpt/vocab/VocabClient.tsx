"use client";

import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { BookOpenCheck, Loader, Check, Lock, ArrowLeft, Sparkles, ChevronRight } from "lucide-react";
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
import { LevelPicker, JlptDisclaimer, JLPT_LEVELS, fmtDuration, type Tri } from "../JlptKit";

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
        <header className="kx-guide-channel-header">
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[rgb(var(--kx-living-accent))]">
            JLPT · {t("单词", "単語", "Vocab")}
          </p>
          <h1 className="mt-1 text-xl font-black leading-tight text-[rgb(var(--kx-living-ink))] sm:text-2xl">
            {t("高频单词", "頻出単語", "Vocabulary decks")}
          </h1>
        </header>

        <div className="mt-4">
          <LevelPicker
            value={level}
            onChange={setLevel}
            levels={["", ...(JLPT_LEVELS as readonly string[])]}
            allLabel={t("全部", "すべて", "All")}
          />
        </div>

        {decksQ.isLoading ? (
          <InlineLoading />
        ) : decksQ.isError ? (
          <ErrorState />
        ) : !decksQ.data?.decks?.length ? (
          <div className="mt-8 flex min-h-[30vh] flex-col items-center justify-center text-center">
            <BookOpenCheck className="h-10 w-10 text-[rgb(var(--kx-living-muted))]" />
            <p className="mt-3 text-sm font-semibold text-[rgb(var(--kx-living-muted))]">
              {t("该等级暂无词表", "このレベルの単語帳はまだありません", "No decks for this level yet")}
            </p>
          </div>
        ) : (
          <section className="mt-5">
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {decksQ.data.decks.map((deck) => (
                <button
                  key={deck.id}
                  type="button"
                  onClick={() => openDeck(deck)}
                  className="flex items-start gap-3 rounded-2xl border border-[rgb(var(--kx-living-ink))]/[0.08] bg-[rgb(var(--kx-living-surface))] px-3.5 py-3.5 text-left transition hover:border-[rgb(var(--kx-living-accent))]/40"
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[rgb(var(--kx-living-accent))]/[0.12] text-sm font-black text-[rgb(var(--kx-living-accent))]">
                    {deck.level}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 text-sm font-black text-[rgb(var(--kx-living-ink))]">
                      {deck.title}
                      {deck.isMemberOnly ? <Lock className="h-3.5 w-3.5 text-[rgb(var(--kx-living-accent))]" /> : null}
                    </p>
                    {deck.description ? (
                      <p className="mt-0.5 line-clamp-2 text-xs font-semibold leading-snug text-[rgb(var(--kx-living-muted))]">
                        {deck.description}
                      </p>
                    ) : null}
                    <p className="mt-1 text-[11px] font-bold text-[rgb(var(--kx-living-muted))]">
                      {t(`${deck.wordCount} 词`, `${deck.wordCount} 語`, `${deck.wordCount} words`)}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 self-center text-[rgb(var(--kx-living-muted))]" />
                </button>
              ))}
            </div>
          </section>
        )}

        <JlptDisclaimer t={t} />
      </GuideShell>
    );
  }

  // ── quiz view ──
  if (view === "quiz" && activeDeck) {
    return (
      <GuideShell back={back}>
        <VocabQuiz
          t={t}
          deck={activeDeck}
          onExit={() => setView("deck")}
          onAuthRequired={() => openAuthPrompt({ kind: "generic", title: t("登录后开始测验", "ログインしてテスト開始", "Log in to start the quiz") })}
        />
      </GuideShell>
    );
  }

  // ── deck detail ──
  const memberBlocked =
    deckDetailQ.isError && (deckDetailQ.error as APIError)?.status === 403;
  const authBlocked = deckDetailQ.isError && isAuthRequiredError(deckDetailQ.error);

  return (
    <GuideShell back={back}>
      <button
        type="button"
        onClick={() => setView("decks")}
        className="inline-flex items-center gap-1.5 px-4 pt-1 text-sm font-semibold text-kx-muted hover:text-kx-accent sm:px-6"
      >
        <ArrowLeft className="h-4 w-4" /> {t("全部词表", "単語帳一覧", "All decks")}
      </button>

      <header className="kx-guide-channel-header">
        <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[rgb(var(--kx-living-accent))]">
          {activeDeck?.level} · {t("单词", "単語", "Vocab")}
        </p>
        <h1 className="mt-1 text-xl font-black leading-tight text-[rgb(var(--kx-living-ink))] sm:text-2xl">
          {activeDeck?.title}
        </h1>
      </header>

      {deckDetailQ.isLoading ? (
        <InlineLoading />
      ) : authBlocked ? (
        <div className="mt-8 flex min-h-[30vh] flex-col items-center justify-center text-center">
          <p className="text-sm font-semibold text-[rgb(var(--kx-living-muted))]">
            {t("登录后解锁全部单词", "ログインして全単語を解除", "Log in to unlock all words")}
          </p>
          <button
            type="button"
            onClick={() => openAuthPrompt("generic")}
            className="mt-4 rounded-full bg-[rgb(var(--kx-living-accent))] px-5 py-2.5 text-sm font-black text-white transition hover:opacity-90"
          >
            {t("登录", "ログイン", "Log in")}
          </button>
        </div>
      ) : memberBlocked ? (
        <div className="mt-8 flex min-h-[30vh] flex-col items-center justify-center text-center">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-[rgb(var(--kx-living-accent))]/[0.12] text-[rgb(var(--kx-living-accent))]">
            <Lock className="h-7 w-7" />
          </span>
          <p className="mt-3 max-w-sm text-sm font-semibold leading-relaxed text-[rgb(var(--kx-living-muted))]">
            {t(
              "该词表为会员专属,开通会员即可解锁全部单词与「考单词」测验。",
              "この単語帳は会員限定です。会員になると全単語と「単語テスト」が解放されます。",
              "This deck is members-only. Membership unlocks all words and the vocab quiz.",
            )}
          </p>
          <a
            href="/membership"
            className="mt-4 rounded-full bg-[rgb(var(--kx-living-accent))] px-5 py-2.5 text-sm font-black text-white transition hover:opacity-90"
          >
            {t("了解会员", "会員について", "See membership")}
          </a>
        </div>
      ) : deckDetailQ.isError ? (
        <ErrorState />
      ) : deckDetailQ.data ? (
        <>
          <button
            type="button"
            onClick={() => {
              if (!deckDetailQ.data.words.length) return;
              setView("quiz");
            }}
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-[rgb(var(--kx-living-accent))] px-5 py-2.5 text-sm font-black text-white transition hover:opacity-90"
          >
            <Sparkles className="h-4 w-4" /> {t("考单词", "単語テスト", "Vocab quiz")}
          </button>

          <GuideSectionTitle title={t("单词表", "単語一覧", "Words")} />
          <div className="mt-2 space-y-2">
            {deckDetailQ.data.words.map((w) => (
              <div
                key={w.id}
                className="flex items-start gap-3 rounded-xl border border-[rgb(var(--kx-living-ink))]/[0.08] bg-[rgb(var(--kx-living-surface))] px-3.5 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-base font-black text-[rgb(var(--kx-living-ink))]">
                    {w.word}
                    {w.reading ? (
                      <span className="ml-2 text-xs font-semibold text-[rgb(var(--kx-living-muted))]">{w.reading}</span>
                    ) : null}
                    {w.pos ? (
                      <span className="ml-2 rounded bg-[rgb(var(--kx-living-ink))]/[0.06] px-1.5 py-0.5 text-[10px] font-bold text-[rgb(var(--kx-living-muted))]">
                        {w.pos}
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-0.5 text-sm font-semibold text-[rgb(var(--kx-living-ink))]">
                    {w.meaningZh}
                    {w.meaningEn ? <span className="ml-2 text-xs text-[rgb(var(--kx-living-muted))]">{w.meaningEn}</span> : null}
                  </p>
                  {w.example ? (
                    <p className="mt-1 text-xs font-medium leading-relaxed text-[rgb(var(--kx-living-muted))]">
                      {w.example}
                      {w.exampleZh ? <span className="block">{w.exampleZh}</span> : null}
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => mark.mutate({ wordId: w.id, state: w.mastered ? "learning" : "mastered" })}
                  className={[
                    "inline-flex shrink-0 items-center gap-1 self-center rounded-full px-3 py-1.5 text-xs font-black transition",
                    w.mastered
                      ? "bg-emerald-500/[0.14] text-emerald-600 dark:text-emerald-400"
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
        className="inline-flex items-center gap-1.5 px-4 pt-1 text-sm font-semibold text-kx-muted hover:text-kx-accent sm:px-6"
      >
        <ArrowLeft className="h-4 w-4" /> {deck.title}
      </button>
      <header className="kx-guide-channel-header">
        <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[rgb(var(--kx-living-accent))]">
          {deck.level} · {t("考单词", "単語テスト", "Vocab quiz")}
        </p>
        <h1 className="mt-1 text-xl font-black leading-tight text-[rgb(var(--kx-living-ink))] sm:text-2xl">
          {t("考单词", "単語テスト", "Vocab quiz")}
        </h1>
      </header>

      {start.isPending ? (
        <InlineLoading />
      ) : !quiz ? (
        <div className="mt-8 flex min-h-[24vh] flex-col items-center justify-center text-center">
          <button
            type="button"
            onClick={() => start.mutate()}
            className="rounded-full bg-[rgb(var(--kx-living-accent))] px-5 py-2.5 text-sm font-black text-white transition hover:opacity-90"
          >
            {t("重新开始", "もう一度", "Start")}
          </button>
        </div>
      ) : result ? (
        <div className="mt-6">
          <div className="rounded-2xl border border-[rgb(var(--kx-living-accent))]/25 bg-[rgb(var(--kx-living-accent))]/[0.08] p-6 text-center">
            <p className="text-5xl font-black text-[rgb(var(--kx-living-accent))]">{result.score}</p>
            <p className="mt-2 text-sm font-bold text-[rgb(var(--kx-living-ink))]">
              {t(`答对 ${result.correct} / ${result.total}`, `${result.correct} / ${result.total} 正解`, `${result.correct} / ${result.total} correct`)}
              {" · "}
              {fmtDuration(result.durationSeconds)}
            </p>
          </div>
          <div className="mt-4 space-y-2">
            {quiz.questions.map((q, i) => {
              const row = result.results[i];
              const ok = row?.correct;
              return (
                <div
                  key={q.wordId}
                  className={[
                    "rounded-xl border px-3.5 py-3",
                    ok ? "border-emerald-500/40 bg-emerald-500/[0.06]" : "border-red-500/40 bg-red-500/[0.06]",
                  ].join(" ")}
                >
                  <p className="text-sm font-black text-[rgb(var(--kx-living-ink))]">
                    {q.word}
                    {q.reading ? <span className="ml-2 text-xs font-semibold text-[rgb(var(--kx-living-muted))]">{q.reading}</span> : null}
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
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => start.mutate()}
            className="mt-5 w-full rounded-full bg-[rgb(var(--kx-living-accent))] px-5 py-3 text-sm font-black text-white transition hover:opacity-90"
          >
            {t("再考一次", "もう一度", "Retake")}
          </button>
        </div>
      ) : (
        <div className="mt-5">
          <div className="space-y-3">
            {quiz.questions.map((q, i) => (
              <div key={q.wordId} className="rounded-2xl border border-[rgb(var(--kx-living-ink))]/[0.08] bg-[rgb(var(--kx-living-surface))] p-4">
                <p className="text-[11px] font-black uppercase tracking-wide text-[rgb(var(--kx-living-muted))]">
                  {i + 1} / {quiz.questions.length}
                </p>
                <p className="mt-1.5 text-base font-black text-[rgb(var(--kx-living-ink))]">{q.stem}</p>
                <div className="mt-3 grid gap-2">
                  {q.choices.map((choice, ci) => {
                    const sel = answers[i] === ci;
                    return (
                      <button
                        key={ci}
                        type="button"
                        onClick={() => setAnswers((prev) => ({ ...prev, [i]: ci }))}
                        className={[
                          "flex items-center gap-3 rounded-xl border px-3.5 py-3 text-left text-sm font-semibold transition",
                          sel
                            ? "border-[rgb(var(--kx-living-accent))] bg-[rgb(var(--kx-living-accent))]/[0.08]"
                            : "border-[rgb(var(--kx-living-ink))]/[0.1] hover:border-[rgb(var(--kx-living-accent))]/40",
                        ].join(" ")}
                      >
                        <span
                          className={[
                            "grid h-6 w-6 shrink-0 place-items-center rounded-md text-xs font-black",
                            sel ? "bg-[rgb(var(--kx-living-accent))] text-white" : "bg-[rgb(var(--kx-living-ink))]/[0.08] text-[rgb(var(--kx-living-muted))]",
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
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[rgb(var(--kx-living-accent))] px-5 py-3.5 text-sm font-black text-white transition hover:opacity-90 disabled:opacity-50"
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
