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
      <h2>Today in City / City Pulse</h2>
      <p>Tokyo 今天正在发生：找饭搭子、问租房、看活动、找语言交换、发现本地经验。</p>
      <p>Tokyo · Dining · 周五涩谷有人一起吃拉面吗？ 3 replies · 中文 / EN</p>
      <p>Tokyo · Housing · 新宿租房有哪些坑要避开？ 28 answers · 中文</p>
      <p>Tokyo · Language Exchange · Looking for Japanese-English exchange near Shibuya. 12 replies · EN / 日本語</p>
      <h2>不只是找信息，也是在城市里认识人。</h2>
      <p>More than local information — meet people in your city.</p>
      <p>情報を探すだけでなく、同じ街の人とつながる。</p>
      <p>找饭搭子、找咖啡搭子、找活动搭子、找运动搭子、找语言交换、找周末同行、找新朋友、本地互助、同城兴趣小组、初到城市的生活支持。</p>
      <h2>City Life</h2>
      <p>本地新闻、城市指南、问答、避坑经验、本地服务。</p>
      <h2>Social &amp; Offline</h2>
      <p>同城社交、同城搭子、约饭、活动、语言交换。</p>
      <h2>Opportunities</h2>
      <p>租房、二手、找工作、招聘、优惠。</p>
      <h2>搜索城市问题、频道和人</h2>
      <p>搜索租房、饭搭子、语言交换、工作、活动、本地问题...</p>
      <p>搜索结果包括帖子、用户、活动、频道、城市、商家、问答。</p>
      <h2>发布入口</h2>
      <p>问一个本地问题、找饭搭子、找活动搭子、找语言交换、发布二手、发布租房、发布招聘、发布活动、分享避坑经验。</p>
      <h2>消息、通知和个人主页</h2>
      <p>还没有消息。加入一个饭局、发起一次语言交换，城市里的回声会从这里开始。</p>
      <p>No messages yet. Join a dinner plan or start a language exchange — the city will echo back here.</p>
      <h2>界面语言与内容语言分开</h2>
      <p>界面语言：中文。内容语言：中文 + English + 日本語。城市：Tokyo。全部语言、只看中文、Only English、日本語のみ、自动翻译入口预留。</p>
      <h2>安全和信任</h2>
      <p>举报、拉黑、隐私设置、线下见面提醒、饭局安全提示、语言交换安全提示、虚假房源提醒、招聘诈骗提醒、商家认证、用户认证。</p>
      <h2>商家入口</h2>
      <p>创建商家主页、发布活动、发布优惠、发布招聘、申请认证、查看线索。餐厅发起 ramen meetup，语言学校发起 language exchange night，健身房发起 weekend running group，招聘者发布 local hiring。</p>
      <h2>Feed tabs</h2>
      <p>For You, City Pulse, Social, Questions, Opportunities, Latest, Trending.</p>
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
