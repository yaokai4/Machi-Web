"use client";

import { create } from "zustand";
import { persist, createJSONStorage, type StateStorage } from "zustand/middleware";
import type { ContentLanguage, ContentType, KXSettings, KXUser } from "./types";

/// SSR-safe localStorage shim. zustand `persist` will call into the
/// storage during hydration which Next.js sometimes triggers on the
/// server (e.g. during streamed RSC -> client transitions). Plain
/// `localStorage` throws there, so we route through this guard
/// instead.
const safeLocalStorage: StateStorage = {
  getItem: (name) => {
    if (typeof window === "undefined") return null;
    try { return window.localStorage.getItem(name); } catch { return null; }
  },
  setItem: (name, value) => {
    if (typeof window === "undefined") return;
    try { window.localStorage.setItem(name, value); } catch { /* quota / private mode */ }
  },
  removeItem: (name) => {
    if (typeof window === "undefined") return;
    try { window.localStorage.removeItem(name); } catch { /* noop */ }
  },
};

interface SessionState {
  user: KXUser | null;
  // "degraded" = the session probe failed for a NON-auth reason (429/5xx/network).
  // We don't know if the user is logged in, so we must not treat them as logged
  // out (which would bounce protected routes to /login). Distinct from "unauthed",
  // which is only ever set on an explicit 401/403.
  status: "idle" | "loading" | "authed" | "unauthed" | "degraded";
  setUser: (user: KXUser | null) => void;
  setStatus: (status: SessionState["status"]) => void;
}

export const useSession = create<SessionState>((set) => ({
  user: null,
  status: "idle",
  setUser: (user) => set({ user, status: user ? "authed" : "unauthed" }),
  setStatus: (status) => set({ status }),
}));

interface ToastEntry {
  id: string;
  kind: "info" | "success" | "error";
  message: string;
}

interface ToastState {
  toasts: ToastEntry[];
  push: (toast: Omit<ToastEntry, "id">) => void;
  dismiss: (id: string) => void;
}

export const useToasts = create<ToastState>((set) => ({
  toasts: [],
  push: (toast) => {
    const id = Math.random().toString(36).slice(2);
    set((state) => ({ toasts: [...state.toasts, { ...toast, id }] }));
    setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
    }, 2800);
  },
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}));

export type AuthPromptKind = "generic" | "like" | "bookmark" | "comment" | "follow" | "message" | "publish" | "saveSearch";

// i18n key pairs per prompt kind. The actual localized strings live in
// i18n.tsx (auth_prompt_*_title / auth_prompt_*_body); the dialog resolves them
// with `t()` at render so the copy follows the user's language. Optional
// literal overrides (`title` / `body`) still win when provided.
export const AUTH_PROMPT_KEYS: Record<AuthPromptKind, { titleKey: string; bodyKey: string }> = {
  generic: { titleKey: "auth_prompt_generic_title", bodyKey: "auth_prompt_generic_body" },
  like: { titleKey: "auth_prompt_like_title", bodyKey: "auth_prompt_like_body" },
  bookmark: { titleKey: "auth_prompt_bookmark_title", bodyKey: "auth_prompt_bookmark_body" },
  comment: { titleKey: "auth_prompt_comment_title", bodyKey: "auth_prompt_comment_body" },
  follow: { titleKey: "auth_prompt_follow_title", bodyKey: "auth_prompt_follow_body" },
  message: { titleKey: "auth_prompt_message_title", bodyKey: "auth_prompt_message_body" },
  publish: { titleKey: "auth_prompt_publish_title", bodyKey: "auth_prompt_publish_body" },
  saveSearch: { titleKey: "auth_prompt_saveSearch_title", bodyKey: "auth_prompt_saveSearch_body" },
};

export interface AuthPromptState_Prompt {
  kind: AuthPromptKind;
  // Optional literal overrides; when set they take precedence over the keyed
  // copy (used for one-off custom prompts).
  title?: string;
  body?: string;
}

interface AuthPromptState {
  prompt: AuthPromptState_Prompt | null;
  open: (input?: AuthPromptKind | (Partial<Omit<AuthPromptState_Prompt, "kind">> & { kind?: AuthPromptKind })) => void;
  close: () => void;
}

