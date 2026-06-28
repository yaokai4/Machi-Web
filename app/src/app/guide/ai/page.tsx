import type { Metadata } from "next";
import GuideAIChatClient from "./GuideAIChatClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { absolute: "Machi AI｜日本生活・升学・就职助手" },
  description:
    "Machi AI 是 Machi 的原创助手，帮你整理在日本生活、升学、就职以及使用 Machi 的步骤、清单与注意事项。重要决定请以官方与专业意见为准。",
  alternates: { canonical: "/guide/ai" },
  robots: { index: false, follow: false },
};

export default function GuideAIPage() {
  return <GuideAIChatClient />;
}
