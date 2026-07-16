// W2-3: static JLPT level intro pages (/guide/jlpt/levels/n1 … n5) — SEO
// landing pages covering pass marks, scoring sections, vocabulary reference
// and a prep FAQ, with CTAs into the placement test and the prep hub. All
// copy is original and trilingual (rendered per resolved locale); no
// past-paper text. Layout reuses the existing JlptKit / GuideShell pieces.

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { GuideShell } from "@/components/guide/GuideKit";
import { JlptNarrow, JlptPageHeader, JlptPanel, JlptDisclaimer } from "../../JlptKit";
import { resolveMarketingLocale } from "@/lib/marketing-locale";
import type { MarketingLocale } from "@/data/machi-home";

export const dynamic = "force-dynamic";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://www.machicity.com";

const JLPT_LEVEL_KEYS = ["n1", "n2", "n3", "n4", "n5"] as const;
type LevelKey = (typeof JLPT_LEVEL_KEYS)[number];

// Official scoring facts (stable since the 2010 revision): 180 total, overall
// pass mark per level, and sectional minimums (19 per section for the N1–N3
// three-section split; 38/19 for the N4–N5 two-section split).
const FACTS: Record<LevelKey, { label: string; pass: number; split: "three" | "two"; words: string; kanji: string }> = {
  n1: { label: "N1", pass: 100, split: "three", words: "10,000", kanji: "2,000" },
  n2: { label: "N2", pass: 90, split: "three", words: "6,000", kanji: "1,000" },
  n3: { label: "N3", pass: 95, split: "three", words: "3,700", kanji: "650" },
  n4: { label: "N4", pass: 90, split: "two", words: "1,500", kanji: "300" },
  n5: { label: "N5", pass: 80, split: "two", words: "800", kanji: "100" },
};

interface LevelCopy {
  metaTitle: string;
  metaDescription: string;
  subtitle: string;
  summary: string;
  faq: Array<{ q: string; a: string }>;
}

