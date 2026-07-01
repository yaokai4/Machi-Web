import { JLPTZoneClient } from "./JLPTZoneClient";

// 日语考级 is now a dedicated 备考专区 (JLPT prep hub): N5–N1 levels,
// member-priced resources/mock tests, roadmap articles, FAQ, and a study-plan
// CTA — backed by /api/guide/jlpt. (JLPT 备考的循环任务仍由「管理 → 目标/路径」
// 里的 JLPT 路径模板生成,专区页只做浏览与入口。)
export default function JlptPage() {
  return <JLPTZoneClient />;
}
