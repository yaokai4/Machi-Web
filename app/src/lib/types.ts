// All shapes here mirror what the unified Python backend returns
// (server.py serialize_* functions). The same field names are used
// by the iOS App's domain models so behavior stays in lockstep.

import { z } from "zod";

export const UserSchema = z.object({
  id: z.string(),
  remote_id: z.string().optional(),
  handle: z.string(),
  username: z.string().optional(),
  display_name: z.string(),
  email: z.string().optional(),
  bio: z.string().optional(),
  location: z.string().optional(),
  avatar_symbol: z.string().optional(),
  avatar_color: z.string().optional(),
  avatar_url: z.string().optional(),
  cover_url: z.string().optional(),
  membership_tier: z.string().optional(),
  is_verified: z.boolean().optional(),
  // Machi Verified membership cache (synced from user_memberships on the
  // server). is_verified_member drives the blue badge; the rest power the
  // profile/settings membership panel.
  is_verified_member: z.boolean().optional(),
  verified_member_until: z.string().optional(),
  membership_status: z.string().optional(),
  membership_plan_key: z.string().optional(),
  verified_badge_type: z.string().optional(),
  role: z.string().optional(),
  country: z.string().optional(),
  province: z.string().optional(),
  city: z.string().optional(),
  current_region_code: z.string().optional(),
  recent_region_codes: z.array(z.string()).optional(),
  total_heat: z.number().optional(),
  creator_badge: z.string().optional(),
  is_merchant: z.boolean().optional(),
  merchant_verified: z.boolean().optional(),
  profile_view_count: z.number().optional(),
  joined_at: z.string().nullable().optional(),
  created_at: z.string().nullable().optional(),
  updated_at: z.string().nullable().optional(),
  deleted_at: z.string().nullable().optional(),
  follower_count: z.number().optional(),
  following_count: z.number().optional(),
  post_count: z.number().optional(),
  is_following: z.boolean().optional(),
  is_blocked: z.boolean().optional(),
  follows_viewer: z.boolean().optional(),
  is_mutual: z.boolean().optional(),
  // Google account binding state (mirrors serialize_user in server.py).
  email_verified: z.boolean().optional(),
  auth_provider: z.string().optional(),
  has_google: z.boolean().optional(),
  can_unlink_google: z.boolean().optional(),
});
export type KXUser = z.infer<typeof UserSchema>;

// Whether to show the blue Machi Verified badge next to a user. True for
// active verified members AND for legacy/admin-verified accounts, so the
// existing `is_verified` badge behaviour is preserved while membership
// now also lights it up. Single source of truth for every badge site.
export function showVerifiedBadge(
  user?: { is_verified?: boolean; is_verified_member?: boolean } | null,
): boolean {
  return !!(user && (user.is_verified || user.is_verified_member));
}

// ---- membership + payments (mirrors server.py serialize_* shapes) ----
export interface KXMembershipStatus {
  is_active: boolean;
  status: string; // inactive | active | expired | canceled | grace_period | refunded | pending
  plan_key: string;
  current_period_end: string;
  source: string;
  cancel_at_period_end: boolean;
  membership_id?: string;
}

export interface KXMembershipPlan {
  plan_key: string;
  planKey?: string;
  name?: string;
  subtitle?: string;
  description?: string;
  name_zh: string;
  name_en: string;
  name_ja: string;
  amount: number;
  amount_cents: number;
  price?: number;
  currency: string;
  price_label?: string;
  priceLabel?: string;
  original_price?: number;
  originalPrice?: number;
  discount_label?: string;
  discountLabel?: string;
  billing_cycle: string;
  billingPeriod?: string;
  billing_period?: string;
  intervalCount?: number;
  interval_count?: number;
  stripeProductId?: string;
  stripePriceId?: string;
  iosIapProductId?: string;
  appleProductId?: string;
  isRecommended?: boolean;
  isDefault?: boolean;
  isFeatured?: boolean;
  sortOrder?: number;
  benefits?: Array<{ key: string; title: string; description: string; icon?: string; sort_order?: number }>;
}

export interface KXMembershipMe {
  membership: KXMembershipStatus;
  plan: KXMembershipPlan | null;
  user: KXUser;
}

export type PaymentProvider = "wechat_pay" | "alipay" | "stripe";

