"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { BarChart3, Image as ImageIcon, Hash, X, Loader2, Send, FileWarning, Languages, Play, Plus } from "lucide-react";
import { api, APIError, isUploadVideoFile } from "@/lib/api";
import { useAuthPrompt, useCompose, useLanguagePreference, useSession, useToasts } from "@/lib/store";
import { Dialog } from "@/components/design/Dialog";
import { Avatar, VerifiedBadge } from "@/components/design/Avatar";
import { useQueryClient } from "@tanstack/react-query";
import { useI18n } from "@/lib/i18n";
import { isVideoMedia, mediaPreviewImageUrl } from "@/lib/media";
import clsx from "clsx";
import {
  CONTENT_LANGUAGE_LABELS,
  CONTENT_TYPES,
  CONTENT_TYPE_LABELS,
  contentLanguageServerTag,
  contentTypeRequiresMembership,
  type ContentLanguage,
  type ContentType,
  type KXMedia,
} from "@/lib/types";

/// Per-type required attribute keys. Mirrors iOS
/// `ComposePostViewModel.requiredAttributeKeys`. Keep these in sync —
/// the same backend will eventually validate them.
const REQUIRED_KEYS: Partial<Record<ContentType, string[]>> = {
  image_post: ["title"],
  long_post: ["title"],
  rant: ["title"],
  anonymous: ["title"],
  news: ["title"],
  local_info: ["title"],
  guide: ["title"],
  question: ["question"],
  secondhand: ["title", "price"],
  housing: ["title", "rent"],
  roommate: ["title"],
  job_seek: ["desired_job"],
  job_post: ["job_title", "company_name"],
  referral: ["job_title"],
  meetup: ["title", "meetup_time"],
  dining: ["restaurant_or_area", "meetup_time"],
  event: ["title", "event_time"],
  service: ["company_name", "service_type", "service_description", "price_range", "contact_method"],
  merchant: ["merchant_name", "company_name", "merchant_type", "service_description", "address", "contact_method"],
  coupon: ["title", "merchant_name", "discount_info", "valid_until", "usage_rules", "contact_method"],
  warning: ["title"],
  poll: ["question", "options"],
};

type VideoPosterCapture = {
  file: File;
  previewUrl: string;
  width: number;
  height: number;
};

type UploadProgressEntry = {
  name: string;
  progress: number;
  status: string;
  error?: string;
  file?: File;
  previewUrl?: string;
};

function readVideoMetadata(file: File): Promise<{ duration: number; width: number; height: number }> {
  return new Promise((resolve) => {
    if (typeof document === "undefined") {
      resolve({ duration: 0, width: 0, height: 0 });
      return;
    }
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    let settled = false;
    const done = (value: { duration: number; width: number; height: number }) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      URL.revokeObjectURL(url);
      resolve(value);
    };
    // Guard against containers that never fire loadedmetadata/onerror,
    // otherwise the upload pipeline hangs forever.
    const timeout = window.setTimeout(() => done({ duration: 0, width: 0, height: 0 }), 8000);
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.onloadedmetadata = () => done({
      duration: Number.isFinite(video.duration) ? video.duration : 0,
      width: video.videoWidth || 0,
      height: video.videoHeight || 0,
    });
    video.onerror = () => done({ duration: 0, width: 0, height: 0 });
    video.src = url;
  });
}

function posterFileName(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, "") || "video";
  return `${base}-poster.jpg`;
}

function captureVideoPoster(file: File): Promise<VideoPosterCapture | null> {
  return new Promise((resolve) => {
    if (typeof document === "undefined") {
      resolve(null);
      return;
    }
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    let settled = false;
    const cleanup = (result: VideoPosterCapture | null) => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(url);
      resolve(result);
    };
    const timeout = window.setTimeout(() => cleanup(null), 9000);
    const finish = () => {
      window.clearTimeout(timeout);
      const width = video.videoWidth || 1280;
      const height = video.videoHeight || 720;
      if (!width || !height) {
        cleanup(null);
        return;
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) {
        cleanup(null);
        return;
      }
      context.drawImage(video, 0, 0, width, height);
      canvas.toBlob((blob) => {
        if (!blob) {
          cleanup(null);
          return;
        }
        const poster = new File([blob], posterFileName(file.name), { type: "image/jpeg", lastModified: Date.now() });
        cleanup({ file: poster, previewUrl: URL.createObjectURL(blob), width, height });
      }, "image/jpeg", 0.84);
    };
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.onloadedmetadata = () => {
      const duration = Number.isFinite(video.duration) ? video.duration : 0;
      const target = duration > 1 ? 1 : duration > 0.2 ? 0.1 : 0;
      if (Math.abs(video.currentTime - target) < 0.02) {
        finish();
        return;
      }
      video.currentTime = target;
    };
    video.onseeked = finish;
    video.onerror = () => {
      window.clearTimeout(timeout);
      cleanup(null);
    };
    video.src = url;
  });
}

const LANGUAGE_PICKER_OPTIONS: ContentLanguage[] = ["zh", "en", "ja", "ko", "fr", "es"];
const STRICT_STRUCTURED_TYPES = new Set<ContentType>(["poll", "merchant", "service", "coupon", "job_post"]);
const POST_IMAGE_LIMIT = 9;
const POST_VIDEO_LIMIT = 1;
const POST_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
const POST_VIDEO_MAX_BYTES = 200 * 1024 * 1024;

