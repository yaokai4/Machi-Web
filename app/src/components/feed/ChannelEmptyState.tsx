"use client";

import { PlusCircle } from "lucide-react";
import { useCompose } from "@/lib/store";
import { CONTENT_TYPE_LABELS, type ContentType } from "@/lib/types";

interface Copy {
  icon: string;
  title: string;
  body: string;
  cta: string;
  tint: string;
}

const COPY: Partial<Record<ContentType, Copy>> = {
  secondhand: { icon: "🏷️", title: "这里还没有二手内容", body: "发布第一个闲置吧。其他人会看到你的物品。", cta: "发布二手", tint: "bg-emerald-500" },
  housing: { icon: "🏠", title: "还没有租房信息", body: "发布转租、合租或找室友,帮新到的人找到家。", cta: "发布租房", tint: "bg-blue-500" },
  roommate: { icon: "👥", title: "还没有找室友的帖子", body: "把你的合租想法发出来,室友会主动联系你。", cta: "发布找室友", tint: "bg-cyan-500" },
  job_post: { icon: "💼", title: "还没有招聘信息", body: "发布本地招聘,把岗位推送给同城求职者。", cta: "发布招聘", tint: "bg-violet-500" },
  job_seek: { icon: "🧑‍💻", title: "还没有求职帖", body: "把你的求职方向告诉同城的人,招聘方会看到。", cta: "发布求职", tint: "bg-emerald-600" },
  meetup: { icon: "🤝", title: "还没有搭子内容", body: "发起一个饭局、学习局或运动局,认识同城的人。", cta: "发布搭子", tint: "bg-orange-500" },
  dining: { icon: "🍱", title: "还没有约饭局", body: "约一顿饭、一杯咖啡,见见同城的朋友。", cta: "发布约饭", tint: "bg-rose-500" },
  event: { icon: "📅", title: "还没有活动", body: "发布本地活动,把线下聚会同步给社群。", cta: "发布活动", tint: "bg-purple-500" },
  guide: { icon: "📖", title: "这里还没有攻略", body: "分享你的城市经验,帮助后来的人少走弯路。", cta: "写攻略", tint: "bg-teal-500" },
  news: { icon: "📰", title: "还没有本地资讯", body: "发布一条本地快讯,把信息同步给社群。", cta: "发布资讯", tint: "bg-sky-500" },
  local_info: { icon: "📣", title: "还没有本地告示", body: "把社区公告 / 提醒发出来。", cta: "发布告示", tint: "bg-orange-600" },
  question: { icon: "❓", title: "还没有问答", body: "提出你的生活疑问,本地人会来回答。", cta: "提个问", tint: "bg-indigo-500" },
  service: { icon: "🛠️", title: "还没有服务", body: "发布搬家、签证、辅导等本地服务。", cta: "发布服务", tint: "bg-amber-600" },
  merchant: { icon: "🏪", title: "还没有商家", body: "把你的店推介给同城人,从认证开始。", cta: "认证商家", tint: "bg-teal-600" },
  coupon: { icon: "🎟️", title: "还没有优惠", body: "发布折扣或活动,让更多人到店。", cta: "发布优惠", tint: "bg-pink-500" },
  warning: { icon: "⚠️", title: "还没有避坑信息", body: "把你踩过的坑告诉大家,大家都能少走弯路。", cta: "写避坑", tint: "bg-red-500" },
  dynamic: { icon: "💬", title: "这里还没有动态", body: "和大家聊聊近况,看看本地正在发生什么。", cta: "发动态", tint: "bg-blue-500" },
  image_post: { icon: "🖼️", title: "还没有图文", body: "上传几张照片,把生活分享给本地人。", cta: "发图文", tint: "bg-indigo-500" },
  long_post: { icon: "📝", title: "还没有长文", body: "把你的本地观察写下来。", cta: "写长文", tint: "bg-slate-500" },
  rant: { icon: "📢", title: "还没有吐槽", body: "把想吐的槽说出来,别人会有共鸣。", cta: "发吐槽", tint: "bg-pink-600" },
  referral: { icon: "🪪", title: "还没有内推机会", body: "把你公司的岗位发出来,帮同胞拿 offer。", cta: "发布内推", tint: "bg-indigo-600" },
  poll: { icon: "📊", title: "还没有投票", body: "发起一个选项投票,听听本地朋友的看法。", cta: "发布投票", tint: "bg-sky-600" },
  anonymous: { icon: "🌙", title: "树洞里还没有声音", body: "匿名说说心里话。", cta: "进树洞", tint: "bg-slate-600" },
};

/// Mirrors iOS `ChannelEmptyState`. Click the CTA → opens the global
/// composer with the matching ContentType pre-selected (web composer
/// reads compose store).
export function ChannelEmptyState({ contentType }: { contentType: ContentType }) {
  const open = useCompose((s) => s.open);
  const copy = COPY[contentType] || {
    icon: "✨",
    title: `还没有${CONTENT_TYPE_LABELS[contentType]}内容`,
    body: "成为第一个在这里发布的人。",
    cta: `发布${CONTENT_TYPE_LABELS[contentType]}`,
    tint: "bg-kx-accent",
  };

  return (
    <div className="kx-card text-center py-8 px-6">
      <div className="text-4xl mb-3">{copy.icon}</div>
      <div className="text-base font-bold text-kx-text">{copy.title}</div>
      <div className="text-sm text-kx-muted mt-1.5 mx-auto max-w-md">{copy.body}</div>
      <button
        type="button"
        onClick={() =>
          open({
            // Pre-fill an empty draft pre-selecting this channel's
            // content type so the composer lands on the right form.
            initialTags: [],
            initialContentType: contentType,
          })
        }
        className={`mt-4 inline-flex items-center gap-1.5 px-4 h-10 rounded-full text-white text-sm font-bold ${copy.tint} hover:opacity-95`}
      >
        <PlusCircle className="w-4 h-4" />
        {copy.cta}
      </button>
    </div>
  );
}