export interface KXCreateOrderResult {
  orderNo: string;
  provider: PaymentProvider;
  amount: number;
  currency: string;
  expiresAt: string;
  qr_code_url?: string; // wechat (Native QR target)
  pay_url?: string; // alipay (redirect) or dev mock-confirm link
  mock?: boolean;
}

export interface KXOrderStatus {
  orderNo: string;
  status: "pending" | "paid" | "failed" | "closed" | "refunded";
  membershipActive: boolean;
  currentPeriodEnd: string;
}

export interface KXMembershipInsights {
  totals: {
    post_count: number;
    total_views: number;
    total_likes: number;
    total_bookmarks: number;
    total_reposts: number;
    total_comments: number;
  };
  top_posts: Array<{
    id: string;
    content: string;
    content_type?: string;
    view_count: number;
    like_count: number;
    comment_count: number;
    bookmark_count: number;
  }>;
}

export interface KXCountry {
  code: string;
  name: string;
  emoji: string;
  tier: number;
  has_provinces: boolean;
}

export interface KXProvince {
  code: string;
  name: string;
}

export interface KXCity {
  code: string;
  name: string;
}

export interface KXRegion {
  region_code: string;
  country_code: string;
  country_name: string;
  country_emoji: string;
  province_code: string;
  province_name: string;
  city_code: string;
  city_name: string;
}

export const MediaSchema = z.object({
  id: z.string(),
  owner_id: z.string().optional().default(""),
  ownerId: z.string().optional(),
  remote_id: z.string().optional(),
  remoteId: z.string().optional(),
  type: z.enum(["image", "video", "audio", "file"]).optional().default("image"),
  visibility: z.string().optional(),
  objectKey: z.string().optional(),
  url: z.string().optional().default(""),
  cdnUrl: z.string().optional(),
  publicUrl: z.string().optional(),
  thumb_url: z.string().optional().default(""),
  thumbUrl: z.string().optional(),
  thumbnail_url: z.string().optional(),
  thumbnailUrl: z.string().optional(),
  poster_url: z.string().optional(),
  posterUrl: z.string().optional(),
  mime: z.string().optional().default(""),
  content_type: z.string().optional(),
  contentType: z.string().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  duration: z.number().optional(),
  duration_seconds: z.number().optional(),
  durationSeconds: z.number().optional(),
  byte_size: z.number().optional(),
  file_size: z.number().optional(),
  fileSize: z.number().optional(),
  status: z.string().optional(),
  processing_status: z.string().optional(),
  processingStatus: z.string().optional(),
  created_at: z.string().optional().default(""),
  createdAt: z.string().optional(),
});
export type KXMedia = z.infer<typeof MediaSchema>;

export const MessageAttachmentSchema = z.object({
  id: z.string(),
  message_id: z.string(),
  thread_id: z.string().optional(),
  uploaded_file_id: z.string(),
  type: z.enum(["image", "video", "audio", "file"]),
  attachment_type: z.string().optional(),
  url: z.string().optional(),
  thumb_url: z.string().optional(),
  needsSignedUrl: z.boolean().optional(),
  viewUrlEndpoint: z.string().optional(),
  thumbnail_file_id: z.string().optional(),
  duration: z.number().optional(),
  duration_seconds: z.number().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  file_name: z.string().optional(),
  file_size: z.number().optional(),
  byte_size: z.number().optional(),
  content_type: z.string().optional(),
  mime: z.string().optional(),
  visibility: z.string().optional(),
  status: z.string().optional(),
  created_at: z.string().optional(),
});
export type KXMessageAttachment = z.infer<typeof MessageAttachmentSchema>;

export const CONTENT_TYPES = [
  "dynamic", "image_post", "long_post",
  "news", "local_info", "guide", "question", "rant",
  "secondhand", "housing", "roommate",
  "job_seek", "job_post", "referral",
  "meetup", "dining", "event",
  "service", "merchant", "coupon",
  "warning", "poll", "anonymous",
] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];

// High-trust content types that require an active Machi Verified
// membership to publish. Mirrors REQUIRES_VERIFIED_MEMBERSHIP in
// server.py — the server is authoritative (returns 403
// MEMBERSHIP_REQUIRED); the client uses this only to gate the UX.
export const MEMBERSHIP_REQUIRED_CONTENT_TYPES: readonly ContentType[] = [
  "job_post", "housing", "roommate", "service", "coupon", "merchant", "referral",
];
export function contentTypeRequiresMembership(ct?: ContentType | string | null): boolean {
  return !!ct && (MEMBERSHIP_REQUIRED_CONTENT_TYPES as readonly string[]).includes(ct);
}

