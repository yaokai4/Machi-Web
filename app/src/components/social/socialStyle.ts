// 约局 + 活动的共享样式速查:每个类型/分类一个「性格」(图标 + 颜色),
// 与 iOS 端 KXRoomStyle / KXEventStyle 一一对应,三端同一分类永远长一个样。
//
// 设计上两者彻底区分:
//   约局(Rooms)= 搭子 / 即兴组队,分类按「一起做什么」(动作)
//   活动(Events)= 正式策划活动,分类按「活动的形式」(名词)
//
// 本文件同时承载「约局 / 活动」两块界面的三语文案(zh / ja / en)。这些界面还没有
// 进 lib/i18n.tsx 的主词表,所以这里自带一份自包含的三语字典 socialCopy(),
// 页面用 useI18n() 的 locale 取到当前语言即可。等主词表接手后可平滑迁移。

import type { LucideIcon } from "lucide-react";
import {
  Beer, BookOpen, Car, Clapperboard, Coffee, Dumbbell, Footprints, Gamepad2,
  Hammer, Languages, MessageCircle, Mountain, Music4, Palette, PartyPopper,
  Presentation, ShoppingBag, Sparkles, Trophy, UtensilsCrossed,
} from "lucide-react";
import type { Locale } from "@/lib/i18n";

export interface SocialKindStyle {
  icon: LucideIcon;
  /** Tailwind text-* class for the accent color. */
  text: string;
  /** Tailwind bg-* class at ~10% for chips. */
  softBg: string;
  /** Tailwind gradient classes for icon squircles / fallback covers. */
  gradient: string;
  labelZh: string;
  labelJa: string;
  labelEn: string;
}

const FALLBACK: SocialKindStyle = {
  icon: Sparkles, text: "text-slate-500", softBg: "bg-slate-500/10",
  gradient: "from-slate-500 to-slate-400", labelZh: "其他", labelJa: "その他", labelEn: "Other",
};

// ── 约局(搭子)────────────────────────────────────────────────────────────
export const ROOM_TYPE_STYLES: Record<string, SocialKindStyle> = {
  meal: { icon: UtensilsCrossed, text: "text-orange-500", softBg: "bg-orange-500/10", gradient: "from-orange-500 to-amber-400", labelZh: "饭搭子", labelJa: "ごはん仲間", labelEn: "Meal buddy" },
  drink: { icon: Beer, text: "text-pink-500", softBg: "bg-pink-500/10", gradient: "from-pink-500 to-rose-400", labelZh: "酒搭子", labelJa: "飲み仲間", labelEn: "Drink buddy" },
  coffee: { icon: Coffee, text: "text-amber-700", softBg: "bg-amber-700/10", gradient: "from-amber-700 to-amber-500", labelZh: "咖啡", labelJa: "カフェ", labelEn: "Coffee" },
  sport: { icon: Dumbbell, text: "text-green-600", softBg: "bg-green-600/10", gradient: "from-green-600 to-emerald-400", labelZh: "运动搭子", labelJa: "運動仲間", labelEn: "Sports buddy" },
  study: { icon: BookOpen, text: "text-teal-600", softBg: "bg-teal-600/10", gradient: "from-teal-600 to-cyan-400", labelZh: "学习搭子", labelJa: "勉強仲間", labelEn: "Study buddy" },
  play: { icon: Gamepad2, text: "text-purple-500", softBg: "bg-purple-500/10", gradient: "from-purple-500 to-violet-400", labelZh: "玩乐", labelJa: "遊び", labelEn: "Play" },
  carpool: { icon: Car, text: "text-blue-500", softBg: "bg-blue-500/10", gradient: "from-blue-500 to-sky-400", labelZh: "拼车拼单", labelJa: "相乗り・共同購入", labelEn: "Carpool" },
  outing: { icon: Footprints, text: "text-cyan-600", softBg: "bg-cyan-600/10", gradient: "from-cyan-600 to-sky-400", labelZh: "出行搭子", labelJa: "おでかけ仲間", labelEn: "Outing buddy" },
  language: { icon: Languages, text: "text-indigo-500", softBg: "bg-indigo-500/10", gradient: "from-indigo-500 to-violet-400", labelZh: "语言交换", labelJa: "言語交換", labelEn: "Language exchange" },
  chat: { icon: MessageCircle, text: "text-slate-500", softBg: "bg-slate-500/10", gradient: "from-slate-500 to-slate-400", labelZh: "随便聊", labelJa: "雑談", labelEn: "Just chat" },
  other: FALLBACK,
};
// 旧数据别名(与后端 _ROOM_TYPE_ALIASES 对齐),显示时归并到新分类。
const ROOM_TYPE_ALIASES: Record<string, string> = {
  dining: "meal", drinks: "drink", boardgame: "play", karaoke: "play", sports: "sport", hangout: "chat",
};

