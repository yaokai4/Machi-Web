export type MarketingLocale = "zh" | "en" | "ja";

export type City = {
  name: string;
  country: string;
  description: string;
  posts: string;
  heat: string;
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
  ["secondhand", "Repeat2", "amber"],
  ["housing", "Home", "yellow"],
  ["jobs", "BriefcaseBusiness", "purple"],
  ["hiring", "UserRoundPlus", "violet"],
  ["mate", "Handshake", "emerald"],
  ["dining", "Utensils", "rose"],
  ["events", "CalendarDays", "orange"],
  ["qa", "MessageCircleQuestion", "slate"],
  ["services", "Wrench", "green"],
  ["deals", "BadgePercent", "red"],
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
      eyebrow: "Machi City · 城市经验网络",
      titleTop: "Machi",
      titleBottom: "City",
      headline: "在每一座城市，找到生活的回声。",
      subtitle: "切换国家和城市，发现当地新闻、租房、二手、工作、约饭、活动、问答和避坑经验。把散落的城市信息重新整理，让问题、经验和机会被看见、被找到、被回应。",
      supporting: "Machi City 是按城市组织真实生活经验的城市社区。",
      primary: "加入等待名单",
      secondary: "探索城市",
      tertiary: "商家合作",
      appStoreCaption: "App Store · 即将上线",
      appStore: "App Store",
      googlePlayCaption: "Google Play · 即将上线",
      googlePlay: "Google Play",
      scrollLabel: "继续浏览",
      stats: [
        ["12", "城市频道"],
        ["8+", "首批城市"],
        ["3", "官网语言"],
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
      body: "Machi City 把散落在群聊、社交平台、论坛和朋友之间的城市经验，按城市、语言、话题、热度和可信经验重新整理，连接生活在这里、关注这里或即将前往这里的人。",
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
        "多伦多不只是湖岸、街车和远方。",
      ],
      paragraphs: [
        "它藏在一个刚搬来的人问：这个区适合住吗？也藏在准备回国的人说：这些家具低价出。",
        "它藏在找工作的人分享面试经验，周末想约饭的人发出邀请，也藏在一篇租房攻略、一条避坑提醒、一场活动、一次回答里。",
        "这些声音很小，却很真实。它们散落在群聊、社交平台、论坛和朋友之间，也散落在每个人刚到一座城市时的迷茫和寻找里。",
        "Machi City 想做的，是把这些散落的声音重新汇聚起来，让城市经验不再只是零散的信息。",
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
    announcementsSection: {
      label: "公告中心",
      title: "Machi City 最新公告。",
      body: "这里会同步 Machi City 的产品进展、首批城市计划、测试邀请、合作开放和重要通知。我们会持续把最值得关注的信息放在这里。",
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
        { type: "公告", title: "Machi City 官网首页上线", date: "2026.05", body: "首版官网已支持城市展示、内容频道、热榜、多语言和商家合作入口。" },
        { type: "新闻", title: "首批城市内测开放", date: "2026.05", body: "东京、洛杉矶、多伦多三座城市开放内测频道，等待名单用户已陆续收到邀请。" },
        { type: "App 更新", title: "iOS / Android Beta 0.9 进入打包", date: "2026.05", body: "新增城市频道、内容语言、热榜、商家入驻草稿。下一周开始向首批等待名单用户发放测试包。" },
        { type: "通知", title: "等待名单进入第二批邀请", date: "2026.05", body: "等待名单用户将优先收到城市开放和 App 测试邀请。" },
        { type: "信息", title: "商家合作通道开放预约", date: "2026.05", body: "本地商家、招聘方、房产中介和服务商可以提前提交合作需求。" },
      ],
    },
    citySection: {
      label: "城市",
      title: "一个 App，连接每座城市。",
      body: "从东京到洛杉矶，从杭州到多伦多，Machi City 让每座城市都有自己的生活入口。",
      badge: "全球城市网络",
      switcherLabel: "当前城市",
      switcherActive: "日本 · 东京",
      switcherHint: "可切换",
      switcherCities: ["洛杉矶", "多伦多", "上海", "杭州"],
    },
    featureSection: {
      label: "城市频道",
      title: "把散落的城市信息重新整理。",
      body: "新闻、攻略、二手、租房、工作、活动、服务和优惠，按城市、语言和话题清晰归类。",
      groups: [
        {
          title: "生活信息",
          description: "看懂这座城市正在发生什么。",
          channels: ["news", "guides", "qa", "services"] as const,
        },
        {
          title: "交易与机会",
          description: "租房、二手、找工作、招聘和服务线索。",
          channels: ["housing", "secondhand", "jobs", "hiring"] as const,
        },
        {
          title: "线下连接",
          description: "约饭、搭子、活动和本地商家优惠。",
          channels: ["dining", "mate", "events", "deals"] as const,
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
      body: "用户不仅可以切换 App 语言，也可以选择内容语言。比如在东京查看中文内容，在多伦多查看日语内容，在洛杉矶查看英文内容。",
      chips: ["中文", "English", "日本語", "한국어", "Français", "Español"],
      contextTitle: "多语言推荐",
      contextLabel: "推荐上下文",
      regionLabel: "当前地区",
      region: "加拿大 · 多伦多",
      contentLanguageLabel: "内容语言",
      contentLanguage: "日本語",
      priorityLabel: "优先展示",
      priority: ["多伦多日语内容", "加拿大日语内容", "全站日语热门内容", "多伦多其他语言高热度内容"],
    },
    useCaseSection: {
      label: "城市经验",
      title: "为真实城市生活而设计。",
    },
    businessSection: {
      label: "商家合作",
      title: "让本地用户发现你的店铺、服务、招聘和优惠。",
      body: "Machi City 为本地商家、招聘方、房产中介、留学机构、服务商和活动方提供城市曝光入口。",
      primary: "申请合作",
      secondary: "查看广告方案",
      consoleLabel: "商家后台",
      consoleTitle: "东京推广计划",
      verified: "商家认证",
      partnerTitle: "认证本地合作方",
      partnerBody: "认证、曝光、线索和城市频道运营。",
      campaigns: [
        ["东京招聘频道广告", "42.8K 次曝光"],
        ["租房置顶", "18 条有效线索"],
        ["优惠推广", "2.4K 次收藏"],
      ],
    },
    safetySection: {
      label: "安全",
      title: "让城市里的连接更可信。",
      body: "Machi City 为二手、租房、招聘、搭子、约饭、服务等场景预留安全提醒、举报、审核和认证机制，让真实经验有边界、有依据。",
    },
    download: {
      label: "从你的城市开始",
      title: "从你的城市开始。",
      body: "下载 Machi，选择国家和城市，看到那座城市正在发生的生活。Machi 正在准备上线，现在可以加入等待名单，第一时间获得发布提醒。",
      primary: "加入等待名单",
      secondary: "获取上线通知",
      appStore: "App Store 筹备中",
      googlePlay: "Google Play 筹备中",
      formLabel: "等待名单",
      formTitle: "获取通知",
      email: "输入邮箱",
      notify: "通知我",
      sending: "正在提交…",
      success: "已加入等待名单，我们会在上线时通知你。",
      errorInvalid: "邮箱格式不正确，请检查后重试。",
      errorSubmit: "提交失败，请稍后再试。",
      benefitsTitle: "加入后你会收到",
      benefits: [
        ["首批城市开放通知", "东京、洛杉矶、多伦多上线第一时间提醒"],
        ["App 测试包内测邀请", "iOS / Android Beta 优先发放给等待名单用户"],
        ["商家合作早鸟通道", "本地商家、招聘方、房产可申请认证早鸟权益"],
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
      { name: "东京", country: "日本", description: "租房、二手、工作、约饭都在这里", posts: "24.8K 条本地内容", heat: "热度上升 92%" },
      { name: "大阪", country: "日本", description: "关西生活、兼职和周末活动入口", posts: "12.6K 条本地内容", heat: "热度上升 76%" },
      { name: "上海", country: "中国", description: "城市攻略、商家优惠和热门问答", posts: "31.4K 条本地内容", heat: "热度上升 88%" },
      { name: "杭州", country: "中国", description: "工作机会、租房信息和本地服务", posts: "18.2K 条本地内容", heat: "热度上升 81%" },
      { name: "洛杉矶", country: "美国", description: "留学、找房、活动和华人生活动态", posts: "27.9K 条本地内容", heat: "热度上升 85%" },
      { name: "多伦多", country: "加拿大", description: "多语言社区、租房、工作和城市活动", posts: "16.8K 条本地内容", heat: "热度上升 78%" },
      { name: "伦敦", country: "英国", description: "求职经验、二手交易和周末去处", posts: "22.1K 条本地内容", heat: "热度上升 79%" },
      { name: "悉尼", country: "澳大利亚", description: "租房、工作、探店和户外搭子", posts: "14.5K 条本地内容", heat: "热度上升 73%" },
    ]),
    features: withFeatureMeta([
      { title: "新闻", badge: "本地快讯", description: "本地快讯、政策提醒、交通提醒、安全提醒。" },
      { title: "攻略", badge: "生活经验", description: "租房、签证、银行卡、手机卡、找工作和生活经验。" },
      { title: "二手", badge: "闲置交易", description: "闲置转让、求购、搬家甩卖、免费赠送。" },
      { title: "租房", badge: "找房合租", description: "找房、转租、合租、找室友、租房避坑。" },
      { title: "工作", badge: "求职经验", description: "兼职、全职、实习、远程、求职经验。" },
      { title: "招聘", badge: "本地岗位", description: "本地商家、企业、机构发布招聘。" },
      { title: "搭子", badge: "兴趣连接", description: "学习、运动、摄影、语言交换、游戏搭子。" },
      { title: "约饭", badge: "城市饭局", description: "约饭、咖啡、探店、周末饭局。" },
      { title: "活动", badge: "线下聚会", description: "展览、Citywalk、桌游、运动、线下聚会。" },
      { title: "问答", badge: "本地求助", description: "签证、租房、工作、学校、医疗等本地求助。" },
      { title: "服务", badge: "服务线索", description: "搬家、翻译、签证、留学、保险、维修、报税。" },
      { title: "优惠", badge: "本地折扣", description: "本地商家折扣、团购、限时优惠。" },
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
    safetyItems: ["举报和审核", "拉黑和隐私", "内容安全", "交易提醒", "活动安全提示", "商家认证", "防诈骗提醒"],
    businessItems: ["商家认证", "城市广告", "招聘推广", "租房推广", "优惠推广", "活动推广", "服务线索"],
    faqs: [
      ["Machi City 是什么？", "Machi City 是一个按城市组织真实生活经验的社区。它把散落在群聊、社交平台和朋友之间的城市经验，按城市、语言、话题、热度和可信经验重新整理。"],
      ["Machi 和普通社交 App 有什么不同？", "普通社交 App 按关注关系展示内容，Machi City 按城市、语言、话题和经验可信度组织信息，让你看到一座城市正在发生什么。"],
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
      eyebrow: "Machi City · A city experience network",
      titleTop: "Machi",
      titleBottom: "City",
      headline: "Find the echoes of life in every city.",
      subtitle: "Switch country and city to discover local news, housing, secondhand, jobs, dining, events, Q&A and hard-earned tips. We gather the scattered city stories so questions, experience and opportunities can be seen, found and answered.",
      supporting: "Machi City is a community organised by city — real life experience, not classifieds.",
      primary: "Join waitlist",
      secondary: "Explore cities",
      tertiary: "For business",
      appStoreCaption: "App Store · Coming soon",
      appStore: "App Store",
      googlePlayCaption: "Google Play · Coming soon",
      googlePlay: "Google Play",
      scrollLabel: "Continue",
      stats: [
        ["12", "city channels"],
        ["8+", "launch cities"],
        ["3", "site languages"],
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
      label: "What is Machi City",
      title: "A city experience network — not a classifieds board.",
      body: "Machi City gathers what usually scatters across chats, social feeds, forums and friends, and re-organises it by city, language, topic, heat and trustworthy experience — so locals, newcomers and people moving in can all find the same pulse.",
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
        "Toronto is more than lake views, streetcars and distance.",
      ],
      paragraphs: [
        "It lives in someone new asking whether a neighborhood is good to live in, and in someone leaving the city selling furniture at a fair price.",
        "It lives in interview notes, weekend dinner invitations, housing guides, safety reminders, local events and answers from people who have been there.",
        "These voices are small, but real. They scatter across chats, social feeds, forums, friends and the uncertain first days in a new city.",
        "Machi City gathers those scattered voices back together so a city's real experience stops being a pile of fragments.",
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
    announcementsSection: {
      label: "Updates",
      title: "Latest from Machi City.",
      body: "This is where we share product progress, launch city plans, test invitations, partnership openings and important notices from Machi City.",
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
        { type: "Announcement", title: "Machi City homepage is live", date: "2026.05", body: "The first website version now includes city showcases, content channels, trends, languages and business entry points." },
        { type: "News", title: "First-batch cities enter closed beta", date: "2026.05", body: "Tokyo, Los Angeles and Toronto are live in closed beta. Waitlist users have started receiving invites." },
        { type: "App Update", title: "iOS / Android Beta 0.9 going to packaging", date: "2026.05", body: "Adds city channels, content languages, ranking and the merchant onboarding draft. Beta builds roll out to early waitlist users next week." },
        { type: "Notice", title: "Second wave of waitlist invites going out", date: "2026.05", body: "Waitlist users will receive early city opening notices and app test invitations." },
        { type: "Info", title: "Business partnership requests are open", date: "2026.05", body: "Local merchants, hiring teams, housing agents and service providers can submit partnership interest." },
      ],
    },
    citySection: {
      label: "Cities",
      title: "One app. Every city.",
      body: "From Tokyo to Los Angeles, Hangzhou to Toronto, Machi City gives every city its own local entry.",
      badge: "Global city network",
      switcherLabel: "Current city",
      switcherActive: "Japan · Tokyo",
      switcherHint: "Switch to",
      switcherCities: ["Los Angeles", "Toronto", "Shanghai", "Hangzhou"],
    },
    featureSection: {
      label: "City channels",
      title: "Scattered city info, reorganised.",
      body: "News, guides, housing, jobs, secondhand, dining, events, Q&A and offers — grouped by city, language and topic so what matters surfaces first.",
      groups: [
        {
          title: "City information",
          description: "Understand what is happening in this city.",
          channels: ["news", "guides", "qa", "services"] as const,
        },
        {
          title: "Trade & opportunity",
          description: "Housing, secondhand, jobs, hiring and service leads.",
          channels: ["housing", "secondhand", "jobs", "hiring"] as const,
        },
        {
          title: "Offline connection",
          description: "Dining, companions, events and local deals.",
          channels: ["dining", "mate", "events", "deals"] as const,
        },
      ],
    },
    trendingSection: { label: "Trends", title: "See what is trending nearby.", subtitle: "Heat ranking uses likes, comments, saves, reposts and time decay to surface what matters in the city right now.", cardTitle: "Tokyo Trends", cardSubtitle: "City ranking", formulaTitle: "Heat formula", heatLabel: "Heat", formula: ["likes", "comments", "saves", "reposts"] },
    languageSection: { label: "Languages", title: "Built for multilingual cities.", body: "Users can switch the app language and choose content languages, such as Chinese content in Tokyo, Japanese content in Toronto or English content in Los Angeles.", chips: ["中文", "English", "日本語", "한국어", "Français", "Español"], contextTitle: "Language-aware ranking", contextLabel: "Recommendation context", regionLabel: "Current region", region: "Canada · Toronto", contentLanguageLabel: "Content language", contentLanguage: "Japanese", priorityLabel: "Priority", priority: ["Japanese content in Toronto", "Japanese content in Canada", "Global Japanese trending content", "High-heat Toronto content in other languages"] },
    useCaseSection: { label: "City moments", title: "Made for real life in a city." },
    businessSection: { label: "Business", title: "Help locals discover your store, service, hiring and deals.", body: "Machi City gives local merchants, recruiters, housing agents, education teams, service providers and event organizers a city-level exposure channel.", primary: "Apply for partnership", secondary: "View ad plans", consoleLabel: "Business console", consoleTitle: "Tokyo campaign", verified: "Verified business", partnerTitle: "Verified local partner", partnerBody: "Verification, exposure, leads and city channel operations.", campaigns: [["Tokyo hiring channel ad", "42.8K impressions"], ["Housing top placement", "18 active leads"], ["Deal promotion", "2.4K saves"]] },
    safetySection: { label: "Safety", title: "Real connection needs real boundaries.", body: "Machi City builds safety reminders, reporting, review and verification into secondhand, housing, hiring, meetups, dining and services — so real experience stays trustworthy." },
    download: { label: "Start with your city", title: "Start with your city.", body: "Download Machi, pick your country and city, and see what is actually happening there. Machi is getting ready to launch — join the waitlist to be first in.", primary: "Join waitlist", secondary: "Get launch updates", appStore: "App Store planned", googlePlay: "Google Play planned", formLabel: "Waitlist", formTitle: "Get notified", email: "Enter your email", notify: "Notify me", sending: "Sending…", success: "You are on the waitlist. We will notify you at launch.", errorInvalid: "That email does not look right. Please double-check.", errorSubmit: "Could not submit just now. Please try again.", benefitsTitle: "What you will get", benefits: [["First-city opening notices", "Be first to know when Tokyo, Los Angeles and Toronto open."], ["Early beta invites", "iOS / Android beta builds ship to waitlist users first."], ["Merchant early-bird channel", "Local merchants, hiring teams and housing agents get early verification access."]], privacy: "We only email you about launches and city openings. We never sell your email or sign you up for other lists." },
    faqSection: { label: "FAQ", title: "Questions before launch." },
    common: { open: "Open" },
    footer: { tagline: "Find the echoes of life in every city.", description: "Local questions, experience, opportunities and connections, seen and found. machicity.com", groups: [["Navigation", ["About", "Features", "Cities", "Business", "Safety", "Download"]], ["Partnership", ["Business", "Advertising", "Hiring promotion", "Housing promotion", "System partnership"]], ["Legal", ["Privacy Policy", "Terms of Service", "Safety", "Contact"]]] },
    cities: withCityTone([
      { name: "Tokyo", country: "Japan", description: "Housing, secondhand, jobs and dining in one city plaza", posts: "24.8K local posts", heat: "92% rising" },
      { name: "Osaka", country: "Japan", description: "Kansai life, part-time jobs and weekend events", posts: "12.6K local posts", heat: "76% rising" },
      { name: "Shanghai", country: "China", description: "City guides, merchant deals and popular questions", posts: "31.4K local posts", heat: "88% rising" },
      { name: "Hangzhou", country: "China", description: "Jobs, housing information and local services", posts: "18.2K local posts", heat: "81% rising" },
      { name: "Los Angeles", country: "United States", description: "Study life, housing, events and community updates", posts: "27.9K local posts", heat: "85% rising" },
      { name: "Toronto", country: "Canada", description: "Multilingual community, housing, jobs and city events", posts: "16.8K local posts", heat: "78% rising" },
      { name: "London", country: "United Kingdom", description: "Career stories, secondhand deals and weekend plans", posts: "22.1K local posts", heat: "79% rising" },
      { name: "Sydney", country: "Australia", description: "Housing, jobs, dining and outdoor companions", posts: "14.5K local posts", heat: "73% rising" },
    ]),
    features: withFeatureMeta([
      { title: "News", badge: "Local alerts", description: "Local news, policy updates, transport alerts and safety reminders." },
      { title: "Guides", badge: "Life tips", description: "Housing, visas, banking, mobile plans, job hunting and daily experience." },
      { title: "Secondhand", badge: "Local resale", description: "Used goods, requests, moving sales and free giveaways." },
      { title: "Housing", badge: "Rentals", description: "Listings, sublets, shared homes, roommates and housing warnings." },
      { title: "Jobs", badge: "Careers", description: "Part-time, full-time, internships, remote work and job search stories." },
      { title: "Hiring", badge: "Open roles", description: "Local merchants, companies and organizations post hiring needs." },
      { title: "Mate", badge: "Companions", description: "Study, sports, photography, language exchange and gaming partners." },
      { title: "Dining", badge: "Meetups", description: "Meals, coffee, restaurant visits and weekend tables." },
      { title: "Events", badge: "Offline", description: "Exhibitions, city walks, board games, sports and offline gatherings." },
      { title: "Q&A", badge: "Local help", description: "Questions about visas, housing, work, school and healthcare." },
      { title: "Services", badge: "Leads", description: "Moving, translation, visas, study abroad, insurance, repairs and tax." },
      { title: "Deals", badge: "Offers", description: "Local merchant discounts, group buys and limited-time deals." },
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
    safetyItems: ["Reports and review", "Blocks and privacy", "Content safety", "Transaction reminders", "Event safety tips", "Business verification", "Scam warnings"],
    businessItems: ["Business verification", "City ads", "Hiring promotion", "Housing promotion", "Deal promotion", "Event promotion", "Service leads"],
    faqs: [
      ["What is Machi City?", "Machi City is a community organised by city. It gathers the real-life experience of locals, newcomers and visitors — news, housing, work, dining, Q&A, what to avoid — by city, language, topic and trust."],
      ["How is Machi different?", "Most social apps show you who you follow. Machi City shows you what is happening in a city — surfaced by language, topic, heat and the credibility of the people who lived it."],
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
      eyebrow: "Machi City · 街のリアル経験ネットワーク",
      titleTop: "Machi",
      titleBottom: "City",
      headline: "すべての街で、暮らしのこだまを見つける。",
      subtitle: "国と都市を切り替えて、ニュース、住まい、中古、仕事、食事、イベント、Q&Aと現地の落とし穴のヒントを発見。チャットやSNS、フォーラムに散らばっていた街の経験を、見つかる・届く・返ってくる場所にまとめます。",
      supporting: "Machi City は分類掲示板ではなく、街ごとに整理されたリアル経験のコミュニティです。",
      primary: "ウェイトリストに参加",
      secondary: "都市を見る",
      tertiary: "ビジネス向け",
      appStoreCaption: "App Store · まもなく公開",
      appStore: "App Store",
      googlePlayCaption: "Google Play · まもなく公開",
      googlePlay: "Google Play",
      scrollLabel: "続きを見る",
      stats: [["12", "都市チャンネル"], ["8+", "初期都市"], ["3", "サイト言語"]],
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
      label: "Machi City とは",
      title: "街ごとに、本物の経験が見つかる場所へ。",
      body: "Machi City は、SNS・チャット・フォーラム・友人の会話に散らばっていた街の経験を、都市・言語・トピック・話題度・信頼できる経験者ごとに整理し直す、街のコミュニティです。",
      pillars: [
        ["都市を選ぶ", "国、地域、都市を選び、その街のリアルな鼓動に入る。"],
        ["本物の経験を見つける", "ニュース、住まい、仕事、中古、食事、イベント、Q&A、避けたい落とし穴。"],
        ["街の人とつながる", "そこに住む人の投稿・質問・回答を通じて、本当の街を知る。"],
      ],
    },
    brandStory: {
      label: "ブランドストーリー",
      title: "すべての街で、暮らしのこだまを見つける。",
      lead: "都市は地図の上の名前だけではありません。本当の姿は、そこに暮らす人たちの日常の中にあります。",
      cityLines: [
        "東京は電車、ネオン、高層ビルだけではない。",
        "大阪は街並み、食べ物、人の流れだけではない。",
        "上海は外灘と夜景だけではない。",
        "杭州は西湖と江南だけではない。",
        "ロサンゼルスは太陽と高速道路だけではない。",
        "トロントは湖岸、ストリートカー、遠さだけではない。",
      ],
      paragraphs: [
        "新しく来た人が「このエリアは住みやすい？」と聞く声や、帰国前の人が家具を譲る投稿の中にあります。",
        "面接経験、週末の食事の誘い、住まいのガイド、注意喚起、地域イベント、誰かの回答の中にもあります。",
        "その声は小さいけれど、とても本物です。チャット、SNS、フォーラム、友人の間、そして新しい街で迷う時間に散らばっています。",
        "Machi City は、その散らばった声をもう一度集め、地域の暮らしを断片的な情報で終わらせないための場所です。",
        "Machi で見えるのは、ただの投稿ではありません。今その都市で起きている暮らしです。",
        "人を都市にとどめるのは住所だけではなく、そこで見つける生活感です。",
      ],
      highlights: [
        ["質問", "このエリアは住みやすい？"],
        ["経験", "住まい、手続き、仕事、注意点。"],
        ["機会", "採用、サービス、イベント、お得情報。"],
      ],
      echoLabel: "街のこだま",
      echoNodes: ["聞く", "分け合う", "見つかる", "届く"],
      closing: "Machi は、その声が見つかり、届き、返ってくる場所です。",
    },
    announcementsSection: { label: "お知らせ", title: "Machi City 最新のお知らせ。", body: "プロダクトの進捗、初期都市計画、テスト招待、提携受付、重要なお知らせをここで共有します。", manageHint: "公式の公開情報はこのサイトでお知らせします。", manageLabel: "すべてのお知らせ", composerTitle: "情報を公開", titlePlaceholder: "タイトル例：東京チャンネルまもなく公開", bodyPlaceholder: "公告、通知、情報の本文を書く", publish: "公開", empty: "内容を書いてから公開してください。", saved: "公式サイトのお知らせに公開しました。", tabs: ["公告", "ニュース", "アプリ更新", "通知", "情報"], defaultItems: [{ type: "公告", title: "Machi City 公式サイトを公開", date: "2026.05", body: "初版サイトは都市紹介、チャンネル、トレンド、多言語、ビジネス窓口に対応しました。" }, { type: "ニュース", title: "初期都市のクローズドベータ公開", date: "2026.05", body: "東京、ロサンゼルス、トロントがクローズドベータを開始。ウェイトリスト登録者から順に招待を送付中。" }, { type: "アプリ更新", title: "iOS / Android Beta 0.9 のビルド準備", date: "2026.05", body: "都市チャンネル、コンテンツ言語、トレンド、店舗オンボーディング下書きを追加。来週からウェイトリスト初期ユーザーに配布予定。" }, { type: "通知", title: "ウェイトリストの第二弾招待を順次送付", date: "2026.05", body: "ウェイトリスト登録者には都市公開とテスト招待を優先してお知らせします。" }, { type: "情報", title: "ビジネス提携の受付を開始", date: "2026.05", body: "店舗、採用担当、不動産、地域サービス事業者は提携希望を送信できます。" }] },
    citySection: {
      label: "都市",
      title: "ひとつのアプリで、すべての都市へ。",
      body: "東京からロサンゼルス、杭州からトロントまで、Machi City は都市ごとの暮らしの入口をつくります。",
      badge: "グローバル都市ネットワーク",
      switcherLabel: "現在の都市",
      switcherActive: "日本 · 東京",
      switcherHint: "切り替え",
      switcherCities: ["ロサンゼルス", "トロント", "上海", "杭州"],
    },
    featureSection: {
      label: "都市チャンネル",
      title: "街に散らばる情報を、もう一度集める。",
      body: "ニュース、ガイド、住まい、仕事、中古、イベント、サービス、お得情報を、都市・言語・トピック別に並べ直します。",
      groups: [
        {
          title: "街の情報",
          description: "いま街で起きていることを把握。",
          channels: ["news", "guides", "qa", "services"] as const,
        },
        {
          title: "取引と機会",
          description: "住まい、中古、求職、採用、サービスリード。",
          channels: ["housing", "secondhand", "jobs", "hiring"] as const,
        },
        {
          title: "オフラインのつながり",
          description: "食事、仲間、イベント、地域のお得情報。",
          channels: ["dining", "mate", "events", "deals"] as const,
        },
      ],
    },
    trendingSection: { label: "トレンド", title: "近くで話題のことを見る。", subtitle: "熱度はいいね、コメント、保存、再投稿、時間減衰をもとに、今その都市で注目すべき内容を表示します。", cardTitle: "東京トレンド", cardSubtitle: "都市ランキング", formulaTitle: "熱度の式", heatLabel: "熱度", formula: ["いいね", "コメント", "保存", "再投稿"] },
    languageSection: { label: "多言語", title: "多言語都市のために。", body: "アプリ言語だけでなく、コンテンツ言語も選べます。東京で中国語の投稿、トロントで日本語の投稿、ロサンゼルスで英語の投稿を探せます。", chips: ["中文", "English", "日本語", "한국어", "Français", "Español"], contextTitle: "多言語レコメンド", contextLabel: "推薦コンテキスト", regionLabel: "現在の地域", region: "カナダ · トロント", contentLanguageLabel: "コンテンツ言語", contentLanguage: "日本語", priorityLabel: "優先表示", priority: ["トロントの日本語投稿", "カナダの日本語投稿", "全体の日本語トレンド", "トロントの他言語高熱度投稿"] },
    useCaseSection: { label: "街のシーン", title: "本物の街の暮らしのために。" },
    businessSection: { label: "ビジネス", title: "店舗、サービス、採用、お得情報を地域ユーザーへ。", body: "Machi City は店舗、採用担当、不動産、留学機関、サービス事業者、イベント主催者に都市単位の露出入口を提供します。", primary: "提携を申し込む", secondary: "広告プランを見る", consoleLabel: "ビジネス管理", consoleTitle: "東京キャンペーン", verified: "認証店舗", partnerTitle: "認証ローカルパートナー", partnerBody: "認証、露出、リード、都市チャンネル運営。", campaigns: [["東京採用チャンネル広告", "42.8K 表示"], ["住まい上位表示", "18 件の有効リード"], ["クーポンプロモーション", "2.4K 保存"]] },
    safetySection: { label: "安全", title: "本物のつながりには、確かな境界線を。", body: "中古、住まい、採用、仲間探し、食事、サービスに、安全通知・通報・審査・認証の仕組みを用意し、本物の経験を信頼できる形で残します。" },
    download: { label: "都市から始めよう", title: "あなたの都市から始めよう。", body: "Machi をダウンロードし、国と都市を選んで地域の暮らしを見つけましょう。現在ローンチ準備中です。ウェイトリストで最新情報を受け取れます。", primary: "ウェイトリストに参加", secondary: "ローンチ通知を受け取る", appStore: "App Store 準備中", googlePlay: "Google Play 準備中", formLabel: "ウェイトリスト", formTitle: "通知を受け取る", email: "メールアドレス", notify: "通知を受け取る", sending: "送信中…", success: "ウェイトリストに登録しました。ローンチ時にお知らせします。", errorInvalid: "メールアドレスの形式を確認してください。", errorSubmit: "送信に失敗しました。時間をおいて再度お試しください。", benefitsTitle: "登録後に受け取れる内容", benefits: [["初期都市の公開通知", "東京、ロサンゼルス、トロントの公開を最速でお知らせ。"], ["ベータ版の優先招待", "iOS / Android Beta はウェイトリスト登録者から順次配布。"], ["店舗の早期登録枠", "店舗、採用、不動産は早期認証チャンネルを利用可能。"]], privacy: "ローンチと都市公開以外でメールは送りません。メールアドレスを販売することも、他のリストに登録することもありません。" },
    faqSection: { label: "よくある質問", title: "ローンチ前に知りたいこと。" },
    common: { open: "開く" },
    footer: { tagline: "すべての街で、暮らしのこだまを見つける。", description: "街の質問、経験、機会、つながりが見つかる場所。machicity.com", groups: [["ナビ", ["概要", "機能", "都市", "ビジネス", "安全", "ダウンロード"]], ["提携", ["店舗提携", "広告掲載", "採用プロモーション", "住まいプロモーション", "システム提携"]], ["法務", ["プライバシー", "利用規約", "安全", "お問い合わせ"]]] },
    cities: withCityTone([{ name: "東京", country: "日本", description: "住まい、中古、仕事、食事がここに集まる", posts: "24.8K 件の地域投稿", heat: "熱度 92% 上昇" }, { name: "大阪", country: "日本", description: "関西生活、アルバイト、週末イベント", posts: "12.6K 件の地域投稿", heat: "熱度 76% 上昇" }, { name: "上海", country: "中国", description: "都市ガイド、店舗割引、人気質問", posts: "31.4K 件の地域投稿", heat: "熱度 88% 上昇" }, { name: "杭州", country: "中国", description: "仕事、住まい、地域サービス", posts: "18.2K 件の地域投稿", heat: "熱度 81% 上昇" }, { name: "ロサンゼルス", country: "アメリカ", description: "留学生活、住まい、イベント、地域情報", posts: "27.9K 件の地域投稿", heat: "熱度 85% 上昇" }, { name: "トロント", country: "カナダ", description: "多言語コミュニティ、住まい、仕事、都市イベント", posts: "16.8K 件の地域投稿", heat: "熱度 78% 上昇" }, { name: "ロンドン", country: "イギリス", description: "仕事経験、中古、週末の行き先", posts: "22.1K 件の地域投稿", heat: "熱度 79% 上昇" }, { name: "シドニー", country: "オーストラリア", description: "住まい、仕事、食事、アウトドア仲間", posts: "14.5K 件の地域投稿", heat: "熱度 73% 上昇" }]),
    features: withFeatureMeta([{ title: "ニュース", badge: "地域速報", description: "地域ニュース、政策、交通、安全のお知らせ。" }, { title: "ガイド", badge: "生活知識", description: "住まい、ビザ、銀行、携帯、仕事探し、生活経験。" }, { title: "中古", badge: "譲渡", description: "不要品、探し物、引越しセール、無料譲渡。" }, { title: "住まい", badge: "賃貸", description: "物件、サブリース、シェア、ルームメイト、注意点。" }, { title: "仕事", badge: "求職", description: "アルバイト、正社員、インターン、リモート、経験談。" }, { title: "採用", badge: "求人", description: "地域店舗、企業、団体が採用情報を公開。" }, { title: "仲間", badge: "つながり", description: "勉強、運動、写真、言語交換、ゲーム仲間。" }, { title: "食事", badge: "ごはん", description: "食事、カフェ、店巡り、週末の集まり。" }, { title: "イベント", badge: "オフライン", description: "展示、Citywalk、ボードゲーム、運動、交流会。" }, { title: "質問", badge: "相談", description: "ビザ、住まい、仕事、学校、医療などの相談。" }, { title: "サービス", badge: "依頼", description: "引越し、翻訳、ビザ、留学、保険、修理、税務。" }, { title: "お得", badge: "割引", description: "地域店舗の割引、共同購入、期間限定オファー。" }]),
    trendingPosts: [{ title: "東京の住まいガイド", heat: "56.2K", category: "住まい" }, { title: "新宿で週末ごはん", heat: "38.9K", category: "食事" }, { title: "渋谷のアルバイト採用、日本語 N3 以上", heat: "21.6K", category: "採用" }, { title: "引越し中古家具、格安引き取り", heat: "18.4K", category: "中古" }],
    useCases: [{ title: "新しい都市に来た時", description: "ガイド、住まい、手続き、仕事探し。", icon: "MapPinned" }, { title: "引越しや帰国", description: "中古出品、転貸、引越しサービス探し。", icon: "PackageOpen" }, { title: "仕事を探す", description: "採用、アルバイト、紹介、面接経験。", icon: "BriefcaseBusiness" }, { title: "週末に出かけたい", description: "食事、イベント、展示、Citywalk。", icon: "Sparkles" }, { title: "困った時", description: "質問して地域ユーザーの経験を得る。", icon: "CircleHelp" }, { title: "地域ビジネス", description: "割引、採用、イベントを都市ユーザーへ。", icon: "Store" }],
    safetyItems: ["通報と審査", "ブロックとプライバシー", "コンテンツ安全", "取引注意", "イベント安全通知", "店舗認証", "詐欺防止"],
    businessItems: ["店舗認証", "都市広告", "採用プロモーション", "住まいプロモーション", "割引プロモーション", "イベントプロモーション", "サービスリード"],
    faqs: [["Machi City とは？", "Machi City は、街ごとに整理されたリアル経験のコミュニティです。SNS・チャット・フォーラムに散らばっていた街の経験を、都市・言語・トピック・話題度・信頼できる経験者ごとに整理し直します。"], ["普通の SNS と何が違う？", "普通の SNS はフォロー関係で投稿を見せます。Machi City は街で今起きていることを、言語・トピック・話題度・経験者の信頼度で見せます。"], ["どんな内容に対応しますか？", "ニュース、ガイド、中古、住まい、仕事、採用、仲間、食事、イベント、質問、サービス、店舗、お得情報などです。"], ["多言語に対応しますか？", "対応します。アプリ言語とコンテンツ言語を選べます。"], ["店舗は参加できますか？", "参加できます。認証、広告、採用促進、割引促進、サービスリードに対応予定です。"], ["今ダウンロードできますか？", "Machi はローンチ準備中です。ウェイトリストで最新情報を受け取れます。"]],
  },
} satisfies Record<MarketingLocale, {
  nav: { items: Array<[string, string]>; signIn: string; register: string; getApp: string; openMenu: string; closeMenu: string; language: string };
  hero: { eyebrow: string; titleTop: string; titleBottom: string; headline: string; subtitle: string; supporting: string; primary: string; secondary: string; tertiary: string; appStoreCaption: string; appStore: string; googlePlayCaption: string; googlePlay: string; scrollLabel: string; stats: Array<[string, string]> };
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
  download: {
    label: string;
    title: string;
    body: string;
    primary: string;
    secondary: string;
    appStore: string;
    googlePlay: string;
    formLabel: string;
    formTitle: string;
    email: string;
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
  safetyItems: string[];
  businessItems: string[];
  faqs: Array<[string, string]>;
}>;
