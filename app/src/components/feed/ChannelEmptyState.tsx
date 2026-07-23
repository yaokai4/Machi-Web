"use client";

import { PlusCircle } from "lucide-react";
import { useAuthPrompt, useCompose, useSession } from "@/lib/store";
import { type ContentType } from "@/lib/types";
import { useI18n, type Locale } from "@/lib/i18n";

// Per-channel icon. The old per-channel CTA tint (24 raw Tailwind hues) is
// gone — every CTA is the single 墨绿 accent so empty states read as one
// product; the emoji alone carries the channel identity.
interface Copy {
  title: string;
  body: string;
  cta: string;
}

const ICON: Partial<Record<ContentType, string>> = {
  secondhand: "🏷️",
  housing: "🏠",
  roommate: "👥",
  job_post: "💼",
  job_seek: "🧑‍💻",
  meetup: "🤝",
  dining: "🍱",
  event: "📅",
  guide: "📖",
  news: "📰",
  local_info: "📣",
  question: "❓",
  service: "🛠️",
  merchant: "🏪",
  coupon: "🎟️",
  warning: "⚠️",
  dynamic: "💬",
  image_post: "🖼️",
  long_post: "📝",
  rant: "📢",
  referral: "🪪",
  poll: "📊",
  anonymous: "🌙",
};