const COPY: Record<LevelKey, Record<MarketingLocale, LevelCopy>> = {
  n1: {
    zh: {
      metaTitle: "JLPT N1 考试指南｜合格线、题型构成、词汇量参考与备考 FAQ",
      metaDescription:
        "JLPT N1 全解：总分 180、合格线 100 分、单科基准线 19 分；言語知識・读解・听解三科构成，词汇量约 10,000 词（参考），附备考 FAQ 与免费定级测试、在线模考入口。",
      subtitle: "最高等级：能理解广泛场景下的日语，升学与就职的硬通货。",
      summary:
        "N1 是 JLPT 的最高等级，要求能读懂社论、评论等逻辑较复杂的文章，并听懂自然语速的讲座、新闻与会话。大学院出愿、研究职以及不少日企核心岗位都会把 N1 作为重要参考。从 N2 到 N1 的主要跨越在词汇密度、抽象读解与长段听力。",
      faq: [
        {
          q: "从 N2 到 N1 一般要准备多久？",
          a: "视基础与投入而定，常见节奏是每天 1-2 小时、坚持 8-12 个月。核心任务是把词汇量从约 6,000 提到约 10,000，并适应社论级读解与长段听力；用刷题和模考持续定位弱项，比单纯延长学习时间更有效。",
        },
        {
          q: "N1 需要多少词汇量和汉字量？",
          a: "常用参考值为约 10,000 词、约 2,000 个汉字（官方自 2010 年起不再公布出题范围，仅供参考）。建议优先掌握高频词，用例句和搭配记忆，比孤立背词表更牢固。",
        },
        {
          q: "N1 对升学和就职有多大作用？",
          a: "大学院出愿、联系教授与奖学金评审中，N1 是常见的加分项；日企面向外国人的企划、客户沟通等核心岗位也常以 N1 为筛选线。技术类岗位有时 N2 即可，但 N1 仍是最通用的日语能力证明。",
        },
      ],
    },
    en: {
      metaTitle: "JLPT N1 Guide | Pass mark, test sections, vocabulary size & prep FAQ",
      metaDescription:
        "Everything about JLPT N1: 180-point total, 100-point pass mark, 19-point sectional minimums, the three scoring sections, a ~10,000-word vocabulary reference, plus a prep FAQ, free placement test and online mock exams.",
      subtitle: "The top level: understanding Japanese used in a broad range of situations.",
      summary:
        "N1 is the highest JLPT level. It expects you to read logically complex writing such as editorials and commentary, and to follow lectures, news and conversations at natural speed. Graduate school applications, research roles and many core positions at Japanese companies treat N1 as a key credential. The jump from N2 is mostly about vocabulary density, abstract reading and long-form listening.",
      faq: [
        {
          q: "How long does it take to go from N2 to N1?",
          a: "It depends on your base and study time, but a common pace is 1–2 hours a day for 8–12 months. The core work is growing vocabulary from roughly 6,000 to 10,000 words and getting comfortable with editorial-level reading and long listening passages. Drilling questions and mock exams to locate weak spots beats simply studying longer.",
        },
        {
          q: "How much vocabulary and kanji does N1 need?",
          a: "Common reference figures are about 10,000 words and 2,000 kanji (the official body stopped publishing test scopes in 2010, so treat these as estimates). Prioritise high-frequency words and learn them through example sentences and collocations.",
        },
        {
          q: "How useful is N1 for study and work in Japan?",
          a: "N1 is a frequent plus in graduate admissions, professor outreach and scholarship screening, and many client-facing or planning roles for foreigners use it as a screening line. Technical roles sometimes accept N2, but N1 remains the most universally recognised proof of Japanese ability.",
        },
      ],
    },
    ja: {
      metaTitle: "JLPT N1 とは｜合格点・試験科目・語彙数の目安とよくある質問",
      metaDescription:
        "JLPT N1 の総合ガイド：総合得点 180 点満点・合格点 100 点・基準点 19 点、言語知識・読解・聴解の 3 科目構成、語彙約 10,000 語（目安）。学習 FAQ と無料レベル判定・オンライン模試への入口つき。",
      subtitle: "最上級レベル。幅広い場面で使われる日本語の理解が問われます。",
      summary:
        "N1 は JLPT の最上級レベルです。社説や評論など論理的にやや複雑な文章の読解、自然なスピードの講義・ニュース・会話の聴解が求められます。大学院出願や研究職、企業の中核ポジションで重視されることが多く、N2 からの差は語彙の密度・抽象的な読解・長い聴解にあります。",
      faq: [
        {
          q: "N2 から N1 までどのくらいかかりますか？",
          a: "基礎と学習時間によりますが、1 日 1〜2 時間で 8〜12 か月が一つの目安です。語彙を約 6,000 語から約 10,000 語へ増やし、社説レベルの読解と長い聴解に慣れることが中心課題です。演習と模試で弱点を特定しながら進める方が、時間を延ばすだけより効率的です。",
        },
        {
          q: "N1 に必要な語彙数・漢字数は？",
          a: "目安として語彙約 10,000 語・漢字約 2,000 字とされます（2010 年以降、公式は出題範囲を公表していないため参考値です）。頻出語を優先し、例文やコロケーションで覚えるのが定着への近道です。",
        },
        {
          q: "N1 は進学・就職にどのくらい役立ちますか？",
          a: "大学院出願・教授への連絡・奨学金審査で評価されることが多く、外国人向けの企画職や顧客対応職では N1 が選考ラインになる場合もあります。技術職では N2 で足りることもありますが、N1 は最も汎用性の高い日本語能力の証明です。",
        },
      ],
    },
  },
  n2: {
    zh: {
      metaTitle: "JLPT N2 考试指南｜合格线、题型构成、词汇量参考与备考 FAQ",
      metaDescription:
        "JLPT N2 全解：总分 180、合格线 90 分、单科基准线 19 分；三科构成、词汇量约 6,000 词（参考）。N2 是多数日企就职与专门学校出愿的门槛，附备考 FAQ、免费定级测试与 N2 在线模考。",
      subtitle: "就职与升学最常用的门槛等级：能应对日常及较广泛场景的日语。",
      summary:
        "N2 要求能读懂报纸报道与一般性评论，听懂接近自然语速的会话和新闻。它是最「实用」的等级：多数日企招聘外国人、专门学校与部分大学出愿都以 N2 为基准线。备考重心通常在补全语法体系与提升读解速度。",
      faq: [
        {
          q: "备考 N2 一般要多久？",
          a: "从 N3 水平出发，常见节奏是每天 1-2 小时、坚持 6-10 个月。有汉字基础的学习者读解上手更快，但听力与语法搭配需要专门练习。建议先做免费定级测试确认起点，再按弱项分配时间。",
        },
        {
          q: "N2 是日本就职的门槛吗？",
          a: "多数面向外国人的日企岗位把「N2 以上」写进招聘条件，作为能在日语环境工作的基准；对客沟通多的岗位还会看重实际口语。简历上 N2 及以上的成绩才普遍被视为有效信息。",
        },
        {
          q: "N2 的读解和听力怎么提分？",
          a: "读解靠限时训练：每天 2-3 篇中长文，先求准确再求速度；听力优先补高频口语表达与敬语变形，模考后逐题回听错题。用错题本按题型统计弱项，针对性刷题比全面重学效率更高。",
        },
      ],
    },
    en: {
      metaTitle: "JLPT N2 Guide | Pass mark, test sections, vocabulary size & prep FAQ",
      metaDescription:
        "Everything about JLPT N2: 180-point total, 90-point pass mark, 19-point sectional minimums, the three scoring sections and a ~6,000-word vocabulary reference. N2 is the usual hiring threshold in Japan — prep FAQ, free placement test and online mock exams included.",
      subtitle: "The most practical threshold level for jobs and admissions in Japan.",
      summary:
        "N2 expects you to read newspaper articles and general commentary, and to follow conversations and news at near-natural speed. It is the most practical level: most Japanese companies hiring foreigners, vocational schools and some universities use N2 as their baseline. Prep usually centres on completing your grammar system and building reading speed.",
      faq: [
        {
          q: "How long does N2 preparation take?",
          a: "Starting from N3 level, a common pace is 1–2 hours a day for 6–10 months. Learners with a kanji background pick up reading faster, but listening and grammar collocations need dedicated drilling. Take the free placement test first to confirm your starting point, then budget time by weakness.",
        },
        {
          q: "Is N2 the hiring threshold in Japan?",
          a: "Most positions open to foreigners list \"N2 or above\" as a requirement — it is treated as the baseline for working in a Japanese-language environment. Roles heavy on customer contact also weigh real speaking ability. On a resume, only N2 and above is generally read as meaningful.",
        },
        {
          q: "How do I raise my N2 reading and listening scores?",
          a: "Reading improves with timed training: two or three medium-length passages a day, accuracy first, speed second. For listening, prioritise high-frequency spoken forms and honorific transformations, and re-listen to every missed question after mocks. Tracking weak question types in a review book beats re-studying everything.",
        },
      ],
    },
    ja: {
      metaTitle: "JLPT N2 とは｜合格点・試験科目・語彙数の目安とよくある質問",
      metaDescription:
        "JLPT N2 の総合ガイド：総合得点 180 点満点・合格点 90 点・基準点 19 点、3 科目構成、語彙約 6,000 語（目安）。就職・進学の基準となるレベル。学習 FAQ と無料レベル判定・オンライン模試つき。",
      subtitle: "就職・進学で最も使われる基準レベル。日常＋幅広い場面の日本語が対象です。",
      summary:
        "N2 では新聞記事や一般的な評論の読解、自然に近いスピードの会話やニュースの聴解が求められます。外国人採用の求人や専門学校・一部大学の出願で基準とされることが多く、最も実用的なレベルです。学習の中心は文法体系の仕上げと読解スピードの向上です。",
      faq: [
        {
          q: "N2 の準備期間はどのくらいですか？",
          a: "N3 レベルからなら、1 日 1〜2 時間で 6〜10 か月が一つの目安です。漢字圏の学習者は読解に強い一方、聴解や文法のコロケーションは専用の練習が必要です。まず無料レベル判定で現在地を確認し、弱点に時間を配分しましょう。",
        },
        {
          q: "N2 は就職の基準になりますか？",
          a: "外国人向け求人の多くが「N2 以上」を条件に挙げており、日本語環境で働くための基準とされています。接客・顧客対応が多い職種では実際の会話力も重視されます。履歴書では N2 以上がひとつの目安として扱われます。",
        },
        {
          q: "読解と聴解の点数を上げるには？",
          a: "読解は時間を計った練習が近道です。1 日 2〜3 本の中長文を、正確さ→スピードの順で鍛えます。聴解は頻出の話し言葉と敬語の変形を優先し、模試後に間違えた問題を聞き直すこと。間違いノートで弱い問題形式を把握し、集中的に演習しましょう。",
        },
      ],
    },
  },
  n3: {
    zh: {
      metaTitle: "JLPT N3 考试指南｜合格线、题型构成、词汇量参考与备考 FAQ",
      metaDescription:
        "JLPT N3 全解：总分 180、合格线 95 分、单科基准线 19 分；三科构成、词汇量约 3,700 词（参考）。N3 是从基础迈向应用的过渡等级，附备考 FAQ、免费定级测试与在线练习。",
      subtitle: "承上启下的过渡等级：能大致理解日常场景的日语。",
      summary:
        "N3 处在 N4 的基础语法与 N2 的应用能力之间，要求读懂日常话题的文章、听懂接近日常语速的对话。它适合作为系统备考 N2 之前的里程碑，用来检验中级语法和词汇的扎实程度，也常被打工与生活场景视为「够用」的起点。",
      faq: [
        {
          q: "N3 大概是什么水平？",
          a: "能应对多数日常会话、读懂生活话题的短文，是「教科书日语」向「实际使用」过渡的阶段。到 N3 后，打工面试、日常办事的沟通压力会明显下降，但职场书面沟通仍需要 N2 以上。",
        },
        {
          q: "要不要跳过 N3 直接考 N2？",
          a: "如果时间充裕且模考稳定在 N3 合格线以上，可以直接备考 N2；但 N3 的语法与词汇是 N2 读解的地基，跳级前建议先做一次定级测试或 N3 模考确认基础，不稳就先补 N3 内容再上难度。",
        },
        {
          q: "从 N4 到 N3 需要多久？",
          a: "常见节奏是每天 1 小时左右、坚持 4-6 个月：词汇从约 1,500 扩到约 3,700，语法进入中级句型，同时开始接触成段的读解与更接近自然语速的听力。保持每天刷题打卡比周末突击更有效。",
        },
      ],
    },
    en: {
      metaTitle: "JLPT N3 Guide | Pass mark, test sections, vocabulary size & prep FAQ",
      metaDescription:
        "Everything about JLPT N3: 180-point total, 95-point pass mark, 19-point sectional minimums, three scoring sections and a ~3,700-word vocabulary reference. The bridge level between basics and working proficiency — prep FAQ and free tools included.",
      subtitle: "The bridge level: understanding everyday Japanese to a fair degree.",
      summary:
        "N3 sits between N4's foundation grammar and N2's applied ability. It expects you to read passages on everyday topics and follow conversations at near-daily speed. It works well as a milestone before a full N2 campaign, verifying that your intermediate grammar and vocabulary are solid — and it is often seen as \"enough\" for part-time work and daily life.",
      faq: [
        {
          q: "What does N3 roughly correspond to?",
          a: "You can handle most daily conversations and read short passages on everyday topics — the transition from textbook Japanese to real use. At N3, part-time job interviews and daily errands get noticeably easier, though written workplace communication still needs N2 or above.",
        },
        {
          q: "Should I skip N3 and go straight for N2?",
          a: "If you have time and your mock scores sit comfortably above the N3 pass line, going straight to N2 is reasonable. But N3 grammar and vocabulary are the foundation of N2 reading — take a placement test or an N3 mock first, and shore up N3 material if the base is shaky.",
        },
        {
          q: "How long from N4 to N3?",
          a: "A common pace is about an hour a day for 4–6 months: vocabulary grows from roughly 1,500 to 3,700 words, grammar moves into intermediate patterns, and you start reading full passages and listening at closer-to-natural speed. Daily drilling beats weekend cramming.",
        },
      ],
    },
    ja: {
      metaTitle: "JLPT N3 とは｜合格点・試験科目・語彙数の目安とよくある質問",
      metaDescription:
        "JLPT N3 の総合ガイド：総合得点 180 点満点・合格点 95 点・基準点 19 点、3 科目構成、語彙約 3,700 語（目安）。基礎から実用への橋渡しレベル。学習 FAQ と無料レベル判定つき。",
      subtitle: "基礎と実用をつなぐ中間レベル。日常的な場面の日本語がある程度理解できます。",
      summary:
        "N3 は N4 の基礎文法と N2 の応用力の中間に位置します。日常的な話題の文章の読解、日常に近いスピードの会話の聴解が求められます。N2 対策を本格化する前のマイルストーンとして、中級文法・語彙の定着を確認するのに適したレベルです。",
      faq: [
        {
          q: "N3 はどのくらいのレベルですか？",
          a: "日常会話の大半に対応でき、生活的な話題の短い文章が読める段階です。教科書の日本語から実際の使用への移行期にあたり、アルバイトの面接や日常の手続きはかなり楽になりますが、職場の書面コミュニケーションには N2 以上が必要です。",
        },
        {
          q: "N3 を飛ばして N2 を受けてもいいですか？",
          a: "時間に余裕があり、模試で N3 合格ラインを安定して超えているなら、直接 N2 対策でも問題ありません。ただし N3 の文法・語彙は N2 読解の土台です。まずレベル判定や N3 模試で基礎を確認し、不安定なら N3 の内容から固めましょう。",
        },
        {
          q: "N4 から N3 までどのくらいかかりますか？",
          a: "1 日 1 時間程度で 4〜6 か月が一つの目安です。語彙を約 1,500 語から約 3,700 語へ増やし、中級文型に進み、まとまった読解と自然に近いスピードの聴解に慣れていきます。週末の詰め込みより毎日の演習が効果的です。",
        },
      ],
    },
  },
  n4: {
    zh: {
      metaTitle: "JLPT N4 考试指南｜合格线、题型构成、词汇量参考与备考 FAQ",
      metaDescription:
        "JLPT N4 全解：总分 180、合格线 90 分、两大计分科目（言語知識・読解 120 分 / 听解 60 分）；词汇量约 1,500 词（参考）。基础巩固等级，附备考 FAQ 与免费在线练习。",
      subtitle: "基础巩固等级：能理解基本的日语。",
      summary:
        "N4 考查基础语法、约 1,500 词的词汇，以及用基础词汇写成的短文读解；听力是语速稍慢的日常对话。它对应「教科书基础阶段」的完成度——初级教材学完、基础句型能用，是继续向 N3、N2 进阶的地基。",
      faq: [
        {
          q: "N4 大概能做什么？",
          a: "能进行慢速、话题熟悉的日常对话，读懂用基础词汇写的短文与告示。生活上能应付简单场景，但离打工面试、职场使用还有距离——那通常需要 N3 到 N2 的水平。",
        },
        {
          q: "N4 之后怎么规划？",
          a: "N4 到 N3 是词汇量翻倍、语法进入中级的阶段，建议保持每天刷题与背单词的节奏，并开始成段读解与整段听力训练。可以先做免费定级测试确认自己是否已越过 N4，再决定直接备考 N3。",
        },
        {
          q: "N4 和 N5 差在哪里？",
          a: "N5 覆盖最基础的表达（约 800 词、汉字约 100 字），N4 把词汇扩到约 1,500 词、汉字约 300 字，语法句型也更完整，读解从句子级别变成短文级别。N4 通过意味着初级阶段真正学完。",
        },
      ],
    },
    en: {
      metaTitle: "JLPT N4 Guide | Pass mark, test sections, vocabulary size & prep FAQ",
      metaDescription:
        "Everything about JLPT N4: 180-point total, 90-point pass mark, two scoring sections (Language Knowledge & Reading 120 / Listening 60) and a ~1,500-word vocabulary reference. The foundation-consolidation level, with a prep FAQ and free practice tools.",
      subtitle: "The foundation level: understanding basic Japanese.",
      summary:
        "N4 tests foundation grammar, roughly 1,500 words of vocabulary, and reading short passages written in basic language; listening covers everyday conversations at a slightly slow speed. It marks the completion of the beginner-textbook stage — the base on which N3 and N2 are built.",
      faq: [
        {
          q: "What can I do at N4?",
          a: "You can hold slow, familiar-topic daily conversations and read short passages and notices written with basic vocabulary. Simple daily situations are manageable, but part-time job interviews and workplace use generally need N3 to N2.",
        },
        {
          q: "What comes after N4?",
          a: "N4 to N3 roughly doubles your vocabulary and moves grammar into intermediate patterns. Keep a daily rhythm of drilling and vocab review, and start training on full passages and longer listening. A free placement test can confirm you have cleared N4 before you commit to N3 prep.",
        },
        {
          q: "How is N4 different from N5?",
          a: "N5 covers the most basic expressions (about 800 words and 100 kanji); N4 expands to about 1,500 words and 300 kanji with a fuller set of sentence patterns, and reading moves from sentence level to short passages. Passing N4 means the beginner stage is genuinely complete.",
        },
      ],
    },
    ja: {
      metaTitle: "JLPT N4 とは｜合格点・試験科目・語彙数の目安とよくある質問",
      metaDescription:
        "JLPT N4 の総合ガイド：総合得点 180 点満点・合格点 90 点、得点区分は 2 つ（言語知識・読解 120 点／聴解 60 点）、語彙約 1,500 語（目安）。基礎固めのレベル。学習 FAQ と無料練習ツールつき。",
      subtitle: "基礎固めのレベル。基本的な日本語が理解できます。",
      summary:
        "N4 では基礎文法、約 1,500 語の語彙、基本的な語彙で書かれた短い文章の読解が問われます。聴解はややゆっくりした日常会話が中心です。初級教科書の修了に相当し、N3・N2 へ進むための土台となるレベルです。",
      faq: [
        {
          q: "N4 で何ができますか？",
          a: "ゆっくりした、身近な話題の日常会話ができ、基本語彙で書かれた短文やお知らせが読める段階です。簡単な生活場面には対応できますが、アルバイトの面接や職場での使用には一般に N3〜N2 が必要です。",
        },
        {
          q: "N4 の後はどう進めればいいですか？",
          a: "N4 から N3 は語彙が倍増し、文法が中級に入る段階です。毎日の演習と単語学習のリズムを保ち、まとまった読解と長めの聴解の練習を始めましょう。無料レベル判定で N4 を確実に超えているか確認してから N3 対策に進むのがおすすめです。",
        },
        {
          q: "N4 と N5 の違いは？",
          a: "N5 は最も基本的な表現（約 800 語・漢字約 100 字）が対象で、N4 では語彙約 1,500 語・漢字約 300 字に広がり、文型もより完全になります。読解も文レベルから短文レベルへ進み、N4 合格は初級課程の修了を意味します。",
        },
      ],
    },
  },
  n5: {
    zh: {
      metaTitle: "JLPT N5 考试指南｜合格线、题型构成、词汇量参考与备考 FAQ",
      metaDescription:
        "JLPT N5 全解：总分 180、合格线 80 分、两大计分科目（言語知識・読解 120 分 / 听解 60 分）；词汇量约 800 词、汉字约 100 字（参考）。日语入门第一个目标，附备考 FAQ 与免费在线练习。",
      subtitle: "入门等级：能理解基础的日语表达。",
      summary:
        "N5 覆盖平假名、片假名、约 100 个基础汉字与约 800 词，读解与听力都围绕课堂和生活中最基本的表达。它最大的价值是给入门阶段一个明确的目标与节奏——用一场标准化考试确认五十音、基础句型和常用词已经真正掌握。",
      faq: [
        {
          q: "零基础到 N5 要多久？",
          a: "常见节奏是每天 30-60 分钟、坚持 2-4 个月：先过五十音，再按教材推进基础句型与词汇。入门期最重要的是每天接触，短时间高频比长时间低频有效得多。",
        },
        {
          q: "N5 考什么内容？",
          a: "考查最基础的语言知识：假名与基础汉字的读法、约 800 个常用词、基础句型，读解是短句和简单短文，听力为慢速的课堂/生活对话。计分分成言語知識・読解（120 分）与听解（60 分）两部分。",
        },
        {
          q: "有必要专门报考 N5 吗？",
          a: "如果目标是升学或就职，N5/N4 证书本身作用有限，很多人会直接以 N3 或 N2 为第一个报考目标；但把 N5 当作阶段性检验、体验真实考试流程，对保持学习节奏很有帮助。可以先用免费定级测试和在线练习代替，成熟后再决定报考等级。",
        },
      ],
    },
    en: {
      metaTitle: "JLPT N5 Guide | Pass mark, test sections, vocabulary size & prep FAQ",
      metaDescription:
        "Everything about JLPT N5: 180-point total, 80-point pass mark, two scoring sections (Language Knowledge & Reading 120 / Listening 60) and a ~800-word, ~100-kanji reference. The first milestone in Japanese, with a prep FAQ and free practice tools.",
      subtitle: "The entry level: understanding basic Japanese expressions.",
      summary:
        "N5 covers hiragana, katakana, about 100 basic kanji and roughly 800 words; reading and listening both revolve around the most basic classroom and daily-life expressions. Its real value is giving the beginner stage a concrete target and rhythm — a standardised check that kana, core patterns and common words are truly in place.",
      faq: [
        {
          q: "How long from zero to N5?",
          a: "A common pace is 30–60 minutes a day for 2–4 months: master the kana first, then work through basic patterns and vocabulary with a textbook. At the beginner stage, daily contact matters most — short, frequent sessions beat long, rare ones.",
        },
        {
          q: "What does N5 actually test?",
          a: "The most basic language knowledge: kana and basic kanji readings, around 800 common words and core sentence patterns. Reading uses short sentences and simple passages; listening is slow classroom and daily-life conversation. Scoring splits into Language Knowledge & Reading (120) and Listening (60).",
        },
        {
          q: "Is it worth formally taking N5?",
          a: "For study or work goals, the N5/N4 certificates themselves carry limited weight — many learners aim for N3 or N2 as their first official attempt. But using N5 as a milestone and a rehearsal of the real exam flow helps keep momentum. Free placement tests and online drills can stand in until you choose your first official level.",
        },
      ],
    },
    ja: {
      metaTitle: "JLPT N5 とは｜合格点・試験科目・語彙数の目安とよくある質問",
      metaDescription:
        "JLPT N5 の総合ガイド：総合得点 180 点満点・合格点 80 点、得点区分は 2 つ（言語知識・読解 120 点／聴解 60 点）、語彙約 800 語・漢字約 100 字（目安）。日本語学習の最初の目標。学習 FAQ と無料練習ツールつき。",
      subtitle: "入門レベル。基本的な日本語の表現が理解できます。",
      summary:
        "N5 はひらがな・カタカナ、基本漢字約 100 字、約 800 語が対象で、読解・聴解とも教室や生活の最も基本的な表現が中心です。五十音・基本文型・常用語が本当に身についたかを標準化された試験で確認できる、入門期の明確な目標になります。",
      faq: [
        {
          q: "ゼロから N5 までどのくらいかかりますか？",
          a: "1 日 30〜60 分で 2〜4 か月が一つの目安です。まず五十音を固め、教科書に沿って基本文型と語彙を進めます。入門期は毎日触れることが最重要で、短時間×高頻度が長時間×低頻度に勝ります。",
        },
        {
          q: "N5 では何が出題されますか？",
          a: "最も基本的な言語知識が対象です。かなと基本漢字の読み、約 800 の常用語、基本文型が問われ、読解は短文と簡単な文章、聴解はゆっくりした教室・生活会話です。得点は言語知識・読解（120 点）と聴解（60 点）に分かれます。",
        },
        {
          q: "N5 を受験する必要はありますか？",
          a: "進学や就職が目的なら N5/N4 の証書自体の効力は限定的で、最初の受験を N3 や N2 に設定する学習者も多いです。ただ、学習のリズムを保ち本番の流れを体験する意味で N5 受験は有効です。まずは無料レベル判定やオンライン演習で代替し、受験級は実力がついてから決めても構いません。",
        },
      ],
    },
  },
};

