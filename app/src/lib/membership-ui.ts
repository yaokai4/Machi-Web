import type { Locale } from "@/lib/i18n";

type Text = { zh: string; en: string; ja: string };

type MembershipUi = {
  backToMembership: string;
  ordersTitle: string;
  ordersEmpty: string;
  benefitsTitle: string;
  benefitsIntroTitle: string;
  benefitsDisclaimer: string;
  benefitsCta: string;
  exclusiveTitle: string;
  exclusiveLoginTitle: string;
  exclusiveLoginBody: string;
  exclusiveLoginCta: string;
  exclusiveUpgradeTitle: string;
  exclusiveUpgradeBody: string;
  exclusiveUpgradeCta: string;
  exclusiveZoneTitle: string;
  exclusiveUntil: string;
  exclusiveSyncing: string;
  exclusiveEditorialTitle: string;
  exclusiveEditorialEmpty: string;
};

const UI: Record<"zh" | "en" | "ja", MembershipUi> = {
  zh: {
    backToMembership: "返回会员页",
    ordersTitle: "会员订单",
    ordersEmpty: "暂无会员订单。",
    benefitsTitle: "会员权益详情",
    benefitsIntroTitle: "Machi 认证会员",
    benefitsDisclaimer: "认证会员表示该账号已开通 Machi 认证权益，不代表 Machi 对其发布内容、交易或服务作出平台担保。租房、招聘、二手和线下服务仍需自行核验。",
    benefitsCta: "开通或查看会员状态",
    exclusiveTitle: "会员专属",
    exclusiveLoginTitle: "登录后访问会员专属内容",
    exclusiveLoginBody: "登录后可以查看会员专属城市资讯、生活指南和高信任内容入口。",
    exclusiveLoginCta: "登录后继续",
    exclusiveUpgradeTitle: "开通 Machi 认证会员后可访问",
    exclusiveUpgradeBody: "这里会汇总会员专属城市资讯精选、东京 / 大阪生活指南、租房避坑合集和高信任内容发布入口。",
    exclusiveUpgradeCta: "查看会员权益",
    exclusiveZoneTitle: "你的会员专区",
    exclusiveUntil: "到期时间",
    exclusiveSyncing: "同步中",
    exclusiveEditorialTitle: "城市资讯精选",
    exclusiveEditorialEmpty: "编辑部发布会员精选后会显示在这里。",
  },
  en: {
    backToMembership: "Back to membership",
    ordersTitle: "Membership Orders",
    ordersEmpty: "No membership orders yet.",
    benefitsTitle: "Verified Benefits",
    benefitsIntroTitle: "Machi Verified",
    benefitsDisclaimer: "Machi Verified means this account has unlocked verified-member features. It is not a platform guarantee of the truthfulness of any post, transaction, or service. Always verify housing, jobs, second-hand deals, and offline services yourself.",
    benefitsCta: "Open or view membership status",
    exclusiveTitle: "Member-Only",
    exclusiveLoginTitle: "Sign in to view member-only content",
    exclusiveLoginBody: "After signing in, you can access member-only city picks, life guides, and high-trust content entry points.",
    exclusiveLoginCta: "Continue after signing in",
    exclusiveUpgradeTitle: "Available with Machi Verified",
    exclusiveUpgradeBody: "This area collects member-only city picks, Tokyo and Osaka life guides, housing checklists, and high-trust publishing entry points.",
    exclusiveUpgradeCta: "View benefits",
    exclusiveZoneTitle: "Your member area",
    exclusiveUntil: "Active until",
    exclusiveSyncing: "Syncing",
    exclusiveEditorialTitle: "Editorial city picks",
    exclusiveEditorialEmpty: "Member-only editorial picks will appear here after publication.",
  },
  ja: {
    backToMembership: "メンバーシップへ戻る",
    ordersTitle: "メンバー注文",
    ordersEmpty: "メンバー注文はまだありません。",
    benefitsTitle: "認証メンバー特典",
    benefitsIntroTitle: "Machi 認証メンバー",
    benefitsDisclaimer: "Machi 認証メンバーは、認証メンバー向け機能が有効なアカウントであることを示します。投稿内容、取引、サービスの真実性を Machi が保証するものではありません。住まい、求人、中古取引、対面サービスは必ずご自身でも確認してください。",
    benefitsCta: "加入またはステータスを確認",
    exclusiveTitle: "メンバー限定",
    exclusiveLoginTitle: "ログインするとメンバー限定コンテンツを確認できます",
    exclusiveLoginBody: "ログイン後、メンバー限定の都市情報、生活ガイド、高信頼コンテンツの入口を利用できます。",
    exclusiveLoginCta: "ログインして続ける",
    exclusiveUpgradeTitle: "Machi 認証メンバー限定で利用できます",
    exclusiveUpgradeBody: "メンバー限定の都市情報、東京・大阪生活ガイド、住まいの確認リスト、高信頼投稿の入口をまとめています。",
    exclusiveUpgradeCta: "特典を見る",
    exclusiveZoneTitle: "あなたのメンバーエリア",
    exclusiveUntil: "有効期限",
    exclusiveSyncing: "同期中",
    exclusiveEditorialTitle: "編集部の都市ピックアップ",
    exclusiveEditorialEmpty: "メンバー向けの編集部コンテンツが公開されると、ここに表示されます。",
  },
};

