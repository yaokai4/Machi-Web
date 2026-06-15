export type MarketingCopyOverrideMap = Record<string, string>;

function cloneValue<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => cloneValue(item)) as T;
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      out[key] = cloneValue(nested);
    }
    return out as T;
  }
  return value;
}

function setByPath(target: unknown, path: string, value: string) {
  const parts = path.split(".").filter(Boolean);
  if (!parts.length) return;
  let cursor: unknown = target;
  for (let index = 0; index < parts.length - 1; index += 1) {
    if (cursor === null || cursor === undefined) return;
    const part = parts[index];
    const next = Array.isArray(cursor)
      ? cursor[Number(part)]
      : (cursor as Record<string, unknown>)[part];
    cursor = next;
  }
  const last = parts[parts.length - 1];
  if (Array.isArray(cursor)) {
    const numeric = Number(last);
    if (Number.isInteger(numeric) && numeric >= 0 && numeric < cursor.length) {
      cursor[numeric] = value;
    }
    return;
  }
  if (cursor && typeof cursor === "object" && Object.prototype.hasOwnProperty.call(cursor, last)) {
    (cursor as Record<string, unknown>)[last] = value;
  }
}

export function scopeMarketingCopyOverrides(
  overrides: MarketingCopyOverrideMap | undefined,
  prefix: string,
): MarketingCopyOverrideMap {
  const scoped: MarketingCopyOverrideMap = {};
  if (!overrides) return scoped;
  for (const [key, value] of Object.entries(overrides)) {
    if (key.startsWith(prefix)) {
      scoped[key.slice(prefix.length)] = value;
    }
  }
  return scoped;
}

export function applyMarketingCopyOverrides<T>(
  defaultCopy: T,
  overrides: MarketingCopyOverrideMap | undefined,
): T {
  const next = cloneValue(defaultCopy);
  for (const [path, value] of Object.entries(overrides || {})) {
    if (typeof value === "string") {
      setByPath(next, path, value);
    }
  }
  return next;
}

export function flattenMarketingCopyStrings(value: unknown, prefix = ""): MarketingCopyOverrideMap {
  if (typeof value === "string") {
    return prefix ? { [prefix]: value } : {};
  }
  if (!value || typeof value !== "object") return {};
  const out: MarketingCopyOverrideMap = {};
  const entries = Array.isArray(value)
    ? value.map((item, index) => [String(index), item] as const)
    : Object.entries(value as Record<string, unknown>);
  for (const [key, nested] of entries) {
    const nextPrefix = prefix ? `${prefix}.${key}` : key;
    Object.assign(out, flattenMarketingCopyStrings(nested, nextPrefix));
  }
  return out;
}
