"use client";

import { useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import { FieldShell } from "@/components/design/FieldShell";

export type CaptchaState = { enabled: boolean; captchaId: string; code: string };
export const EMPTY_CAPTCHA: CaptchaState = { enabled: true, captchaId: "", code: "" };

/// Self-contained image-captcha row: input + clickable challenge image.
/// Fetches a challenge on mount and whenever `refreshSignal` bumps (forms
/// bump it after every auth attempt, since the server burns the challenge
/// on each submission). Reports {enabled, captchaId, code} upward via
/// `onState` so the form can attach it to the auth call. Renders nothing
/// when the server has captcha enforcement disabled for this scene.
///
/// NOTE: pass a `useCallback`-stable `onState`, it is deliberately kept
/// out of the effect deps.
export function CaptchaBox({
  scene,
  idPrefix,
  error,
  refreshSignal = 0,
  onState,
  labels,
  className,
}: {
  scene: "login" | "register";
  idPrefix: string;
  error?: string;
  refreshSignal?: number;
  onState: (state: CaptchaState) => void;
  labels: {
    label: string;
    placeholder: string;
    hint: string;
    refresh: string;
    loadFailed: string;
  };
  className?: string;
}) {
  const [enabled, setEnabled] = useState(true);
  const [image, setImage] = useState("");
  const [captchaId, setCaptchaId] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    setCode("");
    api
      .fetchCaptcha(scene)
      .then((res) => {
        if (cancelled) return;
        setEnabled(res.enabled);
        setCaptchaId(res.captcha_id || "");
        setImage(res.image || "");
      })
      .catch(() => {
        if (cancelled) return;
        setFailed(true);
        setCaptchaId("");
        setImage("");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [scene, nonce, refreshSignal]);

  useEffect(() => {
    onState({ enabled, captchaId, code });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onState must be useCallback-stable
  }, [enabled, captchaId, code]);

  if (!enabled) return null;

  return (
    <FieldShell label={labels.label} htmlFor={`${idPrefix}-captcha`} error={error} hint={labels.hint} className={className}>
      <div className="flex gap-2">
        <input
          id={`${idPrefix}-captcha`}
          className="kx-input min-w-0 flex-1"
          inputMode="text"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={8}
          placeholder={labels.placeholder}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/[^0-9a-zA-Z]/g, "").toUpperCase())}
          aria-invalid={!!error || undefined}
          aria-describedby={error ? `${idPrefix}-captcha-error` : undefined}
        />
        <button
          type="button"
          onClick={() => setNonce((v) => v + 1)}
          disabled={loading}
          className="h-11 shrink-0 overflow-hidden rounded-kx-lg border border-kx-stroke bg-white transition hover:border-kx-accent/45 focus:outline-none focus:ring-2 focus:ring-kx-accent/35 disabled:opacity-60"
          aria-label={labels.refresh}
          title={labels.refresh}
        >
          {loading ? (
            <span className="flex h-full w-[120px] items-center justify-center">
              <Loader2 className="h-4 w-4 animate-spin text-kx-muted" />
            </span>
          ) : failed || !image ? (
            <span className="flex h-full w-[120px] items-center justify-center gap-1 px-2 text-[11px] font-bold text-kx-muted">
              <RefreshCw className="h-3.5 w-3.5 shrink-0" />
              {labels.loadFailed}
            </span>
          ) : (
            // Inline data-URI PNG from the backend — next/image adds nothing here.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image} alt={labels.label} className="h-full w-auto select-none" draggable={false} />
          )}
        </button>
      </div>
    </FieldShell>
  );
}
