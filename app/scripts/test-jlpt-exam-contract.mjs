import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const sourceUrl = new URL("../src/app/guide/jlpt/exam/examContract.ts", import.meta.url);
const source = await readFile(sourceUrl, "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
  fileName: "examContract.ts",
}).outputText;
const contractUrl = `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`;
const {
  answerInputLocked,
  examDeadlineReached,
  fullAnswerSnapshot,
  listeningPlaybackCanStart,
  localizedScoreDivisionLabel,
  localizedScoreReferenceNote,
  normalizeListeningPolicy,
  resolvePaperSectionIndex,
  restoreAuthoritativeJlptSession,
  retryTransientJlptWrite,
  restoredAnswerState,
} = await import(contractUrl);


test("strict listening policy is fail-closed and allows only its first play", () => {
  const strict = normalizeListeningPolicy({
    mode: "strict",
    allowPause: true,
    allowSeek: false,
    allowReplay: false,
    maxPlays: 1,
    showTranscriptDuringAttempt: false,
  });
  assert.equal(strict.mode, "strict");
  assert.equal(strict.allowSeek, false);
  assert.equal(strict.showTranscriptDuringAttempt, false);
  assert.equal(listeningPlaybackCanStart(strict, 0, 0, false), true);
  assert.equal(listeningPlaybackCanStart(strict, 1, 0, true), false);
  // Pausing and resuming the same in-progress play is still allowed.
  assert.equal(listeningPlaybackCanStart(strict, 1, 12.5, false), true);
});

test("practice listening keeps seek, replay and unlimited playback", () => {
  const practice = normalizeListeningPolicy(undefined);
  assert.equal(practice.mode, "practice");
  assert.equal(practice.allowSeek, true);
  assert.equal(practice.allowReplay, true);
  assert.equal(listeningPlaybackCanStart(practice, 99, 0, true), true);
});

test("score divisions and reference disclaimer are localized, not raw server Chinese", () => {
  assert.equal(localizedScoreDivisionLabel("ja", "reading", "fallback"), "読解");
  assert.equal(localizedScoreDivisionLabel("en", "language_reading", "fallback"), "Language Knowledge & Reading");
  assert.equal(localizedScoreDivisionLabel("zh-Hans", "listening", "fallback"), "听解");
  assert.match(localizedScoreReferenceNote("en", "full"), /linear reference/i);
  assert.match(localizedScoreReferenceNote("ja", "written"), /参考/);
});


test("resume state comes from the server revision and remaining clock", () => {
  const restored = restoredAnswerState({
    durationSeconds: 6_600,
    remainingSeconds: 1_234,
    answerRevision: 8,
    answers: [
      { questionId: "q2", selectedIndex: 3, revision: 8 },
      { questionId: "q1", selectedIndex: 1, revision: 4 },
    ],
  });
  assert.deepEqual(restored, {
    answers: { q2: 3, q1: 1 },
    answerRevision: 8,
    remainingSeconds: 1_234,
  });
});

test("final snapshot follows paper order and omits unanswered questions", () => {
  assert.deepEqual(
    fullAnswerSnapshot(
      [{ id: "q1" }, { id: "q2" }, { id: "q3" }],
      { q3: 0, q1: 2 },
    ),
    [
      { questionId: "q1", selectedIndex: 2 },
      { questionId: "q3", selectedIndex: 0 },
    ],
  );
});

test("paper section restoration prefers authoritative exam id and clamps fallback", () => {
  const sections = [{ id: "language" }, { id: "reading" }, { id: "listening" }];
  assert.equal(
    resolvePaperSectionIndex(sections, {
      currentSectionExamId: "listening",
      currentSectionIndex: 0,
    }),
    2,
  );
  assert.equal(
    resolvePaperSectionIndex(sections, {
      currentSectionExamId: "missing",
      currentSectionIndex: 99,
    }),
    2,
  );
});

test("a transient lost write response replays the exact revision once", async () => {
  let calls = 0;
  const saved = await retryTransientJlptWrite(async () => {
    calls += 1;
    if (calls === 1) {
      throw { status: 0, code: "network_error" };
    }
    return { answerRevision: 4, idempotentReplay: true };
  });
  assert.equal(calls, 2);
  assert.deepEqual(saved, { answerRevision: 4, idempotentReplay: true });
});

test("a definitive revision conflict is not blindly replayed", async () => {
  let calls = 0;
  await assert.rejects(
    retryTransientJlptWrite(async () => {
      calls += 1;
      throw { status: 409, code: "answer_revision_conflict" };
    }),
  );
  assert.equal(calls, 1);
});

test("deadline keeps answers locked after an auto-submit failure", () => {
  assert.equal(answerInputLocked({ sealing: false, deadlineReached: true }), true);
  assert.equal(answerInputLocked({ sealing: false, deadlineReached: false }), false);
});

test("an untimed exam is never treated as an expired timed exam", () => {
  assert.equal(examDeadlineReached(0, 0), false);
  assert.equal(examDeadlineReached(3_000, 0), true);
  assert.equal(examDeadlineReached(3_000, 25), false);
});

test("conflict recovery replays the exact paid start credential", async () => {
  assert.equal(typeof restoreAuthoritativeJlptSession, "function");
  let observed;
  const resumed = await restoreAuthoritativeJlptSession({
    start: async (examId, options) => {
      observed = { examId, options };
      return { sessionId: "session-1", resumed: true, answerRevision: 4 };
    },
    examId: "exam-paid",
    expectedSessionId: "session-1",
    requestKey: "jlpt-web:exam-paid:original",
    confirmedChargeCoins: 100,
  });
  assert.deepEqual(observed, {
    examId: "exam-paid",
    options: {
      requestKey: "jlpt-web:exam-paid:original",
      confirmedChargeCoins: 100,
    },
  });
  assert.equal(resumed.answerRevision, 4);

  await assert.rejects(
    restoreAuthoritativeJlptSession({
      start: async () => ({ sessionId: "new-session", resumed: false }),
      examId: "exam-paid",
      expectedSessionId: "session-1",
      requestKey: "jlpt-web:exam-paid:original",
      confirmedChargeCoins: 100,
    }),
    /session changed/i,
  );
});
