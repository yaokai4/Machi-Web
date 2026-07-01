// Machi Guide / 日本指南 — typed client for the unified /api/guide surface.
//
// This is intentionally a standalone module (not part of the big `api`
// object) so the Guide refactor stays additive and isolated. It reuses the
// shared token + base URL + error type from ./api. Web and iOS consume the
// SAME endpoints and the SAME category keys — the taxonomy is server-driven.

import { apiBase, readToken, APIError, type UploadedFile } from "./api";

export type GuideStatus = "ok" | "coming_soon";

export interface GuideHero {
  title: string;
  subtitle: string;
  note: string;
  searchPlaceholder: string;
  quickTags: string[];
}

export interface GuideEmptyState {
  title: string;
  body: string;
  action: string;
  actionCountry: string;
}

export interface GuideCategory {
  id: string;
  key: string;
  parentKey: string;
  title: string;
  subtitle: string;
  description: string;
  icon: string;
  color: string;
  country: string;
  language?: string;
  sortOrder: number;
  articleCount?: number;
  productCount?: number;
  seoTitle?: string;
  seoDescription?: string;
  isActive?: boolean;
  subCategories?: GuideCategory[];
}

export interface GuideGoalEntry {
  targetKey: string;
  title: string;
  categoryKey: string;
  subCategoryKey: string;
}

export interface GuideResourceEntry {
  key: "japan_schools" | "foreigner_friendly_companies" | string;
  title: string;
  description: string;
  icon: string;
  href: string;
}

export interface GuideArticle {
  id: string;
  title: string;
  slug: string;
  summary: string;
  body?: string;
  categoryKey: string;
  subCategoryKey: string;
  contentType: string;
  country: string;
  city: string;
  language: string;
  coverImage: string;
  seoTitle?: string;
  seoDescription?: string;
  tags: string[];
  relatedArticleSlugs?: string[];
  relatedProductSlugs?: string[];
  authorType: string;
  authorName: string;
  isFeatured: boolean;
  isFree: boolean;
  isPaid: boolean;
  status: string;
  viewCount: number;
  saveCount: number;
  sortOrder?: number;
  sourceUrl?: string;
  sourceLabel?: string;
  verifiedAt?: string;
  staleAfterDays?: number;
  saved?: boolean;
  progressPercent?: number;
  readingProgress?: {
    progressPercent: number;
    completedAt?: string | null;
    lastReadAt?: string | null;
  };
  publishedAt: string | null;
  updatedAt: string | null;
}

export interface GuideAIArticleDraft {
  title: string;
  slug: string;
  status?: string;
  categoryKey: string;
  subCategoryKey?: string;
  summary: string;
  body: string;
  seoTitle?: string;
  seoDescription?: string;
  coverImage?: string;
  tags?: string[];
  relatedArticleSlugs?: string[];
  relatedProductSlugs?: string[];
  authorName?: string;
  sortOrder?: number;
  isFeatured?: boolean;
  isFree?: boolean;
  isPaid?: boolean;
  sourceLabel?: string;
  sourceUrl?: string;
  verifiedAt?: string;
  staleAfterDays?: number;
}

export interface GuideProduct {
  id: string;
  title: string;
  slug: string;
  subtitle: string;
  description: string;
  categoryKey: string;
  subCategoryKey: string;
  productType: string;
  price: number;
  currency: string;
  priceLabel: string;
  originalPrice?: number;
  discountLabel?: string;
  memberPriceLabel?: string;
  isPriceHidden?: boolean;
  isAppointmentOnly?: boolean;
  priceRegion?: string;
  taxIncluded?: boolean;
  billingType?: string;
  billingPeriod?: string;
  servicePriceType?: string;
  startingPrice?: number;
  memberDiscountPercent?: number;
  serviceDurationMinutes?: number;
  depositRequired?: boolean;
  depositAmount?: number;
  cancellationPolicy?: string;
  canView?: boolean;
  canPurchase?: boolean;
  ctaLabel?: string;
  coverImage: string;
  tags: string[];
  relatedArticleSlugs?: string[];
  topicSlugs?: string[];
  targetAudience: string;
  deliveryMethod: string;
  country: string;
  language: string;
  isDigital: boolean;
  isService: boolean;
  isFree: boolean;
  isPaid: boolean;
  isComingSoon: boolean;
  status: string;
  purchaseCount: number;
  rating: number;
  publishedAt: string | null;
  fileCount?: number;
  // Content gating — preview is always public; purchaseContent/fileUrl only when entitled.
  previewContent?: string;
  purchaseContent?: string;
  hasPurchaseContent?: boolean;
  hasFile?: boolean;
  fileUrl?: string;
  fileDownloadAvailable?: boolean;
  fileName?: string;
  fileType?: string;
  fileSize?: number;
  // Member / pricing (admin-editable).
  isMemberIncluded?: boolean;
  isMemberDiscount?: boolean;
  memberPrice?: number;
  memberEffectivePrice?: number;
  isFeatured?: boolean;
  refundPolicy?: string;
  notes?: string;
  sortOrder?: number;
  // Payment routing surfaced to clients (ids are not secret).
  iosIapProductId?: string;
  appleProductId?: string;
  stripeAvailable?: boolean;
  // Admin-only (present in /api/admin/guide/products).
  stripeProductId?: string;
  stripePriceId?: string;
  // Machi Points purchasing (prices server-side only).
  walletEligible?: boolean;
  walletPricePoints?: number;
  memberWalletPricePoints?: number;
  pointsPriceLabel?: string;
  memberPointsPriceLabel?: string;
  canBuyWithPoints?: boolean;
  fulfillmentType?: string;
  entitlementType?: string;
  platformPolicy?: string;
  appStoreEligible?: boolean;
  googlePlayEligible?: boolean;
  externalPaymentAllowed?: boolean;
  pointsPurchaseLimit?: number;
  // Per-viewer points context (product detail only).
  pointsContext?: { eligible: boolean; requiredPoints: number; currentBalance: number; sufficient: boolean; owned: boolean };
  // Per-viewer entitlement (product detail only).
  access?: { owned: boolean; memberUnlocked: boolean; canAccess: boolean; signedIn: boolean };
}

export interface GuideCompanyScores {
  foreignerFriendly: number;
  visaSupport?: number;
  interviewDifficulty: number;
  overtime: number;
  salaryBenefit: number;
  workLifeBalance: number;
  careerGrowth?: number;
}

export interface GuideCompany {
  id: string;
  corporateNumber?: string;
  companyName: string;
  companyNameJp: string;
  companyNameEn?: string;
  slug: string;
  industry: string;
  subIndustry?: string;
  country: string;
  prefecture?: string;
  city: string;
  ward?: string;
  address?: string;
  postalCode?: string;
  latitude?: number | null;
  longitude?: number | null;
  website: string;
  careerUrl?: string;
  newGraduateUrl?: string;
  midCareerUrl?: string;
  globalCareerUrl?: string;
  size: string;
  companySize?: string;
  foundedYear: number;
  description: string;
  shortDescription?: string;
  isForeignerFriendly?: boolean | null;
  acceptsForeignApplicants?: boolean | null;
  supportsWorkVisa?: boolean | null;
  supportsNewGraduate?: boolean | null;
  supportsMidCareer?: boolean | null;
  hasEnglishPositions?: boolean | null;
  hasGlobalRoles?: boolean | null;
  hasForeignEmployees?: boolean | null;
  requiredJapaneseLevel?: string;
  requiredEnglishLevel?: string;
  employmentTypes?: string[];
  averageSalaryMin?: number;
  averageSalaryMax?: number;
  currency?: string;
  scores: GuideCompanyScores | null;
  reviewCount: number;
  interviewReviewCount?: number;
  tags?: string[];
  sourceType?: string;
  sourceName?: string;
  sourceUrl?: string;
  sourceLastCheckedAt?: string | null;
  verificationStatus?: string;
  dataQualityScore?: number;
  isFeatured?: boolean;
  viewCount?: number;
  saveCount?: number;
  savedByMe?: boolean;
  status: string;
}