export const CONTENT_TYPE_LABELS: Record<ContentType, string> = {
  dynamic: "动态",
  image_post: "图文",
  long_post: "长文",
  news: "新闻",
  local_info: "本地资讯",
  guide: "攻略",
  question: "问答",
  rant: "吐槽",
  secondhand: "二手",
  housing: "租房",
  roommate: "找室友",
  job_seek: "找工作",
  job_post: "招聘",
  referral: "内推",
  meetup: "小组",
  dining: "美食",
  event: "活动",
  service: "服务",
  merchant: "商家",
  coupon: "优惠",
  warning: "避坑",
  poll: "投票",
  anonymous: "树洞",
};

export const PostSchema: z.ZodType<KXPost, z.ZodTypeDef, unknown> = z.lazy(() =>
  z.object({
    id: z.string(),
    remote_id: z.string().optional(),
    author_id: z.string(),
    content: z.string(),
    created_at: z.string(),
    updated_at: z.string(),
    deleted_at: z.string().nullable().optional(),
    repost_of_id: z.string().nullable().optional(),
    view_count: z.number(),
    like_count: z.number(),
    repost_count: z.number(),
    bookmark_count: z.number(),
    comment_count: z.number(),
    heat_score: z.number(),
    liked: z.boolean(),
    bookmarked: z.boolean(),
    reposted: z.boolean(),
    tags: z.array(z.string()),
    media: z.array(MediaSchema),
    author: UserSchema.nullable().optional(),
    original_post: PostSchema.nullable().optional(),
    status: z.string().optional(),
    country: z.string().optional(),
    province: z.string().optional(),
    city: z.string().optional(),
    region_code: z.string().optional(),
    content_type: z.enum(CONTENT_TYPES).optional(),
    attributes: z.record(z.string(), z.unknown()).optional(),
    report_count: z.number().optional(),
    is_boosted: z.boolean().optional(),
    boost_weight: z.number().optional(),
    boosted_until: z.string().optional(),
    language: z.string().optional(),
    poll: z.object({
      options: z.array(z.string()),
      counts: z.array(z.number()),
      total: z.number(),
      my_vote: z.number().nullable().optional(),
      closed: z.boolean().optional(),
      expires_at: z.string().optional(),
    }).nullable().optional(),
  }),
);

export interface KXPost {
  id: string;
  remote_id?: string;
  author_id: string;
  content: string;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
  repost_of_id?: string | null;
  view_count: number;
  like_count: number;
  repost_count: number;
  bookmark_count: number;
  comment_count: number;
  heat_score: number;
  liked: boolean;
  bookmarked: boolean;
  reposted: boolean;
  tags: string[];
  media: KXMedia[];
  author?: KXUser | null;
  original_post?: KXPost | null;
  status?: string;
  country?: string;
  province?: string;
  city?: string;
  region_code?: string;
  content_type?: ContentType;
  attributes?: Record<string, unknown>;
  report_count?: number;
  is_boosted?: boolean;
  boost_weight?: number;
  boosted_until?: string;
  language?: string;
  poll?: {
    options: string[];
    counts: number[];
    total: number;
    my_vote?: number | null;
    closed?: boolean;
    expires_at?: string;
  } | null;
}

export const CommentSchema = z.object({
  id: z.string(),
  post_id: z.string(),
  author_id: z.string(),
  content: z.string(),
  parent_comment_id: z.string().nullable().optional(),
  reply_to_user_id: z.string().nullable().optional(),
  created_at: z.string(),
  updated_at: z.string(),
  deleted_at: z.string().nullable().optional(),
  like_count: z.number(),
  liked: z.boolean(),
  author: UserSchema.nullable().optional(),
  post: PostSchema.nullable().optional(),
});
export type KXComment = z.infer<typeof CommentSchema>;

export const NotificationSchema = z.object({
  id: z.string(),
  type: z.enum(["like", "comment", "reply", "repost", "follow", "mention", "bookmark", "system", "listing_inquiry"]),
  actor_id: z.string(),
  user_id: z.string(),
  target_post_id: z.string().nullable().optional(),
  target_comment_id: z.string().nullable().optional(),
  target_listing_id: z.string().nullable().optional(),
  target_conversation_id: z.string().nullable().optional(),
  content: z.string().optional(),
  is_read: z.boolean(),
  created_at: z.string(),
  actor: UserSchema.nullable().optional(),
});
export type KXNotification = z.infer<typeof NotificationSchema>;

