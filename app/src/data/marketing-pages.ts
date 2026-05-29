import type { MarketingLocale } from "./machi-home";

export type MarketingPageId =
  | "about"
  | "features"
  | "cities"
  | "business"
  | "safety"
  | "download"
  | "ads"
  | "contact"
  | "partners"
  | "jobs-promotion"
  | "housing-promotion"
  | "safety-center"
  | "privacy"
  | "terms";

export type MarketingPageItem = {
  title: string;
  body: string;
  meta?: string;
  href?: string;
};

export type MarketingPageBlock = {
  title: string;
  subtitle?: string;
  body?: string;
  variant?: "grid" | "list" | "store" | "contact" | "legal";
  items?: MarketingPageItem[];
};

export type MarketingPageCopy = {
  eyebrow: string;
  title: string;
  intro: string;
  blocks: MarketingPageBlock[];
};

export const marketingPageLabels: Record<MarketingPageId, string> = {
  about: "关于",
  features: "功能",
  cities: "城市",
  business: "商家合作",
  safety: "安全",
  download: "下载",
  ads: "广告投放",
  contact: "联系",
  partners: "系统合作",
  "jobs-promotion": "招聘推广",
  "housing-promotion": "租房推广",
  "safety-center": "安全中心",
  privacy: "隐私政策",
  terms: "服务条款",
};

const cities: Record<MarketingLocale, MarketingPageItem[]> = {
  zh: [
    { title: "东京 Tokyo", meta: "Japan", body: "租房、二手、兼职、约饭和本地提醒都在这里。" },
    { title: "大阪 Osaka", meta: "Japan", body: "美食、活动、生活攻略和同城求助更快被看到。" },
    { title: "上海 Shanghai", meta: "China", body: "把本地动态、招聘、租房和服务放回城市语境。" },
    { title: "杭州 Hangzhou", meta: "China", body: "面向年轻生活方式、工作机会和本地服务。" },
    { title: "洛杉矶 Los Angeles", meta: "United States", body: "英文、中文和多语言内容按城市聚合。" },
    { title: "多伦多 Toronto", meta: "Canada", body: "留学、工作、租房、服务与活动入口。" },
    { title: "伦敦 London", meta: "United Kingdom", body: "让海外生活信息不再散落在不同群聊里。" },
    { title: "悉尼 Sydney", meta: "Australia", body: "城市频道连接租房、工作、二手和周末生活。" },
  ],
  en: [
    { title: "Tokyo", meta: "Japan", body: "Housing, secondhand, part-time jobs, dining plans and local alerts." },
    { title: "Osaka", meta: "Japan", body: "Food, events, guides and questions surfaced by city." },
    { title: "Shanghai", meta: "China", body: "Local posts, jobs, housing and services in one city context." },
    { title: "Hangzhou", meta: "China", body: "Young city life, career signals and trusted local services." },
    { title: "Los Angeles", meta: "United States", body: "English, Chinese and multilingual content organized by city." },
    { title: "Toronto", meta: "Canada", body: "Study, work, housing, services and events for the city experience." },
    { title: "London", meta: "United Kingdom", body: "Bringing scattered overseas-life information into one place." },
    { title: "Sydney", meta: "Australia", body: "City channels for housing, jobs, secondhand and weekends." },
  ],
  ja: [
    { title: "東京 Tokyo", meta: "Japan", body: "住まい、フリマ、バイト、食事会、地域のお知らせを都市別に。" },
    { title: "大阪 Osaka", meta: "Japan", body: "グルメ、イベント、生活ガイド、相談が見つかります。" },
    { title: "上海 Shanghai", meta: "China", body: "投稿、求人、住まい、サービスを都市の文脈で整理。" },
    { title: "杭州 Hangzhou", meta: "China", body: "若い暮らし、仕事の機会、地域サービスに出会えます。" },
    { title: "ロサンゼルス Los Angeles", meta: "United States", body: "英語、中国語、多言語の投稿を都市ごとに集約。" },
    { title: "トロント Toronto", meta: "Canada", body: "留学、仕事、住まい、サービス、イベントの入口。" },
    { title: "ロンドン London", meta: "United Kingdom", body: "海外生活の情報を、散らばった場所からひとつに。" },
    { title: "シドニー Sydney", meta: "Australia", body: "住まい、仕事、フリマ、週末の暮らしを都市チャンネルで。" },
  ],
};

