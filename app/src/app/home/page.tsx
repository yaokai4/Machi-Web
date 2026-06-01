import type { Metadata } from "next";
import HomeClient from "./HomeClient";

const title = "Machi | 在每一座城市，找到生活的回声 | Machi City Home";
const description =
  "Machi 是按城市和语言组织的本地生活与同城社交社区。用户可以发现城市里的租房、二手、工作、活动、问答和本地经验，也能认识城市里的人，寻找饭搭子、活动搭子、语言交换和本地互助。";

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
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "Machi City home" }],
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
  alternateName: "Machi City",
  applicationCategory: "SocialNetworkingApplication",
  operatingSystem: "Web, iOS",
  url: "https://www.machicity.com/home",
  description,
  inLanguage: ["zh-CN", "en", "ja"],
  offers: { "@type": "Offer", price: "0", priceCurrency: "JPY" },
  featureList: [
    "City-based local life feed",
    "Local questions and answers",
    "Dining buddies and event companions",
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
      <p>Machi City · Find the echoes of life in every city.</p>
      <p>Machi City · すべての街で、暮らしの響きを見つける。</p>
      <p>Machi 是按城市和语言组织的本地生活与同城社交社区。用户可以发现城市里的信息，也认识城市里的人。</p>
      <h2>首页信息流</h2>
      <p>推荐、同城、关注、热榜。</p>
      <p>搜索租房、饭搭子、语言交换、工作、活动、本地问题...</p>
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