export const MessageSchema = z.object({
  id: z.string(),
  conversation_id: z.string(),
  sender_id: z.string(),
  content: z.string(),
  created_at: z.string(),
  is_read: z.boolean(),
  media: z.array(MediaSchema).optional(),
  attachments: z.array(MessageAttachmentSchema).optional(),
});
export type KXMessage = z.infer<typeof MessageSchema>;

export const ConversationSchema = z.object({
  id: z.string(),
  participant_a: z.string(),
  participant_b: z.string(),
  participants: z.array(z.string()),
  peer: UserSchema.nullable().optional(),
  last_message: MessageSchema.nullable().optional(),
  unread_count: z.number(),
  updated_at: z.string(),
});
export type KXConversation = z.infer<typeof ConversationSchema>;

export const SettingsSchema = z.object({
  user_id: z.string(),
  language: z.string(),
  appearance: z.enum(["light", "dark"]),
  push_likes: z.boolean(),
  push_comments: z.boolean(),
  push_follows: z.boolean(),
  push_messages: z.boolean(),
  privacy_protect: z.boolean(),
  privacy_allow_dm: z.enum(["everyone", "following", "nobody"]),
  recommend_following: z.boolean(),
  recommend_topics: z.boolean(),
  updated_at: z.string(),
});
export type KXSettings = z.infer<typeof SettingsSchema>;

export const TrendingTopicSchema = z.object({
  tag: z.string(),
  post_count: z.number(),
});
export type KXTrendingTopic = z.infer<typeof TrendingTopicSchema>;

export const DeviceSchema = z.object({
  id: z.string(),
  token: z.string(),
  tokens: z.array(z.string()).optional(),
  device_name: z.string(),
  device_label: z.string().optional(),
  platform: z.string().optional(),
  user_agent: z.string(),
  ip: z.string(),
  country: z.string().optional(),
  region: z.string().optional(),
  city: z.string().optional(),
  org: z.string().optional(),
  geo_state: z.string().optional(),
  created_at: z.string(),
  last_seen_at: z.string(),
  expires_at: z.string(),
  session_count: z.number().optional(),
});
export type KXDevice = z.infer<typeof DeviceSchema>;

export const DraftSchema = z.object({
  id: z.string(),
  content: z.string(),
  media_ids: z.array(z.string()),
  tags: z.array(z.string()),
  updated_at: z.string(),
});
export type KXDraft = z.infer<typeof DraftSchema>;

export type KXListingType =
  | "secondhand"
  | "rental"
  | "job"
  | "hiring"
  | "local_service"
  | "discount"
  | "event";

export const MEMBERSHIP_REQUIRED_LISTING_TYPES: readonly KXListingType[] = [
  "rental", "job", "hiring", "local_service", "discount",
];
export function listingTypeRequiresMembership(type?: KXListingType | string | null): boolean {
  return !!type && (MEMBERSHIP_REQUIRED_LISTING_TYPES as readonly string[]).includes(type);
}

export type KXListingStatus =
  | "draft"
  | "pending_review"
  | "published"
  | "reserved"
  | "sold"
  | "rented"
  | "closed"
  | "expired"
  | "rejected"
  | "hidden";

export type KXListingVerificationStatus = "unverified" | "pending" | "verified" | "needs_review" | "rejected";

export interface KXListingMedia {
  id: string;
  uploadedFileId?: string;
  uploaded_file_id?: string;
  listing_id?: string;
  listingId?: string;
  media_type: "image" | "video" | string;
  mediaType?: "image" | "video" | string;
  type?: "image" | "video" | "audio" | "file" | string;
  visibility?: string;
  objectKey?: string;
  url: string;
  cdnUrl?: string;
  publicUrl?: string;
  thumb_url?: string;
  thumbUrl?: string;
  thumbnail_url?: string;
  thumbnailUrl?: string;
  poster_url?: string;
  posterUrl?: string;
  content_type?: string;
  contentType?: string;
  mime?: string;
  width?: number;
  height?: number;
  duration?: number;
  duration_seconds?: number;
  durationSeconds?: number;
  file_size?: number;
  fileSize?: number;
  byte_size?: number;
  status?: string;
  processing_status?: string;
  processingStatus?: string;
  sort_order?: number;
  sortOrder?: number;
  is_cover?: boolean;
  isCover?: boolean;
}