export const marketingPages: Record<MarketingPageId, Record<MarketingLocale, MarketingPageCopy>> = {
  about: {
    zh: {
      eyebrow: "关于 Machi City",
      title: "在每一座城市，找到生活的回声。",
      intro: "Machi City 把散落在群聊、社交平台、论坛和朋友之间的城市经验，按城市、语言、话题、热度和可信经验重新整理，让每一座城市的真实生活被看见、被找到、被回应。",
      blocks: [
        { title: "为什么做 Machi City", subtitle: "真正的城市藏在普通人的日常里。", body: "一个刚搬来的人在问这个区适不适合住，一个准备回国的人在出二手，一个找工作的人分享面试经验。Machi 希望让这些小而真实的声音被看见、被找到、被回应。我们相信，让人留在一座城市的不是地址，而是你在这里找到的生活感。" },
        { title: "核心价值观", variant: "grid", items: [
          { title: "本地优先", body: "每条内容都属于一座具体的城市，而不是漂浮在互联网上的碎片。" },
          { title: "真实可信", body: "鼓励真实身份、真实经验、真实链接，拒绝标题党和搬运。" },
          { title: "尊重表达", body: "中文、英文、日文、韩文同等被看见，多语言城市需要多语言内容。" },
          { title: "克制设计", body: "iOS 质感、卡片化、克制动效。不打扰，不投喂，不上瘾设计。" },
        ] },
        { title: "产品方向", variant: "grid", items: [
          { title: "城市优先", body: "国家 → 省份/州 → 城市，是内容的第一层组织方式。" },
          { title: "语言友好", body: "界面语言和内容语言分开，适合东京、多伦多、洛杉矶这样的多语言城市。" },
          { title: "真实生活", body: "租房、工作、二手、约饭、问答、服务都来自城市日常，而不是营销内容。" },
          { title: "商家共生", body: "本地商家、招聘方、房产中介、服务商也能在自己的城市频道里被找到。" },
        ] },
        { title: "上线路线图", variant: "list", items: [
          { meta: "2026 Q2", title: "官网首页 + 三语切换", body: "城市展示、内容频道、热榜、商家合作入口、等待名单。" },
          { meta: "2026 Q3", title: "iOS / Android 首批城市开放", body: "东京、洛杉矶、多伦多优先开放，等待名单用户优先获得 App 测试邀请。" },
          { meta: "2026 Q4", title: "商家认证 + 城市广告", body: "为本地商家、招聘方、房产中介开放认证和城市级曝光。" },
          { meta: "2027+", title: "更多城市与语言", body: "按城市需求逐步开放更多城市频道和内容语言。" },
        ] },
        { title: "我们是谁", subtitle: "Machi City 是一个小而专注的团队。", body: "我们来自产品、设计、社区运营和工程，分布在不同城市，但都相信本地内容值得被认真对待。如果你在留学、海外生活、移居或本地社区领域有经验，欢迎一起把 Machi 做成你想用的产品。" },
        { title: "联系我们", variant: "contact", body: "合作、媒体、测试邀请或城市开放建议都可以联系 hello@machicity.com。" },
      ],
    },
    en: {
      eyebrow: "About Machi City",
      title: "Find the echoes of life in every city.",
      intro: "Machi City pulls the city stories that usually scatter across chats, social feeds, forums and friends into one place — re-organised by city, language, topic, heat and the trustworthy people who lived it.",
      blocks: [
        { title: "Why Machi City exists", subtitle: "The real city lives in ordinary days.", body: "Someone new asks which neighborhood feels right. Someone leaving sells furniture. Someone looking for work shares interview notes. Machi helps these quiet, useful signals be seen, found and answered. What keeps people in a city is not an address — it is the sense of life they find there." },
        { title: "Core values", variant: "grid", items: [
          { title: "Local first", body: "Every post belongs to a specific city, not a piece floating on the open internet." },
          { title: "Trust by default", body: "We welcome real identities, lived experience and honest links. We turn down clickbait and reposted noise." },
          { title: "Respect language", body: "Chinese, English, Japanese and Korean are equally visible. Multilingual cities need multilingual content." },
          { title: "Quiet design", body: "iOS texture, card layouts, restrained motion. Nothing engineered to interrupt, feed or addict." },
        ] },
        { title: "Product direction", variant: "grid", items: [
          { title: "City first", body: "Country → state or province → city forms the core content structure." },
          { title: "Language aware", body: "Interface language and content language are separate so cities like Tokyo, Toronto and Los Angeles all work." },
          { title: "Real city experience", body: "Housing, jobs, secondhand, dining, Q&A and services all come from everyday city life — not marketing." },
          { title: "Merchant friendly", body: "Local merchants, hiring teams, housing agents and service providers can be found inside their own city channels." },
        ] },
        { title: "Roadmap", variant: "list", items: [
          { meta: "2026 Q2", title: "Website + tri-lingual switcher", body: "City showcase, content channels, ranking, business entry, waitlist." },
          { meta: "2026 Q3", title: "iOS / Android first cities", body: "Tokyo, Los Angeles and Toronto open first. Waitlist users get early test invites." },
          { meta: "2026 Q4", title: "Merchant verification + city ads", body: "Verification and city-level exposure for local merchants, hiring teams and housing agents." },
          { meta: "2027+", title: "More cities, more languages", body: "Open city channels and content languages on demand." },
        ] },
        { title: "Who we are", subtitle: "Machi City is a small, focused team.", body: "We come from product, design, community ops and engineering — spread across multiple cities — and we all believe local content deserves serious attention. If you have experience in study abroad, expat life, relocation or community operations, build Machi with us." },
        { title: "Contact", variant: "contact", body: "For partnerships, press, beta access or city-launch ideas, contact hello@machicity.com." },
      ],
    },
    ja: {
      eyebrow: "Machi City について",
      title: "すべての街で、暮らしのこだまを見つける。",
      intro: "Machi City は、チャットや SNS、友人同士の間に散らばる地域の質問、経験、機会を集め直し、それぞれの街に「暮らしの広場」を用意します。",
      blocks: [
        { title: "なぜ Machi City をつくるのか", subtitle: "本当の街は、ふつうの日常の中にあります。", body: "引っ越してきた人が住みやすいエリアを尋ねる。帰国する人が家具を譲る。仕事を探す人が面接経験を共有する。Machi は、そんな小さくて本物の声が見つかり、返事が届く場所を目指します。人を街にとどまらせるのは住所ではなく、その街で見つける生活感です。" },
        { title: "わたしたちの価値観", variant: "grid", items: [
          { title: "地域優先", body: "すべての投稿はひとつの街に属します。インターネット上に漂う断片ではありません。" },
          { title: "信頼が前提", body: "本名・本物の経験・実在のリンクを歓迎し、釣りタイトルや転載は受け入れません。" },
          { title: "言語を尊重", body: "中国語、英語、日本語、韓国語を同じ重みで扱います。多言語都市には多言語のコンテンツが必要です。" },
          { title: "静かな設計", body: "iOS の質感、カードレイアウト、控えめな動き。割り込み・依存設計はしません。" },
        ] },
        { title: "プロダクトの方向性", variant: "grid", items: [
          { title: "都市から始まる", body: "国 → 都道府県・州 → 都市を、コンテンツ整理の中心に置きます。" },
          { title: "多言語に強い", body: "画面言語と投稿言語を分け、東京・トロント・ロサンゼルスのような多言語都市に対応します。" },
          { title: "本物の地域生活", body: "住まい、仕事、フリマ、食事、相談、サービスをマーケティングではなく日常から集めます。" },
          { title: "店舗と共存", body: "店舗、採用担当、不動産、サービス事業者も、自分の街のチャンネルから見つかります。" },
        ] },
        { title: "ロードマップ", variant: "list", items: [
          { meta: "2026 Q2", title: "公式サイト + 三言語切替", body: "都市紹介、コンテンツチャンネル、トレンド、ビジネス窓口、ウェイトリスト。" },
          { meta: "2026 Q3", title: "iOS / Android 初期都市の公開", body: "東京、ロサンゼルス、トロントが先行公開。ウェイトリスト登録者に優先テスト招待。" },
          { meta: "2026 Q4", title: "店舗認証と都市広告", body: "店舗、採用担当、不動産向けに認証と都市単位の露出を開始。" },
          { meta: "2027+", title: "より多くの街と言語へ", body: "需要に応じて新しい都市チャンネルとコンテンツ言語を順次公開。" },
        ] },
        { title: "わたしたちについて", subtitle: "Machi City は小さく集中したチームです。", body: "プロダクト、デザイン、コミュニティ運営、エンジニアリングの仲間が複数の都市にまたがって取り組んでいます。地域コンテンツは丁寧に扱う価値があると信じています。留学、海外生活、移住、地域コミュニティに知見がある方は、ぜひ一緒に。" },
        { title: "お問い合わせ", variant: "contact", body: "提携、取材、テスト参加、都市展開のご提案は hello@machicity.com まで。" },
      ],
    },
  },
  features: {
    zh: {
      eyebrow: "功能",
      title: "城市经验的完整功能矩阵。",
      intro: "从内容、交易、工作到线下连接，Machi City 把一座城市需要的日常入口整理在同一个 App。",
      blocks: [
        { title: "内容频道", variant: "grid", items: [
          { title: "新闻与攻略", body: "本地快讯、政策提醒、生活经验和避坑指南。" },
          { title: "问答与经验", body: "把零散问题沉淀成可搜索的城市知识。" },
          { title: "热榜", body: "城市、国家、全站三层热度发现。" },
          { title: "多语言内容", body: "按用户选择的内容语言优先推荐。" },
        ] },
        { title: "生活交易", variant: "grid", items: [
          { title: "二手", body: "闲置转让、搬家甩卖、求购和免费赠送。" },
          { title: "租房", body: "找房、转租、合租、室友和避坑提醒。" },
          { title: "服务", body: "搬家、签证、翻译、维修、报税等本地服务。" },
          { title: "优惠", body: "商家折扣、团购和限时活动。" },
        ] },
        { title: "连接城市的人", variant: "grid", items: [
          { title: "招聘与工作", body: "兼职、全职、实习、内推和本地招聘。" },
          { title: "搭子与约饭", body: "学习、运动、语言交换、咖啡和周末饭局。" },
          { title: "活动", body: "展览、Citywalk、桌游、运动和线下聚会。" },
        ] },
      ],
    },
    en: {
      eyebrow: "Features",
      title: "A complete city-experience feature set.",
      intro: "From content and local exchange to jobs and offline connections, Machi City organizes city life into one app.",
      blocks: [
        { title: "Content channels", variant: "grid", items: [
          { title: "News and guides", body: "Local updates, policy reminders, lived experience and practical guides." },
          { title: "Q&A and experience", body: "Turn scattered questions into searchable city knowledge." },
          { title: "Trends", body: "Discover what is hot across city, country and global layers." },
          { title: "Multilingual content", body: "Prioritize the content languages each user chooses." },
        ] },
        { title: "Local exchange", variant: "grid", items: [
          { title: "Secondhand", body: "Listings, moving sales, wanted posts and free giveaways." },
          { title: "Housing", body: "Rentals, sublets, shared homes, roommates and warnings." },
          { title: "Services", body: "Moving, visa, translation, repair, tax and local help." },
          { title: "Deals", body: "Local discounts, group deals and limited-time offers." },
        ] },
        { title: "People and opportunities", variant: "grid", items: [
          { title: "Jobs and hiring", body: "Part-time, full-time, internships, referrals and local hiring." },
          { title: "Mates and dining", body: "Study, sports, language exchange, coffee and weekend meals." },
          { title: "Events", body: "Exhibitions, city walks, board games, sports and meetups." },
        ] },
      ],
    },
    ja: {
      eyebrow: "機能",
      title: "地域生活に必要な機能をひとつに。",
      intro: "コンテンツ、取引、仕事、オフラインのつながりまで、Machi City は街の暮らしの入口を整理します。",
      blocks: [
        { title: "コンテンツチャンネル", variant: "grid", items: [
          { title: "ニュースとガイド", body: "地域ニュース、制度の注意、生活経験、避けたい落とし穴。" },
          { title: "Q&A と経験", body: "散らばった質問を検索できる街の知識へ。" },
          { title: "トレンド", body: "都市、国、全体の三層で話題を発見。" },
          { title: "多言語投稿", body: "ユーザーが選んだ投稿言語を優先します。" },
        ] },
        { title: "地域の取引", variant: "grid", items: [
          { title: "フリマ", body: "譲渡、引っ越し売り、探し物、無料譲渡。" },
          { title: "住まい", body: "賃貸、サブリース、シェア、ルームメイト、注意喚起。" },
          { title: "サービス", body: "引っ越し、ビザ、翻訳、修理、税務など。" },
          { title: "お得情報", body: "地域のお店の割引、共同購入、期間限定特典。" },
        ] },
        { title: "人と機会をつなぐ", variant: "grid", items: [
          { title: "仕事と採用", body: "バイト、正社員、インターン、紹介、地域採用。" },
          { title: "仲間と食事", body: "勉強、運動、言語交換、カフェ、週末ごはん。" },
          { title: "イベント", body: "展示、Citywalk、ボードゲーム、スポーツ、交流会。" },
        ] },
      ],
    },
  },
  cities: {
    zh: { eyebrow: "城市", title: "一个 App，连接每座城市。", intro: "从东京到洛杉矶，从杭州到多伦多，Machi City 让每座城市都有自己的生活入口。", blocks: [{ title: "首批城市", variant: "grid", items: cities.zh }] },
    en: { eyebrow: "Cities", title: "One app for every city.", intro: "From Tokyo to Los Angeles, Hangzhou to Toronto, Machi City gives every city its own entry into real experience.", blocks: [{ title: "Launch cities", variant: "grid", items: cities.en }] },
    ja: { eyebrow: "都市", title: "ひとつのアプリで、すべての街へ。", intro: "東京からロサンゼルス、杭州からトロントまで、Machi City は街ごとの暮らしの入口をつくります。", blocks: [{ title: "初期都市", variant: "grid", items: cities.ja }] },
  },
  business: {
    zh: { eyebrow: "商家合作", title: "让本地用户发现你的店铺、服务和机会。", intro: "Machi City 为商家、招聘方、房产中介、服务商和活动方提供城市曝光入口。", blocks: [{ title: "合作方式", variant: "grid", items: [
      { title: "商家认证", body: "建立官方身份和可信展示。" },
      { title: "城市广告", body: "按城市、频道和语言触达用户。" },
      { title: "招聘推广", body: "把岗位推给本地合适人群。" },
      { title: "优惠与活动", body: "让折扣和线下活动被附近用户看到。" },
    ] }, { title: "适合谁", body: "餐饮、零售、房产、留学、法律、税务、维修、搬家、活动组织者和本地服务团队。" }] },
    en: { eyebrow: "For Business", title: "Help local users discover your shop, service or opportunity.", intro: "Machi City gives merchants, recruiters, housing agents, service providers and event teams a city-level channel.", blocks: [{ title: "Partnership options", variant: "grid", items: [
      { title: "Verified business", body: "Build trust with an official profile." },
      { title: "City ads", body: "Reach by city, channel and language." },
      { title: "Hiring promotion", body: "Show jobs to the right local audience." },
      { title: "Deals and events", body: "Surface offers and offline moments nearby." },
    ] }, { title: "Who it is for", body: "Food, retail, housing, education, legal, tax, repair, moving, events and local service teams." }] },
    ja: { eyebrow: "ビジネス", title: "お店、サービス、機会を地域ユーザーへ。", intro: "Machi City は店舗、採用担当、不動産、サービス事業者、イベント主催者のための都市別入口を提供します。", blocks: [{ title: "提携メニュー", variant: "grid", items: [
      { title: "事業者認証", body: "公式プロフィールで信頼をつくります。" },
      { title: "都市広告", body: "都市、チャンネル、言語で届けます。" },
      { title: "採用プロモーション", body: "求人を地域の適切な人へ表示。" },
      { title: "割引とイベント", body: "近くのユーザーに特典とイベントを届けます。" },
    ] }, { title: "対象", body: "飲食、小売、不動産、留学、法律、税務、修理、引っ越し、イベント、地域サービス事業者。" }] },
  },
  safety: {
    zh: { eyebrow: "安全", title: "让城市里的真实连接更可信。", intro: "二手、租房、招聘、搭子、约饭和服务都需要清晰的安全提醒、举报和认证机制。", blocks: [{ title: "安全能力", variant: "grid", items: [
      { title: "举报与审核", body: "对风险内容、骚扰、诈骗和虚假信息快速处理。" },
      { title: "隐私与拉黑", body: "控制互动边界，保护个人空间。" },
      { title: "交易提醒", body: "对二手、租房、服务交易提供风险提示。" },
      { title: "商家认证", body: "为本地服务和商家建立可信身份。" },
    ] }] },
    en: { eyebrow: "Safety", title: "Safer real connections in every city.", intro: "Secondhand, housing, hiring, meetups, dining and services need clear safety prompts, reports and verification.", blocks: [{ title: "Safety tools", variant: "grid", items: [
      { title: "Reports and review", body: "Handle risky content, harassment, scams and false information." },
      { title: "Privacy and blocking", body: "Control interaction boundaries and protect personal space." },
      { title: "Transaction reminders", body: "Warn users about risks in secondhand, housing and services." },
      { title: "Business verification", body: "Create trusted identities for local businesses and services." },
    ] }] },
    ja: { eyebrow: "安全", title: "地域のつながりを、より安心に。", intro: "フリマ、住まい、採用、仲間探し、食事、サービスには、安全表示、通報、認証が必要です。", blocks: [{ title: "安全機能", variant: "grid", items: [
      { title: "通報と審査", body: "危険な投稿、嫌がらせ、詐欺、虚偽情報に対応。" },
      { title: "プライバシーとブロック", body: "交流の境界を自分で管理できます。" },
      { title: "取引の注意喚起", body: "フリマ、住まい、サービス取引のリスクを表示。" },
      { title: "事業者認証", body: "地域の店舗やサービスに信頼できる身元を。" },
    ] }] },
  },
  download: {
    zh: { eyebrow: "下载", title: "在你顺手的端访问 Machi City。", intro: "iOS、Android 与 Web 共享同一份账号、地区和语言偏好。", blocks: [{ title: "移动 App", variant: "store", body: "App Store 和 Google Play 正在筹备中，上线后会在这里更新官方入口。" }, { title: "Web 客户端", body: "现在可以先使用 Web 端体验首页、发现、搜索、通知、私信、投稿和个人页。" }, { title: "加入等待名单", body: "注册账号后，我们会按城市开放节奏发送测试邀请和上线通知。" }] },
    en: { eyebrow: "Download", title: "Use Machi City on the device that fits your day.", intro: "iOS, Android and Web share the same account, region and language preferences.", blocks: [{ title: "Mobile apps", variant: "store", body: "App Store and Google Play releases are being prepared. Official links will appear here when ready." }, { title: "Web app", body: "You can already use the Web app for home, discovery, search, notifications, messages, posting and profiles." }, { title: "Join the waitlist", body: "Create an account to receive beta invites and launch updates by city." }] },
    ja: { eyebrow: "ダウンロード", title: "使いやすい端末で Machi City へ。", intro: "iOS、Android、Web は同じアカウント、地域、言語設定を共有します。", blocks: [{ title: "モバイルアプリ", variant: "store", body: "App Store と Google Play は準備中です。公開後、公式リンクをここに掲載します。" }, { title: "Web アプリ", body: "ホーム、発見、検索、通知、メッセージ、投稿、プロフィールを Web で利用できます。" }, { title: "ウェイトリスト", body: "アカウントを作成すると、都市ごとのテスト招待と公開情報を受け取れます。" }] },
  },
  ads: {
    zh: { eyebrow: "广告投放", title: "城市级曝光，触达真正附近的人。", intro: "按城市、频道、语言和内容场景投放，让广告更像有用信息。", blocks: [{ title: "投放场景", variant: "grid", items: [{ title: "城市首页", body: "进入城市时最先看到的曝光位。" }, { title: "频道置顶", body: "租房、招聘、优惠、活动等频道内推荐。" }, { title: "热榜旁曝光", body: "围绕城市关注内容获得自然触达。" }] }] },
    en: { eyebrow: "Ads", title: "City-level reach for people nearby.", intro: "Target by city, channel, language and local intent so ads feel useful.", blocks: [{ title: "Placements", variant: "grid", items: [{ title: "City home", body: "High-visibility entry when users open a city." }, { title: "Channel pin", body: "Promoted spots in housing, hiring, deals and events." }, { title: "Trend context", body: "Appear near what the city is already paying attention to." }] }] },
    ja: { eyebrow: "広告", title: "近くの人に届く都市別プロモーション。", intro: "都市、チャンネル、言語、利用シーンに合わせて、役立つ情報として届けます。", blocks: [{ title: "掲載場所", variant: "grid", items: [{ title: "都市ホーム", body: "都市を開いた時に目に入る入口。" }, { title: "チャンネル固定", body: "住まい、採用、割引、イベント内で表示。" }, { title: "トレンド周辺", body: "街で注目されている話題の近くで自然に接触。" }] }] },
  },
  contact: {
    zh: { eyebrow: "联系", title: "和 Machi City 团队联系。", intro: "合作、媒体、城市开放、问题反馈和测试邀请都可以从这里开始。", blocks: [{ title: "联系方式", variant: "contact", body: "邮箱 hello@machicity.com。请在邮件里说明城市、合作类型和你的联系方式。" }, { title: "我们会优先回复", variant: "list", items: [{ title: "城市合作", body: "本地组织、学校、社群和服务机构。" }, { title: "商家合作", body: "门店、招聘方、房产中介和服务商。" }, { title: "产品反馈", body: "官网、Web 端和 App 体验问题。" }] }] },
    en: { eyebrow: "Contact", title: "Talk to the Machi City team.", intro: "Partnerships, press, city launches, feedback and beta access can start here.", blocks: [{ title: "Email", variant: "contact", body: "Contact hello@machicity.com. Please include your city, partnership type and contact details." }, { title: "Priority topics", variant: "list", items: [{ title: "City partnerships", body: "Local organizations, schools, communities and service providers." }, { title: "Business partnerships", body: "Stores, recruiters, housing agents and service teams." }, { title: "Product feedback", body: "Website, Web app and mobile app experience issues." }] }] },
    ja: { eyebrow: "お問い合わせ", title: "Machi City チームへ連絡する。", intro: "提携、取材、都市展開、フィードバック、テスト参加はこちらから。", blocks: [{ title: "メール", variant: "contact", body: "hello@machicity.com まで。都市、提携内容、連絡先をご記入ください。" }, { title: "優先的に確認する内容", variant: "list", items: [{ title: "都市提携", body: "地域団体、学校、コミュニティ、サービス機関。" }, { title: "事業者提携", body: "店舗、採用担当、不動産、サービス事業者。" }, { title: "製品フィードバック", body: "公式サイト、Web、アプリの体験に関する問題。" }] }] },
  },
  partners: {
    zh: { eyebrow: "系统合作", title: "把城市资源接入 Machi City。", intro: "面向城市社群、学校、服务机构、媒体和本地组织开放合作。", blocks: [{ title: "合作方向", variant: "grid", items: [{ title: "内容合作", body: "本地攻略、新闻、活动和服务目录。" }, { title: "城市运营", body: "共建城市频道、精选内容和活动计划。" }, { title: "数据与服务", body: "未来可扩展安全合规的数据接口和服务线索。" }] }] },
    en: { eyebrow: "Partners", title: "Bring city resources into Machi City.", intro: "Open to local communities, schools, service institutions, media and city organizations.", blocks: [{ title: "Partnership paths", variant: "grid", items: [{ title: "Content", body: "Local guides, news, events and service directories." }, { title: "City operations", body: "Co-build city channels, curated posts and event plans." }, { title: "Data and services", body: "Future compliant APIs and service leads." }] }] },
    ja: { eyebrow: "パートナー", title: "都市のリソースを Machi City へ。", intro: "地域コミュニティ、学校、サービス機関、メディア、地域団体と連携します。", blocks: [{ title: "連携の方向", variant: "grid", items: [{ title: "コンテンツ", body: "地域ガイド、ニュース、イベント、サービス一覧。" }, { title: "都市運営", body: "都市チャンネル、注目投稿、イベント計画を共創。" }, { title: "データとサービス", body: "将来的な安全で適法なAPIやサービス導線。" }] }] },
  },
  "jobs-promotion": {
    zh: { eyebrow: "招聘推广", title: "让本地岗位被合适的人看到。", intro: "面向商家、企业和机构，按城市、语言、签证和岗位类型推广招聘。", blocks: [{ title: "适用岗位", variant: "grid", items: [{ title: "兼职", body: "餐饮、零售、活动、服务行业。" }, { title: "全职", body: "本地企业、跨境团队和门店管理。" }, { title: "实习", body: "面向学生和新入职人群。" }] }] },
    en: { eyebrow: "Hiring", title: "Show local jobs to the right people.", intro: "For merchants, companies and institutions, with promotion by city, language, visa fit and role type.", blocks: [{ title: "Role types", variant: "grid", items: [{ title: "Part-time", body: "Food, retail, events and local services." }, { title: "Full-time", body: "Local companies, cross-border teams and store operations." }, { title: "Internships", body: "For students and early-career talent." }] }] },
    ja: { eyebrow: "採用プロモーション", title: "地域の求人を、合う人へ届ける。", intro: "店舗、企業、機関向けに、都市、言語、ビザ、職種で採用情報を届けます。", blocks: [{ title: "対象求人", variant: "grid", items: [{ title: "アルバイト", body: "飲食、小売、イベント、地域サービス。" }, { title: "正社員", body: "地域企業、越境チーム、店舗運営。" }, { title: "インターン", body: "学生と若手人材向け。" }] }] },
  },
  "housing-promotion": {
    zh: { eyebrow: "租房推广", title: "把房源放到正在找房的人面前。", intro: "面向房产中介、转租用户和公寓运营方，支持城市、区域、价格和语言匹配。", blocks: [{ title: "推广内容", variant: "grid", items: [{ title: "整租与合租", body: "清晰展示区域、租金、入住时间和室友要求。" }, { title: "转租", body: "适合短周期流转和同城快速曝光。" }, { title: "租房避坑", body: "用透明信息建立用户信任。" }] }] },
    en: { eyebrow: "Housing", title: "Put listings in front of active renters.", intro: "For agents, subletters and apartment operators, with city, area, price and language matching.", blocks: [{ title: "Promotion content", variant: "grid", items: [{ title: "Rentals and shares", body: "Show area, rent, move-in time and roommate needs clearly." }, { title: "Sublets", body: "Fast city-level exposure for short cycles." }, { title: "Housing guidance", body: "Build trust through transparent information." }] }] },
    ja: { eyebrow: "住まいプロモーション", title: "探している人の目の前に物件を。", intro: "不動産、サブリース、アパート運営者向けに、都市、地域、価格、言語でマッチングします。", blocks: [{ title: "掲載内容", variant: "grid", items: [{ title: "賃貸とシェア", body: "地域、家賃、入居時期、同居条件を明確に。" }, { title: "サブリース", body: "短期の入れ替わりに素早く都市内露出。" }, { title: "住まいガイド", body: "透明な情報で信頼をつくります。" }] }] },
  },
  "safety-center": {
    zh: { eyebrow: "安全中心", title: "把风险提醒放在用户需要的时候。", intro: "安全中心会持续沉淀二手、租房、招聘、线下见面和商家服务的提示。", blocks: [{ title: "上线前重点", variant: "list", items: [{ title: "交易前核实", body: "不提前转账，不离开平台确认关键信息。" }, { title: "线下见面", body: "选择公共地点，告知朋友行程，保留沟通记录。" }, { title: "招聘辨别", body: "警惕押金、培训费和过度索要个人信息。" }] }] },
    en: { eyebrow: "Safety Center", title: "Show risk guidance when users need it.", intro: "The Safety Center will collect guidance for secondhand, housing, hiring, offline meetups and business services.", blocks: [{ title: "Launch focus", variant: "list", items: [{ title: "Verify before paying", body: "Do not prepay or leave the platform before confirming key details." }, { title: "Meet in public", body: "Choose public places, tell a friend and keep records." }, { title: "Hiring checks", body: "Watch for deposits, training fees and excessive personal-data requests." }] }] },
    ja: { eyebrow: "安全センター", title: "必要な時にリスク情報を届ける。", intro: "安全センターでは、フリマ、住まい、採用、対面、事業者サービスの注意点を蓄積します。", blocks: [{ title: "公開前の重点", variant: "list", items: [{ title: "支払い前に確認", body: "重要情報の確認前に前払いしない。" }, { title: "公共の場所で会う", body: "公共の場所を選び、友人に予定を伝え、記録を残す。" }, { title: "求人の確認", body: "保証金、研修費、過度な個人情報要求に注意。" }] }] },
  },
  privacy: {
    zh: { eyebrow: "隐私政策", title: "我们尊重你的城市生活和个人边界。", intro: "本政策说明 Machi City 如何处理账号、内容、地区和互动数据。", blocks: [{ title: "核心原则", variant: "legal", items: [{ title: "最小必要", body: "只收集提供服务所需的信息。" }, { title: "用户控制", body: "你可以管理账号资料、语言偏好、隐私设置和通知。" }, { title: "安全保护", body: "我们会通过权限、审核和日志保护数据安全。" }] }, { title: "我们收集与保留的数据", variant: "legal", items: [{ title: "账号与邮箱验证", body: "注册、登录和找回密码时，我们会向你的邮箱发送一次性验证码。验证码经哈希存储、设有有效期，验证后立即失效，绝不以明文保存、写入日志或通过接口返回。" }, { title: "访问日志", body: "为保障安全和防止滥用，我们会记录访问的 IP 地址、大致地区、时间、请求方法与路径、响应状态。日志仅管理员可见，绝不记录密码、验证码、令牌或敏感表单内容。" }, { title: "数据保留", body: "访问日志默认在约 90 天后自动清理；你可以随时管理账号资料与隐私设置。" }] }] },
    en: { eyebrow: "Privacy", title: "We respect your city life and personal boundaries.", intro: "This policy explains how Machi City handles account, content, region and interaction data.", blocks: [{ title: "Principles", variant: "legal", items: [{ title: "Data minimization", body: "We collect only what is needed to provide the service." }, { title: "User control", body: "You can manage profile, language preferences, privacy settings and notifications." }, { title: "Security", body: "Permissions, review and logs help protect data." }] }, { title: "Data we collect and retain", variant: "legal", items: [{ title: "Account & email verification", body: "When you register, sign in or reset your password, we email a one-time code. Codes are stored hashed, expire after a short window and are invalidated once used — never kept in plaintext, written to logs or returned by any API." }, { title: "Access logs", body: "To keep the service secure and prevent abuse, we record the visiting IP address, approximate region, time, request method and path, and response status. These logs are visible to administrators only and never record passwords, verification codes, tokens or sensitive form input." }, { title: "Data retention", body: "Access logs are pruned automatically after about 90 days; you can manage your account details and privacy settings at any time." }] }] },
    ja: { eyebrow: "プライバシー", title: "あなたの暮らしと境界を尊重します。", intro: "本ポリシーは、Machi City がアカウント、投稿、地域、交流データをどのように扱うかを説明します。", blocks: [{ title: "原則", variant: "legal", items: [{ title: "必要最小限", body: "サービス提供に必要な情報のみを収集します。" }, { title: "ユーザー管理", body: "プロフィール、言語、プライバシー、通知を管理できます。" }, { title: "安全保護", body: "権限、審査、ログでデータを守ります。" }] }, { title: "収集・保持するデータ", variant: "legal", items: [{ title: "アカウントとメール認証", body: "登録・ログイン・パスワード再設定の際、ワンタイムの確認コードをメールで送信します。コードはハッシュ化して保存し、有効期限を設け、使用後は即座に無効化します。平文での保存・ログ出力・API での返却は一切行いません。" }, { title: "アクセスログ", body: "安全確保と不正利用防止のため、アクセス元の IP アドレス、おおまかな地域、時刻、リクエストのメソッドとパス、応答ステータスを記録します。これらは管理者のみが閲覧でき、パスワード・確認コード・トークン・機微な入力内容は記録しません。" }, { title: "データの保持", body: "アクセスログは約 90 日後に自動的に削除されます。アカウント情報やプライバシー設定はいつでも管理できます。" }] }] },
  },
  terms: {
    zh: { eyebrow: "服务条款", title: "共同维护可信的城市生活社区。", intro: "使用 Machi City 即表示你同意遵守平台规则和当地法律。", blocks: [{ title: "基础规则", variant: "legal", items: [{ title: "真实与尊重", body: "不得发布欺诈、骚扰、歧视或违法内容。" }, { title: "交易自担风险", body: "二手、租房和服务交易需自行核实，平台会提供提醒和举报入口。" }, { title: "内容管理", body: "平台可以对违规内容进行隐藏、删除或限制账号。" }] }] },
    en: { eyebrow: "Terms", title: "Help keep this city community trustworthy.", intro: "By using Machi City, you agree to follow platform rules and local laws.", blocks: [{ title: "Basic rules", variant: "legal", items: [{ title: "Truth and respect", body: "Do not post fraud, harassment, discrimination or illegal content." }, { title: "Transaction risk", body: "Verify secondhand, housing and service transactions yourself; reporting and safety prompts are provided." }, { title: "Content moderation", body: "The platform may hide or remove violating content or restrict accounts." }] }] },
    ja: { eyebrow: "利用規約", title: "信頼できる地域コミュニティを一緒に守る。", intro: "Machi City を利用することで、プラットフォーム規則と現地法に従うことに同意します。", blocks: [{ title: "基本ルール", variant: "legal", items: [{ title: "正確さと尊重", body: "詐欺、嫌がらせ、差別、違法コンテンツは禁止です。" }, { title: "取引リスク", body: "フリマ、住まい、サービス取引は自分で確認し、通報と注意表示を利用してください。" }, { title: "コンテンツ管理", body: "違反内容は非表示、削除、アカウント制限の対象になります。" }] }] },
  },
};
