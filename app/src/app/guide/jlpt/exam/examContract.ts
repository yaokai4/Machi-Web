import type {
  GuideJlptExam,
  GuideJlptExamStart,
  GuideJlptListeningPolicy,
  GuideJlptPaperAttempt,
} from "@/lib/guide";


const PRACTICE_LISTENING_POLICY: GuideJlptListeningPolicy = {
  mode: "practice",
  allowPause: true,
  allowSeek: true,
  allowReplay: true,
  maxPlays: 0,
  showTranscriptDuringAttempt: true,
};

const STRICT_LISTENING_POLICY: GuideJlptListeningPolicy = {
  mode: "strict",
  allowPause: true,
  allowSeek: false,
  allowReplay: false,
  maxPlays: 1,
  showTranscriptDuringAttempt: false,
};


export function normalizeListeningPolicy(
  raw?: Partial<GuideJlptListeningPolicy> | null,
  fallbackMode: GuideJlptListeningPolicy["mode"] = "practice",
): GuideJlptListeningPolicy {
  // Only server-owned policy modes are accepted.  Returning canonical shapes
  // prevents a partly malformed payload from accidentally enabling one strict
  // control while disabling another.
  if (raw?.mode === "strict") return { ...STRICT_LISTENING_POLICY };
  if (raw?.mode === "practice") return { ...PRACTICE_LISTENING_POLICY };
  return fallbackMode === "strict"
    ? { ...STRICT_LISTENING_POLICY }
    : { ...PRACTICE_LISTENING_POLICY };
}


export function listeningPlaybackCanStart(
  policy: GuideJlptListeningPolicy,
  playsStarted: number,
  currentSeconds: number,
  ended: boolean,
): boolean {
  if (policy.maxPlays <= 0) return true;
  // Pausing does not consume another play; restarting from the beginning or
  // after the media ended does.
  if (!ended && currentSeconds > 0.05) return true;
  return playsStarted < policy.maxPlays;
}


function scoreLocale(language: string): "zh" | "ja" | "en" {
  const normalized = String(language || "").toLowerCase();
  if (normalized.startsWith("ja")) return "ja";
  if (normalized.startsWith("en")) return "en";
  return "zh";
}


export function localizedScoreDivisionLabel(
  language: string,
  key: string,
  fallback: string,
): string {
  const labels: Record<string, Record<"zh" | "ja" | "en", string>> = {
    language: {
      zh: "语言知识（文字・词汇・语法）",
      ja: "言語知識（文字・語彙・文法）",
      en: "Language Knowledge",
    },
    reading: { zh: "读解", ja: "読解", en: "Reading" },
    language_reading: {
      zh: "语言知识・读解",
      ja: "言語知識・読解",
      en: "Language Knowledge & Reading",
    },
    listening: { zh: "听解", ja: "聴解", en: "Listening" },
  };
  return labels[key]?.[scoreLocale(language)] || fallback;
}


export function localizedScoreReferenceNote(
  language: string,
  scope: "written" | "full",
): string {
  const locale = scoreLocale(language);
  if (locale === "ja") {
    return scope === "full"
      ? "JLPT公式の得点区分に沿った線形の参考スコアです。公式試験は等化済み尺度得点を用いるため、学習の振り返り用としてご利用ください。"
      : "JLPT公式の得点構成に沿った筆記の参考スコアです（聴解を含みません）。正式な合否は公式結果をご確認ください。";
  }
  if (locale === "en") {
    return scope === "full"
      ? "A linear reference score following JLPT score divisions. The official test uses equated scaled scores; use this only for study review."
      : "A written-section reference score following JLPT's score structure (listening excluded). Rely on the official result for pass/fail."
  }
  return scope === "full"
    ? "按 JLPT 官方得分区分线性折算的参考分；正式考试采用等化后的尺度分，仅供备考复盘，请以官方成绩为准。"
    : "按 JLPT 官方计分结构折算的笔试参考分（不含听解）；正式合否请以官方成绩为准。";
}


export function restoredAnswerState(session: GuideJlptExamStart): {
  answers: Record<string, number>;
  answerRevision: number;
  remainingSeconds: number;
} {
  const answers: Record<string, number> = {};
  for (const item of session.answers ?? []) {
    if (typeof item.questionId === "string" && Number.isInteger(item.selectedIndex)) {
      answers[item.questionId] = item.selectedIndex;
    }
  }
  return {
    answers,
    answerRevision: Math.max(0, Number(session.answerRevision ?? 0)),
    remainingSeconds: Math.max(
      0,
      Number(session.remainingSeconds ?? session.durationSeconds ?? 0),
    ),
  };
}


export function fullAnswerSnapshot(
  questions: Array<{ id: string }>,
  answers: Record<string, number>,
): Array<{ questionId: string; selectedIndex: number }> {
  return questions.flatMap((question) => {
    const selectedIndex = answers[question.id];
    return Number.isInteger(selectedIndex)
      ? [{ questionId: question.id, selectedIndex }]
      : [];
  });
}


export function resolvePaperSectionIndex(
  sections: GuideJlptExam[],
  progress?: Pick<GuideJlptPaperAttempt, "currentSectionExamId" | "currentSectionIndex"> | null,
): number {
  if (!sections.length) return 0;
  const byId = progress?.currentSectionExamId
    ? sections.findIndex((section) => section.id === progress.currentSectionExamId)
    : -1;
  if (byId >= 0) return byId;
  const raw = Number(progress?.currentSectionIndex ?? 0);
  if (!Number.isFinite(raw)) return 0;
  return Math.min(sections.length - 1, Math.max(0, Math.trunc(raw)));
}


export function newExamStartKey(examId: string): string {
  const suffix =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `jlpt-web:${examId}:${suffix}`;
}


export function answerInputLocked({
  sealing,
  deadlineReached,
}: {
  sealing: boolean;
  deadlineReached: boolean;
}): boolean {
  return sealing || deadlineReached;
}


export function examDeadlineReached(
  durationSeconds: number,
  remainingSeconds: number,
): boolean {
  return durationSeconds > 0 && remainingSeconds <= 0;
}


export async function restoreAuthoritativeJlptSession({
  start,
  examId,
  expectedSessionId,
  requestKey,
  confirmedChargeCoins,
}: {
  start: (
    examId: string,
    options: { requestKey: string; confirmedChargeCoins: number },
  ) => Promise<GuideJlptExamStart>;
  examId: string;
  expectedSessionId: string;
  requestKey: string;
  confirmedChargeCoins: number;
}): Promise<GuideJlptExamStart> {
  const resumed = await start(examId, { requestKey, confirmedChargeCoins });
  if (resumed.sessionId !== expectedSessionId || !resumed.resumed) {
    throw new Error("JLPT session changed while restoring progress");
  }
  return resumed;
}


function isTransientWriteError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const status = Number((error as { status?: unknown }).status ?? -1);
  const code = String((error as { code?: unknown }).code ?? "");
  return (
    status === 0 ||
    status >= 500 ||
    code === "network_error" ||
    code === "timeout" ||
    code === "parse_error"
  );
}


/** Replay the exact optimistic write once when its response may have been lost. */
export async function retryTransientJlptWrite<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (!isTransientWriteError(error)) throw error;
    return operation();
  }
}
