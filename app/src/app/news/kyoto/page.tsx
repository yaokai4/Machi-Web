import { NewsListClient } from "@/components/news/NewsListClient";

export default function KyotoNewsPage() {
  return <NewsListClient presetCity="kyoto" title="京都资讯" subtitle="京都活动、交通、区役所通知和生活提醒。" />;
}
