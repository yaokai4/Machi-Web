"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  Building2,
  Check,
  Clock,
  Copy,
  FileText,
  GraduationCap,
  HelpCircle,
  Moon,
  Plus,
  Send,
  ThumbsDown,
  ThumbsUp,
  Trash2,
} from "lucide-react";
import { MachiAIMark, MachiAIGlyph } from "@/components/brand/MachiAIMark";
import { guide, type GuideAIConversation, type GuideAISource, type GuideAISuggestion } from "@/lib/guide";
import { APIError } from "@/lib/api";
import { GuideShell } from "@/components/guide/GuideKit";
import { useAuthPrompt, useSession, useToasts } from "@/lib/store";
import { appLocaleToGuideLanguage, useI18n } from "@/lib/i18n";

type Role = "user" | "assistant";
type LocalMessage = {
  id: string;
  role: Role;
  content: string;
  pending?: boolean;
  failed?: boolean;
  sources?: GuideAISource[];
};

function pick(locale: string, zh: string, ja: string, en: string): string {
  if (locale.startsWith("ja")) return ja;
  if (locale.startsWith("en")) return en;
  return zh;
}

function newId() {
  return `m_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
}

// Lightweight Markdown render for Machi AI answers (no deps): headings,
// bullet / numbered lists, and inline **bold**. Anything else renders as a
// paragraph, so raw `###` / `**` markers never leak into the bubble.
function inlineMd(s: string): React.ReactNode[] {
  return s.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    /^\*\*[^*]+\*\*$/.test(part) ? (
      <strong key={i} className="font-bold">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

function MachiMarkdown({ content }: { content: string }) {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const out: React.ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let key = 0;
  const flush = () => {
    if (!list) return;
    const items = list.items.map((it, i) => (
      <li key={i} className="leading-7">
        {inlineMd(it)}
      </li>
    ));
    out.push(
      list.ordered ? (
        <ol key={`b${key++}`} className="ml-5 list-decimal space-y-0.5 marker:font-bold marker:text-kx-accent">
          {items}
        </ol>
      ) : (
        <ul key={`b${key++}`} className="ml-5 list-disc space-y-0.5 marker:text-kx-accent">
          {items}
        </ul>
      ),
    );
    list = null;
  };
  for (const raw of lines) {
    const t = raw.trim();
    const h = /^#{1,4}\s+(.*)$/.exec(t);
    const ul = /^[-*•]\s+(.*)$/.exec(t);
    const ol = /^\d+[.)]\s+(.*)$/.exec(t);
    if (h) {
      flush();
      out.push(
        <p key={`b${key++}`} className="font-bold text-kx-text">
          {inlineMd(h[1])}
        </p>,
      );
    } else if (ul) {
      if (!list || list.ordered) {
        flush();
        list = { ordered: false, items: [] };
      }
      list.items.push(ul[1]);
    } else if (ol) {
      if (!list || !list.ordered) {
        flush();
        list = { ordered: true, items: [] };
      }
      list.items.push(ol[1]);
    } else if (!t) {
      flush();
    } else {
      flush();
      out.push(
        <p key={`b${key++}`} className="leading-7">
          {inlineMd(t)}
        </p>,
      );
    }
  }
  flush();
  return <div className="space-y-2">{out}</div>;
}

function sourceHref(s: GuideAISource): string | null {
  const kind = (s.route?.kind || s.type || "").toLowerCase();
  if (kind.includes("article") && s.route?.slug) return `/guide/articles/${encodeURIComponent(s.route.slug)}`;
  if (kind.includes("product") && s.route?.slug) return `/guide/products/${encodeURIComponent(s.route.slug)}`;
  if (kind.includes("school") && s.route?.id) return `/guide/schools/${encodeURIComponent(s.route.id)}`;
  if (kind.includes("company") && s.route?.id) return `/guide/companies/${encodeURIComponent(s.route.id)}`;
  return null;
}

function SourceIcon({ kind }: { kind: string }) {
  const k = kind.toLowerCase();
  if (k.includes("school")) return <GraduationCap className="h-3.5 w-3.5" />;
  if (k.includes("company")) return <Building2 className="h-3.5 w-3.5" />;
  if (k.includes("product")) return <FileText className="h-3.5 w-3.5" />;
  if (k.includes("faq")) return <HelpCircle className="h-3.5 w-3.5" />;
  return <BookOpen className="h-3.5 w-3.5" />;
}

export default function GuideAIChatClient() {
  const { locale } = useI18n();
  const language = appLocaleToGuideLanguage(locale);
  const user = useSession((s) => s.user);
  const status = useSession((s) => s.status);
  // Only a *confirmed* guest sees the sign-in wall. While the session is still
  // loading or the probe is "degraded" (transient 5xx/429/network — the user may
  // well be logged in), keep the composer available; the server still enforces
  // auth via require_user. This stops a real member from being walled out on a
  // flaky probe.
  const isGuest = status === "unauthed";
  const openAuthPrompt = useAuthPrompt((s) => s.open);
  const pushToast = useToasts((s) => s.push);

  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<GuideAISuggestion[]>([]);
  const [disclaimer, setDisclaimer] = useState<string>("");
  const [membershipActive, setMembershipActive] = useState(false);
  const [remainingFreeUses, setRemainingFreeUses] = useState<number | null>(null);
  const [quotaReached, setQuotaReached] = useState(false);
  const [quotaMessage, setQuotaMessage] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [conversations, setConversations] = useState<GuideAIConversation[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const lastFailedText = useRef<string | null>(null);

  const country = "jp";

  const refreshConversations = useCallback(async () => {
    try {
      const res = await guide.aiConversations(30);
      setConversations(res.items || []);
    } catch {
      /* non-fatal */
    }
  }, []);

  // Bootstrap once for a logged-in user.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await guide.aiBootstrap(country, language);
        if (cancelled) return;
        setMembershipActive(Boolean(res.membershipActive));
        setRemainingFreeUses(res.membershipActive ? null : res.remainingFreeUses ?? null);
        setSuggestions(res.suggestions || []);
        if (res.disclaimer) setDisclaimer(res.disclaimer);
        setQuotaReached(!res.membershipActive && (res.remainingFreeUses ?? 1) <= 0);
      } catch {
        /* non-fatal — composer still works */
      }
      refreshConversations();
    })();
    return () => {
      cancelled = true;
    };
  }, [user, language, refreshConversations]);

  // Prefill from a deep link (?q=…) so the Guide-home hero / suggestion chips
  // can hand a question straight into the composer (focused, not auto-sent — the
  // user taps send, so guests aren't surprised and quota isn't spent silently).
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("q");
    if (q && q.trim()) {
      setInput(q.trim());
      requestAnimationFrame(() => {
        textareaRef.current?.focus();
        autoGrow();
      });
      // Strip ?q= from the URL so a refresh / back navigation doesn't re-inject it.
      window.history.replaceState(null, "", window.location.pathname);
    }
    // run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-scroll to the latest message.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  const autoGrow = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, []);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || sending) return;
      if (isGuest) {
        openAuthPrompt("generic");
        return;
      }
      setErrorMessage("");
      const userMsg: LocalMessage = { id: newId(), role: "user", content: trimmed };
      const pendingId = newId();
      setMessages((prev) => [...prev, userMsg, { id: pendingId, role: "assistant", content: "", pending: true }]);
      setSending(true);
      try {
        const res = await guide.aiChat({ conversationId, message: trimmed, country, language });
        setConversationId(res.conversationId ?? conversationId);
        if (res.usage) {
          setMembershipActive(Boolean(res.usage.membershipActive));
          setRemainingFreeUses(res.usage.membershipActive ? null : res.usage.remainingFreeUses ?? null);
          setQuotaReached(!res.usage.membershipActive && (res.usage.remainingFreeUses ?? 1) <= 0);
        }
        const m = res.message;
        if (!m || !(m.content && m.content.trim())) {
          // 200 OK but no usable answer → surface an error instead of an empty
          // assistant bubble (silent data loss); keep the turn retryable.
          lastFailedText.current = trimmed;
          setMessages((prev) =>
            prev
              .filter((msg) => msg.id !== pendingId)
              .map((msg) => (msg.id === userMsg.id ? { ...msg, failed: true } : msg)),
          );
          setErrorMessage(
            pick(
              locale,
              "Machi AI 暂时无法回答，请稍后再试。",
              "Machi AI は現在応答できません。しばらくしてから再度お試しください。",
              "Machi AI is temporarily unavailable. Please try again shortly.",
            ),
          );
          return;
        }
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === pendingId
              ? { id: m.id || pendingId, role: "assistant", content: m.content, sources: m.sources || [] }
              : msg,
          ),
        );
        refreshConversations();
      } catch (err) {
        lastFailedText.current = trimmed;
        setMessages((prev) =>
          prev
            .filter((msg) => msg.id !== pendingId)
            .map((msg) => (msg.id === userMsg.id ? { ...msg, failed: true } : msg)),
        );
        if (err instanceof APIError && err.code === "AI_QUOTA_EXCEEDED") {
          setQuotaReached(true);
          setQuotaMessage(err.message);
          if (!membershipActive) setRemainingFreeUses(0);
        } else if (err instanceof APIError) {
          setErrorMessage(err.message);
        } else {
          setErrorMessage(pick(locale, "网络好像不太稳定，请稍后再试。", "通信が不安定なようです。少し待って再度お試しください。", "The connection seems unstable. Please try again shortly."));
        }
      } finally {
        setSending(false);
      }
    },
    [conversationId, language, locale, membershipActive, openAuthPrompt, refreshConversations, sending, isGuest],
  );

  const onSubmit = useCallback(() => {
    const text = input.trim();
    if (!text) return;
    setInput("");
    requestAnimationFrame(autoGrow);
    send(text);
  }, [autoGrow, input, send]);

  const retry = useCallback(() => {
    const text = lastFailedText.current;
    if (!text) return;
    lastFailedText.current = null;
    setErrorMessage("");
    setMessages((prev) => {
      const idx = [...prev].reverse().findIndex((m) => m.role === "user" && m.failed);
      if (idx === -1) return prev;
      const realIdx = prev.length - 1 - idx;
      return prev.filter((_, i) => i !== realIdx);
    });
    send(text);
  }, [send]);

  const startNew = useCallback(() => {
    setConversationId(null);
    setMessages([]);
    setQuotaMessage("");
    setQuotaReached(!membershipActive && (remainingFreeUses ?? 1) <= 0);
    setErrorMessage("");
    setShowHistory(false);
  }, [membershipActive, remainingFreeUses]);

  const openConversation = useCallback(async (id: string) => {
    setShowHistory(false);
    try {
      const res = await guide.aiMessages(id);
      setConversationId(res.conversation?.id || id);
      setMessages(
        (res.items || []).map((dto) => ({
          id: dto.id,
          role: dto.role === "user" ? "user" : "assistant",
          content: dto.content,
          sources: dto.sources || [],
        })),
      );
    } catch {
      setErrorMessage(pick(locale, "对话加载失败。", "会話の読み込みに失敗しました。", "Could not load the conversation."));
    }
  }, [locale]);

  const deleteConversation = useCallback(
    async (id: string) => {
      try {
        await guide.aiDeleteConversation(id);
        setConversations((prev) => prev.filter((c) => c.id !== id));
        if (conversationId === id) startNew();
      } catch {
        /* ignore */
      }
    },
    [conversationId, startNew],
  );

  const submitFeedback = useCallback(
    (messageId: string, rating: "helpful" | "not_helpful") => {
      guide.aiFeedback(messageId, rating).catch(() => undefined);
      pushToast({ kind: "success", message: pick(locale, "感谢反馈", "フィードバックありがとうございます", "Thanks for the feedback") });
    },
    [locale, pushToast],
  );

  const copy = useCallback(
    (text: string) => {
      navigator.clipboard?.writeText(text).then(
        () => pushToast({ kind: "success", message: pick(locale, "已复制", "コピーしました", "Copied") }),
        () => undefined,
      );
    },
    [locale, pushToast],
  );

  const promptChips = useMemo(
    () =>
      locale.startsWith("ja")
        ? [
            "来日初週は何を手続きする？",
            "賃貸の初期費用はどう見る？",
            "留学生バイトの注意点は？",
            "大学院出願の第一歩は？",
            "日本企業の面接でよく聞かれる？",
            "履歴書と職務経歴書の違いは？",
            "ビザ更新前に何を準備する？",
            "Machi Guide はどう使う？",
          ]
        : locale.startsWith("en")
          ? [
              "What to set up in my first week in Japan?",
              "How do move-in costs work when renting?",
              "Part-time work tips for students?",
              "First step to apply for grad school?",
              "Common Japanese job-interview questions?",
              "Rirekisho vs shokumu-keirekisho?",
              "What to prepare before a visa renewal?",
              "How do I use Machi Guide?",
            ]
          : [
              "刚来日本第一周要办什么？",
              "租房初期费用怎么看？",
              "留学生找兼职要注意什么？",
              "大学院申请第一步做什么？",
              "日企面试常见问题有哪些？",
              "履历书和职务经歴書有什么区别？",
              "签证更新前要准备什么？",
              "Machi Guide 怎么用？",
            ],
    [locale],
  );

  const canSend = input.trim().length > 0 && !sending && !quotaReached;

  return (
    <GuideShell back={{ href: "/guide", label: "Machi AI" }}>
      <div className="mx-auto flex min-h-[78dvh] w-full max-w-3xl flex-col px-3 sm:px-5">
        {/* Header */}
        <div className="sticky top-0 z-20 -mx-3 flex items-center gap-3 border-b border-kx-stroke/40 bg-kx-card/80 px-3 py-3 backdrop-blur-md sm:-mx-5 sm:px-5">
          <Avatar size={38} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-base font-black tracking-[-0.01em] text-kx-text">Machi AI</h1>
              <span className="rounded-full bg-kx-accentSoft px-1.5 py-0.5 text-[9px] font-black uppercase tracking-[0.1em] text-kx-accent">
                Beta
              </span>
            </div>
            <p className="truncate text-[11px] font-semibold text-kx-muted">
              {pick(locale, "日本生活・升学・就职助手", "日本生活・進学・就職アシスタント", "Japan life, study & career assistant")}
            </p>
          </div>
          <button
            type="button"
            onClick={startNew}
            className="inline-flex h-9 items-center gap-1 rounded-full border border-kx-stroke/50 bg-kx-card px-3 text-xs font-bold text-kx-text transition hover:border-kx-accent/40 hover:text-kx-accent"
          >
            <Plus className="h-3.5 w-3.5" /> {pick(locale, "新对话", "新規", "New")}
          </button>
          <button
            type="button"
            onClick={() => setShowHistory((v) => !v)}
            aria-label={pick(locale, "历史会话", "履歴", "History")}
            className={
              "grid h-9 w-9 place-items-center rounded-full border transition " +
              (showHistory
                ? "border-kx-accent/50 bg-kx-accentSoft text-kx-accent"
                : "border-kx-stroke/50 bg-kx-card text-kx-muted hover:text-kx-accent")
            }
          >
            <Clock className="h-4 w-4" />
          </button>
        </div>

        {showHistory ? (
          <HistoryPanel
            locale={locale}
            conversations={conversations}
            activeId={conversationId}
            onSelect={openConversation}
            onDelete={deleteConversation}
            onNew={startNew}
          />
        ) : null}

        {/* Messages */}
        <div className="flex-1 space-y-5 py-5">
          {isGuest ? (
            <SignInPanel
              locale={locale}
              onSignIn={() => openAuthPrompt("generic")}
            />
          ) : messages.length === 0 ? (
            <EmptyState
              locale={locale}
              disclaimer={disclaimer}
              chips={promptChips}
              onChip={(c) => send(c)}
            />
          ) : (
            messages.map((m) =>
              m.role === "user" ? (
                <UserBubble key={m.id} text={m.content} failed={m.failed} />
              ) : (
                <AssistantBubble
                  key={m.id}
                  locale={locale}
                  message={m}
                  onCopy={() => copy(m.content)}
                  onFeedback={(r) => submitFeedback(m.id, r)}
                />
              ),
            )
          )}

          {quotaReached ? (
            <QuotaCard
              locale={locale}
              isMember={membershipActive}
              message={quotaMessage}
            />
          ) : null}

          <div ref={bottomRef} />
        </div>

        {/* Composer */}
        {!isGuest ? (
          <div className="sticky bottom-0 z-20 -mx-3 border-t border-kx-stroke/40 bg-kx-card/85 px-3 py-3 backdrop-blur-md sm:-mx-5 sm:px-5">
            {errorMessage ? (
              <div className="mb-2 flex items-center gap-2 rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs font-semibold text-amber-700 dark:text-amber-300">
                <span className="min-w-0 flex-1 truncate">{errorMessage}</span>
                {lastFailedText.current ? (
                  <button type="button" onClick={retry} className="shrink-0 font-black text-kx-accent hover:underline">
                    {pick(locale, "重试", "再試行", "Retry")}
                  </button>
                ) : null}
              </div>
            ) : null}
            {!membershipActive && remainingFreeUses != null && !quotaReached ? (
              <p className="mb-1.5 px-1 text-[11px] font-semibold text-kx-muted">
                {pick(
                  locale,
                  `今日还可免费咨询 ${remainingFreeUses} 次`,
                  `本日の無料相談はあと ${remainingFreeUses} 回`,
                  `${remainingFreeUses} free questions left today`,
                )}
              </p>
            ) : null}
            <div className="flex items-end gap-2 rounded-[1.4rem] border border-kx-stroke/50 bg-kx-card p-1.5 shadow-[0_10px_30px_-24px_rgba(20,112,103,0.5)] focus-within:border-kx-accent/45">
              <textarea
                ref={textareaRef}
                value={input}
                rows={1}
                disabled={quotaReached}
                onChange={(e) => {
                  setInput(e.target.value);
                  autoGrow();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    onSubmit();
                  }
                }}
                placeholder={pick(
                  locale,
                  "问问日本生活、升学、就职或 Machi 使用问题…",
                  "日本生活・進学・就職や Machi の使い方を質問…",
                  "Ask about life, study, work in Japan, or using Machi…",
                )}
                className="max-h-40 min-h-[2.5rem] flex-1 resize-none bg-transparent px-3 py-2 text-sm font-medium leading-6 text-kx-text outline-none placeholder:text-kx-muted disabled:opacity-60"
              />
              <button
                type="button"
                onClick={onSubmit}
                disabled={!canSend}
                aria-label={pick(locale, "发送", "送信", "Send")}
                className={
                  "grid h-10 w-10 shrink-0 place-items-center rounded-full transition " +
                  (canSend ? "bg-kx-accent text-white hover:brightness-105" : "bg-kx-soft text-kx-muted")
                }
              >
                {sending ? <Spinner /> : <Send className="h-4 w-4" />}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </GuideShell>
  );
}

