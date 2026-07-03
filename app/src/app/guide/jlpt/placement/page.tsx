import { PlacementClient } from "./PlacementClient";

// JLPT 能力定级测试 — a mixed-section difficulty ladder that recommends a level
// and links straight into the study-plan generator. Backed by
// /api/guide/jlpt/placement/{start,submit}. Content is original/imported.
export default function JlptPlacementPage() {
  return <PlacementClient />;
}
