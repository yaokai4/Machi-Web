"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowUpRight,
  BedDouble,
  CalendarClock,
  CheckCircle2,
  ExternalLink,
  MessageSquare,
  Plus,
  Send,
  Star,
  Store,
  Tag,
  Utensils,
  XCircle,
} from "lucide-react";
import { api, APIError } from "@/lib/api";
import type { KXCityListing, KXListingInquiry, KXListingReview } from "@/lib/types";
import { ErrorState, SectionLoading } from "@/components/design/States";
import { Avatar } from "@/components/design/Avatar";
import { useToasts } from "@/lib/store";
import { RatingStars } from "@/components/listings/ListingKit";
import { cleanListingText, formatInquiryStatus, formatInquiryType, formatListingStatus, formatPrice } from "@/lib/listingFormat";

/// 商家服务管理面板：本地服务 + 优惠的上下架与状态流转。
export function MerchantListingsPanel() {
  const pushToast = useToasts((s) => s.push);
  const queryClient = useQueryClient();
  const listings = useQuery({
    queryKey: ["merchant-listings"],
    queryFn: async () => {
      const [services, discounts] = await Promise.all([
        api.myListings("local_service"),
        api.myListings("discount"),
      ]);
      return [...services, ...discounts].sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")));
    },
  });
  const setStatus = useMutation({
    mutationFn: (vars: { id: string; status: string }) => api.updateListing(vars.id, { status: vars.status }),
    onSuccess: () => {
      pushToast({ kind: "success", message: "状态已更新。" });
      queryClient.invalidateQueries({ queryKey: ["merchant-listings"] });
      queryClient.invalidateQueries({ queryKey: ["business-dashboard"] });
    },
    onError: (e) => pushToast({ kind: "error", message: (e as APIError).message }),
  });
  if (listings.isLoading) return <SectionLoading title="正在加载服务" rows={3} />;
  if (listings.isError) return <ErrorState title="服务列表暂时无法加载" onRetry={() => listings.refetch()} />;
  const items = listings.data || [];
  return (
    <section className="rounded-[28px] border border-slate-200/70 bg-white/95 p-5 shadow-[0_18px_58px_-42px_rgba(15,23,42,0.5)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-black text-slate-950">服务管理</h2>
          <p className="mt-1 text-sm font-semibold text-slate-500">上下架、标记满约、维护价格与库存状态。</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/listings/create?type=local_service" className="inline-flex h-10 items-center gap-1.5 rounded-full bg-orange-500 px-4 text-xs font-black text-white shadow-sm transition hover:bg-orange-600">
            <Plus className="h-3.5 w-3.5" />
            发布服务
          </Link>
          <Link href="/listings/create?type=local_service&category=日本料理" className="inline-flex h-10 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-4 text-xs font-black text-slate-700 transition hover:border-rose-300 hover:text-rose-600">
            <Utensils className="h-3.5 w-3.5" />
            发布餐厅
          </Link>
          <Link href="/listings/create?type=local_service&category=民宿" className="inline-flex h-10 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-4 text-xs font-black text-slate-700 transition hover:border-cyan-300 hover:text-cyan-700">
            <BedDouble className="h-3.5 w-3.5" />
            发布住宿
          </Link>
          <Link href="/listings/create?type=discount" className="inline-flex h-10 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-4 text-xs font-black text-slate-700 transition hover:border-orange-300">
            <Tag className="h-3.5 w-3.5" />
            发布优惠
          </Link>
        </div>
      </div>
      <div className="mt-4 space-y-3">
        {items.map((listing) => (
          <MerchantListingRow
            key={listing.id}
            listing={listing}
            pending={setStatus.isPending}
            onStatus={(status) => setStatus.mutate({ id: listing.id, status })}
          />
        ))}
        {!items.length ? (
          <p className="rounded-2xl bg-slate-50 p-5 text-sm font-semibold text-slate-500">
            还没有发布服务。从「发布服务」开始，支持餐厅美食（在线订座）、民宿酒店、景点门票、一日游、接送机、翻译手续、搬家维修等类目。
          </p>
        ) : null}
      </div>
    </section>
  );
}