// --- subcomponents ---------------------------------------------------------

function Avatar({ size = 38 }: { size?: number }) {
  return (
    <span
      className="grid shrink-0 place-items-center rounded-[28%] shadow-[0_8px_20px_-10px_rgba(20,112,103,0.9)]"
      style={{ width: size, height: size }}
      aria-hidden
    >
      <MachiAIMark className="h-full w-full" />
    </span>
  );
}

function Spinner() {
  return (
    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden />
  );
}

function SignInPanel({ locale, onSignIn }: { locale: string; onSignIn: () => void }) {
  return (
    <div className="rounded-[1.75rem] border border-kx-accent/25 bg-kx-accentSoft/30 p-6 text-center sm:p-8">
      <div className="mx-auto mb-4 flex justify-center">
        <Avatar size={56} />
      </div>
      <h2 className="text-xl font-black text-kx-text">
        {pick(locale, "登录后使用 Machi AI", "ログインして Machi AI を使う", "Sign in to use Machi AI")}
      </h2>
      <p className="mx-auto mt-2 max-w-md text-sm font-semibold leading-6 text-kx-subtle">
        {pick(
          locale,
          "登录后可以咨询日本生活、升学和就职问题，并保存你的对话记录。",
          "ログインすると日本生活・進学・就職の相談ができ、会話履歴も保存されます。",
          "Sign in to ask about life, study, and work in Japan — and keep your chat history.",
        )}
      </p>
      <button type="button" onClick={onSignIn} className="kx-button-primary mt-5 h-11 px-6">
        {pick(locale, "登录 / 注册", "ログイン / 登録", "Sign in / Sign up")}
      </button>
    </div>
  );
}

