import { ExamDatesClient } from "./ExamDatesClient";

// JLPT 考试日历 — the public official schedule (plain dates only) plus a
// countdown to the next sitting. Backed by /api/guide/jlpt/exam-dates.
export default function JlptExamDatesPage() {
  return <ExamDatesClient />;
}
