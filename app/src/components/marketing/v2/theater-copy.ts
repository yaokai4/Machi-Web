import type { MarketingLocale } from "@/data/machi-home";

// Copy for the V2 homepage sections. Local per-locale records follow the
// existing pattern of WhyMachiSection / CityPulseSection (section copy
// owned by the section, not the admin-overridable marketingCopy tree).
// Every string here states something the product actually does — no
// invented stats, no planned features sold as live.

export type TheaterAct = {
  key: string;
  /** short name used in the chapter nav + act tabs */
  name: string;
  kicker: string;
  title: string;
  body: string;
  points: Array<[string, string]>;
};

export type V2Copy = {
  factLine: string[];
  chapterLabel: string;
  theater: {
    label: string;
    title: string;
    body: string;
    actLabel: (n: number) => string;
    acts: TheaterAct[];
  };
  screens: {
    jlpt: {
      title: string; level: string; timer: string; question: string;
      options: string[]; aiTag: string; aiNote: string; streak: string; wrongbook: string;
    };
    events: {
      title: string; eventName: string; capacity: string; waitlist: string; approval: string;
      formTitle: string; formFields: string[]; checkin: string; broadcast: string; ics: string; shortlink: string;
    };
    rooms: {
      title: string; roomName: string; needs: string; time: string; joined: string;
      chat: [string, string]; sync: string; web: string; ios: string;
    };
    workspace: {
      title: string; inputHint: string; inputText: string; parsedTag: string; parsedTitle: string; parsedDue: string;
      cards: string[];
    };
    ai: {
      title: string; q: string; a: string; sources: string[]; memberNote: string;
    };
  };
  dualLibrary: {
    label: string; title: string; body: string; japanOnly: string;
    school: {
      title: string; body: string; types: string[]; filters: string[]; cta: string;
    };
    company: {
      title: string; body: string; matrix: string; reviews: string; interviews: string; cta: string;
    };
    guideRowTitle: string;
  };
  cityMap: {
    label: string; title: string; body: string;
    groups: { kanto: string; kansai: string; other: string };
    live: string; planned: string; plannedRegions: string[];
    facts: Array<[string, string]>;
    langNote: string;
  };
  membership: {
    label: string; title: string; body: string; cta: string; note: string;
    walletTitle: string; walletBody: string; walletRows: Array<[string, string]>;
    mallTitle: string; mallBody: string; mallCta: string;
  };
  business: { note: string };
  finale: { label: string; sloganNote: string };
};

