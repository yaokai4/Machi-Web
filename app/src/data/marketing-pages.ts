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
    { title: "蒙特利尔 Montreal", meta: "Canada", body: "留学、工作、租房、服务与活动入口。" },
  ],
  en: [
    { title: "Tokyo", meta: "Japan", body: "Housing, secondhand, part-time jobs, dining plans and local alerts." },
    { title: "Osaka", meta: "Japan", body: "Food, events, guides and questions surfaced by city." },
    { title: "Shanghai", meta: "China", body: "Local posts, jobs, housing and services in one city context." },
    { title: "Hangzhou", meta: "China", body: "Young city life, career signals and trusted local services." },
    { title: "Los Angeles", meta: "United States", body: "English, Chinese and multilingual content organized by city." },
    { title: "Montreal", meta: "Canada", body: "Study, work, housing, services and events for the city experience." },
  ],
  ja: [
    { title: "東京 Tokyo", meta: "Japan", body: "住まい、フリマ、バイト、食事会、地域のお知らせを都市別に。" },
    { title: "大阪 Osaka", meta: "Japan", body: "グルメ、イベント、生活ガイド、相談が見つかります。" },
    { title: "上海 Shanghai", meta: "China", body: "投稿、求人、住まい、サービスを都市の文脈で整理。" },
    { title: "杭州 Hangzhou", meta: "China", body: "若い暮らし、仕事の機会、地域サービスに出会えます。" },
    { title: "ロサンゼルス Los Angeles", meta: "United States", body: "英語、中国語、多言語の投稿を都市ごとに集約。" },
    { title: "モントリオール Montreal", meta: "Canada", body: "留学、仕事、住まい、サービス、イベントの入口。" },
  ],
};