function EmptyState({
  locale,
  disclaimer,
  chips,
  onChip,
}: {
  locale: string;
  disclaimer: string;
  chips: string[];
  onChip: (c: string) => void;
}) {
  return (
    <div className="space-y-5">
      <div className="rounded-[1.75rem] border border-kx-stroke/40 bg-kx-card/80 p-6 sm:p-7">
        <Avatar size={52} />
        <h2 className="mt-4 text-2xl font-black tracking-[-0.02em] text-kx-text">
          {pick(locale, "在日本遇到的问题，先问 Machi AI", "日本での困りごとは、まず Machi AI に", "Stuck in Japan? Ask Machi AI first")}
        </h2>
        <p className="mt-2 max-w-xl text-sm font-semibold leading-7 text-kx-subtle">
          {pick(
            locale,
            "手续、租房、升学、就职、日语学习和 Machi 使用，都可以从一个清晰答案开始。",
            "手続き・住まい・進学・就職・日本語学習、そして Machi の使い方まで、ひとつの明快な答えから。",
            "Paperwork, housing, study, work, Japanese, and using Machi — start from one clear answer.",
          )}
        </p>
      </div>

      <div>
        <p className="mb-2.5 px-1 text-xs font-bold text-kx-muted">
          {pick(locale, "试试这样问", "こんな質問から", "Try asking")}
        </p>
        <div className="flex flex-wrap gap-2">
          {chips.map((chip) => (
            <button
              key={chip}
              type="button"
              onClick={() => onChip(chip)}
              className="rounded-full border border-kx-stroke/50 bg-kx-card px-3.5 py-2 text-sm font-semibold text-kx-text transition hover:-translate-y-0.5 hover:border-kx-accent/40 hover:text-kx-accent"
            >
              {chip}
            </button>
          ))}
        </div>
      </div>

      {disclaimer ? <p className="px-1 text-xs leading-5 text-kx-muted">{disclaimer}</p> : null}
    </div>
  );
}

