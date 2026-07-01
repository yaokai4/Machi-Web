import type { MarketingLocale } from "./machi-home";

export type MarketingPageId =
  | "about"
  | "features"
  | "cities"
  | "guide"
  | "business"
  | "safety"
  | "download"
  | "updates"
  | "faq"
  | "ads"
  | "contact"
  | "partners"
  | "jobs-promotion"
  | "housing-promotion"
  | "safety-center"
  | "privacy"
  | "terms"
  | "membership-terms"
  | "service-terms"
  | "refund-policy"
  | "community-guidelines"
  | "commercial-disclosure"
  | "cookie-policy";

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
  guide: "指南",
  business: "商家合作",
  safety: "安全",
  download: "下载",
  updates: "更新",
  faq: "FAQ",
  ads: "广告投放",
  contact: "联系",
  partners: "系统合作",
  "jobs-promotion": "招聘推广",
  "housing-promotion": "租房推广",
  "safety-center": "安全中心",
  privacy: "隐私政策",
  terms: "服务条款",
  "membership-terms": "会员条款",
  "service-terms": "服务预约条款",
  "refund-policy": "退款政策",
  "community-guidelines": "社区规则",
  "commercial-disclosure": "商业披露",
  "cookie-policy": "Cookie 政策",
};

export const marketingPages: Record<MarketingPageId, Record<MarketingLocale, MarketingPageCopy>> = {
  about: {
    zh: {
      eyebrow: "关于 Machi",
      title: "让一座城市，成为可以好好生活的地方。",
      intro: "Machi 由姚凯在东京创立。我们按城市和语言，整理生活指南、租房、二手、工作、问答、本地服务与社区连接，让实用信息更容易找到，也更容易判断。",
      blocks: [
        { title: "为什么做 Machi", subtitle: "真正让人困住的，往往不是没有答案，而是不知道哪个答案仍然适合自己。", body: "租房合同里容易忽略的条款，办理手续的先后顺序，求职时应该留意的条件，搬家前想转手的家具，周末附近的活动。这些信息都很具体，也都与城市、时间和语言有关。\n\n它们常常散在群聊、社交平台、地方网站和朋友之间。Machi 把这些经验重新放回它发生的城市，保留必要的背景，让后来的人在真正需要时还能找到。" },
        { title: "我们珍视的事", variant: "grid", items: [
          { title: "信息落在具体城市", body: "同一件事在不同国家和地区可能完全不同，地点是理解信息的第一层背景。" },
          { title: "经验带着时间与来处", body: "亲身经历、明确来源和更新时间，能帮助人判断一条信息是否仍然适用。" },
          { title: "语言不挡住生活", body: "界面语言和内容语言分别选择，让多语言城市里的每个人都能找到与自己有关的内容。" },
          { title: "设计服务于理解", body: "少一点干扰，少一点为了停留而设计的机制，把清楚、可信与好用放在前面。" },
        ] },
        { title: "Machi 由什么组成", variant: "grid", items: [
          { title: "Guide", body: "从日本开始，整理生活手续、升学、求职、JLPT、学校与公司资料，以及实际会用到的服务。" },
          { title: "城市频道", body: "租房、二手、工作、招聘、活动、问答和本地服务，按城市与主题各归其位。" },
          { title: "多语言社区", body: "在同一座城市里，用熟悉的语言提问、分享经验、参加小组，也看见其他语言的本地内容。" },
          { title: "可信的本地连接", body: "通过认证、风险提示、举报、屏蔽和审核，为人与人、人与服务之间的连接保留边界。" },
        ] },
        { title: "接下来怎样生长", variant: "list", items: [
          { meta: "现在", title: "先把日本与东京做好", body: "继续完善在日生活、求职、升学、Guide 与城市社区，让高频问题有清楚、可靠的答案。" },
          { meta: "下一步", title: "根据真实需求开放新城市", body: "不以地图上的覆盖数量为目标，而是确认内容、服务与社区条件后，再进入下一座城市。" },
          { meta: "长期", title: "建立可持续的本地生态", body: "让居民、商家、招聘方、住居相关服务与社区组织，在明确规则下参与并建立信任。" },
        ] },
        { title: "今天的 Machi", subtitle: "我们仍是一支小而专注的团队。", body: "Web 版已经开放，iOS 与 Android 正在准备。现阶段，我们更在意每一条路径是否清楚、每一种语言是否自然、每一个公开状态是否诚实。\n\n从东京开始，我们想把 Machi 做成一个很多年后仍然有用的地方：人在需要时愿意回来，也愿意把自己的经验留给别人。" },
        { title: "与我们联系", variant: "contact", body: "品牌合作、媒体采访、城市建议或早期参与，欢迎写信至 hi@machicity.com。" },
      ],
    },
    en: {
      eyebrow: "About Machi",
      title: "Make a city easier to live in, one useful answer at a time.",
      intro: "Founded by Yao Kai in Tokyo, Machi organizes guides, housing, secondhand exchange, jobs, questions, local services, and community connections by city and language.",
      blocks: [
        { title: "Why Machi exists", subtitle: "The problem is often not a lack of answers, but not knowing which answer still applies to you.", body: "A clause that is easy to miss in a lease, the right order for local paperwork, what to check before accepting a job, furniture someone hopes to pass on before moving, or an event happening nearby this weekend: useful local information is specific to place, time, and language.\n\nToday it is scattered across group chats, social platforms, local sites, and personal circles. Machi brings that experience back into the city where it happened, with enough context for someone else to find and judge it later." },
        { title: "What we value", variant: "grid", items: [
          { title: "Information belongs somewhere", body: "The same question can have a different answer in every country and city. Place is the first layer of context." },
          { title: "Experience needs a date and source", body: "First-hand knowledge, clear origins, and recent updates help people decide whether advice still applies." },
          { title: "Language should not block daily life", body: "Interface and content languages are chosen separately, so multilingual cities are not reduced to a single voice." },
          { title: "Design should aid understanding", body: "Less distraction and fewer mechanics built only for attention; more clarity, trust, and practical use." },
        ] },
        { title: "What makes up Machi", variant: "grid", items: [
          { title: "Guide", body: "Starting in Japan, with practical help for daily procedures, study, careers, JLPT, school and company research, and useful services." },
          { title: "City channels", body: "Housing, secondhand, jobs, hiring, events, Q&A, and local services, each with a clear city and topic." },
          { title: "Multilingual community", body: "Ask questions, share experience, join groups, and discover local content in the languages that work for you." },
          { title: "Trusted local connection", body: "Verification, risk prompts, reporting, blocking, and review create clearer boundaries between people and services." },
        ] },
        { title: "How Machi will grow", variant: "list", items: [
          { meta: "NOW", title: "Build Japan and Tokyo well", body: "Keep improving daily-life, career, study, Guide, and city-community paths around the questions people ask most." },
          { meta: "NEXT", title: "Open new cities when the need is real", body: "We care less about filling a map than having the content, services, and community conditions to support a city properly." },
          { meta: "LONG TERM", title: "Build a sustainable local ecosystem", body: "Create clear rules for residents, businesses, recruiters, housing-related services, and community organizations to participate with trust." },
        ] },
        { title: "Machi today", subtitle: "We are still a small, focused team.", body: "The web app is live, while iOS and Android are in preparation. At this stage, we care about whether every path is clear, every language feels natural, and every public status is honest.\n\nStarting in Tokyo, we want to build something that remains useful years from now: a place people return to when they need help, and contribute to when they have something worth passing on." },
        { title: "Get in touch", variant: "contact", body: "For partnerships, press, city suggestions, or early participation, write to hi@machicity.com." },
      ],
    },
    ja: {
      eyebrow: "Machi について",
      title: "街で暮らすための手がかりを、必要な人へ。",
      intro: "Machi は、姚凱が東京で立ち上げたローカルライフプラットフォームです。ガイド、住まい、譲り合い、仕事、相談、地域サービス、コミュニティを、街と言語ごとに整理します。",
      blocks: [
        { title: "Machi をつくる理由", subtitle: "答えがないのではなく、今の自分に合う答えを見つけにくい。そこから始まりました。", body: "賃貸契約で見落としやすい項目、役所手続きの順番、仕事を選ぶときの注意点、引っ越し前に譲りたい家具、今週末の地域イベント。役に立つ情報は、街や時期、言語によって変わります。\n\nところが、その多くはグループチャットやSNS、地域サイト、知人どうしの会話に散らばり、すぐに流れてしまいます。Machi は、経験を生まれた街へ戻し、あとから必要になった人が判断できる背景とともに残します。" },
        { title: "大切にしていること", variant: "grid", items: [
          { title: "情報を具体的な街に結びつける", body: "同じ質問でも、国や街が変われば答えは変わります。場所は情報を理解するための大切な背景です。" },
          { title: "経験の時期と出どころを示す", body: "実体験、明確な情報源、更新時期がわかれば、今も使える情報か判断しやすくなります。" },
          { title: "言語を暮らしの壁にしない", body: "画面とコンテンツの言語を別々に選べるため、多言語の街を一つの言葉だけで扱いません。" },
          { title: "理解しやすい設計を優先する", body: "注意を奪う仕掛けを減らし、わかりやすさ、信頼、実際の使いやすさを大切にします。" },
        ] },
        { title: "Machi を構成するもの", variant: "grid", items: [
          { title: "Guide", body: "まずは日本から、生活手続き、進学、就職、JLPT、学校・企業情報、実際に使うサービスを整理します。" },
          { title: "街のチャンネル", body: "住まい、譲り合い、仕事、求人、イベント、Q&A、地域サービスを街とテーマごとに探せます。" },
          { title: "多言語コミュニティ", body: "使いやすい言語で質問や共有ができ、ほかの言語で発信された地域情報にも出会えます。" },
          { title: "信頼できる地域のつながり", body: "認証、注意喚起、通報、ブロック、審査によって、人とサービスの間に必要な境界を設けます。" },
        ] },
        { title: "これからの育て方", variant: "list", items: [
          { meta: "現在", title: "まず日本と東京を丁寧につくる", body: "日本での暮らし、仕事、進学、Guide、地域コミュニティを、よくある疑問から着実に改善します。" },
          { meta: "次の段階", title: "必要とされる街から広げる", body: "地図を埋めることより、情報、サービス、コミュニティをきちんと支えられるかを確かめてから次の街へ進みます。" },
          { meta: "長期", title: "持続する地域の仕組みをつくる", body: "住民、店舗、採用担当、住まいに関わる事業者、地域団体が、明確なルールのもとで参加できる環境を整えます。" },
        ] },
        { title: "現在の Machi", subtitle: "まだ小さなチームで開発しています。", body: "Web 版は公開済みで、iOS と Android は準備中です。今は、導線がわかりやすいか、各言語が自然に読めるか、公開状況を正確に伝えているかを一つずつ確かめています。\n\n東京から始め、何年後も役に立つプロダクトを目指します。困ったときに戻ってこられ、知っていることがあれば次の人へ渡せる。Machi を、そんな場所に育てていきます。" },
        { title: "お問い合わせ", variant: "contact", body: "提携、取材、街に関するご提案、先行利用については、hi@machicity.com までご連絡ください。" },
      ],
    },
  },
  features: {
    zh: {
      eyebrow: "功能",
      title: "在一座城市里真正会用到的，都放在清楚的位置。",
      intro: "从 Guide、问答和搜索，到租房、二手、工作、服务与本地社区，Machi 用城市和语言把这些入口连在一起。",
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
		        { title: "社区与线下活动", variant: "grid", items: [
	          { title: "同城社区", body: "公开城市话题、本地互助、兴趣小组和社区讨论。" },
	          { title: "本地小组", body: "美食聚会、咖啡讨论、活动小组、运动小组和周末本地活动。" },
	          { title: "活动 / 语言交换 / 问答", body: "围绕城市活动、语言学习和生活问题参与社区互动。" },
	          { title: "避坑经验", body: "租房、交易、招聘和线下社区活动的风险提醒。" },
	        ] },
      ],
    },
    en: {
      eyebrow: "Features",
      title: "The everyday parts of city life, each with a clear place.",
      intro: "From Guide, Q&A, and search to housing, secondhand exchange, jobs, services, and local community, Machi connects the practical paths people use in a city.",
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
	        { title: "Community & Offline", variant: "grid", items: [
	          { title: "City community", body: "Public city topics, local help, interest groups and community discussions." },
	          { title: "Local groups", body: "Food meetups, café discussions, event groups, sports groups and weekend community posts." },
	          { title: "Events / Language Exchange / Q&A", body: "Take part in community activities around city events, language learning and local questions." },
	          { title: "Safety notes", body: "Local warnings for housing, transactions, hiring and in-person community activities." },
	        ] },
      ],
    },
    ja: {
      eyebrow: "機能",
      title: "街でよく使うものを、迷わず探せる場所に。",
      intro: "Guide、Q&A、検索から、住まい、譲り合い、仕事、地域サービス、コミュニティまで。Machi は、街と言語を軸に日々の入口をつなぎます。",
      blocks: [
        { title: "コンテンツチャンネル", variant: "grid", items: [
          { title: "ニュースとガイド", body: "地域ニュース、制度の変更、生活上の注意、実体験にもとづくガイド。" },
          { title: "Q&A と体験談", body: "街の中に散らばる疑問と回答を、あとから検索できる形で残します。" },
          { title: "トレンド", body: "街、国、Machi 全体の三つの範囲から、今注目されている話題を見つけます。" },
          { title: "多言語投稿", body: "ユーザーが選んだ投稿言語を優先します。" },
        ] },
        { title: "取引と機会", variant: "grid", items: [
          { title: "譲り合い", body: "中古品の出品、引っ越し前の整理、探し物、無料での譲渡。" },
          { title: "住まい", body: "賃貸、転貸、シェアハウス、ルームメイト探し、契約時の注意点。" },
          { title: "サービス", body: "引っ越し、ビザ、翻訳、修理、税務など。" },
          { title: "仕事と採用", body: "バイト、正社員、インターン、紹介、地域採用。" },
        ] },
	        { title: "コミュニティとオフライン", variant: "grid", items: [
	          { title: "街のコミュニティ", body: "公開された街の話題、地域の助け合い、趣味のグループ、コミュニティ投稿。" },
	          { title: "地域グループ", body: "食事、カフェでの交流、イベント、スポーツ、週末の集まり。" },
	          { title: "イベント・言語交換・Q&A", body: "地域イベント、言語学習、暮らしの質問をきっかけに参加できます。" },
	          { title: "注意情報", body: "住まい、取引、求人、オフラインのコミュニティ活動に関するリスクを共有。" },
	        ] },
      ],
    },
  },
  cities: {
    zh: { eyebrow: "城市", title: "先认真做好一座城市，再走向下一座。", intro: "Machi 目前以日本和东京为重点，完善 Guide、城市内容、服务与社区功能。其他城市会根据真实需求和准备程度逐步开放，并清楚标注状态。", blocks: [{ title: "正在建设", variant: "grid", items: [
	      { title: "日本 · 东京", meta: "重点建设", body: "优先完善城市社区、在日生活信息、Machi Guide、本地服务与小组。" },
      { title: "日本 · 大阪", meta: "准备中", body: "围绕生活指南、本地活动、工作、二手和服务场景进行准备。" },
	      { title: "日本 · 京都", meta: "准备中", body: "整理留学与旅游之外的长期生活经验，并为本地社区做准备。" },
    ] }, { title: "下一阶段", variant: "grid", items: [
      { title: "Canada", body: "多语言城市、租房、工作、本地问答和新移居者支持。" },
      { title: "Australia", body: "城市社区、服务、活动、二手和生活手续。" },
      { title: "United Kingdom", body: "学习、工作、租房和本地服务场景。" },
      { title: "France", body: "多语言生活指南、活动和本地服务。" },
      { title: "Germany", body: "手续、工作、住房和城市问答。" },
	      { title: "South Korea", body: "生活信息、语言交换、活动和本地社区。" },
      { title: "United States", body: "首批海外城市将以真实需求和社区密度逐步开放。" },
    ] }, { title: "每座城市会逐步拥有", variant: "list", items: [
      { title: "租房、工作与服务", body: "房源、工作、本地服务与商家信息，会按城市、地区和语言整理。" },
      { title: "活动、语言交换与问答", body: "本地活动、兴趣小组、语言交换、问答与真实经验，会共同构成城市社区。" },
    ] }] },
    en: { eyebrow: "Cities", title: "Build one city well, then earn the right to open the next.", intro: "Machi is currently focused on Japan and Tokyo, improving Guide, city content, services, and community features. Other cities will open gradually as real demand and local readiness grow, with status shown clearly.", blocks: [{ title: "Now building", variant: "grid", items: [
	      { title: "Japan · Tokyo", meta: "Now building", body: "Tokyo is where we refine city community, local information, Guide, services and local groups first." },
      { title: "Japan · Osaka", meta: "Preparing", body: "Preparing life guides, local events, hiring, secondhand and service scenes." },
	      { title: "Japan · Kyoto", meta: "Preparing", body: "Preparing real everyday experience and local community beyond travel and study." },
    ] }, { title: "Next regions", variant: "grid", items: [
      { title: "Canada", body: "Multilingual cities, housing, work, local Q&A and newcomer support." },
      { title: "Australia", body: "City communities, services, events, secondhand and local procedures." },
      { title: "United Kingdom", body: "Study, work, housing and local service scenes." },
      { title: "France", body: "Multilingual life guides, events and local services." },
      { title: "Germany", body: "Procedures, work, housing and city Q&A." },
	      { title: "South Korea", body: "Local information, language exchange, events and city communities." },
      { title: "United States", body: "First overseas cities will open gradually by real demand and community density." },
    ] }, { title: "What each city will grow into", variant: "list", items: [
      { title: "Housing, jobs, and services", body: "Listings, work, local services, and business information organized by city, area, and language." },
      { title: "Events, language exchange, and Q&A", body: "Local events, interest groups, language exchange, questions, and lived experience forming a useful city community." },
    ] }] },
    ja: { eyebrow: "街", title: "一つの街をきちんと育ててから、次の街へ。", intro: "Machi は現在、日本と東京を中心に、Guide、街の情報、地域サービス、コミュニティ機能を整えています。ほかの街は、実際の需要と準備状況を確かめながら段階的に公開し、状態も明確に表示します。", blocks: [{ title: "現在取り組んでいる街", variant: "grid", items: [
	      { title: "日本 · 東京", meta: "重点開発中", body: "地域コミュニティ、日本での生活情報、Machi Guide、地域サービス、グループ機能を優先して改善しています。" },
      { title: "日本 · 大阪", meta: "準備中", body: "生活ガイド、地域イベント、仕事、譲り合い、サービスに関する準備を進めています。" },
	      { title: "日本 · 京都", meta: "準備中", body: "観光や留学だけではない、長く暮らす人のための情報と地域コミュニティを準備しています。" },
    ] }, { title: "次の地域", variant: "grid", items: [
      { title: "カナダ", body: "多言語で暮らす街、住まい、仕事、Q&A、新生活のサポート。" },
      { title: "オーストラリア", body: "地域コミュニティ、サービス、イベント、譲り合い、暮らしの手続き。" },
      { title: "英国", body: "学び、仕事、住まい、地域サービスに関する情報。" },
      { title: "France", body: "多言語の生活ガイド、イベント、地域サービス。" },
      { title: "ドイツ", body: "暮らしの手続き、仕事、住まい、街の Q&A。" },
	      { title: "韓国", body: "生活情報、言語交換、イベント、地域コミュニティ。" },
      { title: "米国", body: "実際の需要とコミュニティの育ち方を見ながら、対応する街を広げます。" },
    ] }, { title: "それぞれの街で育てるもの", variant: "list", items: [
      { title: "住まい・仕事・地域サービス", body: "物件、仕事、地域サービス、事業者情報を、街・エリア・言語ごとに整理します。" },
      { title: "イベント・言語交換・Q&A", body: "地域イベント、趣味のグループ、言語交換、質問、実体験をつなぎ、役に立つ地域コミュニティを育てます。" },
    ] }] },
  },
  guide: {
    zh: { eyebrow: "Machi Guide", title: "把在日本生活的每一步，讲得更清楚。", intro: "Machi Guide 从真实流程出发，整理生活手续、升学、求职、JLPT、学校与公司资料，以及实际会用到的服务。它是 Machi 的知识部分，但不是 Machi 的全部。", blocks: [{ title: "目前重点整理", variant: "grid", items: [
      { title: "日本生活", body: "银行卡、手机卡、年金、保险、役所手续、租房和打工。" },
      { title: "日本升学", body: "大学院、专门学校、研究计划书、教授联系和出愿材料。" },
      { title: "日本就职", body: "履历书、职务经歴书、ES、面试、公司选择和签证变更。" },
      { title: "日语考级", body: "JLPT N5-N1、词汇语法、阅读听力和备考资料。" },
      { title: "学校库与公司库", body: "大学、大学院、专门学校、语言学校，以及外国人就职参考。" },
	      { title: "资料与服务", body: "模板、清单、翻译、接机、手续协助和申请辅导。" },
    ] }, { title: "使用前请了解", variant: "legal", items: [
		      { title: "Guide 是 Machi 的一部分", body: "Machi 还包括城市内容、租房、二手、工作、问答、本地小组、商家与服务等功能。" },
      { title: "信息不能替代专业判断", body: "升学、签证、就业、租房、开户等结果取决于个人材料、第三方机构与当地规则。重要事项请同时向官方或专业人士确认。" },
      { title: "内容会持续更新", body: "我们会先把日本内容做深，再根据城市需求逐步扩展到其他国家和地区。" },
    ] }] },
    en: { eyebrow: "Machi Guide", title: "Make each step of life in Japan easier to understand.", intro: "Machi Guide follows the real processes people face: daily paperwork, study, careers, JLPT, school and company research, and practical services. It is the knowledge side of Machi, but not the whole product.", blocks: [{ title: "Our current focus", variant: "grid", items: [
      { title: "Life in Japan", body: "Banking, mobile plans, pension, insurance, city office procedures, housing and part-time work." },
      { title: "Study in Japan", body: "Graduate school, vocational schools, research plans, professor outreach and application materials." },
      { title: "Career in Japan", body: "Resume, rirekisho, ES, interviews, company selection and visa change." },
      { title: "JLPT", body: "JLPT N5-N1, vocabulary, grammar, reading, listening and preparation materials." },
      { title: "School and company directories", body: "Universities, graduate schools, vocational schools, language schools and foreigner-friendly company references." },
      { title: "Materials and services", body: "Templates, checklists, translation, airport pickup, procedure support and application coaching." },
    ] }, { title: "Before you rely on a guide", variant: "legal", items: [
		      { title: "Guide is one part of Machi", body: "Machi also includes city content, housing, secondhand exchange, jobs, Q&A, local groups, businesses, and services." },
      { title: "Information is not a guarantee", body: "Study, visa, employment, housing, and banking outcomes depend on personal documents, third parties, and local rules. Confirm important matters with official or qualified sources." },
      { title: "Content will keep changing", body: "We are going deeper in Japan first, then expanding to other countries and regions as city needs become clear." },
    ] }] },
    ja: { eyebrow: "Machi Guide", title: "日本で暮らす一つひとつの手順を、わかりやすく。", intro: "Machi Guide は、日々の手続き、進学、就職、JLPT、学校・企業情報、実際に使うサービスを、現実の流れに沿って整理します。Machi の知識を支える機能ですが、プロダクトのすべてではありません。", blocks: [{ title: "現在重点的に整理している分野", variant: "grid", items: [
      { title: "日本生活", body: "銀行口座、携帯、年金、保険、役所手続き、住まい、アルバイト。" },
      { title: "日本進学", body: "大学院、専門学校、研究計画書、教授連絡、出願書類。" },
      { title: "日本就職", body: "履歴書、職務経歴書、ES、面接、会社選び、ビザ変更。" },
      { title: "JLPT", body: "JLPT N5-N1、語彙、文法、読解、聴解、学習資料。" },
      { title: "学校・会社データベース", body: "大学、大学院、専門学校、日本語学校、外国人就職向け会社情報。" },
	      { title: "資料とサービス", body: "テンプレート、チェックリスト、翻訳、空港送迎、手続きサポート、申請サポート。" },
    ] }, { title: "利用する前に", variant: "legal", items: [
		      { title: "Guide は Machi の一部です", body: "Machi には、街の情報、住まい、譲り合い、仕事、Q&A、地域グループ、事業者、サービスなどの機能もあります。" },
      { title: "情報は結果を保証するものではありません", body: "進学、在留資格、就職、住まい、口座開設などは、本人の書類、第三者機関、現地の制度に左右されます。重要な事項は公式窓口や専門家にもご確認ください。" },
      { title: "内容は継続して更新します", body: "まず日本の情報を充実させ、街ごとの需要を確かめながらほかの国や地域へ広げます。" },
    ] }] },
  },
  business: {
    zh: { eyebrow: "商家合作", title: "让真正有用的本地服务，出现在需要它的人面前。", intro: "Machi 的商家合作不只是一块广告位。餐厅、语言学校、活动组织者、本地服务商、招聘方与房产服务方提交真实资料并通过认证后，才能在对应城市、频道和语言中发布。", blocks: [{ title: "认证后可以发布", variant: "grid", items: [
      { title: "服务卡片", body: "展示公司/店铺名称、服务范围、价格区间、联系方式、地址和官网，让用户知道你具体能解决什么问题。" },
      { title: "优惠与活动", body: "发布餐厅优惠、体验课、城市活动、团体报名和限时活动，和真实生活场景放在一起。" },
      { title: "招聘与岗位", body: "发布兼职、全职、实习和本地岗位，补充公司信息、工作内容、薪资范围和联系方式。" },
      { title: "城市推广", body: "按城市、频道、语言和内容类型获得曝光，不把广告塞给不相关的人。" },
    ] }, { title: "适合的商家类型", variant: "grid", items: [
	      { title: "餐厅与咖啡店", body: "美食聚会、本地优惠、预约和城市活动。" },
      { title: "语言学校与课程机构", body: "体验课、语言交换、学习小组和本地招生活动。" },
      { title: "本地服务商", body: "搬家、维修、翻译、签证、留学、报税、保险等城市服务。" },
      { title: "招聘方与房产服务", body: "本地岗位、兼职招聘、房源服务、转租协助和城市生活咨询。" },
    ] }, { title: "运营边界", variant: "list", items: [
      { title: "先提交资料", body: "发布商家内容前必须填写公司/店铺信息、服务内容、联系方式和服务城市。" },
      { title: "清晰标记商家", body: "认证商家、推广内容和普通用户内容会有明确区分。" },
      { title: "接受复核与下架", body: "虚假服务、误导价格、风险招聘、虚假房源和骚扰行为会被复核、限制或下架。" },
    ] }] },
    en: { eyebrow: "For Business", title: "Put genuinely useful local services in front of people who need them.", intro: "A Machi business presence is more than an ad slot. Restaurants, language schools, event organizers, local service providers, recruiters, and housing teams submit real business details and pass verification before publishing in the relevant city, channel, and language.", blocks: [{ title: "After verification, businesses can publish", variant: "grid", items: [
      { title: "Service cards", body: "Show business name, service scope, price range, contact methods, address and website so users know exactly what you provide." },
      { title: "Offers and events", body: "Publish dining offers, trial classes, city events, group signups and time-limited campaigns in real local-life contexts." },
      { title: "Hiring posts", body: "Post part-time, full-time and internship roles with company details, role content, pay range and contact information." },
      { title: "City promotion", body: "Get exposure by city, channel, language and content type instead of pushing ads to unrelated users." },
    ] }, { title: "Best-fit partners", variant: "grid", items: [
      { title: "Restaurants and cafes", body: "Dining plans, local offers, reservations and city events." },
      { title: "Language schools and classes", body: "Trial classes, language exchange groups, learning circles and local enrollment." },
      { title: "Local service providers", body: "Moving, repair, translation, visa, study-abroad, tax and insurance services." },
      { title: "Recruiters and housing teams", body: "Local jobs, part-time hiring, housing support, sublet help and city-life consulting." },
    ] }, { title: "Operating boundaries", variant: "list", items: [
      { title: "Submit details first", body: "Business posts require company or store information, service content, contact methods and target cities." },
      { title: "Clear business labels", body: "Verified businesses, promoted content and user posts are separated clearly." },
      { title: "Review and removal", body: "False services, misleading prices, risky hiring, fake listings and harassment can be reviewed, limited or removed." },
    ] }] },
    ja: { eyebrow: "ビジネス", title: "役に立つ地域サービスを、必要としている人へ。", intro: "Machi の事業者向け機能は、単なる広告枠ではありません。飲食店、語学学校、イベント主催者、地域サービス、採用担当、不動産関連事業者は、実在する事業情報を提出し、認証後に街・チャンネル・言語に合った形で掲載できます。", blocks: [{ title: "認証後に掲載できる内容", variant: "grid", items: [
      { title: "サービスカード", body: "会社・店舗名、対応範囲、価格帯、連絡先、住所、公式サイトを表示し、何を提供できるかを明確にします。" },
      { title: "特典とイベント", body: "飲食店の特典、体験レッスン、地域イベント、グループ参加、期間限定企画を掲載できます。" },
      { title: "求人投稿", body: "アルバイト、正社員、インターンの求人に、会社情報、仕事内容、給与目安、連絡先を添えて掲載できます。" },
      { title: "街別プロモーション", body: "街、チャンネル、言語、内容の種類に合わせて、関係のあるユーザーへ届けます。" },
    ] }, { title: "相性のよい事業者", variant: "grid", items: [
      { title: "レストラン・カフェ", body: "食事会、地域特典、予約、イベント。" },
      { title: "語学学校・教室", body: "体験レッスン、言語交換、学習グループ、地域募集。" },
      { title: "地域サービス", body: "引っ越し、修理、翻訳、ビザ、留学、税務、保険など。" },
      { title: "採用・住まい関連", body: "地域求人、アルバイト募集、住まい探し、転貸の相談、生活サポート。" },
    ] }, { title: "運用ルール", variant: "list", items: [
      { title: "先に情報提出", body: "商用投稿には会社・店舗情報、サービス内容、連絡先、対応都市が必要です。" },
      { title: "事業者表示を明確に", body: "認証事業者、プロモーション、一般投稿は区別して表示します。" },
      { title: "審査と削除", body: "虚偽サービス、誤解を招く価格、危険な求人、偽物件、嫌がらせは審査・制限・削除の対象です。" },
    ] }] },
  },
  safety: {
	    zh: { eyebrow: "安全", title: "连接可以自然发生，边界必须事先清楚。", intro: "从公开讨论和线下活动，到租房、二手、招聘与本地服务，Machi 把风险提示、举报、屏蔽、审核和认证放进对应的使用场景。", blocks: [{ title: "安全机制", variant: "grid", items: [
	      { title: "社区安全", body: "不要过早分享住址、证件和财务信息；遇到骚扰、诈骗或冒犯内容，可以举报或屏蔽。" },
	      { title: "线下活动安全", body: "第一次见面请选择公共场所，告诉朋友时间与地点，并保留必要的沟通记录。" },
	      { title: "租房安全", body: "不要向未经核实的房东提前转账，确认地址、合同、身份与付款方式。" },
	      { title: "求职与招聘安全", body: "不要支付入职押金，核实公司官网、地址、联系方式与实际工作内容。" },
	      { title: "举报与屏蔽", body: "提供举报、屏蔽、内容审核、下架和账号限制等处理机制。" },
	      { title: "禁止的服务", body: "禁止成人与性服务、违法线下服务、高风险私人交易，以及暗示付费私人陪伴的内容或交易。" },
	      { title: "社区功能范围", body: "社区用于公开城市话题、本地小组、问答、活动、语言交换、租房、工作、服务和日常生活讨论。" },
	      { title: "社区规则", body: "禁止骚扰、仇恨、诈骗、冒充、危险行为及其他伤害用户的内容。" },
	    ] }] },
	    en: { eyebrow: "Safety", title: "Connections can happen naturally. Boundaries should be clear from the start.", intro: "From public discussions and in-person activities to housing, secondhand exchange, hiring, and local services, Machi places risk guidance, reporting, blocking, review, and verification in the relevant flow.", blocks: [{ title: "Safety tools", variant: "grid", items: [
	      { title: "Community safety", body: "Do not share address, ID or financial details too early. Report or block harassment, scams and offensive content." },
	      { title: "In-person safety", body: "Meet in a public place the first time, tell a friend when and where you are going, and keep relevant messages." },
	      { title: "Housing safety", body: "Do not prepay an unverified landlord. Check the address, contract, identity, and payment method." },
	      { title: "Jobs and hiring", body: "Never pay a job deposit. Verify the company, address, contact details, and actual role." },
	      { title: "Report and block", body: "Reporting, blocking, review, takedowns and account limits form the enforcement flow." },
	      { title: "Prohibited services", body: "Machi prohibits adult services, illegal high-risk offline services, sexual services, and any content or transaction that suggests paid private offline activity." },
	      { title: "Community scope", body: "Community features are limited to public city topics, local groups, Q&A, events, language exchange, local information, housing, jobs, services, and everyday city-life discussions." },
	      { title: "Community guidelines", body: "Guidelines cover harassment, hate, scams, impersonation, prohibited offline services and dangerous conduct." },
	    ] }] },
	    ja: { eyebrow: "安全", title: "つながりは自然に。守るべき境界は、最初から明確に。", intro: "公開のやり取りや地域の活動から、住まい、譲り合い、求人、地域サービスまで。Machi は、それぞれの場面に注意喚起、通報、ブロック、審査、認証の仕組みを設けます。", blocks: [{ title: "安全のための仕組み", variant: "grid", items: [
	      { title: "コミュニティの安全", body: "住所、身分証、金銭に関する情報を早い段階で共有しないでください。嫌がらせや詐欺は通報・ブロックできます。" },
	      { title: "対面時の安全", body: "初めて会うときは公共の場所を選び、日時と場所を友人に伝え、必要なやり取りを残してください。" },
	      { title: "住まいの安全", body: "確認できていない貸主へ前払いせず、住所、契約、本人確認、支払方法を確かめてください。" },
	      { title: "仕事と求人の安全", body: "採用のための保証金や手数料は支払わず、会社情報、所在地、連絡先、仕事内容を確認してください。" },
	      { title: "通報とブロック", body: "通報、ブロック、審査、削除、アカウント制限などの対応を行います。" },
	      { title: "禁止しているサービス", body: "アダルト・性的サービス、違法な対面サービス、高リスクの個人間取引、有料の私的な同伴を示唆する内容や取引は禁止です。" },
	      { title: "コミュニティ機能の範囲", body: "街の話題、地域グループ、Q&A、イベント、言語交換、住まい、仕事、サービス、日常生活に関する公開投稿を対象とします。" },
	      { title: "コミュニティ規範", body: "嫌がらせ、ヘイト、詐欺、なりすまし、危険行為など、ユーザーを傷つける行為を禁止します。" },
	    ] }] },
  },
  download: {
    zh: { eyebrow: "使用 Machi", title: "Web 版已经开放，App 正在路上。", intro: "现在可以直接注册并使用 Machi Web。iOS 与 Android 正在准备，正式上架前会始终明确标注状态。", blocks: [{ title: "Web 版可以做什么", variant: "grid", items: [
	      { title: "城市首页", body: "查看与你所在城市有关的内容、频道和动态。" }, { title: "发现与搜索", body: "查找租房、工作、问答、活动与本地服务。" }, { title: "通知与私信", body: "接收回复、关注话题，并继续一对一沟通。" }, { title: "发布与个人主页", body: "分享经验、提出需求，也让别人了解你的公开身份。" }, { title: "社区参与", body: "加入公开城市话题、本地小组、活动讨论和语言交换。" },
    ] }, { title: "状态", variant: "list", items: [{ title: "iOS", body: "现已上线" }, { title: "Android", body: "即将上线" }, { title: "Web Beta", body: "已开放体验" }] }] },
    en: { eyebrow: "Use Machi", title: "The web app is live. Mobile apps are on the way.", intro: "You can register and use Machi Web now. iOS and Android are in preparation, with availability kept clearly marked until each store release.", blocks: [{ title: "What you can do on the web", variant: "grid", items: [
	      { title: "City home", body: "See content, channels, and activity related to your city." }, { title: "Discovery and search", body: "Find housing, jobs, Q&A, events, and local services." }, { title: "Notifications and messages", body: "Follow replies and local topics, then continue conversations privately." }, { title: "Posting and profiles", body: "Share experience, post a need, and present a clear public profile." }, { title: "Community participation", body: "Join public city topics, local groups, event discussions, and language exchange." },
    ] }, { title: "Status", variant: "list", items: [{ title: "iOS", body: "Available now" }, { title: "Android", body: "Coming soon" }, { title: "Web Beta", body: "Available now" }] }] },
    ja: { eyebrow: "Machi を使う", title: "Web 版は公開中。アプリも準備を進めています。", intro: "Machi Web は現在ご利用いただけます。iOS と Android は準備中で、ストアで正式公開するまでは提供状況を明確に表示します。", blocks: [{ title: "Web 版でできること", variant: "grid", items: [
	      { title: "街のホーム", body: "現在の街に関係する投稿、チャンネル、動きを確認できます。" }, { title: "発見と検索", body: "住まい、仕事、Q&A、イベント、地域サービスを探せます。" }, { title: "通知とメッセージ", body: "返信や地域の話題を確認し、必要に応じて個別にやり取りできます。" }, { title: "投稿とプロフィール", body: "経験や必要としていることを投稿し、公開プロフィールで自分を伝えられます。" }, { title: "コミュニティへの参加", body: "街の話題、地域グループ、イベント、言語交換に参加できます。" },
    ] }, { title: "ステータス", variant: "list", items: [{ title: "iOS", body: "公開中" }, { title: "Android", body: "近日公開" }, { title: "Web Beta", body: "利用できます" }] }] },
  },
  updates: {
    zh: { eyebrow: "更新", title: "Machi 正在做到哪里", intro: "产品状态、Guide 更新、新城市准备与合作开放，都在这里如实记录。", blocks: [{ title: "当前状态", variant: "list", items: [
      { meta: "2026.06", title: "Web Beta 已开放体验", body: "用户可以注册并使用城市首页、发现与搜索、通知、私信、发布、个人主页和同城连接。" },
      { meta: "2026.06", title: "日本 Guide 持续整理", body: "生活、升学、就职、JLPT、学校库、公司库、资料与服务优先完善。" },
      { meta: "2026.06", title: "更多国家和城市筹备中", body: "加拿大、澳洲、英国、法国、德国、韩国、美国等地区会按需求逐步展开。" },
      { meta: "2026.06", title: "商家合作通道开放", body: "本地商家、服务提供者、招聘方、房源方、活动组织者和教育机构可以申请合作。" },
    ] }] },
    en: { eyebrow: "Updates", title: "Where Machi stands today", intro: "An honest record of product status, Guide updates, new-city preparation, and partnership openings.", blocks: [{ title: "Current status", variant: "list", items: [
      { meta: "2026.06", title: "Web Beta is available", body: "Users can register and use city home, discovery, search, notifications, messages, posting, profiles and local connection." },
      { meta: "2026.06", title: "Japan Guide keeps expanding", body: "Life, school applications, job hunting, JLPT, school directories, company directories, materials and services are being refined first." },
      { meta: "2026.06", title: "More countries and cities in preparation", body: "Canada, Australia, the United Kingdom, France, Germany, South Korea, the United States and more regions will roll out by demand." },
      { meta: "2026.06", title: "Business partnership channel is open", body: "Local businesses, service providers, recruiters, housing providers, event organizers and education partners can apply." },
    ] }] },
    ja: { eyebrow: "更新情報", title: "現在の Machi について", intro: "プロダクトの公開状況、Guide の更新、新しい街の準備、提携受付について、事実に沿ってお知らせします。", blocks: [{ title: "現在の状況", variant: "list", items: [
      { meta: "2026.06", title: "Web Beta を利用できます", body: "登録後、街のホーム、発見、検索、通知、メッセージ、投稿、プロフィール、地域コミュニティを利用できます。" },
      { meta: "2026.06", title: "日本 Guide を継続整理中", body: "生活、進学、就職、JLPT、学校データベース、会社データベース、資料、サービスを優先しています。" },
      { meta: "2026.06", title: "より多くの国と都市を準備中", body: "カナダ、オーストラリア、英国、フランス、ドイツ、韓国、米国などを需要に合わせて展開します。" },
      { meta: "2026.06", title: "ビジネス提携の受付を開始", body: "店舗、サービス提供者、採用担当、住まい関連、イベント主催者、教育機関が申請できます。" },
    ] }] },
  },
  faq: {
	    zh: { eyebrow: "FAQ", title: "关于 Machi，你可能想知道的事", intro: "这里说明产品定位、开放范围、Guide、安全机制、商家合作、付费服务与账号管理。", blocks: [{ title: "产品与定位", variant: "legal", items: [
	      { title: "Machi 是什么？", body: "Machi 是按国家、城市和语言组织内容的本地生活与城市社区平台，包含 Guide、问答、租房、二手、工作、本地服务、小组与活动等功能。" },
	      { title: "Machi 是城市社区吗？", body: "是。Machi 是一个按城市和语言组织的本地生活与社区平台，内容包括本地信息、城市指南、问答、社区讨论、语言交换小组、活动、租房、工作、本地服务和商家信息。\n\nMachi 的社交功能服务于公开城市话题和社区参与，不承接私人介绍类服务。" },
	      { title: "Machi 只做日本吗？", body: "不是。Machi 从日本 Guide 和首批城市开始，之后会扩展到更多国家和城市。" },
	      { title: "Machi 是留学中介吗？", body: "不是。Guide 会整理日本升学、就职和生活资料，但 Machi 的长期目标是全球城市本地生活平台。" },
    ] }, { title: "使用与安全", variant: "legal", items: [
      { title: "可以发布租房、招聘或二手吗？", body: "可以，但内容必须真实、清楚、遵守当地法律，并接受审核、风险提示和举报机制。" },
      { title: "付费服务是否保证结果？", body: "不保证。留学、就职、签证、租房、开户、录取和就业等结果取决于用户材料、第三方和当地规则。" },
      { title: "可以删除账号吗？", body: "可以。用户可以管理个人资料并申请删除账号；公开内容可能已经被其他用户看到或互动。" },
      { title: "如何联系 Machi？", body: "合作、媒体、商家申请、城市建议或隐私请求可发送至 hi@machicity.com。" },
    ] }] },
	    en: { eyebrow: "FAQ", title: "A few things worth knowing about Machi", intro: "Clear answers on the product, availability, Guide, safety, business participation, paid services, and account management.", blocks: [{ title: "Product and positioning", variant: "legal", items: [
	      { title: "What is Machi?", body: "Machi is a local-life and city-community platform organized by country, city, and language, with Guide, Q&A, housing, secondhand exchange, jobs, local services, groups, and events." },
	      { title: "Is Machi a city community app?", body: "Yes. Machi is a city-based local life and community platform for local information, city guides, Q&A, community discussions, language exchange groups, events, housing, jobs, services, and business listings.\n\nSocial features are designed around public city topics and community participation, not private-introduction services." },
	      { title: "Is Machi only for Japan?", body: "No. Machi starts with Japan Guide and selected city communities, then expands to more countries and cities." },
	      { title: "Is Machi a study abroad agency?", body: "No. Guide organizes Japan study, career and life resources, but Machi's long-term goal is a global city local-life platform." },
    ] }, { title: "Use and safety", variant: "legal", items: [
      { title: "Can I post housing, jobs or secondhand items?", body: "Yes, but content must be truthful, clear, compliant with local law and subject to review, risk prompts and reporting." },
      { title: "Are paid services guaranteed?", body: "No. Study, career, visa, housing, banking, admission and employment outcomes depend on user materials, third parties and local rules." },
      { title: "Can I delete my account?", body: "Yes. Users can manage profile information and request deletion; public content may already have been seen or interacted with." },
      { title: "How can I contact Machi?", body: "For partnerships, press, business applications, city ideas or privacy requests, email hi@machicity.com." },
    ] }] },
	    ja: { eyebrow: "FAQ", title: "Machi について、よくいただく質問", intro: "プロダクトの位置づけ、利用できる地域、Guide、安全対策、事業者の参加、有料サービス、アカウント管理について説明します。", blocks: [{ title: "プロダクトと位置づけ", variant: "legal", items: [
	      { title: "Machi とは？", body: "Machi は、国・街・言語ごとに暮らしの情報と地域のつながりを整理するプラットフォームです。Guide、Q&A、住まい、譲り合い、仕事、地域サービス、グループ、イベントなどを扱います。" },
	      { title: "Machi はデーティングアプリですか？", body: "いいえ。Machi は、街の情報、Guide、Q&A、地域グループ、言語交換、イベント、住まい、仕事、サービス、事業者情報を扱うローカルライフ・コミュニティです。\n\n恋愛相手の紹介、結婚紹介、有料同伴、アダルトサービス、一対一のデート仲介は提供しません。交流機能は、公開された街の話題と地域コミュニティへの参加を目的としています。" },
	      { title: "Machi は日本だけですか？", body: "いいえ。まず日本 Guide と東京を中心に体験を整え、実際の需要を確かめながら、ほかの国や街へ広げていきます。" },
	      { title: "Machi は留学エージェントですか？", body: "いいえ。Guide では日本の進学、就職、暮らしに関する情報を整理しますが、Machi 全体は街での暮らしを支えるプラットフォームです。" },
    ] }, { title: "利用と安全", variant: "legal", items: [
      { title: "住まい、求人、中古品を投稿できますか？", body: "できます。正確で分かりやすく、現地法に従う必要があり、審査、リスク表示、通報の対象になります。" },
      { title: "有料サービスは結果を保証しますか？", body: "保証しません。進学、就職、ビザ、住まい、口座開設、合格、採用などは本人資料、第三者、現地ルールに左右されます。" },
      { title: "アカウントを削除できますか？", body: "できます。プロフィール管理や削除申請ができます。公開投稿はすでに他のユーザーに見られている場合があります。" },
      { title: "Machi に連絡するには？", body: "提携、取材、事業者のお申し込み、街の展開に関するご提案、プライバシーのお問い合わせは hi@machicity.com までお送りください。" },
    ] }] },
  },
  ads: {
    zh: { eyebrow: "广告投放", title: "只在真正相关的城市与场景里出现。", intro: "按城市、频道、语言和用户正在寻找的内容投放，并明确标注推广属性，让商业信息有用，也有边界。", blocks: [{ title: "投放场景", variant: "grid", items: [{ title: "城市首页", body: "在用户进入对应城市时展示相关品牌或服务。" }, { title: "频道推荐", body: "在租房、招聘、优惠、活动等匹配的频道中展示。" }, { title: "热门话题周边", body: "围绕城市正在关注的内容获得自然、清楚标注的曝光。" }] }] },
    en: { eyebrow: "Advertising", title: "Appear only where the city and context are genuinely relevant.", intro: "Target by city, channel, language, and current user intent, with promotional content labeled clearly so it stays useful and bounded.", blocks: [{ title: "Placements", variant: "grid", items: [{ title: "City home", body: "Show a relevant brand or service when someone enters the matching city." }, { title: "Channel recommendations", body: "Appear within relevant housing, hiring, offers, or event channels." }, { title: "Alongside local interest", body: "Reach people near topics the city already cares about, with clear promotional labeling." }] }] },
    ja: { eyebrow: "広告掲載", title: "関係のある街と場面にだけ、きちんと届ける。", intro: "街、チャンネル、言語、ユーザーが探している内容に合わせて配信し、広告であることも明確に表示します。", blocks: [{ title: "掲載場所", variant: "grid", items: [{ title: "街のホーム", body: "該当する街を開いたユーザーに、関連するブランドやサービスを表示します。" }, { title: "チャンネル内のおすすめ", body: "住まい、採用、特典、イベントなど、内容に合うチャンネルへ掲載します。" }, { title: "地域で注目される話題の近く", body: "街で関心を集めている内容の周辺に、広告であることを示したうえで掲載します。" }] }] },
  },
  contact: {
    zh: { eyebrow: "联系", title: "有想一起完成的事，欢迎写信给我们。", intro: "无论是城市合作、媒体采访、商家申请，还是产品里的一个具体问题，都可以从这里开始。", blocks: [{ title: "联系方式", variant: "contact", body: "请发送至 hi@machicity.com，并尽量说明所在城市、来意与方便联系的方式。" }, { title: "我们会优先回复", variant: "list", items: [{ title: "城市合作", body: "本地组织、学校、社群和服务机构。" }, { title: "商家合作", body: "门店、招聘方、房产中介和服务商。" }, { title: "产品反馈", body: "官网、Web 端和 App 中可以复现的体验问题。" }] }] },
    en: { eyebrow: "Contact", title: "If there is something worth building together, write to us.", intro: "City partnerships, press, business applications, and specific product feedback can all begin here.", blocks: [{ title: "Email", variant: "contact", body: "Write to hi@machicity.com and, where possible, include your city, reason for contacting us, and the best way to reply." }, { title: "Priority topics", variant: "list", items: [{ title: "City partnerships", body: "Local organizations, schools, communities, and service providers." }, { title: "Business partnerships", body: "Stores, recruiters, housing agents, and service teams." }, { title: "Product feedback", body: "Reproducible issues across the website, web app, or mobile experience." }] }] },
    ja: { eyebrow: "お問い合わせ", title: "一緒に取り組めそうなことがあれば、お聞かせください。", intro: "地域との連携、取材、事業者のお申し込み、具体的なプロダクトのご意見を受け付けています。", blocks: [{ title: "メール", variant: "contact", body: "hi@machicity.com まで、街、連絡の目的、返信先をできるだけ具体的にご記入ください。" }, { title: "優先して確認する内容", variant: "list", items: [{ title: "地域との連携", body: "地域団体、学校、コミュニティ、サービス事業者。" }, { title: "事業者との提携", body: "店舗、採用担当、不動産関連事業者、地域サービス。" }, { title: "プロダクトへのご意見", body: "公式サイト、Web 版、アプリで再現できる具体的な問題。" }] }] },
  },
  partners: {
    zh: { eyebrow: "合作伙伴", title: "把真正属于这座城市的资源，带到需要它的人面前。", intro: "Machi 面向本地社群、学校、服务机构、媒体与城市组织开放合作，并优先考虑内容是否真实、持续且对当地用户有用。", blocks: [{ title: "合作方向", variant: "grid", items: [{ title: "内容合作", body: "共同整理本地攻略、新闻、活动和服务目录。" }, { title: "城市共建", body: "一起完善城市频道、精选内容与社区活动。" }, { title: "数据与服务", body: "在安全、合规和用户知情的前提下，探索数据接口与服务连接。" }] }] },
    en: { eyebrow: "Partners", title: "Bring genuinely local resources closer to the people who need them.", intro: "Machi works with local communities, schools, service organizations, media, and city groups, with priority given to information that is real, sustainable, and useful to residents.", blocks: [{ title: "Ways to work together", variant: "grid", items: [{ title: "Content", body: "Develop local guides, news, events, and service directories together." }, { title: "City building", body: "Improve city channels, curated content, and community activities." }, { title: "Data and services", body: "Explore compliant data connections and service pathways with safety and user awareness built in." }] }] },
    ja: { eyebrow: "パートナー", title: "その街に根ざした情報やサービスを、必要な人の近くへ。", intro: "Machi は、地域コミュニティ、学校、サービス事業者、メディア、地域団体との連携を受け付けています。実在し、継続でき、地域の利用者に役立つことを大切にします。", blocks: [{ title: "連携のかたち", variant: "grid", items: [{ title: "コンテンツ", body: "地域ガイド、ニュース、イベント、サービス一覧を一緒に整えます。" }, { title: "街のコミュニティづくり", body: "街のチャンネル、注目コンテンツ、地域の活動をともに育てます。" }, { title: "データとサービス", body: "安全性、法令、利用者への説明を前提に、データ連携やサービス導線を検討します。" }] }] },
  },
  "jobs-promotion": {
    zh: { eyebrow: "招聘推广", title: "让一份真实的本地工作，遇见真正适合的人。", intro: "面向商家、企业与机构，按城市、语言、在留资格要求和岗位类型清楚展示招聘信息。", blocks: [{ title: "适用岗位", variant: "grid", items: [{ title: "兼职", body: "餐饮、零售、活动和本地服务行业。" }, { title: "全职", body: "本地企业、跨境团队与门店运营岗位。" }, { title: "实习", body: "面向学生和职业起步阶段的人群。" }] }] },
    en: { eyebrow: "Hiring", title: "Help a real local role find the person it genuinely fits.", intro: "For businesses and organizations, with clear job information organized by city, language, residence-status requirements, and role type.", blocks: [{ title: "Role types", variant: "grid", items: [{ title: "Part-time", body: "Food, retail, events, and local services." }, { title: "Full-time", body: "Local companies, cross-border teams, and store operations." }, { title: "Internships", body: "For students and people at the beginning of their careers." }] }] },
    ja: { eyebrow: "採用プロモーション", title: "地域の仕事を、本当に合う人へ。", intro: "店舗、企業、団体向けに、街、言語、在留資格の条件、雇用形態を明確にした求人情報を届けます。", blocks: [{ title: "対象となる求人", variant: "grid", items: [{ title: "アルバイト", body: "飲食、小売、イベント、地域サービス。" }, { title: "正社員", body: "地域企業、海外と関わるチーム、店舗運営。" }, { title: "インターン", body: "学生や、これからキャリアを始める人向け。" }] }] },
  },
  "housing-promotion": {
    zh: { eyebrow: "租房推广", title: "让房源信息足够透明，再抵达正在找房的人。", intro: "面向房产中介、合规转租用户与公寓运营方，按城市、区域、价格、入住时间与语言展示房源。", blocks: [{ title: "推广内容", variant: "grid", items: [{ title: "整租与合租", body: "清楚展示区域、租金、费用、入住时间和同住条件。" }, { title: "合规转租", body: "说明授权情况、可租期限、合同条件与交接方式。" }, { title: "租房信息与提醒", body: "用完整信息、风险提示与可核实资料建立信任。" }] }] },
    en: { eyebrow: "Housing", title: "Make a listing transparent before putting it in front of active renters.", intro: "For agents, compliant subletters, and property operators, with listings organized by city, area, price, move-in date, and language.", blocks: [{ title: "Promotion content", variant: "grid", items: [{ title: "Rentals and shared homes", body: "Show the area, rent, fees, move-in date, and shared-living conditions clearly." }, { title: "Compliant sublets", body: "State permission, available term, contract conditions, and handover details." }, { title: "Housing information and warnings", body: "Build trust with complete details, risk prompts, and verifiable information." }] }] },
    ja: { eyebrow: "住まいの掲載", title: "探している人へ届ける前に、物件情報をわかりやすく。", intro: "不動産事業者、適法な転貸を行う人、物件運営者向けに、街、エリア、家賃、入居時期、言語に合わせて掲載します。", blocks: [{ title: "掲載できる内容", variant: "grid", items: [{ title: "賃貸・シェア", body: "エリア、家賃、諸費用、入居時期、共同生活の条件を明確に表示します。" }, { title: "適法な転貸", body: "貸主の許可、利用できる期間、契約条件、引き渡し方法を記載します。" }, { title: "住まいの情報と注意点", body: "十分な情報、リスク表示、確認できる資料によって信頼につなげます。" }] }] },
  },
  "safety-center": {
	    zh: { eyebrow: "安全中心", title: "在真正需要判断的时刻，给出清楚的提醒。", intro: "从公开讨论、线下活动和语言交换，到租房、二手交易、招聘与本地服务，安全提示会出现在对应的使用场景里。", blocks: [{ title: "参加线下活动前", variant: "list", items: [{ title: "选择公共地点", body: "第一次见面尽量选择人流稳定、容易离开的公共场所，不要贸然前往私人空间。" }, { title: "告诉信任的人", body: "把活动时间、地点和同行者信息告诉家人或朋友，并约定必要的联系时间。" }, { title: "保留沟通记录", body: "重要约定尽量留在平台内；遇到威胁、骚扰或可疑行为，请及时离开并举报。" }] }, { title: "不被允许的内容与服务", variant: "legal", items: [{ title: "高风险与违法服务", body: "Machi 禁止成人或性服务、违法线下服务、高风险私人交易，以及暗示付费私人陪伴的内容或交易。" }, { title: "社区功能的边界", body: "社区功能服务于公开城市话题、本地小组、问答、活动、语言交换、租房、工作、地域服务与日常生活讨论，不提供私人介绍或陪伴交易。" }] }, { title: "交易、租房与招聘", variant: "grid", items: [{ title: "租房", body: "不要向未经验证的房东提前转账；核对地址、合同和身份，并警惕明显低价房源与平台外付款链接。" }, { title: "二手交易", body: "优先在公共场所交易；高价值物品当面验货，不提前支付大额定金。" }, { title: "招聘", body: "不要支付所谓入职押金或培训保证金；核实公司主体、工作地点、联系方式和实际岗位内容。" }] }] },
	    en: { eyebrow: "Safety Center", title: "Clear guidance at the moments that call for judgment.", intro: "From public discussions, local events, and language exchange to housing, secondhand transactions, hiring, and local services, Machi places practical safety guidance in the relevant flow.", blocks: [{ title: "Before meeting in person", variant: "list", items: [{ title: "Choose a public place", body: "For a first meeting, choose a well-trafficked place that is easy to leave. Avoid private spaces." }, { title: "Tell someone you trust", body: "Share the time, place, and who you are meeting with a friend or family member." }, { title: "Keep a record", body: "Keep important arrangements on the platform. Leave and report promptly if you encounter threats, harassment, or suspicious behavior." }] }, { title: "Content and services we do not allow", variant: "legal", items: [{ title: "Illegal and high-risk services", body: "Machi prohibits adult or sexual services, illegal offline services, high-risk private transactions, and content or transactions suggesting paid private companionship." }, { title: "The scope of community features", body: "Community features support public city topics, local groups, Q&A, events, language exchange, housing, work, local services, and everyday city life. They are not a channel for private introductions or paid companionship." }] }, { title: "Housing, transactions, and hiring", variant: "grid", items: [{ title: "Housing", body: "Do not prepay an unverified landlord. Check the address, contract, and identity, and beware unusually cheap listings or off-platform payment links." }, { title: "Secondhand", body: "Prefer public places, inspect high-value items in person, and avoid large advance deposits." }, { title: "Hiring", body: "Never pay a job deposit or training guarantee. Verify the company, workplace, contact details, and actual role." }] }] },
	    ja: { eyebrow: "安全センター", title: "判断が必要な場面に、わかりやすい注意を。", intro: "公開のやり取り、地域の活動、言語交換から、住まい、譲り合い、求人、地域サービスまで。それぞれの場面に合った安全情報を届けます。", blocks: [{ title: "実際に会う前に", variant: "list", items: [{ title: "人目のある場所を選ぶ", body: "初めて会うときは、人通りがあり、必要ならすぐ離れられる場所を選んでください。個人宅などは避けましょう。" }, { title: "信頼できる人に伝える", body: "会う時間と場所、相手についてわかっていることを、家族や友人に共有してください。" }, { title: "やり取りを残す", body: "大切な約束はできるだけプラットフォーム上に残し、脅しや嫌がらせ、不審な行動があれば、その場を離れて通報してください。" }] }, { title: "認めていない内容とサービス", variant: "legal", items: [{ title: "違法・高リスクのサービス", body: "アダルト・性的サービス、違法な対面サービス、高リスクの個人間取引、有料の私的な同伴を示唆する内容や取引は禁止しています。" }, { title: "コミュニティ機能の範囲", body: "街の話題、地域グループ、Q&A、イベント、言語交換、住まい、仕事、地域サービス、日常生活に関する公開のやり取りを対象としています。個人的な紹介や有料同伴のための機能ではありません。" }] }, { title: "住まい・取引・求人", variant: "grid", items: [{ title: "住まい", body: "確認できていない貸主へ前払いせず、住所、契約内容、相手の身元を確かめてください。相場より極端に安い物件や外部の決済リンクにも注意が必要です。" }, { title: "譲り合い・中古取引", body: "人目のある場所を選び、高額品は対面で状態を確認してください。大きな前金は避けましょう。" }, { title: "求人", body: "採用のための保証金や研修費は支払わず、会社情報、勤務地、連絡先、実際の仕事内容を確認してください。" }] }] },
  },
  privacy: {
    zh: { eyebrow: "隐私政策", title: "我们尊重你的城市生活和个人边界。", intro: "本政策说明 Machi 如何处理账号、个人资料、公开内容、城市选择、设备、日志、Cookie、支付、会员订单、服务预约、私信和通知相关信息。", blocks: [{ title: "我们是谁与核心原则", variant: "legal", items: [
      { title: "服务主体", body: "Machi 提供按国家、城市和语言组织内容的本地生活与同城连接服务。联系方式：hi@machicity.com。" },
      { title: "不出售个人数据", body: "Machi 不向广告商出售用户个人数据，也不会把邮箱用于无关广告列表。" },
      { title: "最小必要与用户控制", body: "我们只收集提供服务、安全审核、支付、会员和预约所需的信息。你可以管理资料、语言、通知和账号删除请求。" },
    ] }, { title: "我们收集的信息", variant: "legal", items: [
      { title: "账号与个人资料", body: "包括邮箱、用户名、显示名、头像、简介、语言偏好、城市/地区选择和账号安全状态。" },
      { title: "用户发布内容", body: "你发布的帖子、评论、资料、商家内容、房源、招聘、二手和服务信息可能被其他用户看到。" },
      { title: "位置与城市选择", body: "Machi 主要使用你选择的国家、城市和当前浏览地区组织内容；如使用精确定位功能，会在取得权限后处理。" },
      { title: "设备、日志、Cookie", body: "我们会处理设备信息、访问 IP、大致地区、请求时间、路径、响应状态、Cookie 和类似技术，用于登录、偏好、统计、安全和防滥用。" },
      { title: "支付、会员与订单", body: "会员、数字资料、服务预约和订单信息会被保存用于履约、客服、发票、退款和风控。完整银行卡信息由 Stripe、Apple 或 Google 等支付服务商处理，Machi 不保存完整银行卡信息。" },
      { title: "服务预约、私信与通知", body: "预约表单、沟通记录、通知偏好、举报和私信内容可能在客服、安全审核、纠纷处理或违规调查中被处理。" },
    ] }, { title: "使用、共享与保存", variant: "legal", items: [
      { title: "如何使用信息", body: "用于账号登录、内容展示、城市推荐、多语言体验、会员权益、预约履约、支付处理、安全审核、客服、通知和服务改进。" },
      { title: "如何共享信息", body: "我们可能与云服务、邮件、数据分析、支付、App Store / Google Play、客服和安全服务提供商共享必要信息，也可能因法律要求或保护用户安全而披露。" },
      { title: "第三方服务", body: "Stripe、Apple、Google、邮件服务和登录服务会按各自政策处理相关信息。支付卡信息由支付服务商直接处理。" },
      { title: "数据保存时间", body: "账号和订单信息在账号存续及法律/财务需要期限内保存；访问日志通常约 90 天清理；安全、举报、交易和争议记录可能保存更久。" },
      { title: "用户权利与删除账号", body: "你可以请求访问、更正、删除账号或限制处理。账号删除后，公开内容、交易记录、法律要求保留的订单与安全记录可能按规则保留或匿名化。" },
      { title: "未成年人、安全与跨境处理", body: "Machi 不面向未成年人提供不适宜内容。我们采取权限控制、审计和安全措施；数据可能在用户、服务商或团队所在地区之间跨境处理。" },
      { title: "政策更新", body: "政策更新会在官网发布。重大变化会通过站内通知、邮件或其他合理方式提醒。" },
    ] }] },
    en: { eyebrow: "Privacy Policy", title: "We respect your city life and personal boundaries.", intro: "This policy explains how Machi handles account, profile, public content, city selection, device, log, cookie, payment, membership, order, service booking, messaging and notification data.", blocks: [{ title: "Who we are and principles", variant: "legal", items: [
      { title: "Service provider", body: "Machi provides a local life and city connection service organized by country, city and language. Contact: hi@machicity.com." },
      { title: "No sale of personal data", body: "Machi does not sell users' personal data to advertisers and does not add emails to unrelated ad lists." },
      { title: "Data minimization and control", body: "We collect what is needed to provide the service, safety review, payments, memberships and service bookings. You can manage profile, languages, notifications and deletion requests." },
    ] }, { title: "Information we collect", variant: "legal", items: [
      { title: "Account and profile", body: "Email, username, display name, avatar, bio, language preferences, city/region selection and account security state." },
      { title: "User content", body: "Posts, comments, profiles, business content, housing, hiring, secondhand and service information you publish may be visible to other users." },
      { title: "Location and city choice", body: "Machi mainly uses your selected country, city and browsing region to organize content. Precise location is processed only after permission." },
      { title: "Device, logs and cookies", body: "Device details, IP address, approximate region, request time, path, response status, cookies and similar technologies support login, preferences, analytics, security and abuse prevention." },
      { title: "Payments, memberships and orders", body: "Membership, digital resource, service booking and order information is stored for fulfillment, support, invoices, refunds and risk control. Full card details are handled by Stripe, Apple or Google; Machi does not store full card numbers." },
      { title: "Bookings, messages and notifications", body: "Booking forms, communication records, notification preferences, reports and message content may be processed for support, safety review, dispute handling or abuse investigation." },
    ] }, { title: "Use, sharing and retention", variant: "legal", items: [
      { title: "How we use information", body: "For login, content display, city recommendation, multilingual experience, membership benefits, service fulfillment, payments, safety review, support, notifications and service improvement." },
      { title: "How we share information", body: "We may share necessary information with cloud, email, analytics, payment, App Store / Google Play, support and safety providers, or disclose it when required by law or user safety." },
      { title: "Third-party services", body: "Stripe, Apple, Google, email and sign-in services process relevant information under their own policies. Payment card data is handled directly by payment providers." },
      { title: "Retention", body: "Account and order data is kept while the account exists and as needed for legal or financial duties. Access logs are usually pruned after about 90 days. Safety, report, transaction and dispute records may be retained longer." },
      { title: "User rights and deletion", body: "You may request access, correction, account deletion or processing limits. After deletion, public content, transaction records, legally required orders and safety records may be retained or anonymized." },
      { title: "Minors, security and cross-border processing", body: "Machi does not target minors with unsuitable content. We use permission controls, audit and security measures. Data may be processed across regions where users, providers or team members operate." },
      { title: "Policy updates", body: "Updates are posted on the website. Major changes may be announced through in-app notice, email or other reasonable methods." },
    ] }] },
    ja: { eyebrow: "プライバシーポリシー", title: "あなたの暮らしと境界を尊重します。", intro: "本ポリシーは、Machi がアカウント、プロフィール、公開コンテンツ、都市選択、端末、ログ、Cookie、支払い、会員、注文、サービス予約、メッセージ、通知データを扱う方法を説明します。", blocks: [{ title: "運営者と基本方針", variant: "legal", items: [
      { title: "サービス提供者", body: "Machi は、国・都市・言語ごとに地域の暮らしとつながりを整理するサービスです。連絡先：hi@machicity.com。" },
      { title: "個人データを販売しません", body: "Machi はユーザーの個人データを広告主に販売せず、メールを無関係な広告リストへ登録しません。" },
      { title: "必要最小限とユーザー管理", body: "サービス提供、安全審査、支払い、会員、サービス予約に必要な情報を扱います。プロフィール、言語、通知、削除申請を管理できます。" },
    ] }, { title: "収集する情報", variant: "legal", items: [
      { title: "アカウントとプロフィール", body: "メール、ユーザー名、表示名、アイコン、自己紹介、言語設定、都市・地域選択、アカウント安全状態。" },
      { title: "ユーザー投稿", body: "投稿、コメント、プロフィール、事業者情報、住まい、求人、中古、サービス情報は他のユーザーに表示される場合があります。" },
      { title: "位置情報と都市選択", body: "Machi は主に選択された国、都市、閲覧地域でコンテンツを整理します。正確な位置情報は許可を得た場合のみ処理します。" },
      { title: "端末、ログ、Cookie", body: "端末情報、IP アドレス、おおまかな地域、リクエスト時刻、パス、応答状態、Cookie 等をログイン、設定、分析、安全、不正防止に使います。" },
      { title: "支払い、会員、注文", body: "会員、デジタル資料、サービス予約、注文情報は履行、サポート、請求、返金、リスク管理のため保存します。完全なカード情報は Stripe、Apple、Google 等が処理し、Machi は保存しません。" },
      { title: "予約、メッセージ、通知", body: "予約フォーム、連絡記録、通知設定、通報、メッセージ内容はサポート、安全審査、紛争対応、違反調査で処理される場合があります。" },
    ] }, { title: "利用、共有、保存", variant: "legal", items: [
      { title: "利用目的", body: "ログイン、表示、都市推薦、多言語体験、会員特典、サービス履行、支払い、安全審査、サポート、通知、改善のために使います。" },
      { title: "共有", body: "クラウド、メール、分析、支払い、App Store / Google Play、サポート、安全関連の提供者へ必要情報を共有する場合があります。法令や安全確保のため開示する場合もあります。" },
      { title: "第三者サービス", body: "Stripe、Apple、Google、メール、ログインサービスは各自のポリシーに従って情報を処理します。カード情報は支払い事業者が直接処理します。" },
      { title: "保存期間", body: "アカウントと注文情報はアカウント存続中および法務・会計上必要な期間保存します。アクセスログは通常約 90 日で削除し、安全、通報、取引、紛争記録はより長く保存する場合があります。" },
      { title: "ユーザーの権利と削除", body: "アクセス、訂正、アカウント削除、処理制限を請求できます。削除後も公開投稿、取引記録、法令上必要な注文、安全記録は保存または匿名化される場合があります。" },
      { title: "未成年、安全、越境処理", body: "Machi は未成年に不適切な内容を提供しません。権限管理、監査、安全対策を行い、ユーザー、提供者、チームの所在地域をまたいでデータ処理される場合があります。" },
      { title: "改定", body: "改定は公式サイトで公開します。重要な変更はアプリ内通知、メール等でお知らせします。" },
    ] }] },
  },
  terms: {
    zh: { eyebrow: "服务条款", title: "共同维护可信的城市生活社区。", intro: "使用 Machi 即表示你同意遵守平台规则、社区规范、社交安全政策、付费条款和当地法律。Machi 是平台和信息服务，不保证用户发布内容完全准确。", blocks: [{ title: "服务与账号", variant: "legal", items: [
      { title: "服务说明", body: "Machi 提供本地生活信息、城市社区、本地小组、Guide、会员、数字资料、服务预约、商家合作和相关信息工具。" },
      { title: "账号注册", body: "你需要提供真实、可联系的信息并保护账号安全。不得冒充他人、转让账号或绕过安全机制。" },
      { title: "用户责任", body: "你对发布、私信、交易、见面、预约和商家内容承担责任，并须遵守当地法律、平台规则和第三方服务条款。" },
    ] }, { title: "内容、社区与安全", variant: "legal", items: [
      { title: "内容发布规则", body: "内容需真实、清楚、不误导，不得侵犯他人权利或隐私。平台可进行审核、排序、标记、下架或限制展示。" },
      { title: "禁止内容", body: "禁止骚扰、仇恨和歧视、诈骗、冒充、虚假招聘、虚假房源、危险线下邀约、成人违法暴力内容、侵犯隐私和垃圾广告。" },
      { title: "举报和审核", body: "Machi 可处理举报、拉黑、内容审核、商家认证复核、风险提示、账号限制、暂停或删除。" },
    ] }, { title: "付费、商家和高风险信息", variant: "legal", items: [
      { title: "会员、付费资料和服务预约", body: "会员权益、资料购买、预约服务、退款和取消规则以对应条款、订单页面和支付平台规则为准。Machi 支付只用于平台服务费、数字资料、认证推广、广告、会员和明确说明的自营或预约服务。" },
      { title: "商家和本地服务", body: "商家、招聘、房源、服务和活动需遵守当地法律。Machi 可认证或标记，但不保证服务质量、价格、可用性或结果。" },
      { title: "高风险信息免责声明", body: "Machi 不保证租房、交易、招聘、录取、签证、开户、就业或商家服务结果。用户应自行核实并判断风险。" },
      { title: "线下见面免责声明", body: "用户线下见面、交易、活动和语言交换需自行判断安全，优先公共场所，保留记录并及时举报风险。" },
    ] }, { title: "权利、变更和责任", variant: "legal", items: [
      { title: "知识产权", body: "用户保留其内容权利，但授予 Machi 为提供、展示、推荐、翻译、推广和安全审核服务所需的使用许可。" },
      { title: "账号暂停和删除", body: "违规内容可被下架，账号可被限制、暂停或删除。严重违规、违法或安全风险可能被永久处理。" },
      { title: "免责声明与责任限制", body: "服务按现状提供。法律允许范围内，Machi 对间接损失、第三方行为、用户内容和无法保证的结果不承担超出法律要求的责任。" },
      { title: "服务变更、适用法律和联系", body: "Machi 可调整、暂停或终止部分服务。争议适用相关可执行法律和管辖规则；联系 hi@machicity.com。" },
    ] }] },
    en: { eyebrow: "Terms of Service", title: "Help keep this city community trustworthy.", intro: "By using Machi, you agree to platform rules, community guidelines, social safety policies, paid terms and local laws. Machi is a platform and information service and does not guarantee user content is fully accurate.", blocks: [{ title: "Service and account", variant: "legal", items: [
      { title: "Service description", body: "Machi provides local-life information, city communities, local groups, Guide, memberships, digital resources, service bookings, business partnerships and related information tools." },
      { title: "Account registration", body: "You must provide truthful reachable information and keep your account secure. Do not impersonate others, transfer accounts or bypass safety mechanisms." },
      { title: "User responsibility", body: "You are responsible for posts, messages, transactions, meetups, bookings and business content, and must follow local laws, platform rules and third-party terms." },
    ] }, { title: "Content, community and safety", variant: "legal", items: [
      { title: "Posting rules", body: "Content must be truthful, clear, non-misleading and respectful of rights and privacy. Machi may review, rank, label, remove or limit visibility." },
      { title: "Prohibited content", body: "Harassment, hate and discrimination, scams, impersonation, fake hiring, fake housing, dangerous meetups, adult/illegal/violent content, privacy violations and spam are prohibited." },
      { title: "Reports and review", body: "Machi may process reports, blocking, content review, business re-verification, risk prompts, account limits, suspension or deletion." },
    ] }, { title: "Paid features, businesses and high-risk information", variant: "legal", items: [
      { title: "Memberships, paid resources and service bookings", body: "Membership benefits, resource purchases, service bookings, refunds and cancellation rules follow the relevant terms, order pages and payment platform rules. Payments on Machi are only for platform services, digital resources, verified promotions, advertising, memberships and clearly described service bookings." },
      { title: "Businesses and local services", body: "Businesses, hiring, housing, services and events must comply with local law. Machi may verify or label them, but does not guarantee quality, price, availability or outcomes." },
      { title: "High-risk information disclaimer", body: "Machi does not guarantee housing, transactions, hiring, admission, visas, banking, employment or business service results. Users should verify independently." },
      { title: "Offline meetup disclaimer", body: "Users must judge safety for offline meetups, transactions, events and language exchange, prefer public places, keep records and report risks quickly." },
    ] }, { title: "Rights, changes and liability", variant: "legal", items: [
      { title: "Intellectual property", body: "Users keep their content rights but grant Machi the license needed to provide, display, recommend, translate, promote and safety-review the service." },
      { title: "Suspension and deletion", body: "Violating content may be removed and accounts may be limited, suspended or deleted. Serious abuse, illegality or safety risks may lead to permanent action." },
      { title: "Disclaimer and limitation of liability", body: "The service is provided as is. To the extent allowed by law, Machi is not liable beyond legal requirements for indirect loss, third-party actions, user content or outcomes it cannot guarantee." },
      { title: "Service changes, law and contact", body: "Machi may change, suspend or end parts of the service. Disputes follow applicable enforceable law and venue rules. Contact hi@machicity.com." },
    ] }] },
    ja: { eyebrow: "利用規約", title: "信頼できる地域コミュニティを一緒に守る。", intro: "Machi を利用することで、プラットフォーム規則、コミュニティ規範、ソーシャル安全ポリシー、有料規約、現地法に従うことに同意します。Machi はプラットフォームおよび情報サービスであり、ユーザー投稿の完全な正確性を保証しません。", blocks: [{ title: "サービスとアカウント", variant: "legal", items: [
      { title: "サービス内容", body: "Machi は地域の生活情報、街のコミュニティ、地域グループ、Guide、会員向け機能、デジタル資料、サービス予約、事業者提携、関連情報ツールを提供します。" },
      { title: "アカウント登録", body: "正確で連絡可能な情報を提供し、アカウントを安全に管理してください。なりすまし、譲渡、安全機能の回避は禁止です。" },
      { title: "ユーザー責任", body: "投稿、メッセージ、取引、対面、予約、事業者コンテンツについて責任を負い、現地法、プラットフォームの規則、第三者の利用規約に従う必要があります。" },
    ] }, { title: "コンテンツ、コミュニティ、安全", variant: "legal", items: [
      { title: "投稿ルール", body: "内容は正確で明確、誤解を招かず、権利とプライバシーを尊重する必要があります。Machi は審査、表示順位、ラベル、削除、表示制限を行う場合があります。" },
      { title: "禁止内容", body: "嫌がらせ、ヘイト・差別、詐欺、なりすまし、虚偽求人、虚偽物件、危険な対面誘い、成人・違法・暴力コンテンツ、プライバシー侵害、スパムは禁止です。" },
      { title: "通報と審査", body: "Machi は通報、ブロック、コンテンツ審査、事業者再確認、リスク表示、アカウント制限、停止、削除を行う場合があります。" },
    ] }, { title: "有料機能、事業者、高リスク情報", variant: "legal", items: [
      { title: "会員、資料、サービス予約", body: "会員特典、資料購入、サービス予約、返金、キャンセルは、該当する規約、注文画面、決済プラットフォームの規則に従います。Machi の決済機能は、デーティング、マッチメイキング、エスコートサービス、有料同伴、アダルトサービス、または一対一の恋愛紹介には使用されません。" },
      { title: "事業者と地域サービス", body: "事業者、求人、住まい、サービス、イベントは現地法に従う必要があります。Machi は認証や表示を行う場合がありますが、品質、価格、利用可否、結果を保証しません。" },
      { title: "高リスク情報の免責", body: "Machi は住まい、取引、採用、合格、ビザ、口座開設、就職、事業者サービスの結果を保証しません。ユーザー自身で確認してください。" },
      { title: "オフライン対面の免責", body: "対面、取引、イベント、言語交換の安全はユーザー自身で判断し、公共の場所を優先し、記録を残し、リスクは速やかに通報してください。" },
    ] }, { title: "権利、変更、責任", variant: "legal", items: [
      { title: "知的財産", body: "ユーザーは自分のコンテンツ権利を保持しますが、Machi にサービス提供、表示、推薦、翻訳、広報、安全審査に必要な利用許諾を与えます。" },
      { title: "停止と削除", body: "違反コンテンツは削除され、アカウントは制限、停止、削除される場合があります。重大な違反、違法行為、安全リスクは永久的な措置につながる場合があります。" },
      { title: "免責と責任制限", body: "サービスは現状有姿で提供されます。法令で認められる範囲で、Machi は間接損害、第三者行為、ユーザーコンテンツ、保証できない結果について法定範囲を超える責任を負いません。" },
      { title: "サービス変更、準拠法、連絡先", body: "Machi は一部サービスを変更、停止、終了する場合があります。紛争は適用可能な法令と管轄規則に従います。連絡先：hi@machicity.com。" },
    ] }] },
  },
  "membership-terms": {
    zh: { eyebrow: "会员条款", title: "Machi 认证会员条款", intro: "本条款说明 Machi 认证会员、按月购买和包年购买、权益、会员资料、折扣、到期续购和退款规则。", blocks: [{ title: "会员与权益", variant: "legal", items: [
      { title: "会员说明", body: "Machi 认证会员是面向城市生活、Guide 资料、会员专属内容和部分优惠的付费权益，不等同于身份担保或结果承诺。" },
      { title: "月付、包年与地区价格", body: "会员可能提供月付和包年。价格、货币、税费和可用支付方式可能因地区、平台和促销变化。" },
      { title: "会员专属资料与折扣", body: "会员可查看指定资料、模板、清单或会员专属内容，并可能获得部分服务或数字资料折扣。" },
      { title: "服务类不免费", body: "人工咨询、翻译、接机、手续协助、申请辅导等服务类项目不默认包含在会员免费权益中，除非订单页明确说明。" },
      { title: "支付用途边界", body: "Machi 支付只用于平台服务费、数字资料、认证推广、广告、会员和明确说明的自营或预约服务。" },
    ] }, { title: "购买、续购与退款", variant: "legal", items: [
      { title: "非自动续费", body: "Web 会员按一次性购买处理：购买一个月即开通一个月，购买一年即开通一年，不会创建 Stripe 订阅或自动扣款。" },
      { title: "到期续购", body: "会员到期前后可以再次购买；成功支付后会在现有有效期基础上延长对应周期。已支付周期内权益通常不受影响。" },
      { title: "退款规则", body: "App Store / Google Play 退款由平台处理；Web 支付退款按订单状态、使用情况、当地法律和退款政策判断。" },
      { title: "权益变更与联系", body: "Machi 可调整会员权益、资料范围、折扣和价格，并会以合理方式说明。问题请联系 hi@machicity.com。" },
    ] }] },
    en: { eyebrow: "Membership Terms", title: "Machi Verified Membership Terms", intro: "These terms explain Machi verified memberships, monthly and annual purchases, benefits, member resources, discounts, renewal by purchase and refunds.", blocks: [{ title: "Membership and benefits", variant: "legal", items: [
      { title: "Membership description", body: "Machi verified membership is a paid benefit for city life, Guide resources, member-only content and selected discounts. It is not an identity guarantee or outcome promise." },
      { title: "Monthly, annual and regional pricing", body: "Membership may be offered monthly or annually. Prices, currencies, taxes and payment methods may vary by region, platform and promotion." },
      { title: "Member resources and discounts", body: "Members may access selected resources, templates, checklists or member-only content, and may receive discounts on some services or digital resources." },
      { title: "Services are not free by default", body: "Human consultation, translation, pickup, procedure support and application coaching are not included for free unless the order page says so." },
      { title: "Payment use boundary", body: "Payments on Machi are only for platform services, digital resources, verified promotions, advertising, memberships and clearly described service bookings." },
    ] }, { title: "Purchase, renewal and refunds", variant: "legal", items: [
      { title: "No automatic renewal on Web", body: "Web membership is processed as a one-time purchase: one month grants one month, one year grants one year. Machi does not create a Stripe subscription or automatic recurring charge for Web membership." },
      { title: "Renewal by purchase", body: "Members may purchase again before or after expiry. A successful payment extends the current valid period by the purchased duration." },
      { title: "Refunds", body: "App Store / Google Play refunds are handled by those platforms. Web refunds depend on order status, usage, local law and the Refund Policy." },
      { title: "Benefit changes and contact", body: "Machi may adjust membership benefits, resource scope, discounts and prices with reasonable notice. Contact hi@machicity.com." },
    ] }] },
    ja: { eyebrow: "会員規約", title: "Machi 認証会員規約", intro: "本規約は、Machi 認証会員、月ごと・年ごとの購入、特典、会員資料、割引、追加購入による延長、返金について説明します。", blocks: [{ title: "会員と特典", variant: "legal", items: [
      { title: "会員の説明", body: "Machi 認証会員は、街での暮らし、Guide 資料、会員限定コンテンツ、一部割引のための有料特典であり、身元や結果を保証するものではありません。" },
      { title: "月額、年額、地域別価格", body: "会員は月額または年額で提供される場合があります。価格、通貨、税、支払い方法は、地域、利用するプラットフォーム、プロモーションによって変わります。" },
      { title: "会員資料と割引", body: "会員は指定資料、テンプレート、チェックリスト、限定コンテンツを閲覧でき、一部サービスやデジタル資料の割引を受ける場合があります。" },
      { title: "サービスは原則無料ではありません", body: "相談、翻訳、送迎、手続きサポート、申請サポート等は、注文画面で明記されない限り会員無料特典ではありません。" },
      { title: "決済利用の範囲", body: "Machi の決済機能は、デーティング、マッチメイキング、エスコートサービス、有料同伴、アダルトサービス、または一対一の恋愛紹介には使用されません。" },
    ] }, { title: "購読、解約、返金", variant: "legal", items: [
      { title: "自動更新", body: "App Store、Google Play、Web 決済の購読は、それぞれのプラットフォームの規則に従って自動更新される場合があります。" },
      { title: "解約", body: "App Store / Google Play の購読は、各ストアで管理します。Web 決済は注文画面またはサポートの案内に従います。解約後も、通常は支払い済み期間の特典を利用できます。" },
      { title: "返金", body: "App Store / Google Play の返金は各ストアが処理します。Web 決済の返金は、注文状態、利用状況、現地法、返金ポリシーに従います。" },
      { title: "特典変更と連絡", body: "Machi は会員特典、資料範囲、割引、価格を合理的に変更する場合があります。連絡先：hi@machicity.com。" },
    ] }] },
  },
  "service-terms": {
    zh: { eyebrow: "服务预约条款", title: "Machi 服务预约条款", intro: "本条款适用于翻译、接机、手续协助、申请辅导、本地生活咨询等预约服务。服务不会承诺签证、录取、就业、租房或开户结果。", blocks: [{ title: "服务范围与流程", variant: "legal", items: [
      { title: "服务预约是什么", body: "用户可通过 Machi 预约本地手续、翻译、接机、资料整理、升学或就职相关咨询等服务。" },
      { title: "不包含内容", body: "除订单明确说明外，服务不包含官方费用、交通费、材料费、第三方机构费用、法律代理或保证性承诺。" },
      { title: "预约流程", body: "用户需提交真实信息、需求、语言、城市和期望时间。Machi 或服务方确认后安排服务、改期或退款。" },
    ] }, { title: "取消、风险与退款", variant: "legal", items: [
      { title: "取消和改期", body: "取消、改期、迟到和未到场规则以订单页、服务说明和退款政策为准。" },
      { title: "服务风险说明", body: "本地手续、翻译、接机、留学、就职、签证、租房、开户等可能受第三方、政策和用户材料影响。" },
      { title: "支付用途边界", body: "Machi 支付只用于平台服务费、数字资料、认证推广、广告、会员和明确说明的自营或预约服务。" },
      { title: "不承诺结果", body: "Machi 不承诺录取、签证、就业、租房、开户、审批或第三方处理结果。" },
      { title: "服务地区与联系", body: "服务提供地区、语言、时间和价格可能变化。问题请联系 hi@machicity.com。" },
    ] }] },
    en: { eyebrow: "Service Terms", title: "Machi Service Booking Terms", intro: "These terms apply to bookings such as translation, airport pickup, procedure support, application coaching and local-life consultation. Services do not guarantee visa, admission, employment, housing or banking outcomes.", blocks: [{ title: "Scope and process", variant: "legal", items: [
      { title: "What service booking means", body: "Users can book local procedures, translation, pickup, document preparation, study or career-related consultation through Machi." },
      { title: "What is not included", body: "Unless clearly stated on the order page, services exclude official fees, transport, materials, third-party fees, legal representation and guaranteed promises." },
      { title: "Booking flow", body: "Users must provide truthful information, needs, language, city and preferred time. Machi or the provider confirms, reschedules or refunds as appropriate." },
    ] }, { title: "Cancellation, risks and refunds", variant: "legal", items: [
      { title: "Cancellation and rescheduling", body: "Rules for cancellation, rescheduling, lateness and no-shows follow the order page, service description and Refund Policy." },
      { title: "Service risks", body: "Local procedures, translation, pickup, support, study, career, visa, housing and banking can be affected by third parties, policy and user materials." },
      { title: "Payment use boundary", body: "Payments on Machi are only for platform services, digital resources, verified promotions, advertising, memberships and clearly described service bookings." },
      { title: "No guaranteed outcomes", body: "Machi does not guarantee admission, visa, employment, housing, banking, approval or third-party processing outcomes." },
      { title: "Service regions and contact", body: "Service areas, languages, time and pricing may change. Contact hi@machicity.com." },
    ] }] },
    ja: { eyebrow: "サービス予約規約", title: "Machi サービス予約規約", intro: "本規約は、翻訳、空港送迎、手続きサポート、申請サポート、地域生活相談などの予約サービスに適用されます。ビザ、合格、就職、住まい、口座開設の結果を保証しません。", blocks: [{ title: "範囲と流れ", variant: "legal", items: [
      { title: "サービス予約とは", body: "Machi では、地域手続き、翻訳、送迎、資料整理、進学・就職相談などを予約できます。" },
      { title: "含まれない内容", body: "注文画面で明記されない限り、公的費用、交通費、資料費、第三者費用、法的代理、保証的な約束は含まれません。" },
      { title: "予約の流れ", body: "ユーザーは正確な情報、要望、言語、都市、希望時間を提出します。Machi または提供者が確認し、実施、変更、返金を案内します。" },
    ] }, { title: "キャンセル、リスク、返金", variant: "legal", items: [
      { title: "キャンセルと変更", body: "キャンセル、変更、遅刻、無断キャンセルの扱いは注文画面、サービス説明、返金ポリシーに従います。" },
      { title: "サービスリスク", body: "手続き、翻訳、送迎、進学、就職、ビザ、住まい、口座開設は第三者、政策、本人資料の影響を受けます。" },
      { title: "決済利用の範囲", body: "Machi の決済機能は、デーティング、マッチメイキング、エスコートサービス、有料同伴、アダルトサービス、または一対一の恋愛紹介には使用されません。" },
      { title: "結果保証なし", body: "Machi は合格、ビザ、就職、住まい、口座開設、承認、第三者処理結果を保証しません。" },
      { title: "提供地域と連絡先", body: "提供地域、言語、時間、価格は変更される場合があります。連絡先：hi@machicity.com。" },
    ] }] },
  },
  "refund-policy": {
    zh: { eyebrow: "退款政策", title: "退款和取消规则", intro: "本政策说明会员、数字资料、服务预约、App Store / Google Play 应用内购买和 Web 支付的退款处理方式。", blocks: [{ title: "平台与支付方式", variant: "legal", items: [
      { title: "App Store / Google Play", body: "通过 Apple 或 Google 购买的应用内项目，退款由对应平台按其规则处理。" },
      { title: "Web 支付", body: "通过 Web、Stripe 或其他网页支付的订单，Machi 会按订单状态、使用情况、服务进度和当地法律判断。" },
      { title: "数字资料", body: "可下载、已解锁或已访问的数字资料通常不支持无理由退款，除非法律要求或资料存在重大问题。" },
    ] }, { title: "服务预约", variant: "legal", items: [
      { title: "取消与改期", body: "未开始服务可按订单规则申请取消或改期；临近时间取消、迟到、未到场可能产生费用。" },
      { title: "部分退款", body: "服务已开始、已投入人工或已产生第三方成本时，可能只支持部分退款或不退款。" },
      { title: "申请方式", body: "请提供订单号、账号邮箱、原因和必要截图，发送至 hi@machicity.com。" },
    ] }] },
    en: { eyebrow: "Refund Policy", title: "Refund and cancellation rules", intro: "This policy explains refund handling for memberships, digital resources, service bookings, App Store / Google Play in-app purchases and Web payments.", blocks: [{ title: "Platforms and payment methods", variant: "legal", items: [
      { title: "App Store / Google Play", body: "Refunds for in-app purchases made through Apple or Google are handled by those platforms under their rules." },
      { title: "Web payments", body: "For Web, Stripe or other web checkout orders, Machi reviews order status, usage, service progress and local law." },
      { title: "Digital resources", body: "Downloaded, unlocked or accessed digital resources are usually not refundable without cause unless required by law or there is a material issue." },
    ] }, { title: "Service bookings", variant: "legal", items: [
      { title: "Cancellation and rescheduling", body: "Services not yet started may be cancelled or rescheduled under order rules. Late cancellation, lateness or no-shows may incur fees." },
      { title: "Partial refunds", body: "If service has started, human work was invested or third-party costs occurred, only partial refunds or no refund may be available." },
      { title: "How to request", body: "Send order number, account email, reason and relevant screenshots to hi@machicity.com." },
    ] }] },
    ja: { eyebrow: "返金ポリシー", title: "返金とキャンセルのルール", intro: "本ポリシーは、会員、デジタル資料、サービス予約、App Store / Google Play 購読、Web 支払いの返金について説明します。", blocks: [{ title: "プラットフォームと支払い方法", variant: "legal", items: [
      { title: "App Store / Google Play", body: "Apple または Google 経由の購読・アプリ内購入の返金は、各ストアの規則に従って処理されます。" },
      { title: "Web 支払い", body: "Web、Stripe、その他 Web 決済の注文は、注文状態、利用状況、サービス進行、現地法をもとに判断します。" },
      { title: "デジタル資料", body: "ダウンロード、解除、閲覧済みのデジタル資料は、法令上必要な場合や重大な問題がある場合を除き、通常返金対象外です。" },
    ] }, { title: "サービス予約", variant: "legal", items: [
      { title: "キャンセルと変更", body: "開始前のサービスは注文ルールに従いキャンセルまたは変更できます。直前キャンセル、遅刻、無断キャンセルは費用が発生する場合があります。" },
      { title: "一部返金", body: "サービス開始後、人員投入後、第三者費用発生後は、一部返金または返金不可となる場合があります。" },
      { title: "申請方法", body: "注文番号、アカウントメール、理由、必要なスクリーンショットを hi@machicity.com へ送ってください。" },
    ] }] },
  },
  "community-guidelines": {
    zh: { eyebrow: "社区规则", title: "让同城连接保持真实、有边界。", intro: "Machi 欢迎真实经验、求助、交易、服务和同城连接，但不允许伤害、欺骗、骚扰或制造风险。", blocks: [{ title: "我们鼓励", variant: "legal", items: [
      { title: "尊重他人", body: "不同国家、城市、语言、文化和身份的用户都应被平等对待。" },
      { title: "真实清楚", body: "租房、招聘、二手、服务、活动和商家内容应真实、完整、可核实。" },
      { title: "安全交易和见面", body: "优先公共场所，保留沟通记录，不提前转账给未验证对象。" },
    ] }, { title: "禁止行为", variant: "legal", items: [
      { title: "骚扰、仇恨和隐私侵犯", body: "禁止骚扰、跟踪、仇恨、歧视、未经同意公开他人隐私或冒充他人。" },
      { title: "诈骗和虚假内容", body: "禁止诈骗、虚假招聘、虚假房源、误导性服务、垃圾广告和钓鱼链接。" },
      { title: "危险和违法内容", body: "禁止危险线下邀约、成人/违法/暴力内容、威胁、武器、毒品和其他违法行为。" },
      { title: "举报、拉黑和违规处理", body: "用户可举报或拉黑。Machi 可审核、标记、下架、限制账号、暂停商家认证或移交必要信息。" },
    ] }] },
    en: { eyebrow: "Community Guidelines", title: "Keep local connection real and bounded.", intro: "Machi welcomes lived experience, questions, exchange, services and local connection, but not harm, deception, harassment or avoidable risk.", blocks: [{ title: "We encourage", variant: "legal", items: [
      { title: "Respect others", body: "Users across countries, cities, languages, cultures and identities should be treated equally." },
      { title: "Be truthful and clear", body: "Housing, hiring, secondhand, services, events and business content should be real, complete and verifiable." },
      { title: "Trade and meet safely", body: "Prefer public places, keep communication records and do not prepay unverified people." },
    ] }, { title: "Prohibited behavior", variant: "legal", items: [
      { title: "Harassment, hate and privacy abuse", body: "Harassment, stalking, hate, discrimination, non-consensual privacy exposure and impersonation are not allowed." },
      { title: "Scams and false content", body: "Scams, fake jobs, fake housing, misleading services, spam and phishing links are prohibited." },
      { title: "Dangerous and illegal content", body: "Dangerous meetups, adult/illegal/violent content, threats, weapons, drugs and other illegal acts are prohibited." },
      { title: "Reports, blocking and enforcement", body: "Users can report or block. Machi may review, label, remove, limit accounts, suspend business verification or disclose necessary information." },
    ] }] },
    ja: { eyebrow: "コミュニティ規範", title: "同じ街のつながりを、本物で安全なものに。", intro: "Machi は生活経験、質問、取引、サービス、同じ街のつながりを歓迎しますが、害、欺き、嫌がらせ、不要なリスクは許可しません。", blocks: [{ title: "歓迎すること", variant: "legal", items: [
      { title: "他者を尊重する", body: "国、都市、言語、文化、アイデンティティの違いを平等に扱ってください。" },
      { title: "正確で明確に", body: "住まい、求人、中古、サービス、イベント、事業者情報は実在し、完全で、確認可能であるべきです。" },
      { title: "安全に取引・対面する", body: "公共の場所を優先し、やり取りを残し、未確認の相手に前払いしないでください。" },
    ] }, { title: "禁止行為", variant: "legal", items: [
      { title: "嫌がらせ、ヘイト、プライバシー侵害", body: "嫌がらせ、つきまとい、ヘイト、差別、同意のない個人情報公開、なりすましは禁止です。" },
      { title: "詐欺と虚偽内容", body: "詐欺、虚偽求人、虚偽物件、誤解を招くサービス、スパム、フィッシングリンクは禁止です。" },
      { title: "危険・違法コンテンツ", body: "危険な対面誘い、成人・違法・暴力コンテンツ、脅迫、武器、薬物、その他違法行為は禁止です。" },
      { title: "通報、ブロック、措置", body: "ユーザーは通報・ブロックできます。Machi は審査、ラベル、削除、制限、事業者認証停止、必要情報の開示を行う場合があります。" },
    ] }] },
  },
  "commercial-disclosure": {
    zh: { eyebrow: "商业披露", title: "商业披露（特定商取引法に基づく表記）", intro: "本页面列出 Machi Web 支付、会员、数字资料和服务预约相关的商业披露信息。此页面用于满足日本支付审核与网站披露要求，不构成法律意见。", blocks: [
      { title: "商家基本信息", variant: "legal", items: [
        { title: "法定名称", body: "Machi / 运营者：姚凱（如依法或经合理要求需要更完整的法定名称，将立即披露）。" },
        { title: "地址", body: "如经要求将立即披露。请通过 hi@machicity.com 联系并说明订单号、请求目的和联系方式。" },
        { title: "电话号码", body: "如经要求将立即披露。客服优先通过电子邮件处理，必要时安排日语沟通。" },
        { title: "邮箱地址", body: "hi@machicity.com" },
        { title: "运营主管", body: "Yao Kai / YAOKAI" },
      ] },
      { title: "销售条件", variant: "legal", items: [
        { title: "价格", body: "各会员套餐、数字资料、服务预约或商品页面显示的金额为准。页面价格通常为含税价；如适用税费或地区差异，将在订单页显示。" },
        { title: "额外费用", body: "互联网通信费由用户自行承担。服务预约可能产生交通费、官方手续费、材料费、第三方机构费用或银行/支付服务商手续费；订单页或服务说明会在可预见范围内列明。" },
        { title: "可接受的支付方式", body: "Web 支付主要使用 Stripe 支持的银行卡、Apple Pay、Google Pay 等方式；App Store / Google Play 购买按对应平台规则处理。实际可用方式以结账页为准。" },
        { title: "付款期限", body: "银行卡、Apple Pay、Google Pay 等即时支付方式会在订单确认时处理。银行转账或其他非即时方式如开放，将以订单页显示的期限为准。" },
        { title: "交付时间", body: "数字资料通常在支付确认后立即或短时间内解锁。会员权益通常在支付确认后开通。预约服务在用户提交需求并完成确认后，根据双方约定时间提供。" },
      ] },
      { title: "取消、退货和退款", variant: "legal", items: [
        { title: "客户要求的取消或退款", body: "未开始的服务预约可按订单页或退款政策申请取消、改期或退款。已下载、已解锁或已访问的数字资料通常不支持无理由退款，除非法律要求或资料存在重大问题。" },
        { title: "有缺陷的商品或服务", body: "如数字资料无法访问、文件明显损坏、订单权益未开通或服务与订单说明明显不符，请联系 hi@machicity.com。Machi 会核实后提供修复、重新交付、等值替代、部分退款或退款。" },
        { title: "会员购买与有效期", body: "Web 会员为一次性购买，不创建 Stripe 订阅或自动续费。购买成功后按订单周期开通或延长会员，有效期以会员页和订单记录为准。" },
        { title: "支付用途边界", body: "Machi 支付只用于平台服务费、数字资料、认证推广、广告、会员和明确说明的自营或预约服务。" },
      ] },
      { title: "可选披露", variant: "legal", items: [
        { title: "申请期间", body: "限时活动、预约名额或促销如有申请期间，将在对应页面或订单页显示。" },
        { title: "可用数量", body: "数字资料、会员和服务预约如存在数量、名额、地区或语言限制，将在对应页面显示。" },
        { title: "运行环境", body: "Machi Web 支持现代浏览器。iOS / Android 应用的系统要求以上架商店页面说明为准。" },
        { title: "更新方式", body: "本页面内容可在后台更新。重大变更会通过官网、订单页、站内通知或其他合理方式说明。" },
      ] },
    ] },
    en: { eyebrow: "Commercial Disclosure", title: "Commercial Disclosure", intro: "This page provides commercial disclosure information for Machi Web payments, memberships, digital resources and service bookings. It is prepared for Japanese payment review and website disclosure purposes and is not legal advice.", blocks: [
      { title: "Business Information", variant: "legal", items: [
        { title: "Legal name", body: "Machi / Operator: Yao Kai. Additional legal name details will be disclosed without delay upon lawful or reasonable request." },
        { title: "Address", body: "Will be disclosed without delay upon request. Contact hi@machicity.com with the relevant order number, request purpose and contact details." },
        { title: "Phone number", body: "Will be disclosed without delay upon request. Customer support is primarily handled by email, with Japanese communication arranged when necessary." },
        { title: "Email address", body: "hi@machicity.com" },
        { title: "Operations manager", body: "Yao Kai / YAOKAI" },
      ] },
      { title: "Sales Terms", variant: "legal", items: [
        { title: "Price", body: "Prices are shown on each membership plan, digital resource, service booking or product page. Prices are generally tax-inclusive where applicable; taxes or regional differences are shown at checkout when relevant." },
        { title: "Additional fees", body: "Users are responsible for their own internet connection costs. Service bookings may involve transport, official fees, material costs, third-party fees or bank/payment provider fees; foreseeable items are described on the order page or service description." },
        { title: "Accepted payment methods", body: "Web payments mainly use Stripe-supported cards, Apple Pay, Google Pay and related methods. App Store / Google Play purchases follow the relevant platform rules. Actual available methods are shown at checkout." },
        { title: "Payment period", body: "Cards, Apple Pay, Google Pay and other instant payment methods are processed when the order is confirmed. If bank transfer or another non-instant method is offered, the deadline shown on the order page applies." },
        { title: "Delivery time", body: "Digital resources are usually unlocked immediately or shortly after payment confirmation. Membership benefits usually activate after payment confirmation. Service bookings are provided at the agreed time after request and scheduling confirmation." },
      ] },
      { title: "Cancellation, Returns and Refunds", variant: "legal", items: [
        { title: "Customer-requested cancellation or refund", body: "Service bookings that have not started may be cancelled, rescheduled or refunded under the order page and Refund Policy. Downloaded, unlocked or accessed digital resources are usually not refundable without cause unless required by law or there is a material issue." },
        { title: "Defective goods or services", body: "If a digital resource cannot be accessed, a file is materially damaged, order benefits do not activate or a service materially differs from the order description, contact hi@machicity.com. Machi will review and may provide repair, re-delivery, equivalent replacement, partial refund or refund." },
        { title: "Membership purchases and validity", body: "Web membership is a one-time purchase and does not create a Stripe subscription or automatic renewal. After successful payment, membership is activated or extended for the purchased period; the membership page and order history show the current validity." },
        { title: "Payment use boundary", body: "Payments on Machi are only for platform services, digital resources, verified promotions, advertising, memberships and clearly described service bookings." },
      ] },
      { title: "Optional Disclosures", variant: "legal", items: [
        { title: "Application period", body: "If a limited-time activity, booking slot or promotion has an application period, it is shown on the relevant page or order page." },
        { title: "Available quantity", body: "If digital resources, memberships or service bookings have quantity, capacity, region or language limits, they are shown on the relevant page." },
        { title: "Operating environment", body: "Machi Web supports modern browsers. iOS / Android app system requirements follow the relevant store listing when released." },
        { title: "Updates", body: "This page can be updated from the admin console. Material changes may be announced through the website, order pages, in-app notices or other reasonable methods." },
      ] },
    ] },
    ja: { eyebrow: "特定商取引法に基づく表記", title: "特定商取引法に基づく表記", intro: "本ページは、Machi Web の決済、会員、デジタル資料、サービス予約に関する商取引上の表示事項をまとめたものです。日本の決済審査およびサイト表示のために作成しており、法的助言ではありません。", blocks: [
      { title: "事業者情報", variant: "legal", items: [
        { title: "販売事業者の名称", body: "Machi / 運営者：Yao Kai。法令上または合理的な請求がある場合、追加の法定名称情報を遅滞なく開示します。" },
        { title: "所在地", body: "請求があれば遅滞なく開示します。hi@machicity.com へ、注文番号、請求目的、連絡先をご記入ください。" },
        { title: "電話番号", body: "請求があれば遅滞なく開示します。お問い合わせは原則メールで受け付け、必要に応じて日本語での連絡を調整します。" },
        { title: "メールアドレス", body: "hi@machicity.com" },
        { title: "運営責任者", body: "Yao Kai / YAOKAI" },
      ] },
      { title: "販売条件", variant: "legal", items: [
        { title: "販売価格", body: "会員プラン、デジタル資料、サービス予約、商品ページに表示される金額に従います。価格は原則として税込表示とし、税額や地域差がある場合は注文画面に表示します。" },
        { title: "追加料金", body: "インターネット通信料はユーザー負担です。サービス予約では交通費、公的手数料、資料費、第三者機関費用、銀行または決済事業者手数料が発生する場合があり、予見可能な範囲で注文画面またはサービス説明に表示します。" },
        { title: "利用可能な支払方法", body: "Web 決済は主に Stripe が対応するカード、Apple Pay、Google Pay 等を利用します。App Store / Google Play 経由の購入は、各ストアの規則に従います。実際に利用できる方法は決済画面に表示されます。" },
        { title: "支払時期", body: "カード、Apple Pay、Google Pay など即時決済は注文確定時に処理されます。銀行振込その他の非即時決済を提供する場合は、注文画面に表示される期限に従います。" },
        { title: "引渡し時期", body: "デジタル資料は通常、決済確認後ただちに、または短時間で閲覧可能になります。会員特典は通常、決済確認後に有効化されます。サービス予約は、依頼内容と日程確認後、合意した日時に提供します。" },
      ] },
      { title: "キャンセル、返品、返金", variant: "legal", items: [
        { title: "お客様都合のキャンセルまたは返金", body: "開始前のサービス予約は、注文画面および返金ポリシーに従い、キャンセル、変更、返金を申請できます。ダウンロード済み、解除済み、閲覧済みのデジタル資料は、法令上必要な場合または重大な問題がある場合を除き、通常返金対象外です。" },
        { title: "不具合がある商品またはサービス", body: "デジタル資料にアクセスできない、ファイルが著しく破損している、注文特典が有効化されない、サービスが注文説明と著しく異なる場合は hi@machicity.com へご連絡ください。確認後、修正、再提供、同等代替、一部返金または返金を行う場合があります。" },
        { title: "継続課金契約", body: "会員購読は、App Store、Google Play、Stripe または Web 注文画面の規則に従って解約できます。解約後も、通常は支払い済み期間の特典を利用でき、自動更新の状態は各プラットフォームの表示に従います。" },
        { title: "決済利用の範囲", body: "Machi の決済機能は、デーティング、マッチメイキング、エスコートサービス、有料同伴、アダルトサービス、または一対一の恋愛紹介には使用されません。" },
      ] },
      { title: "任意表示事項", variant: "legal", items: [
        { title: "申込期間", body: "期間限定の活動、予約枠、プロモーションに申込期間がある場合、該当ページまたは注文画面に表示します。" },
        { title: "販売数量", body: "デジタル資料、会員、サービス予約に数量、定員、地域、言語の制限がある場合、該当ページに表示します。" },
        { title: "動作環境", body: "Machi Web はモダンブラウザに対応します。iOS / Android アプリのシステム要件は、公開時のストア表示に従います。" },
        { title: "更新方法", body: "本ページは管理画面から更新できます。重要な変更は、公式サイト、注文画面、アプリ内通知、その他合理的な方法で案内する場合があります。" },
      ] },
    ] },
  },
  "cookie-policy": {
    zh: { eyebrow: "Cookie 政策", title: "Cookie 和类似技术", intro: "Machi 使用 Cookie、本地存储和类似技术维持登录、语言、主题、安全、防滥用、分析和性能体验。", blocks: [{ title: "使用方式", variant: "legal", items: [
      { title: "必要 Cookie", body: "用于登录状态、CSRF/安全、防滥用、服务稳定性和偏好保存。" },
      { title: "偏好与体验", body: "用于保存语言、主题、城市选择、通知偏好和表单状态，让语言切换后仍停留在当前页面。" },
      { title: "分析与性能", body: "用于理解页面访问、错误、性能和功能使用情况。我们避免收集不必要的敏感内容。" },
      { title: "管理方式", body: "你可以通过浏览器设置清理或阻止 Cookie，但部分登录、偏好和安全功能可能受影响。" },
    ] }] },
    en: { eyebrow: "Cookie Policy", title: "Cookies and similar technologies", intro: "Machi uses cookies, local storage and similar technologies for login, language, theme, safety, abuse prevention, analytics and performance.", blocks: [{ title: "How we use them", variant: "legal", items: [
      { title: "Necessary cookies", body: "Used for session state, CSRF/security, abuse prevention, service stability and preference storage." },
      { title: "Preferences and experience", body: "Used to remember language, theme, city selection, notification preferences and form state, so language switching keeps the current page." },
      { title: "Analytics and performance", body: "Used to understand page visits, errors, performance and feature usage while avoiding unnecessary sensitive content." },
      { title: "Controls", body: "You can clear or block cookies in browser settings, but login, preferences and safety features may be affected." },
    ] }] },
    ja: { eyebrow: "Cookie ポリシー", title: "Cookie と類似技術", intro: "Machi はログイン、言語、テーマ、安全、不正防止、分析、性能のため Cookie、ローカルストレージ、類似技術を使用します。", blocks: [{ title: "利用方法", variant: "legal", items: [
      { title: "必要 Cookie", body: "ログイン状態、CSRF/安全、不正防止、サービス安定性、設定保存に使います。" },
      { title: "設定と体験", body: "言語、テーマ、都市選択、通知設定、フォーム状態を保存し、言語切替後も現在ページに留まれるようにします。" },
      { title: "分析と性能", body: "ページ訪問、エラー、性能、機能利用状況を理解するために使います。不要な機微情報の収集は避けます。" },
      { title: "管理方法", body: "ブラウザ設定で Cookie を削除またはブロックできますが、ログイン、設定、安全機能に影響する場合があります。" },
    ] }] },
  },
};
