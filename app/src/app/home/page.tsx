import type { Metadata } from "next";
import HomeClient from "./HomeClient";

const title = "Machi | 让陌生的城市，也有生活的门路";
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
      <p>让陌生的城市，也有生活的门路。</p>
      <p>Machi · Find your way into a new city.</p>
      <p>Machi · 知らない街でも、暮らし方は見つけられる。</p>
      <p>Machi 按城市和语言整理租房、二手、工作、活动、问答、本地服务、语言交换和真实生活经验。</p>
      <h2>首页信息流</h2>
      <p>推荐、同城、关注、热榜。</p>
      <p>搜索租房、语言交换、工作、活动、本地问题。</p>
      <p>选择当前城市、搜索内容、查看通知。</p>
    </section>
  );
}

export default function HomePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <HomeSsrSnapshot />
      <HomeClient />
    </>
  );
}
