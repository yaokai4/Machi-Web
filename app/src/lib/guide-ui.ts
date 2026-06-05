import type { Locale } from "@/lib/i18n";

type GuideUi = {
  back: string;
  all: string;
  search: string;
  filter: string;
  clearFilters: string;
  retryLater: string;
  totalSchools: (count: number) => string;
  totalCompanies: (count: number) => string;
  schools: {
    title: string;
    subtitle: string;
    placeholder: string;
    listTitle: string;
    loadError: string;
    emptyTitle: string;
    emptySubtitle: string;
  };
  companies: {
    title: string;
    subtitle: string;
    placeholder: string;
    listTitle: string;
    loadError: string;
    emptyTitle: string;
    emptySubtitle: string;
  };
  services: {
    title: string;
    subtitle: string;
    body: string;
    loadError: string;
    emptyTitle: string;
    emptySubtitle: string;
    digitalTitle: string;
    digitalSubtitle: string;
    humanTitle: string;
    humanSubtitle: string;
    groupEmpty: string;
  };
  category: {
    relatedTitle: string;
    jlptTitle: string;
    relatedSubtitle: string;
    articlesTitle: string;
    articlesSubtitle: string;
    loadError: string;
    emptyTitle: string;
    emptySubtitle: string;
  };
};

const ZH: GuideUi = {
  back: "日本指南",
  all: "全部",
  search: "搜索",
  filter: "筛选",
  clearFilters: "清除筛选",
  retryLater: "请稍后再试。",
  totalSchools: (count) => `共 ${count} 所学校`,
  totalCompanies: (count) => `共 ${count} 家公司`,
  schools: {
    title: "日本学校库",
    subtitle: "查找日本大学、大学院、专门学校、语言学校和留学生申请信息。",
    placeholder: "搜索学校名称、地区、专业、入学方式",
    listTitle: "学校列表",
    loadError: "学校列表暂时无法加载",
    emptyTitle: "暂无匹配学校",
    emptySubtitle: "试试减少筛选条件，或等待编辑部继续补充资料。",
  },
  companies: {
    title: "外国人就职公司库",
    subtitle: "查找适合外国人就职的日本公司、行业、岗位和面试经验。",
    placeholder: "搜索公司、行业、岗位、城市",
    listTitle: "公司列表",
    loadError: "公司列表暂时无法加载",
    emptyTitle: "暂无匹配公司",
    emptySubtitle: "试试减少筛选条件，或等待编辑部继续补充资料。",
  },
  services: {
    title: "资料与服务",
    subtitle: "资料包、模板、清单、课程与人工辅导服务",
    body: "Machi 编辑部整理学习与申请资料，也提供简历修改、研究计划书修改、申请辅导、接机翻译等人工服务。数字资料以页面标价为准；人工服务先预约咨询，确认范围后再付款。",
    loadError: "资料暂时无法加载",
    emptyTitle: "暂无相关资料或服务",
    emptySubtitle: "更多资料正在准备中。",
    digitalTitle: "数字资料",
    digitalSubtitle: "PDF、模板、清单与课程，原创整理",
    humanTitle: "人工服务",
    humanSubtitle: "咨询、文书修改、接机翻译与手续协助",
    groupEmpty: "这个分类正在整理中。",
  },
  category: {
    relatedTitle: "相关资料与服务",
    jlptTitle: "JLPT 资料包",
    relatedSubtitle: "与本频道相关的资料、模板、清单与人工辅导服务",
    articlesTitle: "指南文章",
    articlesSubtitle: "由 Machi 编辑部整理",
    loadError: "内容暂时无法加载",
    emptyTitle: "这个分类的指南正在整理中",
    emptySubtitle: "Machi 编辑部会持续补充内容。",
  },
};

