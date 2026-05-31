export const HANDLE_RE = /^[a-z0-9_]{3,20}$/;
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

export function normalizeHandle(value: string): string {
  return value.trim().replace(/^@+/, "").toLowerCase();
}

export function sanitizeRegisterHandle(value: string): string {
  return normalizeHandle(value).replace(/[^a-z0-9_.]/g, "").slice(0, 20);
}

export function validateLogin(
  values: { handle: string; password: string },
  touched: { handle: boolean; password: boolean },
): LoginErrors {
  const e: LoginErrors = {};
  if (touched.handle && !normalizeHandle(values.handle)) e.handle = "请输入用户名";
  if (touched.password && !values.password) e.password = "请输入密码";
  return e;
}

export function validateRegister(
  values: { handle: string; displayName: string; email: string; password: string; confirmPassword?: string; code?: string; acceptedTerms?: boolean; hasRegion: boolean },
  touched: Partial<Record<keyof RegisterErrors, boolean>>,
): RegisterErrors {
  const e: RegisterErrors = {};
  if (touched.handle) {
    const handle = normalizeHandle(values.handle);
    if (!handle) e.handle = "请输入用户名";
    else if (!HANDLE_RE.test(handle)) e.handle = "只能用小写字母、数字、下划线和点，3–20 位";
    else if (RESERVED_HANDLES.has(handle)) e.handle = "这个用户名不可使用";
  }
  if (touched.displayName) {
    const name = values.displayName.trim();
    if (name.length > DISPLAY_NAME_MAX) e.displayName = `显示名称不超过 ${DISPLAY_NAME_MAX} 个字`;
  }
  if (touched.email) {
    if (!values.email.trim()) e.email = "请输入邮箱";
    else if (!EMAIL_RE.test(values.email.trim())) e.email = "邮箱格式不正确";
  }
  if (touched.password) {
    if (!values.password) e.password = "请设置密码";
    else if (values.password.length < PASSWORD_MIN) e.password = `密码至少 ${PASSWORD_MIN} 位`;
    else if (!/[A-Za-z]/.test(values.password) || !/\d/.test(values.password)) e.password = "密码需同时包含字母和数字";
    else if (values.confirmPassword !== undefined && !values.confirmPassword) e.password = "请再次输入密码";
    else if (values.confirmPassword !== undefined && values.confirmPassword && values.confirmPassword !== values.password) e.password = "两次输入的密码不一致";
  }
  if (touched.code && (!values.code || values.code.trim().length < 4)) e.code = "请输入邮箱验证码";
  if (touched.terms && !values.acceptedTerms) e.terms = "请先同意服务条款和隐私政策";
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