// Shared per-locale UI strings (headings, table labels, CTAs).
const UI = {
  zh: {
    back: "JLPT 备考",
    titleOf: (label: string) => `JLPT ${label} 考试指南`,
    passHeading: "合格线与判定",
    total: "总分 180 分（三科/两科合计）",
    overall: (pass: number) => `综合 ${pass} 分及以上，且各计分科目均达到基准线才算合格`,
    structureHeading: "题型构成（计分科目）",
    threeRows: [
      "言語知識（文字・词汇・语法）：0–60 分（基准线 19 分）",
      "读解：0–60 分（基准线 19 分）",
      "听解：0–60 分（基准线 19 分）",
    ],
    twoRows: [
      "言語知識（文字・词汇・语法）・读解：0–120 分（基准线 38 分）",
      "听解：0–60 分（基准线 19 分）",
    ],
    structureNote: "各部分考试时长与出题细节请以 JLPT 官方最新公告为准。",
    vocabHeading: "词汇量参考",
    vocabLine: (words: string, kanji: string) => `词汇约 ${words} 词・汉字约 ${kanji} 字`,
    vocabNote: "官方自 2010 年起不再公布出题范围，以上为业界常用参考值，仅供规划学习量使用。",
    faqHeading: "备考 FAQ",
    placementTitle: "不确定等级？先做免费定级测试",
    placementSub: "十几道题，几分钟给出建议备考等级",
    pillPractice: (label: string) => `${label} 刷题练习`,
    pillExam: "在线模考",
    pillVocab: "高频单词",
    pillZone: "返回 JLPT 专区",
    disclaimer:
      "Machi 的 JLPT 题库为原创/授权导入内容,不含未授权官方历年真题原文;请以 JLPT 官方最新公告为准。",
  },
  en: {
    back: "JLPT prep",
    titleOf: (label: string) => `JLPT ${label} Guide`,
    passHeading: "Pass marks & scoring",
    total: "Total score: 180 points (sum of all scoring sections)",
    overall: (pass: number) => `You pass with an overall score of ${pass}+ AND every scoring section at or above its minimum`,
    structureHeading: "Test sections (scoring)",
    threeRows: [
      "Language Knowledge (vocabulary & grammar): 0–60 (sectional minimum 19)",
      "Reading: 0–60 (sectional minimum 19)",
      "Listening: 0–60 (sectional minimum 19)",
    ],
    twoRows: [
      "Language Knowledge & Reading: 0–120 (sectional minimum 38)",
      "Listening: 0–60 (sectional minimum 19)",
    ],
    structureNote: "For section timings and question details, always check the latest official JLPT announcements.",
    vocabHeading: "Vocabulary reference",
    vocabLine: (words: string, kanji: string) => `About ${words} words and ${kanji} kanji`,
    vocabNote: "The official body stopped publishing test scopes in 2010 — these are widely used estimates for planning study volume.",
    faqHeading: "Prep FAQ",
    placementTitle: "Not sure about your level? Take the free placement test",
    placementSub: "A dozen questions — a recommended level in minutes",
    pillPractice: (label: string) => `${label} practice drills`,
    pillExam: "Online mock exams",
    pillVocab: "Vocabulary decks",
    pillZone: "Back to JLPT hub",
    disclaimer:
      "Machi's JLPT question bank is original or licensed-import content — never unauthorized official past-paper text. Verify with official JLPT announcements.",
  },
  ja: {
    back: "JLPT 対策",
    titleOf: (label: string) => `JLPT ${label} とは`,
    passHeading: "合格点と判定基準",
    total: "総合得点は 180 点満点（各得点区分の合計）",
    overall: (pass: number) => `総合 ${pass} 点以上かつ、すべての得点区分で基準点以上が合格の条件です`,
    structureHeading: "試験科目（得点区分）",
    threeRows: [
      "言語知識（文字・語彙・文法）：0〜60 点（基準点 19 点）",
      "読解：0〜60 点（基準点 19 点）",
      "聴解：0〜60 点（基準点 19 点）",
    ],
    twoRows: [
      "言語知識（文字・語彙・文法）・読解：0〜120 点（基準点 38 点）",
      "聴解：0〜60 点（基準点 19 点）",
    ],
    structureNote: "試験時間や出題の詳細は、JLPT 公式の最新発表をご確認ください。",
    vocabHeading: "語彙数の目安",
    vocabLine: (words: string, kanji: string) => `語彙 約 ${words} 語・漢字 約 ${kanji} 字`,
    vocabNote: "2010 年以降、公式は出題範囲を公表していません。上記は学習量の計画に使われる一般的な目安です。",
    faqHeading: "よくある質問",
    placementTitle: "レベルに迷ったら無料レベル判定へ",
    placementSub: "十数問・数分で、おすすめの受験レベルを提案します",
    pillPractice: (label: string) => `${label} 問題演習`,
    pillExam: "オンライン模試",
    pillVocab: "頻出単語",
    pillZone: "JLPT 対策トップへ",
    disclaimer:
      "Machi の JLPT 問題はオリジナル/許諾済みの導入コンテンツで、無断の公式過去問原文は含みません。最新は JLPT 公式でご確認ください。",
  },
} as const;