// Localized empty-state copy for every channel. Non-Chinese users must
// never fall through to hardcoded Simplified Chinese — this is the primary
// conversion surface for an empty feed / channel.
const TEXT: Record<Locale, Partial<Record<ContentType, Copy>>> = {
  "zh-Hans": {
    secondhand: { title: "这里还没有二手内容", body: "发布第一个闲置吧。其他人会看到你的物品。", cta: "发布二手" },
    housing: { title: "还没有租房信息", body: "发布转租、合租或找室友，帮新到的人找到家。", cta: "发布租房" },
    roommate: { title: "还没有找室友的帖子", body: "把你的合租想法发出来，室友会主动联系你。", cta: "发布找室友" },
    job_post: { title: "还没有招聘信息", body: "发布本地招聘，把岗位推送给同城求职者。", cta: "发布招聘" },
    job_seek: { title: "还没有求职帖", body: "把你的求职方向告诉同城的人，招聘方会看到。", cta: "发布求职" },
    meetup: { title: "还没有小组内容", body: "发起一个学习、运动或语言交换讨论，让本地社区参与进来。", cta: "发布小组" },
    dining: { title: "还没有美食讨论", body: "发布餐厅、咖啡或本地美食活动讨论。", cta: "发布美食" },
    event: { title: "还没有活动", body: "发布本地活动，把线下聚会同步给社群。", cta: "发布活动" },
    guide: { title: "这里还没有攻略", body: "分享你的城市经验，帮助后来的人少走弯路。", cta: "写攻略" },
    news: { title: "还没有本地资讯", body: "发布一条本地快讯，把信息同步给社群。", cta: "发布资讯" },
    local_info: { title: "还没有本地告示", body: "把社区公告 / 提醒发出来。", cta: "发布告示" },
    question: { title: "还没有问答", body: "提出你的生活疑问，本地人会来回答。", cta: "提个问" },
    service: { title: "还没有服务", body: "发布搬家、签证、辅导等本地服务。", cta: "发布服务" },
    merchant: { title: "还没有商家", body: "把你的店推介给同城人，从认证开始。", cta: "认证商家" },
    coupon: { title: "还没有优惠", body: "发布折扣或活动，让更多人到店。", cta: "发布优惠" },
    warning: { title: "还没有避坑信息", body: "把你踩过的坑告诉大家，大家都能少走弯路。", cta: "写避坑" },
    dynamic: { title: "这里还没有动态", body: "和大家聊聊近况，看看本地正在发生什么。", cta: "发动态" },
    image_post: { title: "还没有图文", body: "上传几张照片，把生活分享给本地人。", cta: "发图文" },
    long_post: { title: "还没有长文", body: "把你的本地观察写下来。", cta: "写长文" },
    rant: { title: "还没有吐槽", body: "把想吐的槽说出来，别人会有共鸣。", cta: "发吐槽" },
    referral: { title: "还没有内推机会", body: "把你公司的岗位发出来，帮同胞拿 offer。", cta: "发布内推" },
    poll: { title: "还没有投票", body: "发起一个选项投票，听听本地朋友的看法。", cta: "发布投票" },
    anonymous: { title: "树洞里还没有声音", body: "匿名说说心里话。", cta: "进树洞" },
  },
  "zh-Hant": {
    secondhand: { title: "這裡還沒有二手內容", body: "發布第一個閒置吧。其他人會看到你的物品。", cta: "發布二手" },
    housing: { title: "還沒有租屋資訊", body: "發布轉租、合租或找室友，幫新到的人找到家。", cta: "發布租屋" },
    roommate: { title: "還沒有找室友的貼文", body: "把你的合租想法發出來，室友會主動聯絡你。", cta: "發布找室友" },
    job_post: { title: "還沒有徵才資訊", body: "發布本地徵才，把職缺推送給同城求職者。", cta: "發布徵才" },
    job_seek: { title: "還沒有求職貼文", body: "把你的求職方向告訴同城的人，徵才方會看到。", cta: "發布求職" },
    meetup: { title: "還沒有小組內容", body: "發起一個學習、運動或語言交換討論，讓本地社群參與進來。", cta: "發布小組" },
    dining: { title: "還沒有美食討論", body: "發布餐廳、咖啡或本地美食活動討論。", cta: "發布美食" },
    event: { title: "還沒有活動", body: "發布本地活動，把線下聚會同步給社群。", cta: "發布活動" },
    guide: { title: "這裡還沒有攻略", body: "分享你的城市經驗，幫助後來的人少走彎路。", cta: "寫攻略" },
    news: { title: "還沒有本地資訊", body: "發布一則本地快訊，把資訊同步給社群。", cta: "發布資訊" },
    local_info: { title: "還沒有本地公告", body: "把社區公告 / 提醒發出來。", cta: "發布公告" },
    question: { title: "還沒有問答", body: "提出你的生活疑問，本地人會來回答。", cta: "提個問" },
    service: { title: "還沒有服務", body: "發布搬家、簽證、輔導等本地服務。", cta: "發布服務" },
    merchant: { title: "還沒有商家", body: "把你的店推介給同城人，從認證開始。", cta: "認證商家" },
    coupon: { title: "還沒有優惠", body: "發布折扣或活動，讓更多人到店。", cta: "發布優惠" },
    warning: { title: "還沒有避雷資訊", body: "把你踩過的坑告訴大家，大家都能少走彎路。", cta: "寫避雷" },
    dynamic: { title: "這裡還沒有動態", body: "和大家聊聊近況，看看本地正在發生什麼。", cta: "發動態" },
    image_post: { title: "還沒有圖文", body: "上傳幾張照片，把生活分享給本地人。", cta: "發圖文" },
    long_post: { title: "還沒有長文", body: "把你的本地觀察寫下來。", cta: "寫長文" },
    rant: { title: "還沒有吐槽", body: "把想吐的槽說出來，別人會有共鳴。", cta: "發吐槽" },
    referral: { title: "還沒有內推機會", body: "把你公司的職缺發出來，幫同胞拿 offer。", cta: "發布內推" },
    poll: { title: "還沒有投票", body: "發起一個選項投票，聽聽本地朋友的看法。", cta: "發布投票" },
    anonymous: { title: "樹洞裡還沒有聲音", body: "匿名說說心裡話。", cta: "進樹洞" },
  },
  en: {
    secondhand: { title: "No secondhand items yet", body: "List your first item — people nearby will see it.", cta: "List an item" },
    housing: { title: "No housing posts yet", body: "Post a sublet, flatshare or roommate search to help newcomers find a home.", cta: "Post housing" },
    roommate: { title: "No roommate posts yet", body: "Share what you're looking for and roommates will reach out.", cta: "Find a roommate" },
    job_post: { title: "No job openings yet", body: "Post a local opening and reach job seekers in your city.", cta: "Post a job" },
    job_seek: { title: "No job-seeking posts yet", body: "Tell the city what you're looking for and recruiters will find you.", cta: "Post your search" },
    meetup: { title: "No groups yet", body: "Start a study, sports or language-exchange thread and get the local community involved.", cta: "Start a group" },
    dining: { title: "No food talk yet", body: "Share a restaurant, café or local food event.", cta: "Post food" },
    event: { title: "No events yet", body: "Post a local event and sync your meetup with the community.", cta: "Post an event" },
    guide: { title: "No guides yet", body: "Share what you've learned about the city and help newcomers skip the detours.", cta: "Write a guide" },
    news: { title: "No local news yet", body: "Post a local update and keep the community in the loop.", cta: "Post news" },
    local_info: { title: "No local notices yet", body: "Share a community notice or reminder.", cta: "Post a notice" },
    question: { title: "No questions yet", body: "Ask about daily life and locals will answer.", cta: "Ask a question" },
    service: { title: "No services yet", body: "Offer local services like moving, visa help or tutoring.", cta: "Post a service" },
    merchant: { title: "No merchants yet", body: "Introduce your shop to the city — start by getting verified.", cta: "Get verified" },
    coupon: { title: "No deals yet", body: "Post a discount or promotion and bring more people in.", cta: "Post a deal" },
    warning: { title: "No warnings yet", body: "Share the pitfalls you've hit so others can avoid them.", cta: "Write a warning" },
    dynamic: { title: "Nothing here yet", body: "Share what's on your mind and see what's happening locally.", cta: "Post an update" },
    image_post: { title: "No photos yet", body: "Upload a few photos and share your life with locals.", cta: "Post photos" },
    long_post: { title: "No long posts yet", body: "Write down your local observations.", cta: "Write a post" },
    rant: { title: "No rants yet", body: "Get it off your chest — others will relate.", cta: "Post a rant" },
    referral: { title: "No referrals yet", body: "Share an opening at your company and help someone land an offer.", cta: "Post a referral" },
    poll: { title: "No polls yet", body: "Start a poll and hear what locals think.", cta: "Create a poll" },
    anonymous: { title: "The tree hollow is quiet", body: "Say what's on your mind, anonymously.", cta: "Enter the hollow" },
  },
  ja: {
    secondhand: { title: "まだ中古の投稿がありません", body: "最初の不用品を出品しましょう。近くの人があなたの品物を見つけます。", cta: "出品する" },
    housing: { title: "まだ住まいの情報がありません", body: "又貸し・シェア・ルームメイト募集を投稿して、新しく来た人の家探しを助けましょう。", cta: "住まいを投稿" },
    roommate: { title: "まだルームメイト募集がありません", body: "希望条件を投稿すれば、ルームメイトから連絡が来ます。", cta: "ルームメイトを探す" },
    job_post: { title: "まだ求人がありません", body: "地元の求人を投稿して、同じ街の求職者に届けましょう。", cta: "求人を投稿" },
    job_seek: { title: "まだ求職の投稿がありません", body: "希望する仕事を街に伝えれば、採用担当が見つけてくれます。", cta: "求職を投稿" },
    meetup: { title: "まだグループがありません", body: "勉強・スポーツ・言語交換のスレッドを立てて、地域のみんなを巻き込みましょう。", cta: "グループを作る" },
    dining: { title: "まだグルメの話題がありません", body: "レストラン・カフェ・地元のグルメイベントを共有しましょう。", cta: "グルメを投稿" },
    event: { title: "まだイベントがありません", body: "地元のイベントを投稿して、コミュニティと予定を共有しましょう。", cta: "イベントを投稿" },
    guide: { title: "まだガイドがありません", body: "街での経験を共有して、後から来る人の遠回りを減らしましょう。", cta: "ガイドを書く" },
    news: { title: "まだ地元のニュースがありません", body: "地元の速報を投稿して、コミュニティに知らせましょう。", cta: "ニュースを投稿" },
    local_info: { title: "まだ地域のお知らせがありません", body: "地域のお知らせやリマインドを共有しましょう。", cta: "お知らせを投稿" },
    question: { title: "まだ質問がありません", body: "暮らしの疑問を投稿すれば、地元の人が答えてくれます。", cta: "質問する" },
    service: { title: "まだサービスがありません", body: "引っ越し・ビザ・家庭教師など地元のサービスを投稿しましょう。", cta: "サービスを投稿" },
    merchant: { title: "まだ店舗がありません", body: "あなたのお店を街に紹介しましょう。まずは認証から。", cta: "店舗を認証" },
    coupon: { title: "まだクーポンがありません", body: "割引やキャンペーンを投稿して、来店を増やしましょう。", cta: "クーポンを投稿" },
    warning: { title: "まだ注意喚起がありません", body: "あなたがはまった落とし穴を共有して、みんなの遠回りを減らしましょう。", cta: "注意喚起を書く" },
    dynamic: { title: "まだ投稿がありません", body: "近況をシェアして、地元で起きていることをのぞいてみましょう。", cta: "投稿する" },
    image_post: { title: "まだ写真投稿がありません", body: "写真を数枚アップして、暮らしを地元の人と共有しましょう。", cta: "写真を投稿" },
    long_post: { title: "まだ長文がありません", body: "あなたの街での観察を書き留めましょう。", cta: "長文を書く" },
    rant: { title: "まだ愚痴がありません", body: "思っていることを吐き出しましょう。共感してくれる人がいます。", cta: "愚痴を投稿" },
    referral: { title: "まだリファラルがありません", body: "自社の求人を投稿して、仲間の内定を後押ししましょう。", cta: "リファラルを投稿" },
    poll: { title: "まだ投票がありません", body: "投票を作って、地元の人の意見を聞いてみましょう。", cta: "投票を作る" },
    anonymous: { title: "ツリーホールはまだ静かです", body: "匿名で本音をつぶやきましょう。", cta: "ツリーホールへ" },
  },
};