// ── 活动(活动形式)────────────────────────────────────────────────────────
export const EVENT_CATEGORY_STYLES: Record<string, SocialKindStyle> = {
  exhibition: { icon: Palette, text: "text-purple-500", softBg: "bg-purple-500/10", gradient: "from-purple-500 to-violet-400", labelZh: "展览", labelJa: "展示", labelEn: "Exhibition" },
  show: { icon: Music4, text: "text-indigo-500", softBg: "bg-indigo-500/10", gradient: "from-indigo-500 to-violet-400", labelZh: "演出", labelJa: "ライブ", labelEn: "Show" },
  talk: { icon: Presentation, text: "text-blue-500", softBg: "bg-blue-500/10", gradient: "from-blue-500 to-sky-400", labelZh: "讲座沙龙", labelJa: "トーク・交流会", labelEn: "Talk" },
  workshop: { icon: Hammer, text: "text-orange-500", softBg: "bg-orange-500/10", gradient: "from-orange-500 to-amber-400", labelZh: "工作坊", labelJa: "ワークショップ", labelEn: "Workshop" },
  market: { icon: ShoppingBag, text: "text-amber-700", softBg: "bg-amber-700/10", gradient: "from-amber-700 to-amber-500", labelZh: "市集", labelJa: "マーケット", labelEn: "Market" },
  party: { icon: PartyPopper, text: "text-pink-500", softBg: "bg-pink-500/10", gradient: "from-pink-500 to-rose-400", labelZh: "派对", labelJa: "パーティー", labelEn: "Party" },
  sports: { icon: Trophy, text: "text-emerald-600", softBg: "bg-emerald-600/10", gradient: "from-emerald-600 to-teal-400", labelZh: "运动赛事", labelJa: "スポーツ", labelEn: "Sports" },
  reading: { icon: BookOpen, text: "text-teal-600", softBg: "bg-teal-600/10", gradient: "from-teal-600 to-cyan-400", labelZh: "读书会", labelJa: "読書会", labelEn: "Book club" },
  film: { icon: Clapperboard, text: "text-cyan-600", softBg: "bg-cyan-600/10", gradient: "from-cyan-600 to-sky-400", labelZh: "观影", labelJa: "映画", labelEn: "Film" },
  outdoor: { icon: Mountain, text: "text-green-600", softBg: "bg-green-600/10", gradient: "from-green-600 to-emerald-400", labelZh: "户外", labelJa: "アウトドア", labelEn: "Outdoor" },
  other: FALLBACK,
};
const EVENT_CATEGORY_ALIASES: Record<string, string> = {
  art: "exhibition", music: "show", food: "party", drinks: "party", social: "party",
};

export function roomStyle(key?: string): SocialKindStyle {
  const k = key ?? "";
  return ROOM_TYPE_STYLES[k] ?? ROOM_TYPE_STYLES[ROOM_TYPE_ALIASES[k]] ?? FALLBACK;
}

export function eventStyle(key?: string): SocialKindStyle {
  const k = key ?? "";
  return EVENT_CATEGORY_STYLES[k] ?? EVENT_CATEGORY_STYLES[EVENT_CATEGORY_ALIASES[k]] ?? FALLBACK;
}

/** The label for a room/event kind in the viewer's language. */
export function socialLabel(style: SocialKindStyle, locale: Locale): string {
  if (locale === "en") return style.labelEn;
  if (locale === "ja") return style.labelJa;
  return style.labelZh;
}

/**
 * Kind label for display: zh viewers keep any server-provided (possibly custom)
 * label; ja/en viewers always get the localized enum label so nothing leaks as
 * Chinese. Falls back to the localized label when no server label is present.
 */
export function kindLabel(serverLabel: string | null | undefined, style: SocialKindStyle, locale: Locale): string {
  if ((locale === "zh-Hans" || locale === "zh-Hant") && serverLabel) return serverLabel;
  return socialLabel(style, locale);
}

/** Ordered category keys for pickers/rails (excludes "other" — creators still get it via a trailing chip). */
export const ROOM_TYPE_KEYS = ["meal", "drink", "coffee", "sport", "study", "play", "carpool", "outing", "language", "chat"];
export const EVENT_CATEGORY_KEYS = ["exhibition", "show", "talk", "workshop", "market", "party", "sports", "reading", "film", "outdoor"];

// ── 日期 ────────────────────────────────────────────────────────────────────
//
// 活动 / 约局的时间一律锚定东京时区(JST)渲染 —— 这些活动都发生在日本,详情页也
// 固定标注「Asia/Tokyo」。若按浏览器本地时区渲染,非 JST 的查看者看到的钟点会和
// 标签所述时区错位(在 UTC+8 会少 1 小时)。传 timeZone: Asia/Tokyo 让钟点与标签一致。

const JST = "Asia/Tokyo";

/** Intl BCP-47 tag for date/time formatting per app locale. */
function intlTag(locale: Locale): string {
  if (locale === "en") return "en-US";
  if (locale === "ja") return "ja-JP";
  if (locale === "zh-Hant") return "zh-Hant";
  return "zh-CN";
}