function UserBubble({ text, failed }: { text: string; failed?: boolean }) {
  return (
    <div className="flex justify-end">
      <div
        className={
          "max-w-[82%] whitespace-pre-wrap break-words rounded-[1.25rem] bg-kx-accent px-4 py-2.5 text-sm font-medium leading-6 text-white shadow-sm " +
          (failed ? "opacity-60" : "")
        }
      >
        {text}
        {failed ? <span className="ml-1 align-middle text-amber-200">⚠</span> : null}
      </div>
    </div>
  );
}

function AssistantBubble({
  locale,
  message,
  onCopy,
  onFeedback,
}: {
  locale: string;
  message: LocalMessage;
  onCopy: () => void;
  onFeedback: (rating: "helpful" | "not_helpful") => void;
}) {
  const [given, setGiven] = useState<"helpful" | "not_helpful" | null>(null);
  const [copied, setCopied] = useState(false);
  const sources = (message.sources || []).filter((s) => s.title);

  return (
    <div className="flex max-w-[92%] flex-col gap-2">
      <div className="flex items-center gap-1.5 px-1 text-xs font-bold text-kx-subtle">
        <MachiAIGlyph className="h-3.5 w-3.5 text-kx-accent" /> Machi AI
      </div>
      {message.pending ? (
        <div className="w-fit rounded-[1.25rem] border border-kx-stroke/40 bg-kx-card px-4 py-3">
          <TypingDots />
        </div>
      ) : (
        <>
          <div className="break-words rounded-[1.25rem] border border-kx-stroke/40 bg-kx-card px-4 py-3 text-sm text-kx-text">
            <MachiMarkdown content={message.content} />
          </div>

          {sources.length ? (
            <div className="space-y-1.5">
              <p className="px-1 text-[11px] font-semibold text-kx-muted">
                {pick(locale, "Machi Guide 参考", "Machi Guide 参考", "From Machi Guide")}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {sources.map((s, i) => {
                  const href = sourceHref(s);
                  const kind = s.route?.kind || s.type || "";
                  const inner = (
                    <span className="inline-flex max-w-[16rem] items-center gap-1.5 rounded-full bg-kx-accentSoft px-2.5 py-1 text-xs font-semibold text-kx-accent">
                      <SourceIcon kind={kind} />
                      <span className="truncate">{s.title}</span>
                      {href ? <ArrowRight className="h-3 w-3 shrink-0 opacity-70" /> : null}
                    </span>
                  );
                  return href ? (
                    <Link key={`${s.title}-${i}`} href={href} className="transition hover:brightness-105">
                      {inner}
                    </Link>
                  ) : (
                    <span key={`${s.title}-${i}`}>{inner}</span>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div className="flex items-center gap-3 px-1 text-kx-muted">
            <button
              type="button"
              aria-label={pick(locale, "复制", "コピー", "Copy")}
              onClick={() => {
                onCopy();
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1600);
              }}
              className="transition hover:text-kx-accent"
            >
              {copied ? <Check className="h-4 w-4 text-kx-accent" /> : <Copy className="h-4 w-4" />}
            </button>
            <button
              type="button"
              aria-label={pick(locale, "有帮助", "役に立った", "Helpful")}
              onClick={() => {
                setGiven("helpful");
                onFeedback("helpful");
              }}
              className={"transition hover:text-kx-accent " + (given === "helpful" ? "text-kx-accent" : "")}
            >
              <ThumbsUp className={"h-4 w-4 " + (given === "helpful" ? "fill-current" : "")} />
            </button>
            <button
              type="button"
              aria-label={pick(locale, "没帮助", "役に立たなかった", "Not helpful")}
              onClick={() => {
                setGiven("not_helpful");
                onFeedback("not_helpful");
              }}
              className={"transition hover:text-kx-accent " + (given === "not_helpful" ? "text-kx-accent" : "")}
            >
              <ThumbsDown className={"h-4 w-4 " + (given === "not_helpful" ? "fill-current" : "")} />
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function TypingDots() {
  return (
    <span className="flex items-center gap-1" aria-label="Machi AI">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-2 w-2 animate-bounce rounded-full bg-kx-muted"
          style={{ animationDelay: `${i * 0.16}s`, animationDuration: "0.9s" }}
        />
      ))}
    </span>
  );
}

function QuotaCard({ locale, isMember, message }: { locale: string; isMember: boolean; message: string }) {
  const title = isMember
    ? pick(locale, "今天先到这里", "今日はここまで", "That's all for today")
    : pick(locale, "今日免费咨询已用完", "本日の無料相談は終了", "Today's free questions are used up");
  const body =
    message ||
    (isMember
      ? pick(locale, "Machi AI 今天的使用次数已用完，明天可以继续咨询。", "Machi AI の本日のご利用は終了しました。明日また相談できます。", "Machi AI is done for today. You can continue tomorrow.")
      : pick(locale, "明天可以继续使用 Machi AI。开通会员后，可以获得更多 AI 咨询和 Guide 资料权益。", "明日また Machi AI を利用できます。会員になると、より多くの AI 相談と Guide 特典が使えます。", "Machi AI resets tomorrow. Membership unlocks more AI help and Guide perks."));
  return (
    <div className="rounded-[1.5rem] border border-kx-accent/25 bg-kx-accentSoft/30 p-5">
      <h3 className="flex items-center gap-2 text-base font-black text-kx-text">
        <Moon className="h-4 w-4 text-kx-accent" /> {title}
      </h3>
      <p className="mt-1.5 text-sm font-semibold leading-6 text-kx-subtle">{body}</p>
      {!isMember ? (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Link href="/guide/member-resources" className="kx-button-primary h-10 px-4 text-sm">
            {pick(locale, "查看 Machi 会员", "Machi 会員を見る", "See Machi membership")}
          </Link>
          <span className="text-xs font-semibold text-kx-muted">
            {pick(locale, "明天再来", "また明日", "Come back tomorrow")}
          </span>
        </div>
      ) : null}
    </div>
  );
}

function HistoryPanel({
  locale,
  conversations,
  activeId,
  onSelect,
  onDelete,
  onNew,
}: {
  locale: string;
  conversations: GuideAIConversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onNew: () => void;
}) {
  return (
    <div className="mt-2 rounded-2xl border border-kx-stroke/45 bg-kx-card/90 p-2 shadow-lg backdrop-blur">
      <button
        type="button"
        onClick={onNew}
        className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold text-kx-accent transition hover:bg-kx-soft/60"
      >
        <Plus className="h-4 w-4" /> {pick(locale, "新对话", "新しい会話", "New chat")}
      </button>
      {conversations.length === 0 ? (
        <p className="px-3 py-3 text-sm font-semibold text-kx-muted">
          {pick(locale, "还没有历史会话", "履歴はまだありません", "No conversations yet")}
        </p>
      ) : (
        <ul className="max-h-72 overflow-auto">
          {conversations.map((c) => (
            <li key={c.id} className="group flex items-center gap-1">
              <button
                type="button"
                onClick={() => onSelect(c.id)}
                className={
                  "min-w-0 flex-1 rounded-xl px-3 py-2 text-left transition hover:bg-kx-soft/60 " +
                  (activeId === c.id ? "bg-kx-soft/60" : "")
                }
              >
                <p className="truncate text-sm font-semibold text-kx-text">
                  {c.title || pick(locale, "对话", "会話", "Conversation")}
                </p>
                {c.lastMessagePreview ? (
                  <p className="truncate text-xs text-kx-muted">{c.lastMessagePreview}</p>
                ) : null}
              </button>
              <button
                type="button"
                aria-label={pick(locale, "删除", "削除", "Delete")}
                onClick={() => onDelete(c.id)}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-kx-muted opacity-0 transition hover:bg-rose-500/10 hover:text-rose-500 group-hover:opacity-100"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
