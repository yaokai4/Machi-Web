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
        ["首页", "/"],
        ["功能", "/features"],
        ["指南", "/guide"],
        ["商家", "/business"],
        ["安全", "/safety"],
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
      eyebrow: "城市生活 · 本地连接",
      titleTop: "Machi",
      titleBottom: "",
      headline: "在每一座城市，找到生活的回声。",
      subtitle: "刚到一座城市，真正需要的往往不是更多信息，而是可信的答案：住在哪里、工作怎么找、手续如何办、谁愿意分享走过的路。Machi 按城市与语言，把这些散落的经验重新整理在一起。",
      supporting: "我们从日本出发，先把在日生活、求职、留学与城市社区做深。随后，再跟随真实需求，一座城市、一种语言地走向更远的地方。",
      primary: "进入 Web Beta",
      secondary: "查看创始人故事",
      tertiary: "查看 Machi Guide",
      quaternary: "商家合作申请",
      appStoreCaption: "App Store · 即将上线",
      appStore: "App Store",
      googlePlayCaption: "Google Play · 即将上线",
      googlePlay: "Google Play",
      webBetaCaption: "Web 端已上线 · 立即体验",
      scrollLabel: "继续浏览",
      stats: [
        ["Web 端已上线", "免邀请 · 立即体验"],
        ["日本指南", "求职 · 留学 · 生活"],
        ["更多城市", "加 · 澳 · 英 · 法 · 德 · 韩"],
      ],
    },
    appMockup: {
      title: "城市经验",
      region: "日本 · 东京",
      search: "搜索租房、避坑、美食、二手",
      hotTitle: "东京脉搏",
      hotSubtitle: "正在发生",
      quickEntries: ["新闻", "攻略", "二手", "租房", "工作", "招聘", "小组", "美食"],
      hotItems: ["东京租房避坑指南", "新宿周末美食", "涩谷兼职招聘"],
      cards: [
        { type: "租房", title: "东京租房避坑指南", place: "新宿", heat: "56.2K" },
        { type: "美食", title: "新宿周末美食聚会讨论", place: "新宿", heat: "38.9K" },
        { type: "招聘", title: "涩谷兼职招聘，日语 N3 以上", place: "涩谷", heat: "21.6K" },
      ],
    },
    brandIntro: {
      label: "What is Machi",
      title: "Machi 不是一张信息清单，也不是一条只供旁观的信息流。",
      body: "它把城市里的经验、需求与人与人的回应，按地点、语言和生活场景重新组织，让信息重新靠近它真正发生的地方。",
      pillars: [
        ["City-based", "按国家、城市和地区组织内容，让信息回到真实生活发生的地方。"],
        ["Language-aware", "界面语言和内容语言分开，支持多语言城市里的真实表达。"],
        ["Scene-driven", "围绕租房、二手、工作、活动、问答、服务和同城连接等生活场景。"],
        ["Trust-focused", "用举报、拉黑、审核、认证和风险提示，保护真实连接的边界。"],
      ],
    },
    guideSection: {
      label: "Machi Guide",
      title: "Machi Guide：把一座城市，读成可以生活的地方。",
      body: "我们从日本开始，整理生活手续、升学、求职、JLPT、学校与公司资料，以及真正会用到的本地服务。不是把答案堆在一起，而是让每一步都有清楚的来路。",
      cta: "进入 Machi Guide",
      expansion: "下一步扩展：Canada · Australia · United Kingdom · France · Germany · South Korea · United States",
      cards: [
        ["日本生活", "银行卡、手机卡、年金、保险、役所手续、租房和打工"],
        ["日本升学", "大学院、专门学校、研究计划书、教授联系和出愿材料"],
        ["日本就职", "履历书、职务经歴书、ES、面试、公司选择和签证变更"],
        ["日语考级", "JLPT N5-N1、词汇语法、阅读听力和备考资料"],
        ["日本学校库", "大学、大学院、专门学校、语言学校"],
        ["外国人就职公司库", "公司资料、行业、岗位、面试经验和外国人求职参考"],
        ["资料与服务", "数字资料、模板、清单、翻译、接机、手续协助和申请辅导"],
      ],
    },
    brandStory: {
      label: "品牌故事",
      title: "在每一座城市，找到生活的回声。",
      lead: "城市不只由道路与建筑构成。它更像一部被无数普通人共同写下、仍在继续的生活史。",
      cityLines: [
        "东京不是只有地铁、霓虹和高楼。",
        "大阪不是只有街道、美食和人潮。",
        "上海不只是外滩和夜景。",
        "杭州不只是西湖和江南。",
        "洛杉矶不只是阳光和高速公路。",
        "多伦多不只是湖岸、街车和远方。",
      ],
      paragraphs: [
        "它在一句“这个街区适合住吗”里，也在一张离开前转手的书桌、一份面试后的笔记里。",
        "它在租房的提醒、周末的相约、一次认真回答中，慢慢显出一座城市真实的轮廓。",
        "这些声音并不宏大，却足够具体。只是它们常常散落在群聊、信息流与朋友之间，很快被新的消息淹没。",
        "Machi 想把它们重新带回城市，让经验不再只是偶然听见，而能在需要时被再次找到。",
        "你在 Machi 看见的，不只是内容，而是此刻有人如何在这里生活。",
        "真正让一座城市变得亲近的，从来不只是地址，而是你终于在其中找到了自己的日常。",
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
      eyebrow: "创始人的话",
      title: "我是姚凯。Machi，始于我在异乡生活的那些具体时刻。",
      name: "姚凯 / YAOKAI",
      role: "Machi City 创始人 · 独立产品创作者",
      meta: "2019 年 10 月来到日本",
      avatar: "姚",
      readMore: "阅读完整创始人故事",
      bio: "2019 年，我来到日本留学。Machi 不是来自一份抽象的商业计划，而是来自我一次次找房、办手续、寻找工作与理解一座陌生城市的过程。",
      quote: "“我想做的，不是再增加一个信息平台，而是让一个人在陌生城市里少一点无措，多一点可以抵达的生活。”",
      paragraphs: [
        "我是姚凯，也是从零开始做出 Machi 的人。",
        "2019 年 10 月，我来到日本留学。刚抵达一座陌生城市时，最消耗人的往往不是某一件大事，而是无数细小却必须解决的问题：住在哪里、手续怎么办、工作从哪里找、哪些经验值得相信。",
        "答案并非不存在。它们只是散落在群聊、社交平台、地方网站、朋友的记忆和不同语言之间。对刚来的人而言，很难判断；对已经生活在这里的人而言，也缺少一个能把经验留下来的地方。",
        "我由此开始构想 Machi：不是做一座冰冷的信息仓库，也不是再造一条永远刷不完的信息流，而是让城市里的知识、需求与人与人的回应，拥有清楚的归属。",
        "Machi 这个名字来自日语的「街 / まち」。对我来说，街不是地图上的一个点，而是一个人学习生活、建立关系，也允许自己重新开始的地方。",
        "我希望 Machi 能让那些微小却重要的声音被保留下来。有人提出问题，有人分享走过的路，也有人因此少绕一点弯，早一点在陌生之地找到自己的节奏。",
      ],
      closing: "让散落的信息，重新拥有城市的坐标。\n让陌生的地方，慢慢长出生活的轮廓。\n让每一次真诚的发问，都有机会得到回应。",
      siteEyebrow: "继续认识我",
      siteTitle: "在 Machi 之外，我也持续写作、设计与构建。",
      siteBody: "在 yaokai.me，我记录做产品的思考、走过的路，以及仍在发生的作品。那里不是另一份履历，而是我持续创造的现场。",
      siteCta: "前往 yaokai.me",
    },
    announcementsSection: {
      label: "公告中心",
      title: "Machi 最新公告。",
      body: "这里会同步 Machi 的产品进展、首批城市计划、早期开放、合作开放和重要通知。我们会持续把最值得关注的信息放在这里。",
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
	        { type: "公告", title: "Machi Web 端正式开放", date: "2026.06", body: "Web 端已上线，无需邀请即可注册。登录后可以浏览城市内容、发帖、私信，并参与公开城市话题和本地小组。" },
        { type: "新闻", title: "日本指南上线：求职 · 留学 · 生活", date: "2026.06", body: "面向在日生活的求职、留学和生活指南正式上线，覆盖签证、找工作、租房、银行卡和校园生活等真实流程。" },
        { type: "App 更新", title: "支持 Google 一键登录", date: "2026.06", body: "Web 与 iOS 都支持用 Google 账号登录，也可以在设置里随时绑定或解绑 Google。" },
        { type: "通知", title: "更多城市与国家筹备中", date: "2026.06", body: "继东京、洛杉矶、多伦多之后，加拿大、澳洲、英国、法国、德国、韩国等地区的指南和城市频道正在陆续展开。" },
        { type: "信息", title: "商家合作通道开放", date: "2026.05", body: "本地商家、招聘方、房产和服务商可以提交认证资料，通过后在对应城市、频道和语言里发布。" },
      ],
    },
    citySection: {
      label: "城市",
      title: "首批城市，从真实生活场景开始。",
	      body: "东京、洛杉矶、多伦多是首批城市，Web 端已经开放浏览；加拿大、澳洲、英国、法国、德国、韩国等更多城市与国家正在陆续展开。下面的城市卡片用来预览频道、语言和社区场景。",
      badge: "示例预览",
      switcherLabel: "当前城市",
      switcherActive: "日本 · 东京",
      switcherHint: "可切换",
      switcherCities: ["洛杉矶", "多伦多", "上海", "杭州"],
      sampleNote: "示例预览：卡片里的帖子和热度是演示数据，用来展示频道与场景，不代表真实数据。",
    },
    featureSection: {
      label: "城市频道",
	      title: "把城市里纷杂的事，放回各自清楚的位置。",
      body: "找住处、寻工作、转手闲置、参加活动、提出问题。Machi 按城市、语言与生活场景整理，让需要的信息不再淹没在无尽的聊天记录里。",
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
	          description: "本地小组、活动、语言交换、问答和真实生活里的社区参与。",
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
      title: "一座城市，可以有很多种母语。",
      body: "界面语言与内容语言彼此独立。你可以在东京阅读中文经验，在多伦多寻找日语内容，也可以在洛杉矶用英文理解附近正在发生的生活。",
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
      title: "好的本地服务，不该只被看见，更应该在需要时被找到。",
      body: "通过认证的商家与服务者，可以在对应城市、频道和语言中发布服务、优惠、招聘与活动。清楚说明自己是谁，也准确抵达真正有需要的人。",
      primary: "申请合作",
      secondary: "查看广告方案",
      consoleLabel: "商家后台",
      consoleTitle: "东京推广计划",
      verified: "商家认证",
      partnerTitle: "认证本地合作方",
      partnerBody: "认证资料、服务内容、城市曝光、订单线索和频道运营。",
      campaigns: [
        ["餐厅饭局与优惠发布", "认证商家"],
        ["语言学校体验课与交换小组", "服务内容"],
        ["本地招聘与服务线索", "城市频道"],
      ],
    },
    safetySection: {
      label: "安全",
      title: "真实的连接，需要真实的边界。",
      body: "从公开讨论到线下见面，从租房与二手交易到招聘和本地服务，Machi 以提醒、举报、屏蔽、审核与账号处置，守住每一次连接应有的边界。",
    },
    download: {
      label: "从你的城市开始",
      title: "下载 Machi",
	      body: "Machi Web 端已经上线，注册后即可使用城市首页、发现与搜索、通知、私信、发布内容、个人主页和社区参与。iOS 与 Android App 正在筹备，留下邮箱可在上线时第一时间收到提醒。",
      primary: "App 上线提醒我",
	      secondary: "参与本地社区",
      appStore: "iOS：即将上线",
      googlePlay: "Android：即将上线",
      webBeta: "Web 端：已上线，免邀请",
      formLabel: "上线提醒",
      formTitle: "App 上线后提醒我",
      email: "Email",
      cityLabel: "Preferred city",
      languageLabel: "Language preference",
      intentLabel: "I want to use Machi for",
      cityOptions: ["Tokyo", "Los Angeles", "Toronto", "其他城市"],
      languageOptions: ["中文", "English", "日本語"],
      intentOptions: ["本地生活信息", "参与社区", "美食聚会", "活动小组", "语言交换", "租房", "二手", "找工作", "招聘", "商家推广", "本地服务"],
      notify: "提醒我",
      sending: "正在提交…",
      success: "已收到。iOS / Android App 上线时我们会第一时间通知你；现在就可以直接在 Web 端体验 Machi。",
      errorInvalid: "邮箱格式不正确，请检查后重试。",
      errorSubmit: "提交失败，请稍后再试。",
      benefitsTitle: "你会收到",
      benefits: [
        ["现在就能用的 Web 端", "城市首页、发现、搜索、通知、私信、发布和个人主页，注册即用"],
        ["App 上线提醒", "iOS、Android 上线时第一时间通知你"],
        ["更多城市与指南", "新城市、新国家，以及日本求职 / 留学 / 生活指南的更新"],
      ],
      privacy: "我们只会在 App 上线、新城市和指南更新时发邮件，不会出售你的邮箱，也不会拿去订阅其他广告。",
    },
    faqSection: {
      label: "常见问题",
      title: "上线前你可能想知道的事。",
    },
    common: { open: "进入" },
    footer: {
      tagline: "在每一座城市，找到生活的回声。",
	      description: "让问题有去处，让经验被留下，让一座城市里真诚的声音彼此抵达。",
      groups: [
        ["导航", ["关于", "功能", "指南", "商家合作", "安全", "FAQ"]],
        ["合作", ["商家合作", "广告投放", "招聘推广", "租房推广", "系统合作"]],
	        ["法律", ["隐私政策", "服务条款", "会员条款", "服务预约条款", "退款政策", "社区规则", "商业披露", "Cookie 政策", "联系我们"]],
      ],
    },
    cities: withCityTone([
      { name: "Tokyo", country: "Japan", description: "租房避坑、美食、语言交换和本地小组，在这里最先展开。", posts: "Housing · Dining · Language Exchange · Groups", heat: "Web 端开放中", status: "Web 端开放中", sampleLabel: "示例预览", languageTags: ["中文", "EN", "日本語"], sceneTags: ["Housing", "Dining", "Language Exchange", "Groups"], highlight: "涩谷、新宿和湾岸生活经验" },
	      { name: "Los Angeles", country: "United States", description: "工作、活动、美食、本地服务和多语言社区。", posts: "Jobs · Events · Dining · Local Services", heat: "筹备中", status: "筹备中", sampleLabel: "示例预览", languageTags: ["EN", "中文", "日本語"], sceneTags: ["Jobs", "Events", "Dining", "Local Services"], highlight: "东西区生活与本地服务需求" },
      { name: "Toronto", country: "Canada", description: "租房、工作、多语言问答和新居民支持。", posts: "Housing · Jobs · Multilingual Q&A · Groups", heat: "筹备中", status: "筹备中", sampleLabel: "示例预览", languageTags: ["EN", "中文", "日本語"], sceneTags: ["Housing", "Jobs", "Q&A", "Groups"], highlight: "初到城市的生活支持" },
    ]),
    features: withFeatureMeta([
      { title: "本地新闻", badge: "News", description: "本地快讯、政策提醒、交通提醒和安全提醒。" },
      { title: "城市指南", badge: "Guides", description: "求职、留学、租房、签证、银行卡和办事流程——日本指南已上线，更多国家陆续展开。" },
      { title: "同城社区", badge: "Social", description: "同城话题、本地小组和兴趣社区，围绕城市生活展开。" },
      { title: "活动小组", badge: "Groups", description: "美食聚会、活动小组、运动小组、语言交换和周末本地活动。" },
      { title: "美食", badge: "Dining", description: "美食聚会、探店、城市美食讨论和本地饮食活动。" },
      { title: "活动", badge: "Events", description: "展览、Citywalk、桌游、运动、课程和城市活动。" },
	      { title: "语言交换", badge: "Language Exchange", description: "中文、英文、日文等语言交换小组和学习讨论。" },
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
      { title: "新宿周末美食聚会讨论", heat: "38.9K", category: "美食" },
      { title: "涩谷兼职招聘，日语 N3 以上", heat: "21.6K", category: "招聘" },
      { title: "搬家出二手家具，低价自取", heat: "18.4K", category: "二手" },
    ],
    useCases: [
      { title: "刚到一个新城市", description: "看攻略、租房、办卡、找工作。", icon: "MapPinned" },
      { title: "搬家或回国", description: "出二手、转租、找搬家服务。", icon: "PackageOpen" },
      { title: "找工作", description: "看招聘、兼职、内推、面试经验。", icon: "BriefcaseBusiness" },
      { title: "周末想出去", description: "找美食、活动、展览、Citywalk。", icon: "Sparkles" },
      { title: "遇到问题", description: "发问答，获得本地用户经验。", icon: "CircleHelp" },
      { title: "本地商家", description: "发布优惠、招聘、活动，连接城市用户。", icon: "Store" },
    ],
    safetyItems: [
      { title: "Social safety", body: "不要过早分享住址、证件、财务信息；遇到骚扰、诈骗或冒犯内容可举报或拉黑。" },
      { title: "Meetup safety", body: "第一次见面建议选择公共场所，告诉朋友见面地点，保留沟通记录。" },
      { title: "Dining safety", body: "美食聚会场景提供公共地点、人数、费用和退出提醒。" },
      { title: "Language exchange safety", body: "语言交换建议先在公共空间见面，不第一次就去私人空间。" },
      { title: "Housing safety", body: "不要提前转账给未验证房东，确认地址、合同和房东身份，警惕低价房源。" },
      { title: "Secondhand safety", body: "优先公共场所交易，高价值物品线下面交验货，不提前支付大额定金。" },
      { title: "Jobs & hiring safety", body: "不要支付入职押金，确认公司官网、地址和联系方式，警惕高薪先付款。" },
      { title: "Business verification", body: "为本地商家、招聘方、房产和服务商提供认证与风险标记。" },
      { title: "Report and block", body: "举报、屏蔽、内容审核、下架和账号限制形成完整处理链路。" },
	      { title: "Community guidelines", body: "覆盖骚扰、仇恨、诈骗、冒充、违规线下服务、虚假活动和线下危险行为。" },
    ],
    businessItems: ["Restaurant meetup campaign", "Language school exchange group", "Event organizer local participants", "Gym / class interest community", "Local service leads", "Hiring in city community"],
    faqs: [
	      ["Machi 是什么？", "Machi 是一个按国家、城市和语言组织内容的本地生活与同城社区平台，覆盖租房、二手、工作、招聘、活动、问答、本地服务、商家优惠、城市话题和真实经验。"],
	      ["Machi 是城市社区吗？", "是。Machi 是一个按城市和语言组织的本地生活与社区平台，内容包括本地信息、城市指南、问答、社区讨论、语言交换小组、活动、租房、工作、本地服务和商家信息。社交功能服务于公开城市话题和社区参与，不承接私人介绍类服务。"],
      ["Machi 只做日本吗？", "不是。Machi 从日本 Guide 和首批城市开始，之后会逐步扩展到加拿大、澳洲、英国、法国、德国、韩国、美国等更多国家和城市。"],
      ["Machi Guide 是什么？", "Guide 是 Machi 的城市知识层。日本地区先覆盖生活、升学、就职、JLPT、学校库、公司库、资料和服务，未来会扩展到更多国家与城市。"],
      ["首批城市有哪些？", "我们先从日本东京以及部分城市社区打磨产品体验，同时筹备大阪、京都和更多海外城市。早期城市会清楚标注开放状态。"],
      ["我可以用自己的语言使用 Machi 吗？", "可以。Machi 支持界面语言和内容语言分开选择，中文、English、日本語会优先完善，更多内容语言会随城市需求扩展。"],
      ["商家和本地服务可以加入吗？", "可以。商家、服务提供者、招聘方、房源方、活动组织者和教育机构可以申请认证或合作，但 Machi 不承诺固定曝光或一定带来客户。"],
      ["可以发布租房、招聘或二手吗？", "可以。相关内容需要真实、清楚、遵守当地法律，并接受平台审核、风险提示和用户举报机制。"],
      ["Machi 如何保护用户安全？", "Machi 在发帖、私信、见面、租房、二手、招聘和本地服务场景中加入举报、拉黑、审核、认证和风险提示。"],
      ["Machi 是留学中介吗？", "不是。Machi Guide 会整理日本升学、就职和生活资料，也可能提供预约服务，但 Machi 的长期目标是全球城市本地生活平台。"],
      ["付费服务是否保证结果？", "不保证。留学、就职、签证、租房、开户、录取和就业等结果取决于用户材料、第三方机构和当地规则。"],
      ["我可以删除账号吗？", "可以。用户可以管理个人资料并申请删除账号；公开发布过的内容可能已被其他用户看到或互动。"],
      ["App 什么时候上线？", "Web Beta 已经可体验，iOS 和 Android 正在筹备中。App Store 和 Google Play 未正式上架前，我们会明确标注 Coming soon。"],
      ["如何联系 Machi？", "合作、媒体、商家申请、城市开放建议或隐私请求，都可以发送邮件到 hi@machicity.com。"],
    ],
  },
  en: {
    nav: {
      items: [
        ["Home", "/"],
        ["Features", "/features"],
        ["Guide", "/guide"],
        ["Business", "/business"],
        ["Safety", "/safety"],
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
      eyebrow: "City life · local connection",
      titleTop: "Machi",
      titleBottom: "",
      headline: "Find the echoes of life in every city.",
      subtitle: "In a new city, you rarely need more noise. You need answers you can trust: where to live, how to find work, which paperwork matters, and who has already walked the road ahead. Machi gathers that scattered local knowledge by city and language.",
      supporting: "We are beginning in Japan, going deep on everyday life, study, work, and local community. From there, Machi will grow carefully, one city and one language at a time.",
      primary: "Enter Web Beta",
      secondary: "Read the founder's story",
      tertiary: "Explore Machi Guide",
      quaternary: "Apply for business partnership",
      appStoreCaption: "App Store · Coming soon",
      appStore: "App Store",
      googlePlayCaption: "Google Play · Coming soon",
      googlePlay: "Google Play",
      webBetaCaption: "Web app · Live now",
      scrollLabel: "Continue",
      stats: [
        ["Web Beta", "available now"],
        ["Japan Guide", "life · study · career"],
        ["More regions", "CA · AU · UK · FR · DE · KR"],
      ],
    },
    appMockup: {
      title: "City pulse",
      region: "Japan · Tokyo",
      search: "Search housing, tips, dining, secondhand",
      hotTitle: "Tokyo pulse",
      hotSubtitle: "Happening now",
      quickEntries: ["News", "Guides", "Used", "Housing", "Jobs", "Hiring", "Groups", "Dining"],
      hotItems: ["Tokyo housing — what to avoid", "Shinjuku weekend dinners", "Shibuya part-time hiring"],
      cards: [
        { type: "Housing", title: "Tokyo housing — what to avoid", place: "Shinjuku", heat: "56.2K" },
        { type: "Dining", title: "Weekend food meetup in Shinjuku", place: "Shinjuku", heat: "38.9K" },
        { type: "Hiring", title: "Part-time hiring in Shibuya", place: "Shibuya", heat: "21.6K" },
      ],
    },
    brandIntro: {
      label: "What is Machi",
      title: "Machi is neither a directory nor another feed made for passive scrolling.",
      body: "It organizes local experience, practical needs, and human replies by place, language, and everyday context, bringing information back to where life actually happens.",
      pillars: [
        ["City-based", "Organized by country, region and city, so local information stays close to where life happens."],
        ["Language-aware", "Interface language and content language are separate for multilingual cities."],
        ["Scene-driven", "Built around housing, secondhand, jobs, events, Q&A, services and local connection."],
        ["Trust-focused", "Reporting, blocking, review, verification and risk prompts protect real connection."],
      ],
    },
    guideSection: {
      label: "Machi Guide",
      title: "Machi Guide: read a city until it becomes a place you can live.",
      body: "We begin in Japan with the things people genuinely need: local procedures, study, careers, JLPT, school and company references, and dependable services. The aim is not to pile up answers, but to make every next step easier to understand.",
      cta: "Explore Machi Guide",
      expansion: "Next regions: Canada · Australia · United Kingdom · France · Germany · South Korea · United States",
      cards: [
        ["Japan Life", "Bank accounts, mobile plans, pension, insurance, city office procedures, housing and part-time work"],
        ["Study in Japan", "Graduate school, vocational schools, research plans, professor outreach and application materials"],
        ["Career in Japan", "Resume, rirekisho, ES, interviews, company selection and visa change"],
        ["JLPT", "JLPT N5-N1, vocabulary, grammar, reading, listening and study materials"],
        ["Japan School Directory", "Universities, graduate schools, vocational schools and language schools"],
        ["Foreigner-friendly Companies", "Company profiles, industries, roles, interview reviews and job-search references"],
        ["Materials & Services", "Digital resources, templates, checklists, translation, airport pickup, procedure support and application coaching"],
      ],
    },
    brandStory: {
      label: "Brand story",
      title: "Find the echoes of life in every city.",
      lead: "A city is not made of streets and buildings alone. It is a living record, written every day by the people who call it home.",
      cityLines: [
        "Tokyo is more than trains, neon and towers.",
        "Osaka is more than streets, food and crowds.",
        "Shanghai is more than the Bund and night views.",
        "Hangzhou is more than West Lake and old poetry.",
        "Los Angeles is more than sunshine and freeways.",
        "Toronto is more than lake views, streetcars and distance.",
      ],
      paragraphs: [
        "It lives in the question “Is this a good neighborhood?” and in a desk passed on before someone leaves town.",
        "It takes shape in interview notes, a housing warning, a weekend invitation, and an answer written with care.",
        "None of these voices is grand, but each is specific. Too often they vanish beneath newer messages in chats, feeds, and private conversations.",
        "Machi brings them back into the city, so useful experience is not merely overheard once, but can be found again when it matters.",
        "What you see in Machi is not content in the abstract. It is how people are living here, now.",
        "An address tells you where you are. A sense of everyday life is what makes a city begin to feel like your own.",
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
      eyebrow: "A note from the founder",
      title: "I’m Yao Kai. Machi began in the ordinary moments of building a life far from home.",
      name: "Yao Kai / YAOKAI",
      role: "Founder of Machi City · Independent product builder",
      meta: "Moved to Japan in October 2019",
      avatar: "Y",
      readMore: "Read the full founder story",
      bio: "I moved to Japan as an international student in 2019. Machi did not begin as an abstract business plan; it grew out of the daily work of finding a home, navigating paperwork, looking for work, and learning how a new city really functions.",
      quote: "“I did not want to build another feed. I wanted to make an unfamiliar city feel a little more legible, and a little more livable.”",
      paragraphs: [
        "I’m Yao Kai, and I have built Machi from the ground up.",
        "I moved to Japan in October 2019 as an international student. In a new country, the hardest part was rarely one dramatic obstacle. It was the accumulation of small, necessary questions: where to live, how to handle paperwork, where to look for work, and which advice to trust.",
        "The answers existed, but they were scattered across group chats, social platforms, local websites, friends’ memories, and different languages. Newcomers struggled to judge what was reliable; long-time residents had no lasting place to leave what they had learned.",
        "That experience became the beginning of Machi. I did not want to build a cold database or another endless social feed. I wanted local knowledge, real needs, and human replies to have a clear place in the city they belong to.",
        "The name comes from the Japanese word “街 / まち.” To me, a machi is more than a point on a map. It is where a person learns how to live, forms relationships, and sometimes begins again.",
        "My hope is simple: preserve the small voices that matter. One person asks, another shares the road they have already walked, and someone else finds their footing a little sooner.",
      ],
      closing: "Give scattered knowledge a place in the city.\nGive unfamiliar streets the beginnings of a life.\nGive every sincere question a chance to be answered.",
      siteEyebrow: "Beyond Machi",
      siteTitle: "I continue to write, design, and build.",
      siteBody: "At yaokai.me, I share notes on making products, the path that brought me here, and the work still taking shape. It is less a résumé than a living record of what I am creating.",
      siteCta: "Visit yaokai.me",
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
        { type: "News", title: "Japan Guide is live", date: "2026.06", body: "Japan life, study, career, JLPT, school directories, company directories, materials and services are being organized first." },
        { type: "App Update", title: "Web Beta supports Google sign-in", date: "2026.06", body: "Web and iOS flows support Google sign-in, while the App Store and Google Play releases remain in preparation." },
        { type: "Notice", title: "More countries and cities are in preparation", date: "2026.06", body: "Canada, Australia, the United Kingdom, France, Germany, South Korea, the United States and more regions are planned city by city." },
        { type: "Info", title: "Business partnership requests are open", date: "2026.05", body: "Local merchants, hiring teams, housing agents and service providers can submit partnership interest." },
      ],
    },
    citySection: {
      label: "Cities",
      title: "First launch cities, grounded in real life scenes.",
      body: "Machi grows city by city. We are starting with Japan to refine Guide, services and city communities, then preparing Canada, Australia, the United Kingdom, France, Germany, South Korea, the United States and more regions. City cards show launch-stage reference data.",
      badge: "Launch-stage data",
      switcherLabel: "Current city",
      switcherActive: "Japan · Tokyo",
      switcherHint: "Switch to",
      switcherCities: ["Los Angeles", "Toronto", "Shanghai", "Hangzhou"],
      sampleNote: "Preview: posts, heat and city status shown here are early product reference data, not production metrics.",
    },
    featureSection: {
      label: "City channels",
	      title: "A clear place for the many things that make up city life.",
	      body: "Housing, work, secondhand exchange, events, questions, services, and local groups are organized by city, language, and everyday need, so useful information is not lost in an endless stream.",
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
          description: "Local groups, events, language exchange, Q&A and lived warnings.",
          channels: ["social", "meetups", "dining", "events", "language-exchange", "avoid"] as const,
        },
      ],
    },
	    trendingSection: { label: "Trends", title: "See what is trending in your city.", subtitle: "Heat ranking uses likes, comments, saves, reposts and time decay to surface what matters in the city right now.", cardTitle: "Tokyo Trends", cardSubtitle: "City ranking", formulaTitle: "Heat formula", heatLabel: "Heat", formula: ["likes", "comments", "saves", "reposts"] },
    languageSection: { label: "Languages", title: "One city can hold many mother tongues.", body: "Interface and content languages are independent. Read Chinese experience in Tokyo, find Japanese voices in Toronto, or understand nearby life in English in Los Angeles.", chips: ["中文", "English", "日本語", "한국어", "Français", "Español"], contextTitle: "Language-aware discovery", contextLabel: "Discovery context", regionLabel: "Current region", region: "Canada · Toronto", contentLanguageLabel: "Content language", contentLanguage: "Japanese", priorityLabel: "Shown first", priority: ["Japanese content in Toronto", "Japanese content in Canada", "Noteworthy Japanese content across Machi", "Relevant Toronto content in other languages"] },
    useCaseSection: { label: "City moments", title: "Made for real life in a city." },
    businessSection: { label: "Business", title: "Good local services should be found at the moment they are needed.", body: "Verified businesses and service providers can publish services, offers, hiring, and events in the right city, channel, and language. Clear about who they are, and relevant to the people they hope to reach.", primary: "Apply for partnership", secondary: "View ad plans", consoleLabel: "Business console", consoleTitle: "Tokyo partner campaign", verified: "Verified business", partnerTitle: "Verified local partner", partnerBody: "Verification details, service content, city reach, order leads and channel operations.", campaigns: [["Restaurant offers and dining events", "Verified business"], ["Language school trial classes", "Service content"], ["Local hiring and service leads", "City channel"]] },
	    safetySection: { label: "Safety", title: "Real connection needs clear boundaries.", body: "From public conversations and in-person gatherings to housing, secondhand exchange, hiring, and local services, Machi uses prompts, reporting, blocking, review, and account action to protect the space around every interaction." },
	    download: { label: "Start with your city", title: "Download Machi", body: "Machi Web Beta is available now. After registration, you can use city home, discovery and search, notifications, messages, posting, profiles and community participation. The iOS and Android apps are in preparation, and App Store / Google Play availability will be marked clearly when ready.", primary: "Get app launch updates", secondary: "Join local community", appStore: "iOS: Coming soon", googlePlay: "Android: Coming soon", webBeta: "Web Beta: Live now", formLabel: "Launch updates", formTitle: "Notify me when the app launches", email: "Email", cityLabel: "Preferred city", languageLabel: "Language preference", intentLabel: "I want to use Machi for", cityOptions: ["Tokyo", "Los Angeles", "Toronto", "Other city"], languageOptions: ["English", "中文", "日本語"], intentOptions: ["Local life info", "Community participation", "Food meetups", "Event groups", "Language exchange", "Housing", "Secondhand", "Jobs", "Hiring", "Business promotion", "Local services"], notify: "Notify me", sending: "Sending…", success: "Received. We'll notify you when the iOS / Android app launches; you can use Machi on the Web now.", errorInvalid: "That email does not look right. Please double-check.", errorSubmit: "Could not submit just now. Please try again.", benefitsTitle: "What you will get", benefits: [["Web Beta access", "City home, discovery, search, notifications, messages, posting and profiles are available on the Web."], ["App launch notices", "Be notified when iOS and Android are ready."], ["More cities and guides", "Updates for new cities, new countries and Japan Guide." ]], privacy: "We only email you about app launch, city openings and guide updates. We never sell your email or sign you up for other lists." },
    faqSection: { label: "FAQ", title: "Questions before launch." },
    common: { open: "Open" },
	    footer: { tagline: "Find the echoes of life in every city.", description: "A place for questions to land, experience to remain, and sincere local voices to reach one another.", groups: [["Navigation", ["About", "Features", "Guide", "Business", "Safety", "FAQ"]], ["Partnership", ["Business", "Advertising", "Hiring promotion", "Housing promotion", "System partnership"]], ["Legal", ["Privacy Policy", "Terms of Service", "Membership Terms", "Service Terms", "Refund Policy", "Community Guidelines", "Commercial Disclosure", "Cookie Policy", "Contact"]]] },
    cities: withCityTone([
      { name: "Tokyo", country: "Japan", description: "Housing warnings, food meetups, language exchange and local groups are being refined first.", posts: "Housing · Dining · Language Exchange · Groups", heat: "Web Beta live", status: "Web Beta live", sampleLabel: "Launch-stage data", languageTags: ["中文", "EN", "日本語"], sceneTags: ["Housing", "Dining", "Language Exchange", "Groups"], highlight: "Shibuya, Shinjuku and bay-area life signals" },
	      { name: "Los Angeles", country: "United States", description: "Jobs, events, dining, local services and multilingual community spaces are in preparation.", posts: "Jobs · Events · Dining · Local Services", heat: "Preparing", status: "Preparing", sampleLabel: "Launch-stage data", languageTags: ["EN", "中文", "日本語"], sceneTags: ["Jobs", "Events", "Dining", "Local Services"], highlight: "Westside, Eastside and service demand" },
      { name: "Toronto", country: "Canada", description: "Housing, jobs, multilingual Q&A and newcomer support are in preparation.", posts: "Housing · Jobs · Multilingual Q&A · Groups", heat: "Preparing", status: "Preparing", sampleLabel: "Launch-stage data", languageTags: ["EN", "中文", "日本語"], sceneTags: ["Housing", "Jobs", "Q&A", "Groups"], highlight: "Newcomer support and local help" },
    ]),
    features: withFeatureMeta([
      { title: "News", badge: "Local alerts", description: "Local news, policy updates, transport alerts and safety reminders." },
      { title: "Guides", badge: "Life tips", description: "Housing, visas, banking, mobile plans, job hunting and daily experience." },
	      { title: "Social", badge: "City topics", description: "Public city topics, local groups, interest communities and mutual help." },
      { title: "Groups", badge: "Local", description: "Food meetups, event groups, sports groups, language exchange and weekend community posts." },
      { title: "Dining", badge: "Tables", description: "Meals, coffee, restaurant visits, food groups and city food discussions." },
      { title: "Events", badge: "Offline", description: "Exhibitions, city walks, classes, board games, sports and local gatherings." },
	      { title: "Language Exchange", badge: "Languages", description: "Chinese, English, Japanese and multilingual learning groups." },
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
      { title: "Weekend food meetup in Shinjuku", heat: "38.9K", category: "Dining" },
      { title: "Shibuya part-time hiring, Japanese N3+", heat: "21.6K", category: "Hiring" },
      { title: "Moving sale: secondhand furniture pickup", heat: "18.4K", category: "Secondhand" },
    ],
    useCases: [
      { title: "New to a city", description: "Read guides, find housing, set up essentials and look for work.", icon: "MapPinned" },
      { title: "Moving or leaving", description: "Sell secondhand items, sublet rooms and find moving services.", icon: "PackageOpen" },
      { title: "Looking for work", description: "Browse hiring, part-time jobs, referrals and interview tips.", icon: "BriefcaseBusiness" },
      { title: "Weekend events", description: "Find food, events, exhibitions and city walks.", icon: "Sparkles" },
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
	      { title: "Community guidelines", body: "Rules cover harassment, hate, scams, impersonation, prohibited offline services, fake events and offline danger." },
    ],
    businessItems: ["Restaurant meetup campaign", "Language school exchange group", "Event organizer local participants", "Gym / class interest community", "Local service leads", "Hiring in city community"],
    faqs: [
	      ["What is Machi?", "Machi is a city-based local life and social community platform organized by country, city and language, covering housing, secondhand deals, jobs, hiring, events, Q&A, local services, business offers, public city topics and lived experience."],
	      ["Is Machi a city community app?", "Yes. Machi is a city-based local life and community platform for local information, city guides, Q&A, community discussions, language exchange groups, events, housing, jobs, services, and business listings. Social features focus on public city topics and community participation, not private-introduction services."],
      ["Is Machi only for Japan?", "No. Machi starts with Japan Guide and selected city communities, then expands to Canada, Australia, the United Kingdom, France, Germany, South Korea, the United States and more countries and cities."],
      ["What is Machi Guide?", "Guide is Machi's city knowledge layer. Japan Guide begins with life, school applications, job hunting, JLPT, school directories, company directories, materials and services."],
      ["What cities are available first?", "We are starting with Japan and refining Tokyo-first city experiences while preparing Osaka, Kyoto and more international cities. Early cities are marked with clear launch status."],
      ["Can I use Machi in my language?", "Yes. Machi separates interface language from content language. Chinese, English and Japanese are being refined first, with more content languages expanding by city demand."],
      ["Can businesses join?", "Yes. Businesses, service providers, recruiters, housing providers, event organizers and education partners can apply for verification or partnership. Machi does not promise fixed exposure or guaranteed customers."],
      ["Can I post housing, jobs or secondhand items?", "Yes. These posts must be truthful, clear and compliant with local law, and may be reviewed, labelled with risk prompts or reported by users."],
      ["How does Machi keep users safe?", "Machi builds reporting, blocking, review, verification and risk prompts into posting, messaging, meetups, housing, secondhand, hiring and local service scenes."],
      ["Is Machi a study abroad agency?", "No. Machi Guide organizes Japan study, career and life resources and may offer service bookings, but Machi's long-term goal is a global city local-life platform."],
      ["Are paid services guaranteed?", "No. Study, career, visa, housing, banking, admission and employment outcomes depend on user materials, third parties and local rules."],
      ["Can I delete my account?", "Yes. Users can manage profile information and request account deletion. Public content may already have been seen or interacted with by others."],
      ["When will the app launch?", "Web Beta is available now. iOS and Android are in preparation; App Store and Google Play status will remain marked Coming soon until official release."],
      ["How can I contact Machi?", "For partnerships, press, business applications, city launch ideas or privacy requests, email hi@machicity.com."],
    ],
  },
  ja: {
    nav: {
      items: [["ホーム", "/"], ["機能", "/features"], ["ガイド", "/guide"], ["ビジネス", "/business"], ["安全", "/safety"], ["概要", "/about"]],
      signIn: "ログイン",
      register: "登録",
      getApp: "アプリを入手",
      openMenu: "メニューを開く",
      closeMenu: "メニューを閉じる",
      language: "言語",
    },
    hero: {
      eyebrow: "街の暮らし・地域のつながり",
      titleTop: "Machi",
      titleBottom: "",
      headline: "すべての街で、暮らしのこだまを見つける。",
      subtitle: "知らない街で必要なのは、情報の多さより、信頼できる手がかりです。どこに住むか、仕事をどう探すか、手続きは何から始めるか。Machi は、街と言語ごとに散らばる暮らしの知恵を、一つの場所へつなぎ直します。",
      supporting: "まずは日本で、暮らし、進学、仕事、地域のつながりを深く整えます。その先は、実際の声に耳を澄ませながら、一つの街、一つの言語ずつ広げていきます。",
      primary: "Web Betaを見る",
      secondary: "創設者の物語を読む",
      tertiary: "Machi Guideを見る",
      quaternary: "事業者提携を申請",
      appStoreCaption: "App Store · まもなく公開",
      appStore: "App Store",
      googlePlayCaption: "Google Play · まもなく公開",
      googlePlay: "Google Play",
      webBetaCaption: "Web 版 · 公開中",
      scrollLabel: "続きを見る",
      stats: [["Web Beta", "利用できます"], ["Japan Guide", "生活 · 進学 · 就職"], ["More regions", "CA · AU · UK · FR · DE · KR"]],
    },
    appMockup: {
      title: "街の鼓動",
      region: "日本 · 東京",
      search: "住まい、落とし穴、食事、中古を検索",
      hotTitle: "東京の鼓動",
      hotSubtitle: "いま起きていること",
      quickEntries: ["ニュース", "ガイド", "中古", "住まい", "仕事", "採用", "グループ", "食事"],
      hotItems: ["東京の住まい、避けたい落とし穴", "新宿の週末ごはん", "渋谷のアルバイト採用"],
      cards: [
        { type: "住まい", title: "東京の住まい、避けたい落とし穴", place: "新宿", heat: "56.2K" },
        { type: "食事", title: "新宿で週末ごはん", place: "新宿", heat: "38.9K" },
        { type: "採用", title: "渋谷のアルバイト採用", place: "渋谷", heat: "21.6K" },
      ],
    },
    brandIntro: {
      label: "Machi とは",
      title: "Machi は情報の一覧でも、眺め続けるためのタイムラインでもありません。",
      body: "街の経験、必要としていること、人から人への返事を、場所、言語、暮らしの場面ごとに整理し、情報を本来の街へ戻します。",
      pillars: [
        ["City-based", "国、地域、都市ごとに整理し、情報を暮らしが起きる場所へ戻します。"],
        ["Language-aware", "画面言語と投稿言語を分け、多言語都市の自然な表現を支えます。"],
        ["Scene-driven", "住まい、中古、仕事、イベント、Q&A、サービス、同じ街のつながりを生活シーンで整理します。"],
        ["Trust-focused", "通報、ブロック、審査、認証、リスク表示で本当のつながりの境界を守ります。"],
      ],
    },
    guideSection: {
      label: "Machi Guide",
      title: "Machi Guide：街を、暮らせる場所として読み解く。",
      body: "日本での手続き、進学、就職、JLPT、学校や企業の情報、地域サービスまで、実際に必要になる順序で整理します。答えを並べるのではなく、次の一歩がわかるガイドを目指します。",
      cta: "Machi Guideを見る",
      expansion: "次の地域：カナダ · オーストラリア · 英国 · フランス · ドイツ · 韓国 · 米国",
      cards: [
        ["日本生活", "銀行口座、携帯、年金、保険、役所手続き、住まい、アルバイト"],
        ["日本進学", "大学院、専門学校、研究計画書、教授連絡、出願書類"],
        ["日本就職", "履歴書、職務経歴書、ES、面接、会社選び、ビザ変更"],
        ["JLPT", "JLPT N5-N1、語彙、文法、読解、聴解、学習資料"],
        ["日本学校データベース", "大学、大学院、専門学校、日本語学校"],
        ["外国人就職会社データベース", "会社情報、業界、職種、面接経験、外国人求職者向け参考情報"],
        ["資料とサービス", "デジタル資料、テンプレート、チェックリスト、翻訳、空港送迎、手続き同行、申請サポート"],
      ],
    },
    brandStory: {
      label: "ブランドストーリー",
      title: "すべての街で、暮らしのこだまを見つける。",
      lead: "街は、道や建物だけでできているわけではありません。そこに暮らす人たちが、毎日少しずつ書き足していく生活の記録です。",
      cityLines: [
        "東京は電車、ネオン、高層ビルだけではない。",
        "大阪は街並み、食べ物、人の流れだけではない。",
        "上海は外灘と夜景だけではない。",
        "杭州は西湖と江南だけではない。",
        "ロサンゼルスは太陽と高速道路だけではない。",
        "トロントは湖岸、ストリートカー、遠さだけではない。",
      ],
      paragraphs: [
        "「この辺りは住みやすいですか」という問いや、街を離れる前に譲られる一台の机の中に、暮らしはあります。",
        "面接を終えた人のメモ、住まいの注意点、週末の誘い、誰かが丁寧に書いた返事にも、街の輪郭がにじみます。",
        "どれも大きな声ではありません。だからこそ、チャットやタイムラインの新しい話題に埋もれ、すぐ見えなくなってしまいます。",
        "Machi は、その声をもう一度街へ戻します。偶然目にするだけでなく、必要なときにたどり着ける経験へ変えるために。",
        "Machi に並ぶのは、抽象的なコンテンツではありません。いま、ここで営まれている暮らしです。",
        "住所は居場所を示します。でも、街を自分の場所に変えるのは、そこで見つけた日常です。",
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
    founder: {
      eyebrow: "創設者から",
      title: "姚凱です。Machi は、異国で暮らしを一からつくった日々から生まれました。",
      name: "姚凱 / YAOKAI",
      role: "Machi City 創設者 / プロダクトビルダー",
      meta: "2019年10月、留学のため来日",
      avatar: "姚",
      readMore: "創設者のストーリーを読む",
      bio: "2019年、留学のため日本へ来ました。Machi の出発点は、抽象的な事業計画ではありません。住まいを探し、手続きを覚え、仕事を探しながら、知らない街で暮らしを組み立てていった実感です。",
      quote: "「増やしたかったのは情報ではなく、知らない街で暮らし始める人が、次の一歩を見つけられる場所でした。」",
      paragraphs: [
        "姚凱です。Machi をゼロからつくっています。",
        "2019年10月、留学生として日本に来ました。新しい国で難しかったのは、大きな壁が一つあったことではありません。住まい、手続き、仕事、日々の買い物。小さくても避けて通れない問いが、毎日のように続くことでした。",
        "答えはどこかにあります。ただ、チャットやSNS、地域サイト、友人の記憶、いくつもの言語の中に散らばり、初めて来た人には確かめにくい。長く暮らす人にとっても、経験をきちんと残せる場所は多くありません。",
        "その実感が Machi の原点です。冷たい情報庫でも、終わりのないタイムラインでもなく、街の知恵や必要としていること、人から人への応答が、あるべき場所に収まるプロダクトをつくりたいと思いました。",
        "Machi という名は、日本語の「街 / まち」から取りました。私にとって街は、地図上の点ではありません。暮らし方を覚え、人と出会い、ときにはもう一度始める場所です。",
        "小さくても大切な声を、流れて消えるままにしない。誰かの問いに、すでにその道を歩いた人の経験が届き、知らない街で少し早く自分の歩幅を見つけられる。Machi を、そんな場所に育てていきます。",
      ],
      closing: "散らばる情報に、街という輪郭を。\n知らない土地に、暮らしの手がかりを。\nそして、声を上げた人に、きちんと届く応答を。",
      siteEyebrow: "Machi の外側で",
      siteTitle: "書き、考え、つくり続けています。",
      siteBody: "yaokai.me では、プロダクトづくりの記録、ここまで歩いてきた道、いま形にしている仕事を綴っています。履歴書というより、制作の現在地に近い場所です。",
      siteCta: "yaokai.me へ",
    },
    announcementsSection: { label: "お知らせ", title: "Machi からのお知らせ", body: "プロダクトの進捗、公開予定の街、先行利用、提携に関する情報をお届けします。", manageHint: "最新の公式情報は、こちらでご確認ください。", manageLabel: "お知らせ一覧", composerTitle: "お知らせを公開", titlePlaceholder: "例：東京チャンネルを近日公開します", bodyPlaceholder: "お知らせの本文を入力", publish: "公開", empty: "本文を入力してください。", saved: "お知らせを公開しました。", tabs: ["お知らせ", "ニュース", "アプリ更新", "ご案内", "トピック"], defaultItems: [{ type: "お知らせ", title: "Machi Web Beta を公開しました", date: "2026.06", body: "登録後、街のホーム、検索、通知、メッセージ、投稿、プロフィール、地域コミュニティを利用できます。" }, { type: "ニュース", title: "日本 Guide を公開しました", date: "2026.06", body: "暮らし、進学、就職、JLPT、学校・企業情報、資料、サービスを順次整えています。" }, { type: "アプリ更新", title: "Google ログインに対応しました", date: "2026.06", body: "Web と iOS で Google ログインを利用できます。App Store / Google Play 版は引き続き準備中です。" }, { type: "ご案内", title: "新しい国と街を準備しています", date: "2026.06", body: "カナダ、オーストラリア、英国、フランス、ドイツ、韓国、米国などへ、街ごとに展開していきます。" }, { type: "トピック", title: "ビジネス提携の受付を始めました", date: "2026.06", body: "店舗、採用担当、不動産、地域サービス事業者からのご相談を受け付けています。" }] },
    citySection: {
      label: "都市",
      title: "最初の街は、毎日の暮らしから。",
      body: "Machi は、街ごとの声を確かめながら育ちます。まず日本でガイド、サービス、地域コミュニティを磨き、その後、実際の需要に合わせて海外の街へ広げます。",
      badge: "初期公開データ",
      switcherLabel: "現在の都市",
      switcherActive: "日本 · 東京",
      switcherHint: "切り替え",
      switcherCities: ["ロサンゼルス", "トロント", "上海", "杭州"],
      sampleNote: "Preview：投稿、熱度、都市ステータスは初期プロダクト参考データであり、実際の運用データではありません。",
    },
	    featureSection: {
	      label: "都市チャンネル",
	      title: "街のさまざまな用事に、わかりやすい居場所を。",
      body: "住まい、仕事、譲り合い、イベント、相談、地域サービス。街と言語、暮らしの場面ごとに整理し、必要な情報へ迷わずたどり着けるようにします。",
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
          description: "地域グループ、イベント、言語交換、Q&A、生活上の注意を見つける。",
          channels: ["social", "meetups", "dining", "events", "language-exchange", "avoid"] as const,
        },
      ],
    },
	    trendingSection: { label: "トレンド", title: "街で話題のことを見る。", subtitle: "熱度はいいね、コメント、保存、再投稿、時間減衰をもとに、今その都市で注目すべき内容を表示します。", cardTitle: "東京トレンド", cardSubtitle: "都市ランキング", formulaTitle: "熱度の式", heatLabel: "熱度", formula: ["いいね", "コメント", "保存", "再投稿"] },
    languageSection: { label: "多言語", title: "一つの街に、いくつもの母語があっていい。", body: "画面の言語と、読むコンテンツの言語は別々に選べます。東京で中国語の経験を読み、トロントで日本語の声を探し、ロサンゼルスの暮らしを英語で知ることができます。", chips: ["中文", "English", "日本語", "한국어", "Français", "Español"], contextTitle: "言語に合わせた発見", contextLabel: "表示の条件", regionLabel: "現在の地域", region: "カナダ · トロント", contentLanguageLabel: "コンテンツ言語", contentLanguage: "日本語", priorityLabel: "優先して表示", priority: ["トロントの日本語投稿", "カナダの日本語投稿", "Machi 全体で注目されている日本語投稿", "トロントの関連する他言語投稿"] },
    useCaseSection: { label: "街の場面", title: "毎日の暮らしから設計する。" },
    businessSection: { label: "ビジネス", title: "良い地域サービスを、必要な瞬間に見つけられるように。", body: "認証された店舗や事業者は、街、チャンネル、言語に合わせて、サービス、特典、求人、イベントを掲載できます。誰が届けているのかを明確にし、本当に必要としている人へつなぎます。", primary: "提携を申し込む", secondary: "広告プランを見る", consoleLabel: "ビジネス管理", consoleTitle: "東京パートナー施策", verified: "認証事業者", partnerTitle: "認証ローカルパートナー", partnerBody: "認証情報、サービス内容、街での掲載、問い合わせ導線、チャンネル運営。", campaigns: [["レストランの特典と食事会", "認証事業者"], ["語学学校の体験レッスン", "サービス内容"], ["地域の求人とサービス相談", "都市チャンネル"]] },
	    safetySection: { label: "安全", title: "人とつながる場所には、明確な境界が必要です。", body: "公開のやり取りや対面の集まりから、住まい、譲り合い、求人、地域サービスまで。注意喚起、通報、ブロック、審査、アカウント対応によって、一つひとつのやり取りを守ります。" },
	    download: { label: "都市から始めよう", title: "Machi をダウンロード", body: "Machi Web Beta は現在利用できます。登録後、都市ホーム、発見と検索、通知、メッセージ、投稿、プロフィール、コミュニティ参加を使えます。iOS と Android アプリは準備中で、App Store / Google Play の提供状況は公開時に明確に表示します。", primary: "アプリ公開通知を受け取る", secondary: "地域コミュニティに参加", appStore: "iOS：近日公開", googlePlay: "Android：近日公開", webBeta: "Web Beta：公開中", formLabel: "公開通知", formTitle: "アプリ公開時に通知を受け取る", email: "Email", cityLabel: "Preferred city", languageLabel: "Language preference", intentLabel: "I want to use Machi for", cityOptions: ["Tokyo", "Los Angeles", "Toronto", "その他の都市"], languageOptions: ["日本語", "English", "中文"], intentOptions: ["ローカル生活情報", "コミュニティに参加", "食事の集まり", "イベントグループ", "言語交換", "住まい", "中古", "仕事探し", "求人", "事業者プロモーション", "地域サービス"], notify: "通知を受け取る", sending: "送信中…", success: "受け付けました。iOS / Android アプリ公開時にお知らせします。現在は Web 版で Machi を利用できます。", errorInvalid: "メールアドレスの形式を確認してください。", errorSubmit: "送信に失敗しました。時間をおいて再度お試しください。", benefitsTitle: "登録後に受け取れる内容", benefits: [["現在利用できる Web Beta", "都市ホーム、発見、検索、通知、メッセージ、投稿、プロフィールを Web で利用できます。"], ["アプリ公開通知", "iOS と Android の準備が整った時にお知らせします。"], ["都市とガイドの更新", "新しい都市、国、日本 Guide の更新を受け取れます。"]], privacy: "アプリ公開、都市公開、ガイド更新以外でメールは送りません。メールアドレスを販売することも、他のリストに登録することもありません。" },
    faqSection: { label: "よくある質問", title: "ローンチ前に知りたいこと。" },
    common: { open: "開く" },
	    footer: { tagline: "すべての街で、暮らしのこだまを見つける。", description: "問いに行き先を。経験に残る場所を。街の中の誠実な声が、互いに届くために。", groups: [["ナビ", ["概要", "機能", "ガイド", "ビジネス", "安全", "FAQ"]], ["提携", ["店舗提携", "広告掲載", "採用プロモーション", "住まいプロモーション", "システム提携"]], ["法務", ["プライバシー", "利用規約", "会員規約", "サービス予約規約", "返金ポリシー", "コミュニティ規範", "特定商取引法に基づく表記", "Cookie ポリシー", "お問い合わせ"]]] },
	    cities: withCityTone([{ name: "Tokyo", country: "Japan", description: "住まいの注意、食事、言語交換、地域グループを先に磨いています。", posts: "Housing · Dining · Language Exchange · Groups", heat: "Web Beta live", status: "Web Beta live", sampleLabel: "初期公開データ", languageTags: ["中文", "EN", "日本語"], sceneTags: ["Housing", "Dining", "Language Exchange", "Groups"], highlight: "渋谷、新宿、湾岸の暮らし" }, { name: "Los Angeles", country: "United States", description: "仕事、イベント、食事、地域サービス、多言語コミュニティを準備中です。", posts: "Jobs · Events · Dining · Local Services", heat: "Preparing", status: "Preparing", sampleLabel: "初期公開データ", languageTags: ["EN", "中文", "日本語"], sceneTags: ["Jobs", "Events", "Dining", "Local Services"], highlight: "地域ごとの生活とサービス需要" }, { name: "Toronto", country: "Canada", description: "住まい、仕事、多言語 Q&A、新しい街での生活サポートを準備中です。", posts: "Housing · Jobs · Multilingual Q&A · Groups", heat: "Preparing", status: "Preparing", sampleLabel: "初期公開データ", languageTags: ["EN", "中文", "日本語"], sceneTags: ["Housing", "Jobs", "Q&A", "Groups"], highlight: "新しい街での生活サポート" }]),
	    features: withFeatureMeta([{ title: "ニュース", badge: "News", description: "地域ニュース、制度、交通、安全に関するお知らせ。" }, { title: "ガイド", badge: "Guides", description: "住まい、ビザ、銀行、携帯、各種手続き、生活の知恵。" }, { title: "街の話題", badge: "City topics", description: "公開の地域トピック、ローカルグループ、趣味のコミュニティ。" }, { title: "グループ", badge: "Local", description: "食事会、イベント、スポーツ、言語交換、週末の集まり。" }, { title: "食事", badge: "Dining", description: "食事会、カフェ、店巡り、街の食にまつわる話題。" }, { title: "イベント", badge: "Events", description: "展示、まち歩き、講座、ボードゲーム、スポーツ、交流会。" }, { title: "言語交換", badge: "Language Exchange", description: "中国語、英語、日本語などを学び合う地域グループ。" }, { title: "住まい", badge: "Housing", description: "賃貸、転貸、シェア、ルームメイト、契約時の注意点。" }, { title: "譲り合い", badge: "Secondhand", description: "不要品、探し物、引っ越し前の譲渡、無料のお譲り。" }, { title: "仕事探し", badge: "Jobs", description: "アルバイト、正社員、インターン、リモート、求職経験。" }, { title: "求人", badge: "Hiring", description: "地域の店舗、企業、団体からの募集情報。" }, { title: "Q&A", badge: "Q&A", description: "ビザ、住まい、仕事、学校、医療など、街の暮らしに関する相談。" }, { title: "サービス", badge: "Services", description: "引っ越し、翻訳、ビザ、留学、保険、修理、税務。" }, { title: "注意情報", badge: "Avoid", description: "住まい、取引、求人、イベント、対面時の注意点。" }]),
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
	      { title: "Community guidelines", body: "嫌がらせ、ヘイト、詐欺、なりすまし、禁止されたオフラインサービス、虚偽イベント、危険な対面行為を禁止します。" },
    ],
    businessItems: ["Restaurant local campaign", "Language school exchange group", "Event organizer city campaign", "Gym / class interest community", "Local service leads", "Hiring in city community"],
    faqs: [["Machi とは？", "Machi は、国・都市・言語ごとに暮らしの情報と人のつながりを整理するローカルライフ・コミュニティプラットフォームです。住まい、中古品、仕事、求人、イベント、Q&A、地域サービス、お店の情報、同じ街のつながり、実際の生活経験を扱います。"], ["Machi はデーティングアプリですか？", "いいえ。Machi はデーティングサービスまたはマッチメイキングサービスではありません。Machi は、都市と言語ごとに地域情報、都市ガイド、Q&A、コミュニティ投稿、言語交換グループ、イベント、住まい、仕事、サービス、事業者情報を整理するローカルライフ・コミュニティプラットフォームです。Machi は、恋愛マッチング、結婚紹介、同伴サービス、有料同伴、アダルトサービス、一対一のデート紹介を提供しません。"], ["Machi は日本だけのサービスですか？", "いいえ。Machi は日本 Guide と一部都市コミュニティから始まり、今後カナダ、オーストラリア、英国、フランス、ドイツ、韓国、米国などへ広がります。"], ["Machi Guide とは？", "Guide は Machi の都市知識レイヤーです。日本では生活、進学、就職、JLPT、学校データベース、会社データベース、資料、サービスから始めます。"], ["最初に利用できる都市は？", "まず日本と東京を中心に体験を磨きながら、大阪、京都、海外都市を準備しています。初期都市は公開ステータスを明記します。"], ["自分の言語で使えますか？", "使えます。Machi は画面言語と投稿言語を分けて扱います。中国語、英語、日本語を先に整え、都市の需要に合わせて広げます。"], ["事業者は参加できますか？", "参加できます。店舗、サービス提供者、採用担当、住まい関連、イベント主催者、教育機関は認証や提携を申請できます。ただし一定の集客や成果は保証しません。"], ["住まい、求人、中古品を投稿できますか？", "できます。内容は正確で分かりやすく、現地法に従う必要があります。審査、リスク表示、通報の対象になる場合があります。"], ["Machi はどう安全を守りますか？", "投稿、メッセージ、対面、住まい、中古品、求人、地域サービスに通報、ブロック、審査、認証、リスク表示を組み込みます。"], ["Machi は留学エージェントですか？", "いいえ。Machi Guide は日本の進学、就職、生活情報を整理し、予約サービスを扱う場合もありますが、Machi の長期目標は世界の都市生活プラットフォームです。"], ["有料サービスは結果を保証しますか？", "保証しません。進学、就職、ビザ、住まい、口座開設、合格、採用などの結果は、本人の資料、第三者、現地ルールに左右されます。"], ["アカウントを削除できますか？", "できます。プロフィール管理やアカウント削除申請ができます。公開投稿は、すでに他のユーザーに見られている場合があります。"], ["アプリはいつ公開されますか？", "Web Beta は利用できます。iOS と Android は準備中で、正式公開までは App Store / Google Play を Coming soon と表示します。"], ["Machi に連絡するには？", "提携、取材、事業者申請、都市展開の提案、プライバシー関連の問い合わせは hi@machicity.com までご連絡ください。"]],
  },
} satisfies Record<MarketingLocale, {
  nav: { items: Array<[string, string]>; signIn: string; register: string; getApp: string; openMenu: string; closeMenu: string; language: string };
  hero: { eyebrow: string; titleTop: string; titleBottom: string; headline: string; subtitle: string; supporting: string; primary: string; secondary: string; tertiary: string; quaternary: string; appStoreCaption: string; appStore: string; googlePlayCaption: string; googlePlay: string; webBetaCaption: string; scrollLabel: string; stats: Array<[string, string]> };
  appMockup: { title: string; region: string; search: string; hotTitle: string; hotSubtitle: string; quickEntries: string[]; hotItems: string[]; cards: Array<{ type: string; title: string; place: string; heat: string }> };
  brandIntro: { label: string; title: string; body: string; pillars: Array<[string, string]> };
  guideSection: { label: string; title: string; body: string; cta: string; expansion: string; cards: Array<[string, string]> };
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
  founder: {
    eyebrow: string;
    title: string;
    name: string;
    role: string;
    meta: string;
    avatar: string;
    readMore: string;
    bio: string;
    quote: string;
    paragraphs: string[];
    closing: string;
    siteEyebrow: string;
    siteTitle: string;
    siteBody: string;
    siteCta: string;
  };
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