export const v2Copy: Record<MarketingLocale, V2Copy> = {
  zh: {
    factLine: ["iOS 已上线", "Web 端同步", "Android 开发中", "日本 13 座城市", "内容语言：简 · 繁 · EN · 日"],
    chapterLabel: "目次",
    theater: {
      label: "产品剧场",
      title: "五件事，演给你看。",
      body: "不放概念图。下面每一屏，都是 App 里今天就能用的功能，照原样重演一遍。",
      actLabel: (n) => `第 ${n} 幕`,
      acts: [
        {
          key: "jlpt",
          name: "JLPT 备考",
          kicker: "一套完整的在线考试引擎",
          title: "从 30 秒定级，到走出考场。",
          body: "JLPT 专区不是一页资料汇总。定级、刷题、模考、复盘，每一步都在 App 里完成。",
          points: [
            ["30 秒定级", "先做一组快速测试，找到自己该从 N 几开始。"],
            ["N5–N1 分级刷题", "词汇、语法逐题练；会员可看 Machi AI 逐题讲解。"],
            ["在线模考", "计时、评分、逐题回顾，流程照着真实考试走。"],
            ["错题本与倒计时", "错过的题自动进错题本；考试日倒计时和打卡连击帮你把节奏撑到考前。"],
          ],
        },
        {
          key: "events",
          name: "活动主办",
          kicker: "把一场活动从报名管到签到",
          title: "主办一场活动，工具是全套的。",
          body: "容量、候补、审核制报名，自定义报名表，名单群发，现场签到——办活动要的东西，主办台里都有。",
          points: [
            ["报名规则自己定", "容量上限、候补队列、审核制，开关都在主办台。"],
            ["报名表字段自定义", "想收集什么问题自己加，名单和每个人的回答都能看。"],
            ["一键进日历", "参加者可以直接生成 .ics 日历文件，不用授权任何权限。"],
            ["Web 短链分享", "每场活动有自己的网页短链，发到哪里都能报名。"],
          ],
        },
        {
          key: "rooms",
          name: "约局",
          kicker: "游戏大厅式的同城约局",
          title: "还差几个人，一眼看清。",
          body: "每个局是一张卡：谁在里面、还差几人、什么时候。进去就是成员和群聊，凑齐了就出发。",
          points: [
            ["开局像开房间", "吃饭、桌游、运动、语伴，自己开一个局，等人加入。"],
            ["进度一目了然", "头像叠在卡片上，还差几人直接写在旁边。"],
            ["进局即群聊", "成员和聊天在同一处，商量时间地点不用换地方。"],
            ["iOS 和 Web 实时同步", "手机上开的局，网页上同一秒能看到。"],
          ],
        },
        {
          key: "workspace",
          name: "个人工作台",
          kicker: "把在日本的生活管起来",
          title: "说一句话，变成一条待办。",
          body: "「25 号前交房租」输进去，就是一条带日期的待办。日历、记账、证件、合同、申请进度，都在同一个工作台里。",
          points: [
            ["自然语言待办", "像发消息一样记事，日期自动被认出来。"],
            ["家计簿记账", "日常开销随手记，按月看去向。"],
            ["证件到期库", "在留卡、护照、保险，到期前有数。"],
            ["申请看板", "升学和求职的每一份申请，进行到哪一步都有看板。"],
          ],
        },
        {
          key: "ai",
          name: "Machi AI",
          kicker: "回答带出处的三语助手",
          title: "答案说得清来源，才敢照着办。",
          body: "Machi AI 挂在 Machi 自己的指南、学校库和公司库上。中文、日文、英文提问都行，回答下面直接列出参考来源。",
          points: [
            ["懂在日生活", "在留、役所、租房、打工、保险，问法再模糊也能接住。"],
            ["回答有依据", "引用来自 Machi 指南与两个资料库，可以点开核对。"],
            ["会员额度更高", "会员有更高的每日提问额度，并解锁 Pro 深度模型。"],
            ["给 JLPT 供能", "刷题时的逐题讲解，就是这套 AI 在工作。"],
          ],
        },
      ],
    },
    screens: {
      jlpt: {
        title: "JLPT 模考", level: "N2 · 言語知識", timer: "剩余 82:40",
        question: "彼の説明は要領を＿＿＿、何が言いたいのか分からなかった。",
        options: ["得ておらず", "得ないで", "得ずに", "得なくて"],
        aiTag: "Machi AI 讲解", aiNote: "「要領を得ない」是固定搭配，表示说话抓不住要点……",
        streak: "连续打卡", wrongbook: "错题本",
      },
      events: {
        title: "主办台", eventName: "涩谷周五拉面局", capacity: "容量 12", waitlist: "候补 3", approval: "审核制",
        formTitle: "报名表", formFields: ["想坐哪一桌？", "有忌口吗？"], checkin: "现场签到", broadcast: "群发通知", ics: "加入日历 (.ics)", shortlink: "machicity.com/e/…",
      },
      rooms: {
        title: "约局大厅", roomName: "周六下午桌游局", needs: "还差 2 人", time: "周六 14:00 · 中野",
        joined: "已加入", chat: ["+1，我可以带一盒新游戏", "好，那就中野站北口见"], sync: "双端同步", web: "Web", ios: "iOS",
      },
      workspace: {
        title: "我的工作台", inputHint: "随手记一句", inputText: "25 号前交房租",
        parsedTag: "已识别日期", parsedTitle: "交房租", parsedDue: "本月 25 日",
        cards: ["日历", "家计簿", "证件到期", "合同", "申请看板"],
      },
      ai: {
        title: "Machi AI", q: "在留卡快到期了，我该怎么续？",
        a: "到期前 3 个月就可以办。带上在留卡、护照、证件照和申请书到入管局提交；学生还需要在学证明……",
        sources: ["Machi 指南 · 在留更新", "日本学校库", "外国人就职公司库"], memberNote: "会员额度 · Pro 模型",
      },
    },
    dualLibrary: {
      label: "两座资料库",
      title: "选学校、挑公司，先查库再决定。",
      body: "两个持续维护的结构化资料库，都针对在日本的外国人整理，是 Machi AI 回答问题时引用的来源。",
      japanOnly: "日本专属",
      school: {
        title: "日本学校库",
        body: "大学、大学院、专门学校、语言学校，按你在意的条件筛。",
        types: ["大学", "大学院", "专门学校", "语言学校"],
        filters: ["国际生友好", "英文项目", "奖学金"],
        cta: "进入学校库",
      },
      company: {
        title: "外国人就职公司库",
        body: "按 20 个行业、5 档规模整理的公司资料，还有按城市众包的点评与面试经验。",
        matrix: "20 行业 × 5 档规模",
        reviews: "公司点评",
        interviews: "面接经验",
        cta: "进入公司库",
      },
      guideRowTitle: "指南同时覆盖",
    },
    cityMap: {
      label: "城市版图",
      title: "13 座城市，此刻都亮着。",
      body: "内容按城市和都市圈组织：你在哪座城，看到的就是哪座城的租房、工作、二手和活动。",
      groups: { kanto: "关东圈", kansai: "关西圈", other: "其他热门" },
      live: "已开放",
      planned: "筹备中",
      plannedRegions: ["韩国", "澳大利亚", "加拿大", "美国", "英国"],
      facts: [
        ["市场", "17 个子类"],
        ["本地服务", "18 个子类"],
        ["工作", "6 大类"],
        ["内容语言", "4 种"],
      ],
      langNote: "界面与内容语言分开选：简体中文、繁體中文、English、日本語。",
    },
    membership: {
      label: "会员与钱包",
      title: "认证会员，权益写得明明白白。",
      body: "Machi 认证会员的每一项权益都能在 App 里逐条核对。下面是其中九项。",
      cta: "查看全部权益",
      note: "认证不代表平台担保，交易与服务仍需自行核验。",
      walletTitle: "Machi 币钱包",
      walletBody: "充值、消费、账单，一处管理；1 币 = 1 日元，价目透明。",
      walletRows: [["资料商城消费", "按标价扣币"], ["充值记录", "逐笔可查"], ["余额", "三端同步"]],
      mallTitle: "数字资料商城",
      mallBody: "JLPT 备考、大学院申请、日本就职的数字资料，买了立刻下载。",
      mallCta: "去商城看看",
    },
    business: { note: "商家与服务合作正在有节奏地开放。" },
    finale: { label: "谢幕", sloganNote: "三种语言，同一句话。" },
  },

  en: {
    factLine: ["iOS live", "Web app live", "Android in development", "13 cities in Japan", "Content in 简 · 繁 · EN · 日"],
    chapterLabel: "Contents",
    theater: {
      label: "Product theater",
      title: "Five things, shown — not told.",
      body: "No concept art below. Every screen re-enacts a feature you can use in the app today.",
      actLabel: (n) => `Act ${n}`,
      acts: [
        {
          key: "jlpt",
          name: "JLPT prep",
          kicker: "A complete online exam engine",
          title: "From a 30-second placement to exam day.",
          body: "The JLPT section is not a pile of PDFs. Placement, drills, mock exams, review — every step happens inside the app.",
          points: [
            ["30-second placement", "A quick test tells you which N-level to start from."],
            ["Graded drills, N5–N1", "Vocabulary and grammar, question by question; members get Machi AI explanations for each one."],
            ["Timed mock exams", "Timer, scoring, question-by-question review — the flow mirrors the real exam."],
            ["Wrong-answer book & countdown", "Missed questions collect themselves; the exam countdown and daily streak keep your pace up."],
          ],
        },
        {
          key: "events",
          name: "Events",
          kicker: "Run an event from signup to check-in",
          title: "Hosting comes with the full toolkit.",
          body: "Capacity, waitlists, approval-based signup, custom registration forms, broadcast messages, door check-in — the host console has all of it.",
          points: [
            ["Your rules for signup", "Capacity caps, waitlist queues, approval mode — all switches in the host console."],
            ["Custom registration forms", "Add the questions you need; see the full list and every answer."],
            ["One-tap calendar", "Attendees can generate an .ics file — no permissions asked."],
            ["Web short links", "Every event gets its own share link; signups work wherever you post it."],
          ],
        },
        {
          key: "rooms",
          name: "Rooms",
          kicker: "A game-lobby take on meetups",
          title: "Who's in, and how many are missing — at a glance.",
          body: "Every room is a card: who joined, how many spots are left, when it happens. Inside is the member list and a group chat.",
          points: [
            ["Open a room like a lobby", "Dinner, board games, sports, language partners — start one and let people join."],
            ["Progress you can see", "Stacked avatars on the card, spots remaining right beside them."],
            ["Chat built in", "Members and messages live in the same place; no app-switching to fix a time."],
            ["iOS and web in sync", "A room opened on the phone shows up on the web the same second."],
          ],
        },
        {
          key: "workspace",
          name: "Workspace",
          kicker: "Run your life in Japan from one desk",
          title: "Say it in one line. It becomes a to-do.",
          body: "Type “pay rent by the 25th” and it lands as a dated task. Calendar, budgeting, documents, contracts, and application boards share the same workspace.",
          points: [
            ["Natural-language to-dos", "Write like you'd text; dates get picked up automatically."],
            ["Household ledger", "Log daily spending, see where the month went."],
            ["Document expiry vault", "Residence card, passport, insurance — know before they lapse."],
            ["Application boards", "Every school and job application, tracked stage by stage."],
          ],
        },
        {
          key: "ai",
          name: "Machi AI",
          kicker: "A trilingual assistant that cites its sources",
          title: "Answers you can trace, then act on.",
          body: "Machi AI sits on top of Machi's own guides, school library, and company library. Ask in Chinese, Japanese, or English — sources are listed under the answer.",
          points: [
            ["Knows life in Japan", "Residence status, city hall, housing, part-time work, insurance — vague questions land fine."],
            ["Grounded answers", "Citations come from the Machi guides and both libraries; open and verify."],
            ["Higher limits for members", "Members get a higher daily quota and the Pro deep-reasoning model."],
            ["Powers JLPT too", "The per-question explanations in drills are this same engine at work."],
          ],
        },
      ],
    },
    screens: {
      jlpt: {
        title: "JLPT mock exam", level: "N2 · Language Knowledge", timer: "82:40 left",
        question: "彼の説明は要領を＿＿＿、何が言いたいのか分からなかった。",
        options: ["得ておらず", "得ないで", "得ずに", "得なくて"],
        aiTag: "Machi AI explains", aiNote: "「要領を得ない」 is a set phrase meaning an explanation misses the point…",
        streak: "Day streak", wrongbook: "Wrong answers",
      },
      events: {
        title: "Host console", eventName: "Friday ramen night, Shibuya", capacity: "Capacity 12", waitlist: "Waitlist 3", approval: "Approval",
        formTitle: "Registration form", formFields: ["Preferred table?", "Any dietary limits?"], checkin: "Door check-in", broadcast: "Broadcast", ics: "Add to calendar (.ics)", shortlink: "machicity.com/e/…",
      },
      rooms: {
        title: "Rooms lobby", roomName: "Saturday board games", needs: "2 spots left", time: "Sat 14:00 · Nakano",
        joined: "Joined", chat: ["+1 — I can bring a new game", "Great, Nakano station north exit"], sync: "Synced", web: "Web", ios: "iOS",
      },
      workspace: {
        title: "My workspace", inputHint: "Jot it down", inputText: "Pay rent by the 25th",
        parsedTag: "Date detected", parsedTitle: "Pay rent", parsedDue: "25th this month",
        cards: ["Calendar", "Ledger", "Documents", "Contracts", "Applications"],
      },
      ai: {
        title: "Machi AI", q: "My residence card expires soon — how do I renew?",
        a: "You can apply up to 3 months before expiry. Bring your residence card, passport, a photo, and the application form to the immigration bureau; students also need proof of enrollment…",
        sources: ["Machi Guide · Residence renewal", "School library", "Company library"], memberNote: "Member quota · Pro model",
      },
    },
    dualLibrary: {
      label: "Two libraries",
      title: "Pick schools and employers from data, not rumor.",
      body: "Two structured, maintained libraries built for foreigners in Japan — the same sources Machi AI cites in its answers.",
      japanOnly: "Japan-specific",
      school: {
        title: "Japan school library",
        body: "Universities, graduate schools, vocational and language schools — filter by what matters to you.",
        types: ["University", "Graduate school", "Vocational", "Language school"],
        filters: ["International-friendly", "English programs", "Scholarships"],
        cta: "Open the school library",
      },
      company: {
        title: "Company library for foreign job-seekers",
        body: "Company profiles organized across 20 industries and 5 size tiers, plus city-sourced reviews and interview experiences.",
        matrix: "20 industries × 5 size tiers",
        reviews: "Company reviews",
        interviews: "Interview notes",
        cta: "Open the company library",
      },
      guideRowTitle: "The guides also cover",
    },
    cityMap: {
      label: "City map",
      title: "13 cities, all lit right now.",
      body: "Content is organized by city and metro area: the city you're in decides the housing, jobs, secondhand, and events you see.",
      groups: { kanto: "Greater Tokyo", kansai: "Kansai", other: "More hubs" },
      live: "Live",
      planned: "In preparation",
      plannedRegions: ["Korea", "Australia", "Canada", "United States", "United Kingdom"],
      facts: [
        ["Marketplace", "17 subcategories"],
        ["Local services", "18 subcategories"],
        ["Jobs", "6 categories"],
        ["Content languages", "4"],
      ],
      langNote: "Interface and content languages are chosen separately: 简体中文, 繁體中文, English, 日本語.",
    },
    membership: {
      label: "Membership & wallet",
      title: "Verified membership, benefits in plain writing.",
      body: "Every Machi Verified benefit can be checked line by line in the app. Here are nine of them.",
      cta: "See all benefits",
      note: "Verification is not a platform guarantee — always verify deals and services yourself.",
      walletTitle: "Machi Coin wallet",
      walletBody: "Top-ups, spending, and statements in one place; 1 coin = 1 yen, priced in the open.",
      walletRows: [["Store purchases", "Paid in coins at list price"], ["Top-up history", "Every entry auditable"], ["Balance", "Synced across devices"]],
      mallTitle: "Digital resource store",
      mallBody: "JLPT prep, graduate-school applications, job hunting in Japan — buy a resource, download it right away.",
      mallCta: "Browse the store",
    },
    business: { note: "Business and service partnerships are opening at a measured pace." },
    finale: { label: "Curtain call", sloganNote: "Three languages, one sentence." },
  },

  ja: {
    factLine: ["iOS 配信中", "Web 版も公開中", "Android 開発中", "日本 13 都市", "コンテンツ言語：简 · 繁 · EN · 日"],
    chapterLabel: "目次",
    theater: {
      label: "プロダクト劇場",
      title: "五つの機能を、実演でお見せします。",
      body: "コンセプト画像はありません。以下はすべて、今日アプリで使える機能の再現です。",
      actLabel: (n) => `第 ${n} 幕`,
      acts: [
        {
          key: "jlpt",
          name: "JLPT 対策",
          kicker: "完結型のオンライン試験エンジン",
          title: "30 秒のレベル判定から、試験当日まで。",
          body: "JLPT コーナーは資料集ではありません。判定、演習、模試、振り返りまで、すべてアプリの中で完結します。",
          points: [
            ["30 秒レベル判定", "短いテストで、どの N レベルから始めるべきかが分かります。"],
            ["N5–N1 の級別演習", "語彙・文法を一問ずつ。メンバーは Machi AI の解説を毎問見られます。"],
            ["オンライン模試", "タイマー・採点・一問ずつの見直し。本番と同じ流れです。"],
            ["間違いノートとカウントダウン", "間違えた問題は自動で集まり、試験日までの日数と連続記録がペースを支えます。"],
          ],
        },
        {
          key: "events",
          name: "イベント主催",
          kicker: "申込から受付までを一つの管理画面で",
          title: "イベント主催に、道具一式が付いてきます。",
          body: "定員・キャンセル待ち・承認制の申込、カスタム申込フォーム、一斉連絡、当日受付。主催コンソールに全部あります。",
          points: [
            ["申込ルールは自分で決める", "定員、キャンセル待ち、承認制。スイッチはすべて主催側に。"],
            ["申込フォームは自由設計", "聞きたい質問を追加でき、名簿も回答も一覧できます。"],
            ["ワンタップでカレンダーへ", "参加者は .ics ファイルを生成するだけ。権限は求めません。"],
            ["Web 短縮リンク", "イベントごとに専用リンク。どこに貼っても申込できます。"],
          ],
        },
        {
          key: "rooms",
          name: "集まり",
          kicker: "ゲームロビーのような同城の集まり",
          title: "あと何人足りないか、ひと目で。",
          body: "一つの集まりは一枚のカード。誰がいて、あと何人で、いつなのか。中に入ればメンバーとグループチャットです。",
          points: [
            ["ロビー感覚で立てる", "ご飯、ボードゲーム、スポーツ、言語交換。自分で立てて人を待つ。"],
            ["進み具合が見える", "カードにアバターが重なり、残り人数がすぐ隣に。"],
            ["入ればそのままチャット", "メンバーと会話が同じ場所に。日程調整でアプリを行き来しません。"],
            ["iOS と Web が同期", "スマホで立てた集まりは、同じ瞬間に Web にも現れます。"],
          ],
        },
        {
          key: "workspace",
          name: "ワークスペース",
          kicker: "日本での暮らしをひとつの机で",
          title: "ひと言書けば、期限付きのタスクに。",
          body: "「25日までに家賃」と入れれば、日付入りのタスクになります。カレンダー、家計簿、証明書、契約、出願ボードが同じ場所に。",
          points: [
            ["自然文でタスク登録", "メッセージのように書くだけで、日付を読み取ります。"],
            ["家計簿", "日々の支出をさっと記録。月ごとの行き先が見えます。"],
            ["証明書の期限管理", "在留カード、パスポート、保険。切れる前に気づけます。"],
            ["出願・応募ボード", "進学も就職も、一件ごとに進捗が見えます。"],
          ],
        },
        {
          key: "ai",
          name: "Machi AI",
          kicker: "出典を示す三言語アシスタント",
          title: "出どころが分かる答えだから、動けます。",
          body: "Machi AI は Machi 自身のガイド・学校ライブラリ・企業ライブラリの上に載っています。中国語・日本語・英語で質問でき、答えの下に参照元が並びます。",
          points: [
            ["日本の暮らしに詳しい", "在留、役所、住まい、アルバイト、保険。曖昧な聞き方でも大丈夫。"],
            ["根拠のある答え", "引用は Machi ガイドと二つのライブラリから。開いて確認できます。"],
            ["メンバーは上限アップ", "1 日の質問回数が増え、Pro 深思考モデルも使えます。"],
            ["JLPT にも供給", "演習の一問ずつの解説は、この同じエンジンです。"],
          ],
        },
      ],
    },
    screens: {
      jlpt: {
        title: "JLPT 模試", level: "N2 · 言語知識", timer: "残り 82:40",
        question: "彼の説明は要領を＿＿＿、何が言いたいのか分からなかった。",
        options: ["得ておらず", "得ないで", "得ずに", "得なくて"],
        aiTag: "Machi AI 解説", aiNote: "「要領を得ない」は決まった言い回しで、話の要点がつかめないという意味…",
        streak: "連続記録", wrongbook: "間違いノート",
      },
      events: {
        title: "主催コンソール", eventName: "渋谷・金曜ラーメン会", capacity: "定員 12", waitlist: "待機 3", approval: "承認制",
        formTitle: "申込フォーム", formFields: ["希望の席は？", "苦手な食べ物は？"], checkin: "当日受付", broadcast: "一斉連絡", ics: "カレンダーに追加 (.ics)", shortlink: "machicity.com/e/…",
      },
      rooms: {
        title: "集まりロビー", roomName: "土曜午後のボドゲ会", needs: "あと 2 人", time: "土 14:00 · 中野",
        joined: "参加中", chat: ["+1、新しいゲーム持っていきます", "了解、中野駅北口で"], sync: "同期中", web: "Web", ios: "iOS",
      },
      workspace: {
        title: "マイワークスペース", inputHint: "ひと言メモ", inputText: "25日までに家賃",
        parsedTag: "日付を認識", parsedTitle: "家賃を払う", parsedDue: "今月 25 日",
        cards: ["カレンダー", "家計簿", "証明書", "契約", "出願ボード"],
      },
      ai: {
        title: "Machi AI", q: "在留カードの期限が近いです。更新はどうすれば？",
        a: "期限の 3 か月前から申請できます。在留カード、パスポート、証明写真、申請書を持って入管へ。学生は在学証明も必要です…",
        sources: ["Machi ガイド · 在留更新", "学校ライブラリ", "企業ライブラリ"], memberNote: "メンバー枠 · Pro モデル",
      },
    },
    dualLibrary: {
      label: "二つのライブラリ",
      title: "学校も会社も、まずデータで比べる。",
      body: "在日外国人のために整備し続けている二つの構造化ライブラリ。Machi AI が答えの根拠として引用する情報源でもあります。",
      japanOnly: "日本専用",
      school: {
        title: "日本の学校ライブラリ",
        body: "大学・大学院・専門学校・語学学校を、気になる条件で絞り込めます。",
        types: ["大学", "大学院", "専門学校", "語学学校"],
        filters: ["留学生フレンドリー", "英語プログラム", "奨学金"],
        cta: "学校ライブラリへ",
      },
      company: {
        title: "外国人就職の企業ライブラリ",
        body: "20 業界 × 5 規模で整理した企業情報に、街ごとに集まる口コミと面接体験記。",
        matrix: "20 業界 × 5 規模",
        reviews: "企業の口コミ",
        interviews: "面接体験記",
        cta: "企業ライブラリへ",
      },
      guideRowTitle: "ガイドのカバー範囲",
    },
    cityMap: {
      label: "都市マップ",
      title: "13 の街が、いま灯っています。",
      body: "コンテンツは街と都市圏ごとに整理。いる街が変われば、見える住まい・仕事・中古・イベントも変わります。",
      groups: { kanto: "関東圏", kansai: "関西圏", other: "その他の都市" },
      live: "公開中",
      planned: "準備中",
      plannedRegions: ["韓国", "オーストラリア", "カナダ", "アメリカ", "イギリス"],
      facts: [
        ["マーケット", "17 サブカテゴリ"],
        ["ローカルサービス", "18 サブカテゴリ"],
        ["仕事", "6 カテゴリ"],
        ["コンテンツ言語", "4 言語"],
      ],
      langNote: "表示言語とコンテンツ言語は別々に選べます：简体中文、繁體中文、English、日本語。",
    },
    membership: {
      label: "メンバーシップとウォレット",
      title: "認証メンバーの特典は、全部明文化。",
      body: "Machi 認証メンバーの特典は、アプリで一つずつ確認できます。ここではそのうち九つを。",
      cta: "特典をすべて見る",
      note: "認証はプラットフォームの保証ではありません。取引やサービスはご自身でもご確認ください。",
      walletTitle: "Machi コインウォレット",
      walletBody: "チャージ、利用、明細をひとまとめに。1 コイン = 1 円、価格は明朗です。",
      walletRows: [["ストアでの利用", "表示価格どおりにコインで"], ["チャージ履歴", "一件ずつ確認可能"], ["残高", "各端末で同期"]],
      mallTitle: "デジタル資料ストア",
      mallBody: "JLPT 対策、大学院出願、日本就職の資料を購入後すぐダウンロード。",
      mallCta: "ストアを見る",
    },
    business: { note: "店舗・サービス提携は段階的に開放しています。" },
    finale: { label: "カーテンコール", sloganNote: "三つの言語、同じひと言。" },
  },
};