function MerchantListingRow({ listing, pending, onStatus }: { listing: KXCityListing; pending: boolean; onStatus: (status: string) => void }) {
  const cover = listing.card?.coverUrl || listing.coverUrl || listing.cover_url || "";
  const published = listing.status === "published";
  return (
    <div className="grid gap-3 rounded-2xl border border-slate-200/70 bg-white p-3 sm:grid-cols-[96px_1fr_auto] sm:items-center">
      <Link href={`/listings/${encodeURIComponent(listing.id)}`} className="relative block aspect-[4/3] overflow-hidden rounded-xl bg-slate-100 sm:aspect-square">
        {cover ? (
          <Image src={cover} alt={listing.title} fill sizes="96px" className="object-cover" unoptimized />
        ) : (
          <span className="absolute inset-0 grid place-items-center text-orange-400"><Store className="h-6 w-6" /></span>
        )}
      </Link>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="truncate text-sm font-black text-slate-950">{cleanListingText(listing.title) || "服务"}</h3>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${published ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
            {formatListingStatus(listing.status, listing.type)}
          </span>
        </div>
        <p className="mt-1 text-xs font-bold text-slate-400">
          {listing.category || "服务"} · {formatPrice(listing.price ?? null, listing.currency || "JPY")} · 浏览 {listing.view_count || 0} · 咨询 {listing.inquiry_count || 0}
        </p>
        {Number(listing.rating_count || 0) > 0 ? (
          <p className="mt-1"><RatingStars value={Number(listing.rating_avg || 0)} count={Number(listing.rating_count || 0)} /></p>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-1.5 sm:flex-col">
        {published ? (
          <button type="button" disabled={pending} onClick={() => onStatus("hidden")} className="inline-flex h-8 items-center justify-center rounded-full border border-slate-200 px-3 text-[11px] font-black text-slate-600 transition hover:border-amber-300 hover:text-amber-700 disabled:opacity-50">
            下架
          </button>
        ) : (
          <button type="button" disabled={pending} onClick={() => onStatus("published")} className="inline-flex h-8 items-center justify-center rounded-full bg-emerald-600 px-3 text-[11px] font-black text-white transition hover:bg-emerald-700 disabled:opacity-50">
            上架
          </button>
        )}
        <Link href={`/listings/${encodeURIComponent(listing.id)}`} className="inline-flex h-8 items-center justify-center gap-1 rounded-full border border-slate-200 px-3 text-[11px] font-black text-slate-600 transition hover:border-blue-300 hover:text-blue-700">
          查看
          <ExternalLink className="h-3 w-3" />
        </Link>
      </div>
    </div>
  );
}

/// 线索与预订面板：收到的咨询/预约/报名，可流转状态并跳转对话。
export function MerchantLeadsPanel() {
  const pushToast = useToasts((s) => s.push);
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("");
  const leads = useQuery({
    queryKey: ["merchant-leads", statusFilter],
    queryFn: () => api.myListingInquiries({ role: "received", status: statusFilter || undefined }),
  });
  const update = useMutation({
    mutationFn: (vars: { id: string; status: string }) => api.updateListingInquiry(vars.id, { status: vars.status }),
    onSuccess: () => {
      pushToast({ kind: "success", message: "线索状态已更新。" });
      queryClient.invalidateQueries({ queryKey: ["merchant-leads"] });
      queryClient.invalidateQueries({ queryKey: ["business-dashboard"] });
    },
    onError: (e) => pushToast({ kind: "error", message: (e as APIError).message }),
  });
  const items = leads.data || [];
  return (
    <section className="rounded-[28px] border border-slate-200/70 bg-white/95 p-5 shadow-[0_18px_58px_-42px_rgba(15,23,42,0.5)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-black text-slate-950">线索与预订</h2>
          <p className="mt-1 text-sm font-semibold text-slate-500">咨询、预约、报名集中处理：回复后标记，成交后关闭。</p>
        </div>
        <div className="flex gap-1.5">
          {[["", "全部"], ["new", "新线索"], ["replied", "已回复"], ["closed", "已关闭"]].map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setStatusFilter(value)}
              data-active={statusFilter === value}
              className="h-9 rounded-full border border-slate-200 bg-white px-3 text-xs font-black text-slate-600 transition data-[active=true]:border-slate-950 data-[active=true]:bg-slate-950 data-[active=true]:text-white"
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {leads.isLoading ? (
        <div className="mt-4"><SectionLoading title="正在加载线索" rows={3} /></div>
      ) : leads.isError ? (
        <div className="mt-4"><ErrorState title="线索暂时无法加载" onRetry={() => leads.refetch()} /></div>
      ) : (
        <div className="mt-4 space-y-3">
          {items.map((inquiry) => (
            <MerchantLeadRow key={inquiry.id} inquiry={inquiry} pending={update.isPending} onStatus={(status) => update.mutate({ id: inquiry.id, status })} />
          ))}
          {!items.length ? (
            <p className="rounded-2xl bg-slate-50 p-5 text-sm font-semibold text-slate-500">
              暂无{statusFilter === "new" ? "新" : ""}线索。服务发布并通过审核后，用户的咨询和预订会出现在这里。
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
}

function MerchantLeadRow({ inquiry, pending, onStatus }: { inquiry: KXListingInquiry; pending: boolean; onStatus: (status: string) => void }) {
  const fromUser = inquiry.from_user || inquiry.fromUser;
  const conversation = inquiry.conversation_id || inquiry.conversationId;
  const details = Array.isArray(inquiry.details) ? inquiry.details : Array.isArray((inquiry.metadata || {}).details) ? ((inquiry.metadata || {}).details as { label: string; value: string }[]) : [];
  const status = inquiry.status || "new";
  return (
    <div className="rounded-2xl border border-slate-200/70 bg-white p-3.5">
      <div className="flex items-center gap-2.5">
        <Avatar user={fromUser || undefined} size={36} />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 text-sm font-black text-slate-950">
            <span className="truncate">{fromUser?.display_name || fromUser?.handle || "Machi 用户"}</span>
            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-black text-blue-600">{formatInquiryType(inquiry.type)}</span>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${status === "new" ? "bg-orange-50 text-orange-600" : status === "replied" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
              {formatInquiryStatus(status)}
            </span>
          </p>
          <p className="mt-0.5 truncate text-xs font-bold text-slate-400">
            {(inquiry.listing && cleanListingText(inquiry.listing.title)) || "服务"} · {(inquiry.created_at || "").slice(0, 16).replace("T", " ")}
          </p>
        </div>
      </div>
      {inquiry.message ? <p className="mt-2.5 whitespace-pre-line rounded-xl bg-slate-50 p-3 text-sm leading-6 text-slate-700">{inquiry.message}</p> : null}
      {details.length ? (
        <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
          {details.map((d) => (
            <p key={d.label} className="rounded-lg bg-amber-50/70 px-2.5 py-1.5 text-xs font-bold text-amber-900 ring-1 ring-amber-100">
              <span className="text-amber-600">{d.label}：</span>{d.value}
            </p>
          ))}
        </div>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {conversation ? (
          <Link href={`/messages/${encodeURIComponent(conversation)}`} className="inline-flex h-8 items-center gap-1 rounded-full bg-slate-950 px-3 text-[11px] font-black text-white">
            <MessageSquare className="h-3 w-3" />
            打开对话
          </Link>
        ) : null}
        {status === "new" ? (
          <button type="button" disabled={pending} onClick={() => onStatus("replied")} className="inline-flex h-8 items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-3 text-[11px] font-black text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-50">
            <CheckCircle2 className="h-3 w-3" />
            标记已回复
          </button>
        ) : null}
        {status !== "closed" ? (
          <button type="button" disabled={pending} onClick={() => onStatus("closed")} className="inline-flex h-8 items-center gap-1 rounded-full border border-slate-200 px-3 text-[11px] font-black text-slate-500 transition hover:border-slate-400 disabled:opacity-50">
            <XCircle className="h-3 w-3" />
            关闭
          </button>
        ) : (
          <button type="button" disabled={pending} onClick={() => onStatus("new")} className="inline-flex h-8 items-center gap-1 rounded-full border border-slate-200 px-3 text-[11px] font-black text-slate-500 transition hover:border-blue-300 hover:text-blue-600 disabled:opacity-50">
            <CalendarClock className="h-3 w-3" />
            重新打开
          </button>
        )}
      </div>
    </div>
  );
}

/// 点评管理面板：查看与回复用户点评。
export function MerchantReviewsPanel() {
  const pushToast = useToasts((s) => s.push);
  const queryClient = useQueryClient();
  const [replyFor, setReplyFor] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const reviews = useQuery({
    queryKey: ["merchant-reviews"],
    queryFn: () => api.myBusinessReviews(),
  });
  const reply = useMutation({
    mutationFn: (vars: { listingId: string; reviewId: string; content: string }) =>
      api.replyListingReview(vars.listingId, vars.reviewId, vars.content),
    onSuccess: () => {
      setReplyFor(null);
      setReplyText("");
      pushToast({ kind: "success", message: "回复已发布，用户会收到通知。" });
      queryClient.invalidateQueries({ queryKey: ["merchant-reviews"] });
    },
    onError: (e) => pushToast({ kind: "error", message: (e as APIError).message }),
  });
  if (reviews.isLoading) return <SectionLoading title="正在加载点评" rows={3} />;
  if (reviews.isError) return <ErrorState title="点评暂时无法加载" onRetry={() => reviews.refetch()} />;
  const items = reviews.data?.items || [];
  const summary = reviews.data?.summary;
  return (
    <section className="rounded-[28px] border border-slate-200/70 bg-white/95 p-5 shadow-[0_18px_58px_-42px_rgba(15,23,42,0.5)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-black text-slate-950">点评管理</h2>
          <p className="mt-1 text-sm font-semibold text-slate-500">认真回复每条点评能显著提升转化与信任。</p>
        </div>
        {summary && summary.count > 0 ? (
          <div className="flex items-center gap-3 rounded-2xl bg-amber-50 px-4 py-2 ring-1 ring-amber-100">
            <span className="flex items-center gap-1 text-lg font-black text-amber-600">
              <Star className="h-4.5 w-4.5 fill-amber-400 text-amber-400" />
              {summary.rating_avg.toFixed(1)}
            </span>
            <span className="text-xs font-bold text-slate-500">{summary.count} 条点评 · {summary.unreplied} 条待回复</span>
          </div>
        ) : null}
      </div>
      <div className="mt-4 space-y-4">
        {items.map((review) => (
          <MerchantReviewRow
            key={review.id}
            review={review}
            replying={replyFor === review.id}
            replyText={replyText}
            pending={reply.isPending}
            onStartReply={() => { setReplyFor(review.id); setReplyText(""); }}
            onChangeReply={setReplyText}
            onSubmitReply={() => {
              if (!replyText.trim()) return;
              reply.mutate({ listingId: review.listing_id, reviewId: review.id, content: replyText.trim() });
            }}
          />
        ))}
        {!items.length ? (
          <p className="rounded-2xl bg-slate-50 p-5 text-sm font-semibold text-slate-500">
            还没有收到点评。服务成交后引导用户在详情页留下体验点评。
          </p>
        ) : null}
      </div>
    </section>
  );
}

function MerchantReviewRow({
  review,
  replying,
  replyText,
  pending,
  onStartReply,
  onChangeReply,
  onSubmitReply,
}: {
  review: KXListingReview;
  replying: boolean;
  replyText: string;
  pending: boolean;
  onStartReply: () => void;
  onChangeReply: (value: string) => void;
  onSubmitReply: () => void;
}) {
  return (
    <article className="rounded-2xl border border-slate-200/70 bg-white p-3.5">
      <div className="flex items-center gap-2.5">
        <Avatar user={review.author || undefined} size={36} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-black text-slate-900">{review.author?.display_name || review.author?.handle || "Machi 用户"}</p>
          <p className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
            <RatingStars value={review.rating} showValue={false} />
            <span className="font-bold">{(review.created_at || "").slice(0, 10)}</span>
            {review.listing_title ? (
              <Link href={`/listings/${encodeURIComponent(review.listing_id)}`} className="inline-flex items-center gap-0.5 truncate font-bold text-blue-500 hover:text-blue-600">
                {review.listing_title}
                <ArrowUpRight className="h-3 w-3" />
              </Link>
            ) : null}
          </p>
        </div>
      </div>
      {review.content ? <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-700">{review.content}</p> : null}
      {review.owner_reply ? (
        <div className="mt-2.5 rounded-xl bg-emerald-50/60 p-3 ring-1 ring-emerald-100">
          <p className="flex items-center gap-1 text-xs font-black text-emerald-700"><Store className="h-3.5 w-3.5" /> 我的回复</p>
          <p className="mt-1 text-sm leading-6 text-slate-600">{review.owner_reply}</p>
        </div>
      ) : replying ? (
        <div className="mt-2.5 flex gap-2">
          <input
            value={replyText}
            onChange={(e) => onChangeReply(e.target.value)}
            maxLength={1000}
            placeholder="感谢点评 / 说明改进…"
            className="kx-input h-10 flex-1 px-3 text-sm"
          />
          <button
            type="button"
            disabled={pending || !replyText.trim()}
            onClick={onSubmitReply}
            className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-slate-950 px-4 text-xs font-black text-white disabled:opacity-50"
          >
            <Send className="h-3.5 w-3.5" />
            回复
          </button>
        </div>
      ) : (
        <button type="button" onClick={onStartReply} className="mt-2 text-xs font-black text-blue-600 transition hover:text-blue-700">
          回复点评
        </button>
      )}
    </article>
  );
}
