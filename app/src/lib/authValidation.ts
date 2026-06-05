import type { AuthLocale } from "./authLocale";

export const HANDLE_RE = /^[a-z0-9_.]{3,20}$/;
export const EMAIL_RE = /^[^\s@]+@[^\s@.]+\.[^\s@.]+$/;
export const PASSWORD_MIN = 8;
export const DISPLAY_NAME_MAX = 32;
export const RESERVED_HANDLES = new Set([
  "admin",
  "administrator",
  "root",
  "machi",
  "machicity",
  "kaix",
  "official",
  "support",
  "help",
  "news",
]);

export type LoginErrors = Partial<Record<"handle" | "password", string>>;
export type RegisterErrors = Partial<Record<"handle" | "displayName" | "email" | "password" | "code" | "terms" | "region", string>>;

const V: Record<AuthLocale, Record<string, string>> = {
  zh: {
    handleRequired: "请输入用户名",
    passwordRequired: "请输入密码",
    invalidHandle: "只能用小写字母、数字、下划线和点，3-20 位",
    reservedHandle: "这个用户名不可使用",
    displayNameTooLong: `显示名称不超过 ${DISPLAY_NAME_MAX} 个字`,
    emailRequired: "请输入邮箱",
    invalidEmail: "邮箱格式不正确",
    passwordSetup: "请设置密码",
    passwordMin: `密码至少 ${PASSWORD_MIN} 位`,
    passwordLetters: "密码需同时包含字母和数字",
    confirmRequired: "请再次输入密码",
    passwordMismatch: "两次输入的密码不一致",
    codeRequired: "请输入邮箱验证码",
    termsRequired: "请先同意服务条款和隐私政策",
  },
  ja: {
    handleRequired: "ユーザー名を入力してください",
    passwordRequired: "パスワードを入力してください",
    invalidHandle: "小文字、数字、_、. の3-20文字で入力してください",
    reservedHandle: "このユーザー名は使用できません",
    displayNameTooLong: `表示名は ${DISPLAY_NAME_MAX} 文字以内です`,
    emailRequired: "メールアドレスを入力してください",
    invalidEmail: "メールアドレスの形式が正しくありません",
    passwordSetup: "パスワードを設定してください",
    passwordMin: `パスワードは ${PASSWORD_MIN} 文字以上です`,
    passwordLetters: "パスワードには英字と数字を含めてください",
    confirmRequired: "パスワードをもう一度入力してください",
    passwordMismatch: "パスワードが一致しません",
    codeRequired: "メール認証コードを入力してください",
    termsRequired: "利用規約とプライバシーポリシーに同意してください",
  },
  en: {
    handleRequired: "Enter a username",
    passwordRequired: "Enter your password",
    invalidHandle: "Use lowercase letters, numbers, underscores, and dots, 3-20 chars",
    reservedHandle: "This username cannot be used",
    displayNameTooLong: `Display name must be ${DISPLAY_NAME_MAX} chars or fewer`,
    emailRequired: "Enter your email",
    invalidEmail: "Email format is invalid",
    passwordSetup: "Set a password",
    passwordMin: `Password must be at least ${PASSWORD_MIN} chars`,
    passwordLetters: "Password must include letters and numbers",
    confirmRequired: "Confirm your password",
    passwordMismatch: "Passwords do not match",
    codeRequired: "Enter the email code",
    termsRequired: "Please agree to the Terms and Privacy Policy",
  },
};

export function normalizeHandle(value: string): string {
  return value.trim().replace(/^@+/, "").toLowerCase();
}

export function sanitizeRegisterHandle(value: string): string {
  return normalizeHandle(value).replace(/[^a-z0-9_.]/g, "").slice(0, 20);
}

export function validateLogin(
  values: { handle: string; password: string },
  touched: { handle: boolean; password: boolean },
  locale: AuthLocale = "zh",
): LoginErrors {
  const e: LoginErrors = {};
  const v = V[locale] || V.zh;
  if (touched.handle && !normalizeHandle(values.handle)) e.handle = v.handleRequired;
  if (touched.password && !values.password) e.password = v.passwordRequired;
  return e;
}

export function validateRegister(
  values: { handle: string; displayName: string; email: string; password: string; confirmPassword?: string; code?: string; acceptedTerms?: boolean; hasRegion: boolean },
  touched: Partial<Record<keyof RegisterErrors, boolean>>,
  locale: AuthLocale = "zh",
): RegisterErrors {
  const e: RegisterErrors = {};
  const v = V[locale] || V.zh;
  if (touched.handle) {
    const handle = normalizeHandle(values.handle);
    if (!handle) e.handle = v.handleRequired;
    else if (!HANDLE_RE.test(handle)) e.handle = v.invalidHandle;
    else if (RESERVED_HANDLES.has(handle)) e.handle = v.reservedHandle;
  }
  if (touched.displayName) {
    const name = values.displayName.trim();
    if (name.length > DISPLAY_NAME_MAX) e.displayName = v.displayNameTooLong;
  }
  if (touched.email) {
    if (!values.email.trim()) e.email = v.emailRequired;
    else if (!EMAIL_RE.test(values.email.trim())) e.email = v.invalidEmail;
  }
  if (touched.password) {
    if (!values.password) e.password = v.passwordSetup;
    else if (values.password.length < PASSWORD_MIN) e.password = v.passwordMin;
    else if (!/[A-Za-z]/.test(values.password) || !/\d/.test(values.password)) e.password = v.passwordLetters;
    else if (values.confirmPassword !== undefined && !values.confirmPassword) e.password = v.confirmRequired;
    else if (values.confirmPassword !== undefined && values.confirmPassword && values.confirmPassword !== values.password) e.password = v.passwordMismatch;
  }
  if (touched.code && (!values.code || values.code.trim().length < 4)) e.code = v.codeRequired;
  if (touched.terms && !values.acceptedTerms) e.terms = v.termsRequired;
  return e;
}

export function isRegisterValid(values: {
  handle: string;
  displayName: string;
  email: string;
  password: string;
  confirmPassword?: string;
  code?: string;
  acceptedTerms?: boolean;
  hasRegion: boolean;
}): boolean {
  const handle = normalizeHandle(values.handle);
  const name = values.displayName.trim();
  return (
    HANDLE_RE.test(handle) &&
    !RESERVED_HANDLES.has(handle) &&
    name.length <= DISPLAY_NAME_MAX &&
    values.password.length >= PASSWORD_MIN &&
    /[A-Za-z]/.test(values.password) &&
    /\d/.test(values.password) &&
    (values.confirmPassword === undefined || values.confirmPassword === values.password) &&
    EMAIL_RE.test(values.email.trim()) &&
    !!values.code?.trim() &&
    values.code.trim().length >= 4 &&
    values.acceptedTerms !== false
  );
}