export interface GuideSchool {
  id: string;
  slug: string;
  schoolName: string;
  schoolNameJp: string;
  schoolNameEn: string;
  schoolType: string;
  country: string;
  prefecture: string;
  city: string;
  ward?: string;
  address: string;
  postalCode?: string;
  latitude?: number | null;
  longitude?: number | null;
  website: string;
  admissionUrl: string;
  internationalAdmissionUrl: string;
  applicationUrl: string;
  scholarshipUrl: string;
  careerSupportUrl: string;
  languageSupportUrl: string;
  dormitoryUrl?: string;
  description: string;
  shortDescription: string;
  isAcceptingInternationalStudents: boolean | null;
  hasEnglishProgram: boolean | null;
  hasJapaneseProgram: boolean | null;
  hasScholarship: boolean | null;
  hasDormitory: boolean | null;
  hasCareerSupport: boolean | null;
  hasLanguageSupport: boolean | null;
  tuitionMin: number;
  tuitionMax: number;
  currency: string;
  applicationPeriods: string[];
  admissionMonths: string[];
  requiredJapaneseLevel: string;
  requiredEnglishLevel: string;
  ejuRequired: string;
  jlptRequired: string;
  toeflRequired: string;
  ieltsRequired: string;
  fieldsOfStudy: string[];
  departments: string[];
  faculties?: string[];
  graduateSchools?: string[];
  tags: string[];
  sourceType: string;
  sourceName: string;
  sourceUrl: string;
  sourceLastCheckedAt: string | null;
  verificationStatus: string;
  dataQualityScore?: number;
  isFeatured: boolean;
  status: string;
  viewCount: number;
  saveCount: number;
  savedByMe?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface GuideSchoolProgram {
  id: string;
  schoolId: string;
  programName: string;
  programNameJp: string;
  programNameEn: string;
  degreeLevel: string;
  programType: string;
  field: string;
  subField?: string;
  facultyName?: string;
  departmentName?: string;
  graduateSchoolName?: string;
  languageOfInstruction: string;
  durationMonths: number;
  admissionMonths: string[];
  applicationPeriod: string;
  tuition: number;
  currency: string;
  requiredJapaneseLevel: string;
  requiredEnglishLevel: string;
  ejuRequired: string;
  jlptRequired: string;
  toeflRequired: string;
  ieltsRequired: string;
  description: string;
  applicationUrl: string;
  sourceUrl?: string;
  verificationStatus?: string;
  status: string;
}

export interface GuideSchoolAdmission {
  id: string;
  schoolId: string;
  programId: string;
  admissionType: string;
  targetStudentType: string;
  applicationStart: string | null;
  applicationDeadline: string | null;
  examDate: string | null;
  resultDate: string | null;
  enrollmentMonth: string;
  requiredDocuments: string[];
  selectionMethod: string;
  applicationFee: number;
  tuitionFirstYear: number;
  scholarshipInfo: string;
  notes: string;
  sourceUrl: string;
  verificationStatus?: string;
  status: string;
}

export interface GuideCompanyPosition {
  id: string;
  companyId: string;
  positionTitle: string;
  positionTitleJp: string;
  positionCategory: string;
  employmentType: string;
  city: string;
  remoteType: string;
  salaryMin: number;
  salaryMax: number;
  currency: string;
  requiredJapaneseLevel: string;
  requiredEnglishLevel: string;
  visaSupport: string;
  description: string;
  requirements: string;
  sourceUrl: string;
  verificationStatus?: string;
  status: string;
}

export interface GuideCompanyReview {
  id: string;
  companyId: string;
  anonymous: boolean;
  position: string;
  employmentType: string;
  workPeriod?: string;
  pros: string;
  cons: string;
  overtimeLevel: string;
  foreignerSupport: string;
  visaSupport?: string;
  salaryBenefits: string;
  careerGrowth: string;
  workLifeBalance?: string;
  recommendationScore: number;
  status?: string;
  createdAt: string;
}

export interface GuideInterviewReview {
  id: string;
  companyId: string;
  companyName?: string;
  companySlug?: string;
  anonymous: boolean;
  position: string;
  employmentType: string;
  interviewRounds: number;
  interviewLanguage: string;
  difficulty: string;
  questions: string;
  processDescription: string;
  result: string;
  interviewYear: number;
  city: string;
  offerReceived?: boolean | null;
  durationWeeks?: number;
  tips?: string;
  status?: string;
  createdAt: string;
}

export interface GuideFaq {
  id: string;
  question: string;
  answer: string;
  categoryKey: string;
  country?: string;
  language?: string;
  sortOrder?: number;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface GuideTag {
  id: string;
  name: string;
  key: string;
  categoryKey: string;
  description?: string;
  sortOrder?: number;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface GuideTopic {
  id: string;
  title: string;
  slug: string;
  description: string;
  categoryKey: string;
  tags: string[];
  articleSlugs: string[];
  productSlugs: string[];
  coverImage: string;
  country: string;
  language: string;
  sortOrder: number;
  status: string;
  createdAt?: string;
  updatedAt?: string;
  publishedAt?: string | null;
}

export interface GuideHomeModule {
  id: string;
  moduleKey: string;
  title: string;
  subtitle: string;
  contentJson: Record<string, unknown>;
  country: string;
  language: string;
  sortOrder: number;
  isActive: boolean;
  status: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface GuideAdminOverview {
  status: string;
  stats: Record<string, number>;
  emptyCategories: GuideCategory[];
  recentArticles: GuideArticle[];
}

export interface GuideHomeResponse {
  status: GuideStatus;
  country: string;
  language?: string;
  hero: GuideHero;
  emptyState?: GuideEmptyState;
  categories: GuideCategory[];
  resourceEntries?: GuideResourceEntry[];
  goals: { title: string; entries: GuideGoalEntry[] };
  goalEntries: GuideGoalEntry[];
  featuredArticles: GuideArticle[];
  featuredProducts: GuideProduct[];
  featuredServices: GuideProduct[];
  featuredSchools?: GuideSchool[];
  companyHighlights: GuideCompany[];
  latestArticles: GuideArticle[];
  faq: GuideFaq[];
  journeys?: GuideJourney[];
  homeModules?: GuideHomeModule[];
  reviewDisclaimer?: string;
  schoolDisclaimer?: string;
  companyDisclaimer?: string;
}

export interface GuidePaged<T> {
  status: GuideStatus;
  country: string;
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  emptyState?: GuideEmptyState;
  disclaimer?: string;
  featured?: T[];
}

// --- Guide Journeys: situation -> ordered action path ---
export interface GuideJourney {
  id: string;
  key: string;
  country?: string;
  language?: string;
  title: string;
  subtitle: string;
  audience: string;
  icon: string;
  color: string;
  heroTitle: string;
  heroSubtitle: string;
  estimatedDays: number;
  sortOrder: number;
  status: string;
  stepCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface GuideJourneyStep {
  id: string;
  journeyKey: string;
  stepKey: string;
  title: string;
  summary: string;
  body?: string;
  actionLabel: string;
  actionType: string;
  actionTarget: string;
  categoryKey: string;
  articleSlugs: string[];
  productSlugs: string[];
  required: boolean;
  estimatedMinutes: number;
  deadlineHint: string;
  sortOrder: number;
  status: string;
  relatedArticles?: GuideArticle[];
  relatedProducts?: GuideProduct[];
  createdAt?: string;
  updatedAt?: string;
}

export interface GuideStepProgressState {
  status: string;
  completedAt?: string | null;
  plannedDate?: string | null;
  dueAt?: string | null;
  reminderAt?: string | null;
  priority?: string;
  notifyEnabled?: boolean;
  calendarNote?: string;
}

export interface GuideJourneysResponse {
  status: GuideStatus;
  country: string;
  language?: string;
  journeys: GuideJourney[];
}

export interface GuideJourneyDetailResponse {
  status: GuideStatus;
  country: string;
  language?: string;
  journey: GuideJourney;
  steps: GuideJourneyStep[];
  progress?: Record<string, GuideStepProgressState>;
  disclaimer?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface GuideProgress {
  id: string;
  journeyKey: string;
  stepKey: string;
  status: string;
  completedAt?: string | null;
  reminderAt?: string | null;
  plannedDate?: string | null;
  dueAt?: string | null;
  priority?: string;
  notifyEnabled?: boolean;
  calendarNote?: string;
  notes?: string;
  updatedAt?: string;
}

export interface GuideProgressSummary {
  journeyKey: string;
  done: number;
  total: number;
  percent: number;
}

export interface GuideProgressResponse {
  status: string;
  items: GuideProgress[];
  summary: GuideProgressSummary[];
}

export interface GuideProfile {
  id: string;
  userId: string;
  identityType: string;
  country: string;
  city: string;
  isInJapan: boolean;
  visaStatus: string;
  visaExpiresAt?: string | null;
  japaneseLevel: string;
  targetJapaneseLevel: string;
  targetLevel?: string;
  graduationDate?: string | null;
  targetEntryTerm: string;
  targetIndustry: string;
  targetSchoolType: string;
  weeklyAvailableMinutes: number;
  needsMaterials: boolean;
  needsServices: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface GuideTodoStep {
  id: string;
  text: string;
  done: boolean;
}

export interface GuideTodo {
  id: string;
  userId: string;
  planId: string;
  steps?: GuideTodoStep[];
  sourceType: string;
  sourceId: string;
  journeyKey: string;
  stepKey: string;
  title: string;
  summary: string;
  todoType: string;
  status: string;
  priority: string;
  plannedDate?: string | null;
  dueAt?: string | null;
  reminderAt?: string | null;
  completedAt?: string | null;
  estimatedMinutes: number;
  notes: string;
  recurrence?: string;
  listName?: string;
  tags?: string[];
  relatedArticleSlugs: string[];
  relatedProductSlugs: string[];
  relatedServiceSlugs: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface GuidePlan {
  id: string;
  userId: string;
  planType: string;
  title: string;
  subtitle: string;
  status: string;
  targetDate?: string | null;
  startedAt?: string | null;
  progressPercent: number;
  currentTodoId: string;
  sourceJourneyKey: string;
  todoTotal?: number;
  todoDone?: number;
  nextTodo?: GuideTodo | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface GuideApplication {
  id: string;
  userId: string;
  planId: string;
  type: "school" | "company" | "jlpt" | string;
  careerTrack: string;
  name: string;
  department: string;
  position: string;
  deadline?: string | null;
  interviewAt?: string | null;
  resultAt?: string | null;
  status: string;
  stage: string;
  websiteUrl: string;
  interviewLocation: string;
  meetingUrl: string;
  contactName: string;
  contactEmail: string;
  priority: string;
  favorite: boolean;
  tags: string[];
  archivedAt?: string | null;
  stages: GuideApplicationStage[];
  stageNote?: string;
  notes: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface GuideApplicationStage {
  id: string;
  applicationId: string;
  stage: string;
  note: string;
  occurredAt?: string | null;
  createdAt?: string | null;
}

export interface GuideLifeItem {
  id: string;
  userId: string;
  type: string;
  title: string;
  provider: string;
  amount: number;
  currency: string;
  paymentMethod: string;
  autoDebit?: boolean;
  dueDay: number;
  dueAt?: string | null;
  recurrence: string;
  reminderDaysBefore: number;
  notes: string;
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface GuideTransaction {
  id: string;
  userId: string;
  kind: "income" | "expense";
  amount: number;
  currency: string;
  category: string;
  account: string;
  occurredOn: string;
  note: string;
  source: string;
  sourceId: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface GuideFinanceCategory {
  code: string;
  zh: string;
  ja: string;
  en: string;
  icon: string;
}

export interface GuideBudget {
  category: string;
  monthlyLimit: number;
  currency: string;
}

export interface GuideDigest {
  status: string;
  month: string;
  finance: { income: number; expense: number; net: number; fixedMonthly: number; hasData: boolean };
  upcomingBills: { id: string; title: string; amount: number; dueOn: string; daysLeft: number }[];
  contractWindows: { id: string; title: string; cancelFrom: string; cancelTo: string; daysLeft: number; open: boolean; monthlyCost: number }[];
  documentExpiries: { id: string; title: string; expiresOn: string; daysLeft: number }[];
  budgetAlerts: { category: string; limit: number; spent: number; over: boolean }[];
  openTodos: number;
  hasSetup: boolean;
}

export interface GuideFinanceTrendPoint {
  month: string;
  income: number;
  expense: number;
  net: number;
}

export interface GuideFinanceSummary {
  status: string;
  month: string;
  currency: string;
  income: number;
  expense: number;
  net: number;
  byCategory: { category: string; amount: number }[];
  budgets: { category: string; limit: number; spent: number }[];
  fixedMonthly: number;
  lastMonthExpense: number;
}

export interface GuideLifePayment {
  id: string;
  lifeItemId: string;
  amount: number;
  currency: string;
  paymentMethod: string;
  paidAt: string;
  notes: string;
  createdAt?: string;
}

export interface GuideContract {
  id: string;
  userId: string;
  category: string;
  title: string;
  provider: string;
  startDate?: string | null;
  endDate?: string | null;
  cancellationWindowStart?: string | null;
  cancellationWindowEnd?: string | null;
  autoRenew: boolean;
  monthlyCost: number;
  yearlyCost: number;
  currency: string;
  reminderDaysBefore: number;
  contactInfo: string;
  notes: string;
  status: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface GuideDocumentReminder {
  id: string;
  userId: string;
  category: string;
  title: string;
  expiresAt?: string | null;
  reminderDaysBefore: number;
  notes: string;
  status: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface GuideCalendarItem {
  id: string;
  todoId: string;
  title: string;
  date?: string | null;
  startAt?: string | null;
  endAt?: string | null;
  type: string;
  status: string;
  planId: string;
  notes?: string;
  recurrence?: string;
  reminderAt?: string | null;
  allDay?: boolean;
  todo?: GuideTodo | null;
}

export interface GuideSuggestedJourney {
  key: string;
  title: string;
  subtitle: string;
  icon: string;
  color: string;
}

export interface GuideNextAction {
  kind: "todo" | "journey" | string;
  title: string;
  subtitle?: string;
  todoId?: string;
  todoType?: string;
  journeyKey?: string;
  dueAt?: string;
}

export interface GuideActivePlanResponse {
  status: string;
  profile?: GuideProfile | null;
  plan?: GuidePlan | null;
  todayTodos: GuideTodo[];
  upcomingTodos: GuideTodo[];
  openTodos: GuideTodo[];
  recommendedProducts?: GuideProduct[];
  recommendedServices?: GuideProduct[];
  // Identity-driven personalization (spec P0.1)
  identityType?: string;
  suggestedJourneys?: GuideSuggestedJourney[];
  defaultJourneyKey?: string;
  recommendedNextActions?: GuideNextAction[];
  // Retention signals (spec P1)
  retention?: { weekDone: number; streakDays: number };
}

export interface GuideLifePreset {
  type: string;
  label: string;
  icon: string;
  recurrence: string;
  reminderDaysBefore: number;
  kind: "payment" | "contract" | "visa" | "procedure" | string;
}

export interface GuideSearchScope {
  key: string;
  label: string;
}

export interface GuideSearchGroups {
  articles?: GuideArticle[];
  schools?: GuideSchool[];
  companies?: GuideCompany[];
  products?: GuideProduct[];
  faq?: GuideFaq[];
  journeys?: GuideJourney[];
}

export interface GuideSearchResponse {
  status: string;
  query: string;
  scopes: GuideSearchScope[];
  groups: GuideSearchGroups;
}

export interface GuideSavedItem {
  itemId: string;
  itemType: string;
  createdAt?: string;
}

const GUIDE_TIMEOUT_MS = 12_000;

async function greq<T>(method: string, path: string, body?: unknown, timeoutMs = GUIDE_TIMEOUT_MS): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const token = readToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = controller
    ? setTimeout(() => {
        try {
          controller.abort();
        } catch {
          // ignore
        }
      }, timeoutMs)
    : null;
  let res: Response;
  try {
    res = await fetch(`${apiBase}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "same-origin",
      cache: "no-store",
      signal: controller?.signal,
    });
  } catch (err) {
    const aborted = err instanceof DOMException && err.name === "AbortError";
    throw new APIError(
      {
        code: aborted ? "timeout" : "network_error",
        message: aborted ? "请求超时，请稍后重试。" : "无法连接服务器，请检查网络后重试。",
      },
      0,
    );
  } finally {
    if (timer) clearTimeout(timer);
  }
  const text = await res.text();
  let data: unknown = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new APIError({ code: "parse_error", message: "服务器响应格式异常。" }, res.status);
  }
  if (!res.ok) {
    const payload = data && typeof data === "object" && "error" in data
      ? (data as { error?: unknown }).error
      : data;
    const normalized =
      payload && typeof payload === "object"
        ? {
            code: String((payload as { code?: unknown }).code || "error"),
            message: String((payload as { message?: unknown }).message || "请求失败"),
          }
        : { code: "error", message: "请求失败" };
    throw new APIError(normalized, res.status);
  }
  return data as T;
}

function qs(params: Record<string, string | number | boolean | undefined | null>): string {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") usp.set(k, String(v));
  }
  const s = usp.toString();
  return s ? `?${s}` : "";
}

export interface GuideListParams {
  country?: string;
  regionGroup?: "capital_area" | "kansai_area" | "all_japan" | string;
  prefecture?: string;
  city?: string;
  language?: string;
  categoryKey?: string;
  subCategoryKey?: string;
  contentType?: string;
  productType?: string;
  priceType?: string;
  industry?: string;
  subIndustry?: string;
  companySize?: string;
  employmentType?: string;
  supportsWorkVisa?: boolean | string;
  acceptsForeignApplicants?: boolean | string;
  hasEnglishPositions?: boolean | string;
  hasGlobalRoles?: boolean | string;
  hasForeignEmployees?: boolean | string;
  japaneseLevel?: string;
  englishLevel?: string;
  interviewLanguage?: string;
  position?: string;
  companyId?: string;
  schoolType?: string;
  field?: string;
  acceptsInternationalStudents?: boolean | string;
  hasEnglishProgram?: boolean | string;
  hasJapaneseProgram?: boolean | string;
  hasScholarship?: boolean | string;
  hasDormitory?: boolean | string;
  hasCareerSupport?: boolean | string;
  hasLanguageSupport?: boolean | string;
  jlptLevel?: string;
  ejuRequired?: boolean | string;
  toeflRequired?: string;
  ieltsRequired?: string;
  admissionMonth?: string;
  enrollmentMonth?: string;
  tuitionMin?: number;
  tuitionMax?: number;
  sort?: string;
  keyword?: string;
  page?: number;
  pageSize?: number;
}

export interface GuideAdminPaged<T> {
  status: string;
  items: T[];
  page?: number;
  pageSize?: number;
  total: number;
  stats?: Record<string, unknown>;
}

export interface GuideAdminOSUser {
  id: string;
  handle: string;
  displayName: string;
  email: string;
}

export type GuideAdminOSRow<T> = T & { user?: GuideAdminOSUser };

export interface GuideAdminOSResponse {
  status: string;
  stats: Record<string, number>;
  profiles: GuideAdminOSRow<GuideProfile>[];
  plans: GuideAdminOSRow<GuidePlan>[];
  todos: GuideAdminOSRow<GuideTodo>[];
  applications: GuideAdminOSRow<GuideApplication>[];
  lifeItems: GuideAdminOSRow<GuideLifeItem>[];
}

export interface GuideLibraryMaterial extends GuideProduct {
  entitlementSource: "own" | "member";
  grantedAt: string;
  hasFile: boolean;
}
export interface GuideLibraryService {
  id: string;
  productId: string;
  productSlug: string;
  productTitle: string;
  serviceType: string;
  status: string;
  adminNote: string;
  createdAt: string;
  updatedAt: string;
}
export interface GuideLibraryOrder {
  kind: "purchase" | "topup";
  orderNo: string;
  title: string;
  productSlug: string;
  status: string;
  provider: string;
  paymentMethod: string;
  amount: number;
  currency: string;
  pricePoints: number;
  createdAt: string;
}
export interface GuideMyLibrary {
  status: string;
  isMember: boolean;
  materials: GuideLibraryMaterial[];
  services: GuideLibraryService[];
  orders: GuideLibraryOrder[];
}

// --- Machi AI (原创 in-app assistant) ---
// To the client this is entirely "Machi AI"; the underlying provider/model
// never appears in any of these payloads.
export interface GuideAIRoute {
  kind?: string;
  slug?: string;
  id?: string;
}
export interface GuideAISource {
  type?: string;
  title?: string;
  subtitle?: string;
  route?: GuideAIRoute;
}
export interface GuideAISuggestion {
  id: string;
  title: string;
  category?: string;
}
export interface GuideAIAbility {
  key: string;
  title: string;
  description?: string;
  memberOnly?: boolean;
}
export interface GuideAIConversation {
  id: string;
  title?: string;
  lastMessagePreview?: string;
  messageCount?: number;
  country?: string;
  language?: string;
  createdAt?: string;
  updatedAt?: string;
}
export interface GuideAIMessage {
  id: string;
  role: "user" | "assistant" | string;
  content: string;
  createdAt?: string;
  sources?: GuideAISource[];
}
export interface GuideAIUsage {
  membershipActive?: boolean;
  remainingFreeUses?: number | null;
  upgradeSuggested?: boolean;
}
export interface GuideAIBootstrap {
  status?: string;
  membershipActive?: boolean;
  remainingFreeUses?: number | null;
  suggestions?: GuideAISuggestion[];
  abilities?: GuideAIAbility[];
  disclaimer?: string;
}
export interface GuideAIChatResult {
  status?: string;
  conversationId?: string;
  message?: GuideAIMessage;
  usage?: GuideAIUsage;
}

export const guide = {
  home: (country = "jp", language = "zh-CN") =>
    greq<GuideHomeResponse>("GET", `/api/guide/home${qs({ country, language })}`),
  categories: (country = "jp", language = "zh-CN") =>
    greq<{ status: GuideStatus; country: string; categories: GuideCategory[] }>(
      "GET", `/api/guide/categories${qs({ country, language })}`),
  journeys: (country = "jp", language = "zh-CN") =>
    greq<GuideJourneysResponse>("GET", `/api/guide/journeys${qs({ country, language })}`),
  journey: (key: string, country = "jp", language = "zh-CN") =>
    greq<GuideJourneyDetailResponse>(
      "GET", `/api/guide/journeys/${encodeURIComponent(key)}${qs({ country, language })}`),
  search: (keyword: string, country = "jp", language = "zh-CN", scope = "all") =>
    greq<GuideSearchResponse>("GET", `/api/guide/search${qs({ q: keyword, country, language, scope })}`),
  progress: () => greq<GuideProgressResponse>("GET", "/api/guide/progress"),
  updateProgress: (body: { journeyKey: string; stepKey: string; status: string; reminderAt?: string; plannedDate?: string; dueAt?: string; priority?: string; notes?: string }) =>
    greq<GuideProgressResponse>("PATCH", "/api/guide/progress", body),
  profile: () => greq<{ status: string; profile: GuideProfile | null }>("GET", "/api/guide/profile"),
  updateProfile: (body: Partial<GuideProfile>) =>
    greq<{ status: string; profile: GuideProfile | null; generatedTodoCount?: number }>("PATCH", "/api/guide/profile", body),
  plans: () => greq<{ status: string; items: GuidePlan[] }>("GET", "/api/guide/plans"),
  activePlan: (language = "zh-CN") =>
    greq<GuideActivePlanResponse>("GET", `/api/guide/plans/active${qs({ language })}`),
  studyPlan: (body: { targetLevel: string; examDate: string; dailyMinutes: number }) =>
    greq<{ status: string; plan: GuidePlan; todos: GuideTodo[] }>("POST", "/api/guide/study-plan", body),
  startPlan: (body: { journeyKey?: string; sourceJourneyKey?: string; planType?: string; title?: string; subtitle?: string; targetDate?: string }) =>
    greq<{ status: string; plan: GuidePlan; todos: GuideTodo[] }>("POST", "/api/guide/plans/start", body),
  updatePlan: (id: string, body: Partial<GuidePlan>) =>
    greq<{ status: string; plan: GuidePlan }>("PATCH", `/api/guide/plans/${encodeURIComponent(id)}`, body),
  resetPlan: (id: string) =>
    greq<{ status: string; plan: GuidePlan }>("POST", `/api/guide/plans/${encodeURIComponent(id)}/reset`),
  todos: (p: { status?: string; from?: string; to?: string; planId?: string; type?: string; listName?: string; tag?: string; limit?: number } = {}) =>
    greq<{ status: string; items: GuideTodo[]; total: number }>("GET", `/api/guide/todos${qs(p)}`),
  createTodo: (body: { content?: string; title?: string; summary?: string; notes?: string; todoType?: string; priority?: string; plannedDate?: string; dueAt?: string; reminderAt?: string; recurrence?: string; planId?: string; listName?: string; tags?: string[] }) =>
    greq<{ status: string; todo: GuideTodo }>("POST", "/api/guide/todos", body),
  updateTodo: (id: string, body: Partial<GuideTodo>) =>
    greq<{ status: string; todo: GuideTodo }>("PATCH", `/api/guide/todos/${encodeURIComponent(id)}`, body),
  deleteTodo: (id: string) =>
    greq<{ status: string; deletedId: string }>("DELETE", `/api/guide/todos/${encodeURIComponent(id)}`),
  completeTodo: (id: string) =>
    greq<{ status: string; todo: GuideTodo }>("POST", `/api/guide/todos/${encodeURIComponent(id)}/complete`),
  setTodoReminder: (id: string, reminderAt: string) =>
    greq<{ status: string; todo: GuideTodo }>("POST", `/api/guide/todos/${encodeURIComponent(id)}/reminder`, { reminderAt }),
  calendar: (p: { from?: string; to?: string; limit?: number } = {}) =>
    greq<{ status: string; items: GuideCalendarItem[]; total: number }>("GET", `/api/guide/calendar${qs(p)}`),
  createCalendarEvent: (body: Partial<GuideCalendarItem>) =>
    greq<{ status: string; event: GuideCalendarItem }>("POST", "/api/guide/calendar/events", body),
  updateCalendarEvent: (id: string, body: Partial<GuideCalendarItem>) =>
    greq<{ status: string; event: GuideCalendarItem }>("PATCH", `/api/guide/calendar/events/${encodeURIComponent(id)}`, body),
  deleteCalendarEvent: (id: string) =>
    greq<{ status: string; deleted: string }>("DELETE", `/api/guide/calendar/events/${encodeURIComponent(id)}`),
  applications: (p: { status?: string; stage?: string; type?: string; priority?: string; q?: string } = {}) =>
    greq<{ status: string; items: GuideApplication[]; total: number }>("GET", `/api/guide/applications${qs(p)}`),
  application: (id: string) =>
    greq<{ status: string; application: GuideApplication; todos: GuideTodo[] }>("GET", `/api/guide/applications/${encodeURIComponent(id)}`),
  createApplication: (body: Partial<GuideApplication>) =>
    greq<{ status: string; application: GuideApplication }>("POST", "/api/guide/applications", body),
  updateApplication: (id: string, body: Partial<GuideApplication>) =>
    greq<{ status: string; application: GuideApplication }>("PATCH", `/api/guide/applications/${encodeURIComponent(id)}`, body),
  deleteApplication: (id: string) =>
    greq<{ status: string; deleted: string }>("DELETE", `/api/guide/applications/${encodeURIComponent(id)}`),
  lifePresets: (language = "zh-CN") =>
    greq<{ status: string; items: GuideLifePreset[] }>("GET", `/api/guide/life-presets${qs({ language })}`),
  financeCategories: () =>
    greq<{ status: string; expense: GuideFinanceCategory[]; income: GuideFinanceCategory[] }>("GET", "/api/guide/finance/categories"),
  financeSummary: (month?: string) =>
    greq<GuideFinanceSummary>("GET", `/api/guide/finance/summary${qs(month ? { month } : {})}`),
  digest: (days = 14) =>
    greq<GuideDigest>("GET", `/api/guide/digest${qs({ days })}`),
  quickSetup: (profile: string) =>
    greq<{ status: string; created: number; profile: string }>("POST", "/api/guide/quick-setup", { profile }),
  financeTrend: (months = 6, month?: string) =>
    greq<{ status: string; months: GuideFinanceTrendPoint[] }>("GET", `/api/guide/finance/trend${qs({ months, ...(month ? { month } : {}) })}`),
  postFixedCosts: (month?: string) =>
    greq<{ status: string; posted: number }>("POST", "/api/guide/finance/post-fixed", month ? { month } : {}),
  transactions: (p: { month?: string; kind?: string; category?: string; limit?: number } = {}) =>
    greq<{ status: string; items: GuideTransaction[]; total: number }>("GET", `/api/guide/transactions${qs(p)}`),
  createTransaction: (body: Partial<GuideTransaction>) =>
    greq<{ status: string; transaction: GuideTransaction }>("POST", "/api/guide/transactions", body),
  updateTransaction: (id: string, body: Partial<GuideTransaction>) =>
    greq<{ status: string; transaction: GuideTransaction }>("PATCH", `/api/guide/transactions/${encodeURIComponent(id)}`, body),
  deleteTransaction: (id: string) =>
    greq<{ status: string; deleted: string }>("DELETE", `/api/guide/transactions/${encodeURIComponent(id)}`),
  budgets: () =>
    greq<{ status: string; items: GuideBudget[] }>("GET", "/api/guide/budgets"),
  setBudget: (category: string, monthlyLimit: number) =>
    greq<{ status: string; items: GuideBudget[] }>("POST", "/api/guide/budgets", { category, monthlyLimit }),
  lifeItems: () =>
    greq<{ status: string; items: GuideLifeItem[]; total: number }>("GET", "/api/guide/life-items"),
  createLifeItem: (body: Partial<GuideLifeItem>) =>
    greq<{ status: string; item: GuideLifeItem }>("POST", "/api/guide/life-items", body),
  updateLifeItem: (id: string, body: Partial<GuideLifeItem>) =>
    greq<{ status: string; item: GuideLifeItem }>("PATCH", `/api/guide/life-items/${encodeURIComponent(id)}`, body),
  deleteLifeItem: (id: string) =>
    greq<{ status: string; deleted: string }>("DELETE", `/api/guide/life-items/${encodeURIComponent(id)}`),
  lifePayments: (id: string) =>
    greq<{ status: string; items: GuideLifePayment[]; total: number }>("GET", `/api/guide/life-items/${encodeURIComponent(id)}/payments`),
  createLifePayment: (id: string, body: Partial<GuideLifePayment>) =>
    greq<{ status: string; payment: GuideLifePayment; item: GuideLifeItem; nextDueAt?: string | null }>(
      "POST", `/api/guide/life-items/${encodeURIComponent(id)}/payments`, body),
  contracts: () =>
    greq<{ status: string; items: GuideContract[]; total: number }>("GET", "/api/guide/contracts"),
  createContract: (body: Partial<GuideContract>) =>
    greq<{ status: string; contract: GuideContract }>("POST", "/api/guide/contracts", body),
  updateContract: (id: string, body: Partial<GuideContract>) =>
    greq<{ status: string; contract: GuideContract }>("PATCH", `/api/guide/contracts/${encodeURIComponent(id)}`, body),
  deleteContract: (id: string) =>
    greq<{ status: string; deleted: string }>("DELETE", `/api/guide/contracts/${encodeURIComponent(id)}`),
  documents: () =>
    greq<{ status: string; items: GuideDocumentReminder[]; total: number }>("GET", "/api/guide/documents"),
  createDocument: (body: Partial<GuideDocumentReminder>) =>
    greq<{ status: string; document: GuideDocumentReminder }>("POST", "/api/guide/documents", body),
  updateDocument: (id: string, body: Partial<GuideDocumentReminder>) =>
    greq<{ status: string; document: GuideDocumentReminder }>("PATCH", `/api/guide/documents/${encodeURIComponent(id)}`, body),
  deleteDocument: (id: string) =>
    greq<{ status: string; deleted: string }>("DELETE", `/api/guide/documents/${encodeURIComponent(id)}`),
  attachments: (p: { entityType: string; entityId: string }) =>
    greq<{ status: string; items: UploadedFile[]; total: number }>("GET", `/api/guide/attachments${qs(p)}`),
  savedItems: () => greq<{ status: string; items: GuideSavedItem[] }>("GET", "/api/guide/saved"),
  setSaved: (itemType: string, itemId: string, on: boolean) =>
    greq<{ status: string; saved: boolean; itemType: string; itemId: string }>(
      on ? "POST" : "DELETE", "/api/guide/saved", { itemType, itemId }),
  articles: (p: GuideListParams = {}) =>
    greq<GuidePaged<GuideArticle>>("GET", `/api/guide/articles${qs({ ...p })}`),
  article: (idOrSlug: string, country = "jp", language = "zh-CN") =>
    greq<{ status: GuideStatus; article: GuideArticle; related: GuideArticle[] }>(
      "GET", `/api/guide/articles/${encodeURIComponent(idOrSlug)}${qs({ country, language })}`),
  updateArticleProgress: (idOrSlug: string, body: { progressPercent: number; country?: string }) =>
    greq<{
      status: string;
      articleId: string;
      slug: string;
      progress: { progressPercent: number; completedAt?: string | null; lastReadAt?: string | null };
    }>("PATCH", `/api/guide/articles/${encodeURIComponent(idOrSlug)}/progress`, body),
  products: (p: GuideListParams = {}) =>
    greq<GuidePaged<GuideProduct>>("GET", `/api/guide/products${qs({ ...p })}`),
  memberResources: (p: GuideListParams = {}) =>
    greq<GuidePaged<GuideProduct> & { membershipActive?: boolean; disclaimer?: string }>(
      "GET", `/api/guide/member-resources${qs({ ...p })}`),
  product: (idOrSlug: string, country = "jp", language = "zh-CN") =>
    greq<{ status: GuideStatus; product: GuideProduct }>(
      "GET", `/api/guide/products/${encodeURIComponent(idOrSlug)}${qs({ country, language })}`),
  myLibrary: (language = "zh-CN") =>
    greq<GuideMyLibrary>("GET", `/api/guide/my-library${qs({ language })}`),
  schools: (p: GuideListParams = {}) =>
    greq<GuidePaged<GuideSchool>>("GET", `/api/guide/schools${qs({ ...p })}`),
  school: (idOrSlug: string, country = "jp", language = "zh-CN") =>
    greq<{
      status: GuideStatus;
      school: GuideSchool;
      programs: GuideSchoolProgram[];
      admissions: GuideSchoolAdmission[];
      relatedArticles: GuideArticle[];
      relatedProducts: GuideProduct[];
      disclaimer: string;
    }>("GET", `/api/guide/schools/${encodeURIComponent(idOrSlug)}${qs({ country, language })}`),
  schoolPrograms: (idOrSlug: string, country = "jp", language = "zh-CN") =>
    greq<{ status: GuideStatus; country: string; items: GuideSchoolProgram[] }>(
      "GET", `/api/guide/schools/${encodeURIComponent(idOrSlug)}/programs${qs({ country, language })}`),
  schoolAdmissions: (idOrSlug: string, country = "jp", language = "zh-CN") =>
    greq<{ status: GuideStatus; country: string; items: GuideSchoolAdmission[] }>(
      "GET", `/api/guide/schools/${encodeURIComponent(idOrSlug)}/admissions${qs({ country, language })}`),
  companies: (p: GuideListParams = {}) =>
    greq<GuidePaged<GuideCompany>>("GET", `/api/guide/companies${qs({ ...p })}`),
  company: (idOrSlug: string, country = "jp", language = "zh-CN") =>
    greq<{
      status: GuideStatus;
      company: GuideCompany;
      interviewReviewCount: number;
      workReviewCount: number;
      positions?: GuideCompanyPosition[];
      latestInterviewReviews?: GuideInterviewReview[];
      latestWorkReviews?: GuideCompanyReview[];
      relatedArticles?: GuideArticle[];
      disclaimer: string;
    }>(
      "GET", `/api/guide/companies/${encodeURIComponent(idOrSlug)}${qs({ country, language })}`),
  companyPositions: (idOrSlug: string, country = "jp", language = "zh-CN") =>
    greq<{ status: GuideStatus; country: string; items: GuideCompanyPosition[] }>(
      "GET", `/api/guide/companies/${encodeURIComponent(idOrSlug)}/positions${qs({ country, language })}`),
  companyReviews: (idOrSlug: string, country = "jp", language = "zh-CN") =>
    greq<{ status: GuideStatus; companyId: string; workReviews: GuideCompanyReview[]; interviewReviews: GuideInterviewReview[]; disclaimer: string }>(
      "GET", `/api/guide/companies/${encodeURIComponent(idOrSlug)}/reviews${qs({ country, language })}`),
  interviewReviews: (p: GuideListParams = {}) =>
    greq<GuidePaged<GuideInterviewReview>>("GET", `/api/guide/interview-reviews${qs({ ...p })}`),
  submitInterviewReview: (body: Record<string, unknown>) =>
    greq<{ status: string; id: string; message: string }>("POST", `/api/guide/interview-reviews`, body),
  submitCompanyReview: (body: Record<string, unknown>) =>
    greq<{ status: string; id: string; message: string }>("POST", `/api/guide/company-reviews`, body),
  submitServiceRequest: (body: Record<string, unknown>) =>
    greq<{ status: string; id: string; message: string }>("POST", `/api/guide/service-requests`, body),
  submitCorrection: (body: Record<string, unknown>) =>
    greq<{ status: string; id: string; message: string }>("POST", `/api/guide/corrections`, body),
  saveSchool: (idOrSlug: string, on: boolean) =>
    greq<{ status: string; saved: boolean; school: GuideSchool }>(
      on ? "POST" : "DELETE", `/api/guide/schools/${encodeURIComponent(idOrSlug)}/save`, {}),
  saveCompany: (idOrSlug: string, on: boolean) =>
    greq<{ status: string; saved: boolean; company: GuideCompany }>(
      on ? "POST" : "DELETE", `/api/guide/companies/${encodeURIComponent(idOrSlug)}/save`, {}),
  purchase: (idOrSlug: string, body: { paymentMethod?: "wallet"; idempotencyKey?: string } = {}) =>
    greq<{
      status: string; message?: string; orderId?: string; orderNo?: string;
      code?: string; currentBalance?: number; requiredPoints?: number;
      wallet?: { balancePoints: number; displayBalance: string };
      recommendedTopups?: Array<{ packKey: string; priceLabel: string; displayPoints: string }>;
      alreadyOwned?: boolean;
    }>("POST", `/api/guide/products/${encodeURIComponent(idOrSlug)}/purchase`, body),
  downloadUrl: (idOrSlug: string) =>
    greq<{ ok: boolean; downloadUrl: string; expiresIn: number }>(
      "POST", `/api/guide/products/${encodeURIComponent(idOrSlug)}/download-url`, {}),
  memberResourceDownloadUrl: (idOrSlug: string) =>
    greq<{ ok: boolean; downloadUrl: string; expiresIn: number }>(
      "POST", `/api/member/resources/${encodeURIComponent(idOrSlug)}/download-url`, {}),
  // Web Stripe Checkout for a paid Guide product. Price is read server-side;
  // returns { checkoutUrl } to redirect to. iOS must NOT call this for digital
  // resources (App Store rules) — it uses IAP / shows 即将开放.
  checkout: (productId: string, returnUrl?: string) =>
    greq<{ status: string; checkoutUrl?: string; orderNo?: string; amount?: number; currency?: string; message?: string }>(
      "POST", `/api/payments/stripe/guide-checkout`, { productId, returnUrl }),
  confirmCheckout: (sessionId: string) =>
    greq<{ status: string; orderNo?: string }>(
      "POST", `/api/payments/stripe/guide-confirm`, { sessionId }),

  // Machi AI (原创 in-app assistant)
  aiBootstrap: (country = "jp", language = "zh-CN") =>
    greq<GuideAIBootstrap>("GET", `/api/guide/ai/bootstrap${qs({ country, language })}`),
  aiConversations: (limit = 30) =>
    greq<{ status: string; items: GuideAIConversation[] }>("GET", `/api/guide/ai/conversations${qs({ limit })}`),
  aiMessages: (conversationId: string) =>
    greq<{ status: string; conversation: GuideAIConversation; items: GuideAIMessage[] }>(
      "GET", `/api/guide/ai/conversations/${encodeURIComponent(conversationId)}/messages`),
  aiChat: (body: { conversationId?: string | null; message: string; country?: string; language?: string; category?: string; ability?: string }) =>
    greq<GuideAIChatResult>("POST", "/api/guide/ai/chat", body),
  aiDeleteConversation: (id: string) =>
    greq<{ status: string }>("DELETE", `/api/guide/ai/conversations/${encodeURIComponent(id)}`),
  aiFeedback: (messageId: string, rating: "helpful" | "not_helpful", reason?: string) =>
    greq<{ status: string; rating: string }>(
      "POST", `/api/guide/ai/messages/${encodeURIComponent(messageId)}/feedback`, { rating, reason }),
};

export const adminGuide = {
  overview: () =>
    greq<GuideAdminOverview>("GET", "/api/admin/guide/overview"),
  os: (p: { limit?: number } = {}) =>
    greq<GuideAdminOSResponse>("GET", `/api/admin/guide/os${qs(p)}`),
  articles: (p: GuideListParams & { status?: string } = {}) =>
    greq<GuideAdminPaged<GuideArticle>>("GET", `/api/admin/guide/articles${qs({ ...p })}`),
  article: (idOrSlug: string) =>
    greq<{ status: string; article: GuideArticle }>(
      "GET", `/api/admin/guide/articles/${encodeURIComponent(idOrSlug)}`),
  createArticle: (body: Record<string, unknown>) =>
    greq<{ status: string; id: string; slug: string }>("POST", "/api/admin/guide/articles", body),
  generateArticleDraft: (body: Record<string, unknown>) =>
    greq<{ status: string; article: GuideAIArticleDraft; qualityWarnings?: string[]; qualityNotes?: string[] }>(
      "POST", "/api/admin/guide/articles/ai-draft", body, 70_000),
  updateArticle: (id: string, body: Record<string, unknown>) =>
    greq<{ status: string; id: string }>("PATCH", `/api/admin/guide/articles/${encodeURIComponent(id)}`, body),
  deleteArticle: (id: string) =>
    greq<{ status: string }>("DELETE", `/api/admin/guide/articles/${encodeURIComponent(id)}`),
  categories: (p: { country?: string; language?: string; parentKey?: string } = {}) =>
    greq<{ status: string; items: GuideCategory[]; total: number }>(
      "GET", `/api/admin/guide/categories${qs({ ...p, flat: 1 })}`),
  category: (idOrKey: string) =>
    greq<{ status: string; category: GuideCategory }>(
      "GET", `/api/admin/guide/categories/${encodeURIComponent(idOrKey)}`),
  createCategory: (body: Record<string, unknown>) =>
    greq<{ status: string; id: string; key: string }>("POST", "/api/admin/guide/categories", body),
  updateCategory: (idOrKey: string, body: Record<string, unknown>) =>
    greq<{ status: string; id: string }>("PATCH", `/api/admin/guide/categories/${encodeURIComponent(idOrKey)}`, body),
  deleteCategory: (idOrKey: string) =>
    greq<{ status: string }>("DELETE", `/api/admin/guide/categories/${encodeURIComponent(idOrKey)}`),
  tags: (p: { categoryKey?: string } = {}) =>
    greq<{ status: string; items: GuideTag[]; total: number }>("GET", `/api/admin/guide/tags${qs(p)}`),
  tag: (idOrSlug: string) =>
    greq<{ status: string; tag: GuideTag }>("GET", `/api/admin/guide/tags/${encodeURIComponent(idOrSlug)}`),
  createTag: (body: Record<string, unknown>) =>
    greq<{ status: string; id: string; slug: string }>("POST", "/api/admin/guide/tags", body),
  updateTag: (idOrSlug: string, body: Record<string, unknown>) =>
    greq<{ status: string; id: string }>("PATCH", `/api/admin/guide/tags/${encodeURIComponent(idOrSlug)}`, body),
  deleteTag: (idOrSlug: string) =>
    greq<{ status: string }>("DELETE", `/api/admin/guide/tags/${encodeURIComponent(idOrSlug)}`),
  topics: (p: { categoryKey?: string; status?: string } = {}) =>
    greq<{ status: string; items: GuideTopic[]; total: number }>("GET", `/api/admin/guide/topics${qs(p)}`),
  topic: (idOrSlug: string) =>
    greq<{ status: string; topic: GuideTopic }>("GET", `/api/admin/guide/topics/${encodeURIComponent(idOrSlug)}`),
  createTopic: (body: Record<string, unknown>) =>
    greq<{ status: string; id: string; slug: string }>("POST", "/api/admin/guide/topics", body),
  updateTopic: (idOrSlug: string, body: Record<string, unknown>) =>
    greq<{ status: string; id: string }>("PATCH", `/api/admin/guide/topics/${encodeURIComponent(idOrSlug)}`, body),
  deleteTopic: (idOrSlug: string) =>
    greq<{ status: string }>("DELETE", `/api/admin/guide/topics/${encodeURIComponent(idOrSlug)}`),
  journeys: (country = "jp") =>
    greq<{ status: string; items: GuideJourney[]; total: number }>("GET", `/api/admin/guide/journeys${qs({ country })}`),
  createJourney: (body: Record<string, unknown>) =>
    greq<{ status: string; id: string; key: string }>("POST", "/api/admin/guide/journeys", body),
  productRelations: () =>
    greq<{ status: string; items: Record<string, unknown>[]; total: number }>("GET", "/api/admin/guide/product-relations"),
  createProductRelation: (body: Record<string, unknown>) =>
    greq<{ status: string; id: string }>("POST", "/api/admin/guide/product-relations", body),
  updateProductRelation: (id: string, body: Record<string, unknown>) =>
    greq<{ status: string; id: string }>("PATCH", `/api/admin/guide/product-relations/${encodeURIComponent(id)}`, body),
  deleteProductRelation: (id: string) =>
    greq<{ status: string }>("DELETE", `/api/admin/guide/product-relations/${encodeURIComponent(id)}`),
  planTemplates: () =>
    greq<{ status: string; items: Record<string, unknown>[]; templateKeys: string[]; total: number }>("GET", "/api/admin/guide/plan-templates"),
  createPlanTemplate: (body: Record<string, unknown>) =>
    greq<{ status: string; id: string }>("POST", "/api/admin/guide/plan-templates", body),
  updatePlanTemplate: (id: string, body: Record<string, unknown>) =>
    greq<{ status: string; id: string }>("PATCH", `/api/admin/guide/plan-templates/${encodeURIComponent(id)}`, body),
  deletePlanTemplate: (id: string) =>
    greq<{ status: string }>("DELETE", `/api/admin/guide/plan-templates/${encodeURIComponent(id)}`),
  resetPlanTemplates: (templateKey = "") =>
    greq<{ status: string; templateKey: string; seeded: number }>("POST", `/api/admin/guide/plan-templates/reset${templateKey ? `?templateKey=${encodeURIComponent(templateKey)}` : ""}`),
  updateJourney: (key: string, body: Record<string, unknown>) =>
    greq<{ status: string; id: string }>("PATCH", `/api/admin/guide/journeys/${encodeURIComponent(key)}`, body),
  deleteJourney: (key: string) =>
    greq<{ status: string }>("DELETE", `/api/admin/guide/journeys/${encodeURIComponent(key)}`),
  journeySteps: (key: string, country = "jp") =>
    greq<{ status: string; items: GuideJourneyStep[]; total: number }>(
      "GET", `/api/admin/guide/journeys/${encodeURIComponent(key)}/steps${qs({ country })}`),
  createStep: (key: string, body: Record<string, unknown>) =>
    greq<{ status: string; id: string; stepKey: string }>(
      "POST", `/api/admin/guide/journeys/${encodeURIComponent(key)}/steps`, body),
  updateStep: (stepId: string, body: Record<string, unknown>) =>
    greq<{ status: string; id: string }>("PATCH", `/api/admin/guide/journey-steps/${encodeURIComponent(stepId)}`, body),
  deleteStep: (stepId: string) =>
    greq<{ status: string }>("DELETE", `/api/admin/guide/journey-steps/${encodeURIComponent(stepId)}`),
  faq: (p: { categoryKey?: string; status?: string } = {}) =>
    greq<{ status: string; items: GuideFaq[]; total: number }>("GET", `/api/admin/guide/faq${qs(p)}`),
  faqItem: (id: string) =>
    greq<{ status: string; faq: GuideFaq }>("GET", `/api/admin/guide/faq/${encodeURIComponent(id)}`),
  createFaq: (body: Record<string, unknown>) =>
    greq<{ status: string; id: string }>("POST", "/api/admin/guide/faq", body),
  updateFaq: (id: string, body: Record<string, unknown>) =>
    greq<{ status: string; id: string }>("PATCH", `/api/admin/guide/faq/${encodeURIComponent(id)}`, body),
  deleteFaq: (id: string) =>
    greq<{ status: string }>("DELETE", `/api/admin/guide/faq/${encodeURIComponent(id)}`),
  homeModules: (p: { country?: string; language?: string } = {}) =>
    greq<{ status: string; items: GuideHomeModule[]; total: number }>("GET", `/api/admin/guide/home-modules${qs(p)}`),
  homeModule: (idOrKey: string) =>
    greq<{ status: string; module: GuideHomeModule }>(
      "GET", `/api/admin/guide/home-modules/${encodeURIComponent(idOrKey)}`),
  createHomeModule: (body: Record<string, unknown>) =>
    greq<{ status: string; id: string; moduleKey: string }>("POST", "/api/admin/guide/home-modules", body),
  updateHomeModule: (idOrKey: string, body: Record<string, unknown>) =>
    greq<{ status: string; id: string }>("PATCH", `/api/admin/guide/home-modules/${encodeURIComponent(idOrKey)}`, body),
  deleteHomeModule: (idOrKey: string) =>
    greq<{ status: string }>("DELETE", `/api/admin/guide/home-modules/${encodeURIComponent(idOrKey)}`),
  schools: (p: GuideListParams & { status?: string; verificationStatus?: string; export?: string; format?: string } = {}) =>
    greq<GuideAdminPaged<GuideSchool>>("GET", `/api/admin/guide/schools${qs({ ...p })}`),
  school: (idOrSlug: string) =>
    greq<{ status: string; school: GuideSchool; programs: GuideSchoolProgram[]; admissions: GuideSchoolAdmission[] }>(
      "GET", `/api/admin/guide/schools/${encodeURIComponent(idOrSlug)}`),
  createSchool: (body: Record<string, unknown>) =>
    greq<{ status: string; id: string; slug: string }>("POST", "/api/admin/guide/schools", body),
  updateSchool: (id: string, body: Record<string, unknown>) =>
    greq<{ status: string; id: string }>("PATCH", `/api/admin/guide/schools/${encodeURIComponent(id)}`, body),
  importSchools: (body: { items?: Record<string, unknown>[]; csv?: string; content?: string }) =>
    greq<{ status: string; created: Array<{ id: string; slug: string }>; errors: string[] }>(
      "POST", "/api/admin/guide/schools/import", body),
  companies: (p: GuideListParams & { status?: string; verificationStatus?: string; export?: string; format?: string } = {}) =>
    greq<GuideAdminPaged<GuideCompany>>("GET", `/api/admin/guide/companies${qs({ ...p })}`),
  company: (idOrSlug: string) =>
    greq<{ status: string; company: GuideCompany; positions: GuideCompanyPosition[]; workReviews: GuideCompanyReview[]; interviewReviews: GuideInterviewReview[] }>(
      "GET", `/api/admin/guide/companies/${encodeURIComponent(idOrSlug)}`),
  createCompany: (body: Record<string, unknown>) =>
    greq<{ status: string; id: string; slug: string }>("POST", "/api/admin/guide/companies", body),
  updateCompany: (id: string, body: Record<string, unknown>) =>
    greq<{ status: string; id: string }>("PATCH", `/api/admin/guide/companies/${encodeURIComponent(id)}`, body),
  importCompanies: (body: { items?: Record<string, unknown>[]; csv?: string; content?: string }) =>
    greq<{ status: string; created: Array<{ id: string; slug: string }>; errors: string[] }>(
      "POST", "/api/admin/guide/companies/import", body),
  schoolPrograms: (p: { schoolId?: string; status?: string } = {}) =>
    greq<GuideAdminPaged<GuideSchoolProgram>>("GET", `/api/admin/guide/school-programs${qs({ ...p })}`),
  schoolAdmissions: (p: { schoolId?: string; status?: string } = {}) =>
    greq<GuideAdminPaged<GuideSchoolAdmission>>("GET", `/api/admin/guide/school-admissions${qs({ ...p })}`),
  companyPositions: (p: { companyId?: string; status?: string } = {}) =>
    greq<GuideAdminPaged<GuideCompanyPosition>>("GET", `/api/admin/guide/company-positions${qs({ ...p })}`),
  interviewReviews: (p: { status?: string; keyword?: string; page?: number; pageSize?: number } = {}) =>
    greq<GuideAdminPaged<GuideInterviewReview>>("GET", `/api/admin/guide/interview-reviews${qs({ ...p })}`),
  companyReviews: (p: { status?: string; keyword?: string; page?: number; pageSize?: number } = {}) =>
    greq<GuideAdminPaged<GuideCompanyReview>>("GET", `/api/admin/guide/company-reviews${qs({ ...p })}`),
  corrections: (p: { status?: string; targetType?: string; page?: number; pageSize?: number } = {}) =>
    greq<GuideAdminPaged<Record<string, string>>>("GET", `/api/admin/guide/corrections${qs({ ...p })}`),
  reviewAction: (kind: "interview" | "company", id: string, action: "approve" | "reject" | "hide") =>
    greq<{ status: string; id: string; reviewStatus: string }>(
      "PATCH", `/api/admin/guide/${kind === "interview" ? "interview-reviews" : "company-reviews"}/${encodeURIComponent(id)}/${action}`, {}),
  updateCorrection: (id: string, status: "pending" | "reviewed" | "applied" | "rejected") =>
    greq<{ status: string; id: string; correctionStatus: string }>(
      "PATCH", `/api/admin/guide/corrections/${encodeURIComponent(id)}`, { status }),
  // ---- Guide products / orders / service requests (商品与服务后台) ----
  products: (p: Record<string, string | number | undefined> = {}) =>
    greq<GuideAdminPaged<GuideProduct>>("GET", `/api/admin/guide/products${qs(p)}`),
  product: (idOrSlug: string) =>
    greq<{ status: string; product: GuideProduct }>(
      "GET", `/api/admin/guide/products/${encodeURIComponent(idOrSlug)}`),
  createProduct: (body: Record<string, unknown>) =>
    greq<{ status: string; id: string; slug: string }>("POST", "/api/admin/guide/products", body),
  updateProduct: (id: string, body: Record<string, unknown>) =>
    greq<{ status: string; id: string }>("PATCH", `/api/admin/guide/products/${encodeURIComponent(id)}`, body),
  deleteProduct: (id: string) =>
    greq<{ status: string }>("DELETE", `/api/admin/guide/products/${encodeURIComponent(id)}`),
  orders: (p: Record<string, string | number | undefined> = {}) =>
    greq<GuideAdminPaged<GuideAdminOrder>>("GET", `/api/admin/guide/orders${qs(p)}`),
  updateOrder: (id: string, status: string) =>
    greq<{ status: string; id: string; orderStatus: string }>(
      "PATCH", `/api/admin/guide/orders/${encodeURIComponent(id)}`, { status }),
  serviceRequests: (p: Record<string, string | number | undefined> = {}) =>
    greq<GuideAdminPaged<GuideAdminServiceRequest>>("GET", `/api/admin/guide/service-requests${qs(p)}`),
  updateServiceRequest: (id: string, body: Record<string, unknown>) =>
    greq<{ status: string; id: string; requestStatus: string }>(
      "PATCH", `/api/admin/guide/service-requests/${encodeURIComponent(id)}`, body),
};

export interface GuideAdminOrder {
  id: string; orderNo: string; userId: string; userHandle: string; userDisplayName: string; userEmail: string;
  productId: string; productTitle: string; productSlug: string; productType: string; isService: boolean;
  price: number; currency: string; orderStatus: string; paymentProvider: string; paymentMethod: string;
  createdAt: string; paidAt: string | null; cancelledAt: string | null; refundedAt: string | null; fulfilledAt: string | null;
}

export interface GuideAdminServiceRequest {
  id: string; userId: string; userHandle: string; userDisplayName: string; userEmail: string;
  productId: string; productTitle: string; productSlug: string; productType: string;
  serviceType: string; contactMethod: string; contactValue: string; message: string;
  preferredTime: string; preferredDate: string; serviceCity: string; language: string;
  currentSituation: string; requestDetail: string; requestStatus: string; adminNote: string;
  orderId: string; assignedAdminId: string; isMember: boolean; createdAt: string; updatedAt: string;
}

// Product-type labels (zh) — keep in sync with backend product_type values.
export const GUIDE_PRODUCT_TYPE_LABELS: Record<string, string> = {
  pdf_material: "PDF 资料",
  template: "模板资料",
  checklist: "清单",
  course: "课程",
  consultation: "咨询服务",
  resume_review: "履历修改",
  research_plan_review: "研究计划书修改",
  language_school_support: "语言学校辅导",
  graduate_school_support: "大学院辅导",
  interview_coaching: "面试辅导",
  application_support: "申请辅导",
  career_support: "就职辅导",
  life_guide: "生活指南",
  member_resource: "会员资料",
  japan_tour_support: "旅游协助",
  disney_park_support: "迪士尼游园协助",
  airport_pickup: "机场接机",
  translation_call: "翻译/电话代打",
  part_time_job_support: "找打工协助",
  procedure_support: "手续协助",
  housing_support: "租房协助",
  bank_account_support: "银行卡办理协助",
  other_service: "其他服务",
};

export const GUIDE_CITY_LABELS: Record<string, string> = {
  tokyo: "东京",
  osaka: "大阪",
  kyoto: "京都",
  "": "日本全国",
};

export function guideCityLabel(city?: string | null): string {
  const k = String(city || "").trim().toLowerCase();
  return GUIDE_CITY_LABELS[k] ?? (city || "日本全国");
}

/** Whether a guide article is past its self-declared freshness window
 * (verifiedAt + staleAfterDays). Used to flag "需复核" on content cards so
 * policy/procedure info that may have changed is visibly marked. */
export function isGuideArticleStale(a: { verifiedAt?: string | null; staleAfterDays?: number }): boolean {
  if (!a.verifiedAt || !a.staleAfterDays || a.staleAfterDays <= 0) return false;
  const t = new Date(a.verifiedAt).getTime();
  if (Number.isNaN(t)) return false;
  return Date.now() > t + a.staleAfterDays * 86400000;
}
