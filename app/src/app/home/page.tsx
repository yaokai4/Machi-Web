import type { Metadata } from "next";
import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import HomeClient from "./HomeClient";
import { prefetchRecommendFeedFirstPage } from "@/lib/server/feedPrefetch";

const title = "Machi | 在每一座城市，找到生活的回声";
const description =
  "Machi 按城市和语言整理租房、二手、工作、活动、问答、本地服务、语言交换和真实生活经验。";

export const metadata: Metadata = {
  title: { absolute: title },
  description,
  alternates: {
    canonical: "/home",
    languages: {
      "zh-CN": "/home",
      en: "/home?lang=en",
      ja: "/home?lang=ja",
      "x-default": "/home",
    },
  },
  openGraph: {
    title,
    description,
    url: "https://www.machicity.com/home",
    siteName: "Machi",
    type: "website",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "Machi home" }],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: ["/og-image.png"],
  },
};

const structuredData = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "Machi",
  applicationCategory: "LifestyleApplication",
  operatingSystem: "Web, iOS",
  url: "https://www.machicity.com/home",
  description,
  inLanguage: ["zh-CN", "en", "ja"],
  offers: { "@type": "Offer", price: "0", priceCurrency: "JPY" },
  featureList: [
    "City-based local life feed",
    "Local questions and answers",
    "Dining discussions and local activity groups",
    "Language exchange",
    "Housing, secondhand, jobs and events",
    "Messages, notifications and user profiles",
  ],
  potentialAction: {
    "@type": "SearchAction",
    target: "https://www.machicity.com/search?q={search_term_string}",
    "query-input": "required name=search_term_string",
  },
};

function HomeSsrSnapshot() {
  return (
    <section className="sr-only" aria-label="Machi Web App home summary">
      <h1>Machi</h1>
      <p>在每一座城市，找到生活的回声。</p>
      <p>Machi · Find the echoes of real life in every city.</p>
      <p>Machi · どの街でも、暮らしの声を見つける。</p>
      <p>Machi 按城市和语言整理租房、二手、工作、活动、问答、本地服务、语言交换和真实生活经验。</p>
      <h2>首页信息流</h2>
      <p>推荐、同城、关注、热榜。</p>
      <p>搜索租房、语言交换、工作、活动、本地问题。</p>
      <p>选择当前城市、搜索内容、查看通知。</p>
    </section>
  );
}

export default async function HomePage() {
  // SSR-prefetch the default feed's first page and hydrate React Query so the
  // first paint shows real content instead of a skeleton + client-side fetch
  // waterfall. The query key MUST match HomeClient's default
  // (mode="recommend", no region) — see HomeClient.tsx useInfiniteQuery.
  const queryClient = new QueryClient();
  const firstPage = await prefetchRecommendFeedFirstPage();
  if (firstPage) {
    queryClient.setQueryData(["feed", "recommend", "", ""], {
      pages: [firstPage],
      pageParams: [undefined],
    });
  }
  const dehydratedState = dehydrate(queryClient);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <HomeSsrSnapshot />
      <HydrationBoundary state={dehydratedState}>
        <HomeClient />
      </HydrationBoundary>
    </>
  );
}