const BENEFITS: Record<string, Text> = {
  verified_badge: {
    zh: "蓝色认证标识|昵称、个人主页和内容卡片展示 Machi 认证标识。",
    en: "Verified badge|Show a Machi Verified badge next to your name, on your profile, and on public content cards.",
    ja: "認証バッジ|名前、プロフィール、公開コンテンツカードに Machi 認証バッジを表示します。",
  },
  profile_verified: {
    zh: "个人主页认证展示|认证状态会在个人主页稳定展示。",
    en: "Verified profile display|Your verified status is clearly shown on your profile.",
    ja: "プロフィールでの認証表示|認証状態をプロフィール上で分かりやすく表示します。",
  },
  card_verified: {
    zh: "内容卡片认证展示|你的公开内容卡片会显示认证信息。",
    en: "Verified content cards|Public content cards show your verified status.",
    ja: "コンテンツカードでの認証表示|公開コンテンツカードに認証情報を表示します。",
  },
  trusted_publish: {
    zh: "高信任内容发布|可发布招聘、租房、本地服务等高信任内容。",
    en: "High-trust posting access|Post jobs, housing, local services, and other channels that require stronger trust.",
    ja: "高信頼投稿へのアクセス|求人、住まい、ローカルサービスなど、信頼性が求められる投稿が可能になります。",
  },
  higher_quota: {
    zh: "更高每日发布额度|每日发布额度高于普通账号。",
    en: "Higher daily posting quota|Publish more per day than a standard account.",
    ja: "投稿上限の引き上げ|通常アカウントより多く投稿できます。",
  },
  priority_review: {
    zh: "优先审核|内容进入更高优先级审核队列。",
    en: "Priority review|Your submitted content enters a higher-priority review queue.",
    ja: "優先審査|投稿内容が優先度の高い審査キューに入ります。",
  },
  light_boost: {
    zh: "内容轻微优先展示|合规内容获得温和展示加成。",
    en: "Gentle visibility boost|Compliant content receives a modest visibility lift.",
    ja: "表示機会の軽い優先|ルールに沿った内容は穏やかな表示優先の対象になります。",
  },
  exclusive_resources: {
    zh: "查看会员专属资料|访问会员专属资料、清单和模板。",
    en: "Member-only resources|Access member-only resources, checklists, and templates.",
    ja: "メンバー限定資料|メンバー限定の資料、チェックリスト、テンプレートを確認できます。",
  },
  jlpt_discount: {
    zh: "JLPT 资料会员折扣|指定 JLPT 资料享会员价。",
    en: "JLPT resource discounts|Get member pricing on selected JLPT resources.",
    ja: "JLPT 資料のメンバー割引|対象の JLPT 資料をメンバー価格で利用できます。",
  },
  grad_discount: {
    zh: "大学院申请资料会员折扣|大学院申请相关资料享会员价。",
    en: "Graduate-school resource discounts|Get member pricing on graduate-school application resources.",
    ja: "大学院出願資料のメンバー割引|大学院出願関連資料をメンバー価格で利用できます。",
  },
  career_discount: {
    zh: "日本就职资料会员折扣|日本就职资料和模板享会员价。",
    en: "Career resource discounts|Get member pricing on Japan job-hunting resources and templates.",
    ja: "日本就職資料のメンバー割引|就職関連資料やテンプレートをメンバー価格で利用できます。",
  },
  life_checklist: {
    zh: "日本生活清单会员可看|查看入境、租房、手续等生活清单。",
    en: "Japan life checklists|Read checklists for arrival, housing, city-hall procedures, and daily setup.",
    ja: "日本生活チェックリスト|入国、住まい、手続き、生活準備のチェックリストを確認できます。",
  },
  service_priority: {
    zh: "服务预约优先处理|人工服务预约优先进入处理队列。",
    en: "Priority service handling|Service bookings are handled with higher priority.",
    ja: "サービス予約の優先対応|個別サービス予約が優先的に処理されます。",
  },
  service_discount: {
    zh: "指定服务会员优惠|指定服务支持会员折扣价。",
    en: "Selected service discounts|Selected services can be booked with member discounts.",
    ja: "対象サービスのメンバー割引|対象サービスをメンバー割引で利用できます。",
  },
  purchase_center: {
    zh: "已购资料统一管理|集中管理已购资料与会员可看内容。",
    en: "Unified purchase library|Manage purchased resources and member-access content in one place.",
    ja: "購入資料の一元管理|購入済み資料とメンバー閲覧可能コンテンツをまとめて管理できます。",
  },
};