const TAG_RE = /#([\p{L}\p{N}_]+)/gu;
const POLL_MIN_OPTIONS = 2;
const POLL_MAX_OPTIONS = 6;

function parsePollOptions(value: unknown): string[] {
  const withMinimum = (items: string[]) => {
    const next = items.slice(0, POLL_MAX_OPTIONS);
    while (next.length < POLL_MIN_OPTIONS) next.push("");
    return next;
  };
  if (Array.isArray(value)) return withMinimum(value.map((item) => String(item)));
  const raw = String(value ?? "").trim();
  if (!raw) return ["", ""];
  if (raw.startsWith("[")) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return withMinimum(parsed.map((item) => String(item)));
    } catch {
      // Fall through to separator parsing.
    }
  }
  const split = raw.split(/[\n/；;|]+/).map((item) => item.trim());
  return withMinimum(split);
}

function cleanPollOptions(value: unknown): string[] {
  const seen = new Set<string>();
  const options: string[] = [];
  for (const option of parsePollOptions(value)) {
    const clean = option.replace(/\s+/g, " ").trim().slice(0, 80);
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    options.push(clean);
    if (options.length >= POLL_MAX_OPTIONS) break;
  }
  return options;
}

export function Composer() {
  const isOpen = useCompose((s) => s.isOpen);
  const close = useCompose((s) => s.close);
  const initialContent = useCompose((s) => s.initialContent);
  const initialTagsFromStore = useCompose((s) => s.initialTags);
  const initialTypeFromStore = useCompose((s) => s.initialContentType);
  const draftId = useCompose((s) => s.draftId);

  const user = useSession((s) => s.user);
  const openAuthPrompt = useAuthPrompt((s) => s.open);
  const pushToast = useToasts((s) => s.push);
  const queryClient = useQueryClient();
  const { t } = useI18n();

  const [content, setContent] = useState(initialContent);
  const [media, setMedia] = useState<KXMedia[]>([]);
  const [extraTags, setExtraTags] = useState<string[]>(initialTagsFromStore);
  const [contentType, setContentType] = useState<ContentType>("dynamic");
  const [attributes, setAttributes] = useState<Record<string, string | boolean>>({});
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<Record<string, UploadProgressEntry>>({});
  const [submitting, setSubmitting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const localPreviewUrlsRef = useRef<string[]>([]);

  // Content language — defaults to the user's preferred (or `zh`
  // when the user picked `followApp` and we can't tell more).
  const preferredLanguage = useLanguagePreference((s) => s.preferred);
  const [selectedLanguage, setSelectedLanguage] = useState<ContentLanguage>(
    preferredLanguage === "followApp" || preferredLanguage === "multi" ? "zh" : preferredLanguage,
  );

  useEffect(() => {
    if (isOpen) {
      setContent(initialContent);
      setExtraTags(initialTagsFromStore);
      setMedia([]);
      setUploadProgress({});
      setContentType(initialTypeFromStore ?? "dynamic");
      setAttributes({});
      localPreviewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      localPreviewUrlsRef.current = [];
      setTimeout(() => textareaRef.current?.focus(), 40);
    }
  }, [isOpen, initialContent, initialTagsFromStore, initialTypeFromStore]);

  useEffect(() => () => {
    localPreviewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    localPreviewUrlsRef.current = [];
  }, []);

  const inlineTags = Array.from(new Set([...content.matchAll(TAG_RE)].map((m) => m[1].toLowerCase())));
  const tags = Array.from(new Set([...inlineTags, ...extraTags.map((t) => t.toLowerCase())]));
  const hasAttributes = Object.values(attributes).some((value) => String(value).trim().length > 0);

  // Required-fields gating. Mirrors iOS canPublish: either the typed
  // form's required keys are all filled OR the user has enough generic
  // payload (text / media / tags). The generic fallback keeps users
  // unblocked when exploring the form.
  const missingRequired = useMemo(() => {
    const requiredKeys = REQUIRED_KEYS[contentType] || [];
    return requiredKeys.filter((key) => {
      const value = attributes[key];
      if (contentType === "poll" && key === "options") return cleanPollOptions(value).length < POLL_MIN_OPTIONS;
      if (typeof value === "string") return value.trim().length === 0;
      if (typeof value === "boolean") return false;
      return true;
    });
  }, [contentType, attributes]);
  const hasGenericPayload = content.trim().length > 0 || media.length > 0 || tags.length > 0;
  const strictStructuredPost = STRICT_STRUCTURED_TYPES.has(contentType);
  const canPublish = (missingRequired.length === 0 && (hasAttributes || hasGenericPayload)) || (!strictStructuredPost && hasGenericPayload);
  // Machi Verified gate: high-trust types need an active membership. The
  // server enforces it too (403 MEMBERSHIP_REQUIRED) — this just gates UX.
  const needsMembership = contentTypeRequiresMembership(contentType) && !user?.is_verified_member;
  const imageCount = media.filter((item) => item.type === "image").length;
  const hasVideo = media.some((item) => item.type === "video");
  const mediaLimitReached = hasVideo || imageCount >= POST_IMAGE_LIMIT;

  const onFiles = async (files: FileList | File[]) => {
    if (!user) {
      openAuthPrompt("publish");
      return;
    }
    let array = Array.from(files);
    if (!array.length) return;
    const selectedVideos = array.filter((file) => isUploadVideoFile(file));
    if (selectedVideos.length && array.length > 1) {
      pushToast({ kind: "error", message: "视频动态一次只能上传 1 个视频，不能和图片混合。已只保留第一个视频。" });
      array = [selectedVideos[0]];
    }
    if (selectedVideos.length && media.length > 0) {
      pushToast({ kind: "error", message: "视频动态不能和已添加的图片或视频混合，请先移除当前媒体。" });
      return;
    }
    setUploading(true);
    try {
      const uploaded: KXMedia[] = [];
      for (const f of array) {
        const key = `${f.name}-${f.size}-${f.lastModified}`;
        const isVideo = isUploadVideoFile(f);
        const purpose = isVideo ? "post_video" : "post_image";
        const maxBytes = isVideo ? POST_VIDEO_MAX_BYTES : POST_IMAGE_MAX_BYTES;
        if (f.size > maxBytes) {
          pushToast({ kind: "error", message: `${f.name} ${t("composer_too_large")}` });
          continue;
        }
        const nextItems = [...media, ...uploaded];
        if (isVideo && nextItems.length > 0) {
          pushToast({ kind: "error", message: "视频动态只能上传 1 个视频，不能和图片混合" });
          continue;
        }
        if (!isVideo && nextItems.some((item) => item.type === "video")) {
          pushToast({ kind: "error", message: "视频动态不能再添加图片" });
          continue;
        }
        if (isVideo && nextItems.filter((item) => item.type === "video").length >= POST_VIDEO_LIMIT) {
          pushToast({ kind: "error", message: "每个帖子最多上传 1 个视频" });
          continue;
        }
        if (!isVideo && nextItems.filter((item) => item.type === "image").length >= POST_IMAGE_LIMIT) {
          pushToast({ kind: "error", message: "每个帖子最多上传 9 张图片" });
          continue;
        }
        setUploadProgress((prev) => ({ ...prev, [key]: { name: f.name, progress: 0, status: "准备上传", file: f } }));
        try {
          const videoMeta = isVideo ? await readVideoMetadata(f) : { duration: 0, width: 0, height: 0 };
          const poster = isVideo ? await captureVideoPoster(f) : null;
          if (poster?.previewUrl) localPreviewUrlsRef.current.push(poster.previewUrl);
          let posterFileId = "";
          let posterUrl = "";
          if (poster) {
            setUploadProgress((prev) => ({
              ...prev,
              [key]: { name: f.name, progress: 0.04, status: "生成封面", file: f, previewUrl: poster.previewUrl },
            }));
            const posterUpload = await api.uploadFile(poster.file, {
              purpose: "video_thumbnail",
              entityType: "video",
              width: poster.width,
              height: poster.height,
              metadata: { sourceVideoName: f.name },
              onProgress: (event) => {
                const status = event.stage === "success" ? "封面完成" : "上传封面";
                setUploadProgress((prev) => ({
                  ...prev,
                  [key]: {
                    name: f.name,
                    progress: Math.min(0.22, event.progress * 0.22),
                    status,
                    file: f,
                    previewUrl: poster.previewUrl,
                  },
                }));
              },
            });
            posterFileId = posterUpload.file.id;
            posterUrl = posterUpload.media.thumbnailUrl || posterUpload.media.thumbnail_url || posterUpload.media.url || poster.previewUrl;
          }
          const m = await api.uploadMediaBase64(f, {
            purpose,
            duration: videoMeta.duration,
            width: videoMeta.width,
            height: videoMeta.height,
            metadata: isVideo ? {
              durationSeconds: videoMeta.duration,
              thumbnailFileId: posterFileId,
              thumbnail_file_id: posterFileId,
              posterFileId,
            } : {},
            onProgress: (event) => {
              const status = event.stage === "presign" ? "准备上传" : event.stage === "uploading" ? "上传中" : event.stage === "complete" ? "确认中" : event.stage === "success" ? "已完成" : "失败";
              const progress = isVideo && poster ? 0.22 + event.progress * 0.78 : event.progress;
              setUploadProgress((prev) => ({ ...prev, [key]: { name: f.name, progress, status, file: f, previewUrl: poster?.previewUrl } }));
            },
          });
          if (isVideo) {
            const previewUrl = m.thumbnailUrl || m.thumbnail_url || m.thumbUrl || m.thumb_url || m.posterUrl || m.poster_url || posterUrl || poster?.previewUrl || "";
            uploaded.push({
              ...m,
              thumbnailUrl: m.thumbnailUrl || previewUrl || undefined,
              thumbnail_url: m.thumbnail_url || previewUrl || undefined,
              thumbUrl: m.thumbUrl || previewUrl || undefined,
              thumb_url: m.thumb_url || previewUrl,
              posterUrl: m.posterUrl || previewUrl || undefined,
              poster_url: m.poster_url || previewUrl || undefined,
            });
          } else {
            uploaded.push(m);
          }
          setUploadProgress((prev) => ({ ...prev, [key]: { name: f.name, progress: 1, status: "已完成", previewUrl: poster?.previewUrl } }));
        } catch (err) {
          setUploadProgress((prev) => ({ ...prev, [key]: { ...prev[key], name: f.name, progress: prev[key]?.progress || 0, status: "失败", error: (err as APIError).message, file: f } }));
        }
      }
      setMedia((prev) => {
        const next = [...prev, ...uploaded];
        return next.some((item) => item.type === "video") ? next.slice(0, POST_VIDEO_LIMIT) : next.slice(0, POST_IMAGE_LIMIT);
      });
    } catch (err) {
      pushToast({ kind: "error", message: (err as APIError).message });
    } finally {
      setUploading(false);
    }
  };

  const removeMedia = (id: string) => setMedia((prev) => prev.filter((m) => m.id !== id));
  const addManualTag = (raw: string) => {
    const clean = raw.replace(/^#/, "").trim().toLowerCase();
    if (!clean) return;
    setExtraTags((prev) => Array.from(new Set([...prev, clean])));
  };

  const publish = useCallback(async () => {
    if (submitting) return;
    const text = content.trim();
    if (!canPublish) {
      pushToast({
        kind: "error",
        message:
          missingRequired.length > 0
            ? `还差几个必填项: ${missingRequired.map((key) => fieldLabelFor(contentType, key)).join(" · ")}`
            : t("composer_empty_error"),
      });
      return;
    }
    if (needsMembership) {
      pushToast({ kind: "error", message: t("compose_membership_required") });
      return;
    }
    setSubmitting(true);
    try {
      const finalAttributes =
        contentType === "poll"
          ? { ...attributes, options: JSON.stringify(cleanPollOptions(attributes.options)) }
          : attributes;
      await api.createPost({
        content: text,
        media_ids: media.map((m) => m.id),
        tags: tags,
        content_type: contentType,
        attributes: finalAttributes,
        country: user?.country,
        province: user?.province,
        city: user?.city,
        region_code: user?.current_region_code,
        language: contentLanguageServerTag(selectedLanguage),
      });
      if (draftId) {
        try {
          await api.deleteDraft(draftId);
        } catch {
          // ignore
        }
      }
      pushToast({ kind: "success", message: t("composer_published") });
      queryClient.invalidateQueries({ queryKey: ["feed"] });
      queryClient.invalidateQueries({ queryKey: ["drafts"] });
      close();
    } catch (err) {
      const e = err as APIError;
      pushToast({
        kind: "error",
        message: e.code === "MEMBERSHIP_REQUIRED" ? t("compose_membership_required") : e.message,
      });
    } finally {
      setSubmitting(false);
    }
  }, [submitting, content, media, tags, draftId, pushToast, queryClient, close, contentType, attributes, user, selectedLanguage, canPublish, needsMembership, missingRequired, t]);

  // Cmd/Ctrl+Enter publishes and matches the rest of Machi's shortcut convention.
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        publish();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen, publish]);

  // Auto-save drafts every 4 seconds while the composer has unsaved
  // content. Saves locally to the server's drafts API so it shows up
  // in the Drafts page across both clients.
  useEffect(() => {
    if (!isOpen) return;
    if (!content.trim() && media.length === 0) return;
    const handle = setTimeout(() => {
      api.saveDraft({
        id: draftId ?? undefined,
        content,
        media_ids: media.map((m) => m.id),
        tags,
      }).catch(() => undefined);
    }, 4000);
    return () => clearTimeout(handle);
  }, [isOpen, content, media, tags, draftId]);

  const saveDraft = async () => {
    if (!content.trim() && media.length === 0) {
      close();
      return;
    }
    try {
      await api.saveDraft({
        id: draftId ?? undefined,
        content,
        media_ids: media.map((m) => m.id),
        tags,
      });
      pushToast({ kind: "info", message: t("composer_draft_saved") });
      queryClient.invalidateQueries({ queryKey: ["drafts"] });
    } catch {
      pushToast({ kind: "error", message: t("error_default") });
    }
    close();
  };

  return (
    <Dialog
      open={isOpen}
      onClose={saveDraft}
      title={t("composer_title")}
      maxWidth="38rem"
      mobileFull
      footer={
        <>
          <span className="text-xs text-kx-muted mr-auto hidden sm:inline">{t("composer_shortcut_hint")}</span>
          <button className="kx-button-ghost" onClick={saveDraft}>{t("composer_save_draft")}</button>
          <button
            className={clsx(
              "kx-button-primary inline-flex items-center gap-1.5",
              (!canPublish || needsMembership) && "opacity-60 cursor-not-allowed",
            )}
            onClick={publish}
            disabled={submitting || !canPublish || needsMembership}
            title={!canPublish && missingRequired.length > 0 ? `还差: ${missingRequired.map((key) => fieldLabelFor(contentType, key)).join(" · ")}` : undefined}
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {t("action_publish")}
          </button>
        </>
      }
    >
      <div
        className={dragOver ? "ring-2 ring-kx-accent/40 rounded-kx-md" : ""}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          onFiles(e.dataTransfer.files);
        }}
      >
        <div className="flex gap-3 items-start">
          <Avatar user={user || undefined} size={40} />
          <div className="flex-1 min-w-0">
            <div className="mb-3 grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
              <label className="text-xs font-semibold text-kx-muted">
                内容类型
                <select
                  className="kx-input h-9 mt-1"
                  value={contentType}
                  onChange={(e) => {
                    setContentType(e.target.value as ContentType);
                    setAttributes({});
                  }}
                >
                  {CONTENT_TYPES.map((type) => (
                    <option key={type} value={type}>{CONTENT_TYPE_LABELS[type]}</option>
                  ))}
                </select>
              </label>
              <div className="rounded-kx-md bg-kx-soft px-3 py-2 text-xs text-kx-muted min-w-0">
                <div className="font-semibold text-kx-text truncate">{user?.city || "未选择城市"}</div>
                <div className="truncate">{[user?.country, user?.province, user?.city].filter(Boolean).join(" / ") || "发布后可在 App 设置当前地区"}</div>
              </div>
            </div>
            {needsMembership ? (
              <div className="mb-3 rounded-kx-md border border-kx-verified/30 bg-kx-accentSoft px-3 py-2 text-xs">
                <div className="flex items-start gap-1.5 text-kx-text">
                  <VerifiedBadge />
                  <span>{t("compose_membership_required")}</span>
                </div>
                <Link
                  href="/membership"
                  className="mt-1.5 inline-block font-bold text-kx-accent hover:underline"
                  onClick={close}
                >
                  {t("compose_membership_cta")}
                </Link>
              </div>
            ) : null}
            <label className="block mb-3 text-xs font-semibold text-kx-muted">
              <span className="inline-flex items-center gap-1">
                <Languages className="w-3.5 h-3.5" /> 帖子语言
              </span>
              <select
                className="kx-input h-9 mt-1"
                value={selectedLanguage}
                onChange={(e) => setSelectedLanguage(e.target.value as ContentLanguage)}
              >
                {LANGUAGE_PICKER_OPTIONS.map((lang) => (
                  <option key={lang} value={lang}>{CONTENT_LANGUAGE_LABELS[lang]}</option>
                ))}
              </select>
            </label>
            {missingRequired.length > 0 ? (
              <div className="mb-3 rounded-kx-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-900 dark:bg-amber-500/10 dark:border-amber-400/20 dark:text-amber-200">
                <span className="font-bold">还差几个必填项: </span>
                {missingRequired.map((key) => fieldLabelFor(contentType, key)).join(" · ")}
              </div>
            ) : null}
            {contentType !== "dynamic" ? (
              <TypedAttributeFields
                contentType={contentType}
                attributes={attributes}
                onChange={(key, value) => setAttributes((prev) => ({ ...prev, [key]: value }))}
              />
            ) : null}
            <textarea
              ref={textareaRef}
              className="kx-textarea h-40 text-base"
              placeholder={t("composer_placeholder")}
              value={content}
              maxLength={2000}
              onChange={(e) => setContent(e.target.value)}
            />
            {media.length ? (
              <div
                className={clsx(
                  "mt-3 grid gap-1.5 rounded-kx-md overflow-hidden border border-kx-stroke/40",
                  media.length === 1 && "grid-cols-1",
                  media.length === 2 && "grid-cols-2",
                  media.length === 3 && "grid-cols-3",
                  media.length === 4 && "grid-cols-2",
                  media.length > 4 && "grid-cols-3",
                )}
              >
                {media.map((m) => (
                  <div
                    key={m.id}
                    className={clsx(
                      "relative bg-kx-soft overflow-hidden",
                      media.length === 1 ? "aspect-[4/3]" : "aspect-square",
                    )}
                  >
                    {isVideoMedia(m) ? (
                      <>
                        {mediaPreviewImageUrl(m) ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={mediaPreviewImageUrl(m)} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
                        ) : (
                          <span className="absolute inset-0 bg-[radial-gradient(circle_at_28%_18%,rgba(37,99,235,0.16),transparent_34%),linear-gradient(135deg,#f8fafc,#eef4ff_52%,#f7fbf5)]" />
                        )}
                        <span className="absolute inset-0 grid place-items-center bg-black/10">
                          <span className="grid h-10 w-10 place-items-center rounded-full bg-black/60 text-white">
                            <Play className="h-5 w-5" />
                          </span>
                        </span>
                      </>
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={mediaPreviewImageUrl(m) || m.url} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />
                    )}
                    <button
                      type="button"
                      className="absolute top-1.5 right-1.5 bg-black/65 hover:bg-black/85 text-white rounded-full p-1 transition"
                      onClick={() => removeMedia(m.id)}
                      aria-label="移除"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
            {Object.keys(uploadProgress).length ? (
              <div className="mt-3 space-y-1.5">
	                {Object.entries(uploadProgress).map(([key, item]) => (
	                  <div key={key} className="rounded-kx-md bg-kx-soft px-3 py-2 text-xs">
	                    <div className="flex items-center gap-2">
	                      {item.previewUrl ? (
	                        // eslint-disable-next-line @next/next/no-img-element
	                        <img src={item.previewUrl} alt="" className="h-9 w-12 shrink-0 rounded-kx-sm object-cover" />
	                      ) : null}
	                      <span className="min-w-0 flex-1 truncate font-semibold text-kx-text">{item.name}</span>
	                      <span className={item.error ? "font-semibold text-kx-danger" : "font-semibold text-kx-muted"}>
	                        {item.error ? "失败" : item.status} {Math.round(item.progress * 100)}%
	                      </span>
	                    </div>
	                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-kx-stroke/50">
	                      <div className="h-full rounded-full bg-kx-accent transition-all" style={{ width: `${Math.round(item.progress * 100)}%` }} />
	                    </div>
	                    {item.error ? (
	                      <div className="mt-1.5 flex items-center gap-2 text-kx-danger">
	                        <p className="min-w-0 flex-1">{item.error}</p>
	                        {item.file ? (
	                          <button
	                            type="button"
	                            className="font-bold text-kx-accent hover:underline disabled:opacity-50"
	                            disabled={uploading}
	                            onClick={() => onFiles([item.file!])}
	                          >
	                            重试
	                          </button>
	                        ) : null}
	                        <button
	                          type="button"
	                          className="font-bold text-kx-muted hover:text-kx-text"
	                          onClick={() => setUploadProgress((prev) => {
	                            const next = { ...prev };
	                            delete next[key];
	                            return next;
	                          })}
	                        >
	                          清除
	                        </button>
	                      </div>
	                    ) : null}
	                  </div>
	                ))}
	              </div>
            ) : null}
            {tags.length ? (
              <div className="flex flex-wrap gap-1.5 mt-3">
                {tags.map((t) => (
                  <span key={t} className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-kx-accentSoft text-kx-accent">
                    #{t}
                    {!inlineTags.includes(t) ? (
                      <button
                        onClick={() => setExtraTags((prev) => prev.filter((x) => x !== t))}
                        aria-label="移除标签"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    ) : null}
                  </span>
                ))}
              </div>
            ) : null}
	            <div className="flex items-center gap-2 mt-3">
	              <button
	                onClick={() => {
	                  if (!user) {
	                    openAuthPrompt("publish");
	                    return;
	                  }
	                  fileInput.current?.click();
	                }}
	                className="kx-button-ghost"
	                disabled={uploading || mediaLimitReached}
	                title={hasVideo ? "已添加视频" : imageCount >= POST_IMAGE_LIMIT ? "最多上传 9 张图片" : undefined}
	              >
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />}
                {t("composer_media")}
              </button>
              <button
                onClick={() => {
                  const tag = window.prompt("#tag");
                  if (tag) addManualTag(tag);
                }}
                className="kx-button-ghost"
              >
                <Hash className="w-4 h-4" /> {t("composer_tag")}
              </button>
              <button
                onClick={() => {
                  setContentType("poll");
                  setAttributes((prev) => ({
                    ...prev,
                    question: typeof prev.question === "string" ? prev.question : "",
                    options: typeof prev.options === "string" ? prev.options : JSON.stringify(["", ""]),
                  }));
                  setTimeout(() => textareaRef.current?.focus(), 0);
                }}
                className={clsx("kx-button-ghost", contentType === "poll" && "border-kx-accent/50 text-kx-accent bg-kx-accentSoft")}
              >
                <BarChart3 className="w-4 h-4" /> 投票
              </button>
              <span className="ml-auto text-xs text-kx-muted">{content.length} / 2000</span>
            </div>
            {dragOver ? (
              <div className="mt-3 rounded-kx-md border-2 border-dashed border-kx-accent/50 bg-kx-accentSoft/50 p-4 text-center text-sm text-kx-accent">
                {t("composer_drag_release")}
              </div>
            ) : null}
            <input
              ref={fileInput}
              type="file"
              accept="image/*,video/*"
              multiple
              className="hidden"
	              onChange={(e) => {
	                // Snapshot before clearing: FileList is live and value="" empties it.
	                const files = Array.from(e.target.files ?? []);
	                e.target.value = "";
	                if (files.length) onFiles(files);
	              }}
            />
          </div>
        </div>
        {content.length > 2000 ? (
          <div className="mt-3 text-xs text-kx-danger inline-flex items-center gap-1"><FileWarning className="w-3.5 h-3.5" />超出长度限制</div>
        ) : null}
      </div>
    </Dialog>
  );
}

type TypedField = { key: string; label: string; placeholder?: string; type?: string; kind?: "input" | "textarea" };

const TYPED_FIELDS: Partial<Record<ContentType, TypedField[]>> = {
  image_post: [
    { key: "title", label: "标题", placeholder: "一组城市照片 / 探店记录" },
  ],
  long_post: [
    { key: "title", label: "标题" },
    { key: "summary", label: "摘要" },
  ],
  news: [
    { key: "title", label: "新闻标题" },
    { key: "source", label: "来源" },
    { key: "summary", label: "摘要" },
    { key: "location", label: "地点" },
    { key: "event_time", label: "发生时间" },
    { key: "external_url", label: "外部链接" },
  ],
  local_info: [
    { key: "title", label: "资讯标题" },
    { key: "source", label: "来源" },
    { key: "summary", label: "摘要" },
    { key: "location", label: "地点" },
    { key: "event_time", label: "时间" },
  ],
  guide: [
    { key: "title", label: "攻略标题" },
    { key: "summary", label: "摘要" },
    { key: "cover_image", label: "封面链接" },
    { key: "last_updated_at", label: "最后更新" },
  ],
  question: [
    { key: "question", label: "问题" },
    { key: "category", label: "分类" },
  ],
  rant: [
    { key: "title", label: "标题" },
    { key: "category", label: "分类" },
  ],
  secondhand: [
    { key: "title", label: "标题", placeholder: "宜家桌椅 / iPhone / 搬家甩卖" },
    { key: "price", label: "价格", type: "number" },
    { key: "currency", label: "货币", placeholder: "JPY / CNY / USD" },
    { key: "condition", label: "成色", placeholder: "全新 / 9成新" },
    { key: "trade_method", label: "交易方式", placeholder: "自取 / 邮寄 / 面交" },
    { key: "area", label: "区域", placeholder: "新宿 / 徐汇 / Irvine" },
    { key: "status", label: "状态", placeholder: "available / reserved / sold" },
  ],
  housing: [
    { key: "title", label: "标题", placeholder: "1LDK 转租 / 合租找室友" },
    { key: "rent", label: "租金", type: "number" },
    { key: "currency", label: "货币", placeholder: "JPY / CNY / USD" },
    { key: "room_type", label: "房型", placeholder: "1K / Studio / 主卧" },
    { key: "area", label: "区域" },
    { key: "nearest_station", label: "最近车站" },
    { key: "move_in_date", label: "入住时间" },
    { key: "contact_method", label: "联系方式" },
  ],
  roommate: [
    { key: "title", label: "标题" },
    { key: "rent_range", label: "租金范围" },
    { key: "area", label: "区域" },
    { key: "move_in_date", label: "入住时间" },
    { key: "lifestyle_tags", label: "生活习惯" },
    { key: "requirements", label: "要求" },
    { key: "contact_method", label: "联系方式" },
  ],
  job_seek: [
    { key: "desired_job", label: "求职方向" },
    { key: "skills", label: "技能" },
    { key: "languages", label: "语言能力" },
    { key: "visa_status", label: "签证状态" },
    { key: "availability", label: "可开始时间" },
    { key: "expected_salary", label: "期望薪资" },
    { key: "contact_method", label: "联系方式" },
  ],
  job_post: [
    { key: "job_title", label: "职位" },
    { key: "company_name", label: "公司 / 店铺" },
    { key: "salary", label: "薪资" },
    { key: "job_type", label: "类型", placeholder: "part_time / full_time / internship / remote" },
    { key: "language_requirement", label: "语言要求" },
    { key: "work_location", label: "工作地点" },
    { key: "contact_method", label: "联系方式" },
  ],
  referral: [
    { key: "job_title", label: "内推职位" },
    { key: "company_name", label: "公司" },
    { key: "work_location", label: "地点" },
    { key: "contact_method", label: "联系方式" },
    { key: "description", label: "说明" },
  ],
  meetup: [
    { key: "title", label: "标题" },
    { key: "meetup_type", label: "小组类型", placeholder: "学习 / 运动 / 语言交换 / 本地活动" },
    { key: "meetup_time", label: "时间" },
    { key: "location", label: "地点" },
    { key: "people_limit", label: "人数", type: "number" },
    { key: "budget", label: "预算" },
  ],
  event: [
    { key: "title", label: "活动标题" },
    { key: "event_time", label: "活动时间" },
    { key: "location", label: "地点" },
    { key: "fee", label: "费用" },
    { key: "capacity", label: "名额", type: "number" },
    { key: "registration_method", label: "报名方式" },
  ],
  dining: [
    { key: "title", label: "标题" },
    { key: "restaurant_or_area", label: "餐厅 / 区域" },
    { key: "meetup_time", label: "时间" },
    { key: "people_limit", label: "人数", type: "number" },
    { key: "budget", label: "预算" },
  ],
  service: [
    { key: "company_name", label: "公司 / 店铺名称" },
    { key: "service_type", label: "服务类型", placeholder: "搬家 / 语言学校 / 签证咨询 / 家政 / 维修" },
    { key: "service_description", label: "服务内容", placeholder: "服务范围、适合人群、交付方式", kind: "textarea" },
    { key: "price_range", label: "价格范围" },
    { key: "contact_method", label: "联系方式" },
    { key: "website", label: "官网 / 预约链接" },
    { key: "address", label: "服务地址 / 覆盖区域" },
    { key: "business_hours", label: "营业时间" },
    { key: "license_info", label: "资质 / 备案信息" },
  ],
  merchant: [
    { key: "merchant_name", label: "商家名称" },
    { key: "company_name", label: "公司主体 / 法人名称" },
    { key: "merchant_type", label: "商家类型", placeholder: "餐饮 / 教育 / 房产 / 招聘 / 本地服务" },
    { key: "service_description", label: "主营服务 / 商品内容", placeholder: "请写清楚提供什么、价格或服务方式", kind: "textarea" },
    { key: "address", label: "地址 / 服务区域" },
    { key: "opening_hours", label: "营业时间" },
    { key: "contact_method", label: "联系方式" },
    { key: "website", label: "官网 / 社媒链接" },
    { key: "license_info", label: "营业执照 / 资质说明" },
  ],
  coupon: [
    { key: "title", label: "优惠标题" },
    { key: "merchant_name", label: "商家名称" },
    { key: "discount_info", label: "优惠信息" },
    { key: "valid_until", label: "有效期" },
    { key: "usage_rules", label: "使用规则" },
    { key: "contact_method", label: "联系方式" },
    { key: "service_description", label: "适用商品 / 服务", kind: "textarea" },
  ],
  warning: [
    { key: "title", label: "避坑标题" },
    { key: "category", label: "分类" },
    { key: "description", label: "详情" },
    { key: "evidence_images", label: "证据图片链接" },
    { key: "review_status", label: "审核状态", placeholder: "under_review / active" },
  ],
  poll: [
    { key: "question", label: "问题" },
    { key: "options", label: "选项", placeholder: "选项 A / 选项 B / 选项 C" },
    { key: "expires_at", label: "截止时间" },
  ],
  anonymous: [
    { key: "title", label: "标题" },
    { key: "description", label: "内容" },
  ],
};

function fieldLabelFor(contentType: ContentType, key: string): string {
  return TYPED_FIELDS[contentType]?.find((field) => field.key === key)?.label || key;
}

function TypedAttributeFields({
  contentType,
  attributes,
  onChange,
}: {
  contentType: ContentType;
  attributes: Record<string, string | boolean>;
  onChange: (key: string, value: string | boolean) => void;
}) {
  if (contentType === "poll") {
    return <PollAttributeFields attributes={attributes} onChange={onChange} />;
  }

  const fields = TYPED_FIELDS[contentType] ?? [
    { key: "title", label: "标题" },
    { key: "summary", label: "摘要" },
  ];

  return (
    <div className="mb-3 grid grid-cols-1 sm:grid-cols-2 gap-2 rounded-kx-md border border-kx-stroke/60 bg-kx-soft/40 p-2.5">
      {fields.map((field) => (
        <label key={field.key} className={clsx("text-xs font-semibold text-kx-muted", field.kind === "textarea" && "sm:col-span-2")}>
          {field.label}
          {field.kind === "textarea" ? (
            <textarea
              className="kx-textarea mt-1 min-h-20 bg-kx-card text-sm"
              placeholder={field.placeholder}
              value={String(attributes[field.key] ?? "")}
              onChange={(e) => onChange(field.key, e.target.value)}
            />
          ) : (
            <input
              className="kx-input h-9 mt-1 bg-kx-card"
              type={field.type || "text"}
              placeholder={field.placeholder}
              value={String(attributes[field.key] ?? "")}
              onChange={(e) => onChange(field.key, e.target.value)}
            />
          )}
        </label>
      ))}
    </div>
  );
}

function PollAttributeFields({
  attributes,
  onChange,
}: {
  attributes: Record<string, string | boolean>;
  onChange: (key: string, value: string | boolean) => void;
}) {
  const options = parsePollOptions(attributes.options);
  const rows = options.length >= POLL_MIN_OPTIONS ? options : ["", ""];
  const setOptions = (next: string[]) => onChange("options", JSON.stringify(next.slice(0, POLL_MAX_OPTIONS)));

  return (
    <div className="mb-3 rounded-kx-md border border-kx-stroke/60 bg-kx-soft/40 p-2.5">
      <label className="text-xs font-semibold text-kx-muted">
        投票问题
        <input
          className="kx-input h-9 mt-1 bg-kx-card"
          placeholder="例如：这个周末大家想去哪？"
          value={String(attributes.question ?? "")}
          onChange={(e) => onChange("question", e.target.value)}
        />
      </label>

      <div className="mt-2 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-kx-muted">选项</span>
          <span className="text-[11px] text-kx-muted">至少 2 个，最多 6 个</span>
        </div>
        {rows.map((option, index) => (
          <div key={index} className="flex items-center gap-2">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-kx-accentSoft text-xs font-black text-kx-accent">
              {index + 1}
            </span>
            <input
              className="kx-input h-9 bg-kx-card"
              placeholder={`选项 ${index + 1}`}
              value={option}
              maxLength={80}
              onChange={(e) => {
                const next = [...rows];
                next[index] = e.target.value;
                setOptions(next);
              }}
            />
            {rows.length > POLL_MIN_OPTIONS ? (
              <button
                type="button"
                className="kx-button-ghost h-9 w-9 p-0"
                onClick={() => setOptions(rows.filter((_, i) => i !== index))}
                aria-label="删除选项"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        ))}
        {rows.length < POLL_MAX_OPTIONS ? (
          <button
            type="button"
            className="kx-button-ghost h-8 px-3 text-xs"
            onClick={() => setOptions([...rows, ""])}
          >
            <Plus className="h-3.5 w-3.5" />
            添加选项
          </button>
        ) : null}
      </div>

      <label className="mt-2 block text-xs font-semibold text-kx-muted">
        截止时间
        <input
          className="kx-input h-9 mt-1 bg-kx-card"
          type="datetime-local"
          value={String(attributes.expires_at ?? "")}
          onChange={(e) => onChange("expires_at", e.target.value)}
        />
      </label>
    </div>
  );
}
