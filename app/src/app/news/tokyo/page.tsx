import { NewsListClient } from "@/components/news/NewsListClient";

export default function TokyoNewsPage() {
  return <NewsListClient presetCity="tokyo" title="东京资讯" subtitle="东京交通、活动、区役所通知和城市生活提醒。" />;
}
