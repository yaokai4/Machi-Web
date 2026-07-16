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
  ["services", "Store", "green"],
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
        ["商家", "/business"],
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
      eyebrow: "本地生活 · 同城社区",
      titleTop: "Machi",
      titleBottom: "",
      headline: "在每一座城市，找到生活的回声。",
      subtitle: "从住在这里的人开始认识一座城市。租房、找工作、二手、约局、活动，加一个懂日本的 Machi AI——按你的城市和语言，收在一处。",
      supporting: "先把日本做透，再谈下一站。",
      primary: "打开网页版",
      secondary: "查看创始人故事",
      appStoreCaption: "iOS 现已上线",
      appStore: "App Store",
      googlePlayCaption: "Android 开发中",
      googlePlay: "Google Play",
      scrollLabel: "继续浏览",
      stats: [
        ["iOS + Web", "双端已上线"],
        ["日本指南", "生活 · 升学 · 就职"],
        ["更多城市", "韩 · 澳 · 加 · 美 · 英"],
      ],
    },
    appMockup: {
      title: "城市经验",
      region: "日本 · 东京",
      search: "搜索租房、经验、美食、二手",
      hotTitle: "东京脉搏",
      hotSubtitle: "正在发生",
      quickEntries: ["新闻", "攻略", "二手", "租房", "工作", "招聘", "小组", "美食"],
      hotItems: ["东京租房避坑指南", "新宿周末美食", "涩谷兼职招聘"],
      cards: [
        { type: "租房", title: "东京租房避坑指南", place: "新宿", heat: "856" },
        { type: "美食", title: "新宿周末美食聚会讨论", place: "新宿", heat: "423" },
        { type: "招聘", title: "涩谷兼职招聘，日语 N3 以上", place: "涩谷", heat: "312" },
      ],
    },
    guideSection: {
      label: "Machi Guide",
      title: "先把在日本生活这件事，讲明白。",
      body: "从银行卡、手机卡、年金到役所手续，从升学、求职到 JLPT。Machi Guide 把真正会遇到的流程一步步拆开，需要的服务也放在清楚的位置。",
      cta: "进入 Machi Guide",
      expansion: "下一步扩展：加拿大 · 澳大利亚 · 英国 · 法国 · 德国 · 韩国 · 美国",
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
    machiAiSection: {
      label: "Machi AI · 智能助手",
      title: "在日本遇到问题，先问 Machi AI。",
      body: "用中文、日文或英文提问。Machi AI 结合 Machi 的学校库、公司库与指南，把在留手续、租房、升学、就职的问题，一步步说清楚。",
      cta: "开始和 Machi AI 对话",
      bullets: [
        "懂在日生活：在留、役所、租房、打工、保险",
        "回答有依据：基于 Machi 指南、学校库与公司库",
        "三语都行：中文 · 日本語 · English，随时切换",
      ],
      chips: ["刚来日本第一周要办什么？", "租房初期费用怎么看？", "大学院申请第一步做什么？", "新卒就职的时间线？"],
      sampleQuestion: "在留卡快到期了，我该怎么续？",
      sampleAnswer: "到期前 3 个月就可以办。带上在留卡、护照、证件照和「在留期間更新許可申請書」到所在地入管局提交；学生还需在学证明，工作者需在职证明。建议尽早预约、避开月末高峰。",
      sourceLabel: "参考自 Machi 指南",
    },
    brandStory: {
      label: "为什么做 Machi",
      title: "刚到一个陌生的地方，答案能查到一堆，难的是判断哪个还算数、哪个跟你有关。",
      lead: "租房、办手续、找工作、考级——这些答案散在几十个群、无数帖子和别人的记性里，过时的和有用的混在一起。",
      cityLines: [
        "一份写清楚坑在哪的租房经验。",
        "一个今晚有人一起吃饭的约局。",
        "一台搬家前想转给下一个人的冰箱。",
        "一份办完手续后留下的步骤清单。",
        "一家日本朋友才知道的小店。",
        "一个同城陌生人认真写下的回答。",
      ],
      paragraphs: [
        "有人刚落地，在纠结先办手机卡还是银行卡；有人住了五年，愿意把踩过的坑讲清楚。",
        "有人在找房、找工作、出掉搬不走的家具；有人只想知道这周末附近有什么值得去。",
        "这些事凑到一起，才决定一个人能不能在异国安顿下来。",
        "Machi 把这些零散的经验收起来，标上时间、地点和是谁写的，让它对下一个人还管用。",
        "你查到的每一条，都带着谁走过、什么时候、结果怎样，而不再是一句干巴巴的说法。",
        "一个地方从陌生到熟悉，往往就是从「我知道该怎么办了」那一刻开始的。",
      ],
      highlights: [
        ["问一句", "这个区适合一个人住吗？"],
        ["查经验", "租房、办卡、找工作、避坑。"],
        ["找机会", "招聘、二手、活动、本地服务。"],
      ],
      echoLabel: "经验怎么传下去",
      echoNodes: ["有人写下", "被看到", "被用上", "帮到下一个"],
      closing: "把你踩过的坑写下来，也总有人已经替你写过。",
    },
    founder: {
      eyebrow: "创始人的话",
      title: "我是姚凯。做 Machi，是因为我自己在日本从零开始过一次。",
      name: "姚凯 / YAOKAI",
      role: "Machi 创始人 · 产品创作者",
      meta: "2019 年 10 月来到日本",
      avatar: "姚",
      readMore: "阅读完整创始人故事",
      bio: "刚来那阵子，租房、办手续、找工作、考级，答案散在各种群和帖子里，过时的、跟我没关系的，全混在一起。Machi 想做的事很简单：把这些收到一处，按城市和语言，让后来的人少绕点路。",
      quote: "“一座城市会变得亲切，是因为有人把走过的路留了下来，也有人在你需要时搭一把手。”",
      paragraphs: [
        "我是姚凯，Machi 的创始人，产品、设计和开发也一直是我自己在做。",
        "在日本待久了才发现，信息从来不缺，缺的是带着来处的答案——发生在哪、什么时候、谁亲身走过、今天还算不算数。",
        "一个租房提醒、一份办事顺序、一段面试经历、一句对某家店的实话，可能就是别人少走弯路的起点。",
        "可这些东西散在群聊、社交平台、地方论坛和朋友的记忆里，还被语言隔开。刚来的人难判断，老手想好好分享，也找不到一个能长期留住它们的地方。",
        "于是有了 Machi。租房、找工作、二手、问答、本地服务和社区，都回到具体的城市和语言里；信息带着时间、地点和来处，人也能在需要时找到彼此。",
        "Machi 这个名字来自日语的「街（まち）」——一个人慢慢学会生活、认识人、把日子重新过顺的地方。",
      ],
      closing: "把有用的经验，留在它发生的地方——后来的人，就能少走一点弯路。",
      siteEyebrow: "继续认识我",
      siteTitle: "Machi 之外，我也在记录自己的创作与生活。",
      siteBody: "在 yaokai.me，我写产品、设计与一路走来的思考，也整理仍在进行中的作品。那里更像一间持续亮着灯的工作室。",
      siteCta: "前往 yaokai.me",
    },
    announcementsSection: {
      label: "公告中心",
      title: "Machi 最新公告。",
      body: "产品进展、城市计划、合作开放和重要通知，都会在这里发布。",
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
        { type: "公告", title: "Machi iOS 版上架 App Store", date: "2026.06", body: "iOS App 正式上架，可在 App Store 免费下载。城市内容、频道、私信、Machi AI 与指南均已可用。" },
        { type: "公告", title: "Machi Web 端正式开放", date: "2026.06", body: "Web 端已上线，无需邀请即可注册。登录后可以浏览城市内容、发帖、私信，并参与公开城市话题和本地小组。" },
        { type: "新闻", title: "日本指南与 Machi AI 上线", date: "2026.06", body: "覆盖生活、升学、就职与 JLPT 的日本指南正式上线；Machi AI 支持三语提问，基于指南与学校、公司库回答。" },
        { type: "App 更新", title: "支持 Google 一键登录", date: "2026.06", body: "Web 与 iOS 都支持用 Google 账号登录，也可以在设置里随时绑定或解绑 Google。" },
        { type: "通知", title: "城市内容持续扩充，更多国家筹备中", date: "2026.06", body: "东京、大阪、京都、横滨的内容持续扩充中；韩国、澳洲、加拿大、美国、英国、法国、德国等地区的指南与城市频道正在陆续筹备，进展以官网公告为准。" },
      ],
    },
    featureSection: {
      label: "城市频道",
      title: "该找的东西，都在它自己的频道里。",
      body: "租房、二手、工作、活动、问答、本地服务，各自有清楚的频道，再按城市和语言呈现。不用翻聊天记录，也不会把不同地方的信息混在一起。",
      groups: [
        {
          key: "info",
          title: "城市信息",
          description: "本地新闻、指南、问答和服务，让新旧居民都能快速看懂这座城市。",
          channels: ["news", "guides", "qa", "services"] as const,
        },
        {
          key: "trade",
          title: "交易与机会",
          description: "租房、二手、找工作、招聘和服务线索。",
          channels: ["housing", "secondhand", "jobs", "hiring"] as const,
        },
        {
          key: "social",
          title: "社区与线下",
          description: "本地小组、活动、语言交换和真实生活里的社区参与。",
          channels: ["social", "meetups", "dining", "events", "language-exchange", "avoid"] as const,
        },
      ],
    },
    languageSection: {
      label: "多语言",
      title: "住在同一座城市，不必说同一种语言。",
      body: "界面语言与内容语言分开选择。在东京读中文经验，用日语搜本地信息，或者全程英文。语言不同，也能看见与自己有关的本地生活。",
      chips: ["简体中文", "繁體中文", "English", "日本語", "한국어（筹备中）", "Français（筹备中）"],
      contextTitle: "多语言推荐",
      contextLabel: "推荐上下文",
      regionLabel: "当前地区",
      region: "日本 · 大阪",
      contentLanguageLabel: "内容语言",
      contentLanguage: "中文",
      priorityLabel: "优先展示",
      priority: ["大阪的中文内容", "关西的中文内容", "全站中文热门内容", "大阪其他语言的高热度内容"],
    },
    businessSection: {
      label: "商家合作",
      title: "认证过的本地服务，出现在正在找它的人面前。",
      body: "通过认证的商家与服务者，可以在对应城市、频道和语言中发布服务、优惠、招聘与活动。用户看得见是谁在提供、能解决什么问题。",
      primary: "预约洽谈",
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
      title: "见面、租房、交易之前，先把边界讲清楚。",
      body: "从公开讨论到线下活动，从租房、二手到招聘。风险提醒、举报、屏蔽、审核与账号处置，让每一次互动都更有依据。",
      more: "了解更多安全措施",
    },
    download: {
      label: "现在就能开始",
      title: "把你的城市，装进口袋。",
      body: "iOS App 已在 App Store 上架，Web 端打开就能用。Android 正在开发，留下邮箱，上线第一时间告诉你。",
      primary: "Android 上线提醒我",
      secondary: "参与本地社区",
      appStore: "iOS：现已上线",
      googlePlay: "Android：开发中",
      webBeta: "Web 端：已上线，免邀请",
      formLabel: "上线提醒",
      formTitle: "Android 上线后提醒我",
      email: "邮箱地址",
      cityLabel: "希望使用的城市",
      languageLabel: "常用语言",
      intentLabel: "我想用 Machi 寻找",
      cityOptions: ["东京", "大阪", "京都", "其他城市"],
      languageOptions: ["中文", "English", "日本語"],
      intentOptions: ["本地生活信息", "参与社区", "美食聚会", "活动小组", "语言交换", "租房", "二手", "找工作", "招聘", "商家推广", "本地服务"],
      notify: "提醒我",
      sending: "正在提交…",
      success: "已收到。Android 版上线时我们会第一时间通知你；现在就可以下载 iOS 版，或直接在 Web 端使用 Machi。",
      errorInvalid: "邮箱格式不正确，请检查后重试。",
      errorSubmit: "提交失败，请稍后再试。",
      benefitsTitle: "你会收到",
      benefits: [
        ["现在就能用的双端", "iOS App 与 Web 端都已上线，注册即用"],
        ["Android 上线提醒", "Android 版就绪时第一时间通知你"],
        ["更多城市与指南", "新城市、新国家，以及日本指南的更新"],
      ],
      webFeatures: ["城市首页", "发现与搜索", "通知", "私信", "发布内容", "个人主页", "本地社区"],
      privacy: "我们只会在 Android 上线、新城市和指南更新时发邮件，不会出售你的邮箱，也不会拿去订阅其他广告。",
    },
    closingCta: {
      eyebrow: "iOS 与 Web 已上线",
      title: "现在，打开你的城市。",
      body: "三种语言，随时切换。免费开始。",
      appStore: "App Store 下载",
      web: "打开网页版",
      note: "Android 开发中，上线会在官网公布。",
    },
    faqSection: { label: "常见问题", title: "关于 Machi，你可能想知道的事。" },
    common: { open: "进入" },
    footer: {
      tagline: "在每一座城市，找到生活的回声。",
      groups: [
        ["导航", ["关于", "功能", "指南", "商家合作", "安全", "FAQ", "城市", "下载"]],
        ["合作", ["商家合作", "广告投放", "招聘推广", "租房推广", "系统合作"]],
        ["法律", ["隐私政策", "服务条款", "会员条款", "服务预约条款", "退款政策", "社区规则", "商业披露", "資金決済法表示", "Cookie 政策", "联系我们"]],
      ],
    },
    cities: withCityTone([
      { name: "东京", country: "日本", description: "租房避坑、美食、语言交换和本地小组，在这里最先展开。", posts: "租房 · 美食 · 语言交换 · 本地小组", heat: "已开放", status: "已开放", sampleLabel: "页面预览", languageTags: ["中文", "EN", "日本語"], sceneTags: ["租房", "美食", "语言交换", "本地小组"], highlight: "涩谷、新宿和湾岸生活经验" },
      { name: "大阪", country: "日本", description: "租房、美食、工作和关西生活经验。", posts: "租房 · 美食 · 工作 · 本地小组", heat: "已开放", status: "已开放", sampleLabel: "页面预览", languageTags: ["中文", "EN", "日本語"], sceneTags: ["租房", "美食", "工作", "本地小组"], highlight: "梅田、难波和关西生活" },
      { name: "京都", country: "日本", description: "住宿、民宿、学生生活和城市漫步。", posts: "住宿 · 学生生活 · 城市漫步", heat: "已开放", status: "已开放", sampleLabel: "页面预览", languageTags: ["中文", "EN", "日本語"], sceneTags: ["住宿", "学生生活", "漫步"], highlight: "学生城市与旅居生活" },
    ]),
    features: withFeatureMeta([
      { title: "本地新闻", badge: "城市动态", description: "本地快讯、政策提醒、交通提醒和安全提醒。" },
      { title: "城市指南", badge: "实用攻略", description: "求职、留学、租房、签证、银行卡和办事流程——日本指南已上线。" },
      { title: "同城社区", badge: "城市话题", description: "同城话题、本地小组和兴趣社区，围绕城市生活展开。" },
      { title: "活动小组", badge: "本地参与", description: "美食聚会、活动小组、运动小组、语言交换和周末本地活动。" },
      { title: "美食", badge: "一起吃饭", description: "美食聚会、探店、城市美食讨论和本地饮食活动。" },
      { title: "活动", badge: "线下生活", description: "展览、城市漫步、桌游、运动、课程和城市活动。" },
      { title: "语言交换", badge: "多语言", description: "中文、英文、日文等语言交换小组和学习讨论。" },
      { title: "租房", badge: "房源与合租", description: "找房、转租、合租、找室友、租房避坑。" },
      { title: "二手", badge: "闲置流转", description: "闲置转让、求购、搬家甩卖、免费赠送。" },
      { title: "找工作", badge: "职业机会", description: "兼职、全职、实习、远程、内推和求职经验。" },
      { title: "招聘", badge: "本地岗位", description: "本地商家、企业、机构发布招聘和行业社群机会。" },
      { title: "问答", badge: "Q&A", description: "签证、租房、工作、学校、医疗等本地求助。" },
      { title: "本地服务", badge: "生活所需", description: "餐厅预约、旅行票务、接送交通、翻译手续、搬家清洁和生活开通。" },
      { title: "避坑经验", badge: "风险提醒", description: "租房、交易、招聘、活动和线下见面的风险提醒。" },
    ]),
    safetyItems: [
      { title: "社区互动", body: "不要过早分享住址、证件或财务信息；遇到骚扰、诈骗或冒犯内容，可以举报或拉黑。" },
      { title: "线下见面", body: "初次见面尽量选择公共场所，提前告诉朋友时间和地点，并保留沟通记录。" },
      { title: "租房信息", body: "不要向未经验证的房东提前转账；核对地址、合同和身份，警惕明显低于市场价的房源。" },
      { title: "二手交易", body: "优先在公共场所交易；高价值物品当面验货，不提前支付大额定金。" },
      { title: "求职与招聘", body: "不要支付所谓入职押金；核对公司官网、地址和联系方式，警惕先交钱的高薪职位。" },
      { title: "举报与屏蔽", body: "从举报、屏蔽、内容审核到下架和账号限制，形成清楚的处理链路。" },
    ],
    businessItems: ["餐厅聚餐与优惠活动", "语言学校体验课与交换小组", "活动主办方招募本地参与者", "健身与课程兴趣社群", "本地服务咨询线索", "面向同城社区的招聘"],
    faqs: [
      ["Machi 是什么？", "Machi 把城市生活里真正会用到的信息，按地点和语言整理在一起：指南、问答、租房、二手、工作、招聘、本地服务、小组与活动，以及来自真实生活的经验。"],
      ["Machi 是交友或约会软件吗？", "不是。Machi 的交流功能服务于公开的城市话题、本地小组、语言交换与活动参与，不提供恋爱匹配、私人介绍或付费陪伴。"],
      ["Machi 只做日本吗？", "不是。我们先从日本开始，把体验认真做好，再根据真实需求与当地准备情况逐步进入更多国家。"],
      ["Machi Guide 是什么？", "日本指南整理日常生活、升学、求职、JLPT、学校与公司资料、数字内容和相关服务，让你能按需要的顺序找到答案。"],
      ["现在能在哪些城市使用？", "日本的城市都可以使用，东京、大阪、京都、横滨的内容最先充实起来。海外城市会按准备情况逐步开放，并清楚标明当前状态。"],
      ["我可以使用自己的语言吗？", "可以。界面语言和内容语言分开选择。中文、英文和日文会优先完善，更多语言将根据各城市的实际需要增加。"],
      ["商家和本地服务可以加入吗？", "可以。门店、服务提供者、招聘方、房产相关机构、活动主办方与教育机构都可以申请认证或合作。认证不代表固定曝光，也不承诺结果。"],
      ["可以发布租房、招聘或二手信息吗？", "可以。内容需要真实、清楚并遵守当地法律；根据具体情况，平台可能进行审核、添加风险提示或处理用户举报。"],
      ["Machi 如何保护用户安全？", "举报、拉黑、审核、认证和风险提示会被放进发帖、私信、线下活动、租房、二手、招聘与本地服务等具体场景。"],
      ["Machi 是留学中介吗？", "不是。日本指南会整理升学、求职与生活信息，也可能提供部分可预约服务；Machi 整体是一款帮助人们在城市里生活的产品。"],
      ["付费服务会保证结果吗？", "不会。升学、就业、签证、租房、开户、录取等结果取决于个人情况、提交材料、第三方机构与当地规则。"],
      ["我可以删除账号吗？", "可以。你可以管理个人资料并申请删除账号；公开发布的内容在删除前，可能已经被其他用户看到或回应。"],
      ["App 现在能下载吗？", "可以。iOS 版已在 App Store 上架，免费下载；Web 端打开就能用。Android 版正在开发，上线时间会通过官网公布。"],
      ["如何联系 Machi？", "合作、媒体采访、商家申请、城市建议或隐私相关问题，请发送邮件至 hi@machicity.com。"],
    ],
  },
  en: {
    nav: {
      items: [
        ["Home", "/"],
        ["Features", "/features"],
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
      eyebrow: "Local life · city community",
      titleTop: "Machi",
      titleBottom: "",
      headline: "Find the echoes of real life in every city.",
      subtitle: "You get to know a city through the people who live there. Housing, jobs, secondhand, meetups, events — plus a Machi AI that knows Japan — sorted by your city and language, all in one place.",
      supporting: "Get Japan right first. The next stop can wait.",
      primary: "Open the web app",
      secondary: "Read the founder's story",
      appStoreCaption: "Available now",
      appStore: "App Store",
      googlePlayCaption: "In development",
      googlePlay: "Google Play",
      scrollLabel: "Continue",
      stats: [
        ["iOS + Web", "available now"],
        ["Japan Guide", "life · study · work"],
        ["More cities", "KR · AU · CA · US · UK"],
      ],
    },
    appMockup: {
      title: "City experience",
      region: "Japan · Tokyo",
      search: "Search housing, tips, dining, secondhand",
      hotTitle: "Tokyo pulse",
      hotSubtitle: "Happening now",
      quickEntries: ["News", "Guides", "Used", "Housing", "Jobs", "Hiring", "Groups", "Dining"],
      hotItems: ["Tokyo housing — what to avoid", "Shinjuku weekend dinners", "Shibuya part-time hiring"],
      cards: [
        { type: "Housing", title: "Tokyo housing — what to avoid", place: "Shinjuku", heat: "856" },
        { type: "Dining", title: "Weekend food meetup in Shinjuku", place: "Shinjuku", heat: "423" },
        { type: "Hiring", title: "Part-time hiring in Shibuya", place: "Shibuya", heat: "312" },
      ],
    },
    guideSection: {
      label: "Machi Guide",
      title: "A clearer way through life in Japan.",
      body: "Bank accounts, phone plans, pension, city-office paperwork. Study, careers, JLPT. Machi Guide walks through the steps people actually face, with useful services close at hand.",
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
    machiAiSection: {
      label: "Machi AI · Assistant",
      title: "Stuck in Japan? Ask Machi AI first.",
      body: "Ask in Chinese, Japanese, or English. Machi AI draws on Machi's school library, company library, and guides to walk you through residence procedures, housing, study, and work — step by step.",
      cta: "Start chatting with Machi AI",
      bullets: [
        "Knows life in Japan: residence, city hall, housing, work, insurance",
        "Grounded answers: built on Machi guides, schools & companies",
        "Trilingual: 中文 · 日本語 · English, switch anytime",
      ],
      chips: ["What to do my first week in Japan?", "How do rental upfront costs work?", "First step for grad school?", "New-grad job-hunting timeline?"],
      sampleQuestion: "My residence card is expiring — how do I renew it?",
      sampleAnswer: "You can apply up to 3 months before expiry. Bring your residence card, passport, a photo, and the renewal application to your regional immigration office; students also need proof of enrollment, workers proof of employment. Book early and avoid the month-end rush.",
      sourceLabel: "From Machi guides",
    },
    brandStory: {
      label: "Why we built Machi",
      title: "When you're new somewhere, answers are everywhere. The hard part is telling which ones still hold and which ones are about you.",
      lead: "Housing, paperwork, job-hunting, exams — the answers are scattered across dozens of group chats, countless posts, and other people's memories, the outdated mixed in with the useful.",
      cityLines: [
        "A rental writeup that spells out exactly where the traps are.",
        "A meetup where someone's grabbing dinner tonight.",
        "A fridge someone wants to pass on before they move.",
        "A step-by-step checklist left behind once the paperwork's done.",
        "A small place only your Japanese friends know about.",
        "A careful answer from a stranger in the same city.",
      ],
      paragraphs: [
        "Someone just landed and can't decide whether to sort a phone plan or a bank account first. Someone else has been here five years and is happy to spell out the mistakes they made.",
        "Some people are hunting for a place, a job, or a buyer for furniture they can't take with them. Others just want to know what's worth doing nearby this weekend.",
        "Put it all together, and it's what decides whether someone can actually settle into a new country.",
        "Machi gathers these scattered bits of experience and tags each one with when, where, and who wrote it, so it still works for the next person.",
        "Everything you find comes with who went through it, when, and how it turned out — not one more flat, context-free line.",
        "A place usually goes from strange to familiar the moment you can say, I know what to do now.",
      ],
      highlights: [
        ["Ask", "Is this neighborhood good for living alone?"],
        ["Look it up", "Housing, paperwork, job-hunting, what to avoid."],
        ["Find leads", "Hiring, secondhand, events, local services."],
      ],
      echoLabel: "How experience gets passed on",
      echoNodes: ["Someone writes it", "It gets seen", "It gets used", "It helps the next person"],
      closing: "Write down the traps you hit — and chances are, someone already wrote down yours.",
    },
    founder: {
      eyebrow: "A note from the founder",
      title: "I'm Yao Kai. I built Machi because I started from zero in Japan myself.",
      name: "Yao Kai / YAOKAI",
      role: "Founder of Machi · Product maker",
      meta: "Moved to Japan in October 2019",
      avatar: "Y",
      readMore: "Read the full founder story",
      bio: "When I first arrived, the answers to housing, paperwork, job-hunting, and exams were scattered across group chats and posts, the outdated and the irrelevant all mixed in. What Machi is trying to do is simple: gather it in one place, by city and language, so the people who come next take fewer wrong turns.",
      quote: "“A city gets friendlier when someone leaves behind the path they took, and someone else lends a hand when you need one.”",
      paragraphs: [
        "I'm Yao Kai, the founder of Machi, and I've done the product, design, and development myself the whole way.",
        "After living in Japan a while, I realized information is never what's missing. What's missing is answers that carry their source — where it happened, when, who actually went through it, and whether it still holds today.",
        "A rental warning, the right order to do paperwork in, an interview story, an honest word about some shop — any of it can be where someone else stops taking the long way around.",
        "But it all sits in group chats, social apps, local forums, and friends' memories, split apart by language on top of that. Newcomers can't tell what applies to them, and people who know the ropes have nowhere that keeps what they share around for long.",
        "So Machi exists. Housing, jobs, secondhand, Q&A, local services, and community all come back to a specific city and language; information keeps its time, place, and source, and people can find each other when it matters.",
        "The name comes from the Japanese word 街, or machi. To me it's the place where you slowly learn how to live, get to know people, and get your days running smoothly again.",
        "I'd rather Machi be a plain, dependable part of city life than anything grand — a place that treats useful experience with care and doesn't leave newcomers to work everything out on their own.",
      ],
      closing: "Keep useful experience where it happened — and the people who come next take a few fewer wrong turns.",
      siteEyebrow: "More about me",
      siteTitle: "Beyond Machi, I keep a record of what I make and the life around it.",
      siteBody: "At yaokai.me, I write about products, design, and what I've figured out along the way, and I keep track of work that's still in progress. It's closer to a workshop with the lights still on than a résumé.",
      siteCta: "Visit yaokai.me",
    },
    announcementsSection: {
      label: "Updates",
      title: "Latest from Machi.",
      body: "Product progress, city plans, partnership openings and important notices are published here.",
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
        { type: "Announcement", title: "Machi for iOS is on the App Store", date: "2026.06", body: "The iOS app is live and free to download. City content, channels, messages, Machi AI and guides are all available." },
        { type: "Announcement", title: "Machi Web is open", date: "2026.06", body: "The web app is live — no invitation needed. Sign up to browse city content, post, message, and join public city topics and local groups." },
        { type: "News", title: "Japan Guide and Machi AI are live", date: "2026.06", body: "The Japan guide covers daily life, study, careers and JLPT; Machi AI answers in three languages, grounded in the guides and the school and company libraries." },
        { type: "App Update", title: "Google sign-in supported", date: "2026.06", body: "Web and iOS support signing in with Google. You can link or unlink Google anytime in settings." },
        { type: "Notice", title: "City content keeps growing, more countries in preparation", date: "2026.06", body: "Tokyo, Osaka, Kyoto and Yokohama content keeps expanding. Guides and city channels for Korea, Australia, Canada, the US, the UK, France and Germany are being prepared city by city — announced here first." },
      ],
    },
    featureSection: {
      label: "City channels",
      title: "What you're looking for is in its own channel.",
      body: "Housing, secondhand, jobs, events, Q&A, and local services each have a clear channel, organized by city and language. No digging through chat history. No mixing cities.",
      groups: [
        {
          key: "info",
          title: "City Info",
          description: "News, guides, Q&A and services for understanding everyday life in a city.",
          channels: ["news", "guides", "qa", "services"] as const,
        },
        {
          key: "trade",
          title: "Trade & opportunity",
          description: "Housing, secondhand, jobs, hiring and service leads.",
          channels: ["housing", "secondhand", "jobs", "hiring"] as const,
        },
        {
          key: "social",
          title: "Social & Offline",
          description: "Local groups, events, language exchange and real-world community.",
          channels: ["social", "meetups", "dining", "events", "language-exchange", "avoid"] as const,
        },
      ],
    },
    languageSection: {
      label: "Languages",
      title: "Living in the same city does not mean speaking the same language.",
      body: "Interface and content languages are chosen separately. Read Chinese experiences in Tokyo, search local information in Japanese, or stay in English throughout.",
      chips: ["简体中文", "繁體中文", "English", "日本語", "한국어 (soon)", "Français (soon)"],
      contextTitle: "Language-aware discovery",
      contextLabel: "Discovery context",
      regionLabel: "Current region",
      region: "Japan · Osaka",
      contentLanguageLabel: "Content language",
      contentLanguage: "Chinese",
      priorityLabel: "Shown first",
      priority: ["Chinese content in Osaka", "Chinese content in Kansai", "Noteworthy Chinese content across Machi", "Relevant Osaka content in other languages"],
    },
    businessSection: {
      label: "Business",
      title: "Trusted local services, right when you need them.",
      body: "Verified businesses and service providers publish services, offers, jobs, and events in the right city, channel, and language. People can see who is behind a listing and what it solves.",
      primary: "Book a consultation",
      secondary: "View ad plans",
      consoleLabel: "Business console",
      consoleTitle: "Tokyo partner campaign",
      verified: "Verified business",
      partnerTitle: "Verified local partner",
      partnerBody: "Verification details, service content, city reach, order leads and channel operations.",
      campaigns: [["Restaurant offers and dining events", "Verified business"], ["Language school trial classes", "Service content"], ["Local hiring and service leads", "City channel"]],
    },
    safetySection: {
      label: "Safety",
      title: "Before you meet, rent, or trade, get the boundaries clear.",
      body: "From public conversations to in-person meetups, from housing and secondhand to hiring. Risk prompts, reporting, blocking, review, and account action give every interaction firmer ground.",
      more: "See how Machi handles safety",
    },
    download: {
      label: "Available now",
      title: "Put your city in your pocket.",
      body: "The iOS app is on the App Store, and the web app works right in your browser. Android is in development — leave your email and we'll tell you the moment it ships.",
      primary: "Notify me about Android",
      secondary: "Join local community",
      appStore: "iOS: Available now",
      googlePlay: "Android: In development",
      webBeta: "Web: Live now",
      formLabel: "Launch updates",
      formTitle: "Notify me when Android launches",
      email: "Email",
      cityLabel: "Preferred city",
      languageLabel: "Language preference",
      intentLabel: "I want to use Machi for",
      cityOptions: ["Tokyo", "Osaka", "Kyoto", "Other city"],
      languageOptions: ["English", "中文", "日本語"],
      intentOptions: ["Local life info", "Community participation", "Food meetups", "Event groups", "Language exchange", "Housing", "Secondhand", "Jobs", "Hiring", "Business promotion", "Local services"],
      notify: "Notify me",
      sending: "Sending…",
      success: "Received. We'll email you when Android ships. Meanwhile, Machi is ready on iOS and the web.",
      errorInvalid: "That email does not look right. Please double-check.",
      errorSubmit: "Could not submit just now. Please try again.",
      benefitsTitle: "What you will get",
      benefits: [
        ["Two platforms, ready today", "The iOS app and the web app are both live — sign up and start."],
        ["Android launch notice", "One email the moment Android is ready."],
        ["More cities and guides", "Updates for new cities, new countries and the Japan Guide."],
      ],
      webFeatures: ["City home", "Discovery & search", "Notifications", "Messages", "Posting", "Profiles", "Local community"],
      privacy: "We only email you about the Android launch, city openings and guide updates. We never sell your email or sign you up for other lists.",
    },
    closingCta: {
      eyebrow: "Live on iOS and the web",
      title: "Now, open your city.",
      body: "Three languages. Free to start.",
      appStore: "Download on the App Store",
      web: "Open in browser",
      note: "Android is in development — we'll announce it here.",
    },
    faqSection: { label: "FAQ", title: "A few things worth knowing about Machi." },
    common: { open: "Open" },
    footer: {
      tagline: "Find the echoes of real life in every city.",
      groups: [["Navigation", ["About", "Features", "Guide", "Business", "Safety", "FAQ", "Cities", "Download"]], ["Partnership", ["Business", "Advertising", "Hiring promotion", "Housing promotion", "System partnership"]], ["Legal", ["Privacy Policy", "Terms of Service", "Membership Terms", "Service Terms", "Refund Policy", "Community Guidelines", "Commercial Disclosure", "Payment Services Act", "Cookie Policy", "Contact"]]],
    },
    cities: withCityTone([
      { name: "Tokyo", country: "Japan", description: "Housing warnings, food meetups, language exchange and local groups are refined here first.", posts: "Housing · Dining · Language Exchange · Groups", heat: "Live", status: "Live", sampleLabel: "Preview", languageTags: ["中文", "EN", "日本語"], sceneTags: ["Housing", "Dining", "Language Exchange", "Groups"], highlight: "Shibuya, Shinjuku and bay-area life" },
      { name: "Osaka", country: "Japan", description: "Housing, dining, work and Kansai life.", posts: "Housing · Dining · Jobs · Groups", heat: "Live", status: "Live", sampleLabel: "Preview", languageTags: ["中文", "EN", "日本語"], sceneTags: ["Housing", "Dining", "Jobs", "Groups"], highlight: "Umeda, Namba and Kansai life" },
      { name: "Kyoto", country: "Japan", description: "Stays, student life and city walks.", posts: "Stays · Student life · City walks", heat: "Live", status: "Live", sampleLabel: "Preview", languageTags: ["中文", "EN", "日本語"], sceneTags: ["Stays", "Students", "Walks"], highlight: "A student city, and a city to wander" },
    ]),
    features: withFeatureMeta([
      { title: "News", badge: "Local alerts", description: "Local news, policy updates, transport alerts and safety reminders." },
      { title: "Guides", badge: "Life tips", description: "Job hunting, study, housing, visas, banking and paperwork — Japan guide now live." },
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
      { title: "Services", badge: "Daily needs", description: "Restaurant bookings, travel tickets, airport pickup, translation, moving, cleaning and utility setup." },
      { title: "Avoid", badge: "Local warnings", description: "Housing, transaction, hiring, meetup and offline safety tips." },
    ]),
    safetyItems: [
      { title: "Social safety", body: "Do not share your address, ID or financial details too early. Report or block harassment, scams and offensive content." },
      { title: "Meetup safety", body: "Meet in public first, tell a friend where you are going and keep communication records." },
      { title: "Housing safety", body: "Do not prepay unverified landlords. Check addresses, contracts and identities. Watch for below-market listings." },
      { title: "Secondhand safety", body: "Trade in public places, inspect high-value items in person and avoid large deposits." },
      { title: "Jobs & hiring safety", body: "Never pay job deposits. Check company websites, addresses and contacts. Beware high pay that asks for money first." },
      { title: "Report and block", body: "Reporting, blocking, review, takedowns and account limits form the enforcement flow." },
    ],
    businessItems: ["Restaurant offers and dining events", "Language-school trial classes and exchange groups", "Local participant recruitment for events", "Interest groups for gyms and classes", "Qualified leads for local services", "Hiring within the city community"],
    faqs: [
      ["What is Machi?", "Machi organizes the practical parts of city life by place and language: guides, Q&A, housing, secondhand, jobs, hiring, local services, groups, events, and first-hand advice."],
      ["Is Machi a dating app?", "No. Machi is built for public city topics and community participation, including local groups, language exchange, and events. It does not provide dating matches, private introductions, or paid companionship."],
      ["Is Machi only for Japan?", "No. We are starting with Japan and doing it properly, then expanding to other countries as real demand and local readiness grow."],
      ["What is Machi Guide?", "The Japan guide brings together practical information on daily life, school applications, job hunting, JLPT, schools, companies, downloadable resources, and related services."],
      ["Which cities can I use it in?", "All Japanese cities work today, with Tokyo, Osaka, Kyoto and Yokohama content filling in first. International cities will open gradually, with each city's status shown clearly."],
      ["Can I use Machi in my language?", "Yes. Interface language and content language are separate. Chinese, English, and Japanese come first, with more languages added where a city needs them."],
      ["Can businesses join?", "Yes. Stores, service providers, recruiters, housing businesses, event organizers, and education partners can apply for verification or partnership. Verification does not guarantee exposure or results."],
      ["Can I post housing, jobs, or secondhand items?", "Yes. Posts must be accurate, clear, and lawful. Depending on the content, they may be reviewed, carry a risk notice, or be reported by users."],
      ["How does Machi support user safety?", "Reporting, blocking, review, verification, and risk prompts are built into posts, messages, in-person activities, housing, secondhand exchange, hiring, and local services."],
      ["Is Machi a study-abroad agency?", "No. The Japan guide covers study, careers, and daily life, and some services may be bookable. Machi as a whole is a platform for navigating life in a city."],
      ["Do paid services guarantee an outcome?", "No. Admissions, employment, visas, housing, banking, and other outcomes depend on your circumstances, documents, third parties, and local rules."],
      ["Can I delete my account?", "Yes. You can manage your profile and request account deletion. Public posts may already have been viewed or responded to before deletion."],
      ["Can I download the app now?", "Yes. The iOS app is on the App Store, free to download, and the web app works in your browser. Android is in development — we'll announce the date here."],
      ["How can I contact Machi?", "For partnerships, press, business applications, city suggestions, or privacy questions, email hi@machicity.com."],
    ],
  },
  ja: {
    nav: {
      items: [["ホーム", "/"], ["機能", "/features"], ["ビジネス", "/business"], ["安全", "/safety"], ["ダウンロード", "/download"], ["概要", "/about"]],
      signIn: "ログイン",
      register: "登録",
      getApp: "アプリを入手",
      openMenu: "メニューを開く",
      closeMenu: "メニューを閉じる",
      language: "言語",
    },
    hero: {
      eyebrow: "地域の暮らし · 街のコミュニティ",
      titleTop: "Machi",
      titleBottom: "",
      headline: "どの街でも、暮らしの声を見つける。",
      subtitle: "街を知る近道は、そこで暮らす人です。住まい、仕事探し、中古、集まり、イベント、そして日本に詳しい Machi AI を、あなたの街と言語ごとに一つにまとめました。",
      supporting: "まず日本をしっかり作り込む。次の街は、それからです。",
      primary: "Web 版を開く",
      secondary: "創設者の物語へ",
      appStoreCaption: "iOS 配信中",
      appStore: "App Store",
      googlePlayCaption: "Android 開発中",
      googlePlay: "Google Play",
      scrollLabel: "続きを見る",
      stats: [["iOS + Web", "どちらも公開中"], ["Japan Guide", "生活 · 進学 · 就職"], ["次の街へ", "韓国 · 豪州 · カナダ · 米英"]],
    },
    appMockup: {
      title: "街の経験",
      region: "日本 · 東京",
      search: "住まい、暮らしのコツ、ごはん、中古を検索",
      hotTitle: "東京の鼓動",
      hotSubtitle: "いま起きていること",
      quickEntries: ["ニュース", "ガイド", "中古", "住まい", "仕事", "採用", "グループ", "食事"],
      hotItems: ["東京の住まい、契約前に見るべき点", "新宿の週末ごはん", "渋谷のアルバイト採用"],
      cards: [
        { type: "住まい", title: "東京の住まい、契約前に見るべき点", place: "新宿", heat: "856" },
        { type: "食事", title: "新宿で週末ごはん", place: "新宿", heat: "423" },
        { type: "採用", title: "渋谷のアルバイト採用", place: "渋谷", heat: "312" },
      ],
    },
    guideSection: {
      label: "Machi Guide",
      title: "日本で暮らすための道筋を、わかりやすく。",
      body: "銀行口座、携帯、年金、役所手続きから、進学、就職、JLPT まで。Machi Guide は実際に向き合う手順を一つずつほどき、必要なサービスにも迷わずたどり着けるようにします。",
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
    machiAiSection: {
      label: "Machi AI · アシスタント",
      title: "日本で困ったら、まず Machi AI。",
      body: "日本語・中国語・英語で質問できます。Machi の学校データベース、企業データベース、ガイドをもとに、在留手続き、住まい、進学、就職の疑問へ、一つずつ答えます。",
      cta: "Machi AI と話してみる",
      bullets: [
        "日本の暮らしに強い：在留・役所・住まい・アルバイト・保険",
        "根拠のある回答：Machi のガイド・学校・企業データにもとづく",
        "三言語対応：日本語 · 中文 · English をいつでも切替",
      ],
      chips: ["来日して最初の一週間ですべきことは？", "賃貸の初期費用の見方は？", "大学院出願の第一歩は？", "新卒就活のスケジュールは？"],
      sampleQuestion: "在留カードの期限が近いです。更新はどうすれば？",
      sampleAnswer: "満了の3か月前から申請できます。在留カード、パスポート、証明写真、「在留期間更新許可申請書」を持って地方入管へ。学生は在学証明、就労者は在職証明も必要です。月末の混雑を避け、早めの予約がおすすめです。",
      sourceLabel: "Machi ガイドより",
    },
    brandStory: {
      label: "なぜ Machi をつくったか",
      title: "知らない土地に来たばかりの頃、答えはいくらでも見つかる。難しいのは、どれが今も有効で、どれが自分に関係あるかを見分けることです。",
      lead: "住まい、手続き、仕事探し、試験——その答えは、いくつものグループチャットや無数の投稿、誰かの記憶の中に散らばり、古い情報と役立つ情報が入り混じっています。",
      cityLines: [
        "落とし穴がどこにあるかまで書かれた、賃貸の体験談。",
        "今夜、一緒にごはんを食べる人がいる集まり。",
        "引っ越し前に、次の人へ譲りたい冷蔵庫。",
        "手続きを終えた人が残した、手順のチェックリスト。",
        "日本の友だちだけが知っている、小さなお店。",
        "同じ街の誰かが、丁寧に書いてくれた答え。",
      ],
      paragraphs: [
        "来たばかりで、携帯と銀行口座のどちらを先にすべきか迷う人がいます。五年住んで、自分がはまった落とし穴を惜しみなく話せる人もいます。",
        "住まいや仕事を探し、持っていけない家具を手放す人がいます。今週末、近くで行く価値のある場所を知りたいだけの人もいます。",
        "こうしたことが積み重なって、異国で腰を落ち着けられるかどうかが決まります。",
        "Machi は、こうしたばらばらの経験を集め、いつ・どこで・誰が書いたかを添えて、次の人にも役立つように残します。",
        "見つかる情報にはどれも、誰が通ってきたか、いつのことか、結果はどうだったかが付いていて、そっけない一言では終わりません。",
        "知らない街が身近になるのは、たいてい「もう、どうすればいいか分かった」と思えた瞬間からです。",
      ],
      highlights: [
        ["聞いてみる", "このエリアは一人暮らしに向いてる？"],
        ["経験を調べる", "住まい、各種手続き、仕事探し、注意点。"],
        ["機会を探す", "求人、中古、イベント、地域サービス。"],
      ],
      echoLabel: "経験はこうして受け継がれる",
      echoNodes: ["誰かが書く", "見つかる", "使われる", "次の人を助ける"],
      closing: "自分がはまった落とし穴を書き残す。そして、あなたの分も、すでに誰かが書いてくれています。",
    },
    founder: {
      eyebrow: "創設者から",
      title: "姚凱です。Machi をつくったのは、私自身が日本でゼロから始めたことがあるからです。",
      name: "姚凱 / YAOKAI",
      role: "Machi 創設者・プロダクト制作者",
      meta: "2019年10月に来日",
      avatar: "姚",
      readMore: "創設者のストーリーを読む",
      bio: "来たばかりの頃、住まいや手続き、仕事探し、試験の答えは、あちこちのグループや投稿に散らばり、古い情報も自分に関係のない情報も入り混じっていました。Machi がやりたいことは単純です。それらを一つに集め、街と言語ごとに整理して、あとから来る人が回り道を少しでも減らせるようにする。",
      quote: "「街が身近になるのは、誰かが歩いた道を残してくれて、必要なときに手を貸してくれる人がいるからです。」",
      paragraphs: [
        "姚凱です。Machi の創設者で、プロダクトもデザインも開発も、ずっと自分の手で進めてきました。",
        "日本に長くいて分かったのは、情報が足りないことはない、ということです。足りないのは、出どころのある答え——どこで起きたか、いつのことか、誰が実際に通ってきたか、そして今も有効かどうか。その背景まで含めて、初めて答えになります。",
        "賃貸の注意点、手続きの順番、面接の体験、あるお店についての率直な一言。そのどれもが、誰かの回り道を減らす最初のきっかけになります。",
        "けれど、それらはグループチャットやSNS、地域の掲示板、友人の記憶に散らばり、さらに言語で隔てられています。来たばかりの人は見分けにくく、街をよく知る人も、共有した経験を長く残せる場所を見つけられません。",
        "そこで Machi をつくりました。住まい、仕事探し、中古、Q&A、地域サービス、コミュニティを、それぞれの街と言語に戻す。情報は時期・場所・出どころを持ち、人は必要なときに互いを見つけられる。",
        "Machi という名前は、日本語の「街（まち）」から取りました。人が少しずつ暮らし方を覚え、人と知り合い、日々を立て直していく場所です。",
        "Machi は、街の暮らしを支える地道な土台でありたいと思っています。役に立つ経験が大切に残り、来たばかりの人が一人で抱え込まずにすむ場所へ。",
      ],
      closing: "役に立つ経験を、それが生まれた街に残す。あとから来る人が、回り道を少し減らせるように。",
      siteEyebrow: "私についてもう少し",
      siteTitle: "Machi の外でも、自分がつくったものと日々を書き残しています。",
      siteBody: "yaokai.me では、プロダクトやデザイン、ここまで考えてきたこと、そして制作途中の仕事を書いています。履歴書というより、まだ灯りのついている仕事場に近い場所です。",
      siteCta: "yaokai.me へ",
    },
    announcementsSection: {
      label: "お知らせ",
      title: "Machi からのお知らせ",
      body: "プロダクトの進捗、公開予定の街、提携に関する情報をお届けします。",
      manageHint: "最新の公式情報は、こちらでご確認ください。",
      manageLabel: "お知らせ一覧",
      composerTitle: "お知らせを公開",
      titlePlaceholder: "例：東京チャンネルを近日公開します",
      bodyPlaceholder: "お知らせの本文を入力",
      publish: "公開",
      empty: "本文を入力してください。",
      saved: "お知らせを公開しました。",
      tabs: ["お知らせ", "ニュース", "アプリ更新", "ご案内", "トピック"],
      defaultItems: [
        { type: "お知らせ", title: "Machi iOS 版を App Store で公開しました", date: "2026.06", body: "iOS アプリを公開しました。App Store から無料でダウンロードできます。街のコンテンツ、チャンネル、メッセージ、Machi AI、ガイドをご利用いただけます。" },
        { type: "お知らせ", title: "Machi Web 版を公開しました", date: "2026.06", body: "Web 版を公開しました。招待は不要で登録できます。ログイン後は、街のコンテンツの閲覧、投稿、メッセージに加え、公開の街の話題や地域グループにも参加できます。" },
        { type: "ニュース", title: "日本 Guide と Machi AI を公開しました", date: "2026.06", body: "暮らし、進学、就職、JLPT を扱う日本ガイドを公開。Machi AI は三言語で質問でき、ガイドと学校・企業データにもとづいて答えます。" },
        { type: "アプリ更新", title: "Google ログインに対応しました", date: "2026.06", body: "Web と iOS で Google ログインを利用できます。設定からいつでも連携・解除できます。" },
        { type: "ご案内", title: "街のコンテンツ拡充と、次の国の準備", date: "2026.06", body: "東京、大阪、京都、横浜のコンテンツを順次拡充中です。韓国、オーストラリア、カナダ、米国、英国、フランス、ドイツなどのガイドと街のチャンネルも、街ごとに準備を進めています。" },
      ],
    },
    featureSection: {
      label: "街のチャンネル",
      title: "探しているものは、それぞれのチャンネルの中にあります。",
      body: "住まい、中古、仕事、イベント、Q&A、地域サービス。それぞれに専用のチャンネルがあり、街と言語ごとに分かれています。チャットをさかのぼる必要も、別の街の情報が混ざることもありません。",
      groups: [
        {
          key: "info",
          title: "街の情報",
          description: "ニュース、ガイド、Q&A、地域サービスから、暮らしに必要なことを探せます。",
          channels: ["news", "guides", "qa", "services"] as const,
        },
        {
          key: "trade",
          title: "取引と仕事",
          description: "住まい、中古・ゆずり、仕事探し、求人、地域サービス。",
          channels: ["housing", "secondhand", "jobs", "hiring"] as const,
        },
        {
          key: "social",
          title: "コミュニティと地域の活動",
          description: "地域グループ、イベント、言語交換、食事会、暮らしの注意点。",
          channels: ["social", "meetups", "dining", "events", "language-exchange", "avoid"] as const,
        },
      ],
    },
    languageSection: {
      label: "多言語",
      title: "同じ街に暮らしていても、使う言葉は一つではありません。",
      body: "画面の言語と、読むコンテンツの言語は別々に選べます。東京で中国語の体験談を読む。日本語で地域の情報を探す。英語のまま使い続ける。どれも自然にできます。",
      chips: ["简体中文", "繁體中文", "English", "日本語", "한국어（準備中）", "Français（準備中）"],
      contextTitle: "言語に合わせた発見",
      contextLabel: "表示の条件",
      regionLabel: "現在の地域",
      region: "日本 · 大阪",
      contentLanguageLabel: "コンテンツ言語",
      contentLanguage: "中国語",
      priorityLabel: "優先して表示",
      priority: ["大阪の中国語投稿", "関西の中国語投稿", "Machi 全体で注目されている中国語投稿", "大阪の関連する他言語投稿"],
    },
    businessSection: {
      label: "ビジネス",
      title: "信頼できる地域サービスが、必要なときに、すぐそばに。",
      body: "認証された店舗や事業者は、街、チャンネル、言語に合わせて、サービス、特典、求人、イベントを掲載できます。誰が提供しているのか、何を解決できるのかが、利用する人に伝わります。",
      primary: "商談を予約する",
      secondary: "広告プランを見る",
      consoleLabel: "ビジネス管理",
      consoleTitle: "東京パートナー施策",
      verified: "認証事業者",
      partnerTitle: "認証ローカルパートナー",
      partnerBody: "認証情報、サービス内容、街での掲載、問い合わせ導線、チャンネル運営。",
      campaigns: [["レストランの特典と食事会", "認証事業者"], ["語学学校の体験レッスン", "サービス内容"], ["地域の求人とサービス相談", "街のチャンネル"]],
    },
    safetySection: {
      label: "安全",
      title: "会う前、借りる前、取引する前に、まず境界をはっきりさせる。",
      body: "公開のやり取りから対面の活動、住まい、中古取引、求人まで。注意喚起、通報、ブロック、審査、アカウント対応が、判断の手がかりになります。",
      more: "安全への取り組みを見る",
    },
    download: {
      label: "いま使えます",
      title: "あなたの街を、ポケットに。",
      body: "iOS アプリは App Store で配信中。Web 版はブラウザですぐ使えます。Android は開発中——メールアドレスを残していただければ、公開と同時にお知らせします。",
      primary: "Android の公開通知を受け取る",
      secondary: "地域コミュニティに参加",
      appStore: "iOS：配信中",
      googlePlay: "Android：開発中",
      webBeta: "Web 版：公開中",
      formLabel: "公開通知",
      formTitle: "Android 公開時にお知らせします",
      email: "メールアドレス",
      cityLabel: "希望する街",
      languageLabel: "利用する言語",
      intentLabel: "Machi で探したいこと",
      cityOptions: ["東京", "大阪", "京都", "その他の街"],
      languageOptions: ["日本語", "English", "中文"],
      intentOptions: ["地域の生活情報", "コミュニティへの参加", "食事の集まり", "イベント", "言語交換", "住まい", "中古・ゆずり", "仕事探し", "求人", "事業者プロモーション", "地域サービス"],
      notify: "通知を受け取る",
      sending: "送信中…",
      success: "受け付けました。Android 版の公開時にお知らせします。iOS 版と Web 版は、いまからご利用いただけます。",
      errorInvalid: "メールアドレスをご確認ください。",
      errorSubmit: "送信できませんでした。時間をおいて、もう一度お試しください。",
      benefitsTitle: "お知らせする内容",
      benefits: [
        ["いま使える二つの入口", "iOS アプリと Web 版は公開中。登録すればすぐ使えます。"],
        ["Android 公開のお知らせ", "準備が整い次第、一通のメールでお知らせします。"],
        ["街とガイドの更新", "新しい街や国、日本 Guide の更新情報をお届けします。"],
      ],
      webFeatures: ["街のホーム", "発見・検索", "通知", "メッセージ", "投稿", "プロフィール", "地域コミュニティ"],
      privacy: "Android の公開、新しい街、ガイドの更新に関するお知らせ以外はお送りしません。メールアドレスを販売したり、別の配信リストへ登録したりすることもありません。",
    },
    closingCta: {
      eyebrow: "iOS と Web で公開中",
      title: "さあ、あなたの街を開こう。",
      body: "三つの言語で。無料で始められます。",
      appStore: "App Store でダウンロード",
      web: "Web 版を開く",
      note: "Android は開発中。公開はこのサイトでお知らせします。",
    },
    faqSection: { label: "よくある質問", title: "Machi について、よくいただく質問。" },
    common: { open: "開く" },
    footer: {
      tagline: "どの街でも、暮らしの声を見つける。",
      groups: [["ナビ", ["概要", "機能", "ガイド", "ビジネス", "安全", "FAQ", "街", "ダウンロード"]], ["提携", ["店舗提携", "広告掲載", "採用プロモーション", "住まいプロモーション", "システム提携"]], ["法務", ["プライバシー", "利用規約", "会員規約", "サービス予約規約", "返金ポリシー", "コミュニティ規範", "特定商取引法に基づく表記", "資金決済法に基づく表示", "Cookie ポリシー", "お問い合わせ"]]],
    },
    cities: withCityTone([
      { name: "東京", country: "日本", description: "住まいの注意、食事、言語交換、地域グループをここから磨いています。", posts: "住まい · 食事 · 言語交換 · 地域グループ", heat: "公開中", status: "公開中", sampleLabel: "画面プレビュー", languageTags: ["中文", "EN", "日本語"], sceneTags: ["住まい", "食事", "言語交換", "地域グループ"], highlight: "渋谷、新宿、湾岸の暮らし" },
      { name: "大阪", country: "日本", description: "住まい、食事、仕事、関西の暮らし。", posts: "住まい · 食事 · 仕事 · 地域グループ", heat: "公開中", status: "公開中", sampleLabel: "画面プレビュー", languageTags: ["中文", "EN", "日本語"], sceneTags: ["住まい", "食事", "仕事", "地域グループ"], highlight: "梅田、難波、関西の暮らし" },
      { name: "京都", country: "日本", description: "宿、学生生活、街歩き。", posts: "宿 · 学生生活 · 街歩き", heat: "公開中", status: "公開中", sampleLabel: "画面プレビュー", languageTags: ["中文", "EN", "日本語"], sceneTags: ["宿", "学生", "街歩き"], highlight: "学生の街、歩きたくなる街" },
    ]),
    features: withFeatureMeta([
      { title: "ニュース", badge: "地域のお知らせ", description: "地域ニュース、制度、交通、安全に関するお知らせ。" },
      { title: "ガイド", badge: "暮らしの案内", description: "仕事探し、留学、住まい、ビザ、銀行、各種手続き——日本ガイドは公開中。" },
      { title: "街の話題", badge: "地域トピック", description: "公開の地域トピック、ローカルグループ、趣味のコミュニティ。" },
      { title: "グループ", badge: "地域の集まり", description: "食事会、イベント、スポーツ、言語交換、週末の集まり。" },
      { title: "食事", badge: "一緒に食べる", description: "食事会、カフェ、店巡り、街の食にまつわる話題。" },
      { title: "イベント", badge: "地域で参加", description: "展示、まち歩き、講座、ボードゲーム、スポーツ、交流会。" },
      { title: "言語交換", badge: "多言語", description: "中国語、英語、日本語などを学び合う地域グループ。" },
      { title: "住まい", badge: "賃貸・シェア", description: "賃貸、転貸、シェア、ルームメイト、契約時の注意点。" },
      { title: "中古・ゆずり", badge: "リユース", description: "不要品の譲渡、探し物、引っ越し前の売却、無料のおゆずり。" },
      { title: "仕事探し", badge: "キャリア", description: "アルバイト、正社員、インターン、リモート、求職経験。" },
      { title: "求人", badge: "募集情報", description: "地域の店舗、企業、団体からの募集情報。" },
      { title: "Q&A", badge: "地域の相談", description: "ビザ、住まい、仕事、学校、医療など、街の暮らしに関する相談。" },
      { title: "サービス", badge: "暮らしの支援", description: "レストラン予約、旅行チケット、送迎、翻訳・各種手続き、引っ越し・清掃、生活の開通。" },
      { title: "注意情報", badge: "リスク情報", description: "住まい、取引、求人、イベント、対面時の注意点。" },
    ]),
    safetyItems: [
      { title: "コミュニティでのやり取り", body: "住所、身分証、金銭に関する情報は、信頼関係ができる前に共有しないでください。嫌がらせや詐欺は通報・ブロックできます。" },
      { title: "初めて会うとき", body: "人目のある場所を選び、予定を家族や友人に伝え、やり取りを残しておきましょう。" },
      { title: "住まい探し", body: "確認できていない貸主へ前払いせず、住所、契約内容、相手の身元を確かめてください。相場より極端に安い物件にも注意が必要です。" },
      { title: "中古取引", body: "人目のある場所を選び、高額品は対面で状態を確認してください。大きな前金は避けましょう。" },
      { title: "仕事探し・求人", body: "採用のための保証金や手数料は支払わず、会社の公式サイト、所在地、連絡先を確認してください。" },
      { title: "通報とブロック", body: "通報、ブロック、審査、削除、アカウント制限まで、状況に応じて対応します。" },
    ],
    businessItems: ["レストランの食事会と特典", "語学学校の体験レッスンと交流会", "イベント主催者による地域参加者の募集", "ジムや教室の興味別コミュニティ", "地域サービスへの問い合わせ", "街のコミュニティに向けた求人"],
    faqs: [
      ["Machi とは？", "街で暮らすための情報と人の経験を、国・街・言語ごとにまとめたローカルライフ・プラットフォームです。ガイド、Q&A、住まい、中古、仕事、求人、地域サービス、グループ、イベントを扱います。"],
      ["Machi はデーティングアプリですか？", "いいえ。Machi は、恋愛相手の紹介やマッチングを目的としたサービスではありません。交流機能は、公開された街の話題、地域グループ、言語交換、イベントなど、地域コミュニティへの参加のために提供しています。"],
      ["Machi は日本だけのサービスですか？", "いいえ。まず日本で体験を丁寧に磨き、実際の需要を確かめながら、ほかの国や街へ広げていきます。"],
      ["Machi Guide とは？", "日本での暮らし、進学、就職、JLPT、学校・企業情報、各種資料やサービスを、必要な順番で探せるようにまとめたガイドです。"],
      ["どの街で使えますか？", "日本国内の街ならどこでも使えます。東京、大阪、京都、横浜のコンテンツから充実させています。海外の街は準備状況を確認しながら順次案内します。"],
      ["自分の言語で使えますか？", "はい。画面の言語と、読みたい投稿の言語は別々に選べます。まず日本語、英語、中国語を整え、街の需要に合わせて対応言語を増やします。"],
      ["事業者も参加できますか？", "はい。店舗、地域サービス、採用担当、不動産関連事業者、イベント主催者、教育機関は、認証や提携を申請できます。掲載や成果を保証するものではありません。"],
      ["住まい、求人、中古品を投稿できますか？", "はい。内容は正確でわかりやすく、現地の法令に沿っている必要があります。投稿内容によっては審査、注意表示、通報対応の対象になります。"],
      ["安全のために、どんな対策がありますか？", "投稿やメッセージ、対面、住まい、中古取引、求人、地域サービスに、通報、ブロック、審査、認証、リスク表示を組み込んでいます。"],
      ["Machi は留学エージェントですか？", "いいえ。Guide では日本の進学、就職、暮らしに関する情報や、一部の予約サービスを扱いますが、Machi 全体は街の暮らしを支えるプラットフォームです。"],
      ["有料サービスは結果を保証しますか？", "保証しません。進学、就職、ビザ、住まい、口座開設、合格、採用などの結果は、ご本人の状況、提出資料、第三者機関、現地の制度によって変わります。"],
      ["アカウントを削除できますか？", "はい。プロフィールを管理し、アカウント削除を申請できます。公開した投稿は、削除前にほかの利用者が閲覧または反応している場合があります。"],
      ["アプリはいまダウンロードできますか？", "はい。iOS 版は App Store で配信中、無料でダウンロードできます。Web 版はブラウザですぐ使えます。Android 版は開発中で、公開日はこのサイトでお知らせします。"],
      ["Machi に連絡するには？", "提携、取材、事業者のお申し込み、街の展開に関するご提案、プライバシーのお問い合わせは、hi@machicity.com までお送りください。"],
    ],
  },
} satisfies Record<MarketingLocale, {
  nav: { items: Array<[string, string]>; signIn: string; register: string; getApp: string; openMenu: string; closeMenu: string; language: string };
  hero: { eyebrow: string; titleTop: string; titleBottom: string; headline: string; subtitle: string; supporting: string; primary: string; secondary: string; appStoreCaption: string; appStore: string; googlePlayCaption: string; googlePlay: string; scrollLabel: string; stats: Array<[string, string]> };
  appMockup: { title: string; region: string; search: string; hotTitle: string; hotSubtitle: string; quickEntries: string[]; hotItems: string[]; cards: Array<{ type: string; title: string; place: string; heat: string }> };
  guideSection: { label: string; title: string; body: string; cta: string; expansion: string; cards: Array<[string, string]> };
  machiAiSection: { label: string; title: string; body: string; cta: string; bullets: string[]; chips: string[]; sampleQuestion: string; sampleAnswer: string; sourceLabel: string };
  brandStory: { label: string; title: string; lead: string; cityLines: string[]; paragraphs: string[]; highlights: Array<[string, string]>; echoLabel: string; echoNodes: string[]; closing: string };
  announcementsSection: { label: string; title: string; body: string; manageHint: string; manageLabel: string; composerTitle: string; titlePlaceholder: string; bodyPlaceholder: string; publish: string; empty: string; saved: string; tabs: string[]; defaultItems: Announcement[] };
  featureSection: {
    label: string;
    title: string;
    body: string;
    groups: Array<{
      key: "info" | "trade" | "social";
      title: string;
      description: string;
      channels: readonly string[];
    }>;
  };
  languageSection: { label: string; title: string; body: string; chips: string[]; contextTitle: string; contextLabel: string; regionLabel: string; region: string; contentLanguageLabel: string; contentLanguage: string; priorityLabel: string; priority: string[] };
  businessSection: { label: string; title: string; body: string; primary: string; secondary: string; consoleLabel: string; consoleTitle: string; verified: string; partnerTitle: string; partnerBody: string; campaigns: Array<[string, string]> };
  safetySection: { label: string; title: string; body: string; more: string };
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
    webFeatures: string[];
    privacy: string;
  };
  closingCta: { eyebrow: string; title: string; body: string; appStore: string; web: string; note: string };
  faqSection: { label: string; title: string };
  common: { open: string };
  footer: { tagline: string; description?: string; groups: Array<[string, string[]]> };
  cities: City[];
  features: FeatureChannel[];
  safetyItems: SafetyItem[];
  businessItems: string[];
  faqs: Array<[string, string]>;
}>;
