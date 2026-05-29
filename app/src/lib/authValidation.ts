export const HANDLE_RE = /^[a-z0-9_]{2,24}$/;
export const EMAIL_RE = /^[^\s@]+@[^\s@.]+\.[^\s@.]+$/;
export const PASSWORD_MIN = 6;
export const DISPLAY_NAME_MAX = 32;

export type LoginErrors = Partial<Record<"handle" | "password", string>>;
export type RegisterErrors = Partial<Record<"handle" | "displayName" | "email" | "password" | "region", string>>;

export function normalizeHandle(value: string): string {
  return value.trim().replace(/^@+/, "").toLowerCase();
}

export function sanitizeRegisterHandle(value: string): string {
  return normalizeHandle(value).replace(/[^a-z0-9_]/g, "").slice(0, 24);
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
  values: { handle: string; displayName: string; email: string; password: string; hasRegion: boolean },
  touched: Partial<Record<keyof RegisterErrors, boolean>>,
): RegisterErrors {
  const e: RegisterErrors = {};
  if (touched.handle) {
    const handle = normalizeHandle(values.handle);
    if (!handle) e.handle = "请输入用户名";
    else if (!HANDLE_RE.test(handle)) e.handle = "只能用小写字母、数字和下划线，2–24 位";
  }
  if (touched.displayName) {
    const name = values.displayName.trim();
    if (!name) e.displayName = "请填写显示名称";
    else if (name.length > DISPLAY_NAME_MAX) e.displayName = `显示名称不超过 ${DISPLAY_NAME_MAX} 个字`;
  }
  if (touched.email && values.email && !EMAIL_RE.test(values.email.trim())) {
    e.email = "邮箱格式不正确";
  }
  if (touched.password) {
    if (!values.password) e.password = "请设置密码";
    else if (values.password.length < PASSWORD_MIN) e.password = `密码至少 ${PASSWORD_MIN} 位`;
  }
  if (touched.region && !values.hasRegion) e.region = "请选择你的城市";
  return e;
}

export function isRegisterValid(values: {
  handle: string;
  displayName: string;
  email: string;
  password: string;
  hasRegion: boolean;
}): boolean {
  const handle = normalizeHandle(values.handle);
  const name = values.displayName.trim();
  return (
    HANDLE_RE.test(handle) &&
    !!name &&
    name.length <= DISPLAY_NAME_MAX &&
    values.password.length >= PASSWORD_MIN &&
    values.hasRegion &&
    (!values.email || EMAIL_RE.test(values.email.trim()))
  );
}