export function parseISO(raw?: string | null): Date | null {
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Luma 式日期块:「7月」+「12」(锚定 JST)。 */
export function dateBadge(raw?: string | null, locale: Locale = "zh-Hans"): { month: string; day: string } | null {
  const date = parseISO(raw);
  if (!date) return null;
  const tag = intlTag(locale);
  return {
    month: date.toLocaleDateString(tag, { month: "short", timeZone: JST }),
    day: date.toLocaleString(tag, { day: "numeric", timeZone: JST }),
  };
}

export function eventTimeLine(startRaw?: string | null, endRaw?: string | null, locale: Locale = "zh-Hans"): string {
  const start = parseISO(startRaw);
  if (!start) return startRaw ?? "";
  const tag = intlTag(locale);
  const day = start.toLocaleDateString(tag, { month: "long", day: "numeric", weekday: "short", timeZone: JST });
  const startTime = start.toLocaleTimeString(tag, { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: JST });
  const end = parseISO(endRaw);
  if (end) {
    const endTime = end.toLocaleTimeString(tag, { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: JST });
    return `${day} ${startTime} – ${endTime}`;
  }
  return `${day} ${startTime}`;
}

/** Compact "7/12 19:30" for dense room rows (JST). */
export function shortDayTime(raw?: string | null, locale: Locale = "zh-Hans"): string {
  const date = parseISO(raw);
  if (!date) return "";
  const tag = intlTag(locale);
  const day = date.toLocaleDateString(tag, { month: "numeric", day: "numeric", timeZone: JST });
  const time = date.toLocaleTimeString(tag, { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: JST });
  return `${day} ${time}`;
}

/** Roomy "7月12日 周六 19:30" for the room info panel (JST). */
export function longDayTime(raw?: string | null, locale: Locale = "zh-Hans"): string {
  const date = parseISO(raw);
  if (!date) return "";
  const tag = intlTag(locale);
  const day = date.toLocaleDateString(tag, { month: "long", day: "numeric", weekday: "short", timeZone: JST });
  const time = date.toLocaleTimeString(tag, { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: JST });
  return `${day} ${time}`;
}

const RELATIVE_COPY: Record<"zh" | "ja" | "en", { now: string; min: (n: number) => string; hour: (n: number) => string; day: (n: number) => string }> = {
  zh: { now: "刚刚", min: (n) => `${n} 分钟前`, hour: (n) => `${n} 小时前`, day: (n) => `${n} 天前` },
  ja: { now: "たった今", min: (n) => `${n}分前`, hour: (n) => `${n}時間前`, day: (n) => `${n}日前` },
  en: { now: "just now", min: (n) => `${n}m ago`, hour: (n) => `${n}h ago`, day: (n) => `${n}d ago` },
};

export function relativeTime(raw?: string | null, locale: Locale = "zh-Hans"): string {
  const date = parseISO(raw);
  if (!date) return "";
  const copy = RELATIVE_COPY[langOf(locale)];
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return copy.now;
  if (minutes < 60) return copy.min(minutes);
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return copy.hour(hours);
  const days = Math.floor(hours / 24);
  if (days < 30) return copy.day(days);
  return date.toLocaleDateString(intlTag(locale), { month: "short", day: "numeric", timeZone: JST });
}

// ── 三语文案(约局 / 活动)──────────────────────────────────────────────────

type CopyLang = "zh" | "ja" | "en";

function langOf(locale: Locale): CopyLang {
  if (locale === "en") return "en";
  if (locale === "ja") return "ja";
  return "zh"; // zh-Hans / zh-Hant 都用简体文案(与主词表缺键回落一致)
}

export interface SocialCopy {
  common: {
    close: string;
    back: string;
    send: string;
    cancel: string;
    delete: string;
    optional: string;
  };
  rooms: {
    heroKicker: string;
    heroTitle: string;
    heroDesc: string;
    create: string;
    joinedFilter: string;
    all: string;
    live: string;
    joined: string;
    full: string;
    spotsLeft: (n: number) => string;
    people: (n: number) => string;
    messagesCount: (n: number) => string;
    startChat: string;
    emptyMineTitle: string;
    emptyTitle: string;
    emptySubtitle: string;
    // create modal
    modalTitle: string;
    modalSubtitle: string;
    kindQuestion: string;
    name: string;
    namePlaceholder: string;
    desc: string;
    descPlaceholder: string;
    time: string;
    capacity: string;
    location: string;
    locationPlaceholder: string;
    creating: string;
    createSubmit: string;
    createError: string;
    // detail
    dissolveConfirm: string;
    dissolveAria: string;
    leaveConfirm: string;
    leaveAria: string;
    inRoom: (members: number, capacity: number) => string;
    peopleHere: string;
    host: string;
    emptyJoined: string;
    emptyGuest: string;
    sayPlaceholder: string;
    ended: string;
    fullLabel: string;
    joining: string;
    join: string;
    joinError: string;
    opError: string;
    deleteError: string;
    sendError: string;
    // cover(约局封面)
    addCover: string;
    coverAlt: string;
    coverUploadError: string;
  };
  events: {
    all: string;
    manage: string;
    delete: string;
    deleteConfirm: (title: string) => string;
    about: string;
    featured: string;
    organizer: string;
    register: string;
    registered: string;
    waitlisted: string;
    spotsLeft: (n: number) => string;
    fullWaitlist: string;
    unlimited: string;
    going: (n: number) => string;
    cancelled: string;
    ended: string;
    youOrganizer: string;
    cancelling: string;
    cancelReg: string;
    registering: string;
    joinWaitlist: string;
    registerJoin: string;
    external: string;
    disclaimer: string;
    registerError: string;
    cancelError: string;
    deleteError: string;
    // registration modal
    modalTitle: string;
    submitting: string;
    confirmReg: string;
    yes: string;
    no: string;
    // discovery (events/page.tsx)
    heroTitle: string;
    heroDesc: string;
    create: string;
    upcoming: string;
    past: string;
    featuredBadge: string;
    beFirst: string;
    registeredBadge: string;
    emptyUpcoming: string;
    emptyPast: string;
    emptySubtitle: string;
    // create (events/create/page.tsx)
    createSubtitle: string;
    coverAlt: string;
    addCover: string;
    fName: string;
    fNamePlaceholder: string;
    fSubtitle: string;
    fSubtitlePlaceholder: string;
    fDesc: string;
    fDescPlaceholder: string;
    fStart: string;
    fEnd: string;
    fVenue: string;
    fVenuePlaceholder: string;
    fAddress: string;
    fAddressPlaceholder: string;
    moreSettings: string;
    fCapacity: string;
    fCapacityPlaceholder: string;
    fPrice: string;
    fPricePlaceholder: string;
    fExternal: string;
    feeHint: string;
    formFieldsTitle: string;
    formFieldsHintCreate: string;
    addField: string;
    noFieldsCreate: string;
    fieldNamePlaceholderCreate: string;
    removeField: string;
    ftText: string;
    ftSelect: string;
    ftCheckbox: string;
    required: string;
    optionsPlaceholderCreate: string;
    publishError: string;
    coverUploadError: string;
    publishing: string;
    publish: string;
    // manage (events/[slug]/manage/page.tsx)
    manageNoPermission: string;
    backToEvent: string;
    statusPublished: string;
    statusDraft: string;
    statusCancelled: string;
    featuredOn: string;
    featuredSet: string;
    save: string;
    saved: string;
    saveError: string;
    basicInfo: string;
    mSubtitle: string;
    mDesc: string;
    mAddress: string;
    mCapacity: string;
    formFieldsHintManage: string;
    noFieldsManage: string;
    fieldNamePlaceholderManage: string;
    optionsPlaceholderManage: string;
    cancelEventConfirm: string;
    cancelEvent: string;
    attendeeList: string;
    peopleCount: (n: number) => string;
    noAttendees: string;
    statusGoing: string;
    statusWaitlist: string;
    // ── luma 化:加日历 / 审核制 / 主办方名单工具(approve·decline·checkin·broadcast)──
    host: {
      addToCalendar: string;
      pendingReview: string;
      approvalToggle: string;
      approvalHint: string;
      approve: string;
      decline: string;
      remove: string;
      checkIn: string;
      undoCheckIn: string;
      checkedIn: string;
      broadcast: string;
      broadcastTitle: string;
      broadcastPlaceholder: string;
      broadcastSend: string;
      broadcastSent: (n: number) => string;
      broadcastError: string;
      statusPending: string;
      statusCheckedIn: string;
      guestList: string;
      seeAll: string;
    };
  };
}

const SOCIAL_COPY: Record<CopyLang, SocialCopy> = {
  zh: {
    common: { close: "关闭", back: "返回", send: "发送", cancel: "取消", delete: "删除", optional: "可选" },
    rooms: {
      heroKicker: "Machi Rooms",
      heroTitle: "找个搭子,现在就约",
      heroDesc: "饭搭子、酒搭子、学习搭子、拼车……开一个局就像开一个游戏房间:进来就能看到有谁、聊到哪,直接说话约起来。",
      create: "开个局",
      joinedFilter: "我加入的",
      all: "全部",
      live: "进行中",
      joined: "已加入",
      full: "已满",
      spotsLeft: (n) => `还差 ${n} 人`,
      people: (n) => `${n} 人`,
      messagesCount: (n) => `${n} 条消息`,
      startChat: "进来开个头",
      emptyMineTitle: "你还没有加入任何局",
      emptyTitle: "还没有进行中的局",
      emptySubtitle: "开一个局,喊大家一起吃饭、喝酒、打桌游。",
      modalTitle: "开个局",
      modalSubtitle: "想找人一起做点什么?发出来,同城的人进来就能聊。",
      kindQuestion: "想找什么搭子?",
      name: "局的名字",
      namePlaceholder: "例如 周五晚新宿吃烤肉,来仨人",
      desc: "想说的话",
      descPlaceholder: "预算、口味、见面方式…随便写",
      time: "约定时间(可选)",
      capacity: "人数上限(0 = 不限)",
      location: "大概位置(可选)",
      locationPlaceholder: "例如 新宿站东口 / 涩谷附近",
      creating: "创建中…",
      createSubmit: "开局",
      createError: "开局失败,稍后再试",
      dissolveConfirm: "解散这个局?房间和聊天都会被删除。",
      dissolveAria: "解散房间",
      leaveConfirm: "退出这个局?",
      leaveAria: "退出房间",
      inRoom: (m, c) => `${m} 人${c > 0 ? ` / ${c}` : ""}在房间里`,
      peopleHere: "在房间里的人",
      host: "房主",
      emptyJoined: "还没人说话,来开个头。",
      emptyGuest: "还没人说话。加入后可以聊天。",
      sayPlaceholder: "说点什么…",
      ended: "这个局已经结束了",
      fullLabel: "房间已满员",
      joining: "加入中…",
      join: "加入这个局",
      joinError: "加入失败",
      opError: "操作失败",
      deleteError: "删除失败",
      sendError: "发送失败",
      addCover: "添加封面(可选)",
      coverAlt: "房间封面",
      coverUploadError: "封面上传失败,换一张试试",
    },
    events: {
      all: "全部活动",
      manage: "管理",
      delete: "删除",
      deleteConfirm: (title) => `删除活动「${title}」?已报名的人会看到活动已取消。`,
      about: "活动详情",
      featured: "Machi 精选",
      organizer: "主办方",
      register: "报名",
      registered: "你已报名这场活动",
      waitlisted: "已进入候补,有空位自动顶上",
      spotsLeft: (n) => `还剩 ${n} 个名额`,
      fullWaitlist: "名额已满,可加入候补",
      unlimited: "名额不限,来就完事了",
      going: (n) => `${n} 人参加`,
      cancelled: "活动已取消",
      ended: "活动已结束",
      youOrganizer: "你是这场活动的主办方",
      cancelling: "取消中…",
      cancelReg: "取消报名",
      registering: "报名中…",
      joinWaitlist: "加入候补",
      registerJoin: "报名参加",
      external: "合作方售票 / 详情页",
      disclaimer: "Machi 不代收任何费用;付费活动请以合作方页面为准。",
      registerError: "报名失败,稍后再试",
      cancelError: "取消失败,稍后再试",
      deleteError: "删除失败,稍后再试",
      modalTitle: "报名信息",
      submitting: "提交中…",
      confirmReg: "确认报名",
      yes: "是",
      no: "否",
      heroTitle: "办一场活动,让对的人聚过来",
      heroDesc: "展览、演出、读书会、市集、工作坊……正式策划的线下活动,发布即生成专属活动页,一键报名。",
      create: "创建活动",
      upcoming: "即将开始",
      past: "往期",
      featuredBadge: "精选",
      beFirst: "等你来报名",
      registeredBadge: "已报名",
      emptyUpcoming: "还没有即将开始的活动",
      emptyPast: "还没有往期活动",
      emptySubtitle: "第一个把活动办起来的人就是你。",
      createSubtitle: "发布后会生成专属活动页和分享链接,和 App 端完全同步。",
      coverAlt: "封面",
      addCover: "添加封面(推荐 16:9)",
      fName: "活动名称",
      fNamePlaceholder: "例如 涩谷读书会 × Machi",
      fSubtitle: "一句话副标题(可选)",
      fSubtitlePlaceholder: "例如 本月主题:村上春树",
      fDesc: "活动详情",
      fDescPlaceholder: "流程、费用说明、要带什么、适合谁来…",
      fStart: "开始时间",
      fEnd: "结束时间(可选)",
      fVenue: "场地名",
      fVenuePlaceholder: "例如 SHIBUYA BOOK LOUNGE",
      fAddress: "详细地址(可选)",
      fAddressPlaceholder: "东京都涩谷区…",
      moreSettings: "更多设置(都是可选)",
      fCapacity: "名额上限(空 = 不限)",
      fCapacityPlaceholder: "例如 30",
      fPrice: "费用展示",
      fPricePlaceholder: "例如 免费 / ¥1,500(现场付)",
      fExternal: "合作方售票/详情链接",
      feeHint: "Machi 不代收任何费用;需要售票请使用合作方链接。",
      formFieldsTitle: "报名表单字段",
      formFieldsHintCreate: "让报名者填写称呼、联系方式等;发布后仍可在「管理」里修改。",
      addField: "加一个",
      noFieldsCreate: "不加字段 = 一键报名。",
      fieldNamePlaceholderCreate: "字段名,例如 怎么称呼你",
      removeField: "删除字段",
      ftText: "文本",
      ftSelect: "单选",
      ftCheckbox: "勾选",
      required: "必填",
      optionsPlaceholderCreate: "选项,用逗号分隔:小说, 随笔, 都行",
      publishError: "发布失败,请稍后再试",
      coverUploadError: "封面上传失败",
      publishing: "发布中…",
      publish: "发布活动",
      manageNoPermission: "只有主办方或管理员可以管理这场活动。",
      backToEvent: "返回活动页",
      statusPublished: "已发布",
      statusDraft: "草稿",
      statusCancelled: "已取消",
      featuredOn: "已精选",
      featuredSet: "设为精选",
      save: "保存",
      saved: "已保存",
      saveError: "保存失败",
      basicInfo: "基本信息",
      mSubtitle: "副标题",
      mDesc: "详情",
      mAddress: "地址",
      mCapacity: "名额(空/0 = 不限)",
      formFieldsHintManage: "改字段名不影响已有答案;删除字段会同时隐藏对应答案。",
      noFieldsManage: "当前是一键报名(不收集任何信息)。",
      fieldNamePlaceholderManage: "字段名",
      optionsPlaceholderManage: "选项,用逗号分隔",
      cancelEventConfirm: "确定取消这场活动吗?报名者将看到活动已取消。",
      cancelEvent: "取消活动",
      attendeeList: "报名名单",
      peopleCount: (n) => `${n} 人`,
      noAttendees: "还没有人报名。",
      statusGoing: "参加",
      statusWaitlist: "候补",
      host: {
        addToCalendar: "添加到日历",
        pendingReview: "待主办方审核",
        approvalToggle: "报名需要我审核",
        approvalHint: "开启后,报名先进入待审核,由你逐个通过或拒绝。",
        approve: "通过",
        decline: "拒绝",
        remove: "移除",
        checkIn: "签到",
        undoCheckIn: "撤销签到",
        checkedIn: "已签到",
        broadcast: "群发通知",
        broadcastTitle: "给参加者群发",
        broadcastPlaceholder: "写点什么发给所有参加者(如场地变更、集合方式)…",
        broadcastSend: "发送",
        broadcastSent: (n: number) => `已发送给 ${n} 人`,
        broadcastError: "发送失败,请重试",
        statusPending: "待审核",
        statusCheckedIn: "已签到",
        guestList: "参加者",
        seeAll: "查看全部",
      },
    },
  },
  ja: {
    common: { close: "閉じる", back: "戻る", send: "送信", cancel: "キャンセル", delete: "削除", optional: "任意" },
    rooms: {
      heroKicker: "Machi Rooms",
      heroTitle: "仲間を見つけて、今すぐ集まろう",
      heroDesc: "ごはん・飲み・勉強・相乗り……ルームを立てるのはゲームの部屋を開くのと同じ。誰がいるか、どこまで話したかが見えて、そのまま声をかけて集まれます。",
      create: "ルームを作る",
      joinedFilter: "参加中",
      all: "すべて",
      live: "進行中",
      joined: "参加済み",
      full: "満員",
      spotsLeft: (n) => `あと${n}人`,
      people: (n) => `${n}人`,
      messagesCount: (n) => `${n}件のメッセージ`,
      startChat: "最初のひとことを",
      emptyMineTitle: "まだ参加しているルームがありません",
      emptyTitle: "進行中のルームはまだありません",
      emptySubtitle: "ルームを立てて、ごはん・お酒・ボードゲームに誘ってみましょう。",
      modalTitle: "ルームを作る",
      modalSubtitle: "誰かと一緒に何かしたい?投稿すれば、同じ街の人が入って話せます。",
      kindQuestion: "どんな仲間を探す?",
      name: "ルーム名",
      namePlaceholder: "例:金曜の夜、新宿で焼肉。あと3人",
      desc: "ひとこと",
      descPlaceholder: "予算・好み・待ち合わせ方法…自由に",
      time: "予定の日時(任意)",
      capacity: "定員(0 = 無制限)",
      location: "だいたいの場所(任意)",
      locationPlaceholder: "例:新宿駅東口 / 渋谷あたり",
      creating: "作成中…",
      createSubmit: "作成",
      createError: "作成に失敗しました。あとでもう一度お試しください",
      dissolveConfirm: "このルームを解散しますか?ルームとチャットはすべて削除されます。",
      dissolveAria: "ルームを解散",
      leaveConfirm: "このルームから退出しますか?",
      leaveAria: "ルームを退出",
      inRoom: (m, c) => `${m}人${c > 0 ? ` / ${c}` : ""}が参加中`,
      peopleHere: "ルームの参加者",
      host: "ホスト",
      emptyJoined: "まだ誰も話していません。最初のひとことを。",
      emptyGuest: "まだ誰も話していません。参加するとチャットできます。",
      sayPlaceholder: "メッセージを入力…",
      ended: "このルームは終了しました",
      fullLabel: "ルームは満員です",
      joining: "参加中…",
      join: "このルームに参加",
      joinError: "参加に失敗しました",
      opError: "操作に失敗しました",
      deleteError: "削除に失敗しました",
      sendError: "送信に失敗しました",
      addCover: "カバー画像を追加(任意)",
      coverAlt: "ルームのカバー",
      coverUploadError: "カバー画像をアップロードできませんでした",
    },
    events: {
      all: "すべてのイベント",
      manage: "管理",
      delete: "削除",
      deleteConfirm: (title) => `イベント「${title}」を削除しますか?参加登録済みの人にはキャンセルと表示されます。`,
      about: "イベント詳細",
      featured: "Machi 厳選",
      organizer: "主催",
      register: "参加登録",
      registered: "このイベントに参加登録済みです",
      waitlisted: "キャンセル待ちに登録済み。空きが出たら自動で繰り上がります",
      spotsLeft: (n) => `残り${n}席`,
      fullWaitlist: "満席です。キャンセル待ちに登録できます",
      unlimited: "定員なし。気軽にどうぞ",
      going: (n) => `${n}人が参加`,
      cancelled: "イベントは中止されました",
      ended: "イベントは終了しました",
      youOrganizer: "あなたはこのイベントの主催者です",
      cancelling: "キャンセル中…",
      cancelReg: "参加を取り消す",
      registering: "登録中…",
      joinWaitlist: "キャンセル待ちに登録",
      registerJoin: "参加登録する",
      external: "提携先のチケット / 詳細ページ",
      disclaimer: "Machi は費用を代理徴収しません。有料イベントは提携先ページをご確認ください。",
      registerError: "登録に失敗しました。あとでもう一度お試しください",
      cancelError: "取り消しに失敗しました。あとでもう一度お試しください",
      deleteError: "削除に失敗しました。あとでもう一度お試しください",
      modalTitle: "参加登録情報",
      submitting: "送信中…",
      confirmReg: "登録を確定",
      yes: "はい",
      no: "いいえ",
      heroTitle: "イベントを開いて、集めたい人を集めよう",
      heroDesc: "展示・ライブ・読書会・マーケット・ワークショップ……きちんと企画したオフラインイベント。公開すると専用ページができ、ワンタップで参加登録できます。",
      create: "イベントを作成",
      upcoming: "開催予定",
      past: "過去",
      featuredBadge: "注目",
      beFirst: "参加者を募集中",
      registeredBadge: "登録済み",
      emptyUpcoming: "開催予定のイベントはまだありません",
      emptyPast: "過去のイベントはまだありません",
      emptySubtitle: "最初にイベントを開くのは、あなたです。",
      createSubtitle: "公開すると専用ページと共有リンクが作られ、アプリと完全に同期します。",
      coverAlt: "カバー",
      addCover: "カバーを追加(16:9 推奨)",
      fName: "イベント名",
      fNamePlaceholder: "例:渋谷読書会 × Machi",
      fSubtitle: "ひとことサブタイトル(任意)",
      fSubtitlePlaceholder: "例:今月のテーマ:村上春樹",
      fDesc: "イベント詳細",
      fDescPlaceholder: "流れ・費用・持ち物・どんな人向けか…",
      fStart: "開始日時",
      fEnd: "終了日時(任意)",
      fVenue: "会場名",
      fVenuePlaceholder: "例:SHIBUYA BOOK LOUNGE",
      fAddress: "詳しい住所(任意)",
      fAddressPlaceholder: "東京都渋谷区…",
      moreSettings: "詳細設定(すべて任意)",
      fCapacity: "定員(空欄 = 無制限)",
      fCapacityPlaceholder: "例:30",
      fPrice: "費用の表示",
      fPricePlaceholder: "例:無料 / ¥1,500(現地払い)",
      fExternal: "提携先チケット/詳細リンク",
      feeHint: "Machi は費用を代理徴収しません。チケット販売が必要な場合は提携先リンクをご利用ください。",
      formFieldsTitle: "参加登録フォームの項目",
      formFieldsHintCreate: "参加者に呼び名や連絡先などを記入してもらえます。公開後も「管理」から編集できます。",
      addField: "追加",
      noFieldsCreate: "項目なし = ワンタップ登録。",
      fieldNamePlaceholderCreate: "項目名(例:お名前は?)",
      removeField: "項目を削除",
      ftText: "テキスト",
      ftSelect: "単一選択",
      ftCheckbox: "チェック",
      required: "必須",
      optionsPlaceholderCreate: "選択肢をカンマ区切りで:小説, エッセイ, どちらでも",
      publishError: "公開に失敗しました。あとでもう一度お試しください",
      coverUploadError: "カバーのアップロードに失敗しました",
      publishing: "公開中…",
      publish: "イベントを公開",
      manageNoPermission: "このイベントを管理できるのは主催者または管理者のみです。",
      backToEvent: "イベントページへ戻る",
      statusPublished: "公開中",
      statusDraft: "下書き",
      statusCancelled: "中止",
      featuredOn: "注目に設定済み",
      featuredSet: "注目に設定",
      save: "保存",
      saved: "保存しました",
      saveError: "保存に失敗しました",
      basicInfo: "基本情報",
      mSubtitle: "サブタイトル",
      mDesc: "詳細",
      mAddress: "住所",
      mCapacity: "定員(空欄/0 = 無制限)",
      formFieldsHintManage: "項目名を変えても既存の回答には影響しません。項目を削除すると対応する回答も非表示になります。",
      noFieldsManage: "現在はワンタップ登録(情報は収集しません)。",
      fieldNamePlaceholderManage: "項目名",
      optionsPlaceholderManage: "選択肢をカンマ区切りで",
      cancelEventConfirm: "このイベントを中止しますか?参加登録者には中止と表示されます。",
      cancelEvent: "イベントを中止",
      attendeeList: "参加者リスト",
      peopleCount: (n) => `${n}人`,
      noAttendees: "まだ参加者はいません。",
      statusGoing: "参加",
      statusWaitlist: "キャンセル待ち",
      host: {
        addToCalendar: "カレンダーに追加",
        pendingReview: "主催者の承認待ち",
        approvalToggle: "参加に承認を必須にする",
        approvalHint: "オンにすると、申込はまず承認待ちになり、あなたが個別に承認・却下します。",
        approve: "承認",
        decline: "却下",
        remove: "削除",
        checkIn: "受付",
        undoCheckIn: "受付を取消",
        checkedIn: "受付済み",
        broadcast: "一斉連絡",
        broadcastTitle: "参加者へ一斉連絡",
        broadcastPlaceholder: "参加者全員へ(会場変更・集合方法など)…",
        broadcastSend: "送信",
        broadcastSent: (n: number) => `${n}人に送信しました`,
        broadcastError: "送信に失敗しました",
        statusPending: "承認待ち",
        statusCheckedIn: "受付済み",
        guestList: "参加者",
        seeAll: "すべて表示",
      },
    },
  },
  en: {
    common: { close: "Close", back: "Back", send: "Send", cancel: "Cancel", delete: "Delete", optional: "optional" },
    rooms: {
      heroKicker: "Machi Rooms",
      heroTitle: "Find a buddy, meet up now",
      heroDesc: "Meals, drinks, study, carpools… opening a room is like opening a game lobby: see who's in and what's been said, then just say hi and make plans.",
      create: "Start a room",
      joinedFilter: "Joined",
      all: "All",
      live: "Live",
      joined: "Joined",
      full: "Full",
      spotsLeft: (n) => `${n} spot${n === 1 ? "" : "s"} left`,
      people: (n) => `${n} ${n === 1 ? "person" : "people"}`,
      messagesCount: (n) => `${n} message${n === 1 ? "" : "s"}`,
      startChat: "Be the first to say hi",
      emptyMineTitle: "You haven't joined any rooms yet",
      emptyTitle: "No live rooms yet",
      emptySubtitle: "Start a room and invite people out for food, drinks or board games.",
      modalTitle: "Start a room",
      modalSubtitle: "Want to do something together? Post it and people in your city can join and chat.",
      kindQuestion: "What kind of buddy?",
      name: "Room name",
      namePlaceholder: "e.g. Friday night yakiniku in Shinjuku, need 3 more",
      desc: "Say a few words",
      descPlaceholder: "Budget, tastes, where to meet… anything goes",
      time: "Time (optional)",
      capacity: "Max people (0 = unlimited)",
      location: "Rough location (optional)",
      locationPlaceholder: "e.g. Shinjuku Station east exit / near Shibuya",
      creating: "Creating…",
      createSubmit: "Create",
      createError: "Couldn't create the room. Please try again.",
      dissolveConfirm: "Dissolve this room? The room and its chat will be deleted.",
      dissolveAria: "Dissolve room",
      leaveConfirm: "Leave this room?",
      leaveAria: "Leave room",
      inRoom: (m, c) => `${m}${c > 0 ? ` / ${c}` : ""} in the room`,
      peopleHere: "People in the room",
      host: "Host",
      emptyJoined: "No messages yet — say hi.",
      emptyGuest: "No messages yet. Join to chat.",
      sayPlaceholder: "Say something…",
      ended: "This room has ended",
      fullLabel: "Room is full",
      joining: "Joining…",
      join: "Join this room",
      joinError: "Couldn't join",
      opError: "Something went wrong",
      deleteError: "Couldn't delete",
      sendError: "Couldn't send",
      addCover: "Add a cover (optional)",
      coverAlt: "Room cover",
      coverUploadError: "Couldn't upload the cover, try another",
    },
    events: {
      all: "All events",
      manage: "Manage",
      delete: "Delete",
      deleteConfirm: (title) => `Delete the event "${title}"? Registered guests will see it as cancelled.`,
      about: "About this event",
      featured: "Machi Picks",
      organizer: "Organizer",
      register: "Register",
      registered: "You're registered for this event",
      waitlisted: "You're on the waitlist — you'll be moved up if a spot opens.",
      spotsLeft: (n) => `${n} spot${n === 1 ? "" : "s"} left`,
      fullWaitlist: "Full — you can join the waitlist",
      unlimited: "Unlimited spots — just show up",
      going: (n) => `${n} going`,
      cancelled: "Event cancelled",
      ended: "Event ended",
      youOrganizer: "You're the organizer of this event",
      cancelling: "Cancelling…",
      cancelReg: "Cancel registration",
      registering: "Registering…",
      joinWaitlist: "Join waitlist",
      registerJoin: "Register",
      external: "Partner tickets / details",
      disclaimer: "Machi doesn't collect any fees; for paid events, refer to the partner's page.",
      registerError: "Couldn't register. Please try again.",
      cancelError: "Couldn't cancel. Please try again.",
      deleteError: "Couldn't delete. Please try again.",
      modalTitle: "Registration details",
      submitting: "Submitting…",
      confirmReg: "Confirm",
      yes: "Yes",
      no: "No",
      heroTitle: "Host an event, gather the right people",
      heroDesc: "Exhibitions, shows, book clubs, markets, workshops… properly planned offline events. Publish and get a dedicated page with one-tap registration.",
      create: "Create event",
      upcoming: "Upcoming",
      past: "Past",
      featuredBadge: "Featured",
      beFirst: "Be the first to join",
      registeredBadge: "Registered",
      emptyUpcoming: "No upcoming events yet",
      emptyPast: "No past events yet",
      emptySubtitle: "Be the first to host one.",
      createSubtitle: "Publishing creates a dedicated page and share link, fully synced with the app.",
      coverAlt: "Cover",
      addCover: "Add a cover (16:9 recommended)",
      fName: "Event name",
      fNamePlaceholder: "e.g. Shibuya Book Club × Machi",
      fSubtitle: "One-line subtitle (optional)",
      fSubtitlePlaceholder: "e.g. This month: Haruki Murakami",
      fDesc: "Event details",
      fDescPlaceholder: "Schedule, fees, what to bring, who it's for…",
      fStart: "Start time",
      fEnd: "End time (optional)",
      fVenue: "Venue",
      fVenuePlaceholder: "e.g. SHIBUYA BOOK LOUNGE",
      fAddress: "Address (optional)",
      fAddressPlaceholder: "Shibuya, Tokyo…",
      moreSettings: "More settings (all optional)",
      fCapacity: "Capacity (blank = unlimited)",
      fCapacityPlaceholder: "e.g. 30",
      fPrice: "Price display",
      fPricePlaceholder: "e.g. Free / ¥1,500 (pay at door)",
      fExternal: "Partner ticket / details link",
      feeHint: "Machi doesn't collect any fees; use a partner link if you need ticketing.",
      formFieldsTitle: "Registration form fields",
      formFieldsHintCreate: "Ask registrants for a name, contact, etc. You can still edit these later under Manage.",
      addField: "Add one",
      noFieldsCreate: "No fields = one-tap registration.",
      fieldNamePlaceholderCreate: "Field name, e.g. What should we call you?",
      removeField: "Remove field",
      ftText: "Text",
      ftSelect: "Choice",
      ftCheckbox: "Checkbox",
      required: "Required",
      optionsPlaceholderCreate: "Options, comma-separated: Fiction, Essay, Either",
      publishError: "Couldn't publish. Please try again.",
      coverUploadError: "Cover upload failed",
      publishing: "Publishing…",
      publish: "Publish event",
      manageNoPermission: "Only the organizer or an admin can manage this event.",
      backToEvent: "Back to event",
      statusPublished: "Published",
      statusDraft: "Draft",
      statusCancelled: "Cancelled",
      featuredOn: "Featured",
      featuredSet: "Feature",
      save: "Save",
      saved: "Saved",
      saveError: "Couldn't save",
      basicInfo: "Basic info",
      mSubtitle: "Subtitle",
      mDesc: "Details",
      mAddress: "Address",
      mCapacity: "Capacity (blank/0 = unlimited)",
      formFieldsHintManage: "Renaming a field keeps existing answers; deleting a field also hides its answers.",
      noFieldsManage: "Currently one-tap registration (no info collected).",
      fieldNamePlaceholderManage: "Field name",
      optionsPlaceholderManage: "Options, comma-separated",
      cancelEventConfirm: "Cancel this event? Registered guests will see it as cancelled.",
      cancelEvent: "Cancel event",
      attendeeList: "Attendees",
      peopleCount: (n) => `${n} ${n === 1 ? "person" : "people"}`,
      noAttendees: "No one has registered yet.",
      statusGoing: "Going",
      statusWaitlist: "Waitlist",
      host: {
        addToCalendar: "Add to calendar",
        pendingReview: "Pending approval",
        approvalToggle: "Require my approval to join",
        approvalHint: "When on, registrations wait for your approval — you approve or decline each one.",
        approve: "Approve",
        decline: "Decline",
        remove: "Remove",
        checkIn: "Check in",
        undoCheckIn: "Undo check-in",
        checkedIn: "Checked in",
        broadcast: "Broadcast",
        broadcastTitle: "Message all guests",
        broadcastPlaceholder: "Send an update to everyone going (venue change, meeting point)…",
        broadcastSend: "Send",
        broadcastSent: (n: number) => `Sent to ${n} ${n === 1 ? "guest" : "guests"}`,
        broadcastError: "Couldn't send, try again",
        statusPending: "Pending",
        statusCheckedIn: "Checked in",
        guestList: "Guests",
        seeAll: "See all",
      },
    },
  },
};

/** Three-language copy for the rooms / events surfaces, resolved for a locale. */
export function socialCopy(locale: Locale): SocialCopy {
  return SOCIAL_COPY[langOf(locale)];
}
