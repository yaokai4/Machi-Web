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
  status: "idle" | "loading" | "authed" | "unauthed";
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

export type AuthPromptKind = "generic" | "like" | "bookmark" | "comment" | "follow" | "message" | "publish";

export interface AuthPromptCopy {
  title: string;
  body: string;
}

export const AUTH_PROMPT_COPY: Record<AuthPromptKind, AuthPromptCopy> = {
  generic: {
    title: "登录后继续",
    body: "登录后可以发布内容、评论、收藏、关注和使用更多 Machi 功能。",
  },
  like: {
    title: "登录后点赞",
    body: "登录后可以点赞、收藏和参与城市讨论。",
  },
  bookmark: {
    title: "登录后收藏",
    body: "登录后可以保存租房、资讯、攻略和本地生活信息。",
  },
  comment: {
    title: "登录后评论",
    body: "登录后可以参与讨论，分享你的经验和问题。",
  },
  follow: {
    title: "登录后关注",
    body: "登录后可以关注你感兴趣的城市账号和本地用户。",
  },
  message: {
    title: "登录后发送私信",
    body: "登录后可以和对方联系。",
  },
  publish: {
    title: "登录后发布",
    body: "登录后可以发布本地动态、租房、二手、工作、本地小组和生活经验。",
  },
};

interface AuthPromptState {
  prompt: AuthPromptCopy | null;
  open: (input?: AuthPromptKind | Partial<AuthPromptCopy> & { kind?: AuthPromptKind }) => void;
  close: () => void;
}

export const useAuthPrompt = create<AuthPromptState>((set) => ({
  prompt: null,
  open: (input = "generic") => {
    const next =
      typeof input === "string"
        ? AUTH_PROMPT_COPY[input]
        : { ...AUTH_PROMPT_COPY[input.kind ?? "generic"], ...input };
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
  appearance: "light" | "dark";
  settings: KXSettings | null;
  setAppearance: (value: SettingsState["appearance"]) => void;
  setSettings: (settings: KXSettings | null) => void;
}

export const useSettings = create<SettingsState>((set) => ({
  appearance: "light",
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
