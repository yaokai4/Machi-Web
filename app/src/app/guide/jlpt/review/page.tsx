import { ReviewClient } from "./ReviewClient";

// JLPT 错题本 — questions whose latest attempt was wrong, with answers +
// explanations revealed and member AI 讲解. Backed by /api/guide/jlpt/review.
export default function JlptReviewPage() {
  return <ReviewClient />;
}