export const marketingPages: Record<MarketingPageId, Record<MarketingLocale, MarketingPageCopy>> = {
  about: {
    zh: {
      eyebrow: "关于 Machi",
      title: "关于 Machi",
      intro: "Machi City 由姚凱 / YAOKAI 创立，是一个按国家、城市和语言组织内容的本地生活平台，源自跨国生活和日本留学经历中对城市信息分散问题的观察。",
      blocks: [
        { title: "为什么做 Machi", subtitle: "真正的城市，藏在普通人的日常里。", body: "一座城市的生活，不只存在于地图、景点和官方介绍中。它也存在于租房时踩过的坑、打工前想知道的提醒、搬家时需要的经验、周末可以去的活动、一次约饭、一次求助，和人与人之间真实的分享里。\n\n这些信息常常散落在群聊、社交平台、本地网站和不同语言的信息环境里。Machi 希望把这些原本分散的城市生活重新组织起来，让它们按国家、城市、语言和内容类型被找到。" },
        { title: "创始人理念", subtitle: "从日本留学和跨国生活里的真实问题出发。", body: "Machi 不希望制造更多噪音，而是把真正有用的城市生活重新整理出来。无论是刚来到一座城市的人，还是已经在这里生活很久的人，都应该更容易找到可信的信息、真实经验和同城连接。" },
        { title: "核心价值观", variant: "grid", items: [
          { title: "本地优先", body: "每条内容都属于一座具体的城市，而不是漂浮在互联网上的碎片。" },
          { title: "真实可信", body: "鼓励真实身份、真实经验、真实链接，拒绝标题党和搬运。" },
          { title: "尊重表达", body: "中文、英文、日文、韩文同等被看见，多语言城市需要多语言内容。" },
          { title: "克制设计", body: "iOS 质感、卡片化、克制动效。不打扰，不投喂，不上瘾设计。" },
        ] },
        { title: "产品方向", variant: "grid", items: [
          { title: "城市优先", body: "国家 → 省份/州 → 城市，是内容的第一层组织方式。" },
          { title: "语言友好", body: "界面语言和内容语言分开，适合东京、蒙特利尔、洛杉矶这样的多语言城市。" },
          { title: "真实生活", body: "租房、工作、二手、约饭、问答、服务都来自城市日常，而不是营销内容。" },
          { title: "商家共生", body: "本地商家、招聘方、房产中介、服务商也能在自己的城市频道里被找到。" },
        ] },
        { title: "上线路线图", variant: "list", items: [
          { meta: "2026 Q2", title: "官网首页 + 三语切换", body: "城市展示、内容频道、热榜、商家合作入口、等待名单。" },
          { meta: "2026 Q3", title: "iOS / Android 城市阶段开放", body: "第一阶段聚焦 Tokyo / Japan，第二阶段开放 Osaka，后续规划 Los Angeles / Montreal / Shanghai / Hangzhou。等待名单用户优先获得测试邀请。" },
          { meta: "2026 Q4", title: "商家认证 + 城市广告", body: "为本地商家、招聘方、房产中介开放认证和城市级曝光。" },
          { meta: "2027+", title: "更多城市与语言", body: "按城市需求逐步开放更多城市频道和内容语言。" },
        ] },
        { title: "我们是谁", subtitle: "Machi City 目前由一个小而专注的团队推进。", body: "我们相信，真正有价值的城市平台，不是从功能堆叠开始，而是从一座城市里真实的人、信息、经验和连接开始。\n\n我们正在从东京和日本市场出发，一步一步打磨产品、内容和社区密度，让 Machi 成为一个能长期生长的城市生活平台。" },
        { title: "联系我们", variant: "contact", body: "合作、媒体、测试邀请或城市开放建议都可以联系 hi@machicity.com。" },
      ],
    },
    en: {
      eyebrow: "About Machi",
      title: "About Machi",
      intro: "Founded by Yao Kai / YAOKAI, Machi City is a city-based local life platform inspired by cross-border living and the need to organize city information by country, city, language, and content type.",
      blocks: [
        { title: "Why Machi exists", subtitle: "The real city lives in ordinary days.", body: "A city's life does not only exist in maps, landmarks, or official descriptions. It also lives in the housing warnings people learn the hard way, the reminders someone wants before taking a part-time job, the moving tips people need, the weekend events worth finding, a shared meal, a request for help, and the real exchanges between people.\n\nThese pieces of information are often scattered across group chats, social platforms, local websites, and different language environments. Machi is built to organize that scattered city life again so it can be found by country, city, language, and content type." },
        { title: "Founder philosophy", subtitle: "Rooted in real problems from studying in Japan and living across borders.", body: "Machi does not aim to create more noise. It reorganizes the city-life information that is actually useful, so newcomers and long-time residents can find trustworthy information, lived experience and local connections more easily." },
        { title: "Core values", variant: "grid", items: [
          { title: "Local first", body: "Every post belongs to a specific city, not a piece floating on the open internet." },
          { title: "Trust by default", body: "We welcome real identities, lived experience and honest links. We turn down clickbait and reposted noise." },
          { title: "Respect language", body: "Chinese, English, Japanese and Korean are equally visible. Multilingual cities need multilingual content." },
          { title: "Quiet design", body: "iOS texture, card layouts, restrained motion. Nothing engineered to interrupt, feed or addict." },
        ] },
        { title: "Product direction", variant: "grid", items: [
          { title: "City first", body: "Country → state or province → city forms the core content structure." },
          { title: "Language aware", body: "Interface language and content language are separate so cities like Tokyo, Montreal and Los Angeles all work." },
          { title: "Real city experience", body: "Housing, jobs, secondhand, dining, Q&A and services all come from everyday city life — not marketing." },
          { title: "Merchant friendly", body: "Local merchants, hiring teams, housing agents and service providers can be found inside their own city channels." },
        ] },
        { title: "Roadmap", variant: "list", items: [
          { meta: "2026 Q2", title: "Website + tri-lingual switcher", body: "City showcase, content channels, ranking, business entry, waitlist." },
          { meta: "2026 Q3", title: "iOS / Android city phases", body: "Phase 1 focuses on Tokyo / Japan, Phase 2 opens Osaka, and later phases plan Los Angeles / Montreal / Shanghai / Hangzhou. Waitlist users get early test invites." },
          { meta: "2026 Q4", title: "Merchant verification + city ads", body: "Verification and city-level exposure for local merchants, hiring teams and housing agents." },
          { meta: "2027+", title: "More cities, more languages", body: "Open city channels and content languages on demand." },
        ] },
        { title: "Who we are", subtitle: "Machi City is currently built by a small, focused team.", body: "We believe a valuable city platform does not start with stacking features. It starts with real people, information, experiences, and connections inside a city.\n\nWe are starting from Tokyo and the Japanese market, then carefully building product quality, content density, and community depth step by step so Machi can become a city-life platform that grows for the long term." },
        { title: "Contact", variant: "contact", body: "For partnerships, press, beta access or city-launch ideas, contact hi@machicity.com." },
      ],
    },
    ja: {
      eyebrow: "Machi について",
      title: "Machi について",
      intro: "Machi City は姚凱 / YAOKAI によって創設された、国・都市・言語・内容ごとに街の生活情報を整理するローカルライフプラットフォームです。",
      blocks: [
        { title: "なぜ Machi をつくるのか", subtitle: "本当の街は、ふつうの日常の中にあります。", body: "一つの街の暮らしは、地図や観光地、公式の説明だけにあるわけではありません。住まいでつまずいた経験、アルバイトの前に知りたい注意点、引っ越しのときに必要な知識、週末に行けるイベント、一度の食事、一度の助け合い、そして人と人との本当の共有の中にもあります。\n\nそうした情報は、グループチャット、SNS、地域サイト、異なる言語環境の中に散らばりがちです。Machi は、散らばっていた街の暮らしをもう一度整理し、国・都市・言語・内容ごとに見つけられるようにしたいと考えています。" },
        { title: "創設者の理念", subtitle: "日本留学と国境を越えた生活で感じた課題から始まりました。", body: "Machi は、さらに多くのノイズを生み出すのではなく、本当に役立つ街の暮らしを整理し直したいと考えています。新しい街に来たばかりの人も、長く暮らしている人も、信頼できる情報、実体験、同じ街のつながりをもっと見つけやすくあるべきです。" },
        { title: "わたしたちの価値観", variant: "grid", items: [
          { title: "地域優先", body: "すべての投稿はひとつの街に属します。インターネット上に漂う断片ではありません。" },
          { title: "信頼が前提", body: "本名・本物の経験・実在のリンクを歓迎し、釣りタイトルや転載は受け入れません。" },
          { title: "言語を尊重", body: "中国語、英語、日本語、韓国語を同じ重みで扱います。多言語都市には多言語のコンテンツが必要です。" },
          { title: "静かな設計", body: "iOS の質感、カードレイアウト、控えめな動き。割り込み・依存設計はしません。" },
        ] },
        { title: "プロダクトの方向性", variant: "grid", items: [
          { title: "都市から始まる", body: "国 → 都道府県・州 → 都市を、コンテンツ整理の中心に置きます。" },
          { title: "多言語に強い", body: "画面言語と投稿言語を分け、東京・モントリオール・ロサンゼルスのような多言語都市に対応します。" },
          { title: "本物の地域生活", body: "住まい、仕事、フリマ、食事、相談、サービスをマーケティングではなく日常から集めます。" },
          { title: "店舗と共存", body: "店舗、採用担当、不動産、サービス事業者も、自分の街のチャンネルから見つかります。" },
        ] },
        { title: "ロードマップ", variant: "list", items: [
          { meta: "2026 Q2", title: "公式サイト + 三言語切替", body: "都市紹介、コンテンツチャンネル、トレンド、ビジネス窓口、ウェイトリスト。" },
          { meta: "2026 Q3", title: "iOS / Android 都市フェーズ公開", body: "第1段階は Tokyo / Japan、第2段階は Osaka、その後 Los Angeles / Montreal / Shanghai / Hangzhou を計画しています。ウェイトリスト登録者に優先テスト招待。" },
          { meta: "2026 Q4", title: "店舗認証と都市広告", body: "店舗、採用担当、不動産向けに認証と都市単位の露出を開始。" },
          { meta: "2027+", title: "より多くの街と言語へ", body: "需要に応じて新しい都市チャンネルとコンテンツ言語を順次公開。" },
        ] },
        { title: "わたしたちについて", subtitle: "Machi City は現在、小さく集中したチームで進めています。", body: "本当に価値のある街のプラットフォームは、機能を積み重ねることからではなく、一つの街にいる実際の人、情報、経験、つながりから始まると考えています。\n\n私たちは東京と日本市場から出発し、プロダクト、コンテンツ、コミュニティの密度を一歩ずつ磨きながら、Machi を長く育つローカルライフプラットフォームにしていきます。" },
        { title: "お問い合わせ", variant: "contact", body: "提携、取材、テスト参加、都市展開のご提案は hi@machicity.com まで。" },
      ],
    },
  },
  features: {
    zh: {
      eyebrow: "功能",
      title: "城市经验的完整功能矩阵。",
      intro: "从内容、交易、工作到线下连接，Machi 把一座城市需要的日常入口整理在同一个 App。",
      blocks: [
        { title: "内容频道", variant: "grid", items: [
          { title: "新闻与攻略", body: "本地快讯、政策提醒、生活经验和避坑指南。" },
          { title: "问答与经验", body: "把零散问题沉淀成可搜索的城市知识。" },
          { title: "热榜", body: "城市、国家、全站三层热度发现。" },
          { title: "多语言内容", body: "按用户选择的内容语言优先推荐。" },
        ] },
        { title: "交易与机会", variant: "grid", items: [
          { title: "二手", body: "闲置转让、搬家甩卖、求购和免费赠送。" },
          { title: "租房", body: "找房、转租、合租、室友和避坑提醒。" },
          { title: "服务", body: "搬家、签证、翻译、维修、报税等本地服务。" },
          { title: "工作与招聘", body: "找工作、兼职、全职、实习、内推和本地招聘。" },
        ] },
        { title: "Social & Offline", variant: "grid", items: [
          { title: "同城社交", body: "认识同城朋友、新朋友、本地互助和兴趣小组。" },
          { title: "同城搭子", body: "饭搭子、咖啡搭子、活动搭子、运动搭子和周末同行。" },
          { title: "约饭 / 活动 / 语言交换", body: "围绕饭局、线下活动和语言学习建立真实连接。" },
          { title: "避坑经验", body: "租房、交易、招聘和线下见面的风险提醒。" },
        ] },
      ],
    },
    en: {
      eyebrow: "Features",
      title: "A complete city-experience feature set.",
      intro: "From content and local exchange to jobs and offline connections, Machi organizes city life into one app.",
      blocks: [
        { title: "Content channels", variant: "grid", items: [
          { title: "News and guides", body: "Local updates, policy reminders, lived experience and practical guides." },
          { title: "Q&A and experience", body: "Turn scattered questions into searchable city knowledge." },
          { title: "Trends", body: "Discover what is hot across city, country and global layers." },
          { title: "Multilingual content", body: "Prioritize the content languages each user chooses." },
        ] },
        { title: "Trade & Opportunity", variant: "grid", items: [
          { title: "Secondhand", body: "Listings, moving sales, wanted posts and free giveaways." },
          { title: "Housing", body: "Rentals, sublets, shared homes, roommates and warnings." },
          { title: "Services", body: "Moving, visa, translation, repair, tax and local help." },
          { title: "Jobs and hiring", body: "Part-time, full-time, internships, referrals and local hiring." },
        ] },
        { title: "Social & Offline", variant: "grid", items: [
          { title: "Social", body: "Meet local friends, new friends, local help and city-based interest groups." },
          { title: "Meetups", body: "Dining buddies, coffee companions, event companions, sports partners and weekend plans." },
          { title: "Dining / Events / Language Exchange", body: "Build real connections around meals, offline events and language learning." },
          { title: "Avoid", body: "Local warnings for housing, transactions, hiring and offline meetings." },
        ] },
      ],
    },
    ja: {
      eyebrow: "機能",
      title: "地域生活に必要な機能をひとつに。",
      intro: "コンテンツ、取引、仕事、オフラインのつながりまで、Machi は街の暮らしの入口を整理します。",
      blocks: [
        { title: "コンテンツチャンネル", variant: "grid", items: [
          { title: "ニュースとガイド", body: "地域ニュース、制度の注意、生活経験、避けたい落とし穴。" },
          { title: "Q&A と経験", body: "散らばった質問を検索できる街の知識へ。" },
          { title: "トレンド", body: "都市、国、全体の三層で話題を発見。" },
          { title: "多言語投稿", body: "ユーザーが選んだ投稿言語を優先します。" },
        ] },
        { title: "取引と機会", variant: "grid", items: [
          { title: "フリマ", body: "譲渡、引っ越し売り、探し物、無料譲渡。" },
          { title: "住まい", body: "賃貸、サブリース、シェア、ルームメイト、注意喚起。" },
          { title: "サービス", body: "引っ越し、ビザ、翻訳、修理、税務など。" },
          { title: "仕事と採用", body: "バイト、正社員、インターン、紹介、地域採用。" },
        ] },
        { title: "Social & Offline", variant: "grid", items: [
          { title: "ソーシャル", body: "同じ街の友達、新しい友達、助け合い、趣味グループ。" },
          { title: "仲間募集", body: "食事仲間、カフェ仲間、イベント仲間、スポーツ仲間、週末の予定。" },
          { title: "食事 / イベント / 言語交換", body: "食事、オフラインイベント、言語学習を通じてつながる。" },
          { title: "注意情報", body: "住まい、取引、求人、対面のリスクを共有。" },
        ] },
      ],
    },
  },
  cities: {
    zh: { eyebrow: "城市", title: "一个 App，连接每座城市。", intro: "第一阶段聚焦 Tokyo / Japan，第二阶段开放 Osaka，后续规划 Los Angeles / Montreal / Shanghai / Hangzhou。Machi 让每座城市都有自己的生活入口。", blocks: [{ title: "城市阶段", variant: "grid", items: cities.zh }] },
    en: { eyebrow: "Cities", title: "One app for every city.", intro: "Phase 1 focuses on Tokyo / Japan, Phase 2 opens Osaka, and later phases plan Los Angeles / Montreal / Shanghai / Hangzhou. Machi gives every city its own entry into real experience.", blocks: [{ title: "City phases", variant: "grid", items: cities.en }] },
    ja: { eyebrow: "都市", title: "ひとつのアプリで、すべての街へ。", intro: "第1段階は Tokyo / Japan、第2段階は Osaka、その後 Los Angeles / Montreal / Shanghai / Hangzhou を計画しています。Machi は街ごとの暮らしの入口をつくります。", blocks: [{ title: "都市フェーズ", variant: "grid", items: cities.ja }] },
  },
  business: {
    zh: { eyebrow: "商家合作", title: "商家不仅能投放广告，还能进入本地社交场景。", intro: "餐厅、语言学校、活动组织者、健身房、课程机构、本地服务商和招聘者，都可以围绕城市生活场景触达真实需求。", blocks: [{ title: "社交场景商业化", variant: "grid", items: [
      { title: "餐厅饭局与优惠", body: "餐厅可以发起饭局、优惠和本地活动。" },
      { title: "语言学校交换小组", body: "语言学校可以触达语言交换和学习用户。" },
      { title: "活动组织者招募", body: "活动组织者可以招募同城参与者。" },
      { title: "兴趣社群连接", body: "健身房、舞蹈室、课程机构可以连接本地兴趣社群。" },
      { title: "本地服务线索", body: "本地服务商可以通过城市频道获得真实需求。" },
      { title: "同城招聘", body: "招聘者可以接触同城求职者和行业社群。" },
    ] }, { title: "视觉示例", variant: "grid", items: [
      { title: "Restaurant meetup campaign", body: "面向饭局、约饭和线下活动的推广。" },
      { title: "Language school exchange group", body: "触达语言交换和学习用户。" },
      { title: "Gym / class interest community", body: "连接兴趣社群和课程报名。" },
    ] }] },
    en: { eyebrow: "For Business", title: "Businesses can do more than buy ads — they can enter local social scenes.", intro: "Restaurants, language schools, event organizers, gyms, studios, classes, local service providers and recruiters can connect with real city-based demand.", blocks: [{ title: "Commercial social scenes", variant: "grid", items: [
      { title: "Restaurants", body: "Restaurants can promote dining events, local offers and group meetups." },
      { title: "Language schools", body: "Language schools can reach language exchange and learning users." },
      { title: "Event organizers", body: "Event organizers can recruit local participants." },
      { title: "Gyms, studios and classes", body: "Gyms, studios and classes can connect with interest-based communities." },
      { title: "Local service providers", body: "Local service providers can reach real city-based demand." },
      { title: "Recruiters", body: "Recruiters can reach local job seekers and industry communities." },
    ] }, { title: "Campaign examples", variant: "grid", items: [
      { title: "Restaurant meetup campaign", body: "For dining events, offers and group meetups." },
      { title: "Language school exchange group", body: "Reach language exchange and learning users." },
      { title: "Hiring in city community", body: "Connect openings with local seekers." },
    ] }] },
    ja: { eyebrow: "ビジネス", title: "広告だけでなく、地域のソーシャルシーンへ。", intro: "レストラン、語学学校、イベント主催者、ジム、教室、地域サービス、採用担当が、都市ベースの本当の需要につながれます。", blocks: [{ title: "ソーシャルシーンでの活用", variant: "grid", items: [
      { title: "レストラン", body: "食事会、地域特典、グループミートアップを届けられます。" },
      { title: "語学学校", body: "言語交換と学習ユーザーにリーチできます。" },
      { title: "イベント主催者", body: "同じ街の参加者を募集できます。" },
      { title: "ジム・教室", body: "地域の興味コミュニティとつながれます。" },
      { title: "地域サービス", body: "都市チャンネルで実際のニーズに出会えます。" },
      { title: "採用担当", body: "同じ街の求職者と業界コミュニティに届きます。" },
    ] }, { title: "キャンペーン例", variant: "grid", items: [
      { title: "Restaurant meetup campaign", body: "食事会、特典、地域イベント向け。" },
      { title: "Language school exchange group", body: "言語交換と学習ユーザーへ。" },
      { title: "Local service leads", body: "都市ごとの具体的な需要につなぐ。" },
    ] }] },
  },
  safety: {
    zh: { eyebrow: "安全", title: "Real connection needs real boundaries.", intro: "社交、线下见面、饭局、语言交换、租房、二手、招聘和商家服务都需要明确边界、举报、拉黑、审核和认证机制。", blocks: [{ title: "安全能力", variant: "grid", items: [
      { title: "Social safety", body: "不要过早分享住址、证件和财务信息；遇到骚扰、诈骗、冒犯内容可以举报或拉黑。" },
      { title: "Meetup safety", body: "第一次见面选择公共场所，告诉朋友见面地点，保留沟通记录。" },
      { title: "Housing safety", body: "不要提前转账给未验证房东，确认地址、合同和房东身份。" },
      { title: "Jobs & hiring safety", body: "不要支付入职押金，确认公司官网、地址和联系方式。" },
      { title: "Report and block", body: "提供举报、屏蔽、内容审核、下架和账号限制机制。" },
      { title: "Community guidelines", body: "覆盖骚扰、仇恨言论、诈骗、冒充、恶意搭讪和线下危险行为。" },
    ] }] },
    en: { eyebrow: "Safety", title: "Real connection needs real boundaries.", intro: "Social, meetups, dining, language exchange, housing, secondhand, jobs, hiring and business services all need boundaries, reports, blocks, review and verification.", blocks: [{ title: "Safety tools", variant: "grid", items: [
      { title: "Social safety", body: "Do not share address, ID or financial details too early. Report or block harassment, scams and offensive content." },
      { title: "Meetup safety", body: "Meet in public first, tell a friend where you are going and keep communication records." },
      { title: "Housing safety", body: "Do not prepay unverified landlords. Check addresses, contracts and identities." },
      { title: "Jobs & hiring safety", body: "Never pay job deposits. Check company websites, addresses and contacts." },
      { title: "Report and block", body: "Reporting, blocking, review, takedowns and account limits form the enforcement flow." },
      { title: "Community guidelines", body: "Guidelines cover harassment, hate, scams, impersonation, malicious advances and offline danger." },
    ] }] },
    ja: { eyebrow: "安全", title: "Real connection needs real boundaries.", intro: "ソーシャル、対面、食事、言語交換、住まい、中古、仕事、求人、事業者サービスには、境界線、通報、ブロック、審査、認証が必要です。", blocks: [{ title: "安全機能", variant: "grid", items: [
      { title: "Social safety", body: "住所、身分証、財務情報を早く共有しない。嫌がらせや詐欺は通報・ブロックできます。" },
      { title: "Meetup safety", body: "初回は公共の場所を選び、友人に場所を伝え、記録を残します。" },
      { title: "Housing safety", body: "未確認の貸主へ前払いせず、住所、契約、本人確認を行います。" },
      { title: "Jobs & hiring safety", body: "入職保証金を払わず、会社サイト、住所、連絡先を確認します。" },
      { title: "Report and block", body: "通報、ブロック、審査、削除、アカウント制限の流れを整備します。" },
      { title: "Community guidelines", body: "嫌がらせ、ヘイト、詐欺、なりすまし、悪質な誘い、危険な対面行為を禁止します。" },
    ] }] },
  },
  download: {
    zh: { eyebrow: "下载", title: "下载 Machi", intro: "Machi 正在准备 closed beta。第一阶段聚焦 Tokyo / Japan，第二阶段开放 Osaka，后续规划 Los Angeles / Montreal / Shanghai / Hangzhou。", blocks: [{ title: "Web Beta 可体验", variant: "grid", items: [
      { title: "城市首页", body: "进入城市生活脉搏。" }, { title: "发现与搜索", body: "找租房、工作、问答、活动和本地服务。" }, { title: "通知与私信", body: "接收回复并联系同城的人。" }, { title: "发布与主页", body: "发布内容，展示真实个人主页。" }, { title: "同城连接", body: "认识同城朋友、饭搭子、活动搭子和语言交换伙伴。" },
    ] }, { title: "状态", variant: "list", items: [{ title: "iOS", body: "即将上线" }, { title: "Android", body: "即将上线" }, { title: "Web Beta", body: "邀请制开放" }] }] },
    en: { eyebrow: "Download", title: "Download Machi", intro: "Machi is preparing for closed beta. Phase 1 focuses on Tokyo / Japan, Phase 2 opens Osaka, and later phases plan Los Angeles / Montreal / Shanghai / Hangzhou.", blocks: [{ title: "In Web Beta, you can use", variant: "grid", items: [
      { title: "City home", body: "Open the pulse of a city." }, { title: "Discovery and search", body: "Find housing, jobs, Q&A, events and local services." }, { title: "Notifications and messages", body: "Follow replies and contact local people." }, { title: "Posting and profiles", body: "Post content and build a real profile." }, { title: "Local connections", body: "Meet local friends, dining buddies, event companions and language exchange partners." },
    ] }, { title: "Status", variant: "list", items: [{ title: "iOS", body: "Coming soon" }, { title: "Android", body: "Coming soon" }, { title: "Web Beta", body: "Invite-only" }] }] },
    ja: { eyebrow: "ダウンロード", title: "Machi をダウンロード", intro: "Machi はクローズドベータを準備中です。第1段階は Tokyo / Japan、第2段階は Osaka、その後 Los Angeles / Montreal / Shanghai / Hangzhou を計画しています。", blocks: [{ title: "Web Beta で使える機能", variant: "grid", items: [
      { title: "都市ホーム", body: "街の脈動に入る。" }, { title: "発見と検索", body: "住まい、仕事、Q&A、イベント、地域サービスを探す。" }, { title: "通知とメッセージ", body: "返信を受け取り、同じ街の人と連絡する。" }, { title: "投稿とプロフィール", body: "投稿し、実在感のあるプロフィールを持つ。" }, { title: "同じ街のつながり", body: "友達、食事仲間、イベント仲間、言語交換パートナーを見つける。" },
    ] }, { title: "ステータス", variant: "list", items: [{ title: "iOS", body: "近日公開" }, { title: "Android", body: "近日公開" }, { title: "Web Beta", body: "招待制" }] }] },
  },
  ads: {
    zh: { eyebrow: "广告投放", title: "城市级曝光，触达真正附近的人。", intro: "按城市、频道、语言和内容场景投放，让广告更像有用信息。", blocks: [{ title: "投放场景", variant: "grid", items: [{ title: "城市首页", body: "进入城市时最先看到的曝光位。" }, { title: "频道置顶", body: "租房、招聘、优惠、活动等频道内推荐。" }, { title: "热榜旁曝光", body: "围绕城市关注内容获得自然触达。" }] }] },
    en: { eyebrow: "Ads", title: "City-level reach for people nearby.", intro: "Target by city, channel, language and local intent so ads feel useful.", blocks: [{ title: "Placements", variant: "grid", items: [{ title: "City home", body: "High-visibility entry when users open a city." }, { title: "Channel pin", body: "Promoted spots in housing, hiring, deals and events." }, { title: "Trend context", body: "Appear near what the city is already paying attention to." }] }] },
    ja: { eyebrow: "広告", title: "近くの人に届く都市別プロモーション。", intro: "都市、チャンネル、言語、利用シーンに合わせて、役立つ情報として届けます。", blocks: [{ title: "掲載場所", variant: "grid", items: [{ title: "都市ホーム", body: "都市を開いた時に目に入る入口。" }, { title: "チャンネル固定", body: "住まい、採用、割引、イベント内で表示。" }, { title: "トレンド周辺", body: "街で注目されている話題の近くで自然に接触。" }] }] },
  },
  contact: {
    zh: { eyebrow: "联系", title: "和 Machi 团队联系。", intro: "合作、媒体、城市开放、问题反馈和测试邀请都可以从这里开始。", blocks: [{ title: "联系方式", variant: "contact", body: "邮箱 hi@machicity.com。请在邮件里说明城市、合作类型和你的联系方式。" }, { title: "我们会优先回复", variant: "list", items: [{ title: "城市合作", body: "本地组织、学校、社群和服务机构。" }, { title: "商家合作", body: "门店、招聘方、房产中介和服务商。" }, { title: "产品反馈", body: "官网、Web 端和 App 体验问题。" }] }] },
    en: { eyebrow: "Contact", title: "Talk to the Machi team.", intro: "Partnerships, press, city launches, feedback and beta access can start here.", blocks: [{ title: "Email", variant: "contact", body: "Contact hi@machicity.com. Please include your city, partnership type and contact details." }, { title: "Priority topics", variant: "list", items: [{ title: "City partnerships", body: "Local organizations, schools, communities and service providers." }, { title: "Business partnerships", body: "Stores, recruiters, housing agents and service teams." }, { title: "Product feedback", body: "Website, Web app and mobile app experience issues." }] }] },
    ja: { eyebrow: "お問い合わせ", title: "Machi チームへ連絡する。", intro: "提携、取材、都市展開、フィードバック、テスト参加はこちらから。", blocks: [{ title: "メール", variant: "contact", body: "hi@machicity.com まで。都市、提携内容、連絡先をご記入ください。" }, { title: "優先的に確認する内容", variant: "list", items: [{ title: "都市提携", body: "地域団体、学校、コミュニティ、サービス機関。" }, { title: "事業者提携", body: "店舗、採用担当、不動産、サービス事業者。" }, { title: "製品フィードバック", body: "公式サイト、Web、アプリの体験に関する問題。" }] }] },
  },
  partners: {
    zh: { eyebrow: "系统合作", title: "把城市资源接入 Machi。", intro: "面向城市社群、学校、服务机构、媒体和本地组织开放合作。", blocks: [{ title: "合作方向", variant: "grid", items: [{ title: "内容合作", body: "本地攻略、新闻、活动和服务目录。" }, { title: "城市运营", body: "共建城市频道、精选内容和活动计划。" }, { title: "数据与服务", body: "未来可扩展安全合规的数据接口和服务线索。" }] }] },
    en: { eyebrow: "Partners", title: "Bring city resources into Machi.", intro: "Open to local communities, schools, service institutions, media and city organizations.", blocks: [{ title: "Partnership paths", variant: "grid", items: [{ title: "Content", body: "Local guides, news, events and service directories." }, { title: "City operations", body: "Co-build city channels, curated posts and event plans." }, { title: "Data and services", body: "Future compliant APIs and service leads." }] }] },
    ja: { eyebrow: "パートナー", title: "都市のリソースを Machi へ。", intro: "地域コミュニティ、学校、サービス機関、メディア、地域団体と連携します。", blocks: [{ title: "連携の方向", variant: "grid", items: [{ title: "コンテンツ", body: "地域ガイド、ニュース、イベント、サービス一覧。" }, { title: "都市運営", body: "都市チャンネル、注目投稿、イベント計画を共創。" }, { title: "データとサービス", body: "将来的な安全で適法なAPIやサービス導線。" }] }] },
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
    zh: { eyebrow: "安全中心", title: "把风险提醒放在用户需要的时候。", intro: "安全中心覆盖社交、线下见面、饭局、语言交换、租房、二手、招聘、商家认证、举报拉黑和社区规范。", blocks: [{ title: "线下见面安全", variant: "list", items: [{ title: "选择公共地点", body: "第一次见面建议选择公共场所，不要第一次见面就去私人空间。" }, { title: "告诉朋友", body: "告诉朋友你的见面地点和大致时间。" }, { title: "保留记录", body: "保留沟通记录，遇到危险或骚扰及时举报。" }] }, { title: "交易与招聘安全", variant: "grid", items: [{ title: "租房安全", body: "不要提前转账给未验证房东；确认地址、合同和房东身份；警惕低价房源和平台外付款链接。" }, { title: "二手安全", body: "优先公共场所交易，高价值物品建议线下面交验货，不提前支付大额定金。" }, { title: "招聘安全", body: "不要支付入职押金，警惕没有公司信息或高薪但先付款的职位。" }] }] },
    en: { eyebrow: "Safety Center", title: "Show risk guidance when users need it.", intro: "The Safety Center covers social safety, meetups, dining, language exchange, housing, secondhand, jobs, business verification, report/block and community guidelines.", blocks: [{ title: "Offline meeting safety", variant: "list", items: [{ title: "Choose public places", body: "Meet in public first and avoid private spaces for a first meeting." }, { title: "Tell a friend", body: "Tell a friend where and when you are meeting." }, { title: "Keep records", body: "Keep communication records and report danger or harassment quickly." }] }, { title: "Transaction and hiring safety", variant: "grid", items: [{ title: "Housing safety", body: "Do not prepay unverified landlords; check addresses, contracts and identity; beware off-platform payment links." }, { title: "Secondhand safety", body: "Prefer public places, inspect high-value items in person and avoid large deposits." }, { title: "Hiring safety", body: "Never pay job deposits; watch for missing company info or high-pay roles that ask for money first." }] }] },
    ja: { eyebrow: "安全センター", title: "必要な時にリスク情報を届ける。", intro: "安全センターはソーシャル、対面、食事、言語交換、住まい、中古、求人、事業者認証、通報・ブロック、コミュニティ規範を扱います。", blocks: [{ title: "対面の安全", variant: "list", items: [{ title: "公共の場所を選ぶ", body: "初回は公共の場所で会い、個人宅などは避けます。" }, { title: "友人に伝える", body: "会う場所と時間を友人に伝えます。" }, { title: "記録を残す", body: "やり取りを残し、危険や嫌がらせはすぐ通報します。" }] }, { title: "取引と求人の安全", variant: "grid", items: [{ title: "住まい安全", body: "未確認の貸主へ前払いしない。住所、契約、本人確認を行い、外部決済リンクに注意します。" }, { title: "中古安全", body: "公共の場所を優先し、高額品は対面確認。大きな前金は避けます。" }, { title: "求人安全", body: "入職保証金を払わず、会社情報がない求人や先払いを求める高収入求人に注意します。" }] }] },
  },
  privacy: {
    zh: { eyebrow: "隐私政策", title: "我们尊重你的城市生活和个人边界。", intro: "本政策说明 Machi 如何处理账号、内容、地区和互动数据。", blocks: [{ title: "核心原则", variant: "legal", items: [{ title: "最小必要", body: "只收集提供服务所需的信息。" }, { title: "用户控制", body: "你可以管理账号资料、语言偏好、隐私设置和通知。" }, { title: "安全保护", body: "我们会通过权限、审核和日志保护数据安全。" }] }, { title: "我们收集与保留的数据", variant: "legal", items: [{ title: "账号与邮箱验证", body: "注册、登录和找回密码时，我们会向你的邮箱发送一次性验证码。验证码经哈希存储、设有有效期，验证后立即失效，绝不以明文保存、写入日志或通过接口返回。" }, { title: "访问日志", body: "为保障安全和防止滥用，我们会记录访问的 IP 地址、大致地区、时间、请求方法与路径、响应状态。日志仅管理员可见，绝不记录密码、验证码、令牌或敏感表单内容。" }, { title: "数据保留", body: "访问日志默认在约 90 天后自动清理；你可以随时管理账号资料与隐私设置。" }] }] },
    en: { eyebrow: "Privacy", title: "We respect your city life and personal boundaries.", intro: "This policy explains how Machi handles account, content, region and interaction data.", blocks: [{ title: "Principles", variant: "legal", items: [{ title: "Data minimization", body: "We collect only what is needed to provide the service." }, { title: "User control", body: "You can manage profile, language preferences, privacy settings and notifications." }, { title: "Security", body: "Permissions, review and logs help protect data." }] }, { title: "Data we collect and retain", variant: "legal", items: [{ title: "Account & email verification", body: "When you register, sign in or reset your password, we email a one-time code. Codes are stored hashed, expire after a short window and are invalidated once used — never kept in plaintext, written to logs or returned by any API." }, { title: "Access logs", body: "To keep the service secure and prevent abuse, we record the visiting IP address, approximate region, time, request method and path, and response status. These logs are visible to administrators only and never record passwords, verification codes, tokens or sensitive form input." }, { title: "Data retention", body: "Access logs are pruned automatically after about 90 days; you can manage your account details and privacy settings at any time." }] }] },
    ja: { eyebrow: "プライバシー", title: "あなたの暮らしと境界を尊重します。", intro: "本ポリシーは、Machi がアカウント、投稿、地域、交流データをどのように扱うかを説明します。", blocks: [{ title: "原則", variant: "legal", items: [{ title: "必要最小限", body: "サービス提供に必要な情報のみを収集します。" }, { title: "ユーザー管理", body: "プロフィール、言語、プライバシー、通知を管理できます。" }, { title: "安全保護", body: "権限、審査、ログでデータを守ります。" }] }, { title: "収集・保持するデータ", variant: "legal", items: [{ title: "アカウントとメール認証", body: "登録・ログイン・パスワード再設定の際、ワンタイムの確認コードをメールで送信します。コードはハッシュ化して保存し、有効期限を設け、使用後は即座に無効化します。平文での保存・ログ出力・API での返却は一切行いません。" }, { title: "アクセスログ", body: "安全確保と不正利用防止のため、アクセス元の IP アドレス、おおまかな地域、時刻、リクエストのメソッドとパス、応答ステータスを記録します。これらは管理者のみが閲覧でき、パスワード・確認コード・トークン・機微な入力内容は記録しません。" }, { title: "データの保持", body: "アクセスログは約 90 日後に自動的に削除されます。アカウント情報やプライバシー設定はいつでも管理できます。" }] }] },
  },
  terms: {
    zh: { eyebrow: "服务条款", title: "共同维护可信的城市生活社区。", intro: "使用 Machi 即表示你同意遵守平台规则、社区规范、社交安全政策和当地法律。", blocks: [{ title: "Community Guidelines", variant: "legal", items: [{ title: "禁止内容", body: "骚扰、仇恨言论、诈骗、冒充他人、恶意搭讪、成人骚扰内容、未经同意发布他人隐私均不允许。" }, { title: "虚假与风险", body: "虚假活动、虚假商家、虚假招聘、虚假房源、线下危险行为和误导性广告会被处理。" }, { title: "处置机制", body: "平台可进行举报处理、拉黑、内容下架、账号限制、商家认证复核和活动风险提示。" }] }, { title: "Policy set", variant: "list", items: [{ title: "Social Safety Policy", body: "覆盖恶意搭讪、线下见面安全和隐私边界。" }, { title: "Meetup / Housing / Hiring Policy", body: "覆盖活动风险提示、租房发布、招聘发布和用户生成内容。" }, { title: "Report & Enforcement Policy", body: "覆盖举报、屏蔽、审核、内容下架和账号处罚。" }] }] },
    en: { eyebrow: "Terms", title: "Help keep this city community trustworthy.", intro: "By using Machi, you agree to follow platform rules, community guidelines, social safety policies and local laws.", blocks: [{ title: "Community Guidelines", variant: "legal", items: [{ title: "Disallowed content", body: "Harassment, hate speech, scams, impersonation, malicious advances, adult harassment and non-consensual privacy exposure are not allowed." }, { title: "False or risky activity", body: "Fake events, fake businesses, fake jobs, fake housing, dangerous offline behavior and misleading ads may be removed." }, { title: "Enforcement", body: "The platform may handle reports, blocks, takedowns, account limits, business verification review and event risk prompts." }] }, { title: "Policy set", variant: "list", items: [{ title: "Social Safety Policy", body: "Covers malicious advances, offline meeting safety and privacy boundaries." }, { title: "Meetup / Housing / Hiring Policy", body: "Covers event risk prompts, housing listings, hiring posts and user-generated content." }, { title: "Report & Enforcement Policy", body: "Covers reports, blocking, review, content removal and account penalties." }] }] },
    ja: { eyebrow: "利用規約", title: "信頼できる地域コミュニティを一緒に守る。", intro: "Machi を利用することで、プラットフォーム規則、コミュニティ規範、ソーシャル安全ポリシー、現地法に従うことに同意します。", blocks: [{ title: "Community Guidelines", variant: "legal", items: [{ title: "禁止コンテンツ", body: "嫌がらせ、ヘイト、詐欺、なりすまし、悪質な誘い、成人向け嫌がらせ、同意のないプライバシー公開は禁止です。" }, { title: "虚偽とリスク", body: "虚偽イベント、虚偽事業者、虚偽求人、虚偽物件、危険な対面行為、誤解を招く広告は処理対象です。" }, { title: "執行", body: "通報、ブロック、削除、アカウント制限、事業者認証確認、イベントリスク表示を行う場合があります。" }] }, { title: "Policy set", variant: "list", items: [{ title: "Social Safety Policy", body: "悪質な誘い、対面安全、プライバシー境界を扱います。" }, { title: "Meetup / Housing / Hiring Policy", body: "イベント、住まい掲載、求人掲載、ユーザー生成コンテンツを扱います。" }, { title: "Report & Enforcement Policy", body: "通報、ブロック、審査、削除、アカウント処分を扱います。" }] }] },
  },
};
