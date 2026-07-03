import { Suspense } from "react";
import { PracticeClient } from "./PracticeClient";

// JLPT 刷题练习 — pick a level + section, drill questions with instant grading
// and explanations, plus member AI 逐题讲解. Backed by
// /api/guide/jlpt/{practice,attempt,explain}. Content is original/imported.
export default function JlptPracticePage() {
  return (
    <Suspense>
      <PracticeClient />
    </Suspense>
  );
}
