import { VocabClient } from "./VocabClient";

// JLPT 高频单词 — vocab decks (member-gated content), per-word 掌握 marking, and
// a 考单词 online quiz. Backed by /api/guide/jlpt/vocab/*. Content is
// original/imported, never unauthorized past-paper text.
export default function JlptVocabPage() {
  return <VocabClient />;
}