export interface KXListingCard {
  id: string;
  type: string;
  title: string;
  priceLabel?: string;
  primaryMeta?: string;
  secondaryMeta?: string;
  status?: string;
  statusLabel?: string;
  verificationStatus?: string;
  isVerified?: boolean;
  isFavorited?: boolean;
  isPromoted?: boolean;
  citySlug?: string;
  cityLabel?: string;
  coverUrl?: string;
  coverMedia?: KXListingMedia | null;
  createdAt?: string | null;
  publishedAt?: string | null;
}

export interface KXCityListing {
  id: string;
  country_code: string;
  countryCode?: string;
  city_id?: string;
  cityId?: string;
  city_slug: string;
  citySlug?: string;
  region_code?: string;
  regionCode?: string;
  language?: string;
  type: KXListingType;
  category: string;
  title: string;
  description: string;
  price?: number | null;
  currency: string;
  price_type?: string;
  priceType?: string;
  location_text: string;
  locationText?: string;
  latitude?: number | null;
  longitude?: number | null;
  status: KXListingStatus;
  verification_status: KXListingVerificationStatus;
  verificationStatus?: KXListingVerificationStatus;
  seller_user_id?: string;
  sellerUserId?: string;
  business_id?: string | null;
  businessId?: string | null;
  contact_method?: string;
  contactMethod?: string;
  view_count?: number;
  viewCount?: number;
  inquiry_count?: number;
  inquiryCount?: number;
  favorite_count?: number;
  favoriteCount?: number;
  report_count?: number;
  reportCount?: number;
  is_promoted?: boolean;
  isPromoted?: boolean;
  promotion_weight?: number;
  promotionWeight?: number;
  published_at?: string | null;
  publishedAt?: string | null;
  expires_at?: string | null;
  expiresAt?: string | null;
  created_at?: string;
  createdAt?: string | null;
  updated_at?: string;
  updatedAt?: string | null;
  media: KXListingMedia[];
  coverMedia?: KXListingMedia | null;
  cover_media?: KXListingMedia | null;
  cover_url?: string;
  coverUrl?: string;
  card?: KXListingCard;
  listingCard?: KXListingCard;
  attributes: Record<string, unknown>;
  seller?: KXUser | null;
  favorited?: boolean;
  isFavorited?: boolean;
  can_manage?: boolean;
  canManage?: boolean;
  report_count_open?: number;
}

export interface KXListingInquiry {
  id: string;
  listing_id: string;
  listingId?: string;
  from_user_id: string;
  fromUserId?: string;
  to_user_id: string;
  toUserId?: string;
  type: string;
  message: string;
  contact_value?: string;
  contactValue?: string;
  conversation_id?: string;
  conversationId?: string;
  details?: { label: string; value: string }[];
  metadata?: Record<string, unknown>;
  status: "new" | "replied" | "closed" | "spam" | "reported" | string;
  created_at?: string;
  createdAt?: string;
  updated_at?: string;
  updatedAt?: string;
  listing?: KXCityListing | null;
  from_user?: KXUser | null;
  fromUser?: KXUser | null;
  to_user?: KXUser | null;
  toUser?: KXUser | null;
}

export interface KXCreateListingPayload {
  type: KXListingType;
  title: string;
  description?: string;
  category?: string;
  price?: number | null;
  currency?: string;
  price_type?: string;
  location_text?: string;
  country_code?: string;
  city_slug?: string;
  region_code?: string;
  language?: string;
  contact_method?: string;
  attributes?: Record<string, unknown>;
  media_ids?: string[];
  mediaIds?: string[];
  cover_media_id?: string;
  coverMediaId?: string;
}

export interface KXReputationBadge {
  id: string;
  key: string;
  name?: string;
  name_zh: string;
  name_en?: string;
  name_ja?: string;
  category: string;
  rarity: "common" | "uncommon" | "rare" | "epic" | "city_special" | "official" | string;
  description_zh?: string;
  is_official?: boolean;
  is_active?: boolean;
  user_badge_id?: string;
  is_displayed?: boolean;
  granted_at?: string;
  reason?: string;
}

export interface KXReputationPrivilege {
  key: string;
  title_zh: string;
  title_en?: string;
  title_ja?: string;
  description_zh?: string;
  level: number;
}

