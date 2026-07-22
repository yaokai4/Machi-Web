import type {
  GuideJlptExam,
  GuideJlptExamStart,
  GuideJlptPaperAttempt,
} from "@/lib/guide";


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