const EN: GuideUi = {
  back: "Japan Guide",
  all: "All",
  search: "Search",
  filter: "Filters",
  clearFilters: "Clear filters",
  retryLater: "Please try again later.",
  totalSchools: (count) => `${count} schools`,
  totalCompanies: (count) => `${count} companies`,
  schools: {
    title: "Japan School Database",
    subtitle: "Find universities, graduate schools, vocational schools, language schools and application information for international students.",
    placeholder: "Search by school, area, major or admission route",
    listTitle: "Schools",
    loadError: "School list is temporarily unavailable",
    emptyTitle: "No matching schools",
    emptySubtitle: "Try fewer filters or check back as the editorial team adds more records.",
  },
  companies: {
    title: "Foreigner-Friendly Company Database",
    subtitle: "Find Japanese companies, industries, roles and interview notes for international job seekers.",
    placeholder: "Search companies, industries, roles or cities",
    listTitle: "Companies",
    loadError: "Company list is temporarily unavailable",
    emptyTitle: "No matching companies",
    emptySubtitle: "Try fewer filters or check back as the editorial team adds more records.",
  },
  services: {
    title: "Resources and Services",
    subtitle: "Resource packs, templates, checklists, courses and one-to-one support",
    body: "Machi curates study and application resources and offers services such as resume review, research-plan review, application coaching, airport pickup and interpretation. Digital resources use the listed price; human services start with a consultation and are paid after the scope is confirmed.",
    loadError: "Resources are temporarily unavailable",
    emptyTitle: "No resources or services yet",
    emptySubtitle: "More resources are being prepared.",
    digitalTitle: "Digital resources",
    digitalSubtitle: "Original PDFs, templates, checklists and courses",
    humanTitle: "Human services",
    humanSubtitle: "Consultation, document review, pickup, interpretation and procedure support",
    groupEmpty: "This category is being prepared.",
  },
  category: {
    relatedTitle: "Related resources and services",
    jlptTitle: "JLPT resource packs",
    relatedSubtitle: "Templates, checklists and support services related to this channel",
    articlesTitle: "Guide articles",
    articlesSubtitle: "Curated by the Machi editorial team",
    loadError: "Content is temporarily unavailable",
    emptyTitle: "This category is being prepared",
    emptySubtitle: "The Machi editorial team will keep adding useful content.",
  },
};

const JA: GuideUi = {
  back: "日本ガイド",
  all: "すべて",
  search: "検索",
  filter: "絞り込み",
  clearFilters: "条件をクリア",
  retryLater: "しばらくしてからもう一度お試しください。",
  totalSchools: (count) => `${count}件の学校`,
  totalCompanies: (count) => `${count}件の企業`,
  schools: {
    title: "日本の学校データベース",
    subtitle: "大学、大学院、専門学校、日本語学校、留学生向けの出願情報を探せます。",
    placeholder: "学校名・地域・専攻・入学方法で検索",
    listTitle: "学校一覧",
    loadError: "学校一覧を読み込めません",
    emptyTitle: "該当する学校がありません",
    emptySubtitle: "条件を少し減らすか、編集部による追加をお待ちください。",
  },
  companies: {
    title: "外国人向け就職会社データベース",
    subtitle: "外国人が応募しやすい日本企業、業界、職種、面接情報を探せます。",
    placeholder: "企業名・業界・職種・都市で検索",
    listTitle: "企業一覧",
    loadError: "企業一覧を読み込めません",
    emptyTitle: "該当する企業がありません",
    emptySubtitle: "条件を少し減らすか、編集部による追加をお待ちください。",
  },
  services: {
    title: "資料とサービス",
    subtitle: "資料パック、テンプレート、チェックリスト、講座、個別サポート",
    body: "Machi 編集部が学習・申請資料を整理し、履歴書添削、研究計画書レビュー、申請相談、空港送迎、通訳などの個別サービスも提供します。デジタル資料は表示価格で購入、個別サービスは相談後に範囲と料金を確定します。",
    loadError: "資料を読み込めません",
    emptyTitle: "該当する資料・サービスがありません",
    emptySubtitle: "新しい資料を準備中です。",
    digitalTitle: "デジタル資料",
    digitalSubtitle: "PDF、テンプレート、チェックリスト、講座を独自整理",
    humanTitle: "個別サービス",
    humanSubtitle: "相談、書類添削、送迎、通訳、手続きサポート",
    groupEmpty: "このカテゴリは準備中です。",
  },
  category: {
    relatedTitle: "関連資料とサービス",
    jlptTitle: "JLPT 資料パック",
    relatedSubtitle: "このカテゴリに関連するテンプレート、チェックリスト、個別サポート",
    articlesTitle: "ガイド記事",
    articlesSubtitle: "Machi 編集部が整理",
    loadError: "コンテンツを読み込めません",
    emptyTitle: "このカテゴリは準備中です",
    emptySubtitle: "Machi 編集部が順次追加していきます。",
  },
};