export interface KXReputationReward {
  user_reward_id?: string;
  key: string;
  name_zh: string;
  name_en?: string;
  name_ja?: string;
  reward_type?: string;
  required_level?: number;
  quantity?: number;
  status?: string;
  granted_at?: string;
  metadata?: Record<string, unknown>;
}

export interface KXReputationLimits {
  daily_xp_cap?: number;
  weekly_xp_cap?: number;
  monthly_xp_cap?: number;
  can_publish_secondhand?: boolean;
  secondhand_requires_review?: boolean;
  can_publish_rental?: boolean;
  can_publish_job?: boolean;
  can_publish_service?: boolean;
  can_publish_discount?: boolean;
  high_risk_requires_review?: boolean;
  dm_daily_limit?: number;
  growth_frozen?: boolean;
}

export interface KXReputationProfile {
  user_id: string;
  level: number;
  level_name: string;
  levelName?: string;
  level_name_en?: string;
  level_name_ja?: string;
  level_description?: string;
  xp?: number | null;
  current_level_xp?: number;
  next_level_xp?: number | null;
  nextLevelXp?: number | null;
  xp_to_next?: number | null;
  reputation_status: string;
  reputationStatus?: string;
  reputation_label: string;
  reputationLabel?: string;
  reputation_score?: number | null;
  risk_score?: number | null;
  public_trust_label?: string;
  badges: KXReputationBadge[];
  privileges: KXReputationPrivilege[];
  rewards: KXReputationReward[];
  limits: KXReputationLimits;
  stats: {
    helpedUsers: number;
    qualityPosts: number;
    favoritesReceived: number;
    violationFreeDays: number;
    reportsValidated?: number;
  };
  growth_frozen?: boolean;
  frozen_until?: string | null;
  freeze_reason?: string;
  updated_at?: string;
}

export interface KXReputationEvent {
  id: string;
  user_id: string;
  actor_user_id?: string;
  admin_id?: string;
  rule_key: string;
  event_type: string;
  target_kind?: string;
  target_id?: string;
  xp_delta: number;
  reputation_delta: number;
  risk_delta: number;
  xp_before: number;
  xp_after: number;
  reputation_before: number;
  reputation_after: number;
  risk_before: number;
  risk_after: number;
  level_before: number;
  level_after: number;
  reason: string;
  metadata?: Record<string, unknown>;
  created_at: string;
}

export interface KXReputationLevel {
  level: number;
  xp_required: number;
  name_zh: string;
  name_en?: string;
  name_ja?: string;
  description_zh?: string;
  privileges?: string[];
}

export type FeedMode = "recommend" | "plaza" | "local" | "following" | "hot";
export type ProfileSegment = "posts" | "reposts" | "replies" | "media" | "likes" | "bookmarks";

export type CityListingType = KXListingType;
export type CityListingStatus = KXListingStatus;
export type CityListingVerificationStatus = KXListingVerificationStatus;

export interface CityListingsQuery {
  type: KXListingType;
  city?: string;
  city_slug?: string;
  region_code?: string;
  country?: string;
  category?: string;
  q?: string;
  keyword?: string;
  min_price?: number | string;
  max_price?: number | string;
  sort?: "latest" | "price_low" | "price_high" | "popular";
  status?: KXListingStatus;
  cursor?: string;
  limit?: number;
  owner?: "me";
  mine?: "1";
}

// Content language enum — mirrors iOS `ContentLanguage`. `followApp`
// resolves to whatever the UI language is; `multi` disables filtering;
// the rest map to a BCP-47-ish short tag (`zh` / `en` / `ja` / …).
export const CONTENT_LANGUAGES = [
  "followApp",
  "zh",
  "en",
  "ja",
  "ko",
  "fr",
  "es",
  "multi",
] as const;
export type ContentLanguage = (typeof CONTENT_LANGUAGES)[number];

export const CONTENT_LANGUAGE_LABELS: Record<ContentLanguage, string> = {
  followApp: "跟随 App 语言",
  zh: "中文",
  en: "English",
  ja: "日本語",
  ko: "한국어",
  fr: "Français",
  es: "Español",
  multi: "多语言内容",
};

export const CONTENT_LANGUAGE_LABELS_EN: Record<ContentLanguage, string> = {
  followApp: "Follow app language",
  zh: "Chinese",
  en: "English",
  ja: "Japanese",
  ko: "Korean",
  fr: "French",
  es: "Spanish",
  multi: "Multilingual",
};

