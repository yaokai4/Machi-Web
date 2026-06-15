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
        ["城市", "/cities"],
        ["功能", "/features"],
        ["指南", "/guide"],
        ["社区", "/#social"],
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
      subtitle: "刚到一座城市，租房、找工作、买二手、办手续、认识同城的人，信息常常散在群聊、网站和朋友的记忆里，真假难辨。Machi 按你所在的城市和语言，把这些经验收进一个地方：看得见、找得到、有人回应。",
      supporting: "我们先把日本做透：租房、求职、留学、在日生活与城市社区，都整理清楚。之后会一座城市一座城市地走向韩国、澳洲、加拿大、美国、英国等地。",
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
        ["更多城市", "韩 · 澳 · 加 · 美 · 英"],
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
      title: "一座城市的实用信息，不该散落在十几个地方。",
      body: "Machi 把本地信息、亲身经验、生活需求和人与人的回应，按城市、语言与场景整理在一起。找得到，也看得懂；需要帮助时，知道该往哪里走。",
      pillars: [
        ["以城市为坐标", "按国家、城市和地区组织内容，让信息回到真实生活发生的地方。"],
        ["尊重每一种语言", "界面语言和内容语言分开，支持多语言城市里的真实表达。"],
        ["从生活场景出发", "围绕租房、二手、工作、活动、问答、服务和同城连接等具体需求。"],
        ["让信任有依据", "用举报、拉黑、审核、认证和风险提示，保护真实连接的边界。"],
      ],
    },
    guideSection: {
      label: "Machi Guide",
      title: "先把在日本生活这件事，讲明白。",
      body: "从银行卡、手机卡、年金和役所手续，到升学、求职、JLPT、学校与公司资料，Machi Guide 把真正会遇到的流程拆开说明，也把需要时能用上的服务放在清楚的位置。",
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
    brandStory: {
      label: "品牌故事",
      title: "城市的样子，藏在每个人认真生活的细节里。",
      lead: "真正让人记住一座城市的，往往不是地标，而是那些具体到可以伸手接住的日常。",
      cityLines: [
        "一份写满备注的租房合同。",
        "一张下班路上看到的招聘启事。",
        "一件搬家前想交给下一个人的家具。",
        "一条办完手续后留下的提醒。",
        "一场周末临时约起的散步。",
        "一句来自同城陌生人的认真回答。",
      ],
      paragraphs: [
        "有人刚到这里，想知道先办手机卡还是银行卡；也有人已经住了很多年，愿意把自己走过的路写清楚。",
        "有人找房、找工作、转手闲置，也有人只想知道这个周末附近有什么值得去的地方。",
        "这些事不宏大，却决定了一个人能不能在陌生的地方安顿下来。",
        "Machi 想把零散的经验留住，让它们带着时间、地点和来处，继续帮到下一个人。",
        "当信息不再只是信息，它会变成一条能走的路，一次有分寸的帮助，或一段新的本地关系。",
        "一座城市真正变得熟悉，是从“我知道该怎么办了”开始的。",
      ],
      highlights: [
        ["提问", "这个区适合住吗？"],
        ["经验", "租房、办卡、找工作和避坑提醒。"],
        ["机会", "招聘、服务、活动和本地优惠。"],
      ],
      echoLabel: "城市回声",
      echoNodes: ["提问", "分享", "被看见", "被回应"],
      closing: "把知道的留下，把需要的找到。让一座城市的生活经验，继续流向下一个人。",
    },
    founder: {
      eyebrow: "创始人的话",
      title: "我是姚凯。Machi 来自我对城市、信息与人之间关系的长期思考。",
      name: "姚凯 / YAOKAI",
      role: "Machi 创始人 · 产品创作者",
      meta: "2019 年 10 月来到日本",
      avatar: "姚",
      readMore: "阅读完整创始人故事",
      bio: "我想做的不是又一个信息平台，而是一个能让经验被留下、需求被看见、人与人重新发生回应的城市入口。",
      quote: "“真正让一座城市变得亲近的，不只是地址，而是有人把走过的路留下来，也有人在你需要时回应。”",
      paragraphs: [
        "我是姚凯，Machi 的创始人，也一直参与产品、设计与开发。",
        "我越来越相信，人在一座城市里真正需要的，往往不是更多信息，而是带着语境的答案：它发生在哪里、是什么时候、由谁亲身走过，又能不能在今天继续成立。",
        "很多经验并不宏大，却足以改变一个人的日常。一个租房提醒、一份手续顺序、一段求职经历、一家店的真实评价，可能就是别人少走弯路的开始。",
        "但这些经验常常散落在群聊、社交平台、地方网站和朋友的记忆里，也被语言隔开。刚来的人难以判断，熟悉这里的人想认真分享，也缺少一个能让经验长期留下来的地方。",
        "于是我开始做 Machi。我希望租房、求职、二手、问答、本地服务与社区交流，都能回到具体的城市和语言里。信息保留时间、位置与来处，人也能在需要时找到彼此。",
        "Machi 的名字来自日语的「街（まち）」。对我而言，街不是地图上的一个标签，而是人慢慢学会生活、建立关系，也重新找到节奏的地方。",
        "我希望 Machi 最终成为一种温柔但有秩序的城市基础设施：让有用的经验被珍惜，让后来的人不必独自摸索，也让每一次认真分享都继续发光。",
      ],
      closing: "让有用的经验，留在它发生的城市。\n让刚来的人，少一点独自摸索。\n让每一次认真分享，都能继续帮到别人。",
      siteEyebrow: "继续认识我",
      siteTitle: "Machi 之外，我也在记录自己的创作与生活。",
      siteBody: "在 yaokai.me，我写产品、设计与一路走来的思考，也整理仍在进行中的作品。那里更像一间持续亮着灯的工作室。",
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
	      title: "找住处、找工作、问问题，都从你所在的城市开始。",
      body: "Machi 把租房、二手、工作、招聘、活动、问答、本地服务与社区小组分到清楚的频道里，再按城市和语言呈现。需要时不用翻遍聊天记录，也不会把不同地方的信息混在一起。",
      groups: [
        {
          title: "城市信息",
          description: "本地新闻、指南、问答和服务，让新旧居民都能快速看懂这座城市。",
          channels: ["news", "guides", "qa", "services"] as const,
        },
        {
          title: "交易与机会",
          description: "租房、二手、找工作、招聘和服务线索。",
          channels: ["housing", "secondhand", "jobs", "hiring"] as const,
        },
        {
          title: "社区与线下",
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
      title: "住在同一座城市，不必说同一种语言。",
      body: "界面语言与内容语言可以分别选择。在东京看中文经验，在多伦多寻找日语信息，在洛杉矶阅读英文内容。语言不同，也能看见与自己有关的本地生活。",
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
      title: "让可靠的本地服务，在需要的时候被找到。",
      body: "通过认证的商家与服务者，可以在对应城市、频道和语言中发布服务、优惠、招聘与活动。用户看得见是谁在提供、能解决什么问题，也能更安心地作出选择。",
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
      title: "人与人靠近之前，先把边界说明白。",
      body: "从公开讨论到线下活动，从租房、二手交易到招聘与本地服务，Machi 提供风险提醒、举报、屏蔽、审核与账号处置，让每一次互动都更有依据。",
    },
    download: {
      label: "现在就能开始",
      title: "先在 Web 上，找到你的城市。",
	      body: "Machi Web 端已经上线，注册后即可使用城市首页、发现与搜索、通知、私信、发布内容、个人主页和社区参与。iOS 与 Android App 正在筹备，留下邮箱可在上线时第一时间收到提醒。",
      primary: "App 上线提醒我",
	      secondary: "参与本地社区",
      appStore: "iOS：即将上线",
      googlePlay: "Android：即将上线",
      webBeta: "Web 端：已上线，免邀请",
      formLabel: "上线提醒",
      formTitle: "App 上线后提醒我",
      email: "邮箱地址",
      cityLabel: "希望使用的城市",
      languageLabel: "常用语言",
      intentLabel: "我想用 Machi 寻找",
      cityOptions: ["东京", "洛杉矶", "多伦多", "其他城市"],
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
      webFeatures: ["城市首页", "发现与搜索", "通知", "私信", "发布内容", "个人主页", "本地社区"],
      privacy: "我们只会在 App 上线、新城市和指南更新时发邮件，不会出售你的邮箱，也不会拿去订阅其他广告。",
    },
    faqSection: { label: "常见问题", title: "关于 Machi，你可能想知道的事。" },
    common: { open: "进入" },
    footer: {
      tagline: "在每一座城市，找到生活的回声。",
      description: "把有用的信息留在城市里，让每一次真实经验，都能继续帮到下一个人。",
      groups: [
        ["导航", ["关于", "功能", "指南", "商家合作", "安全", "FAQ", "城市", "下载"]],
        ["合作", ["商家合作", "广告投放", "招聘推广", "租房推广", "系统合作"]],
	        ["法律", ["隐私政策", "服务条款", "会员条款", "服务预约条款", "退款政策", "社区规则", "商业披露", "Cookie 政策", "联系我们"]],
      ],
    },
    cities: withCityTone([
      { name: "东京", country: "日本", description: "租房避坑、美食、语言交换和本地小组，在这里最先展开。", posts: "租房 · 美食 · 语言交换 · 本地小组", heat: "Web 端开放中", status: "Web 端开放中", sampleLabel: "页面预览", languageTags: ["中文", "EN", "日本語"], sceneTags: ["租房", "美食", "语言交换", "本地小组"], highlight: "涩谷、新宿和湾岸生活经验" },
	      { name: "洛杉矶", country: "美国", description: "工作、活动、美食、本地服务和多语言社区。", posts: "工作 · 活动 · 美食 · 本地服务", heat: "筹备中", status: "筹备中", sampleLabel: "页面预览", languageTags: ["EN", "中文", "日本語"], sceneTags: ["工作", "活动", "美食", "本地服务"], highlight: "东西区生活与本地服务需求" },
      { name: "多伦多", country: "加拿大", description: "租房、工作、多语言问答和新居民支持。", posts: "租房 · 工作 · 多语言问答 · 本地小组", heat: "筹备中", status: "筹备中", sampleLabel: "页面预览", languageTags: ["EN", "中文", "日本語"], sceneTags: ["租房", "工作", "问答", "本地小组"], highlight: "初到城市的生活支持" },
    ]),
    features: withFeatureMeta([
      { title: "本地新闻", badge: "城市动态", description: "本地快讯、政策提醒、交通提醒和安全提醒。" },
      { title: "城市指南", badge: "实用攻略", description: "求职、留学、租房、签证、银行卡和办事流程——日本指南已上线，更多国家陆续展开。" },
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
      { title: "本地服务", badge: "生活所需", description: "搬家、翻译、签证、留学、保险、维修、报税。" },
      { title: "避坑经验", badge: "风险提醒", description: "租房、交易、招聘、活动和线下见面的风险提醒。" },
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
      { title: "周末想出去", description: "找美食、活动、展览、城市漫步。", icon: "Sparkles" },
      { title: "遇到问题", description: "发问答，获得本地用户经验。", icon: "CircleHelp" },
      { title: "本地商家", description: "发布优惠、招聘、活动，连接城市用户。", icon: "Store" },
    ],
    safetyItems: [
      { title: "社区互动", body: "不要过早分享住址、证件或财务信息；遇到骚扰、诈骗或冒犯内容，可以举报或拉黑。" },
      { title: "线下见面", body: "初次见面尽量选择公共场所，提前告诉朋友时间和地点，并保留沟通记录。" },
      { title: "聚餐活动", body: "发起或参加聚餐前，确认公共地点、人数、费用和退出方式。" },
      { title: "语言交换", body: "第一次语言交换建议在公共空间进行，不要贸然前往私人住所。" },
      { title: "租房信息", body: "不要向未经验证的房东提前转账；核对地址、合同和身份，警惕明显低于市场价的房源。" },
      { title: "二手交易", body: "优先在公共场所交易；高价值物品当面验货，不提前支付大额定金。" },
      { title: "求职与招聘", body: "不要支付所谓入职押金；核对公司官网、地址和联系方式，警惕先交钱的高薪职位。" },
      { title: "商家认证", body: "本地商家、招聘方、房产与服务提供者可申请认证，并接受相应的风险标记与审核。" },
      { title: "举报与屏蔽", body: "从举报、屏蔽、内容审核到下架和账号限制，形成清楚的处理链路。" },
	      { title: "社区规则", body: "明确禁止骚扰、仇恨、诈骗、冒充、违规线下服务、虚假活动和危险行为。" },
    ],
    businessItems: ["餐厅聚餐与优惠活动", "语言学校体验课与交换小组", "活动主办方招募本地参与者", "健身与课程兴趣社群", "本地服务咨询线索", "面向同城社区的招聘"],
    faqs: [
	      ["Machi 是什么？", "Machi 把城市生活里真正会用到的信息，按地点和语言整理在一起：Guide、问答、租房、二手、工作、招聘、本地服务、小组、活动，以及来自真实生活的经验。"],
	      ["Machi 是交友或约会软件吗？", "不是。Machi 的交流功能服务于公开的城市话题、本地小组、语言交换与活动参与，不提供恋爱匹配、私人介绍或付费陪伴。"],
      ["Machi 只做日本吗？", "不是。我们先从日本 Guide 和东京开始，把体验认真做好，再根据真实需求与当地准备情况逐步进入更多城市。"],
      ["Machi Guide 是什么？", "日本 Guide 会整理日常生活、升学、求职、JLPT、学校与公司资料、数字内容和相关服务，让用户能按需要的顺序找到答案。"],
      ["首批开放哪些城市？", "目前 Web 版以日本和东京为重点。大阪、京都与海外城市会根据准备进度逐步开放，并清楚标明当前状态。"],
      ["我可以使用自己的语言吗？", "可以。界面语言和内容语言可以分别选择。中文、英文和日文会优先完善，更多语言将根据各城市的实际需要增加。"],
      ["商家和本地服务可以加入吗？", "可以。门店、服务提供者、招聘方、房产相关机构、活动主办方与教育机构都可以申请认证或合作。认证不代表固定曝光，也不承诺结果。"],
      ["可以发布租房、招聘或二手信息吗？", "可以。内容需要真实、清楚并遵守当地法律；根据具体情况，平台可能进行审核、添加风险提示或处理用户举报。"],
      ["Machi 如何保护用户安全？", "举报、拉黑、审核、认证和风险提示会被放进发帖、私信、线下活动、租房、二手、招聘与本地服务等具体场景。"],
      ["Machi 是留学中介吗？", "不是。日本 Guide 会整理升学、求职与生活信息，也可能提供部分可预约服务；Machi 整体是一款帮助人们在城市里生活的产品。"],
      ["付费服务会保证结果吗？", "不会。升学、就业、签证、租房、开户、录取等结果取决于个人情况、提交材料、第三方机构与当地规则。"],
      ["我可以删除账号吗？", "可以。你可以管理个人资料并申请删除账号；公开发布的内容在删除前，可能已经被其他用户看到或回应。"],
      ["移动端 App 什么时候上线？", "Machi Web Beta 现在已经可以使用。iOS 和 Android 正在准备中，发布日期确认后会通过官网与订阅通知公布。"],
      ["如何联系 Machi？", "合作、媒体采访、商家申请、城市建议或隐私相关问题，请发送邮件至 hi@machicity.com。"],
    ],
  },
  en: {
    nav: {
      items: [
        ["Home", "/"],
        ["Cities", "/cities"],
        ["Features", "/features"],
        ["Guide", "/guide"],
        ["Community", "/#social"],
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
      subtitle: "Arriving in a city means piecing together housing, work, secondhand finds, paperwork, local help, and people who might answer. Machi organizes those lived signals by city and language, so useful experience can be seen, found, and answered.",
      supporting: "We are beginning with Japan, going deep on housing, careers, study, daily life, and city communities. From there, Machi will expand city by city to Korea, Australia, Canada, the United States, the United Kingdom, and beyond.",
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
        ["More cities", "KR · AU · CA · US · UK"],
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
      title: "The practical side of city life should not be scattered across a dozen places.",
      body: "Machi brings local information, first-hand experience, everyday needs, and human replies together by city, language, and context. It is easier to find, easier to understand, and easier to act on.",
      pillars: [
        ["City-based", "Organized by country, region and city, so local information stays close to where life happens."],
        ["Language-aware", "Interface language and content language are separate for multilingual cities."],
        ["Scene-driven", "Built around housing, secondhand, jobs, events, Q&A, services and local connection."],
        ["Trust-focused", "Reporting, blocking, review, verification and risk prompts protect real connection."],
      ],
    },
    guideSection: {
      label: "Machi Guide",
      title: "A clearer way through life in Japan.",
      body: "From bank accounts, mobile plans, pensions, and city-office paperwork to study, careers, JLPT, school and company information, Machi Guide explains the steps people actually face and keeps useful services close at hand.",
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
      title: "A city comes into focus through the details of everyday life.",
      lead: "What stays with us is rarely the landmark. It is the small, practical moment that helped life begin to make sense.",
      cityLines: [
        "A lease covered in handwritten notes.",
        "A hiring notice spotted on the way home.",
        "A chair passed on before a move.",
        "A reminder written after finishing the paperwork.",
        "A last-minute walk planned for the weekend.",
        "A thoughtful answer from someone nearby.",
      ],
      paragraphs: [
        "One person has just arrived and is wondering whether to set up a phone or a bank account first. Another has lived here for years and knows which steps matter.",
        "People look for homes and work, pass on things they no longer need, ask questions, and make plans for the weekend.",
        "These moments are ordinary, but they shape whether someone can settle into a place with confidence.",
        "Machi keeps useful experience from disappearing, with enough context to help the next person make sense of it.",
        "At its best, information becomes a next step, a considerate reply, or the beginning of a local connection.",
        "A city starts to feel familiar when you finally know what to do next.",
      ],
      highlights: [
        ["Questions", "Is this neighborhood a good place to live?"],
        ["Experience", "Housing, banking, work and local warnings."],
        ["Opportunity", "Hiring, services, events and local deals."],
      ],
      echoLabel: "City Echo",
      echoNodes: ["Ask", "Share", "Be found", "Get answered"],
      closing: "Leave what you know. Find what you need. Let one person's experience keep helping the next.",
    },
    founder: {
      eyebrow: "A note from the founder",
      title: "I’m Yao Kai. Machi grew from a long reflection on cities, information, and the way people answer one another.",
      name: "Yao Kai / YAOKAI",
      role: "Founder of Machi · Product maker",
      meta: "Moved to Japan in October 2019",
      avatar: "Y",
      readMore: "Read the full founder story",
      bio: "I am not trying to build just another information platform. I want Machi to become an entrance to the city, where experience stays, needs are seen, and people can answer one another again.",
      quote: "“What makes a city feel close is not only an address. It is the path someone leaves behind, and the reply that arrives when you need it.”",
      paragraphs: [
        "I’m Yao Kai, the founder of Machi. I continue to work across the product, design, and development.",
        "Over time I have become convinced that people do not simply need more information in a city. They need answers with context: where something happened, when it was true, who lived through it, and whether it still holds today.",
        "Small pieces of experience can quietly change a day: a warning in a lease, the right order for paperwork, a job-search note, a real comment about a local service. They are not grand stories, but they can become someone else’s first clear step.",
        "Those answers often sit in group chats, social platforms, local websites, and friends’ memories, separated again by language. Newcomers struggle to judge what applies to them; people who know the city well have few places to leave experience where it can keep helping.",
        "That is why I started Machi. Housing, careers, secondhand exchange, questions, local services, and community conversations should all return to a clear city and language context. Information should keep its time, place, and source; people should be able to find one another when it matters.",
        "The name comes from the Japanese word 街, or machi. To me, a city is more than a label on a map. It is where people learn the rhythms of daily life, build relationships, and begin to feel at home.",
        "I want Machi to become a gentle, well-ordered piece of city infrastructure: a place where useful experience is treated with care, newcomers are not left to figure everything out alone, and every thoughtful contribution keeps shining for someone else.",
      ],
      closing: "Keep useful experience in the city where it happened.\nGive newcomers fewer things to figure out alone.\nLet every thoughtful contribution keep helping someone else.",
      siteEyebrow: "Beyond Machi",
      siteTitle: "Beyond Machi, I keep a record of the things I make and the life around them.",
      siteBody: "At yaokai.me, I write about products, design, and the path that brought me here, alongside work that is still taking shape. It is closer to an open studio than a résumé.",
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
	      title: "Housing, work, questions, and plans all begin with where you live.",
	      body: "Machi gives housing, secondhand exchange, jobs, hiring, events, Q&A, local services, and community groups their own clear channels, then organizes them by city and language.",
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
    languageSection: { label: "Languages", title: "Living in the same city does not mean speaking the same language.", body: "Interface and content languages can be chosen separately. Read Chinese experiences in Tokyo, find Japanese information in Toronto, or follow local life in English in Los Angeles.", chips: ["中文", "English", "日本語", "한국어", "Français", "Español"], contextTitle: "Language-aware discovery", contextLabel: "Discovery context", regionLabel: "Current region", region: "Canada · Toronto", contentLanguageLabel: "Content language", contentLanguage: "Japanese", priorityLabel: "Shown first", priority: ["Japanese content in Toronto", "Japanese content in Canada", "Noteworthy Japanese content across Machi", "Relevant Toronto content in other languages"] },
    useCaseSection: { label: "City moments", title: "Made for real life in a city." },
    businessSection: { label: "Business", title: "Help reliable local services appear when people actually need them.", body: "Verified businesses and service providers can publish services, offers, jobs, and events in the relevant city, channel, and language. People can see who is providing the service, what it is for, and make a more informed choice.", primary: "Apply for partnership", secondary: "View ad plans", consoleLabel: "Business console", consoleTitle: "Tokyo partner campaign", verified: "Verified business", partnerTitle: "Verified local partner", partnerBody: "Verification details, service content, city reach, order leads and channel operations.", campaigns: [["Restaurant offers and dining events", "Verified business"], ["Language school trial classes", "Service content"], ["Local hiring and service leads", "City channel"]] },
	    safetySection: { label: "Safety", title: "Clear boundaries come before closer connections.", body: "From public conversations and in-person activities to housing, secondhand exchange, hiring, and local services, Machi provides risk prompts, reporting, blocking, review, and account action so people have clearer grounds for every interaction." },
	    download: { label: "Available on the web now", title: "Start with your city on Machi Web.", body: "Machi Web Beta is available now. After registration, you can use city home, discovery and search, notifications, messages, posting, profiles and community participation. The iOS and Android apps are in preparation, and App Store / Google Play availability will be marked clearly when ready.", primary: "Get app launch updates", secondary: "Join local community", appStore: "iOS: Coming soon", googlePlay: "Android: Coming soon", webBeta: "Web Beta: Live now", formLabel: "Launch updates", formTitle: "Notify me when the app launches", email: "Email", cityLabel: "Preferred city", languageLabel: "Language preference", intentLabel: "I want to use Machi for", cityOptions: ["Tokyo", "Los Angeles", "Toronto", "Other city"], languageOptions: ["English", "中文", "日本語"], intentOptions: ["Local life info", "Community participation", "Food meetups", "Event groups", "Language exchange", "Housing", "Secondhand", "Jobs", "Hiring", "Business promotion", "Local services"], notify: "Notify me", sending: "Sending…", success: "Received. We'll notify you when the iOS / Android app launches; you can use Machi on the Web now.", errorInvalid: "That email does not look right. Please double-check.", errorSubmit: "Could not submit just now. Please try again.", benefitsTitle: "What you will get", benefits: [["Web Beta access", "City home, discovery, search, notifications, messages, posting and profiles are available on the Web."], ["App launch notices", "Be notified when iOS and Android are ready."], ["More cities and guides", "Updates for new cities, new countries and Japan Guide." ]], webFeatures: ["City home", "Discovery & search", "Notifications", "Messages", "Posting", "Profiles", "Local community"], privacy: "We only email you about app launch, city openings and guide updates. We never sell your email or sign you up for other lists." },
    faqSection: { label: "FAQ", title: "A few things worth knowing about Machi." },
    common: { open: "Open" },
	    footer: { tagline: "Find the echoes of real life in every city.", description: "Keep useful local knowledge close to where it belongs, so one person's experience can keep helping the next.", groups: [["Navigation", ["About", "Features", "Guide", "Business", "Safety", "FAQ", "Cities", "Download"]], ["Partnership", ["Business", "Advertising", "Hiring promotion", "Housing promotion", "System partnership"]], ["Legal", ["Privacy Policy", "Terms of Service", "Membership Terms", "Service Terms", "Refund Policy", "Community Guidelines", "Commercial Disclosure", "Cookie Policy", "Contact"]]] },
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
    businessItems: ["Restaurant offers and dining events", "Language-school trial classes and exchange groups", "Local participant recruitment for events", "Interest groups for gyms and classes", "Qualified leads for local services", "Hiring within the city community"],
    faqs: [
      ["What is Machi?", "Machi organizes the practical parts of city life by place and language: Guide, Q&A, housing, secondhand exchange, jobs, hiring, local services, groups, events, and first-hand advice."],
      ["Is Machi a dating app?", "No. Machi is built for public city topics and community participation, including local groups, language exchange, and events. It does not provide dating matches, private introductions, or paid companionship."],
      ["Is Machi only for Japan?", "No. We are starting with Japan Guide and Tokyo, then expanding to other cities as real demand and local readiness grow."],
      ["What is Machi Guide?", "Japan Guide brings together practical information on daily life, school applications, job hunting, JLPT, schools, companies, downloadable resources, and related services."],
      ["Which cities are available first?", "The web experience currently focuses on Japan and Tokyo. Osaka, Kyoto, and international cities will be added gradually, with each city's status shown clearly."],
      ["Can I use Machi in my language?", "Yes. Interface language and content language are separate. Chinese, English, and Japanese come first, with more languages added where a city needs them."],
      ["Can businesses join?", "Yes. Stores, service providers, recruiters, housing businesses, event organizers, and education partners can apply for verification or partnership. Verification does not guarantee exposure or results."],
      ["Can I post housing, jobs, or secondhand items?", "Yes. Posts must be accurate, clear, and lawful. Depending on the content, they may be reviewed, carry a risk notice, or be reported by users."],
      ["How does Machi support user safety?", "Reporting, blocking, review, verification, and risk prompts are built into posts, messages, in-person activities, housing, secondhand exchange, hiring, and local services."],
      ["Is Machi a study-abroad agency?", "No. Japan Guide covers study, careers, and daily life, and some services may be bookable. Machi as a whole is a platform for navigating life in a city."],
      ["Do paid services guarantee an outcome?", "No. Admissions, employment, visas, housing, banking, and other outcomes depend on your circumstances, documents, third parties, and local rules."],
      ["Can I delete my account?", "Yes. You can manage your profile and request account deletion. Public posts may already have been viewed or responded to before deletion."],
      ["When will the mobile apps launch?", "Machi Web Beta is available now. The iOS and Android apps are in preparation, and we will announce release dates when they are confirmed."],
      ["How can I contact Machi?", "For partnerships, press, business applications, city suggestions, or privacy questions, email hi@machicity.com."],
    ],
  },
  ja: {
    nav: {
      items: [["ホーム", "/"], ["街", "/cities"], ["機能", "/features"], ["ガイド", "/guide"], ["コミュニティ", "/#social"], ["ビジネス", "/business"], ["安全", "/safety"], ["ダウンロード", "/download"], ["概要", "/about"]],
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
      subtitle: "新しい街で暮らし始めると、住まい、仕事、手続き、地域のサービス、同じ街の人とのつながりを一つずつ探すことになります。Machi は、そうした実体験を街と言語ごとに整理し、必要な情報に出会い、判断し、返事を受け取れる場所にします。",
      supporting: "まずは日本で、住まい、就職、留学、日々の手続き、街のコミュニティを丁寧につくります。その後、韓国、オーストラリア、カナダ、米国、英国へ、必要とされる街から広げていきます。",
      primary: "Web Betaを見る",
      secondary: "創設者の物語へ",
      tertiary: "Machi Guideを見る",
      quaternary: "事業者提携を申請",
      appStoreCaption: "App Store · まもなく公開",
      appStore: "App Store",
      googlePlayCaption: "Google Play · まもなく公開",
      googlePlay: "Google Play",
      webBetaCaption: "Web 版 · 公開中",
      scrollLabel: "続きを見る",
      stats: [["Web Beta", "利用できます"], ["Japan Guide", "生活 · 進学 · 就職"], ["次の街へ", "韓国 · 豪州 · カナダ · 米英"]],
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
      title: "街で暮らすための情報を、あちこち探し回らなくていいように。",
      body: "Machi は、地域情報、実体験、日々の用事、人から人への返事を、街・言語・目的ごとにまとめます。見つけやすく、わかりやすく、次に何をすればよいかが伝わる形に整えます。",
      pillars: [
        ["街を基準に", "国、地域、街ごとに整理し、情報を実際の暮らしに近い場所へ戻します。"],
        ["言葉の違いを前提に", "画面の言語と投稿の言語を分け、多言語で暮らす街の自然な表現を支えます。"],
        ["日々の場面から", "住まい、譲り合い、仕事、イベント、Q&A、地域サービスを、目的ごとに整理します。"],
        ["信頼できる手がかりを", "通報、ブロック、審査、認証、リスク表示によって、地域でのやり取りを支えます。"],
      ],
    },
    guideSection: {
      label: "Machi Guide",
      title: "日本で暮らすための道筋を、わかりやすく。",
      body: "銀行口座、携帯、年金、役所手続きから、進学、就職、JLPT、学校・企業情報まで。Machi Guide は、実際に向き合う手順を一つずつ整理し、必要なサービスにも迷わずたどり着けるようにします。",
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
      title: "街の輪郭は、そこに暮らす人の日常から見えてくる。",
      lead: "あとから思い出すのは、有名な場所よりも、暮らしが少し前へ進んだ具体的な瞬間かもしれません。",
      cityLines: [
        "書き込みでいっぱいになった賃貸契約書。",
        "帰り道で見つけた求人の貼り紙。",
        "引っ越し前に次の人へ譲る椅子。",
        "手続きを終えたあとに残した注意書き。",
        "週末に急きょ決まった街歩き。",
        "同じ街にいる誰かからの丁寧な返事。",
      ],
      paragraphs: [
        "来たばかりで、携帯と銀行口座のどちらを先にすべきか迷う人がいます。長く住み、必要な順番を知っている人もいます。",
        "住まいや仕事を探す人、不要になった物を譲る人、週末の予定を探す人。それぞれの日常が、街の情報になります。",
        "どれも特別な出来事ではありませんが、知らない場所で安心して暮らし始めるためには欠かせません。",
        "Machi は、役に立つ経験を時間や場所、背景とともに残し、必要な人があとから見つけられるようにします。",
        "情報は、次の一歩がわかる案内になり、相手を思いやる返事になり、新しい地域のつながりにもなります。",
        "街が少し身近になるのは、「次に何をすればいいか」がわかったときです。",
      ],
      highlights: [
        ["質問", "このエリアは住みやすい？"],
        ["経験", "住まい、手続き、仕事、注意点。"],
        ["機会", "採用、サービス、イベント、お得情報。"],
      ],
      echoLabel: "街で交わされる声",
      echoNodes: ["聞く", "分け合う", "見つかる", "届く"],
      closing: "知っていることを残し、必要なことにたどり着く。街の経験が、次の誰かへ渡っていく場所です。",
    },
    founder: {
      eyebrow: "創設者から",
      title: "姚凱です。Machi は、街と情報と人の応答について考え続ける中で生まれました。",
      name: "姚凱 / YAOKAI",
      role: "Machi 創設者・プロダクト制作者",
      meta: "2019年10月、留学のため来日",
      avatar: "姚",
      readMore: "創設者のストーリーを読む",
      bio: "つくりたいのは、ただ情報を並べる場所ではありません。経験が残り、必要としている人に届き、人と人がもう一度応答できる、街への入口です。",
      quote: "「街を身近にするのは、住所だけではありません。誰かが残してくれた道筋と、必要なときに返ってくる声だと思います。」",
      paragraphs: [
        "姚凱です。Machi の創設者として、プロダクト、デザイン、開発に今も携わっています。",
        "街で人が本当に必要としているのは、情報の量だけではないと感じています。どこで起きたことか、いつの経験か、誰が通ってきた道なのか、そして今の自分にも使えるのか。その背景まで含めて、初めて答えになります。",
        "小さな経験が、誰かの一日を大きく変えることがあります。賃貸契約の注意点、手続きの順番、仕事探しの記録、地域サービスの率直な感想。大きな物語ではなくても、次の人にとって最初の手がかりになります。",
        "けれど、その答えはグループチャットやSNS、地域サイト、友人の記憶の中に散らばり、さらに言語の違いで分かれてしまいます。来たばかりの人は判断しづらく、街をよく知る人も経験を長く残せる場所を持ちにくい。",
        "そこで Machi をつくり始めました。住まい、仕事、譲り合い、Q&A、地域サービス、コミュニティの会話を、街と言語に結びつけて整理する。情報には時期、場所、出どころを持たせ、人には必要なときに出会えるきっかけをつくりたいと考えています。",
        "Machi という名前は、日本語の「街（まち）」から取りました。私にとって街は地図上の名称ではなく、暮らしのリズムを覚え、人との関係を築き、少しずつ居場所になっていく場所です。",
        "Machi を、やさしく、けれど秩序のある街のインフラに育てたいと思っています。役に立つ経験が大切に残り、来たばかりの人が一人で迷い続けず、丁寧な共有が次の誰かにも届き続ける場所へ。",
      ],
      closing: "役に立つ経験を、それが生まれた街に残す。\n来たばかりの人が、一人で迷う時間を減らす。\n丁寧な共有が、次の誰かにも届くようにする。",
      siteEyebrow: "Machi の外側で",
      siteTitle: "Machi の外でも、つくったものと日々の記録を残しています。",
      siteBody: "yaokai.me では、プロダクトやデザインについて考えたこと、ここまでの歩み、制作途中の仕事を紹介しています。履歴書というより、今も手を動かしている小さな仕事場に近い場所です。",
      siteCta: "yaokai.me へ",
    },
    announcementsSection: { label: "お知らせ", title: "Machi からのお知らせ", body: "プロダクトの進捗、公開予定の街、先行利用、提携に関する情報をお届けします。", manageHint: "最新の公式情報は、こちらでご確認ください。", manageLabel: "お知らせ一覧", composerTitle: "お知らせを公開", titlePlaceholder: "例：東京チャンネルを近日公開します", bodyPlaceholder: "お知らせの本文を入力", publish: "公開", empty: "本文を入力してください。", saved: "お知らせを公開しました。", tabs: ["お知らせ", "ニュース", "アプリ更新", "ご案内", "トピック"], defaultItems: [{ type: "お知らせ", title: "Machi Web Beta を公開しました", date: "2026.06", body: "登録後、街のホーム、検索、通知、メッセージ、投稿、プロフィール、地域コミュニティを利用できます。" }, { type: "ニュース", title: "日本 Guide を公開しました", date: "2026.06", body: "暮らし、進学、就職、JLPT、学校・企業情報、資料、サービスを順次整えています。" }, { type: "アプリ更新", title: "Google ログインに対応しました", date: "2026.06", body: "Web と iOS で Google ログインを利用できます。App Store / Google Play 版は引き続き準備中です。" }, { type: "ご案内", title: "新しい国と街を準備しています", date: "2026.06", body: "カナダ、オーストラリア、英国、フランス、ドイツ、韓国、米国などへ、街ごとに展開していきます。" }, { type: "トピック", title: "ビジネス提携の受付を始めました", date: "2026.06", body: "店舗、採用担当、不動産、地域サービス事業者からのご相談を受け付けています。" }] },
    citySection: {
      label: "街",
      title: "最初の街は、毎日の暮らしから。",
      body: "Machi は、街ごとの声を確かめながら育ちます。まず日本でガイド、サービス、地域コミュニティを磨き、その後、実際の需要に合わせて海外の街へ広げます。",
      badge: "初期公開データ",
      switcherLabel: "現在の街",
      switcherActive: "日本 · 東京",
      switcherHint: "切り替え",
      switcherCities: ["ロサンゼルス", "トロント", "上海", "杭州"],
      sampleNote: "プレビュー：投稿、注目度、公開状況は画面例であり、実際の運用データではありません。",
    },
	    featureSection: {
	      label: "街のチャンネル",
	      title: "住まいも仕事も相談も、いま暮らす街から探せるように。",
      body: "住まい、譲り合い、仕事、求人、イベント、Q&A、地域サービス、コミュニティをチャンネルごとに分け、さらに街と言語で整理します。",
      groups: [
        {
          title: "街の情報",
          description: "ニュース、ガイド、Q&A、地域サービスから、暮らしに必要なことを探せます。",
          channels: ["news", "guides", "qa", "services"] as const,
        },
        {
          title: "取引と仕事",
          description: "住まい、譲り合い、仕事探し、求人、地域サービスの情報をまとめます。",
          channels: ["housing", "secondhand", "jobs", "hiring"] as const,
        },
        {
          title: "コミュニティと地域の活動",
          description: "地域グループ、イベント、言語交換、食事会、暮らしの注意点を見つけられます。",
          channels: ["social", "meetups", "dining", "events", "language-exchange", "avoid"] as const,
        },
      ],
    },
	    trendingSection: { label: "トレンド", title: "街で話題になっていることを見る。", subtitle: "いいね、コメント、保存、再投稿、投稿からの経過時間をもとに、その街でいま関心を集めている内容を表示します。", cardTitle: "東京トレンド", cardSubtitle: "街のランキング", formulaTitle: "注目度のしくみ", heatLabel: "注目度", formula: ["いいね", "コメント", "保存", "再投稿"] },
    languageSection: { label: "多言語", title: "同じ街に暮らしていても、使う言葉は一つではありません。", body: "画面の言語と、読むコンテンツの言語は別々に選べます。東京で中国語の体験談を読み、トロントで日本語の情報を探し、ロサンゼルスの暮らしを英語で知ることができます。", chips: ["中文", "English", "日本語", "한국어", "Français", "Español"], contextTitle: "言語に合わせた発見", contextLabel: "表示の条件", regionLabel: "現在の地域", region: "カナダ · トロント", contentLanguageLabel: "コンテンツ言語", contentLanguage: "日本語", priorityLabel: "優先して表示", priority: ["トロントの日本語投稿", "カナダの日本語投稿", "Machi 全体で注目されている日本語投稿", "トロントの関連する他言語投稿"] },
    useCaseSection: { label: "街の場面", title: "毎日の暮らしから設計する。" },
    businessSection: { label: "ビジネス", title: "信頼できる地域サービスを、必要な人が探しているときに。", body: "認証された店舗や事業者は、街、チャンネル、言語に合わせて、サービス、特典、求人、イベントを掲載できます。提供者と内容がわかる形で伝え、利用する人が判断しやすい環境を整えます。", primary: "提携を申し込む", secondary: "広告プランを見る", consoleLabel: "ビジネス管理", consoleTitle: "東京パートナー施策", verified: "認証事業者", partnerTitle: "認証ローカルパートナー", partnerBody: "認証情報、サービス内容、街での掲載、問い合わせ導線、チャンネル運営。", campaigns: [["レストランの特典と食事会", "認証事業者"], ["語学学校の体験レッスン", "サービス内容"], ["地域の求人とサービス相談", "街のチャンネル"]] },
	    safetySection: { label: "安全", title: "人と近づく前に、守るべき境界を明確に。", body: "公開のやり取りや地域の活動から、住まい、譲り合い、求人、地域サービスまで。注意喚起、通報、ブロック、審査、アカウント対応によって、判断に必要な手がかりを用意します。" },
	    download: { label: "Web 版は公開中", title: "まずは Web で、暮らす街を開いてみる。", body: "Machi Web Beta は現在利用できます。登録後、街のホーム、発見と検索、通知、メッセージ、投稿、プロフィール、コミュニティへの参加を利用できます。iOS と Android アプリは準備中です。公開状況は App Store / Google Play の案内とともに、公式サイトで明確にお知らせします。", primary: "アプリ公開通知を受け取る", secondary: "地域コミュニティに参加", appStore: "iOS：近日公開", googlePlay: "Android：近日公開", webBeta: "Web Beta：公開中", formLabel: "公開通知", formTitle: "アプリ公開時にお知らせします", email: "メールアドレス", cityLabel: "希望する街", languageLabel: "利用する言語", intentLabel: "Machi で探したいこと", cityOptions: ["東京", "ロサンゼルス", "トロント", "その他の街"], languageOptions: ["日本語", "English", "中文"], intentOptions: ["地域の生活情報", "コミュニティへの参加", "食事の集まり", "イベント", "言語交換", "住まい", "譲り合い", "仕事探し", "求人", "事業者プロモーション", "地域サービス"], notify: "通知を受け取る", sending: "送信中…", success: "受け付けました。iOS / Android アプリの公開時にお知らせします。現在は Web 版をご利用いただけます。", errorInvalid: "メールアドレスをご確認ください。", errorSubmit: "送信できませんでした。時間をおいて、もう一度お試しください。", benefitsTitle: "お知らせする内容", benefits: [["現在利用できる Web Beta", "街のホーム、発見、検索、通知、メッセージ、投稿、プロフィールを Web で利用できます。"], ["アプリ公開のお知らせ", "iOS と Android の準備が整い次第、お知らせします。"], ["街とガイドの更新", "新しい街や国、日本 Guide の更新情報をお届けします。"]], webFeatures: ["街のホーム", "発見・検索", "通知", "メッセージ", "投稿", "プロフィール", "地域コミュニティ"], privacy: "アプリの公開、新しい街、ガイドの更新に関するお知らせ以外はお送りしません。メールアドレスを販売したり、別の配信リストへ登録したりすることもありません。" },
    faqSection: { label: "よくある質問", title: "Machi について、よくいただく質問。" },
    common: { open: "開く" },
	    footer: { tagline: "どの街でも、暮らしの声を見つける。", description: "役に立つ情報を街に残し、一人の経験が次の誰かにも届くように。", groups: [["ナビ", ["概要", "機能", "ガイド", "ビジネス", "安全", "FAQ", "街", "ダウンロード"]], ["提携", ["店舗提携", "広告掲載", "採用プロモーション", "住まいプロモーション", "システム提携"]], ["法務", ["プライバシー", "利用規約", "会員規約", "サービス予約規約", "返金ポリシー", "コミュニティ規範", "特定商取引法に基づく表記", "Cookie ポリシー", "お問い合わせ"]]] },
	    cities: withCityTone([{ name: "東京", country: "日本", description: "住まいの注意、食事、言語交換、地域グループを先に磨いています。", posts: "住まい · 食事 · 言語交換 · 地域グループ", heat: "Web Beta 公開中", status: "Web Beta 公開中", sampleLabel: "画面プレビュー", languageTags: ["中文", "EN", "日本語"], sceneTags: ["住まい", "食事", "言語交換", "地域グループ"], highlight: "渋谷、新宿、湾岸の暮らし" }, { name: "ロサンゼルス", country: "米国", description: "仕事、イベント、食事、地域サービス、多言語コミュニティを準備中です。", posts: "仕事 · イベント · 食事 · 地域サービス", heat: "準備中", status: "準備中", sampleLabel: "画面プレビュー", languageTags: ["EN", "中文", "日本語"], sceneTags: ["仕事", "イベント", "食事", "地域サービス"], highlight: "地域ごとの生活とサービス需要" }, { name: "トロント", country: "カナダ", description: "住まい、仕事、多言語 Q&A、新しい街での生活サポートを準備中です。", posts: "住まい · 仕事 · 多言語 Q&A · 地域グループ", heat: "準備中", status: "準備中", sampleLabel: "画面プレビュー", languageTags: ["EN", "中文", "日本語"], sceneTags: ["住まい", "仕事", "Q&A", "地域グループ"], highlight: "新しい街での生活サポート" }]),
	    features: withFeatureMeta([{ title: "ニュース", badge: "地域のお知らせ", description: "地域ニュース、制度、交通、安全に関するお知らせ。" }, { title: "ガイド", badge: "暮らしの案内", description: "住まい、ビザ、銀行、携帯、各種手続き、生活の知恵。" }, { title: "街の話題", badge: "地域トピック", description: "公開の地域トピック、ローカルグループ、趣味のコミュニティ。" }, { title: "グループ", badge: "地域の集まり", description: "食事会、イベント、スポーツ、言語交換、週末の集まり。" }, { title: "食事", badge: "一緒に食べる", description: "食事会、カフェ、店巡り、街の食にまつわる話題。" }, { title: "イベント", badge: "地域で参加", description: "展示、まち歩き、講座、ボードゲーム、スポーツ、交流会。" }, { title: "言語交換", badge: "多言語", description: "中国語、英語、日本語などを学び合う地域グループ。" }, { title: "住まい", badge: "賃貸・シェア", description: "賃貸、転貸、シェア、ルームメイト、契約時の注意点。" }, { title: "譲り合い", badge: "地域のリユース", description: "不要品、探し物、引っ越し前の譲渡、無料のお譲り。" }, { title: "仕事探し", badge: "キャリア", description: "アルバイト、正社員、インターン、リモート、求職経験。" }, { title: "求人", badge: "募集情報", description: "地域の店舗、企業、団体からの募集情報。" }, { title: "Q&A", badge: "地域の相談", description: "ビザ、住まい、仕事、学校、医療など、街の暮らしに関する相談。" }, { title: "サービス", badge: "暮らしの支援", description: "引っ越し、翻訳、ビザ、留学、保険、修理、税務。" }, { title: "注意情報", badge: "リスク情報", description: "住まい、取引、求人、イベント、対面時の注意点。" }]),
    trendingPosts: [{ title: "東京の住まいガイド", heat: "56.2K", category: "住まい" }, { title: "新宿で週末ごはん", heat: "38.9K", category: "食事" }, { title: "渋谷のアルバイト採用、日本語 N3 以上", heat: "21.6K", category: "採用" }, { title: "引越し中古家具、格安引き取り", heat: "18.4K", category: "中古" }],
    useCases: [{ title: "知らない街に来たとき", description: "ガイド、住まい、手続き、仕事探し。", icon: "MapPinned" }, { title: "引っ越しや帰国の前", description: "不要品の譲渡、転貸、引っ越しサービス探し。", icon: "PackageOpen" }, { title: "仕事を探すとき", description: "求人、アルバイト、紹介、面接経験。", icon: "BriefcaseBusiness" }, { title: "週末に出かけたいとき", description: "食事、イベント、展示、街歩き。", icon: "Sparkles" }, { title: "暮らしで困ったとき", description: "質問して、地域の人の経験を知る。", icon: "CircleHelp" }, { title: "地域で事業を営む人", description: "特典、求人、イベントを、街の利用者へ。", icon: "Store" }],
    safetyItems: [
      { title: "コミュニティでのやり取り", body: "住所、身分証、金銭に関する情報は、信頼関係ができる前に共有しないでください。嫌がらせや詐欺は通報・ブロックできます。" },
      { title: "初めて会うとき", body: "人目のある場所を選び、予定を家族や友人に伝え、やり取りを残しておきましょう。" },
      { title: "食事会", body: "参加前に、場所、人数、費用、途中で退出できるかを確認してください。" },
      { title: "言語交換", body: "初回は公共の場所で会い、個人宅など閉じた場所は避けることを勧めています。" },
      { title: "住まい探し", body: "確認できていない貸主へ前払いせず、住所、契約内容、相手の身元を確かめてください。相場より極端に安い物件にも注意が必要です。" },
      { title: "譲り合い・中古取引", body: "人目のある場所を選び、高額品は対面で状態を確認してください。大きな前金は避けましょう。" },
      { title: "仕事探し・求人", body: "採用のための保証金や手数料は支払わず、会社の公式サイト、所在地、連絡先を確認してください。" },
      { title: "事業者の認証", body: "店舗、採用担当、不動産、地域サービス事業者には、認証とリスク表示の仕組みを用意します。" },
      { title: "通報とブロック", body: "通報、ブロック、審査、削除、アカウント制限まで、状況に応じて対応します。" },
	      { title: "コミュニティ規範", body: "嫌がらせ、差別、詐欺、なりすまし、禁止されたサービス、虚偽のイベント、危険な対面行為を認めません。" },
    ],
    businessItems: ["レストランの食事会と特典", "語学学校の体験レッスンと交流会", "イベント主催者による地域参加者の募集", "ジムや教室の興味別コミュニティ", "地域サービスへの問い合わせ", "街のコミュニティに向けた求人"],
    faqs: [
      ["Machi とは？", "Machi は、街で暮らすための情報と人の経験を、国・街・言語ごとに整理するローカルライフ・プラットフォームです。Guide、Q&A、住まい、譲り合い、仕事、求人、地域サービス、グループ、イベントなどを扱います。"],
      ["Machi はデーティングアプリですか？", "いいえ。Machi は、恋愛相手の紹介やマッチングを目的としたサービスではありません。交流機能は、公開された街の話題、地域グループ、言語交換、イベントなど、地域コミュニティへの参加のために提供しています。"],
      ["Machi は日本だけのサービスですか？", "いいえ。まず日本 Guide と東京を中心に体験を整え、実際の需要を確かめながら、ほかの国や街へ広げていきます。"],
      ["Machi Guide とは？", "日本での暮らし、進学、就職、JLPT、学校・企業情報、各種資料やサービスを、必要な順番で探せるように整理したガイドです。"],
      ["最初に利用できる街は？", "現在は日本と東京を中心に Web 版を公開しています。大阪、京都、海外の街は準備状況を確認しながら順次案内します。"],
      ["自分の言語で使えますか？", "はい。画面の言語と、読みたい投稿の言語は別々に選べます。まず日本語、英語、中国語を整え、街の需要に合わせて対応言語を増やします。"],
      ["事業者も参加できますか？", "はい。店舗、地域サービス、採用担当、不動産関連事業者、イベント主催者、教育機関は、認証や提携を申請できます。掲載や成果を保証するものではありません。"],
      ["住まい、求人、中古品を投稿できますか？", "はい。内容は正確でわかりやすく、現地の法令に沿っている必要があります。投稿内容によっては審査、注意表示、通報対応の対象になります。"],
      ["安全のために、どんな対策がありますか？", "投稿やメッセージ、対面、住まい、譲り合い、求人、地域サービスに、通報、ブロック、審査、認証、リスク表示を組み込みます。"],
      ["Machi は留学エージェントですか？", "いいえ。Guide では日本の進学、就職、暮らしに関する情報や、一部の予約サービスを扱いますが、Machi 全体は街の暮らしを支えるプラットフォームです。"],
      ["有料サービスは結果を保証しますか？", "保証しません。進学、就職、ビザ、住まい、口座開設、合格、採用などの結果は、ご本人の状況、提出資料、第三者機関、現地の制度によって変わります。"],
      ["アカウントを削除できますか？", "はい。プロフィールを管理し、アカウント削除を申請できます。公開した投稿は、削除前にほかの利用者が閲覧または反応している場合があります。"],
      ["アプリはいつ公開されますか？", "Web Beta は現在利用できます。iOS と Android は準備中です。公開日が決まり次第、公式サイトと通知登録者へお知らせします。"],
      ["Machi に連絡するには？", "提携、取材、事業者のお申し込み、街の展開に関するご提案、プライバシーのお問い合わせは、hi@machicity.com までお送りください。"],
    ],
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
    webFeatures: string[];
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