export function guideUi(locale: Locale): GuideUi {
  if (locale === "en") return EN;
  if (locale === "ja") return JA;
  return ZH;
}

export function schoolTypeLabel(value: string, locale: Locale): string {
  const table: Record<string, Record<"zh" | "en" | "ja", string>> = {
    university: { zh: "大学", en: "University", ja: "大学" },
    graduate_school: { zh: "大学院", en: "Graduate school", ja: "大学院" },
    junior_college: { zh: "短期大学", en: "Junior college", ja: "短期大学" },
    college_of_technology: { zh: "高专", en: "Technical college", ja: "高専" },
    vocational_school: { zh: "专门学校", en: "Vocational school", ja: "専門学校" },
    language_school: { zh: "语言学校", en: "Language school", ja: "日本語学校" },
    other: { zh: "其他", en: "Other", ja: "その他" },
  };
  const key = locale === "en" ? "en" : locale === "ja" ? "ja" : "zh";
  return table[value]?.[key] || table.other[key];
}

export function regionGroupLabel(value: string, locale: Locale): string {
  const key = locale === "en" ? "en" : locale === "ja" ? "ja" : "zh";
  const table: Record<string, Record<"zh" | "en" | "ja", string>> = {
    capital_area: { zh: "首都圈", en: "Greater Tokyo", ja: "首都圏" },
    kansai_area: { zh: "关西圈", en: "Kansai", ja: "関西圏" },
    all_japan: { zh: "日本全国", en: "All Japan", ja: "日本全国" },
  };
  return table[value]?.[key] || value;
}

export function prefectureOptions(locale: Locale): Array<{ value: string; label: string }> {
  const key = locale === "en" ? "en" : locale === "ja" ? "ja" : "zh";
  const labels: Record<string, Record<"zh" | "en" | "ja", string>> = {
    tokyo: { zh: "东京", en: "Tokyo", ja: "東京" },
    kanagawa: { zh: "神奈川", en: "Kanagawa", ja: "神奈川" },
    chiba: { zh: "千叶", en: "Chiba", ja: "千葉" },
    saitama: { zh: "埼玉", en: "Saitama", ja: "埼玉" },
    osaka: { zh: "大阪", en: "Osaka", ja: "大阪" },
    kyoto: { zh: "京都", en: "Kyoto", ja: "京都" },
    hyogo: { zh: "兵库", en: "Hyogo", ja: "兵庫" },
    nara: { zh: "奈良", en: "Nara", ja: "奈良" },
    shiga: { zh: "滋贺", en: "Shiga", ja: "滋賀" },
    wakayama: { zh: "和歌山", en: "Wakayama", ja: "和歌山" },
  };
  return Object.entries(labels).map(([value, label]) => ({ value, label: label[key] }));
}

