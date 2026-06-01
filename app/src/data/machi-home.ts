export type MarketingLocale = "zh" | "en" | "ja";

export type City = {
  name: string;
  country: string;
  description: string;
  posts: string;
  heat: string;
  status?: string;
  sampleLabel?: string;
  languageTags?: string[];
  sceneTags?: string[];
  highlight?: string;
  tone: "indigo" | "sky" | "green" | "amber" | "rose" | "violet" | "teal" | "slate";
};

export type FeatureChannel = {
  key: string;
  title: string;
  badge: string;
  description: string;
  icon: string;
  tone: "blue" | "cyan" | "amber" | "yellow" | "purple" | "violet" | "emerald" | "rose" | "orange" | "slate" | "green" | "red";
};

export type TrendingPost = {
  title: string;
  heat: string;
  category: string;
};

export type UseCase = {
  title: string;
  description: string;
  icon: string;
};

export type SafetyItem = {
  title: string;
  body: string;
};

export type Announcement = {
  type: string;
  title: string;
  date: string;
  body: string;
};

export const localeOptions: Array<{ value: MarketingLocale; label: string; shortLabel: string }> = [
  { value: "zh", label: "中文", shortLabel: "中" },
  { value: "en", label: "English", shortLabel: "EN" },
  { value: "ja", label: "日本語", shortLabel: "日" },
];

const sharedTones: City["tone"][] = ["indigo", "sky", "rose", "green", "amber", "teal", "violet", "slate"];

const featureIcons = [
  ["news", "Newspaper", "blue"],
  ["guides", "Map", "cyan"],
  ["social", "MessagesSquare", "rose"],
  ["meetups", "UsersRound", "emerald"],
  ["dining", "Utensils", "rose"],
  ["events", "CalendarDays", "orange"],
  ["language-exchange", "Languages", "violet"],
  ["housing", "Home", "yellow"],
  ["secondhand", "Repeat2", "amber"],
  ["jobs", "BriefcaseBusiness", "purple"],
  ["hiring", "UserRoundPlus", "violet"],
  ["qa", "MessageCircleQuestion", "slate"],
  ["services", "Wrench", "green"],
  ["avoid", "TriangleAlert", "red"],
] as const;

function withFeatureMeta(
  items: Array<Omit<FeatureChannel, "icon" | "tone" | "key">>,
): FeatureChannel[] {
  return items.map((item, index) => {
    const [key, icon, tone] = featureIcons[index];
    return { ...item, key, icon, tone };
  });
}

function withCityTone(items: Array<Omit<City, "tone">>): City[] {
  return items.map((item, index) => ({ ...item, tone: sharedTones[index] }));
}