// Locale-aware generic fallback for any content type that has no entry
// above (defensive — ICON/TEXT currently cover every ContentType).
function fallbackCopy(locale: Locale): Copy {
  switch (locale) {
    case "en":
      return { title: "Nothing here yet", body: "Be the first to post here.", cta: "Create a post" };
    case "ja":
      return { title: "まだ投稿がありません", body: "ここに最初の投稿をしてみましょう。", cta: "投稿する" };
    case "zh-Hant":
      return { title: "這裡還沒有內容", body: "成為第一個在這裡發布的人。", cta: "發布內容" };
    default:
      return { title: "这里还没有内容", body: "成为第一个在这里发布的人。", cta: "发布内容" };
  }
}

/// Mirrors iOS `ChannelEmptyState`. Click the CTA → opens the global
/// composer with the matching ContentType pre-selected (web composer
/// reads compose store).
export function ChannelEmptyState({ contentType }: { contentType: ContentType }) {
  const open = useCompose((s) => s.open);
  const user = useSession((s) => s.user);
  const openAuthPrompt = useAuthPrompt((s) => s.open);
  const { locale } = useI18n();
  const icon = ICON[contentType] || "✨";
  const copy = TEXT[locale]?.[contentType] || TEXT["zh-Hans"][contentType] || fallbackCopy(locale);

  return (
    <div className="kx-card flex flex-col items-center px-6 py-10 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-kx-soft text-3xl ring-1 ring-kx-stroke/50 shadow-[0_16px_38px_-30px_rgb(var(--kx-shadow)/0.4)]">
        <span aria-hidden="true">{icon}</span>
      </div>
      <div className="text-base font-bold text-kx-text">{copy.title}</div>
      <div className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-kx-muted">{copy.body}</div>
      <button
        type="button"
        onClick={() => {
          if (!user) {
            openAuthPrompt("publish");
            return;
          }
          open({
            // Pre-fill an empty draft pre-selecting this channel's
            // content type so the composer lands on the right form.
            initialTags: [],
            initialContentType: contentType,
          });
        }}
        className="mt-5 inline-flex h-11 items-center gap-2 rounded-full bg-kx-accent px-5 text-sm font-bold text-kx-onAccent shadow-[0_18px_34px_-22px_rgb(var(--kx-accent)/0.55)] transition duration-200 hover:brightness-110 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-kx-card focus-visible:ring-kx-accent/50"
      >
        <PlusCircle className="h-4 w-4" />
        {copy.cta}
      </button>
    </div>
  );
}
