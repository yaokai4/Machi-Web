// Machi Guide / 日本指南 — typed client for the unified /api/guide surface.
//
// This is intentionally a standalone module (not part of the big `api`
// object) so the Guide refactor stays additive and isolated. It reuses the
// shared token + base URL + error type from ./api. Web and iOS consume the
// SAME endpoints and the SAME category keys — the taxonomy is server-driven.

import { apiBase, readToken, APIError } from "./api";

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
  sortOrder: number;
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
  tags: string[];
  authorType: string;
  authorName: string;
  isFeatured: boolean;
  isFree: boolean;
  isPaid: boolean;
  status: string;
  viewCount: number;
  saveCount: number;
  publishedAt: string | null;
  updatedAt: string | null;
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

const GUIDE_TIMEOUT_MS = 12_000;

async function greq<T>(method: string, path: string, body?: unknown): Promise<T> {
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
      }, GUIDE_TIMEOUT_MS)
    : null;
  let res: Response;
  try {
    res = await fetch(`${apiBase}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "omit",
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

export const guide = {
  home: (country = "jp", language = "zh-CN") =>
    greq<GuideHomeResponse>("GET", `/api/guide/home${qs({ country, language })}`),
  categories: (country = "jp", language = "zh-CN") =>
    greq<{ status: GuideStatus; country: string; categories: GuideCategory[] }>(
      "GET", `/api/guide/categories${qs({ country, language })}`),
  articles: (p: GuideListParams = {}) =>
    greq<GuidePaged<GuideArticle>>("GET", `/api/guide/articles${qs({ ...p })}`),
  article: (idOrSlug: string, country = "jp", language = "zh-CN") =>
    greq<{ status: GuideStatus; article: GuideArticle; related: GuideArticle[] }>(
      "GET", `/api/guide/articles/${encodeURIComponent(idOrSlug)}${qs({ country, language })}`),
  products: (p: GuideListParams = {}) =>
    greq<GuidePaged<GuideProduct>>("GET", `/api/guide/products${qs({ ...p })}`),
  memberResources: (p: GuideListParams = {}) =>
    greq<GuidePaged<GuideProduct> & { membershipActive?: boolean; disclaimer?: string }>(
      "GET", `/api/guide/member-resources${qs({ ...p })}`),
  product: (idOrSlug: string, country = "jp", language = "zh-CN") =>
    greq<{ status: GuideStatus; product: GuideProduct }>(
      "GET", `/api/guide/products/${encodeURIComponent(idOrSlug)}${qs({ country, language })}`),
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
  purchase: (idOrSlug: string) =>
    greq<{ status: string; message: string; orderId?: string }>(
      "POST", `/api/guide/products/${encodeURIComponent(idOrSlug)}/purchase`, {}),
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
};

export const adminGuide = {
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
