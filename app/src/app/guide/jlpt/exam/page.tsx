import { ExamClient } from "./ExamClient";

// JLPT 在线模考 — list exams, take a timed exam, submit for scoring, and review
// each question. Backed by /api/guide/jlpt/exam/*. Content is original/imported,
// never unauthorized past-paper text.
export default function JlptExamPage() {
  return <ExamClient />;
}