function isLevelKey(v: string): v is LevelKey {
  return (JLPT_LEVEL_KEYS as readonly string[]).includes(v);
}

export async function generateMetadata({ params }: { params: Promise<{ level: string }> }): Promise<Metadata> {
  const { level } = await params;
  const key = level.toLowerCase();
  if (!isLevelKey(key)) return {};
  const locale = await resolveMarketingLocale();
  const copy = COPY[key][locale] ?? COPY[key].zh;
  const path = `/guide/jlpt/levels/${key}`;
  return {
    title: { absolute: `${copy.metaTitle} | Machi` },
    description: copy.metaDescription,
    alternates: { canonical: path },
    openGraph: {
      title: copy.metaTitle,
      description: copy.metaDescription,
      url: `${SITE}${path}`,
      siteName: "Machi",
      images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "Machi JLPT" }],
      type: "article",
    },
    twitter: {
      card: "summary_large_image",
      title: copy.metaTitle,
      description: copy.metaDescription,
    },
  };
}

// Same pill-link treatment as the zone page's 错题本/考试日历 row.
const PILL_CLASS =
  "inline-flex items-center gap-1.5 rounded-full border border-[rgb(var(--kx-living-ink))]/[0.1] bg-[rgb(var(--kx-living-surface))] px-3.5 py-2 text-xs font-bold text-[rgb(var(--kx-living-ink))] transition hover:border-[rgb(var(--kx-living-accent))]/40 hover:text-[rgb(var(--kx-living-accent))]";