export const marketingCopy = {
  zh: {
    nav: {
      items: [
        ["功能", "/features"],
        ["城市", "/cities"],
        ["公告", "/#announcements"],
        ["商家合作", "/business"],
        ["安全", "/safety"],
        ["下载", "/download"],
        ["关于", "/about"],
      ],
      signIn: "登录",
      register: "注册",
      getApp: "获取 App",
      openMenu: "打开导航",
      closeMenu: "关闭导航",
      language: "语言",
    },
    hero: {
      eyebrow: "本地生活 + 同城社交",
      titleTop: "Machi",
      titleBottom: "",
      headline: "在每一座城市，找到生活的回声。",
      subtitle: "Machi 是一个按城市和语言组织的本地生活与同城社交社区。发现城市里的信息，也认识城市里的人。",
      supporting: "找租房、二手、工作、招聘、约饭、活动、问答、避坑经验和本地服务；也可以认识同城朋友、饭搭子、活动搭子、语言交换伙伴和真实生活中的人。",
      primary: "加入城市内测名单",
      secondary: "寻找同城连接",
      tertiary: "创始人理念",
      quaternary: "商家合作申请",
      appStoreCaption: "App Store · 即将上线",
      appStore: "App Store",
      googlePlayCaption: "Google Play · 即将上线",
      googlePlay: "Google Play",
      webBetaCaption: "Web Beta · 邀请制开放",
      scrollLabel: "继续浏览",
      stats: [
        ["Closed beta", "Tokyo / Japan → Osaka"],
        ["14", "城市频道"],
        ["3", "中文 / EN / 日本語"],
      ],
    },
    appMockup: {
      title: "城市经验",
      region: "日本 · 东京",
      search: "搜索租房、避坑、约饭、二手",
      hotTitle: "东京脉搏",
      hotSubtitle: "正在发生",
      quickEntries: ["新闻", "攻略", "二手", "租房", "工作", "招聘", "搭子", "约饭"],
      hotItems: ["东京租房避坑指南", "新宿周末约饭", "涩谷兼职招聘"],
      cards: [
        { type: "租房", title: "东京租房避坑指南", place: "新宿", heat: "56.2K" },
        { type: "约饭", title: "新宿约饭，周末有人一起吗", place: "新宿", heat: "38.9K" },
        { type: "招聘", title: "涩谷兼职招聘，日语 N3 以上", place: "涩谷", heat: "21.6K" },
      ],
    },
    brandIntro: {
      label: "品牌理念",
      title: "让每座城市的真实经验被看见。",
      body: "Machi 把散落在群聊、社交平台、论坛和朋友之间的城市经验，按城市、语言、话题、热度和可信经验重新整理，连接生活在这里、关注这里或即将前往这里的人。",
      pillars: [
        ["选择城市", "选择国家、省/州和城市，进入这座城市的真实生活脉搏。"],
        ["发现真实经验", "看新闻、攻略、租房、工作、二手、约饭、活动、问答和避坑提醒。"],
        ["与城市的人连接", "通过真实经验认识住在这里的人、机会和正在发生的事。"],
      ],
    },
    brandStory: {
      label: "品牌故事",
      title: "在每一座城市，找到生活的回声。",
      lead: "每一座城市，都不只是地图上的一个名字。真正的城市，藏在无数普通人的日常里。",
      cityLines: [
        "东京不是只有地铁、霓虹和高楼。",
        "大阪不是只有街道、美食和人潮。",
        "上海不只是外滩和夜景。",
        "杭州不只是西湖和江南。",
        "洛杉矶不只是阳光和高速公路。",
        "蒙特利尔不只是湖岸、街车和远方。",
      ],
      paragraphs: [
        "它藏在一个刚搬来的人问：这个区适合住吗？也藏在准备回国的人说：这些家具低价出。",
        "它藏在找工作的人分享面试经验，周末想约饭的人发出邀请，也藏在一篇租房攻略、一条避坑提醒、一场活动、一次回答里。",
        "这些声音很小，却很真实。它们散落在群聊、社交平台、论坛和朋友之间，也散落在每个人刚到一座城市时的迷茫和寻找里。",
        "Machi 想做的，是把这些散落的声音重新汇聚起来，让城市经验不再只是零散的信息。",
        "在 Machi，你看到的不只是内容。你看到的是一座城市正在发生的生活。",
        "真正让人留在一座城市的，不只是地址，而是你在这里找到的生活感。",
      ],
      highlights: [
        ["提问", "这个区适合住吗？"],
        ["经验", "租房、办卡、找工作和避坑提醒。"],
        ["机会", "招聘、服务、活动和本地优惠。"],
      ],
      echoLabel: "城市回声",
      echoNodes: ["提问", "分享", "被看见", "被回应"],
      closing: "Machi，就是让这些声音被看见、被找到、被回应的地方。",
    },
    founder: {
      eyebrow: "创始人",
      title: "创始人",
      name: "姚凱 / YAOKAI",
      role: "Founder, Machi City",
      meta: "2019 年 10 月来到日本留学",
      avatar: "姚",
      readMore: "阅读完整创始人故事",
      bio: "2019 年 10 月来到日本留学，从自己的跨国生活经历出发，创立 Machi。",
      quote: "“城市不只是地图上的名字，而是人真正生活、寻找、相遇和重新开始的地方。”",
      paragraphs: [
        "Machi City 由姚凱 / YAOKAI 创立，是一个从 0 开始搭建的原创项目。",
        "2019 年 10 月，姚凱来到日本留学。刚到一个陌生国家和陌生城市时，他很快感受到一个很现实的问题：真正有用的生活信息，往往并不集中在一个地方。",
        "租房、打工、二手、办手续、交通、活动、本地服务、避坑经验和生活提醒，构成了一个人真正生活在城市里的日常。但这些信息常常散落在群聊、社交平台、本地网站、朋友之间，以及不同语言的信息环境里。",
        "对刚来到一座城市的人来说，找到准确、有用、可信的信息并不容易；而对已经生活在这里的人来说，想要分享经验、发布需求、寻找同频的人，也缺少一个更清晰、更有秩序的地方。",
        "Machi City 正是从这样的经历和观察中开始的。",
        "它不是一个冰冷的信息库，也不是单纯的社交产品。Machi 希望把一座城市里的资讯、经验、需求和连接，按照国家、城市、语言和内容类型重新整理起来，让那些原本散落的城市生活，被看见、被找到、被回应。",
        "Machi 来自日语「街 / まち」。它不是地图上的城市名，而是人真正生活、相遇、寻找和重新开始的地方。",
        "姚凱的理念很简单：",
      ],
      closing: "让城市里的信息不再散落。\n让陌生的地方慢慢变得可生活。\n让更多人在一座城市里，找到生活的回声。",
    },
    announcementsSection: {
      label: "公告中心",
      title: "Machi 最新公告。",
      body: "这里会同步 Machi 的产品进展、城市阶段计划、测试邀请、合作开放和重要通知。我们会持续把最值得关注的信息放在这里。",
      manageHint: "最新公开信息以官网公告为准。",
      manageLabel: "查看全部公告",
      composerTitle: "发布信息",
      titlePlaceholder: "标题，例如：东京城市频道即将开放",
      bodyPlaceholder: "写下公告、通知或信息内容",
      publish: "发布",
      empty: "先写一条信息再发布。",
      saved: "已发布到官网动态。",
      tabs: ["公告", "新闻", "App 更新", "通知", "信息"],
      defaultItems: [
        { type: "公告", title: "Machi 官网首页上线", date: "2026.05", body: "首版官网已支持城市展示、内容频道、热榜、多语言和商家合作入口。" },
        { type: "新闻", title: "Tokyo / Japan 内测启动", date: "2026.05", body: "第一阶段聚焦 Tokyo / Japan，第二阶段开放 Osaka，后续规划 Los Angeles / Montreal / Shanghai / Hangzhou。等待名单用户将按城市阶段陆续收到邀请。" },
        { type: "App 更新", title: "iOS / Android Beta 0.9 进入打包", date: "2026.05", body: "新增城市频道、内容语言、热榜、商家入驻草稿。下一周开始向首批等待名单用户发放测试包。" },
        { type: "通知", title: "等待名单进入第二批邀请", date: "2026.05", body: "等待名单用户将优先收到城市开放和 App 测试邀请。" },
        { type: "信息", title: "商家合作通道开放预约", date: "2026.05", body: "本地商家、招聘方、房产中介和服务商可以提前提交合作需求。" },
      ],
    },
    citySection: {
      label: "城市",
      title: "城市阶段，从 Tokyo / Japan 开始。",
      body: "第一阶段聚焦 Tokyo / Japan，第二阶段开放 Osaka，后续规划 Los Angeles / Montreal / Shanghai / Hangzhou。城市卡片展示的是 Beta sample data，用来预览频道、语言和社交场景。",
      badge: "Beta sample data",
      switcherLabel: "当前城市",
      switcherActive: "日本 · 东京",
      switcherHint: "可切换",
      switcherCities: ["Osaka", "Los Angeles", "Montreal", "Shanghai", "Hangzhou"],
      sampleNote: "Demo preview：页面中的帖子、热度和状态为内测预览，不代表生产真实数据。",
    },
    featureSection: {
      label: "城市频道",
      title: "城市生活信息、机会和线下连接，都按场景归位。",
      body: "Machi 将本地新闻、城市指南、问答、服务、租房、二手、工作、招聘、同城社交、搭子、约饭、活动、语言交换和避坑经验按城市与语言组织起来。",
      groups: [
        {
          title: "City Info",
          description: "本地新闻、指南、问答和服务，让新旧居民都能快速看懂这座城市。",
          channels: ["news", "guides", "qa", "services"] as const,
        },
        {
          title: "Trade & Opportunity",
          description: "租房、二手、找工作、招聘和服务线索。",
          channels: ["housing", "secondhand", "jobs", "hiring"] as const,
        },
        {
          title: "Social & Offline",
          description: "同城朋友、饭搭子、活动搭子、语言交换和真实生活里的连接。",
          channels: ["social", "meetups", "dining", "events", "language-exchange", "avoid"] as const,
        },
      ],
    },
    trendingSection: {
      label: "城市热榜",
      title: "看看附近正在发生什么。",
      subtitle: "热度系统会根据点赞、评论、收藏、转发和时间衰减，帮助用户发现当前城市最值得关注的内容。",
      cardTitle: "东京热榜",
      cardSubtitle: "城市排行",
      formulaTitle: "热度公式",
      heatLabel: "热度",
      formula: ["点赞", "评论", "收藏", "转发"],
    },
    languageSection: {
      label: "多语言",
      title: "为多语言城市而生。",
      body: "用户不仅可以切换 App 语言，也可以选择内容语言。比如在东京查看中文内容，在蒙特利尔查看日语内容，在洛杉矶查看英文内容。",
      chips: ["中文", "English", "日本語", "한국어", "Français", "Español"],
      contextTitle: "多语言推荐",
      contextLabel: "推荐上下文",
      regionLabel: "当前地区",
      region: "加拿大 · 蒙特利尔",
      contentLanguageLabel: "内容语言",
      contentLanguage: "日本語",
      priorityLabel: "优先展示",
      priority: ["蒙特利尔日语内容", "加拿大日语内容", "全站日语热门内容", "蒙特利尔其他语言高热度内容"],
    },
    useCaseSection: {
      label: "城市经验",
      title: "为真实城市生活而设计。",
    },
    businessSection: {
      label: "商家合作",
      title: "商家不仅能投放广告，还能进入本地社交场景。",
      body: "餐厅可以发起饭局、优惠和本地活动；语言学校可以触达语言交换用户；活动组织者、健身房、课程机构、本地服务商和招聘者都能连接城市里的真实需求。",
      primary: "申请合作",
      secondary: "查看广告方案",
      consoleLabel: "商家后台",
      consoleTitle: "东京推广计划",
      verified: "商家认证",
      partnerTitle: "认证本地合作方",
      partnerBody: "认证、曝光、线索和城市频道运营。",
      campaigns: [
        ["Restaurant meetup campaign", "Beta sample data"],
        ["Language school exchange group", "Beta sample data"],
        ["Hiring in city community", "Beta sample data"],
      ],
    },
    safetySection: {
      label: "安全",
      title: "Real connection needs real boundaries.",
      body: "Machi 为社交、线下见面、饭局、语言交换、租房、二手、招聘和商家合作提供安全提醒、举报、拉黑、内容审核和账号处罚机制。",
    },
    download: {
      label: "从你的城市开始",
      title: "下载 Machi",
      body: "Machi 正在准备 closed beta。第一阶段聚焦 Tokyo / Japan，第二阶段开放 Osaka，后续规划 Los Angeles / Montreal / Shanghai / Hangzhou。你可以在 Web Beta 中体验城市首页、发现与搜索、通知、私信、发布内容、个人主页和同城连接。",
      primary: "加入等待名单",
      secondary: "寻找同城连接",
      appStore: "iOS：即将上线",
      googlePlay: "Android：即将上线",
      webBeta: "Web Beta：邀请制开放",
      formLabel: "等待名单",
      formTitle: "加入城市内测名单",
      email: "Email",
      cityLabel: "Preferred city",
      languageLabel: "Language preference",
      intentLabel: "I want to use Machi for",
      cityOptions: ["Tokyo", "Osaka", "Los Angeles", "Montreal", "Shanghai", "Hangzhou", "其他城市"],
      languageOptions: ["中文", "English", "日本語"],
      intentOptions: ["本地生活信息", "认识朋友", "找饭搭子", "找活动搭子", "语言交换", "租房", "二手", "找工作", "招聘", "商家推广", "本地服务"],
      notify: "加入内测名单",
      sending: "正在提交…",
      success: "你已加入 Machi 城市内测名单。我们会在你的城市开放测试时通知你，帮助你发现本地信息，也认识同城的人。",
      errorInvalid: "邮箱格式不正确，请检查后重试。",
      errorSubmit: "提交失败，请稍后再试。",
      benefitsTitle: "加入后你会收到",
      benefits: [
        ["Web Beta 邀请", "城市首页、发现、搜索、通知、私信、发布和个人主页优先体验"],
        ["城市开放通知", "Tokyo / Japan、Osaka 以及后续城市开放测试时第一时间提醒"],
        ["同城连接入口", "认识同城朋友、饭搭子、活动搭子和语言交换伙伴"],
      ],
      privacy: "我们只会在产品上线与城市开放时发邮件，不卖你的邮箱，也不会被订阅其他广告。",
    },
    faqSection: {
      label: "常见问题",
      title: "上线前你可能想知道的事。",
    },
    common: { open: "进入" },
    footer: {
      tagline: "在每一座城市，找到生活的回声。",
      description: "让城市里的问题、经验、机会和连接，被看见、被找到、被回应。machicity.com",
      groups: [
        ["导航", ["关于", "功能", "城市", "商家合作", "安全", "下载"]],
        ["合作", ["商家合作", "广告投放", "招聘推广", "租房推广", "系统合作"]],
        ["法律", ["隐私政策", "服务条款", "安全中心", "联系我们"]],
      ],
    },
    cities: withCityTone([
      { name: "Tokyo", country: "Japan", description: "租房避坑、约饭、语言交换和同城搭子最先测试。", posts: "Housing · Dining · Language Exchange · Meetups", heat: "Closed beta · Waitlist open", status: "Closed beta · Waitlist open", sampleLabel: "Demo preview", languageTags: ["中文", "EN", "日本語"], sceneTags: ["Housing", "Dining", "Language Exchange", "Meetups"], highlight: "涩谷、新宿和湾岸生活经验" },
      { name: "Osaka", country: "Japan", description: "美食、活动、生活攻略和同城求助作为第二阶段开放。", posts: "Dining · Events · Guides · Q&A", heat: "Phase 2 · Waitlist open", status: "Phase 2 · Waitlist open", sampleLabel: "Beta sample data", languageTags: ["中文", "EN", "日本語"], sceneTags: ["Dining", "Events", "Guides", "Q&A"], highlight: "梅田、难波和本地生活场景" },
      { name: "Montreal", country: "Canada", description: "租房、工作、多语言问答和新朋友支持，列入后续城市规划。", posts: "Housing · Jobs · Multilingual Q&A · Meetups", heat: "Roadmap · Later phase", status: "Roadmap · Later phase", sampleLabel: "Beta sample data", languageTags: ["EN", "中文", "日本語"], sceneTags: ["Housing", "Jobs", "Q&A", "Meetups"], highlight: "初到城市的生活支持" },
    ]),
    features: withFeatureMeta([
      { title: "本地新闻", badge: "News", description: "本地快讯、政策提醒、交通提醒和安全提醒。" },
      { title: "城市指南", badge: "Guides", description: "租房、签证、银行卡、手机卡、办事流程和生活经验。" },
      { title: "同城社交", badge: "Social", description: "认识同城朋友、新朋友和本地兴趣小组。" },
      { title: "同城搭子", badge: "Meetups", description: "饭搭子、咖啡搭子、活动搭子、运动搭子和周末同行。" },
      { title: "约饭", badge: "Dining", description: "约饭、咖啡、探店、饭局和轻量线下聚会。" },
      { title: "活动", badge: "Events", description: "展览、Citywalk、桌游、运动、课程和城市活动。" },
      { title: "语言交换", badge: "Language Exchange", description: "中文、英文、日文等语言交换和学习伙伴。" },
      { title: "租房", badge: "Housing", description: "找房、转租、合租、找室友、租房避坑。" },
      { title: "二手", badge: "Secondhand", description: "闲置转让、求购、搬家甩卖、免费赠送。" },
      { title: "找工作", badge: "Jobs", description: "兼职、全职、实习、远程、内推和求职经验。" },
      { title: "招聘", badge: "Hiring", description: "本地商家、企业、机构发布招聘和行业社群机会。" },
      { title: "问答", badge: "Q&A", description: "签证、租房、工作、学校、医疗等本地求助。" },
      { title: "本地服务", badge: "Services", description: "搬家、翻译、签证、留学、保险、维修、报税。" },
      { title: "避坑经验", badge: "Avoid", description: "租房、交易、招聘、活动和线下见面的风险提醒。" },
    ]),
    trendingPosts: [
      { title: "东京租房避坑指南", heat: "56.2K", category: "租房" },
      { title: "新宿周末约饭，有人一起吗", heat: "38.9K", category: "约饭" },
      { title: "涩谷兼职招聘，日语 N3 以上", heat: "21.6K", category: "招聘" },
      { title: "搬家出二手家具，低价自取", heat: "18.4K", category: "二手" },
    ],
    useCases: [
      { title: "刚到一个新城市", description: "看攻略、租房、办卡、找工作。", icon: "MapPinned" },
      { title: "搬家或回国", description: "出二手、转租、找搬家服务。", icon: "PackageOpen" },
      { title: "找工作", description: "看招聘、兼职、内推、面试经验。", icon: "BriefcaseBusiness" },
      { title: "周末想出去", description: "找约饭、活动、展览、Citywalk。", icon: "Sparkles" },
      { title: "遇到问题", description: "发问答，获得本地用户经验。", icon: "CircleHelp" },
      { title: "本地商家", description: "发布优惠、招聘、活动，连接城市用户。", icon: "Store" },
    ],
    safetyItems: [
      { title: "Social safety", body: "不要过早分享住址、证件、财务信息；遇到骚扰、诈骗或冒犯内容可举报或拉黑。" },
      { title: "Meetup safety", body: "第一次见面建议选择公共场所，告诉朋友见面地点，保留沟通记录。" },
      { title: "Dining safety", body: "饭局和约饭场景提供公共地点、人数、费用和退出提醒。" },
      { title: "Language exchange safety", body: "语言交换建议先在公共空间见面，不第一次就去私人空间。" },
      { title: "Housing safety", body: "不要提前转账给未验证房东，确认地址、合同和房东身份，警惕低价房源。" },
      { title: "Secondhand safety", body: "优先公共场所交易，高价值物品线下面交验货，不提前支付大额定金。" },
      { title: "Jobs & hiring safety", body: "不要支付入职押金，确认公司官网、地址和联系方式，警惕高薪先付款。" },
      { title: "Business verification", body: "为本地商家、招聘方、房产和服务商提供认证与风险标记。" },
      { title: "Report and block", body: "举报、屏蔽、内容审核、下架和账号限制形成完整处理链路。" },
      { title: "Community guidelines", body: "覆盖骚扰、仇恨、诈骗、冒充、恶意搭讪、虚假活动和线下危险行为。" },
    ],
    businessItems: ["Restaurant meetup campaign", "Language school exchange group", "Event organizer local participants", "Gym / class interest community", "Local service leads", "Hiring in city community"],
    faqs: [
      ["Machi 是什么？", "Machi 是一个按城市组织真实生活经验的社区。它把散落在群聊、社交平台和朋友之间的城市经验，按城市、语言、话题、热度和可信经验重新整理。"],
      ["Machi 和普通社交 App 有什么不同？", "普通社交 App 按关注关系展示内容，Machi 按城市、语言、话题和经验可信度组织信息，让你看到一座城市正在发生什么。"],
      ["Machi 支持哪些内容？", "新闻、攻略、二手、租房、工作、招聘、搭子、约饭、活动、问答、服务、商家、优惠等。"],
      ["Machi 支持多语言吗？", "支持。用户可以切换 App 语言，也可以选择内容语言。"],
      ["商家可以入驻吗？", "可以，未来支持商家认证、广告、招聘推广、优惠推广和服务线索。"],
      ["现在可以下载吗？", "Machi 正在准备上线。你可以先加入等待名单，获得发布提醒和早期城市开放通知。"],
    ],
  },
  en: {
    nav: {
      items: [
        ["Features", "/features"],
        ["Cities", "/cities"],
        ["Updates", "/#announcements"],
        ["Business", "/business"],
        ["Safety", "/safety"],
        ["Download", "/download"],
        ["About", "/about"],
      ],
      signIn: "Sign in",
      register: "Register",
      getApp: "Get the app",
      openMenu: "Open menu",
      closeMenu: "Close menu",
      language: "Language",
    },
    hero: {
      eyebrow: "Local life + local social",
      titleTop: "Machi",
      titleBottom: "",
      headline: "Find the echoes of life in every city.",
      subtitle: "Machi is a local life and social community organized by city and language. Discover local information and meet people in your city.",
      supporting: "Find housing, secondhand deals, jobs, hiring, dining, events, Q&A, local tips and trusted services — and meet local friends, dining buddies, event companions, language exchange partners and people who actually live there.",
      primary: "Join city beta waitlist",
      secondary: "Find local connections",
      tertiary: "Founder's vision",
      quaternary: "Apply for business partnership",
      appStoreCaption: "App Store · Coming soon",
      appStore: "App Store",
      googlePlayCaption: "Google Play · Coming soon",
      googlePlay: "Google Play",
      webBetaCaption: "Web Beta · Invite-only",
      scrollLabel: "Continue",
      stats: [
        ["Closed beta", "Tokyo / Japan → Osaka"],
        ["14", "city channels"],
        ["3", "中文 / EN / 日本語"],
      ],
    },
    appMockup: {
      title: "City pulse",
      region: "Japan · Tokyo",
      search: "Search housing, tips, dining, secondhand",
      hotTitle: "Tokyo pulse",
      hotSubtitle: "Happening now",
      quickEntries: ["News", "Guides", "Used", "Housing", "Jobs", "Hiring", "Mate", "Dining"],
      hotItems: ["Tokyo housing — what to avoid", "Shinjuku weekend dinners", "Shibuya part-time hiring"],
      cards: [
        { type: "Housing", title: "Tokyo housing — what to avoid", place: "Shinjuku", heat: "56.2K" },
        { type: "Dining", title: "Weekend dinner in Shinjuku", place: "Shinjuku", heat: "38.9K" },
        { type: "Hiring", title: "Part-time hiring in Shibuya", place: "Shibuya", heat: "21.6K" },
      ],
    },
    brandIntro: {
      label: "What is Machi",
      title: "A city experience network — not a classifieds board.",
      body: "Machi gathers what usually scatters across chats, social feeds, forums and friends, and re-organises it by city, language, topic, heat and trustworthy experience — so locals, newcomers and people moving in can all find the same pulse.",
      pillars: [
        ["Pick a city", "Country, region and city — step into the real pulse of that place."],
        ["See real experience", "News, guides, housing, jobs, secondhand, dining, events, Q&A and what to avoid."],
        ["Connect with people there", "Meet who actually lives there through their stories, asks and answers."],
      ],
    },
    brandStory: {
      label: "Brand story",
      title: "Find the echoes of life in every city.",
      lead: "A city is never only a name on a map. Its real shape lives inside ordinary days.",
      cityLines: [
        "Tokyo is more than trains, neon and towers.",
        "Osaka is more than streets, food and crowds.",
        "Shanghai is more than the Bund and night views.",
        "Hangzhou is more than West Lake and old poetry.",
        "Los Angeles is more than sunshine and freeways.",
        "Montreal is more than lake views, streetcars and distance.",
      ],
      paragraphs: [
        "It lives in someone new asking whether a neighborhood is good to live in, and in someone leaving the city selling furniture at a fair price.",
        "It lives in interview notes, weekend dinner invitations, housing guides, safety reminders, local events and answers from people who have been there.",
        "These voices are small, but real. They scatter across chats, social feeds, forums, friends and the uncertain first days in a new city.",
        "Machi gathers those scattered voices back together so a city's real experience stops being a pile of fragments.",
        "In Machi, you do not only see content. You see the life that is happening in a city right now.",
        "What keeps people in a city is not only an address. It is the sense of life they find there.",
      ],
      highlights: [
        ["Questions", "Is this neighborhood a good place to live?"],
        ["Experience", "Housing, banking, work and local warnings."],
        ["Opportunity", "Hiring, services, events and local deals."],
      ],
      echoLabel: "City Echo",
      echoNodes: ["Ask", "Share", "Be found", "Get answered"],
      closing: "Machi is where those voices can be seen, found and answered.",
    },
    founder: {
      eyebrow: "Founder",
      title: "Founder",
      name: "Yao Kai / YAOKAI",
      role: "Founder, Machi City",
      meta: "Came to Japan as an international student in October 2019",
      avatar: "Y",
      readMore: "Read the full founder story",
      bio: "Came to Japan to study in October 2019, and built Machi from his own experience of cross-border life and city migration.",
      quote: "“A city is not just a name on a map. It is where people live, search, meet, and begin again.”",
      paragraphs: [
        "Machi City was founded by Yao Kai / YAOKAI as an original project built from the ground up.",
        "In October 2019, Yao Kai came to Japan as an international student. Living in a new country and a new city, he quickly noticed a simple but real problem: the most useful information about everyday life is often scattered.",
        "Housing, part-time jobs, secondhand items, local services, city procedures, transportation, events, safety tips, and real experiences are spread across group chats, social platforms, local websites, friends, and different language environments.",
        "For someone arriving in a new city, finding accurate, useful, and trustworthy information is not always easy. For people already living there, sharing experiences, posting needs, and finding meaningful connections also lacks a clearer and more organized place.",
        "Machi City began from that experience and observation.",
        "Machi is not meant to be a cold information database, nor just another social product. It is built to organize the scattered pieces of city life by country, city, language, and content type — helping useful information, real experiences, needs, and connections be seen, found, and answered.",
        "The name Machi comes from the Japanese word “街 / まち.” It is not just a city name on a map, but the place where people actually live, meet, search, and begin again.",
        "Yao Kai’s idea is simple:",
      ],
      closing: "Make city information less scattered.\nMake unfamiliar places easier to live in.\nHelp more people find the echoes of life in every city.",
    },
    announcementsSection: {
      label: "Updates",
      title: "Latest from Machi.",
      body: "This is where we share product progress, launch city plans, test invitations, partnership openings and important notices from Machi.",
      manageHint: "Official public updates appear on this website.",
      manageLabel: "View all updates",
      composerTitle: "Publish update",
      titlePlaceholder: "Title, for example: Tokyo city channel is opening soon",
      bodyPlaceholder: "Write an announcement, notice or information update",
      publish: "Publish",
      empty: "Write an update before publishing.",
      saved: "Published to website updates.",
      tabs: ["Announcement", "News", "App Update", "Notice", "Info"],
      defaultItems: [
        { type: "Announcement", title: "Machi homepage is live", date: "2026.05", body: "The first website version now includes city showcases, content channels, trends, languages and business entry points." },
        { type: "News", title: "Tokyo / Japan closed beta begins", date: "2026.05", body: "Phase 1 focuses on Tokyo / Japan, Phase 2 opens Osaka, and later phases plan Los Angeles / Montreal / Shanghai / Hangzhou. Waitlist invites roll out by city phase." },
        { type: "App Update", title: "iOS / Android Beta 0.9 going to packaging", date: "2026.05", body: "Adds city channels, content languages, ranking and the merchant onboarding draft. Beta builds roll out to early waitlist users next week." },
        { type: "Notice", title: "Second wave of waitlist invites going out", date: "2026.05", body: "Waitlist users will receive early city opening notices and app test invitations." },
        { type: "Info", title: "Business partnership requests are open", date: "2026.05", body: "Local merchants, hiring teams, housing agents and service providers can submit partnership interest." },
      ],
    },
    citySection: {
      label: "Cities",
      title: "City phases, starting with Tokyo / Japan.",
      body: "Phase 1 focuses on Tokyo / Japan, Phase 2 opens Osaka, and later phases plan Los Angeles / Montreal / Shanghai / Hangzhou. City cards show beta sample data for channels, languages and social scenes.",
      badge: "Beta sample data",
      switcherLabel: "Current city",
      switcherActive: "Japan · Tokyo",
      switcherHint: "Switch to",
      switcherCities: ["Osaka", "Los Angeles", "Montreal", "Shanghai", "Hangzhou"],
      sampleNote: "Demo preview: posts, heat and city status shown here are beta sample data, not production metrics.",
    },
    featureSection: {
      label: "City channels",
      title: "Local information, opportunity and offline connection, organized by real city scenes.",
      body: "Machi organizes news, guides, social posts, meetups, dining, events, language exchange, housing, secondhand, jobs, hiring, Q&A, services and local tips by city and language.",
      groups: [
        {
          title: "City Info",
          description: "News, guides, Q&A and services for understanding everyday life in a city.",
          channels: ["news", "guides", "qa", "services"] as const,
        },
        {
          title: "Trade & opportunity",
          description: "Housing, secondhand, jobs, hiring and service leads.",
          channels: ["housing", "secondhand", "jobs", "hiring"] as const,
        },
        {
          title: "Social & Offline",
          description: "Local friends, dining buddies, event companions, language exchange and lived warnings.",
          channels: ["social", "meetups", "dining", "events", "language-exchange", "avoid"] as const,
        },
      ],
    },
    trendingSection: { label: "Trends", title: "See what is trending nearby.", subtitle: "Heat ranking uses likes, comments, saves, reposts and time decay to surface what matters in the city right now.", cardTitle: "Tokyo Trends", cardSubtitle: "City ranking", formulaTitle: "Heat formula", heatLabel: "Heat", formula: ["likes", "comments", "saves", "reposts"] },
    languageSection: { label: "Languages", title: "Built for multilingual cities.", body: "Users can switch the app language and choose content languages, such as Chinese content in Tokyo, Japanese content in Montreal or English content in Los Angeles.", chips: ["中文", "English", "日本語", "한국어", "Français", "Español"], contextTitle: "Language-aware ranking", contextLabel: "Recommendation context", regionLabel: "Current region", region: "Canada · Montreal", contentLanguageLabel: "Content language", contentLanguage: "Japanese", priorityLabel: "Priority", priority: ["Japanese content in Montreal", "Japanese content in Canada", "Global Japanese trending content", "High-heat Montreal content in other languages"] },
    useCaseSection: { label: "City moments", title: "Made for real life in a city." },
    businessSection: { label: "Business", title: "Businesses can do more than buy ads — they can enter local social scenes.", body: "Restaurants can promote dining events, local offers and group meetups. Language schools can reach language exchange users. Event organizers, gyms, studios, local services and recruiters can connect with real city-based demand.", primary: "Apply for partnership", secondary: "View ad plans", consoleLabel: "Business console", consoleTitle: "Tokyo social campaign", verified: "Verified business", partnerTitle: "Verified local partner", partnerBody: "Verification, social campaigns, leads and city channel operations.", campaigns: [["Restaurant meetup campaign", "Beta sample data"], ["Language school exchange group", "Beta sample data"], ["Hiring in city community", "Beta sample data"]] },
    safetySection: { label: "Safety", title: "Real connection needs real boundaries.", body: "Machi builds safety prompts, reporting, blocking, content review and account enforcement into social, meetup, dining, language exchange, housing, secondhand, hiring and business scenes." },
    download: { label: "Start with your city", title: "Download Machi", body: "Machi is preparing for closed beta. Phase 1 focuses on Tokyo / Japan, Phase 2 opens Osaka, and later phases plan Los Angeles / Montreal / Shanghai / Hangzhou. In Web Beta, you can use city home, discovery and search, notifications, messages, posting, profiles and local connections.", primary: "Join beta waitlist", secondary: "Find local connections", appStore: "iOS: Coming soon", googlePlay: "Android: Coming soon", webBeta: "Web Beta: Invite-only", formLabel: "Waitlist", formTitle: "Join the city beta waitlist", email: "Email", cityLabel: "Preferred city", languageLabel: "Language preference", intentLabel: "I want to use Machi for", cityOptions: ["Tokyo", "Osaka", "Los Angeles", "Montreal", "Shanghai", "Hangzhou", "Other city"], languageOptions: ["English", "中文", "日本語"], intentOptions: ["Local life info", "Finding friends", "Dining buddies", "Event companions", "Language exchange", "Housing", "Secondhand", "Jobs", "Hiring", "Business promotion", "Local services"], notify: "Join beta waitlist", sending: "Sending…", success: "You're on the Machi city beta waitlist. We'll notify you when your city opens, so you can discover local life and meet people nearby.", errorInvalid: "That email does not look right. Please double-check.", errorSubmit: "Could not submit just now. Please try again.", benefitsTitle: "What you will get", benefits: [["Web Beta invite", "Try city home, discovery, search, notifications, messages, posting and profiles first."], ["City opening notices", "Be first to know when Tokyo / Japan, Osaka and later city phases open."], ["Local connection entry", "Meet local friends, dining buddies, event companions and language exchange partners."]], privacy: "We only email you about launches and city openings. We never sell your email or sign you up for other lists." },
    faqSection: { label: "FAQ", title: "Questions before launch." },
    common: { open: "Open" },
    footer: { tagline: "Find the echoes of life in every city.", description: "Local questions, experience, opportunities and connections, seen and found. machicity.com", groups: [["Navigation", ["About", "Features", "Cities", "Business", "Safety", "Download"]], ["Partnership", ["Business", "Advertising", "Hiring promotion", "Housing promotion", "System partnership"]], ["Legal", ["Privacy Policy", "Terms of Service", "Safety", "Contact"]]] },
    cities: withCityTone([
      { name: "Tokyo", country: "Japan", description: "Housing warnings, dining plans, language exchange and local companions open first.", posts: "Housing · Dining · Language Exchange · Meetups", heat: "Closed beta · Waitlist open", status: "Closed beta · Waitlist open", sampleLabel: "Demo preview", languageTags: ["中文", "EN", "日本語"], sceneTags: ["Housing", "Dining", "Language Exchange", "Meetups"], highlight: "Shibuya, Shinjuku and bay-area life signals" },
      { name: "Osaka", country: "Japan", description: "Food, events, guides and local questions open in Phase 2.", posts: "Dining · Events · Guides · Q&A", heat: "Phase 2 · Waitlist open", status: "Phase 2 · Waitlist open", sampleLabel: "Beta sample data", languageTags: ["中文", "EN", "日本語"], sceneTags: ["Dining", "Events", "Guides", "Q&A"], highlight: "Umeda, Namba and everyday city scenes" },
      { name: "Montreal", country: "Canada", description: "Housing, jobs, multilingual Q&A and newcomer support are planned for a later phase.", posts: "Housing · Jobs · Multilingual Q&A · Meetups", heat: "Roadmap · Later phase", status: "Roadmap · Later phase", sampleLabel: "Beta sample data", languageTags: ["EN", "中文", "日本語"], sceneTags: ["Housing", "Jobs", "Q&A", "Meetups"], highlight: "Newcomer support and local help" },
    ]),
    features: withFeatureMeta([
      { title: "News", badge: "Local alerts", description: "Local news, policy updates, transport alerts and safety reminders." },
      { title: "Guides", badge: "Life tips", description: "Housing, visas, banking, mobile plans, job hunting and daily experience." },
      { title: "Social", badge: "Local people", description: "Meet local friends, new friends, city-based interest groups and mutual help." },
      { title: "Meetups", badge: "Companions", description: "Dining buddies, coffee companions, event companions, sports partners and weekend plans." },
      { title: "Dining", badge: "Tables", description: "Meals, coffee, restaurant visits, food groups and casual offline plans." },
      { title: "Events", badge: "Offline", description: "Exhibitions, city walks, classes, board games, sports and local gatherings." },
      { title: "Language Exchange", badge: "Languages", description: "Chinese, English, Japanese and multilingual learning partners." },
      { title: "Housing", badge: "Rentals", description: "Listings, sublets, shared homes, roommates and housing warnings." },
      { title: "Secondhand", badge: "Local resale", description: "Used goods, requests, moving sales and free giveaways." },
      { title: "Jobs", badge: "Careers", description: "Part-time, full-time, internships, remote work and job search stories." },
      { title: "Hiring", badge: "Open roles", description: "Local merchants, companies and organizations post hiring needs." },
      { title: "Q&A", badge: "Local help", description: "Questions about visas, housing, work, school and healthcare." },
      { title: "Services", badge: "Leads", description: "Moving, translation, visas, study abroad, insurance, repairs and tax." },
      { title: "Avoid", badge: "Local warnings", description: "Housing, transaction, hiring, meetup and offline safety tips." },
    ]),
    trendingPosts: [
      { title: "Tokyo housing guide", heat: "56.2K", category: "Housing" },
      { title: "Weekend dinner in Shinjuku", heat: "38.9K", category: "Dining" },
      { title: "Shibuya part-time hiring, Japanese N3+", heat: "21.6K", category: "Hiring" },
      { title: "Moving sale: secondhand furniture pickup", heat: "18.4K", category: "Secondhand" },
    ],
    useCases: [
      { title: "New to a city", description: "Read guides, find housing, set up essentials and look for work.", icon: "MapPinned" },
      { title: "Moving or leaving", description: "Sell secondhand items, sublet rooms and find moving services.", icon: "PackageOpen" },
      { title: "Looking for work", description: "Browse hiring, part-time jobs, referrals and interview tips.", icon: "BriefcaseBusiness" },
      { title: "Weekend plans", description: "Find dining, events, exhibitions and city walks.", icon: "Sparkles" },
      { title: "Need local help", description: "Ask questions and get experience from locals.", icon: "CircleHelp" },
      { title: "Local business", description: "Post deals, hiring and events to reach city users.", icon: "Store" },
    ],
    safetyItems: [
      { title: "Social safety", body: "Do not share your address, ID or financial details too early. Report or block harassment, scams and offensive content." },
      { title: "Meetup safety", body: "Meet in public first, tell a friend where you are going and keep communication records." },
      { title: "Dining safety", body: "Dining plans include prompts around public venues, group size, costs and leaving safely." },
      { title: "Language exchange safety", body: "Start in public spaces and avoid private spaces for a first meeting." },
      { title: "Housing safety", body: "Do not prepay unverified landlords. Check addresses, contracts and identities. Watch for below-market listings." },
      { title: "Secondhand safety", body: "Trade in public places, inspect high-value items in person and avoid large deposits." },
      { title: "Jobs & hiring safety", body: "Never pay job deposits. Check company websites, addresses and contacts. Beware high pay that asks for money first." },
      { title: "Business verification", body: "Verification and risk labels for local merchants, recruiters, housing providers and service teams." },
      { title: "Report and block", body: "Reporting, blocking, review, takedowns and account limits form the enforcement flow." },
      { title: "Community guidelines", body: "Rules cover harassment, hate, scams, impersonation, malicious advances, fake events and offline danger." },
    ],
    businessItems: ["Restaurant meetup campaign", "Language school exchange group", "Event organizer local participants", "Gym / class interest community", "Local service leads", "Hiring in city community"],
    faqs: [
      ["What is Machi?", "Machi is a community organised by city. It gathers the real-life experience of locals, newcomers and visitors — news, housing, work, dining, Q&A, what to avoid — by city, language, topic and trust."],
      ["How is Machi different?", "Most social apps show you who you follow. Machi shows you what is happening in a city — surfaced by language, topic, heat and the credibility of the people who lived it."],
      ["What content does Machi support?", "News, guides, secondhand, housing, jobs, hiring, companions, dining, events, Q&A, services, merchants and deals."],
      ["Does Machi support multiple languages?", "Yes. Users can switch app language and choose content languages."],
      ["Can businesses join?", "Yes. Future support includes verification, ads, hiring promotion, deal promotion and service leads."],
      ["Can I download it now?", "Machi is preparing for launch. Join the waitlist to receive updates."],
    ],
  },
  ja: {
    nav: {
      items: [["機能", "/features"], ["都市", "/cities"], ["お知らせ", "/#announcements"], ["ビジネス", "/business"], ["安全", "/safety"], ["ダウンロード", "/download"], ["概要", "/about"]],
      signIn: "ログイン",
      register: "登録",
      getApp: "アプリを入手",
      openMenu: "メニューを開く",
      closeMenu: "メニューを閉じる",
      language: "言語",
    },
    hero: {
      eyebrow: "ローカル生活 + 同城ソーシャル",
      titleTop: "Machi",
      titleBottom: "",
      headline: "すべての街で、暮らしの響きを見つける。",
      subtitle: "Machi は都市と言語で整理されたローカル生活・同城ソーシャルコミュニティです。街の情報を見つけ、同じ街の人ともつながれます。",
      supporting: "住まい、中古、仕事、求人、食事、イベント、Q&A、生活のコツ、地域サービスを見つけながら、同じ街の友達、食事仲間、イベント仲間、言語交換パートナーともつながれます。",
      primary: "都市ベータに参加",
      secondary: "同じ街のつながりを探す",
      tertiary: "創業者の理念",
      quaternary: "事業者提携を申請",
      appStoreCaption: "App Store · まもなく公開",
      appStore: "App Store",
      googlePlayCaption: "Google Play · まもなく公開",
      googlePlay: "Google Play",
      webBetaCaption: "Web Beta · 招待制",
      scrollLabel: "続きを見る",
      stats: [["Closed beta", "Tokyo / Japan → Osaka"], ["14", "都市チャンネル"], ["3", "中文 / EN / 日本語"]],
    },
    appMockup: {
      title: "街の鼓動",
      region: "日本 · 東京",
      search: "住まい、落とし穴、食事、中古を検索",
      hotTitle: "東京の鼓動",
      hotSubtitle: "いま起きていること",
      quickEntries: ["ニュース", "ガイド", "中古", "住まい", "仕事", "採用", "仲間", "食事"],
      hotItems: ["東京の住まい、避けたい落とし穴", "新宿の週末ごはん", "渋谷のアルバイト採用"],
      cards: [
        { type: "住まい", title: "東京の住まい、避けたい落とし穴", place: "新宿", heat: "56.2K" },
        { type: "食事", title: "新宿で週末ごはん", place: "新宿", heat: "38.9K" },
        { type: "採用", title: "渋谷のアルバイト採用", place: "渋谷", heat: "21.6K" },
      ],
    },
    brandIntro: {
      label: "Machi とは",
      title: "街ごとに、本物の経験が見つかる場所へ。",
      body: "Machi は、SNS・チャット・フォーラム・友人の会話に散らばっていた街の経験を、都市・言語・トピック・話題度・信頼できる経験者ごとに整理し直す、街のコミュニティです。",
      pillars: [
        ["都市を選ぶ", "国、地域、都市を選び、その街のリアルな鼓動に入る。"],
        ["本物の経験を見つける", "ニュース、住まい、仕事、中古、食事、イベント、Q&A、避けたい落とし穴。"],
        ["街の人とつながる", "そこに住む人の投稿・質問・回答を通じて、本当の街を知る。"],
      ],
    },
    brandStory: {
      label: "ブランドストーリー",
      title: "すべての街で、暮らしの響きを見つける。",
      lead: "都市は地図の上の名前だけではありません。本当の姿は、そこに暮らす人たちの日常の中にあります。",
      cityLines: [
        "東京は電車、ネオン、高層ビルだけではない。",
        "大阪は街並み、食べ物、人の流れだけではない。",
        "上海は外灘と夜景だけではない。",
        "杭州は西湖と江南だけではない。",
        "ロサンゼルスは太陽と高速道路だけではない。",
        "モントリオールは湖岸、ストリートカー、遠さだけではない。",
      ],
      paragraphs: [
        "新しく来た人が「このエリアは住みやすい？」と聞く声や、帰国前の人が家具を譲る投稿の中にあります。",
        "面接経験、週末の食事の誘い、住まいのガイド、注意喚起、地域イベント、誰かの回答の中にもあります。",
        "その声は小さいけれど、とても本物です。チャット、SNS、フォーラム、友人の間、そして新しい街で迷う時間に散らばっています。",
        "Machi は、その散らばった声をもう一度集め、地域の暮らしを断片的な情報で終わらせないための場所です。",
        "Machi で見えるのは、ただの投稿ではありません。今その都市で起きている暮らしです。",
        "人を都市にとどめるのは住所だけではなく、そこで見つける生活感です。",
      ],
      highlights: [
        ["質問", "このエリアは住みやすい？"],
        ["経験", "住まい、手続き、仕事、注意点。"],
        ["機会", "採用、サービス、イベント、お得情報。"],
      ],
      echoLabel: "街の響き",
      echoNodes: ["聞く", "分け合う", "見つかる", "届く"],
      closing: "Machi は、その声が見つかり、届き、返ってくる場所です。",
    },
    founder: {
      eyebrow: "創設者",
      title: "創設者",
      name: "姚凱 / YAOKAI",
      role: "Founder, Machi City",
      meta: "2019年10月に留学生として来日",
      avatar: "姚",
      readMore: "創設者のストーリーを読む",
      bio: "2019年10月に留学のため来日し、自身の国境を越えた生活体験から Machi を創設しました。",
      quote: "「街は地図上の名前ではなく、人が暮らし、探し、出会い、また始める場所です。」",
      paragraphs: [
        "Machi City は、姚凱 / YAOKAI によってゼロから立ち上げられたオリジナルプロジェクトです。",
        "2019年10月、姚凱は留学生として日本に来ました。新しい国、新しい街で暮らし始めたとき、彼はひとつの現実的な課題に気づきました。日々の生活に本当に役立つ情報は、いつも分かりやすく一か所にまとまっているわけではないということです。",
        "住まい、アルバイト、中古品、地域サービス、手続き、交通、イベント、防災情報、生活の経験は、グループチャット、SNS、地域サイト、友人との会話、そして異なる言語環境の中に散らばっています。",
        "新しい街に来た人にとって、正確で役立つ情報を見つけることは簡単ではありません。すでにその街で暮らしている人にとっても、経験を共有したり、必要なことを投稿したり、つながりを見つけたりするための、より分かりやすく整理された場所はまだ十分ではありません。",
        "Machi City は、そうした経験と気づきから始まりました。",
        "Machi は、冷たい情報データベースでも、単なるソーシャルプロダクトでもありません。街の中に散らばる生活情報、経験、必要なこと、人とのつながりを、国・都市・言語・内容ごとに整理するためのローカルライフプラットフォームです。",
        "Machi は日本語の「街 / まち」に由来します。それは地図上の都市名ではなく、人が実際に暮らし、出会い、探し、また始める場所を意味します。",
        "姚凱の理念はシンプルです。",
      ],
      closing: "街の情報をもっと見つけやすくすること。\n知らない場所でも生活を始めやすくすること。\nすべての街で、暮らしのこだまを見つけられるようにすること。",
    },
    announcementsSection: { label: "お知らせ", title: "Machi 最新のお知らせ。", body: "プロダクトの進捗、都市フェーズ計画、テスト招待、提携受付、重要なお知らせをここで共有します。", manageHint: "公式の公開情報はこのサイトでお知らせします。", manageLabel: "すべてのお知らせ", composerTitle: "情報を公開", titlePlaceholder: "タイトル例：東京チャンネルまもなく公開", bodyPlaceholder: "公告、通知、情報の本文を書く", publish: "公開", empty: "内容を書いてから公開してください。", saved: "公式サイトのお知らせに公開しました。", tabs: ["公告", "ニュース", "アプリ更新", "通知", "情報"], defaultItems: [{ type: "公告", title: "Machi 公式サイトを公開", date: "2026.05", body: "初版サイトは都市紹介、チャンネル、トレンド、多言語、ビジネス窓口に対応しました。" }, { type: "ニュース", title: "Tokyo / Japan クローズドベータ開始", date: "2026.05", body: "第1段階は Tokyo / Japan、第2段階は Osaka、その後 Los Angeles / Montreal / Shanghai / Hangzhou を計画しています。ウェイトリスト招待は都市フェーズごとに順次送付します。" }, { type: "アプリ更新", title: "iOS / Android Beta 0.9 のビルド準備", date: "2026.05", body: "都市チャンネル、コンテンツ言語、トレンド、店舗オンボーディング下書きを追加。来週からウェイトリスト初期ユーザーに配布予定。" }, { type: "通知", title: "ウェイトリストの第二弾招待を順次送付", date: "2026.05", body: "ウェイトリスト登録者には都市公開とテスト招待を優先してお知らせします。" }, { type: "情報", title: "ビジネス提携の受付を開始", date: "2026.05", body: "店舗、採用担当、不動産、地域サービス事業者は提携希望を送信できます。" }] },
    citySection: {
      label: "都市",
      title: "都市フェーズは Tokyo / Japan から。",
      body: "第1段階は Tokyo / Japan、第2段階は Osaka、その後 Los Angeles / Montreal / Shanghai / Hangzhou を計画しています。都市カードはチャンネル、言語、ソーシャルシーンのベータサンプルです。",
      badge: "Beta sample data",
      switcherLabel: "現在の都市",
      switcherActive: "日本 · 東京",
      switcherHint: "切り替え",
      switcherCities: ["Osaka", "Los Angeles", "Montreal", "Shanghai", "Hangzhou"],
      sampleNote: "Demo preview：投稿、熱度、都市ステータスはベータサンプルであり、実際の運用データではありません。",
    },
    featureSection: {
      label: "都市チャンネル",
      title: "地域情報、機会、オフラインのつながりを、街のシーンごとに整理。",
      body: "ニュース、ガイド、ソーシャル、仲間募集、食事、イベント、言語交換、住まい、中古、仕事、求人、Q&A、サービス、注意情報を都市と言語で整理します。",
      groups: [
        {
          title: "City Info",
          description: "ニュース、ガイド、Q&A、サービスで街の暮らしを理解する。",
          channels: ["news", "guides", "qa", "services"] as const,
        },
        {
          title: "取引と機会",
          description: "住まい、中古、求職、採用、サービスリード。",
          channels: ["housing", "secondhand", "jobs", "hiring"] as const,
        },
        {
          title: "Social & Offline",
          description: "友達、食事仲間、イベント仲間、言語交換、生活上の注意を見つける。",
          channels: ["social", "meetups", "dining", "events", "language-exchange", "avoid"] as const,
        },
      ],
    },
    trendingSection: { label: "トレンド", title: "近くで話題のことを見る。", subtitle: "熱度はいいね、コメント、保存、再投稿、時間減衰をもとに、今その都市で注目すべき内容を表示します。", cardTitle: "東京トレンド", cardSubtitle: "都市ランキング", formulaTitle: "熱度の式", heatLabel: "熱度", formula: ["いいね", "コメント", "保存", "再投稿"] },
    languageSection: { label: "多言語", title: "多言語都市のために。", body: "アプリ言語だけでなく、コンテンツ言語も選べます。東京で中国語の投稿、モントリオールで日本語の投稿、ロサンゼルスで英語の投稿を探せます。", chips: ["中文", "English", "日本語", "한국어", "Français", "Español"], contextTitle: "多言語レコメンド", contextLabel: "推薦コンテキスト", regionLabel: "現在の地域", region: "カナダ · モントリオール", contentLanguageLabel: "コンテンツ言語", contentLanguage: "日本語", priorityLabel: "優先表示", priority: ["モントリオールの日本語投稿", "カナダの日本語投稿", "全体の日本語トレンド", "モントリオールの他言語高熱度投稿"] },
    useCaseSection: { label: "街のシーン", title: "本物の街の暮らしのために。" },
    businessSection: { label: "ビジネス", title: "広告だけでなく、地域のソーシャルシーンへ。", body: "レストランは食事会、特典、地域イベントを届けられます。語学学校は言語交換ユーザーへ、イベント主催者・ジム・教室・地域サービス・採用担当は都市ベースの需要につながれます。", primary: "提携を申し込む", secondary: "広告プランを見る", consoleLabel: "ビジネス管理", consoleTitle: "東京ソーシャルキャンペーン", verified: "認証店舗", partnerTitle: "認証ローカルパートナー", partnerBody: "認証、ソーシャル施策、リード、都市チャンネル運営。", campaigns: [["Restaurant meetup campaign", "Beta sample data"], ["Language school exchange group", "Beta sample data"], ["Hiring in city community", "Beta sample data"]] },
    safetySection: { label: "安全", title: "Real connection needs real boundaries.", body: "ソーシャル、対面、食事、言語交換、住まい、中古、求人、事業者シーンに、安全通知・通報・ブロック・審査・アカウント制限を組み込みます。" },
    download: { label: "都市から始めよう", title: "Machi をダウンロード", body: "Machi はクローズドベータを準備中です。第1段階は Tokyo / Japan、第2段階は Osaka、その後 Los Angeles / Montreal / Shanghai / Hangzhou を計画しています。Web Beta では、都市ホーム、発見と検索、通知、メッセージ、投稿、プロフィール、同じ街のつながりを利用できます。", primary: "ベータに参加", secondary: "同じ街のつながりを探す", appStore: "iOS：近日公開", googlePlay: "Android：近日公開", webBeta: "Web Beta：招待制", formLabel: "ウェイトリスト", formTitle: "都市ベータに参加", email: "Email", cityLabel: "Preferred city", languageLabel: "Language preference", intentLabel: "I want to use Machi for", cityOptions: ["Tokyo", "Osaka", "Los Angeles", "Montreal", "Shanghai", "Hangzhou", "その他の都市"], languageOptions: ["日本語", "English", "中文"], intentOptions: ["ローカル生活情報", "友達を作る", "食事仲間を探す", "イベント仲間を探す", "言語交換", "住まい", "中古", "仕事探し", "求人", "事業者プロモーション", "地域サービス"], notify: "ベータに参加", sending: "送信中…", success: "Machi の都市ベータウェイトリストに登録されました。あなたの都市で公開されたらお知らせします。ローカル情報を見つけ、同じ街の人ともつながれます。", errorInvalid: "メールアドレスの形式を確認してください。", errorSubmit: "送信に失敗しました。時間をおいて再度お試しください。", benefitsTitle: "登録後に受け取れる内容", benefits: [["Web Beta 招待", "都市ホーム、発見、検索、通知、メッセージ、投稿、プロフィールを先行体験。"], ["都市公開通知", "Tokyo / Japan、Osaka、その後の都市フェーズ公開を最速でお知らせ。"], ["同じ街のつながり", "友達、食事仲間、イベント仲間、言語交換パートナーを見つける入口。"]], privacy: "ローンチと都市公開以外でメールは送りません。メールアドレスを販売することも、他のリストに登録することもありません。" },
    faqSection: { label: "よくある質問", title: "ローンチ前に知りたいこと。" },
    common: { open: "開く" },
    footer: { tagline: "すべての街で、暮らしの響きを見つける。", description: "街の質問、経験、機会、つながりが見つかる場所。machicity.com", groups: [["ナビ", ["概要", "機能", "都市", "ビジネス", "安全", "ダウンロード"]], ["提携", ["店舗提携", "広告掲載", "採用プロモーション", "住まいプロモーション", "システム提携"]], ["法務", ["プライバシー", "利用規約", "安全", "お問い合わせ"]]] },
    cities: withCityTone([{ name: "Tokyo", country: "Japan", description: "住まいの注意、食事、言語交換、仲間募集から先行テスト。", posts: "Housing · Dining · Language Exchange · Meetups", heat: "Closed beta · Waitlist open", status: "Closed beta · Waitlist open", sampleLabel: "Demo preview", languageTags: ["中文", "EN", "日本語"], sceneTags: ["Housing", "Dining", "Language Exchange", "Meetups"], highlight: "渋谷、新宿、湾岸の暮らし" }, { name: "Osaka", country: "Japan", description: "食事、イベント、ガイド、地域の相談を第2段階で公開予定。", posts: "Dining · Events · Guides · Q&A", heat: "Phase 2 · Waitlist open", status: "Phase 2 · Waitlist open", sampleLabel: "Beta sample data", languageTags: ["中文", "EN", "日本語"], sceneTags: ["Dining", "Events", "Guides", "Q&A"], highlight: "梅田、難波、日常の街のシーン" }, { name: "Montreal", country: "Canada", description: "住まい、仕事、多言語 Q&A、新しい街での生活サポートは後続フェーズで計画中。", posts: "Housing · Jobs · Multilingual Q&A · Meetups", heat: "Roadmap · Later phase", status: "Roadmap · Later phase", sampleLabel: "Beta sample data", languageTags: ["EN", "中文", "日本語"], sceneTags: ["Housing", "Jobs", "Q&A", "Meetups"], highlight: "新しい街での生活サポート" }]),
    features: withFeatureMeta([{ title: "ニュース", badge: "News", description: "地域ニュース、制度、交通、安全のお知らせ。" }, { title: "ガイド", badge: "Guides", description: "住まい、ビザ、銀行、携帯、手続き、生活経験。" }, { title: "ソーシャル", badge: "Social", description: "同じ街の友達、新しい友達、都市別の趣味グループ。" }, { title: "仲間募集", badge: "Meetups", description: "食事仲間、カフェ仲間、イベント仲間、スポーツ仲間、週末の予定。" }, { title: "食事", badge: "Dining", description: "食事、カフェ、店巡り、気軽なオフラインの集まり。" }, { title: "イベント", badge: "Events", description: "展示、Citywalk、講座、ボードゲーム、運動、交流会。" }, { title: "言語交換", badge: "Language Exchange", description: "中国語、英語、日本語などの言語交換パートナー。" }, { title: "住まい", badge: "Housing", description: "物件、サブリース、シェア、ルームメイト、注意点。" }, { title: "中古", badge: "Secondhand", description: "不要品、探し物、引越しセール、無料譲渡。" }, { title: "仕事探し", badge: "Jobs", description: "アルバイト、正社員、インターン、リモート、経験談。" }, { title: "求人", badge: "Hiring", description: "地域店舗、企業、団体が求人と業界コミュニティを公開。" }, { title: "Q&A", badge: "Q&A", description: "ビザ、住まい、仕事、学校、医療などの相談。" }, { title: "サービス", badge: "Services", description: "引越し、翻訳、ビザ、留学、保険、修理、税務。" }, { title: "注意情報", badge: "Avoid", description: "住まい、取引、求人、イベント、対面のリスク提醒。" }]),
    trendingPosts: [{ title: "東京の住まいガイド", heat: "56.2K", category: "住まい" }, { title: "新宿で週末ごはん", heat: "38.9K", category: "食事" }, { title: "渋谷のアルバイト採用、日本語 N3 以上", heat: "21.6K", category: "採用" }, { title: "引越し中古家具、格安引き取り", heat: "18.4K", category: "中古" }],
    useCases: [{ title: "新しい都市に来た時", description: "ガイド、住まい、手続き、仕事探し。", icon: "MapPinned" }, { title: "引越しや帰国", description: "中古出品、転貸、引越しサービス探し。", icon: "PackageOpen" }, { title: "仕事を探す", description: "採用、アルバイト、紹介、面接経験。", icon: "BriefcaseBusiness" }, { title: "週末に出かけたい", description: "食事、イベント、展示、Citywalk。", icon: "Sparkles" }, { title: "困った時", description: "質問して地域ユーザーの経験を得る。", icon: "CircleHelp" }, { title: "地域ビジネス", description: "割引、採用、イベントを都市ユーザーへ。", icon: "Store" }],
    safetyItems: [
      { title: "Social safety", body: "住所、身分証、財務情報を早く共有しない。嫌がらせ、詐欺、攻撃的な内容は通報・ブロックできます。" },
      { title: "Meetup safety", body: "初回は公共の場所を選び、友人に場所を伝え、やり取りを残します。" },
      { title: "Dining safety", body: "食事会では公共の場所、人数、費用、退出しやすさを確認します。" },
      { title: "Language exchange safety", body: "言語交換はまず公共空間で。初回から個人宅などには行かないよう促します。" },
      { title: "Housing safety", body: "未確認の貸主へ前払いしない。住所、契約、本人確認を行い、相場より安すぎる物件に注意します。" },
      { title: "Secondhand safety", body: "公共の場所で取引し、高額品は対面で確認。大きな前金は避けます。" },
      { title: "Jobs & hiring safety", body: "入職保証金を払わない。会社サイト、住所、連絡先を確認し、先払いを求める高収入求人に注意します。" },
      { title: "Business verification", body: "店舗、採用、不動産、サービス事業者に認証とリスク表示を用意します。" },
      { title: "Report and block", body: "通報、ブロック、審査、削除、アカウント制限までの流れを整備します。" },
      { title: "Community guidelines", body: "嫌がらせ、ヘイト、詐欺、なりすまし、悪質な誘い、虚偽イベント、危険な対面行為を禁止します。" },
    ],
    businessItems: ["Restaurant meetup campaign", "Language school exchange group", "Event organizer local participants", "Gym / class interest community", "Local service leads", "Hiring in city community"],
    faqs: [["Machi とは？", "Machi は、街ごとに整理されたリアル経験のコミュニティです。SNS・チャット・フォーラムに散らばっていた街の経験を、都市・言語・トピック・話題度・信頼できる経験者ごとに整理し直します。"], ["普通の SNS と何が違う？", "普通の SNS はフォロー関係で投稿を見せます。Machi は街で今起きていることを、言語・トピック・話題度・経験者の信頼度で見せます。"], ["どんな内容に対応しますか？", "ニュース、ガイド、中古、住まい、仕事、採用、仲間、食事、イベント、質問、サービス、店舗、お得情報などです。"], ["多言語に対応しますか？", "対応します。アプリ言語とコンテンツ言語を選べます。"], ["店舗は参加できますか？", "参加できます。認証、広告、採用促進、割引促進、サービスリードに対応予定です。"], ["今ダウンロードできますか？", "Machi はローンチ準備中です。ウェイトリストで最新情報を受け取れます。"]],
  },
} satisfies Record<MarketingLocale, {
  nav: { items: Array<[string, string]>; signIn: string; register: string; getApp: string; openMenu: string; closeMenu: string; language: string };
  hero: { eyebrow: string; titleTop: string; titleBottom: string; headline: string; subtitle: string; supporting: string; primary: string; secondary: string; tertiary: string; quaternary: string; appStoreCaption: string; appStore: string; googlePlayCaption: string; googlePlay: string; webBetaCaption: string; scrollLabel: string; stats: Array<[string, string]> };
  appMockup: { title: string; region: string; search: string; hotTitle: string; hotSubtitle: string; quickEntries: string[]; hotItems: string[]; cards: Array<{ type: string; title: string; place: string; heat: string }> };
  brandIntro: { label: string; title: string; body: string; pillars: Array<[string, string]> };
  brandStory: { label: string; title: string; lead: string; cityLines: string[]; paragraphs: string[]; highlights: Array<[string, string]>; echoLabel: string; echoNodes: string[]; closing: string };
  announcementsSection: { label: string; title: string; body: string; manageHint: string; manageLabel: string; composerTitle: string; titlePlaceholder: string; bodyPlaceholder: string; publish: string; empty: string; saved: string; tabs: string[]; defaultItems: Announcement[] };
  citySection: {
    label: string;
    title: string;
    body: string;
    badge: string;
    switcherLabel: string;
    switcherActive: string;
    switcherHint: string;
    switcherCities: string[];
    sampleNote: string;
  };
  featureSection: {
    label: string;
    title: string;
    body: string;
    groups: Array<{
      title: string;
      description: string;
      channels: readonly string[];
    }>;
  };
  trendingSection: { label: string; title: string; subtitle: string; cardTitle: string; cardSubtitle: string; formulaTitle: string; heatLabel: string; formula: string[] };
  languageSection: { label: string; title: string; body: string; chips: string[]; contextTitle: string; contextLabel: string; regionLabel: string; region: string; contentLanguageLabel: string; contentLanguage: string; priorityLabel: string; priority: string[] };
  useCaseSection: { label: string; title: string };
  businessSection: { label: string; title: string; body: string; primary: string; secondary: string; consoleLabel: string; consoleTitle: string; verified: string; partnerTitle: string; partnerBody: string; campaigns: Array<[string, string]> };
  safetySection: { label: string; title: string; body: string };
  founder: { eyebrow: string; title: string; name: string; role: string; meta: string; avatar: string; readMore: string; bio: string; quote: string; paragraphs: string[]; closing: string };
  download: {
    label: string;
    title: string;
    body: string;
    primary: string;
    secondary: string;
    appStore: string;
    googlePlay: string;
    webBeta: string;
    formLabel: string;
    formTitle: string;
    email: string;
    cityLabel: string;
    languageLabel: string;
    intentLabel: string;
    cityOptions: string[];
    languageOptions: string[];
    intentOptions: string[];
    notify: string;
    sending: string;
    success: string;
    errorInvalid: string;
    errorSubmit: string;
    benefitsTitle: string;
    benefits: [string, string][];
    privacy: string;
  };
  faqSection: { label: string; title: string };
  common: { open: string };
  footer: { tagline: string; description: string; groups: Array<[string, string[]]> };
  cities: City[];
  features: FeatureChannel[];
  trendingPosts: TrendingPost[];
  useCases: UseCase[];
  safetyItems: SafetyItem[];
  businessItems: string[];
  faqs: Array<[string, string]>;
}>;