export function japanCityLabel(value: string, locale: Locale): string {
  const key = locale === "en" ? "en" : locale === "ja" ? "ja" : "zh";
  const table: Record<string, Record<"zh" | "en" | "ja", string>> = {
    tokyo: { zh: "东京", en: "Tokyo", ja: "東京" },
    osaka: { zh: "大阪", en: "Osaka", ja: "大阪" },
    kyoto: { zh: "京都", en: "Kyoto", ja: "京都" },
    yokohama: { zh: "横滨", en: "Yokohama", ja: "横浜" },
    kobe: { zh: "神户", en: "Kobe", ja: "神戸" },
  };
  return table[value]?.[key] || value;
}

export function fieldLabel(value: string, locale: Locale): string {
  const key = locale === "en" ? "en" : locale === "ja" ? "ja" : "zh";
  const table: Record<string, Record<"zh" | "en" | "ja", string>> = {
    engineering: { zh: "工学", en: "Engineering", ja: "工学" },
    business: { zh: "商科", en: "Business", ja: "ビジネス" },
    it: { zh: "IT", en: "IT", ja: "IT" },
    medicine: { zh: "医学", en: "Medicine", ja: "医学" },
    humanities: { zh: "人文", en: "Humanities", ja: "人文科学" },
    language: { zh: "语言", en: "Language", ja: "語学" },
    design: { zh: "设计", en: "Design", ja: "デザイン" },
    anime_game: { zh: "动漫 / 游戏", en: "Anime / games", ja: "アニメ・ゲーム" },
    science: { zh: "理学", en: "Science", ja: "理学" },
  };
  return table[value]?.[key] || value;
}

export function industryLabel(value: string, locale: Locale): string {
  const key = locale === "en" ? "en" : locale === "ja" ? "ja" : "zh";
  const table: Record<string, Record<"zh" | "en" | "ja", string>> = {
    it_internet: { zh: "IT / 互联网", en: "IT / internet", ja: "IT・インターネット" },
    software: { zh: "软件", en: "Software", ja: "ソフトウェア" },
    ai_data: { zh: "AI / 数据", en: "AI / data", ja: "AI・データ" },
    electronics: { zh: "电子", en: "Electronics", ja: "電機・電子" },
    automotive: { zh: "汽车", en: "Automotive", ja: "自動車" },
    manufacturing: { zh: "制造", en: "Manufacturing", ja: "製造" },
    consulting: { zh: "咨询", en: "Consulting", ja: "コンサルティング" },
    finance: { zh: "金融", en: "Finance", ja: "金融" },
    telecom: { zh: "通信", en: "Telecom", ja: "通信" },
    retail: { zh: "零售", en: "Retail", ja: "小売" },
    ecommerce: { zh: "电商", en: "E-commerce", ja: "EC" },
    logistics: { zh: "物流", en: "Logistics", ja: "物流" },
    transportation: { zh: "交通运输", en: "Transportation", ja: "交通・運輸" },
    hospitality: { zh: "酒店 / 观光", en: "Hospitality", ja: "ホテル・観光" },
    education: { zh: "教育", en: "Education", ja: "教育" },
    trading: { zh: "商社 / 贸易", en: "Trading", ja: "商社・貿易" },
    game_entertainment: { zh: "游戏 / 娱乐", en: "Games / entertainment", ja: "ゲーム・エンタメ" },
    healthcare: { zh: "医疗健康", en: "Healthcare", ja: "ヘルスケア" },
    other: { zh: "其他", en: "Other", ja: "その他" },
  };
  return table[value]?.[key] || value;
}

export function companySizeLabel(value: string, locale: Locale): string {
  const key = locale === "en" ? "en" : locale === "ja" ? "ja" : "zh";
  const table: Record<string, Record<"zh" | "en" | "ja", string>> = {
    startup: { zh: "初创", en: "Startup", ja: "スタートアップ" },
    small: { zh: "小型", en: "Small", ja: "小規模" },
    medium: { zh: "中型", en: "Medium", ja: "中規模" },
    large: { zh: "大型", en: "Large", ja: "大規模" },
    enterprise: { zh: "大手 / 集团", en: "Enterprise", ja: "大手・グループ" },
  };
  return table[value]?.[key] || value;
}