export default async function JlptLevelPage({ params }: { params: Promise<{ level: string }> }) {
  const { level } = await params;
  const key = level.toLowerCase();
  if (!isLevelKey(key)) notFound();
  const locale = await resolveMarketingLocale();
  const copy = COPY[key][locale] ?? COPY[key].zh;
  const ui = UI[locale] ?? UI.zh;
  const facts = FACTS[key];
  const rows = facts.split === "three" ? ui.threeRows : ui.twoRows;

  const structuredData = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: copy.faq.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }}
      />
      <GuideShell back={{ href: "/guide/jlpt", label: ui.back }}>
        <JlptNarrow>
          <JlptPageHeader
            eyebrow={`JLPT · ${facts.label}`}
            title={ui.titleOf(facts.label)}
            subtitle={copy.subtitle}
          />

          <div className="mt-6 space-y-4">
            <JlptPanel>
              <p className="text-[13px] font-medium leading-relaxed text-[rgb(var(--kx-living-ink))]">
                {copy.summary}
              </p>
            </JlptPanel>

            <JlptPanel>
              <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[rgb(var(--kx-living-muted))]">
                {ui.passHeading}
              </p>
              <ul className="mt-2.5 space-y-1.5 text-[13px] font-medium leading-relaxed text-[rgb(var(--kx-living-ink))]">
                <li>{ui.total}</li>
                <li>{ui.overall(facts.pass)}</li>
              </ul>
            </JlptPanel>

            <JlptPanel>
              <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[rgb(var(--kx-living-muted))]">
                {ui.structureHeading}
              </p>
              <ul className="mt-2.5 space-y-1.5 text-[13px] font-medium leading-relaxed text-[rgb(var(--kx-living-ink))]">
                {rows.map((row) => (
                  <li key={row}>{row}</li>
                ))}
              </ul>
              <p className="mt-2.5 text-[11px] font-medium leading-relaxed text-[rgb(var(--kx-living-muted))]">
                {ui.structureNote}
              </p>
            </JlptPanel>

            <JlptPanel>
              <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[rgb(var(--kx-living-muted))]">
                {ui.vocabHeading}
              </p>
              <p className="mt-2.5 text-[13px] font-bold text-[rgb(var(--kx-living-ink))]">
                {ui.vocabLine(facts.words, facts.kanji)}
              </p>
              <p className="mt-1.5 text-[11px] font-medium leading-relaxed text-[rgb(var(--kx-living-muted))]">
                {ui.vocabNote}
              </p>
            </JlptPanel>
          </div>

          {/* FAQ — same details/summary treatment as the zone page. */}
          <section className="mt-8">
            <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[rgb(var(--kx-living-muted))]">
              {ui.faqHeading}
            </p>
            <div className="mt-3 space-y-2.5">
              {copy.faq.map((f) => (
                <details
                  key={f.q}
                  className="group rounded-2xl border border-[rgb(var(--kx-living-ink))]/[0.07] bg-[rgb(var(--kx-living-surface))] px-4 py-3.5 transition hover:border-[rgb(var(--kx-living-accent))]/25"
                >
                  <summary className="flex cursor-pointer items-center justify-between gap-3 text-sm font-bold text-[rgb(var(--kx-living-ink))] [&::-webkit-details-marker]:hidden">
                    {f.q}
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[rgb(var(--kx-living-ink))]/[0.05] text-[rgb(var(--kx-living-muted))] transition group-open:rotate-45">
                      <span className="text-base leading-none">+</span>
                    </span>
                  </summary>
                  <p className="mt-2.5 text-[13px] font-medium leading-relaxed text-[rgb(var(--kx-living-muted))]">{f.a}</p>
                </details>
              ))}
            </div>
          </section>

          {/* CTA: placement first (same accent card as the zone's study-plan CTA),
              then the practice/exam/vocab entries as pills. */}
          <Link
            href="/guide/jlpt/placement"
            className="group mt-6 flex items-center justify-between gap-3 rounded-2xl border border-[rgb(var(--kx-living-accent))]/25 bg-gradient-to-r from-[rgb(var(--kx-living-accent))]/[0.1] to-[rgb(var(--kx-living-accent))]/[0.04] px-4 py-4 transition hover:border-[rgb(var(--kx-living-accent))]/45"
          >
            <div className="min-w-0">
              <p className="text-sm font-black text-[rgb(var(--kx-living-accent))]">{ui.placementTitle}</p>
              <p className="mt-0.5 text-xs font-medium text-[rgb(var(--kx-living-muted))]">{ui.placementSub}</p>
            </div>
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[rgb(var(--kx-living-accent))] text-white transition group-hover:translate-x-0.5">
              <ArrowRight className="h-4 w-4" />
            </span>
          </Link>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href={`/guide/jlpt/practice?level=${facts.label}`} className={PILL_CLASS}>
              {ui.pillPractice(facts.label)}
            </Link>
            <Link href="/guide/jlpt/exam" className={PILL_CLASS}>
              {ui.pillExam}
            </Link>
            <Link href="/guide/jlpt/vocab" className={PILL_CLASS}>
              {ui.pillVocab}
            </Link>
            <Link href="/guide/jlpt" className={PILL_CLASS}>
              {ui.pillZone}
            </Link>
          </div>

          <JlptDisclaimer note={ui.disclaimer} />
        </JlptNarrow>
      </GuideShell>
    </>
  );
}