export const useAuthPrompt = create<AuthPromptState>((set) => ({
  prompt: null,
  open: (input = "generic") => {
    const next: AuthPromptState_Prompt =
      typeof input === "string"
        ? { kind: input }
        : { kind: input.kind ?? "generic", title: input.title, body: input.body };
    set({ prompt: next });
  },
  close: () => set({ prompt: null }),
}));

interface ComposeState {
  isOpen: boolean;
  draftId: string | null;
  initialContent: string;
  initialTags: string[];
  initialMediaIds: string[];
  /// Pre-selected content type — set by ChannelEmptyState / channel
  /// shortcut so the composer opens in the right form.
  initialContentType: ContentType | null;
  open: (opts?: { initialContent?: string; initialTags?: string[]; initialMediaIds?: string[]; draftId?: string | null; initialContentType?: ContentType | null }) => void;
  /// Adopt the server-assigned draft id after the first autosave so
  /// subsequent autosaves upsert the SAME row instead of creating dupes.
  setDraftId: (id: string | null) => void;
  close: () => void;
}

export const useCompose = create<ComposeState>((set) => ({
  isOpen: false,
  draftId: null,
  initialContent: "",
  initialTags: [],
  initialMediaIds: [],
  initialContentType: null,
  open: (opts) =>
    set({
      isOpen: true,
      draftId: opts?.draftId ?? null,
      initialContent: opts?.initialContent ?? "",
      initialTags: opts?.initialTags ?? [],
      initialMediaIds: opts?.initialMediaIds ?? [],
      initialContentType: opts?.initialContentType ?? null,
    }),
  setDraftId: (id) => set({ draftId: id }),
  close: () =>
    set({
      isOpen: false,
      draftId: null,
      initialContent: "",
      initialTags: [],
      initialMediaIds: [],
      initialContentType: null,
    }),
}));

interface SettingsState {
  // "system" follows the OS colour scheme; it is a client-only preference
  // (the server KXSettings enum is still light|dark). ThemeBridge resolves
  // "system" to an effective light/dark for the <html> class.
  appearance: "light" | "dark" | "system";
  settings: KXSettings | null;
  setAppearance: (value: SettingsState["appearance"]) => void;
  setSettings: (settings: KXSettings | null) => void;
}

export const useSettings = create<SettingsState>((set) => ({
  // Default to "system" so a fresh load never spuriously persists "light"
  // before ThemeBridge hydrates the real stored/OS preference. The pre-paint
  // script in layout.tsx has already set the correct <html> class by now.
  appearance: "system",
  settings: null,
  setAppearance: (appearance) => set({ appearance }),
  setSettings: (settings) => set({ settings }),
}));

// MARK: - LanguageManager
//
// Mirrors iOS `LanguageManager`. Persisted to localStorage so the
// preference survives a refresh. `preferred` is the user's primary
// content-language choice; `fallbacks` are languages they're willing to
// see when there's not enough primary content.
interface LanguageState {
  preferred: ContentLanguage;
  fallbacks: ContentLanguage[];
  setPreferred: (value: ContentLanguage) => void;
  toggleFallback: (value: ContentLanguage) => void;
  reset: () => void;
}

export const useLanguagePreference = create<LanguageState>()(
  persist(
    (set) => ({
      preferred: "followApp",
      fallbacks: [],
      setPreferred: (value) => set({ preferred: value }),
      toggleFallback: (value) =>
        set((state) => ({
          fallbacks: state.fallbacks.includes(value)
            ? state.fallbacks.filter((v) => v !== value)
            : [...state.fallbacks, value],
        })),
      reset: () => set({ preferred: "followApp", fallbacks: [] }),
    }),
    {
      name: "kaix.contentLanguage",
      storage: createJSONStorage(() => safeLocalStorage),
    },
  ),
);

// MARK: - Recent ContentType picker memory (used by Composer)
interface ComposerRecentState {
  recentTypes: ContentType[];
  push: (type: ContentType) => void;
}

export const useComposerRecent = create<ComposerRecentState>()(
  persist(
    (set, get) => ({
      recentTypes: [],
      push: (type) => {
        const next = [type, ...get().recentTypes.filter((t) => t !== type)].slice(0, 6);
        set({ recentTypes: next });
      },
    }),
    {
      name: "kaix.composer.recent",
      storage: createJSONStorage(() => safeLocalStorage),
    },
  ),
);