const GUIDES: Record<string, Text> = {
  housing: {
    zh: "租房避坑合集|看房、初期费用、合同和搬家前后需要确认的事项。",
    en: "Housing checklists|Key things to verify before viewing, paying initial fees, signing, and moving.",
    ja: "住まいの確認リスト|内見、初期費用、契約、引っ越し前後に確認したいポイント。",
  },
  work: {
    zh: "工作招聘发布入口|会员可发布招聘、打工、引荐等高信任内容。",
    en: "Job posting entry points|Members can publish job openings, part-time roles, and referrals that require stronger trust.",
    ja: "求人投稿の入口|求人、アルバイト、紹介など信頼性が必要な投稿を利用できます。",
  },
  city: {
    zh: "东京 / 大阪生活指南|编辑部整理的通勤、区役所、在留、交通和生活提醒。",
    en: "Tokyo and Osaka life guides|Editorial notes on commuting, city-hall procedures, residence status, transport, and daily-life alerts.",
    ja: "東京・大阪生活ガイド|通勤、区役所手続き、在留、交通、生活上の注意点を編集部が整理しています。",
  },
};

const STATUS: Record<string, Text> = {
  active: { zh: "已生效", en: "Active", ja: "有効" },
  paid: { zh: "已支付", en: "Paid", ja: "支払い済み" },
  pending: { zh: "处理中", en: "Pending", ja: "処理中" },
  canceled: { zh: "已取消", en: "Canceled", ja: "キャンセル済み" },
  expired: { zh: "已过期", en: "Expired", ja: "期限切れ" },
  failed: { zh: "失败", en: "Failed", ja: "失敗" },
};

function lang(locale: Locale): "zh" | "en" | "ja" {
  if (locale === "en") return "en";
  if (locale === "ja") return "ja";
  return "zh";
}

function split(text: string): { title: string; description: string } {
  const [title, ...rest] = text.split("|");
  return { title, description: rest.join("|") };
}

export function membershipUi(locale: Locale): MembershipUi {
  return UI[lang(locale)];
}

export function membershipBenefitCopy(
  key: string,
  locale: Locale,
  fallback: { title: string; description: string },
): { title: string; description: string } {
  const row = BENEFITS[key];
  if (!row) return fallback;
  return split(row[lang(locale)]);
}

export function membershipGuideCopy(
  key: string,
  locale: Locale,
  fallback: { title: string; description: string },
): { title: string; description: string } {
  const row = GUIDES[key];
  if (!row) return fallback;
  return split(row[lang(locale)]);
}

export function membershipOrderStatusLabel(status: string, locale: Locale): string {
  const row = STATUS[String(status || "").toLowerCase()];
  return row ? row[lang(locale)] : status || "-";
}
