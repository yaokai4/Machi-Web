"use client";

// 创建活动 —— 人人都能办活动。封面 + 名称 + 时间 + 地点必核心,
// 其余全部可选;发布即生成 /events/{slug} 专属页。可在发布前配置
// 报名表单字段(文本/单选/勾选,必填可选)。

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { CalendarPlus, ImagePlus, Loader2, Plus, Trash2 } from "lucide-react";
import { AppShell } from "@/components/shell/AppShell";
import { api } from "@/lib/api";
import { sameOriginApiUrl } from "@/lib/media";
import { eventStyle, EVENT_CATEGORY_KEYS } from "@/components/social/socialStyle";


interface DraftField {
  key: number;
  label: string;
  field_type: "text" | "select" | "checkbox";
  optionsText: string;
  required: boolean;
}

export default function CreateEventPage() {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("party");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [venueName, setVenueName] = useState("");
  const [address, setAddress] = useState("");
  const [capacity, setCapacity] = useState("");
  const [priceText, setPriceText] = useState("");
  const [externalUrl, setExternalUrl] = useState("");
  const [coverUrl, setCoverUrl] = useState("");
  const [coverUploading, setCoverUploading] = useState(false);
  const [fields, setFields] = useState<DraftField[]>([]);
  const [error, setError] = useState("");

  const create = useMutation({
    mutationFn: () => {
      const form_fields = fields
        .filter((f) => f.label.trim())
        .map((f, index) => ({
          label: f.label.trim(),
          field_type: f.field_type,
          options: f.field_type === "select" ? f.optionsText.split(/[,，、/]+/).map((s) => s.trim()).filter(Boolean) : [],
          required: f.required,
          sort_order: index,
        }));
      return api.createEvent({
        title: title.trim(),
        subtitle: subtitle.trim(),
        description: description.trim(),
        category,
        cover_url: coverUrl,
        starts_at: startsAt ? new Date(startsAt).toISOString() : "",
        ends_at: endsAt ? new Date(endsAt).toISOString() : "",
        venue_name: venueName.trim(),
        address: address.trim(),
        country_code: "jp",
        capacity: capacity ? Math.max(0, parseInt(capacity, 10) || 0) : 0,
        price_text: priceText.trim(),
        external_url: externalUrl.trim(),
        form_fields,
      });
    },
    onSuccess: (event) => router.push(`/events/${encodeURIComponent(event.slug || event.id)}`),
    onError: (err: Error) => setError(err.message || "发布失败,请稍后再试"),
  });

  async function handleCover(file: File | undefined) {
    if (!file) return;
    setCoverUploading(true);
    setError("");
    try {
      const uploaded = await api.uploadFile(file, { purpose: "post_image", entityType: "event" });
      const media = uploaded.media as { publicUrl?: string; url?: string };
      setCoverUrl(media.publicUrl || media.url || "");
    } catch (err) {
      setError((err as Error).message || "封面上传失败");
    } finally {
      setCoverUploading(false);
    }
  }

  const canSubmit = title.trim() && startsAt && !create.isPending && !coverUploading;

  return (
    <AppShell requireAuth right={null}>
      <header className="kx-glass-bar sticky top-0 z-30 px-4 py-3">
        <div className="flex items-center gap-2">
          <CalendarPlus className="h-5 w-5 text-kx-accent" />
          <h1 className="text-xl font-black">创建活动</h1>
        </div>
        <p className="mt-1 text-sm text-kx-muted">发布后会生成专属活动页和分享链接,和 App 端完全同步。</p>
      </header>

      <main className="mx-auto max-w-2xl space-y-5 px-4 py-5">
        {/* 封面 */}
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          className="relative block w-full overflow-hidden rounded-3xl border border-dashed border-kx-stroke/80 bg-kx-soft/60 transition hover:border-kx-accent/50"
        >
          {coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={sameOriginApiUrl(coverUrl)} alt="封面" className="aspect-[16/9] w-full object-cover" />
          ) : (
            <div className="flex aspect-[16/9] w-full flex-col items-center justify-center gap-2 text-kx-muted">
              <ImagePlus className="h-8 w-8" />
              <span className="text-xs font-black">添加封面(推荐 16:9)</span>
            </div>
          )}
          {coverUploading ? (
            <div className="absolute inset-0 grid place-items-center bg-black/40">
              <Loader2 className="h-7 w-7 animate-spin text-white" />
            </div>
          ) : null}
        </button>
        <input ref={fileInput} type="file" accept="image/*" hidden onChange={(e) => handleCover(e.target.files?.[0])} />

        {/* 分类 */}
        <div className="flex flex-wrap gap-1.5">
          {[...EVENT_CATEGORY_KEYS, "other"].map((key) => {
            const style = eventStyle(key);
            const Icon = style.icon;
            const active = category === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setCategory(key)}
                className={`inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-xs font-black transition ${
                  active ? "bg-kx-accent text-white shadow" : `${style.softBg} ${style.text} hover:opacity-80`
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {style.labelZh}
              </button>
            );
          })}
        </div>

        {/* 基本信息 */}
        <div className="kx-card space-y-4 p-4 sm:p-5">
          <label className="block space-y-1.5">
            <span className="text-xs font-black text-kx-muted">活动名称 <span className="text-red-500">*</span></span>
            <input className="kx-input text-base font-bold" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例如 涩谷读书会 × Machi" maxLength={120} />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-black text-kx-muted">一句话副标题(可选)</span>
            <input className="kx-input" value={subtitle} onChange={(e) => setSubtitle(e.target.value)} placeholder="例如 本月主题:村上春树" maxLength={200} />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-black text-kx-muted">活动详情</span>
            <textarea
              className="kx-input min-h-[140px] resize-y py-3"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="流程、费用说明、要带什么、适合谁来…"
            />
          </label>
        </div>

        {/* 时间 + 地点 */}
        <div className="kx-card space-y-4 p-4 sm:p-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block space-y-1.5">
              <span className="text-xs font-black text-kx-muted">开始时间 <span className="text-red-500">*</span></span>
              <input type="datetime-local" className="kx-input" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-black text-kx-muted">结束时间(可选)</span>
              <input type="datetime-local" className="kx-input" value={endsAt} min={startsAt} onChange={(e) => setEndsAt(e.target.value)} />
            </label>
          </div>
          <label className="block space-y-1.5">
            <span className="text-xs font-black text-kx-muted">场地名</span>
            <input className="kx-input" value={venueName} onChange={(e) => setVenueName(e.target.value)} placeholder="例如 SHIBUYA BOOK LOUNGE" maxLength={160} />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-black text-kx-muted">详细地址(可选)</span>
            <input className="kx-input" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="东京都涩谷区…" maxLength={300} />
          </label>
        </div>

        {/* 更多设置 */}
        <div className="kx-card space-y-4 p-4 sm:p-5">
          <p className="text-xs font-black uppercase tracking-wider text-kx-muted">更多设置(都是可选)</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block space-y-1.5">
              <span className="text-xs font-black text-kx-muted">名额上限(空 = 不限)</span>
              <input type="number" min={0} className="kx-input" value={capacity} onChange={(e) => setCapacity(e.target.value)} placeholder="例如 30" />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-black text-kx-muted">费用展示</span>
              <input className="kx-input" value={priceText} onChange={(e) => setPriceText(e.target.value)} placeholder="例如 免费 / ¥1,500(现场付)" maxLength={60} />
            </label>
          </div>
          <label className="block space-y-1.5">
            <span className="text-xs font-black text-kx-muted">合作方售票/详情链接</span>
            <input className="kx-input" value={externalUrl} onChange={(e) => setExternalUrl(e.target.value)} placeholder="https://…" maxLength={500} />
          </label>
          <p className="text-[11px] font-semibold text-kx-muted/80">Machi 不代收任何费用;需要售票请使用合作方链接。</p>
        </div>

        {/* 报名表单字段 */}
        <div className="kx-card space-y-4 p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-wider text-kx-muted">报名表单字段</p>
              <p className="mt-0.5 text-[11px] font-semibold text-kx-muted/80">让报名者填写称呼、联系方式等;发布后仍可在「管理」里修改。</p>
            </div>
            <button
              type="button"
              onClick={() => setFields((prev) => [...prev, { key: Date.now(), label: "", field_type: "text", optionsText: "", required: false }])}
              className="inline-flex h-9 items-center gap-1 rounded-full bg-kx-accent/10 px-3 text-xs font-black text-kx-accent hover:bg-kx-accent/15"
            >
              <Plus className="h-3.5 w-3.5" /> 加一个
            </button>
          </div>
          {fields.length === 0 ? (
            <p className="text-xs font-semibold text-kx-muted">不加字段 = 一键报名。</p>
          ) : (
            <div className="space-y-3">
              {fields.map((field, index) => (
                <div key={field.key} className="space-y-2 rounded-2xl border border-kx-stroke/50 p-3">
                  <div className="flex items-center gap-2">
                    <input
                      className="kx-input h-10 flex-1"
                      value={field.label}
                      onChange={(e) => setFields((prev) => prev.map((f, i) => (i === index ? { ...f, label: e.target.value } : f)))}
                      placeholder="字段名,例如 怎么称呼你"
                      maxLength={120}
                    />
                    <button
                      type="button"
                      onClick={() => setFields((prev) => prev.filter((_, i) => i !== index))}
                      className="rounded-full p-2 text-kx-muted hover:bg-kx-soft hover:text-kx-heat"
                      aria-label="删除字段"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs font-black">
                    {(["text", "select", "checkbox"] as const).map((kind) => (
                      <button
                        key={kind}
                        type="button"
                        onClick={() => setFields((prev) => prev.map((f, i) => (i === index ? { ...f, field_type: kind } : f)))}
                        className={`rounded-full px-3 py-1.5 transition ${field.field_type === kind ? "bg-kx-accent text-white" : "bg-kx-soft text-kx-muted hover:text-kx-text"}`}
                      >
                        {kind === "text" ? "文本" : kind === "select" ? "单选" : "勾选"}
                      </button>
                    ))}
                    <label className="ml-auto inline-flex cursor-pointer items-center gap-1.5">
                      <input
                        type="checkbox"
                        checked={field.required}
                        onChange={(e) => setFields((prev) => prev.map((f, i) => (i === index ? { ...f, required: e.target.checked } : f)))}
                        className="h-3.5 w-3.5 accent-[rgb(var(--kx-accent))]"
                      />
                      必填
                    </label>
                  </div>
                  {field.field_type === "select" ? (
                    <input
                      className="kx-input h-10"
                      value={field.optionsText}
                      onChange={(e) => setFields((prev) => prev.map((f, i) => (i === index ? { ...f, optionsText: e.target.value } : f)))}
                      placeholder="选项,用逗号分隔:小说, 随笔, 都行"
                    />
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>

        {error ? <p className="text-sm font-bold text-red-500">{error}</p> : null}

        <button
          type="button"
          disabled={!canSubmit}
          onClick={() => create.mutate()}
          className="kx-button-primary h-12 w-full rounded-full text-sm font-black disabled:opacity-50"
        >
          {create.isPending ? "发布中…" : "发布活动"}
        </button>
      </main>
    </AppShell>
  );
}
