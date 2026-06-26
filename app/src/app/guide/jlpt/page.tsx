import { GuideCategoryView } from "@/components/guide/GuideCategoryView";

// 日语考级 is a content/资料 channel like the other five guides — no personal
// study-plan generator jammed at the top. (JLPT 备考的循环任务由「管理 → 目标/
// 路径」里的 JLPT 路径模板生成,不再强加到浏览页。)
export default function JlptPage() {
  return <GuideCategoryView categoryKey="jlpt" />;
}