/// Server tag actually written to `posts.language`. Sentinels return
/// empty.
export function contentLanguageServerTag(lang: ContentLanguage): string {
  if (lang === "followApp" || lang === "multi") return "";
  return lang;
}

// Primary categories used by the city channel — mirrors iOS
// `CityChannel.Primary`.
export const CITY_PRIMARY_CATEGORIES = [
  "recommend",
  "life",
  "marketplace",
  "work",
  "social",
  "info",
] as const;
export type CityPrimary = (typeof CITY_PRIMARY_CATEGORIES)[number];
export const CITY_CHANNELS = [
  "recommend",
  "dynamic",
  "news",
  "guide",
  "secondhand",
  "housing",
  "jobSeek",
  "jobPost",
  "meetup",
  "dining",
  "event",
  "question",
  "service",
  "merchant",
  "coupon",
  "warning",
  "hot",
] as const;
export type CityChannelKey = (typeof CITY_CHANNELS)[number];

export const CITY_PRIMARY_LABELS: Record<CityPrimary, string> = {
  recommend: "推荐",
  life: "生活",
  marketplace: "交易",
  work: "工作",
  social: "社交",
  info: "资讯",
};

export const CITY_CHANNEL_LABELS: Record<CityChannelKey, string> = {
  recommend: "推荐",
  dynamic: "动态",
  news: "新闻",
  guide: "攻略",
  secondhand: "二手",
  housing: "租房",
  jobSeek: "找工作",
  jobPost: "招聘",
  meetup: "小组",
  dining: "美食",
  event: "活动",
  question: "问答",
  service: "服务",
  merchant: "商家",
  coupon: "优惠",
  warning: "避坑",
  hot: "热榜",
};

export const CITY_CHANNEL_DESCRIPTIONS: Record<CityChannelKey, string> = {
  recommend: "按当前城市热度和时间排序,展示最值得先看的本地内容。",
  dynamic: "日常动态、图文、长文、吐槽、树洞和投票。",
  news: "本地快讯、政策提醒、交通提醒、安全提醒。",
  guide: "租房、签证、银行卡、手机卡、找工作和生活经验。",
  secondhand: "闲置转让、求购、搬家甩卖、免费赠送。",
  housing: "找房、转租、合租、找室友、租房避坑。",
  jobSeek: "兼职、全职、实习、远程、求职经验。",
  jobPost: "本地商家、企业、机构发布招聘和内推。",
  meetup: "学习、运动、摄影、语言交换和本地活动小组。",
  dining: "美食聚会、咖啡、探店和周末本地餐厅讨论。",
  event: "展览、Citywalk、桌游、运动、线下聚会。",
  question: "签证、租房、工作、学校、医疗等本地求助。",
  service: "搬家、翻译、签证、留学、保险、维修、报税。",
  merchant: "本地店铺、服务商和认证商家内容。",
  coupon: "本地商家折扣、团购、限时优惠。",
  warning: "防诈骗、踩雷、交易和租房安全提醒。",
  hot: "最近 24 小时当前城市热度最高的内容。",
};

export const CITY_CHANNEL_CONTENT_TYPES: Record<CityChannelKey, ContentType[] | undefined> = {
  recommend: undefined,
  dynamic: ["dynamic", "image_post", "long_post", "rant", "anonymous", "poll"],
  news: ["news", "local_info"],
  guide: ["guide"],
  secondhand: ["secondhand"],
  housing: ["housing", "roommate"],
  jobSeek: ["job_seek"],
  jobPost: ["job_post", "referral"],
  meetup: ["meetup"],
  dining: ["dining"],
  event: ["event"],
  question: ["question"],
  service: ["service"],
  merchant: ["merchant"],
  coupon: ["coupon"],
  warning: ["warning"],
  hot: undefined,
};

/// Channels grouped under each primary — order matters so the first
/// entry is the default landing channel when a primary is selected.
export const CITY_PRIMARY_CHANNELS: Record<CityPrimary, CityChannelKey[]> = {
  recommend: ["recommend", "hot", "dynamic"],
  life: ["dynamic", "guide", "question", "warning"],
  marketplace: ["secondhand", "housing", "coupon"],
  work: ["jobSeek", "jobPost"],
  social: ["meetup", "dining", "event"],
  info: ["news", "service", "merchant"],
};

export interface Paginated<T> {
  items: T[];
  next_cursor: string | null;
}

export interface APIErrorPayload {
  code: string;
  message: string;
}
