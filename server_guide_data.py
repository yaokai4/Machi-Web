"""Guide seed data, i18n tables, and seed builders extracted from server.py.

Pure data + builder functions with NO dependency on any other server.py
module-level function or constant — only the standard library. The module-level
builder loops at the bottom finish populating GUIDE_SCHOOL_SEED / GUIDE_COMPANY_SEED
at import time, exactly as before. server.py imports every public name back so
`server.GUIDE_*` / `server._guide_int` references keep working unchanged.
"""
from __future__ import annotations

from typing import Any


# GUIDE_HERO is consumed at import time by GUIDE_HOME_MODULE_SEED below, so it
# lives here (moved out of server.py) to keep this module self-contained.
GUIDE_HERO = {
    "title": "日本指南",
    "subtitle": "留学、升学、就职、日语考试和在日生活服务。",
    "note": "由 Machi 编辑部整理，帮助你更系统地准备日本生活、学习和工作。",
    "searchPlaceholder": "搜索学校、升学、就职、日语、签证、公司、面试和生活资料",
    "quickTags": ["日本学校库", "外国人就职公司", "大学院", "语言学校", "就职", "面试", "JLPT", "签证"],
}


def _normalize_language_tag(raw: Any) -> str:
    value = str(raw or "zh-CN").strip()
    aliases = {"zh": "zh-CN", "zh-cn": "zh-CN", "zh-hans": "zh-CN", "en-us": "en", "en-gb": "en", "jp": "ja"}
    return aliases.get(value.lower(), value if value in {"zh-CN", "en", "ja"} else value[:16])


GUIDE_ARTICLE_I18N: dict[str, dict[str, dict[str, str]]] = {
    "graduate-school-full-process": {
        "en": {"title": "A Complete Roadmap for Japanese Graduate School Applications", "summary": "A step-by-step timeline from choosing a research direction and contacting professors to application, exams, interviews, and enrollment procedures."},
        "ja": {"title": "日本の大学院申請：準備から出願までの完全ロードマップ", "summary": "研究テーマ決定、教授連絡、出願、試験・面接、入学手続きまでを順番に整理します。"},
    },
    "research-plan-what-to-write": {
        "en": {"title": "What to Write in a Research Plan: Structure and Examples", "summary": "Research topic, prior studies, research purpose, and methodology: the parts professors actually evaluate."},
        "ja": {"title": "研究計画書には何を書くべきか：構成と例", "summary": "研究テーマ、先行研究、研究目的、研究方法など、教授が重視する部分を整理します。"},
    },
    "contact-professor-email": {
        "en": {"title": "Email Templates and Etiquette for Contacting Professors", "summary": "When to contact professors, how to write a polite Japanese email, and what to do if you are rejected or receive no reply."},
        "ja": {"title": "教授連絡メールのテンプレートと注意点", "summary": "事前相談の要否、日本語メールのマナー、断られた場合や返信がない場合の対応を整理します。"},
    },
    "language-school-application": {
        "en": {"title": "Complete Guide to Applying for Japanese Language Schools", "summary": "Who language school is for, intake timing, school selection, documents, COE, and visa flow."},
        "ja": {"title": "日本語学校申請の完全ガイド", "summary": "対象者、入学時期、学校選び、必要書類、COE、ビザ申請までを整理します。"},
    },
    "study-cost-one-year": {
        "en": {"title": "How Much Does One Year of Study in Japan Cost?", "summary": "Tuition, housing, living costs, initial expenses, and how much part-time work can realistically cover."},
        "ja": {"title": "日本留学 1 年にかかる費用の目安", "summary": "学費、住まい、生活費、初期費用、アルバイトで補える範囲を整理します。"},
    },
    "first-week-in-japan-checklist": {
        "en": {"title": "Your First-Week Checklist After Arriving in Japan", "summary": "Residence card, resident registration, phone plan, bank account, insurance, and other first-week essentials."},
        "ja": {"title": "日本入国後 1 週間でやるべき手続きチェックリスト", "summary": "在留カード、住民登録、スマホ、銀行口座、保険など、到着直後の重要手続きを整理します。"},
    },
    "job-hunting-full-process": {
        "en": {"title": "Japan Job-Hunting Flow for New Graduates and Mid-Career Applicants", "summary": "Self-analysis, company briefings, entry sheets, web tests, interviews, offers, and work-visa changes."},
        "ja": {"title": "日本の就職活動の全体像（新卒・中途）", "summary": "自己分析、説明会、ES、Web テスト、面接、内定、在留資格変更までを整理します。"},
    },
    "rirekisho-vs-shokumukeirekisho": {
        "en": {"title": "Rirekisho vs. Shokumukeirekisho: What Is the Difference?", "summary": "One document explains who you are; the other explains what you have done and what you can contribute."},
        "ja": {"title": "履歴書と職務経歴書の違い", "summary": "一方は基本情報、もう一方は経験と貢献できることを伝える資料です。"},
    },
    "japanese-interview-questions": {
        "en": {"title": "Common Japanese Interview Questions and How to Answer Them", "summary": "Self-PR, motivation, student experiences, and reverse questions: what interviewers are really checking."},
        "ja": {"title": "日本語面接のよくある質問と答え方", "summary": "自己 PR、志望動機、学生時代の経験、逆質問など、面接官が確認したいポイントを整理します。"},
    },
    "jlpt-n2-study-roadmap": {
        "en": {"title": "JLPT N2 Study Roadmap and Timeline", "summary": "How to phase vocabulary, grammar, reading, and listening practice into a realistic study plan."},
        "ja": {"title": "JLPT N2 の学習ロードマップと時間計画", "summary": "語彙、文法、読解、聴解を段階的に進める実行しやすい計画を整理します。"},
    },
    "n1-n2-grammar-method": {
        "en": {"title": "How to Study N1/N2 Grammar Without Forgetting It", "summary": "Learn grammar in context, group similar patterns, and reinforce them through output instead of memorizing tables."},
        "ja": {"title": "N1/N2 文法を忘れにくく学ぶ方法", "summary": "文脈で覚え、意味ごとに整理し、アウトプットで定着させる方法を紹介します。"},
    },
    "jlpt-reading-speed": {
        "en": {"title": "How to Improve JLPT Reading Speed", "summary": "Read the questions first, track connectors and references, and manage time by passage type."},
        "ja": {"title": "JLPT 読解スピードを上げる方法", "summary": "先に設問を読み、接続詞と指示語を追い、文章ごとに時間を管理するコツを整理します。"},
    },
    "residence-card-and-juminhyo": {
        "en": {"title": "Residence Card and Resident Registration Procedures", "summary": "What the residence card is, how to file a move-in notification, and which insurance or My Number steps to handle together."},
        "ja": {"title": "在留カードと住民登録（役所）の手続き", "summary": "在留カード、転入届、国民健康保険、マイナンバー関連手続きを整理します。"},
    },
    "renting-initial-cost": {
        "en": {"title": "Initial Costs When Renting in Japan", "summary": "Deposit, key money, agent fees, guarantor companies, and how to reduce your first payment."},
        "ja": {"title": "日本の賃貸初期費用の内訳", "summary": "敷金、礼金、仲介手数料、保証会社、初期費用を抑えるポイントを整理します。"},
    },
    "student-part-time-job-rules": {
        "en": {"title": "Part-Time Work Rules for International Students", "summary": "Permission for activities outside your status, the 28-hour rule, restricted industries, and why attendance comes first."},
        "ja": {"title": "留学生のアルバイト注意点と時間制限", "summary": "資格外活動許可、週 28 時間の上限、できない業種、出席率の重要性を整理します。"},
    },
    "is-company-foreigner-friendly": {
        "en": {"title": "How to Judge Whether a Japanese Company Is Foreigner-Friendly", "summary": "A checklist covering visa support, language environment, transparent evaluation, overtime culture, and foreign-employee growth paths."},
        "ja": {"title": "日本企業が外国人に向いているか判断する方法", "summary": "ビザ支援、言語環境、評価制度、残業文化、外国人社員の成長機会を確認するチェックリストです。"},
    },
    "japan-company-interview-process": {
        "en": {"title": "Japanese Company Interview Flow: First, Second, and Final Rounds", "summary": "Who interviews you at each stage, what they evaluate, and how to prepare for each round."},
        "ja": {"title": "日本企業の面接フロー（一次・二次・最終）", "summary": "各面接の担当者、評価ポイント、準備方法を整理します。"},
    },
    "identify-black-company": {
        "en": {"title": "How to Spot Risky Companies from Job Listings", "summary": "Frequent recruiting, vague pay, inflated language, and other warning signs you can catch before applying."},
        "ja": {"title": "求人情報からリスクの高い会社を見分ける基礎", "summary": "頻繁な大量募集、曖昧な給与、誇張表現など、応募前に確認したい注意点を整理します。"},
    },
}

GUIDE_CATEGORY_I18N: dict[str, dict[str, dict[str, str]]] = {
    "study_japan": {
        "en": {"title": "Study in Japan", "subtitle": "Graduate school, vocational schools, transfer admissions", "description": "Graduate school, vocational schools, transfer admissions, research plans, contacting professors, and application documents."},
        "ja": {"title": "日本進学", "subtitle": "大学院・専門学校・編入", "description": "大学院、専門学校、学部編入、研究計画書、教授連絡、出願書類を整理しています。"},
    },
    "career_japan": {
        "en": {"title": "Careers in Japan", "subtitle": "Job hunting, resumes, interviews, offers", "description": "Japanese job-hunting flow, resumes, entry sheets, interviews, offers, visa changes, and industry research."},
        "ja": {"title": "日本就職", "subtitle": "就活・履歴書・面接・内定", "description": "日本の就職活動、履歴書、ES、面接、内定、在留資格変更、業界選びを整理しています。"},
    },
    "study_abroad_japan": {
        "en": {"title": "Study Abroad in Japan", "subtitle": "Language schools, visas, arrival", "description": "Language schools, study-abroad documents, visas, arrival preparation, costs, and application flow."},
        "ja": {"title": "留学申請", "subtitle": "日本語学校・ビザ・入国準備", "description": "日本語学校、留学書類、ビザ、入国準備、費用、申請の流れを整理しています。"},
    },
    "jlpt": {
        "en": {"title": "Japanese Tests", "subtitle": "JLPT N5-N1, vocabulary and grammar", "description": "JLPT N5-N1, vocabulary, grammar, reading, listening, study plans, and resource packs."},
        "ja": {"title": "日本語試験", "subtitle": "JLPT N5-N1・語彙文法", "description": "JLPT N5-N1、語彙、文法、読解、聴解、学習計画、資料パックを整理しています。"},
    },
    "life_japan": {
        "en": {"title": "Life in Japan", "subtitle": "Residence card, city hall, housing, part-time work", "description": "Residence cards, city-hall procedures, housing, part-time work, bank accounts, SIM cards, insurance, and daily-life checklists."},
        "ja": {"title": "日本生活", "subtitle": "在留カード・役所・住まい・アルバイト", "description": "在留カード、役所手続き、住まい、アルバイト、銀行口座、スマホ、保険、生活の注意点を整理しています。"},
    },
    "guide_services": {
        "en": {"title": "Resources and Services", "subtitle": "Resource packs, templates, consultation", "description": "Resource packs, templates, courses, consultation, resume review, research-plan review, and application coaching."},
        "ja": {"title": "資料とサービス", "subtitle": "資料パック・テンプレート・相談", "description": "資料パック、テンプレート、講座、相談、履歴書添削、研究計画書レビュー、申請サポートを整理しています。"},
    },
}

GUIDE_CATEGORY_SEED: list[dict[str, Any]] = [
    {
        "key": "study_japan", "title": "日本升学", "subtitle": "大学院・专门学校・编入",
        "description": "大学院、专门学校、学部编入、研究计划书、教授联系和出愿材料。",
        "icon": "graduation", "color": "#2563EB",
        "children": [
            ("graduate_school", "大学院申请"), ("research_plan", "研究计划书"),
            ("professor_contact", "教授联系"), ("application_documents", "出愿材料"),
            ("undergraduate_transfer", "学部·编入"), ("vocational_school", "专门学校"),
            ("scholarship", "奖学金"), ("admission_interview", "面试"),
        ],
    },
    {
        "key": "career_japan", "title": "日本就职", "subtitle": "就活・履历书・面试・内定",
        "description": "日本求职流程、履历书、ES、面试、内定、签证变更和行业选择。",
        "icon": "briefcase", "color": "#0E7490",
        "children": [
            ("job_hunting_flow", "就职流程"), ("rirekisho", "履历书"),
            ("shokumukeirekisho", "职务经歴书"), ("entry_sheet", "ES·志望动机"),
            ("job_interview", "面试"), ("company_selection", "公司选择"),
            ("company_reviews", "公司评论"), ("work_visa", "签证变更"),
            ("industry_guides", "行业指南"),
        ],
    },
    {
        "key": "study_abroad_japan", "title": "留学申请", "subtitle": "语言学校・签证・入境",
        "description": "语言学校、留学材料、签证、入境准备、费用和申请流程。",
        "icon": "plane", "color": "#7C3AED",
        "children": [
            ("language_school", "语言学校申请"), ("student_visa", "留学签证"),
            ("arrival_preparation", "入境准备"), ("study_cost", "留学费用"),
            ("school_selection", "学校选择"),
        ],
    },
    {
        "key": "jlpt", "title": "日语考级", "subtitle": "JLPT N5–N1・词汇语法",
        "description": "JLPT N5-N1、词汇、语法、阅读、听力、学习计划和资料包。",
        "icon": "language", "color": "#DB2777",
        "children": [
            ("jlpt_n5", "N5"), ("jlpt_n4", "N4"), ("jlpt_n3", "N3"),
            ("jlpt_n2", "N2"), ("jlpt_n1", "N1"), ("vocabulary", "词汇"),
            ("grammar", "语法"), ("reading", "阅读"), ("listening", "听力"),
            ("study_plan", "学习计划"), ("mock_test", "模拟题"), ("jlpt_materials", "资料包"),
        ],
    },
    {
        "key": "life_japan", "title": "日本生活", "subtitle": "在留卡・役所・租房・打工",
        "description": "在留卡、役所手续、租房、打工、银行卡、手机卡、保险和生活避坑。",
        "icon": "home", "color": "#059669",
        "children": [
            ("residence_card", "在留卡"), ("city_hall", "役所手续"),
            ("health_insurance", "国民健康保险"), ("pension", "年金"),
            ("bank_account", "银行卡"), ("mobile_sim", "手机卡"),
            ("renting", "租房"), ("moving", "搬家"), ("part_time_job", "打工"),
            ("tax", "税金"), ("transportation", "交通"), ("medical", "医疗"),
            ("life_tips", "生活避坑"),
        ],
    },
    {
        "key": "guide_services", "title": "资料与服务", "subtitle": "资料包・模板・咨询辅导",
        "description": "资料包、模板、课程、咨询、简历修改、研究计划书修改和申请辅导。",
        "icon": "package", "color": "#D97706",
        "children": [
            ("service_materials", "资料包"), ("service_templates", "模板"),
            ("service_consultation", "咨询辅导"),
        ],
    },
]

GUIDE_FAQ_SEED: list[dict[str, str]] = [
    {"q": "语言学校和大学院申请有什么区别？",
     "a": "语言学校面向想先打好日语基础、再升学或就职的人，门槛低、以语言学习和升学指导为主；大学院（修士/博士）是研究生阶段，需要研究计划书、联系教授和出愿材料，对日语或英语成绩、专业背景都有要求。很多人会先读语言学校过渡，再考大学院。",
     "category_key": "study_japan"},
    {"q": "研究计划书一般要写多少字？",
     "a": "没有统一硬性规定，文科常见 2000–4000 字，理工科可能更短但更看重研究方法的可行性。重点不是字数，而是研究主题、先行研究、研究目的、研究方法和预期成果是否清晰、是否和目标教授的研究方向匹配。",
     "category_key": "study_japan"},
    {"q": "留学签证（COE）一般什么时候开始申请？",
     "a": "COE（在留资格认定证明书）由日本的学校代为向入管申请，通常在入学前 3–4 个月开始。以 4 月入学为例，多数语言学校在前一年的 11 月左右截止材料。建议倒推时间，预留材料公证、翻译和经费证明的准备时间。",
     "category_key": "study_abroad_japan"},
    {"q": "在日本找工作一定要 N1 吗？",
     "a": "不是绝对，但大多数面向日本人的综合岗位（営業、企画、総合職）实际要求接近 N1；IT、研发、英语环境的外资岗位 N2 甚至更低也有机会。日语越好选择面越宽，面试中的实际沟通能力往往比证书更被看重。",
     "category_key": "career_japan"},
    {"q": "JLPT 一年考几次？什么时候报名？",
     "a": "JLPT 一年两次，分别在 7 月和 12 月。报名通常提前约 3 个月开始、名额有限，热门考点会很快报满。建议关注 JLPT 官方网站的报名窗口，确定考级后尽早报名并制定备考计划。",
     "category_key": "jlpt"},
    {"q": "Machi 指南的内容来自哪里？可信吗？",
     "a": "所有指南由 Machi 编辑部整理，身份明确为官方/编辑部/合作方，不使用爬虫新闻、不复制版权教材、不伪造用户内容。公司面试评论来自真实用户提交并经过审核。引用官方考试或入管信息时会标注来源，请同时以官方最新公告为准。",
     "category_key": ""},
]

GUIDE_GOAL_I18N: dict[str, dict[str, str]] = {
    "goal_study_abroad": {"en": "I want to study in Japan", "ja": "日本に留学したい"},
    "goal_language_school": {"en": "I want to apply to a language school", "ja": "日本語学校に申請したい"},
    "goal_graduate_school": {"en": "I want to apply to graduate school", "ja": "大学院に申請したい"},
    "goal_find_job": {"en": "I want to find a job in Japan", "ja": "日本で仕事を探したい"},
    "goal_jlpt": {"en": "I want to prepare for the JLPT", "ja": "日本語試験を準備したい"},
    "goal_life_setup": {"en": "I want to understand daily-life procedures", "ja": "日本生活の手続きを知りたい"},
    "goal_buy_materials": {"en": "I want resources or consultation", "ja": "資料購入・相談をしたい"},
}

GUIDE_GOAL_SEED: list[dict[str, str]] = [
    {"targetKey": "goal_study_abroad", "title": "我想去日本留学", "categoryKey": "study_abroad_japan", "subCategoryKey": ""},
    {"targetKey": "goal_language_school", "title": "我想申请语言学校", "categoryKey": "study_abroad_japan", "subCategoryKey": "language_school"},
    {"targetKey": "goal_graduate_school", "title": "我想申请大学院", "categoryKey": "study_japan", "subCategoryKey": "graduate_school"},
    {"targetKey": "goal_find_job", "title": "我想在日本找工作", "categoryKey": "career_japan", "subCategoryKey": ""},
    {"targetKey": "goal_jlpt", "title": "我想准备日语考试", "categoryKey": "jlpt", "subCategoryKey": ""},
    {"targetKey": "goal_life_setup", "title": "我想了解日本生活手续", "categoryKey": "life_japan", "subCategoryKey": ""},
    {"targetKey": "goal_buy_materials", "title": "我想买资料或预约咨询", "categoryKey": "guide_services", "subCategoryKey": ""},
]

GUIDE_HOME_MODULE_SEED: list[dict[str, Any]] = [
    {"moduleKey": "hero", "title": "日本指南首页 Hero", "subtitle": "搜索、快搜标签和定位文案", "sortOrder": 1, "content": GUIDE_HERO},
    {"moduleKey": "categories", "title": "核心分类", "subtitle": "六大入口与子分类", "sortOrder": 10},
    {"moduleKey": "goals", "title": "目标入口", "subtitle": "按用户目的进入对应指南", "sortOrder": 20},
    {"moduleKey": "resources", "title": "资料库入口", "subtitle": "学校库与公司库", "sortOrder": 30},
    {"moduleKey": "featuredArticles", "title": "精选指南", "subtitle": "编辑部精选文章", "sortOrder": 40},
    {"moduleKey": "categorySpotlights", "title": "分类专题区", "subtitle": "六大入口下的文章聚合", "sortOrder": 50},
    {"moduleKey": "featuredSchools", "title": "学校库推荐", "subtitle": "精选学校档案", "sortOrder": 60},
    {"moduleKey": "commerce", "title": "资料与服务", "subtitle": "商品、会员资料与人工服务", "sortOrder": 70},
    {"moduleKey": "companyHighlights", "title": "公司库推荐", "subtitle": "外国人就职公司档案", "sortOrder": 80},
    {"moduleKey": "latestArticles", "title": "最新更新", "subtitle": "最近发布的指南文章", "sortOrder": 90},
    {"moduleKey": "faq", "title": "常见问题", "subtitle": "Guide FAQ", "sortOrder": 100},
]

GUIDE_TOPIC_SEED: list[dict[str, Any]] = [
    {
        "slug": "graduate-school-application-start",
        "title": "大学院申请从 0 到出愿",
        "description": "把选研究室、教授联系、研究计划书、出愿材料和面试串成一条完整路径。",
        "categoryKey": "study_japan",
        "tags": ["大学院", "研究计划书", "教授联系"],
        "articleSlugs": ["graduate-school-full-process", "research-plan-what-to-write", "contact-professor-email"],
        "productSlugs": ["research-plan-template-pack", "application-documents-checklist", "graduate-school-consultation"],
        "sortOrder": 10,
        "status": "published",
    },
    {
        "slug": "japan-arrival-first-month",
        "title": "刚到日本第一个月",
        "description": "住民登记、保险、银行卡、手机卡、租房和生活规则的集中整理。",
        "categoryKey": "life_japan",
        "tags": ["入境", "役所", "银行卡", "租房"],
        "articleSlugs": ["first-week-in-japan-checklist", "residence-card-and-juminhyo", "bank-account-opening-guide", "rental-contract-before-signing"],
        "productSlugs": ["arrival-one-day-support", "bank-account-support", "mobile-sim-support"],
        "sortOrder": 20,
        "status": "published",
    },
    {
        "slug": "japan-job-hunting-starter",
        "title": "日本就职起步包",
        "description": "就活时间线、履历书/职务经歴书、面试和签证变更的基本路径。",
        "categoryKey": "career_japan",
        "tags": ["就活", "面试", "工作签证"],
        "articleSlugs": ["job-hunting-full-process", "shukatsu-timeline-for-students", "work-visa-gijinkoku-basics"],
        "productSlugs": ["interview-100-questions", "japan-job-mock-interview", "shokumukeirekisho-revision"],
        "sortOrder": 30,
        "status": "published",
    },
]

GUIDE_PRODUCT_BASE_I18N: dict[str, dict[str, dict[str, str]]] = {
    "n2-grammar-pack": {
        "en": {"title": "N2 Grammar Pack", "subtitle": "For N2 preparation and self-study", "description": "Original Machi notes that group high-frequency N2 grammar by meaning, with natural examples and comparisons of similar patterns."},
        "ja": {"title": "N2 文法整理パック", "subtitle": "N2 対策と自学習向け", "description": "Machi 編集部が N2 の頻出文法を意味別に整理し、自然な例文と似た表現の比較を付けたオリジナル資料です。"},
    },
    "research-plan-template-pack": {
        "en": {"title": "Graduate School Research Plan Template Pack", "subtitle": "Templates, examples, and professor-email samples", "description": "Research-plan structure templates, humanities/science outline examples, and Japanese/English email samples for contacting professors."},
        "ja": {"title": "大学院研究計画書テンプレートパック", "subtitle": "テンプレート、例、教授連絡メール", "description": "研究計画書の構成テンプレート、文系・理系の例、教授連絡用の日本語・英語メール例をまとめています。"},
    },
    "rirekisho-review-service": {
        "en": {"title": "Japanese Resume Review Service", "subtitle": "For people preparing for job hunting in Japan", "description": "Editors or partners with Japan job-hunting experience review your rirekisho and work-history document, covering motivation, self-PR, and formatting."},
        "ja": {"title": "日本就職・履歴書添削サービス", "subtitle": "就職活動を準備する方向け", "description": "日本就職経験のある編集者・提携者が、履歴書と職務経歴書を確認し、志望動機、自己 PR、形式を中心に改善提案を行います。"},
    },
    "language-school-doc-checklist": {
        "en": {"title": "Language School Application Document Checklist", "subtitle": "Documents to prepare before studying in Japan", "description": "A checklist for common language-school application documents: applicant materials, academic documents, sponsor documents, and timeline reminders."},
        "ja": {"title": "日本語学校申請書類チェックリスト", "subtitle": "日本留学前の書類準備", "description": "本人書類、学歴書類、経費支弁者書類、提出時期を整理した日本語学校出願用チェックリストです。"},
    },
    "interview-100-questions": {
        "en": {"title": "100 Common Japanese Interview Questions", "subtitle": "Prepare for first, second, and final interviews", "description": "High-frequency questions and answer frameworks organized by interview stage and question type, including self-PR, motivation, and reverse questions."},
        "ja": {"title": "日本面接よくある質問 100", "subtitle": "一次・二次・最終面接の準備", "description": "面接段階と質問タイプ別に、自己 PR、志望動機、逆質問などの頻出質問と回答の考え方を整理しています。"},
    },
}

GUIDE_RESOURCE_ENTRIES: list[dict[str, str]] = [
    {
        "key": "japan_schools",
        "title": "日本学校库",
        "description": "查找日本大学、大学院、专门学校、语言学校和留学生申请信息。",
        "icon": "school",
        "href": "/guide/schools",
    },
    {
        "key": "foreigner_friendly_companies",
        "title": "外国人就职公司库",
        "description": "查找适合外国人就职的日本公司、行业、岗位、面试经验和工作评价。",
        "icon": "building",
        "href": "/guide/companies",
    },
]

GUIDE_RESOURCE_I18N: dict[str, dict[str, dict[str, str]]] = {
    "japan_schools": {
        "en": {"title": "Japan School Database", "description": "Find universities, graduate schools, vocational schools, language schools, and application information for international students."},
        "ja": {"title": "日本の学校データベース", "description": "大学、大学院、専門学校、日本語学校、留学生向けの出願情報を探せます。"},
    },
    "foreigner_friendly_companies": {
        "en": {"title": "Foreigner-Friendly Company Database", "description": "Find Japanese companies, industries, roles, interview notes, and workplace reviews for international job seekers."},
        "ja": {"title": "外国人向け就職会社データベース", "description": "外国人が応募しやすい日本企業、業界、職種、面接情報、勤務レビューを探せます。"},
    },
}

GUIDE_SUBCATEGORY_I18N: dict[str, dict[str, str]] = {
    "graduate_school": {"en": "Graduate school applications", "ja": "大学院申請"},
    "research_plan": {"en": "Research plan", "ja": "研究計画書"},
    "professor_contact": {"en": "Contacting professors", "ja": "教授連絡"},
    "application_documents": {"en": "Application documents", "ja": "出願書類"},
    "undergraduate_transfer": {"en": "Undergraduate transfer", "ja": "学部・編入"},
    "vocational_school": {"en": "Vocational schools", "ja": "専門学校"},
    "scholarship": {"en": "Scholarships", "ja": "奨学金"},
    "admission_interview": {"en": "Admissions interview", "ja": "面接"},
    "job_hunting_flow": {"en": "Job-hunting flow", "ja": "就職活動の流れ"},
    "rirekisho": {"en": "Japanese resume", "ja": "履歴書"},
    "shokumukeirekisho": {"en": "Work-history document", "ja": "職務経歴書"},
    "entry_sheet": {"en": "Entry sheet and motivation", "ja": "ES・志望動機"},
    "job_interview": {"en": "Interviews", "ja": "面接"},
    "company_selection": {"en": "Choosing companies", "ja": "会社選び"},
    "company_reviews": {"en": "Company reviews", "ja": "会社レビュー"},
    "work_visa": {"en": "Work visa change", "ja": "就労ビザ変更"},
    "industry_guides": {"en": "Industry guides", "ja": "業界ガイド"},
    "language_school": {"en": "Language school applications", "ja": "日本語学校申請"},
    "student_visa": {"en": "Student visa", "ja": "留学ビザ"},
    "arrival_preparation": {"en": "Arrival preparation", "ja": "入国準備"},
    "study_cost": {"en": "Study costs", "ja": "留学費用"},
    "school_selection": {"en": "Choosing schools", "ja": "学校選び"},
    "vocabulary": {"en": "Vocabulary", "ja": "語彙"},
    "grammar": {"en": "Grammar", "ja": "文法"},
    "reading": {"en": "Reading", "ja": "読解"},
    "listening": {"en": "Listening", "ja": "聴解"},
    "study_plan": {"en": "Study plan", "ja": "学習計画"},
    "mock_test": {"en": "Mock tests", "ja": "模擬問題"},
    "jlpt_materials": {"en": "Resource packs", "ja": "資料パック"},
    "residence_card": {"en": "Residence card", "ja": "在留カード"},
    "city_hall": {"en": "City-hall procedures", "ja": "役所手続き"},
    "health_insurance": {"en": "Health insurance", "ja": "国民健康保険"},
    "pension": {"en": "Pension", "ja": "年金"},
    "bank_account": {"en": "Bank account", "ja": "銀行口座"},
    "mobile_sim": {"en": "Mobile SIM", "ja": "スマホ・SIM"},
    "renting": {"en": "Housing", "ja": "住まい"},
    "moving": {"en": "Moving", "ja": "引っ越し"},
    "part_time_job": {"en": "Part-time work", "ja": "アルバイト"},
    "tax": {"en": "Tax", "ja": "税金"},
    "transportation": {"en": "Transport", "ja": "交通"},
    "medical": {"en": "Medical care", "ja": "医療"},
    "life_tips": {"en": "Life tips", "ja": "生活の注意点"},
    "service_materials": {"en": "Resource packs", "ja": "資料パック"},
    "service_templates": {"en": "Templates", "ja": "テンプレート"},
    "service_consultation": {"en": "Consultation", "ja": "相談サポート"},
}

GUIDE_TAG_SEED: list[tuple[str, str, str]] = [
    ("大学院", "graduate_school", "study_japan"), ("语言学校", "language_school", "study_abroad_japan"),
    ("就职", "job_hunting", "career_japan"), ("面试", "interview", "career_japan"),
    ("JLPT", "jlpt", "jlpt"), ("签证", "visa", ""),
    ("租房", "renting", "life_japan"), ("资料包", "materials", "guide_services"),
]

GUIDE_UI_I18N: dict[str, dict[str, Any]] = {
    "en": {
        "hero": {
            "title": "Japan Guide",
            "subtitle": "Study, admissions, careers, JLPT preparation, and daily-life support in Japan.",
            "note": "Curated by the Machi editorial team to help you prepare for life, study, and work in Japan with a clearer plan.",
            "searchPlaceholder": "Search schools, admissions, careers, Japanese tests, visas, companies, interviews, and life resources",
            "quickTags": ["Japan school database", "Foreigner-friendly companies", "Graduate school", "Language schools", "Careers", "Interviews", "JLPT", "Visa"],
        },
        "empty": {
            "title": "Guide content is not available for this region yet",
            "body": "Machi Guide is currently focused on Japan: study abroad, school admissions, careers, Japanese tests, and daily life. More regions will be added over time.",
            "action": "Switch to Japan",
            "actionCountry": "jp",
        },
        "goalTitle": "What are you trying to do now?",
        "reviewDisclaimer": "Reviews are personal experiences submitted by users and are for reference only. Do not post private information, trade secrets, or serious claims that cannot be verified.",
        "schoolDisclaimer": "School information is curated from public sources and manual editorial review. It may lag behind official updates. Always confirm details with the school's official website and latest admission guidelines before applying.",
        "companyDisclaimer": "Company information and reviews are curated by the Machi editorial team and submitted by users for reference only. Always confirm career information with the company's official website or recruiting pages. Do not post private, confidential, or unverified serious claims.",
    },
    "ja": {
        "hero": {
            "title": "日本ガイド",
            "subtitle": "留学、進学、就職、JLPT 対策、日本での生活手続きを整理しています。",
            "note": "Machi 編集部が、日本での生活・学習・仕事を計画的に準備できるよう整理しています。",
            "searchPlaceholder": "学校、進学、就職、日本語試験、ビザ、会社、面接、生活資料を検索",
            "quickTags": ["日本の学校データベース", "外国人向け就職会社", "大学院", "日本語学校", "就職", "面接", "JLPT", "ビザ"],
        },
        "empty": {
            "title": "この地域のガイドはまだ公開されていません",
            "body": "Machi Guide は現在、日本の留学、進学、就職、日本語試験、生活情報を中心に整理しています。ほかの国・地域も順次追加予定です。",
            "action": "日本地域に切り替える",
            "actionCountry": "jp",
        },
        "goalTitle": "今、何を準備したいですか？",
        "reviewDisclaimer": "レビューはユーザー個人の体験に基づく参考情報です。個人情報、営業秘密、確認できない重大な主張は投稿しないでください。",
        "schoolDisclaimer": "学校情報は公開資料と編集部の確認に基づいて整理していますが、更新が遅れる場合があります。出願前に必ず学校公式サイト・募集要項・公式案内をご確認ください。",
        "companyDisclaimer": "会社情報とレビューは Machi 編集部の整理およびユーザー投稿に基づく参考情報です。応募前に会社公式サイトや採用ページで最新情報を確認してください。個人情報、機密情報、未確認の重大な主張は投稿しないでください。",
    },
}

def _guide_paras(*paras: str) -> str:
    return "\n\n".join(p for p in paras if p)


def _guide_int(raw: Any, default: int = 0, lo: int | None = None, hi: int | None = None) -> int:
    """Parse a query int defensively — bad input falls back to default so the
    Guide API never 500s on a malformed ?page= / ?pageSize= value."""
    try:
        value = int(str(raw).strip())
    except (TypeError, ValueError):
        value = default
    if lo is not None:
        value = max(lo, value)
    if hi is not None:
        value = min(hi, value)
    return value


def _guide_float(raw: Any) -> float | None:
    try:
        text = str(raw or "").strip()
        return float(text) if text else None
    except (TypeError, ValueError):
        return None


# 种子文章：每个核心分类 ≥3 篇，编辑部口吻、原创整理、非假用户。
GUIDE_ARTICLE_SEED: list[dict[str, Any]] = [
    # ---- 日本升学 ----
    {"slug": "graduate-school-full-process", "title": "日本大学院申请从 0 到出愿完整流程",
     "category": "study_japan", "sub": "graduate_school", "featured": True,
     "author": "Machi 升学编辑部", "tags": ["大学院", "出愿", "研究计划书"],
     "summary": "从确定方向、联系教授到出愿、面试，一步步拆解日本大学院申请的完整时间线。",
     "body": _guide_paras(
        "申请日本大学院（修士）和欧美直接网申不同，核心是「研究」二字。整体可以拆成六步：确定研究方向 → 选校选研究室 → 联系教授（套磁）→ 准备出愿材料 → 出愿与笔试/面试 → 合格与入学手续。建议至少提前 8–12 个月开始准备。",
        "第一步先想清楚自己想研究什么，而不是先看排名。把兴趣收敛成一个具体的研究主题，再去找研究方向匹配的研究室和教授。第二步用 J-GLOBAL、各大学研究者数据库、研究室主页确认教授近几年的研究内容和是否招收外国人留学生。",
        "第三步联系教授（事前相談）。一封得体的日文邮件，简短说明你的背景、研究兴趣、为什么选他的研究室，并附上研究计划书草稿。拿到教授「欢迎报考」的回复后，再进入第四步：志望理由书、研究计划书、成绩单、毕业（见込）证明、语言成绩、推荐信、报名表等出愿材料的准备。",
        "第五步按学校公布的出愿期间提交材料并参加考试。修士考试通常包含专业笔试、英语（部分用 TOEIC/TOEFL 替代）和面试/口头试问。第六步合格后办理入学手续、缴纳入学金，并着手准备在留资格变更或签证。把每个学校的截止日期做成一张清单倒推，是不踩坑的关键。",
     )},
    {"slug": "research-plan-what-to-write", "title": "研究计划书到底要写什么：结构与示例",
     "category": "study_japan", "sub": "research_plan", "featured": False,
     "author": "Machi 升学编辑部", "tags": ["研究计划书", "大学院"],
     "summary": "研究主题、先行研究、研究目的、研究方法——拆解教授真正在看的几个部分。",
     "body": _guide_paras(
        "研究计划书是大学院申请里最能拉开差距的材料。教授看的不是文采，而是「这个学生是否理解研究、能否在我的研究室独立推进一个课题」。一份结构完整的计划书通常包含：研究主题、研究背景、先行研究综述、研究目的与问题意识、研究方法、预期成果与意义、参考文献。",
        "研究主题要具体、可操作，避免「我想研究中日文化交流」这种过大的题目。研究背景说明为什么这个问题值得研究；先行研究部分要体现你读过相关文献、知道别人做到哪一步、你的研究填补哪个空白——这是最容易暴露准备是否充分的部分。",
        "研究目的与研究方法要互相对应：你要回答什么问题，用什么数据、什么方法去回答。文科常见问卷、访谈、文本分析、案例比较；理工科则要写清实验设计或模型。常见失败原因是题目过大、没有先行研究、目的和方法对不上、或与目标教授方向完全不匹配。",
        "建议先写草稿和教授沟通，根据反馈反复修改。可以参考公开的优秀计划书结构，但内容必须是你自己的研究构想，切勿照抄。",
     )},
    {"slug": "contact-professor-email", "title": "联系教授邮件模板和注意事项",
     "category": "study_japan", "sub": "professor_contact", "featured": False,
     "author": "Machi 升学编辑部", "tags": ["教授联系", "邮件", "大学院"],
     "summary": "要不要提前联系教授、日文邮件礼仪、被拒或没回复怎么办。",
     "body": _guide_paras(
        "是否需要提前联系教授，取决于学校和专业：很多国公立大学的研究室非常看重事前相談，提前沟通几乎是默认流程；也有部分项目（尤其英语项目）走统一出愿、不要求套磁。先到目标研究室主页和募集要项确认。",
        "一封好的联系邮件要短而清楚：礼貌的称呼（○○先生/教授）、简短自我介绍（学校、专业、毕业时间）、为什么对他的研究感兴趣、你的研究方向、希望报考的学期，并附研究计划书草稿。避免群发感、避免一上来就问能不能给奖学金。",
        "日文邮件礼仪上注意：主题写清楚（如「研究室訪問のお願い／○○大学 氏名」）、正文用敬体、落款写全名和联系方式、附件命名规范。",
        "被拒绝或长时间没回复都很常见，不要灰心。没回复可在一到两周后礼貌地再发一次确认；明确被拒就调整目标研究室。教授拒绝往往只是名额或方向不符，不代表否定你本人。",
     )},
    # ---- 留学申请 ----
    {"slug": "language-school-application", "title": "语言学校申请完整流程",
     "category": "study_abroad_japan", "sub": "language_school", "featured": True,
     "author": "Machi 升学编辑部", "tags": ["语言学校", "COE", "签证"],
     "summary": "适合人群、入学季、选校标准、材料清单到 COE 与签证的全流程。",
     "body": _guide_paras(
        "语言学校适合日语零基础或基础薄弱、想先在日本系统学日语再升学或就职的人。入学季有 1 月、4 月、7 月、10 月四次，其中 4 月生和 10 月生名额最多。由于要走 COE 申请，通常要提前约半年准备。",
        "选校时关注几点：是升学型还是就职型、出勤率和升学/就职实绩、班级人数与师资、地理位置和学费范围、是否有宿舍。不要只看广告，多看真实的升学去向。",
        "材料方面通常需要：报名表、最终学历毕业证与成绩、日语学习证明、护照、照片，以及经费支付人的在职/收入证明、银行存款证明等经费相关材料。经费证明是审查重点，要保证逻辑清晰、金额合理。",
        "学校收齐材料后会向入管申请 COE（在留资格认定证明书）。拿到 COE 后，本人在所在国的日本使领馆申请留学签证，再准备入境。把时间线倒推、尽早联系学校，是顺利入学的关键。",
     )},
    {"slug": "study-cost-one-year", "title": "日本留学一年大概需要多少钱",
     "category": "study_abroad_japan", "sub": "study_cost", "featured": False,
     "author": "Machi 升学编辑部", "tags": ["留学费用", "生活费"],
     "summary": "学费、住宿、生活费、初期费用的区间参考，以及打工能补贴多少。",
     "body": _guide_paras(
        "留学第一年的花费可以分成三块：学费、初期费用和生活费。语言学校学费大致每年 70–90 万日元区间，不同学校差异不小。初期费用包括签证、机票、入学金、第一笔房租押金礼金等，往往集中在入境前后。",
        "生活费里房租占大头。东京单间月租常见在 5–8 万日元，地方城市明显更低。加上水电网、手机、伙食、交通，一个月生活费大约 8–14 万日元，地区和生活方式影响很大。",
        "留学生持「资格外活动许可」每周最多可打工 28 小时（长假期间放宽），时薪因地区和工种而异。打工能补贴一部分生活费，但不建议把它算进必须的预算里——出勤率和学业才是第一位。",
        "总体来说，第一年准备充足一些的资金会更稳妥。具体金额请按目标城市和学校的最新标准核算，本文仅为区间参考。",
     )},
    {"slug": "first-week-in-japan-checklist", "title": "入境日本后第一周必须做的手续清单",
     "category": "study_abroad_japan", "sub": "arrival_preparation", "featured": False,
     "author": "Machi 日本生活编辑部", "tags": ["入境", "在留卡", "清单"],
     "summary": "在留卡、住民登记、手机卡、银行卡、保险——刚落地最该先办的几件事。",
     "body": _guide_paras(
        "刚到日本头几天事情很多，按优先级一件件来就不会乱。落地时在机场领取在留卡（部分机场当场发放），这是你在日本最重要的身份证件，务必随身保管。",
        "第一周内到居住地的区/市役所办理住民登记（転入届），同时办理国民健康保险加入手续；很多人会顺便办理 My Number 相关流程。住民票之后办很多事都会用到。",
        "接着办手机卡和银行账户。手机号在注册各种服务、收验证码时几乎必需；银行账户用于收打工工资、交房租。部分银行对刚入境、在留时间短的外国人开户有限制，可以先选对留学生友好的银行。",
        "其余还有：交通卡（Suica/ICOCA）、印章（部分手续需要）、若打工需确认「资格外活动许可」。把这些列成清单逐项打勾，第一周就能把生活基础搭好。具体手续以所在区役所的最新指引为准。",
     )},
    # ---- 日本就职 ----
    {"slug": "job-hunting-full-process", "title": "日本就职活动完整流程（新卒 / 中途）",
     "category": "career_japan", "sub": "job_hunting_flow", "featured": True,
     "author": "Machi 就职编辑部", "tags": ["就活", "新卒", "中途"],
     "summary": "从自我分析、说明会、ES、Web测试到面试、内定和签证变更的全流程。",
     "body": _guide_paras(
        "日本就职分「新卒」和「中途」两条路。新卒就活高度流程化、时间线统一：大致从前一年的自我分析与行业研究开始，经历说明会、实习（インターン）、ES 提交、Web 测试（SPI 等）、多轮面试，到拿到内定（内定），再到次年 4 月入社。",
        "自我分析和行业研究是地基：搞清楚自己的强项、想做的工作和行业，再有针对性地投递。ES（エントリーシート）和履历书是第一道筛选，志望动机和自己 PR 要具体、有事实支撑，避免空话。",
        "面试通常一次到三次：一次面试看基本沟通和动机，二次看专业匹配，最终面试多由管理层或役员把关。日语表达、逻辑和对公司的理解都会被考察，逆質問（反问环节）也要提前准备。",
        "中途採用更看重职务经歴和即战力，流程更短、随时招聘。对留学生而言，拿到内定后还有关键一步：把留学签证变更为工作签证（技术・人文知识・国际业务等），需要公司配合提供材料，建议尽早和公司人事确认时间线。",
     )},
    {"slug": "rirekisho-vs-shokumukeirekisho", "title": "履历书和职务经歴书有什么区别",
     "category": "career_japan", "sub": "rirekisho", "featured": False,
     "author": "Machi 就职编辑部", "tags": ["履历书", "职务经歴书"],
     "summary": "两份文件分工不同：一份讲你是谁，一份讲你做过什么、能做什么。",
     "body": _guide_paras(
        "日本求职常要同时提交「履历书（履歴書）」和「职务经歴书（職務経歴書）」，很多人分不清。简单说：履历书是标准化的个人基本信息，职务经歴书是自由格式的工作能力说明，两者分工不同、缺一不可。",
        "履历书格式相对固定：姓名、联系方式、照片、学历职历、资格证书、志望动机、本人希望栏等。要点是规范、整洁、无错别字，照片正式，日期用和历或西历保持统一。它回答的是「你是谁」。",
        "职务经歴书没有固定模板，由你自己组织：职业概述、按时间或项目列出的工作经历、负责内容、使用技能、可量化的成果。它回答的是「你做过什么、能为公司带来什么」，是中途採用里最被看重的材料。",
        "对应届生而言，职务经歴书可以用实习、研究、项目、社团等经历替代纯工作经历，重点突出可迁移的能力。两份文件信息要一致、相互印证，不要自相矛盾。",
     )},
    {"slug": "japanese-interview-questions", "title": "日语面试常见问题与回答思路",
     "category": "career_japan", "sub": "job_interview", "featured": False,
     "author": "Machi 就职编辑部", "tags": ["面试", "日语面试"],
     "summary": "自己PR、志望动机、逆質問——高频问题背后考官真正想确认的东西。",
     "body": _guide_paras(
        "日语面试的高频问题其实就那几类：自己 PR、学生时代最努力的事（学生時代に力を入れたこと／ガクチカ）、志望动机、职业规划、优缺点，以及最后的逆質問。与其背模板，不如理解每个问题背后考官想确认什么。",
        "自己 PR 和 ガクチカ 想确认你的强项是否真实、能否用具体事例支撑，建议用「情况—课题—行动—结果」的结构讲一个真实故事。志望动机想确认你是否真的了解这家公司、为什么是「这家」而不是同行，要结合公司具体业务来说。",
        "回答要点是「结论先行」：先给结论，再补理由和例子，符合日本职场偏好的表达习惯。语气保持礼貌、敬语稳定，听不清可以礼貌地请对方再说一次，不必慌。",
        "逆質問不是走过场，而是展示你做过功课和入职意愿的机会。准备 2–3 个有质量的问题，避免问官网就能查到的信息或只关心待遇假期。面试失败常见原因：动机空泛、对公司了解不足、答非所问、只背模板缺乏真实例子。",
     )},
    # ---- 日语考级 ----
    {"slug": "jlpt-n2-study-roadmap", "title": "JLPT N2 备考路线与时间规划",
     "category": "jlpt", "sub": "jlpt_n2", "featured": True,
     "author": "Machi 日语学习编辑部", "tags": ["JLPT", "N2", "学习计划"],
     "summary": "词汇、语法、阅读、听力如何分阶段推进，以及一份可执行的时间表。",
     "body": _guide_paras(
        "N2 是很多升学和就职的门槛线。整体备考可以分三个阶段：打基础（词汇+语法）、强化（阅读+听力）、冲刺（真题题型+查漏补缺）。如果每天能稳定投入 1–2 小时，3–6 个月是比较现实的周期，基础不同会有差异。",
        "第一阶段集中过一遍 N2 核心词汇和语法点，建议词汇和语法同步推进，边学边用例句记忆，而不是孤立背单词。每天固定一个词汇/语法的小目标，靠持续而非突击。",
        "第二阶段把重心转到阅读和听力。阅读练「带着问题找信息」的读法，控制单篇用时；听力靠量的积累和精听，刚开始可以「听一遍做题 + 再听对答案 + 看原文」三步走。",
        "第三阶段做整套限时练习，熟悉题型和时间分配，统计错题集中突破薄弱模块。考前两周回归高频词汇和语法、保持听力手感。注意：练习请使用正规、原创或正版资料，避免盗版真题。",
     )},
    {"slug": "n1-n2-grammar-method", "title": "N1/N2 语法到底怎么学才不会忘",
     "category": "jlpt", "sub": "grammar", "featured": False,
     "author": "Machi 日语学习编辑部", "tags": ["语法", "N1", "N2"],
     "summary": "把语法点放进语境、按意义分组、靠输出巩固，而不是死记表格。",
     "body": _guide_paras(
        "N1/N2 语法点又多又像，单纯背「接续 + 中文意思」很容易学完就忘、考场上还容易混。更有效的做法是：放进语境记、按意义分组记、靠输出巩固。",
        "放进语境，指每个语法点都配 1–2 个自然的例句，记住「在什么场景下、表达什么语气」，而不是只记中文翻译。很多近义语法（如表示原因、转折、强调的若干句型）差别就在语气和书面/口语色彩上。",
        "按意义分组，指把功能相近的句型放在一起对比，列出它们的细微差别，这样更容易区分易混点。可以自己整理一张对比表，比抄教材更有记忆效果。",
        "靠输出巩固，指学完后用它造句、写短文或在练习中刻意使用。语法是用出来的，输入和输出结合，记得才牢。复习上用间隔重复，重点放在易忘和易混的点。",
     )},
    {"slug": "jlpt-reading-speed", "title": "JLPT 阅读如何提高速度",
     "category": "jlpt", "sub": "reading", "featured": False,
     "author": "Machi 日语学习编辑部", "tags": ["阅读", "JLPT"],
     "summary": "先看题再读文、抓接续词和指示词、控制单篇用时的实战技巧。",
     "body": _guide_paras(
        "很多人 JLPT 阅读不是不会，而是做不完。提速的核心不是读得更快，而是读得更「有目的」。第一个习惯：先看题目和选项，带着问题去读，知道自己在找什么信息，避免逐字通读。",
        "第二个习惯：抓接续词和指示词。しかし、つまり、ところが 这类词决定了文章逻辑走向，こそあど（これ/それ）指代的内容常是出题点。顺着逻辑骨架读，比纠结每个生词更高效。",
        "第三个习惯：控制单篇用时。平时练习就按题型给自己计时，短篇、中篇、长篇各自定一个时间上限，超时就先选一个答案标记后跳过，保证整卷做完。",
        "最后是积累。阅读速度本质是词汇语法的熟练度 + 题感，靠平时持续精读和限时训练慢慢提上来，没有真正的捷径。考前用整套限时练习找节奏。",
     )},
    # ---- 日本生活 ----
    {"slug": "residence-card-and-juminhyo", "title": "在留卡和住民登记（役所）办理流程",
     "category": "life_japan", "sub": "city_hall", "featured": True,
     "author": "Machi 日本生活编辑部", "tags": ["在留卡", "役所", "住民登记"],
     "summary": "在留卡是什么、转入届怎么办、顺带要办的保险和 My Number。",
     "body": _guide_paras(
        "在留卡（在留カード）是中长期在留外国人的法定身份证件，记录你的姓名、在留资格、在留期间和居住地等信息。需要随身携带，地址变更、在留资格变更、续签都和它绑定。入境时在指定机场会当场发放。",
        "确定住所后，要在 14 天内到居住地的区/市役所办理住民登记（転入届），登记你的住址。役所会把住址信息写到在留卡背面或更新到系统里。这一步是后续办很多手续的前提。",
        "在役所通常会顺带办理几件事：加入国民健康保险（留学生等需要加入）、领取或确认 My Number（个人番号）通知、了解国民年金相关手续。把这些一次性问清楚，能少跑几趟。",
        "之后如果搬家，旧址要办「転出届」、新址办「転入届」；离开日本要办「転出届」。手续细节各地略有差异，请以所在区役所的最新窗口指引为准。",
     )},
    {"slug": "renting-initial-cost", "title": "日本租房初期费用详解",
     "category": "life_japan", "sub": "renting", "featured": False,
     "author": "Machi 日本生活编辑部", "tags": ["租房", "初期费用"],
     "summary": "敷金、礼金、中介费、保证公司——第一笔要准备多少钱，怎么省。",
     "body": _guide_paras(
        "在日本租房，第一笔「初期费用」往往是月租的 4–6 倍，远高于之后每月的房租，提前了解能避免预算被打乱。主要包括：敷金、礼金、中介手数料、首月房租、保证公司费用、火灾保险、换锁费等。",
        "敷金类似押金，退租时扣除清洁/修缮后可能退还一部分；礼金是给房东的、不退还，近年很多房源已「礼金 0」。中介手数料一般约一个月房租。保证公司费用是因为很多房东要求通过保证公司代替担保人。",
        "想省初期费用，可以优先找「敷金礼金 0」「フリーレント（免租期）」的房源，或选 UR、社宅、留学生宿舍等礼金较少的选择。但要综合看位置、通勤和房况，不要只盯着初期费用。",
        "签约前看清条款：退租预告期、清扫费、违约金、能否养宠物等。具体金额因城市、房型和房源差异很大，本文为结构性说明，实际以房源条件为准。",
     )},
    {"slug": "student-part-time-job-rules", "title": "留学生打工注意事项与时间限制",
     "category": "life_japan", "sub": "part_time_job", "featured": False,
     "author": "Machi 日本生活编辑部", "tags": ["打工", "资格外活动"],
     "summary": "28 小时上限、资格外活动许可、不能做的行业，以及出勤率优先。",
     "body": _guide_paras(
        "留学生在日本打工，前提是先取得「资格外活动许可」——通常可在入境时或之后到入管/通过在留卡背面申请。没有许可就打工属于违规，会影响在留资格，务必先办手续。",
        "时间上有硬性上限：一般每周最多 28 小时，长假期间（学校放假）可放宽到每天 8 小时以内。这个上限是按周计算的，不要因为换了几份工就超时，超时是常见的违规点。",
        "行业上有限制：风俗营业及相关场所的工作不被允许，即使只是端盘子也不行。选择正规的便利店、餐饮、零售、配送等岗位更稳妥。",
        "最后也是最重要的：留学生的本职是学习。出勤率和成绩直接关系到续签和升学，不要为了打工牺牲学业。合理安排时间，让打工成为补充而不是负担。具体规则以入管最新规定为准。",
     )},
    # ---- 公司选择与面试评论（编辑部指南，非用户评论）----
    {"slug": "is-company-foreigner-friendly", "title": "如何判断一家日本公司适不适合外国人",
     "category": "career_japan", "sub": "company_selection", "featured": True,
     "author": "Machi 就职编辑部", "tags": ["公司选择", "外国人", "就职"],
     "summary": "从签证支持、语言环境、晋升透明度到加班文化的判断清单。",
     "body": _guide_paras(
        "「适不适合外国人」不是一个模糊的感觉，可以拆成几个可观察的维度去判断：签证与在留支持、语言环境、晋升与评价透明度、加班与休假文化、是否已有外国人员工及其发展情况。",
        "签证支持是底线：公司是否愿意为你办理就业签证变更、过往是否雇佣过外国人、人事是否熟悉流程。语言环境决定日常体验：业务是否必须全日语、是否接受边工作边提升日语、有没有英语可用的岗位。",
        "晋升和评价是否透明，关系到长期发展：评价标准是否清晰、外国人能否进入管理岗、是否存在「玻璃天花板」。加班和休假文化则影响生活质量：平均加班时长、是否好请假、有没有「サービス残業（隐形加班）」。",
        "信息来源上，可以结合公司官网、说明会、面试中的逆質問、以及真实员工评价综合判断。在 Machi 指南里，公司面试与工作评论来自真实用户、经过审核，能帮你做交叉验证——但任何评价都只是参考，最终要结合自己的情况判断。",
     )},
    {"slug": "japan-company-interview-process", "title": "日本公司面试流程说明（一次/二次/最终）",
     "category": "career_japan", "sub": "job_interview", "featured": False,
     "author": "Machi 就职编辑部", "tags": ["面试", "流程"],
     "summary": "每一轮面试由谁来面、考察重点是什么、如何分别准备。",
     "body": _guide_paras(
        "日本公司的面试通常分多轮，每一轮的面试官和考察重点不同，提前知道节奏就能有的放矢。常见是一次面试、二次面试、最终面试，部分公司中间还有小组讨论（グループディスカッション）或现场课题。",
        "一次面试多由年轻员工或人事负责，考察基本沟通、礼仪、动机和第一印象，问题偏标准化（自己 PR、ガクチカ、志望动机）。这一轮稳住基础、把故事讲清楚即可。",
        "二次面试常由现场部门的负责人（現場社員/课长级）担任，更看专业匹配度和实际能力，会针对你的经历深挖细节。准备时要能展开讲清自己做过的事和思考过程。",
        "最终面试一般由役员或高管把关，看的是价值观契合、长期意愿和稳定性，问题更宏观（职业规划、为什么是本公司、能否长期发展）。每一轮都要准备逆質問，并根据对方身份调整问题的层次。",
     )},
    {"slug": "identify-black-company", "title": "ブラック企業识别基础：从招聘信息看风险",
     "category": "career_japan", "sub": "company_selection", "featured": False,
     "author": "Machi 就职编辑部", "tags": ["ブラック企業", "避坑"],
     "summary": "高频招聘、模糊薪资、夸张话术——招聘端就能看出的预警信号。",
     "body": _guide_paras(
        "「ブラック企業」指那些长期高强度加班、待遇与宣传不符、人员流动极高的公司。很多预警信号在投递前、从招聘信息里就能看出来，学会识别能少踩坑。",
        "信号一：常年、大量、急招同一岗位。如果一家公司总在高频招人、招聘门槛异常低，可能意味着离职率高。信号二：薪资写法模糊，比如把固定加班费（みなし残業）打包进基本工资、或只写一个很宽的区间、回避具体构成。",
        "信号三：话术过度煽情。大量强调「家族のような職場」「夢」「やりがい」却不谈具体待遇和制度的，要多留个心眼。信号四：面试推进异常快、当场逼你做决定、回避你关于加班和休假的提问。",
        "识别只是第一步，建议结合公开的员工评价、面试中的实际感受、以及离职率/平均年龄等信息交叉验证。Machi 指南的公司评论由真实用户提交并经审核，可作为参考之一；但请理性看待单条评价，避免以偏概全。",
     )},
    # ---- 在日生活（扩充批）----
    {"slug": "renting-initial-costs-explained", "title": "日本租房初期费用全拆解：敷金礼金到底是什么",
     "category": "life_japan", "sub": "housing", "featured": True,
     "author": "Machi 日本生活编辑部", "tags": ["租房", "敷金", "礼金", "初期费用"],
     "summary": "敷金、礼金、仲介手数料、保证会社、火灾保险——第一次租房前看懂每一项钱花在哪。",
     "body": _guide_paras(
        "在日本租房，搬进去之前要付的「初期费用」常常达到月租的 4–6 倍，由这些项目组成：敷金（押金，退房时扣除清洁修缮费后返还）、礼金（付给房东的谢礼，不返还）、仲介手数料（中介费，常见为一个月房租+消费税）、前家賃（首月或次月房租）、保证会社利用料、火灾保险、换锁费等。",
        "敷金礼金各 1 个月是传统行情，但现在「敷金礼金零」的房源也很多——注意零礼金房源有时会把成本转移到清洁费或解约金里，签约前把退房条款看清楚。保证会社是大多数房源的必选项：没有日本保证人的外国人基本都走保证会社，首次费用常见为月租的 50%–100%，之后每年或每两年续费。",
        "火灾保险一般两年 1.5–2 万日元区间；换锁费 1.5–2.5 万日元常见。部分房源还有「室内消毒」「24 小时支援」等可选项目，签约时可以确认哪些能去掉。",
        "省钱思路：找敷礼零或 Free Rent（免首月租）房源、避开 1–3 月搬家高峰、考虑 UR 赁贷（无礼金无中介费无保证人，但有收入条件）。所有金额以房源募集条件和重要事项说明书为准。",
     )},
    {"slug": "viewing-and-lease-contract-tips", "title": "看房与签约注意事项：重要事项说明里要盯紧什么",
     "category": "life_japan", "sub": "housing", "featured": False,
     "author": "Machi 日本生活编辑部", "tags": ["租房", "合同", "看房"],
     "summary": "看房时检查什么、申込到入居审查的流程、签约时哪些条款最容易踩坑。",
     "body": _guide_paras(
        "看房时除了户型采光，重点检查：手机信号、墙壁隔音（敲一敲、留意隣户生活声）、水压、霉味与结露痕迹、垃圾置场的状态、夜间周边环境。木造和轻量铁骨的隔音明显弱于 RC（钢筋混凝土），对声音敏感的人选 RC 会舒服很多。",
        "流程上：看中后提交入居申込书 → 保证会社与房东审查（通常 3–7 天，会核对在留资格、收入或学校在籍）→ 审查通过后签订赁贷借契约。审查阶段如实填写即可，收入不稳定的学生通常以经费支付人或学校名义补强。",
        "签约时中介有义务做「重要事項説明」。要盯紧的条款：解约预告期（多为 1 个月前通知）、短期解约违约金（如 1 年内退房付 1 个月房租）、更新料（很多地区每两年 1 个月房租）、退房时的原状回复范围、禁止事项（宠物、乐器、转租等）。",
        "国土交通省的「原状回復ガイドライン」明确了自然损耗不应由租客承担——退房结算如遇明显不合理的扣款，可以引用该指引协商。合同和重要事项说明书务必保留好。",
     )},
    {"slug": "bank-account-opening-guide", "title": "在日本开银行账户：选择、材料与常见被拒原因",
     "category": "life_japan", "sub": "banking", "featured": False,
     "author": "Machi 日本生活编辑部", "tags": ["银行", "开户", "ゆうちょ"],
     "summary": "ゆうちょ、都市银行、网银怎么选，需要什么材料，为什么会被拒。",
     "body": _guide_paras(
        "刚到日本最容易开的是ゆうちょ银行（邮储）：对在留时间要求宽松、网点遍布全国，适合作为第一个账户。三菱UFJ、三井住友、みずほ等都市银行功能全，但部分网点对在留未满 6 个月的新人审查较严。乐天银行、住信SBI 等网银无网点、手续费友好，适合作为第二账户。",
        "开户基本材料：在留卡（地址须与申请一致）、护照、印章（部分银行接受签名）、电话号码；有些银行会要求学生证/在职证明或 My Number。注意：先办好手机号再去开户会顺利很多。",
        "常见被拒原因：在留期过短（剩余在留期间不足）、住址未更新、无法说明开户用途、短期签证（旅游签不能开户）。被一家拒绝可以换一家银行或网点再试。",
        "开户后注意：账户长期不用可能被冻结；回国前要么注销账户、要么确认银行允许非居住者保留。绝对不要出售或出借账户——在日本这是犯罪行为，会直接影响在留。",
     )},
    {"slug": "mobile-sim-and-internet", "title": "手机卡与家庭网络怎么选：大手、格安与光回线",
     "category": "life_japan", "sub": "mobile_internet", "featured": False,
     "author": "Machi 日本生活编辑部", "tags": ["手机", "SIM", "网络"],
     "summary": "三大运营商、线上品牌与格安 SIM 的取舍，办理材料和家庭光纤的基本概念。",
     "body": _guide_paras(
        "日本手机资费大致三档：大手三社（docomo/au/SoftBank）信号与服务最全但月费高；它们的线上品牌（ahamo/povo/LINEMO）性价比高、流程全线上；格安 SIM（楽天モバイル、IIJmio、mineo 等）最便宜，高峰时段网速可能略降。新来者从线上品牌或格安 SIM 起步是常见选择。",
        "办理通常需要：在留卡、本人名义的日本银行账户或信用卡、有时需要 My Number。部分格安 SIM 支持便利店取卡和 eSIM 即时开通。注意确认在留剩余期间，部分运营商要求在留期 90 天以上。",
        "家庭网络主流是光回线（光纤），代表有フレッツ光系（docomo光/SoftBank光等）和独立的 NURO 光、auひかり。签约常含工事费分期与 2 年绑定，搬家或解约时注意违约金与设备返还。租房前也可以确认房源是否「インターネット無料」。",
        "短期或不想施工的替代方案是 Home Router（插电即用）或 Pocket WiFi。选择时把「实际月费=基本费+设备费-优惠」算清楚再比较。",
     )},
    {"slug": "seeing-a-doctor-in-japan", "title": "在日本看病：流程、费用与语言支持",
     "category": "life_japan", "sub": "medical", "featured": False,
     "author": "Machi 日本生活编辑部", "tags": ["医疗", "保险", "就医"],
     "summary": "小病去诊所、大病去医院的分诊逻辑，国保 3 割负担，以及找会外语的医生。",
     "body": _guide_paras(
        "日本就医的基本逻辑是「先诊所后医院」：感冒发烧、皮肤、牙科等先去街边的クリニック（诊所）；需要进一步检查或手术时，由诊所开「紹介状」转去大医院。没有介绍信直接去大医院，常要加收数千日元的初诊费用。",
        "持国民健康保险或社会保险就医，窗口自付 30%（3 割负担）。看病记得带保险证（或资格确认书/My Number 卡）与现金，部分小诊所不收信用卡。药一般凭处方到隔壁的调剂药局取。",
        "语言不通时：各都道府县多有多语言医疗信息网站可按语言搜索医院；东京都的「ひまわり」、AMDA 国际医疗信息中心等提供电话咨询。手机翻译应付一般问诊也基本够用，关键术语可提前查好。",
        "夜间急病拨 #7119（救急相談，部分地区）咨询是否需要急诊；危及生命直接拨 119 叫救护车（免费）。高额医疗费有「高額療養費制度」兜底，超过自付上限的部分可申请返还。",
     )},
    {"slug": "garbage-sorting-and-rules", "title": "垃圾分类与日常生活规则速成",
     "category": "life_japan", "sub": "daily_life", "featured": False,
     "author": "Machi 日本生活编辑部", "tags": ["垃圾分类", "生活规则"],
     "summary": "可燃/不燃/资源/粗大垃圾的基本分法，扔错的后果，以及邻里相处的几条潜规则。",
     "body": _guide_paras(
        "日本的垃圾按自治体规则分类，常见四类：可燃（厨余、纸屑）、不燃（金属、玻璃、小家电）、资源（瓶罐、PET 瓶、纸类——通常要洗净）、粗大垃圾（边长超过约 30cm 的家具家电，需提前申请并购买处理券）。每类有固定的收集星期，错过只能等下周。",
        "搬进新家第一件事就是拿一份所在区的垃圾日历（区役所或官网都有，多数有中英文版）。垃圾要在收集日早上规定时间前放到指定置场，用指定或透明垃圾袋；放错日子或乱扔可能被贴警告，严重的会被邻居投诉到管理公司。",
        "电视、冰箱、洗衣机、空调四类家电不走粗大垃圾，按家电リサイクル法需付回收费，可让电器店回收或预约收集。电池、灯管、喷雾罐多有单独回收方式，喷雾罐务必用尽再扔。",
        "邻里相处的潜规则：晚上十点后控制音量（木造房尤其）、阳台不要堆垃圾、楼道不放私物、收快递不在的话尽快处理不在票。这些小事做好，邻里关系基本不会出问题。",
     )},
    {"slug": "disaster-preparedness-basics", "title": "地震台风防灾速成：警报、避难与常备物资",
     "category": "life_japan", "sub": "safety", "featured": False,
     "author": "Machi 日本生活编辑部", "tags": ["防灾", "地震", "台风"],
     "summary": "紧急地震速报响起怎么办、避难所怎么找、家里该备什么、110/119 怎么打。",
     "body": _guide_paras(
        "手机会自动接收「緊急地震速報」：刺耳警报响起时离震动到达常只有数秒，立即护住头部、远离柜子和玻璃、不要急着跑出门。摇晃停止后再关火、开门确保逃生通道。日本建筑抗震标准高，室内被砸伤的风险往往大于建筑倒塌。",
        "提前在自治体官网或「防災マップ」确认住处对应的避難所（多为附近小学/中学）和避难路线。大地震后若住所安全，原地避难（在宅避難）也是正式选项之一。台风则关注气象厅的警报级别，按「警戒レベル4」以上的指示行动，提前收好阳台物品、备足水粮。",
        "家庭常备清单：饮用水（每人每天 3L×3 天起）、即食食品、手电与电池、移动电源、常用药、现金零钱、简易厕所；护照和在留卡的复印件放在防灾包里。手机装好 NHK World、Safety tips 或自治体防灾 App。",
        "紧急电话：110 报警、119 火灾/救护、171 灾害留言电话。多数都道府县另有多语言灾害咨询热线。记住：地震后不乘电梯、海边大摇晃后立即往高处撤离。",
     )},
    {"slug": "drivers-license-conversion", "title": "外国驾照换日本驾照（外免切替）流程",
     "category": "life_japan", "sub": "driving", "featured": False,
     "author": "Machi 日本生活编辑部", "tags": ["驾照", "外免切替"],
     "summary": "谁可以换、需要什么材料、知识与技能确认考什么、各地预约现状。",
     "body": _guide_paras(
        "持有效外国驾照、且能证明取得驾照后在发照国累计停留 3 个月以上的人，可以在住地的运转免许中心申请「外免切替」。中国大陆驾照属于需要参加知识确认+技能确认的类别；部分国家/地区（如台湾、韩国、多数欧洲国家）可免试换发。",
        "基本材料：外国驾照原件（及取得日期证明）、驾照的官方译文（JAF 或大使馆出具）、护照（含出入境记录）、在留卡、住民票、证件照。各地细节略有差异，出发前看清当地免许中心的最新要求。",
        "知识确认是 10 题左右的交规判断题（多语言可选），相对简单；技能确认在场内进行，考察起步、转弯、坡道、S 弯/曲线、确认安全等基本操作——按日本的「确认动作」标准来做是通过关键，很多人挂在左右确认和压线细节上。",
        "大城市的预约可能要排几周到几个月，建议尽早预约；技能确认不限次数但每次都要重新预约缴费。换照后初次拿到的是绿色新手期驾照，租车自驾与保险规则与普通驾照相同。",
     )},
    # ---- 在日工作（扩充批）----
    {"slug": "work-visa-gijinkoku-basics", "title": "工作签证基础：技术·人文知识·国际业务到底看什么",
     "category": "career_japan", "sub": "visa", "featured": True,
     "author": "Machi 职场编辑部", "tags": ["工作签证", "技人国", "在留资格"],
     "summary": "最常见工作在留资格的适用范围、学历职务一致性、变更流程与常见拒签原因。",
     "body": _guide_paras(
        "「技術・人文知識・国際業務」（俗称技人国）是留学生就职后最常见的在留资格，覆盖工程师、设计、企划、营业、翻译等白领岗位。审查核心是「学历/专业与职务内容的关联性」与「工作的专业性」——单纯体力或店面接客类工作原则上不在范围内。",
        "学历要件通常为大学本科以上或日本的专门学校毕业（专门士）。专门学校毕业生的职务关联性审查更严格，岗位要与所学专业明显对口。薪资需达到与日本人同等水平。",
        "从留学变更到技人国：拿到内定后由本人向入管提交在留资格变更许可申请，材料包括公司方的雇佣合同、登记事项证明、决算文书、业务说明，以及本人的毕业（见込）证明、成绩单等。每年 12 月到次年 3 月是申请高峰，毕业前尽早提交。",
        "常见不许可原因：职务与专业无关、公司规模/财务难以说明雇佣必要性、申请材料前后矛盾、出勤率过低的留学经历。被不许可后可以听取理由并补强再申请。转职时若职务类型变化大，建议申请「就労資格証明書」确认新工作符合在留资格。",
     )},
    {"slug": "tenshoku-process-timeline", "title": "日本转职完整流程：从准备到入职的时间线",
     "category": "career_japan", "sub": "job_change", "featured": False,
     "author": "Machi 职场编辑部", "tags": ["转职", "职务经历书", "面试"],
     "summary": "职务经历书怎么写、转职渠道怎么选、面试到内定的节奏、现职怎么体面退出。",
     "body": _guide_paras(
        "日本转职的标准节奏是 2–3 个月：准备材料（1–2 周）→ 投递与面试（1–2 个月，通常 2–3 轮）→ 内定与条件确认（1–2 周）→ 向现职提出退职并交接（法定提前 2 周，惯例 1 个月以上）。在职转职是主流，不必裸辞。",
        "材料上日本特色是「職務経歴書」：A4 一到两页，按时间或项目写清楚你做过什么、用了什么技术/技能、产生了什么可量化的成果。和履历书不同，职务经历书是自由格式，是拉开差距的关键文档。",
        "渠道组合：转职网站（自助投递）、转职 Agent（顾问推荐+条件交涉，对外国人友好的中介也不少）、Scout 型平台（被动接 offer）、以及内推。工程师等职种用 Scout 平台的命中率高；Agent 能帮你处理面试日程与年收交涉，新手建议至少注册一家。",
        "面试常被问转职理由——避免单纯抱怨现职，转成「想做的事在贵司能实现」的正向逻辑。拿到内定后确认劳动条件通知书（年收构成、试用期、加班制度），再向现职提交退职意向；交接干净、按规定办理离职手续，行业圈子比想象的小。",
     )},
    {"slug": "shukatsu-timeline-for-students", "title": "留学生新卒就活时间线与 ES/SPI/面接备战",
     "category": "career_japan", "sub": "new_grad", "featured": False,
     "author": "Machi 职场编辑部", "tags": ["就活", "新卒", "ES", "SPI"],
     "summary": "大三开始的标准就活节奏、Entry Sheet 与适性检查、留学生的优势打法。",
     "body": _guide_paras(
        "日本新卒就活启动极早：大三（修士一年级）夏天参加 Summer Intern，秋冬继续企业研究与 OB/OG 访谈，大三 3 月「広報解禁」开始正式 Entry 与说明会，大四 6 月起面试集中、夏秋陆续内定，次年 4 月统一入职。外资和部分 IT 企业不按此表，更早且全年招聘。",
        "笔试关通常是 SPI 或玉手箱等适性检查，考语言（日语词汇阅读）与非语言（数学逻辑），留学生要给非语言部分留足练习时间，市面题集刷两遍是基本盘。Entry Sheet（ES）的核心三问：自我 PR、学生时代最努力的事（ガクチカ）、志望动机——用具体经历支撑，不写空话。",
        "面试从集体到个人通常 2–4 轮，考察逻辑表达与「为什么是这家公司」。留学生的差异化优势：语言能力、跨文化经历、回国市场的理解——把它们落到具体业务场景里讲，而不是停留在『我会中文』。",
        "渠道上除了 Rikunabi/Mynavi 两大平台，留学生专场招聘会、大学的キャリアセンター、面向外国人的就职支援机构都值得用。内定后记得在毕业前完成在留资格变更，时间线参考工作签证篇。",
     )},
    {"slug": "leaving-a-job-checklist", "title": "退职手续清单：保险、年金、税金一个都不能漏",
     "category": "career_japan", "sub": "job_change", "featured": False,
     "author": "Machi 职场编辑部", "tags": ["退职", "失业保险", "国保"],
     "summary": "离职后 14 天内要办什么、失业给付怎么领、空窗期保险年金怎么接续。",
     "body": _guide_paras(
        "离职时从公司拿齐四样东西：雇用保険被保険者証、離職票（约 10 天后寄到）、源泉徴収票、年金手帳（若由公司保管）。这些是后续所有手续的钥匙。",
        "如果离职后不马上入职新公司：14 天内到市区役所把健康保险切换为国民健康保险（或申请原公司保险的任意继续，二选一比较保费），同时把厚生年金切换为国民年金。空窗期间这两项都不能断。",
        "有失业给付资格的人（一般为离职前两年内缴满 12 个月雇用保险），带離職票到住地的 Hello Work 办理求职登记。自都合离职有约 2 个月的给付限制期，会社都合则当月即可开始领取；领取期间按要求完成求职活动认定即可。",
        "税金方面：年内再就职的话把源泉徴収票交给新公司做年末调整；年内未再就职则次年自行确定申告退税。住民税是按上一年收入后置征收的，离职后会收到普通征收的缴付书——这笔钱要提前留出来。",
     )},
    # ---- JLPT / 留学（扩充批）----
    {"slug": "jlpt-n2-to-n1-strategy", "title": "从 N2 到 N1：半年备考策略与资料选择",
     "category": "jlpt", "sub": "n1", "featured": False,
     "author": "Machi JLPT 编辑部", "tags": ["JLPT", "N1", "备考"],
     "summary": "N1 和 N2 的真正差距在哪、各科怎么分配时间、冲刺期怎么刷题。",
     "body": _guide_paras(
        "N1 与 N2 的差距主要不在语法条目，而在词汇量级、阅读速度与听力的信息密度。N2 飘过的人直接裸考 N1 大概率倒在时间不够：阅读题量大、文章更抽象，听力语速接近正常会话且不再「友好」。",
        "半年备考的节奏参考：前两个月过完 N1 语法并开始每天 30–50 个新词；中间两个月主攻阅读训练（限时做题，精读错题）+ 每天 30 分钟以上听力（新闻、Podcast、剧集混合）；最后两个月全真模考，按考试时间整卷练，重点解决时间分配。",
        "资料选择上，语法和词汇各选一本主流教材吃透即可，不要囤书；真题和模拟题的价值远大于第三本语法书。听力推荐把 NHK 新闻当背景常听，再配合真题精听——先盲听、再对照原文找听不出来的音变与表达。",
        "考试技巧：词汇语法部分快速通过给阅读留时间；阅读先看题再回文定位；听力一旦走神立即放弃该题、跟上下一题。N1 合格线并不高（100/180，单科 19+），策略得当比盲目堆时间有效。",
     )},
    {"slug": "scholarships-overview-japan", "title": "日本奖学金体系一览：从 JASSO 到民间财团",
     "category": "study_abroad_japan", "sub": "scholarship", "featured": False,
     "author": "Machi 升学编辑部", "tags": ["奖学金", "JASSO", "文部科学省"],
     "summary": "国费、JASSO、地方与民间财团奖学金的层级、申请路径和现实期望值。",
     "body": _guide_paras(
        "日本面向留学生的奖学金大致四层：文部科学省（MEXT）国费奖学金——金额最高（学费全免+每月生活费），通过使馆推荐或大学推荐申请，竞争最激烈；JASSO 学习奖励费——每月数万日元，名额较多，通常入学后经学校申请；地方自治体奖学金；以及数量庞大的民间财团奖学金。",
        "民间财团（如 Rotary、似鸟、平和中岛、本庄等）单项金额每月 3–20 万日元不等，多数要求通过在籍学校推荐，少数接受直接申请。信息分散是最大门槛：JASSO 官网的奖学金检索、学校国际课的公告板、教务邮件，都要养成定期查看的习惯。",
        "申请材料的通用配置：成绩单（GPA 很重要）、研究/学习计划、指导教员推荐信、收入状况说明。多数财团奖学金不允许与其他高额奖学金重复领取，申请前看清并给学校如实申报。",
        "现实期望值：语言学校阶段奖学金很少，学部/大学院阶段机会显著增多；把奖学金当作努力后的补贴而非预算的一部分。学费减免（授業料免除）是另一条独立线路，国公立大学按家庭经济状况审查，记得每学期都要申请。",
     )},
]

GUIDE_ARTICLE_SEED.extend([
    {"slug": "university-vs-vocational-school-choice", "title": "大学、大学院、专门学校怎么选：适合人群与风险点",
     "category": "study_japan", "sub": "school_choice", "featured": False,
     "author": "Machi 升学编辑部", "tags": ["学校选择", "大学", "专门学校"],
     "summary": "从升学目标、就业路径、签证关联和费用周期，比较三类学校的真实差异。",
     "body": _guide_paras(
        "日本升学不是只看学校名气，而是看你的下一步目标。想做研究、未来读博或进入需要高度专业背景的岗位，大学院更匹配；想系统拿学历、参与新卒就活，学部路线更稳；想快速学习职业技能并进入特定行业，专门学校可能更直接。",
        "大学院的关键在研究室匹配和研究计划书，适合已经有本科专业基础、能讲清研究问题的人。优点是学术含金量高、国公立学费相对稳定；风险是准备周期长，教授联系和考试难度不可低估。",
        "专门学校更贴近就业技能，如 IT、设计、动画、酒店、介护、商务等。优点是课程职业导向强、部分学校有就职支援；风险是毕业后的工作签证审查会看专业和岗位关联性，学校质量差异也很大。选校时一定要看毕业生去向、就业率统计口径、留学生比例和退学率。",
        "学部路线适合希望重新建立学历基础的人，但时间和费用成本最高。最终选择建议用四个问题判断：毕业后要在日本就业还是回国？目标岗位是否要求大学学历？日语和英语成绩能支撑哪个层级？家庭预算能承受几年？把答案写下来，再反推学校类型会清楚很多。",
     )},
    {"slug": "labor-conditions-checklist-japan", "title": "内定前必须确认的劳动条件通知书清单",
     "category": "career_japan", "sub": "job_offer", "featured": False,
     "author": "Machi 职场编辑部", "tags": ["内定", "劳动条件", "黑心企业"],
     "summary": "年收、固定残业、试用期、转勤、签证材料——签约前逐项确认，避免入职后踩坑。",
     "body": _guide_paras(
        "拿到内定后，不要只看「年收」两个字。正式入职前应要求公司提供劳动条件通知书或雇佣合同，确认工资、工作地点、工作时间、休假、试用期、社会保险、退职规则等核心条款。日本法律要求雇主明示主要劳动条件。",
        "工资部分重点看：基本给、各类手当、奖金是否保证、交通费上限、加班费计算方式。尤其要看是否有「固定残業代」：它包含多少小时、金额多少、超过部分是否另付。固定残业不是违法，但写不清或超时不付就是高风险信号。",
        "工作时间要确认所定劳动时间、休息时间、休日、弹性工作制或裁量劳动制是否适用。试用期要看长度、待遇是否变化、解雇条件。工作地点要确认是否有转勤、出向或远程办公规则，外籍员工还要确认公司是否愿意配合在留资格变更材料。",
        "如果对条款不理解，可以先问 HR，并把回复留在邮件里。遇到要求缴纳保证金、培训费、押金，或拒绝提供书面条件的公司，要高度警惕。内定很珍贵，但签下模糊条件后的代价更高。",
     )},
    {"slug": "foreign-student-it-career-japan", "title": "留学生想进日本 IT 公司：路线、作品集与日语要求",
     "category": "career_japan", "sub": "it_career", "featured": False,
     "author": "Machi 就职编辑部", "tags": ["IT", "工程师", "留学生就职"],
     "summary": "文科转码、专门学校/大学院路线、作品集、面试和英文岗位的现实判断。",
     "body": _guide_paras(
        "日本 IT 就职对外国人相对开放，但不是「会写代码就行」。公司通常会综合看学历/专业、项目经历、日语沟通、团队协作和签证可行性。留学生常见路线有：大学/大学院信息专业、新卒工程师就活、专门学校 IT 方向、以及自学转职。",
        "作品集比证书更有说服力。建议准备 2–3 个能在线访问或有完整 README 的项目：说明解决什么问题、你负责什么、技术栈、架构选择、测试和部署方式。GitHub 不需要堆很多半成品，少而完整更有价值。",
        "日语要求因公司差异很大。传统 SIer、大企业综合职通常要求 N2 以上甚至商务日语；产品型创业公司、外资或英文工作环境可能更看重英文和技术，但岗位数量有限。现实策略是：技术面用项目证明能力，日语至少练到能解释经历、听懂任务和参与团队沟通。",
        "签证层面，岗位内容需要与学历或专业经历具有合理关联。文科转工程师并非不可能，但要用课程、项目、实习或工作经历补足专业性证明。投递时同时覆盖日企、外资、英文岗位和面向外国人的招聘渠道，命中率会高很多。",
     )},
        {"slug": "rental-contract-before-signing", "title": "日本租房签约前 20 个确认点",
         "category": "life_japan", "sub": "renting", "featured": False,
         "author": "Machi 日本生活编辑部", "tags": ["租房", "契约", "初期费用"],
         "summary": "从初期费用、退去清扫、保证公司到网络和垃圾规则，签约前一次问清。",
         "body": _guide_paras(
            "日本租房签约前，一定要把费用和规则问清楚。费用清单至少包括：敷金、礼金、中介费、保证公司费、火灾保险、换锁费、清扫费、24 小时支援费、首月房租和日割家租。不要只看月租低，初期费用可能差很多。",
            "契约条款重点看：普通借家还是定期借家、契约年限、更新料、提前解约通知期、违约金、禁止事项。定期借家不一定能续约，适合短期但风险更高。养宠、乐器、同居、民泊、转租通常都有明确限制，违反可能被解约。",
            "退去相关要提前确认：清扫费是固定扣除还是按实际，壁纸、地板、烟味、霉斑怎么计算。入住当天拍照保存房间现状，尤其是划痕、污渍、设备故障，发给管理公司留痕。",
            "生活便利也要问：网络是否免费、是否需要自己签光回线、垃圾置场和分类规则、最近超市/车站、快递箱、有无自行车停车位。签约前多问十分钟，能减少后面几个月的麻烦。",
         )},
        {"slug": "application-documents-checklist-grad", "title": "大学院出愿材料清单：成绩单、毕业证明、推荐信怎么准备",
         "category": "study_japan", "sub": "application_documents", "featured": False,
         "author": "Machi 升学编辑部", "tags": ["出愿材料", "大学院", "证明书"],
         "summary": "把大学院申请常见材料拆成学校证明、研究材料、语言成绩和邮寄检查四组。",
         "body": _guide_paras(
            "大学院出愿材料可以分成四组：学校证明类、研究材料类、语言成绩类和身份经费类。学校证明通常包括毕业/预毕业证明、成绩单、学位证明和推荐信；研究材料通常包括研究计划书、志望理由书、作品集或论文摘要。",
            "准备时不要只看中文清单，要逐字确认募集要项里的原文要求：是否需要原件、是否接受英文、是否要学校密封、是否需要日本语译文。海外大学开证明常有周期，建议提前 2–3 个月预约。",
            "邮寄前用一张表核对：文件名、语言、份数、是否盖章、是否密封、截止日、邮寄方式和追踪号。很多失误不是不会写材料，而是漏交、格式不符或错过必着日期。",
         )},
        {"slug": "graduate-school-interview-prep", "title": "大学院面试怎么准备：教授真正想确认什么",
         "category": "study_japan", "sub": "admission_interview", "featured": False,
         "author": "Machi 升学编辑部", "tags": ["大学院", "面试", "研究计划"],
         "summary": "围绕研究计划、先行研究、方法可行性和入学后计划准备回答。",
         "body": _guide_paras(
            "大学院面试不是闲聊，教授主要确认四件事：你是否理解自己的研究主题、是否读过相关先行研究、方法是否可行、入学后能否在研究室持续推进。自我介绍可以短，研究说明必须清楚。",
            "建议准备 5 分钟版本和 1 分钟版本的研究说明。5 分钟版本讲背景、问题意识、方法和预期成果；1 分钟版本用于教授打断或时间很短的情况。每个关键词都要能解释，不要堆自己说不清的术语。",
            "常见问题包括：为什么选这个研究室、为什么不是国内继续读、毕业后计划、日语/英语能力、经费来源。回答要具体，最好结合教授论文、课程、研究室项目，而不是只说学校有名。",
         )},
        {"slug": "vocational-school-application-japan", "title": "日本专门学校申请：适合人群、材料和就业风险",
         "category": "study_japan", "sub": "vocational_school", "featured": False,
         "author": "Machi 升学编辑部", "tags": ["专门学校", "就职", "留学生"],
         "summary": "专门学校更职业导向，但必须确认专业、就业去向和签证关联。",
         "body": _guide_paras(
            "专门学校适合希望快速学习职业技能并在日本就业的人，常见方向包括 IT、设计、动画、酒店、介护、商务和语言翻译。申请门槛通常低于大学院，但学校质量差异很大。",
            "选校时重点看三项数据：留学生毕业率、就业率统计口径、毕业生进入的行业和岗位。只写“就业率 95%”不够，要看是否包含非正社员、回国就业、非专业相关岗位。",
            "签证风险也要提前想清楚。毕业后的工作内容需要和所学专业有关联，不能只看能不能入学。申请前把目标岗位、课程内容和未来签证类型连起来判断，会比单纯看学费更可靠。",
         )},
        {"slug": "scholarship-and-tuition-waiver-grad", "title": "大学院奖学金和学费减免：什么时候申请、看什么条件",
         "category": "study_japan", "sub": "scholarship", "featured": False,
         "author": "Machi 升学编辑部", "tags": ["奖学金", "学费减免", "大学院"],
         "summary": "把国费、JASSO、民间财团和大学学费减免分开规划。",
         "body": _guide_paras(
            "大学院阶段的经济支持一般分为四类：国费奖学金、JASSO、民间财团奖学金和大学内部学费减免。不同项目申请时间不同，有些在入学前，有些入学后通过学校推荐。",
            "不要把奖学金当成固定预算。更稳妥的做法是先准备能覆盖第一年主要费用的资金，再把奖学金作为减压项。申请材料通常会看成绩、研究计划、推荐信、家庭收入和面试表现。",
            "学费减免和奖学金是两条线。国公立大学常有授业料免除或半免制度，但通常每学期都要重新申请。错过学校通知就可能失去机会，入学后要养成查看教务和国际课邮件的习惯。",
         )},
        {"slug": "student-visa-documents-parent-sponsor", "title": "留学签证经费支付人材料怎么准备",
         "category": "study_abroad_japan", "sub": "student_visa", "featured": False,
         "author": "Machi 留学编辑部", "tags": ["留学签证", "经费支付人", "COE"],
         "summary": "说明经费支付书、存款证明、收入证明和亲属关系材料的准备逻辑。",
         "body": _guide_paras(
            "留学签证材料里，经费支付人的核心作用是证明你在日本学习期间有稳定资金来源。常见材料包括经费支付书、存款证明、在职/收入证明、纳税证明、亲属关系证明和理由说明。",
            "存款金额没有一个全国统一的魔法数字，学校和入管会综合看学费、住宿费、生活费、学习期限和家庭收入稳定性。金额够但收入来源说不清，仍然可能被追问。",
            "材料要保持一致：支付人姓名、地址、公司信息、年收入、存款金额、亲属关系不要前后矛盾。翻译件建议保留格式和印章说明，提交前让学校或行政书士逐项核对。",
         )},
        {"slug": "language-school-selection-criteria", "title": "语言学校怎么选：不要只看学费和位置",
         "category": "study_abroad_japan", "sub": "school_selection", "featured": False,
         "author": "Machi 留学编辑部", "tags": ["语言学校", "选校", "升学"],
         "summary": "从升学辅导、出席管理、签证通过率和学生构成判断语言学校质量。",
         "body": _guide_paras(
            "语言学校不是越便宜越好，也不是离市中心越近越好。真正影响体验的是课程强度、升学辅导、班级分层、出席管理、老师稳定性、学生国籍构成和学校对签证材料的熟悉程度。",
            "如果目标是升学，要看学校是否有大学院/专门学校指导、是否提供研究计划书或面试辅导、往年合格实绩是否具体。只展示几张名校 logo，但没有人数和年份，参考价值有限。",
            "如果目标是先适应日本生活，要确认住宿支援、打工规则说明、役所手续协助和紧急联系机制。语言学校是过渡期，选校的本质是选一个能把你带到下一步的环境。",
         )},
        {"slug": "arrival-prep-before-flight", "title": "赴日前 30 天准备清单：文件、住宿、现金和手机",
         "category": "study_abroad_japan", "sub": "arrival_preparation", "featured": False,
         "author": "Machi 留学编辑部", "tags": ["入境准备", "清单", "留学"],
         "summary": "把出发前一个月该确认的证件、住宿、交通、现金和通讯事项列清楚。",
         "body": _guide_paras(
            "赴日前 30 天先确认所有文件：护照、签证、COE 复印件、入学许可、住宿地址、学校联系方式、疫苗或保险材料、证件照片。重要文件建议纸质和云端各备一份。",
            "住宿和交通要提前确认到达当天路线，尤其是晚班机。准备日元现金用于交通、餐饮、初期生活和无法刷卡的小额场景。手机方面，可以先准备短期流量卡，落地后再办理长期 SIM。",
            "行李不需要把生活用品全部带齐，日本便利店和百元店能解决很多小物。更重要的是带好印章或签名习惯、常用药、转换插头、适合面试/开学式的衣服，以及能让你第一周不慌的清单。",
         )},
        {"slug": "study-cost-budget-template", "title": "日本留学预算表怎么做：一次性费用和每月费用分开算",
         "category": "study_abroad_japan", "sub": "study_cost", "featured": False,
         "author": "Machi 留学编辑部", "tags": ["留学费用", "预算", "生活费"],
         "summary": "用一次性费用、月度固定支出和弹性支出三层做预算。",
         "body": _guide_paras(
            "日本留学预算不能只算学费。建议分成三层：一次性费用、月度固定支出、弹性支出。一次性费用包括入学金、第一期学费、机票、住宿初期费、家具家电、保险和签证材料。",
            "月度固定支出包括房租、水电网、手机、交通、国民健康保险、餐费和教材。东京圈生活费明显高于地方城市，但地方也可能交通成本更高、打工机会更少。",
            "预算表里最好加 10%–20% 机动金。刚到日本的前两个月通常花费最高，打工也不一定马上找到。把现金流留足，比之后被迫借钱或影响出席率要安全得多。",
         )},
        {"slug": "jlpt-n3-to-n2-roadmap", "title": "从 N3 到 N2：三个月备考路线",
         "category": "jlpt", "sub": "jlpt_n2", "featured": False,
         "author": "Machi 日语编辑部", "tags": ["JLPT", "N2", "学习计划"],
         "summary": "把词汇、语法、阅读和听力拆到 12 周，避免只刷题不复盘。",
         "body": _guide_paras(
            "N3 到 N2 的差距主要在词汇抽象度、语法细节、长文阅读速度和听力信息量。三个月备考建议按 12 周拆：前 6 周补知识点，中间 4 周做综合训练，最后 2 周模拟和错题回收。",
            "每天结构可以固定为：词汇 30 分钟、语法 30 分钟、阅读 40 分钟、听力 20 分钟。真正有效的是错题复盘，记录错因：单词不认识、句子结构没看懂、选项陷阱、时间不够。",
            "临近考试不要无限刷新题。把近两个月错过的语法和阅读文章重新做一遍，确认自己能讲清为什么选这个答案。能解释错因，才算真的补上。",
         )},
        {"slug": "jlpt-vocabulary-system", "title": "JLPT 词汇怎么背：词根、场景和复习周期",
         "category": "jlpt", "sub": "vocabulary", "featured": False,
         "author": "Machi 日语编辑部", "tags": ["词汇", "JLPT", "记忆"],
         "summary": "不要孤立背单词，按汉字、搭配、场景和间隔复习建立词汇网。",
         "body": _guide_paras(
            "JLPT 词汇最怕只背中文意思。建议按汉字、词性、搭配和场景建立关联。例如「認める」不只是“承认”，还要记住常见搭配和语气，知道它和「許す」「受け入れる」的差别。",
            "复习周期比一次背多少更重要。当天新词晚上回看，第二天复习，一周后复习，一个月后再复习。每次复习不要只看，要遮住释义主动回忆，并造一个短句。",
            "备考后期把词汇放回阅读和听力里。你真正需要的是看到词能快速判断句意，听到词能跟上上下文，而不是在单词 App 里认识它。",
         )},
        {"slug": "jlpt-listening-training", "title": "JLPT 听力训练：从听不懂到抓重点",
         "category": "jlpt", "sub": "listening", "featured": False,
         "author": "Machi 日语编辑部", "tags": ["听力", "JLPT", "备考"],
         "summary": "用题型、关键词、影子跟读和复听笔记提升听力稳定性。",
         "body": _guide_paras(
            "JLPT 听力不是每个词都听懂才做题，而是抓任务、人物关系、转折和最终决定。做题前先看选项，预测会出现的关键词；听的时候重点标记「でも」「それで」「結局」「やっぱり」这类转折和结论信号。",
            "训练分三步：第一遍按考试节奏做题，第二遍看原文确认没听出的句子，第三遍影子跟读 3–5 遍。跟读的目标不是发音像主播，而是让耳朵习惯日语语速和省略。",
            "错题要记录类型：词没听出来、语法没反应过来、选项理解错、注意力断掉。不同错因对应不同训练，不要把所有问题都归结为“听力差”。",
         )},
        {"slug": "jlpt-mock-test-review-method", "title": "JLPT 模拟题复盘方法：分数之外要看什么",
         "category": "jlpt", "sub": "mock_test", "featured": False,
         "author": "Machi 日语编辑部", "tags": ["模拟题", "JLPT", "复盘"],
         "summary": "模拟题的价值在于定位薄弱题型、时间分配和错题规律。",
         "body": _guide_paras(
            "做模拟题不能只看总分。每次模拟后至少记录四项：各部分正确率、用时、错题类型、是否有没做完。特别是阅读，很多人不是不会，而是时间分配失控。",
            "复盘时把错题分成知识型、理解型、粗心型和时间型。知识型要回到词汇语法表；理解型要重读原文；粗心型要训练标记；时间型要调整做题顺序。",
            "最后两周建议固定考试时间做完整模拟，让身体适应集中时段。模拟后第二天再回看错题，比当场情绪化改答案更有效。",
         )},
        {"slug": "how-to-use-machi-materials", "title": "Machi 资料包怎么用：先诊断、再补短板",
         "category": "guide_services", "sub": "service_materials", "featured": True,
         "author": "Machi Guide 编辑部", "tags": ["资料包", "使用方法", "学习计划"],
         "summary": "资料包不是越多越好，关键是先知道自己缺什么，再用清单和模板补短板。",
         "body": _guide_paras(
            "资料包的正确用法不是一次下载一堆文件，而是先做诊断：你现在卡在信息不清、材料不会写、时间线混乱，还是面试表达不稳。不同问题需要不同资料。",
            "建议按三步使用：先读总览文章理解流程，再下载清单核对材料，最后使用模板完成自己的版本。模板只能提供结构，不能替代真实经历和目标学校/公司要求。",
            "如果你已经有半成品材料，可以把资料包当成复核工具：逐项看是否缺信息、是否表达太空、是否和募集要项或岗位要求匹配。这样比从零复制更安全。",
         )},
        {"slug": "service-template-editing-rules", "title": "模板资料使用规则：哪些可以套用，哪些必须重写",
         "category": "guide_services", "sub": "service_templates", "featured": False,
         "author": "Machi Guide 编辑部", "tags": ["模板", "写作", "材料"],
         "summary": "研究计划书、简历、志望理由书可以参考结构，但核心内容必须个性化。",
         "body": _guide_paras(
            "模板最适合解决结构问题，比如标题顺序、段落分配、敬语格式和检查清单。它不适合直接解决内容问题，因为教授、学校、公司真正看的仍然是你的背景、目标和匹配度。",
            "可以套用的是：邮件礼貌格式、材料清单、履历书基本版式、研究计划书大纲。必须重写的是：志望理由、研究问题、经历描述、职业目标和为什么选择对方。",
            "使用模板时建议保留一版原始模板和一版自己的改写稿。每次修改都回到官方要求检查，确保没有把模板里的示例学校、专业、日期或无关表达带进最终稿。",
         )},
        {"slug": "consultation-before-booking", "title": "预约咨询前要准备什么：让一次沟通真正有用",
         "category": "guide_services", "sub": "service_consultation", "featured": False,
         "author": "Machi Guide 编辑部", "tags": ["咨询", "预约", "准备"],
         "summary": "提前整理背景、目标、材料和具体问题，可以显著提高咨询效率。",
         "body": _guide_paras(
            "咨询前请先整理四类信息：你的当前背景、目标学校/公司或考试、已经准备的材料、最想解决的三个问题。越具体，咨询越能进入实质判断。",
            "不建议把咨询当作“对方替你决定人生”。咨询更适合帮助你确认路线、识别风险、拆时间线和优化材料。最终选择仍然要结合预算、语言能力、家庭计划和长期目标。",
            "如果是材料修改服务，请提前提交可编辑文件和目标要求。只发截图或口头描述，很难给出细致意见。咨询后建议把行动项写成清单，按截止日推进。",
         )},
        {"slug": "refund-and-delivery-rules-guide", "title": "资料和服务的交付、取消与退款规则怎么写清楚",
         "category": "guide_services", "sub": "service_consultation", "featured": False,
         "author": "Machi Guide 编辑部", "tags": ["退款规则", "服务说明", "交付"],
         "summary": "数字资料、人工咨询和材料修改要分别写清交付方式、时限和退款边界。",
         "body": _guide_paras(
            "数字资料和人工服务的规则不能混在一起。数字资料需要写清是否可下载、是否永久可看、是否包含后续更新；人工服务需要写清交付周期、沟通方式、修改次数和预约改期规则。",
            "退款边界要前置展示。例如资料已下载后通常不支持无理由退款；人工服务在开始前可按规则取消，开始后按已发生工作量处理。写得越清楚，后续争议越少。",
            "后台发布商品或服务时，建议把适合人群、不适合人群、包含内容、不包含内容、预约方式、取消规则都填完整。用户买之前理解越充分，体验越稳定。",
         )},
        {"slug": "research-plan-review-service-scope", "title": "研究计划书修改服务适合谁：范围和交付标准",
         "category": "guide_services", "sub": "service_consultation", "featured": False,
         "author": "Machi Guide 编辑部", "tags": ["研究计划书", "修改服务", "大学院"],
         "summary": "说明研究计划书修改能帮你优化结构和论证，但不会代写研究内容。",
         "body": _guide_paras(
            "研究计划书修改适合已经有主题、先行研究和初稿的人。服务重点通常是结构、逻辑、问题意识、方法可行性、日文表达和与目标研究室的匹配，而不是从零代写。",
            "提交前最好准备目标教授信息、募集要项、研究计划书初稿、简历和成绩背景。只有知道目标和限制，修改建议才不会变成泛泛而谈。",
            "合理期待是：让计划书更清楚、更像研究、更符合申请场景。它不能保证合格，也不能替代你对文献和研究主题的理解。",
         )},
        {"slug": "resume-review-service-scope", "title": "履历书修改服务适合谁：自己 PR、志望动机和职务经历",
         "category": "guide_services", "sub": "service_consultation", "featured": False,
         "author": "Machi Guide 编辑部", "tags": ["履历书", "就职", "修改服务"],
         "summary": "把日本就职材料修改的范围、输入材料和交付结果讲清楚。",
         "body": _guide_paras(
            "履历书和职务经歴书修改适合已经有目标行业或岗位、但不知道如何表达经历的人。修改重点是经历提炼、日文表达、岗位匹配、成果量化和版式规范。",
            "如果只说“帮我写好看一点”，效果通常有限。更好的提交方式是同时给出目标岗位 JD、已有履历、项目经历、打工/实习经历和希望突出的能力。",
            "修改服务不能替你虚构经历，也不能保证内定。它能帮助你把真实经历表达得更清楚，让面试官更容易看到你和岗位的关联。",
         )},
        {"slug": "free-checklist-vs-paid-pack", "title": "免费清单和付费资料包有什么区别",
         "category": "guide_services", "sub": "service_materials", "featured": False,
         "author": "Machi Guide 编辑部", "tags": ["免费清单", "付费资料", "会员"],
         "summary": "免费清单适合快速确认方向，付费资料更适合深入写作、模板和案例。",
         "body": _guide_paras(
            "免费清单适合解决“我该准备哪些东西”的问题，帮助你快速确认流程、材料和时间线。它通常不会包含大量示例、模板和个性化解释。",
            "付费资料包更适合已经决定路线、需要落地执行的人，例如研究计划书模板、履历书示例、申请材料打包清单、面试问题库和详细讲解。",
            "选择时看自己的阶段：刚开始先用免费清单建立地图；进入材料写作和临近截止日，再考虑更细的模板或人工服务。这样不会花冤枉钱，也不会只看免费内容卡住。",
         )},
        {"slug": "member-resource-library-guide", "title": "会员资料库怎么用：把资料、折扣和服务串起来",
         "category": "guide_services", "sub": "service_materials", "featured": False,
         "author": "Machi Guide 编辑部", "tags": ["会员资料", "资料库", "服务"],
         "summary": "会员资料库不是单个文件，而是围绕升学、就职、生活和日语的长期工具箱。",
         "body": _guide_paras(
            "会员资料库适合长期在日本升学、求职或生活的人。它的价值不只是一份 PDF，而是把清单、模板、更新说明、相关服务和优惠串在一起。",
            "建议按目标建立自己的资料夹：升学、就职、日语、生活手续。每个目标下先看总览，再拿对应清单和模板执行。不要把所有资料一次看完，信息量太大反而容易拖延。",
            "当后台新增资料或更新规则时，会员资料库可以作为统一入口。对用户来说，最重要的是知道“下一步该打开哪个文件”，而不是堆满看不完的资料。",
         )},
])

# 资料与服务种子：除一份免费清单外，均为 coming_soon（未接支付前不展示价格购买）。
GUIDE_PRODUCT_SEED: list[dict[str, Any]] = [
    {"slug": "n2-grammar-pack", "title": "N2 语法整理资料包", "subtitle": "适合 N2 备考和自学",
     "category": "jlpt", "sub": "jlpt_materials", "product_type": "pdf_material",
     "price": 29, "currency": "CNY", "price_label": "", "coming_soon": True, "is_service": 0,
     "target": "备考 N2 的同学", "delivery": "数字下载",
     "description": "Machi 编辑部原创整理的 N2 高频语法点，按意义分组、配自然例句与易混对比，便于系统复习。原创内容，非真题搬运。"},
    {"slug": "research-plan-template-pack", "title": "大学院研究计划书模板包", "subtitle": "模板、示例、教授邮件范文",
     "category": "study_japan", "sub": "research_plan", "product_type": "template",
     "price": 49, "currency": "CNY", "price_label": "", "coming_soon": True, "is_service": 0,
     "target": "准备申请大学院的同学", "delivery": "数字下载",
     "description": "研究计划书结构模板、文/理科示例框架，以及联系教授的日文/英文邮件范文，帮助你从 0 起步搭建框架。内容原创，仅供学习参考。"},
    {"slug": "rirekisho-review-service", "title": "日本就职履历书修改服务", "subtitle": "适合准备就职活动的用户",
     "category": "career_japan", "sub": "rirekisho", "product_type": "resume_review",
     "price": 0, "currency": "CNY", "price_label": "¥199 起", "coming_soon": True, "is_service": 1,
     "target": "正在就活的用户", "delivery": "人工服务·线上",
     "description": "由有日本就职经验的编辑/合作方，对你的履历书与职务经歴书逐项给出修改建议，覆盖志望动机、自己 PR 与排版规范。人工服务，按工作量计费。"},
    {"slug": "language-school-doc-checklist", "title": "语言学校申请材料清单", "subtitle": "赴日留学前的材料准备",
     "category": "study_abroad_japan", "sub": "language_school", "product_type": "checklist",
     "price": 0, "currency": "CNY", "price_label": "免费", "coming_soon": False, "is_service": 0, "is_free": 1,
     "target": "准备申请语言学校的同学", "delivery": "登录后查看",
     "description": "语言学校出愿常用材料的整理清单：本人材料、学历材料、经费支付人材料与时间节点提醒。登录后即可查看，帮助你不漏项。"},
    {"slug": "interview-100-questions", "title": "日本面试常见问题 100 题", "subtitle": "一次面试、二次面试、最终面试准备",
     "category": "career_japan", "sub": "job_interview", "product_type": "pdf_material",
     "price": 39, "currency": "CNY", "price_label": "", "coming_soon": True, "is_service": 0,
     "target": "准备日本就职面试的用户", "delivery": "数字下载",
     "description": "按面试轮次与问题类型整理的高频问题与回答思路，含自己 PR、志望动机、逆質問示例。Machi 编辑部原创整理。"},
]

GUIDE_PRODUCT_SEED.extend([
    # JLPT — 合规原创整理，不包含未授权官方真题原文。
    {"slug": "jlpt-n1-20-year-trend-analysis", "title": "N1 近 20 年题型趋势分析", "subtitle": "题型变化、备考重点与时间分配",
     "category": "jlpt", "sub": "jlpt_n1", "product_type": "pdf_material", "price": 49, "currency": "CNY",
     "price_label": "¥49", "coming_soon": True, "member_included": 1, "is_featured": 1,
     "target": "准备 N1 的学习者", "delivery": "数字资料", "tags": ["JLPT", "N1", "趋势分析"],
     "preview": "目录预览：言语知识、阅读、听力三大模块的题型变化与备考节奏。",
     "purchase": "购买后可查看完整趋势拆解、30 天复习建议与错题整理模板。",
     "notes": "基于公开考试结构和题型变化整理，不包含未授权官方真题原文。"},
    {"slug": "jlpt-n2-20-year-trend-analysis", "title": "N2 近 20 年题型趋势分析", "subtitle": "N2 高频题型与备考路线",
     "category": "jlpt", "sub": "jlpt_n2", "product_type": "pdf_material", "price": 49, "currency": "CNY",
     "price_label": "¥49", "coming_soon": True, "member_included": 1,
     "target": "准备 N2 的学习者", "delivery": "数字资料", "tags": ["JLPT", "N2", "趋势分析"],
     "preview": "目录预览：N2 词汇语法、阅读速度和听力题型的复习顺序。",
     "purchase": "购买后可查看完整题型趋势笔记、练习计划和官方样题解析笔记。",
     "notes": "不包含未授权官方真题原文。"},
    {"slug": "jlpt-n1-original-mock-20", "title": "N1 原创模拟题 20 套", "subtitle": "Machi 编辑部原创练习",
     "category": "jlpt", "sub": "mock_test", "product_type": "pdf_material", "price": 69, "currency": "CNY",
     "price_label": "¥69", "coming_soon": True, "member_included": 1, "target": "N1 冲刺阶段学习者",
     "delivery": "数字资料", "tags": ["JLPT", "N1", "原创模拟题"], "notes": "原创模拟题，不复制官方真题。"},
    {"slug": "jlpt-n2-original-mock-20", "title": "N2 原创模拟题 20 套", "subtitle": "阅读、语法、听力综合训练",
     "category": "jlpt", "sub": "mock_test", "product_type": "pdf_material", "price": 69, "currency": "CNY",
     "price_label": "¥69", "coming_soon": True, "member_included": 1, "target": "N2 冲刺阶段学习者",
     "delivery": "数字资料", "tags": ["JLPT", "N2", "原创模拟题"], "notes": "原创模拟题，不复制官方真题。"},
    {"slug": "jlpt-n1-high-frequency-vocab-plan", "title": "N1 高频词汇计划", "subtitle": "按主题和语境整理",
     "category": "jlpt", "sub": "vocabulary", "product_type": "pdf_material", "price": 39, "currency": "CNY",
     "price_label": "会员专属", "coming_soon": False, "member_included": 1, "target": "备考 N1 的学习者",
     "delivery": "会员资料", "tags": ["N1", "词汇", "会员资料"]},
    {"slug": "jlpt-n5-n1-roadmap", "title": "JLPT N5-N1 学习路线图", "subtitle": "从入门到高阶的学习路径",
     "category": "jlpt", "sub": "study_plan", "product_type": "checklist", "price": 0, "currency": "CNY",
     "price_label": "免费", "coming_soon": False, "is_free": 1, "target": "所有日语学习者", "delivery": "登录后查看",
     "tags": ["JLPT", "学习计划"]},
    {"slug": "jlpt-n3-30-day-plan", "title": "N3 30 天备考计划", "subtitle": "每天一个复习任务",
     "category": "jlpt", "sub": "jlpt_n3", "product_type": "checklist", "price": 0, "currency": "CNY",
     "price_label": "会员专属", "coming_soon": False, "member_included": 1, "target": "准备 N3 的学习者",
     "delivery": "会员资料"},
    {"slug": "jlpt-n4-basic-grammar-pack", "title": "N4 基础语法整理", "subtitle": "初级语法体系化复习",
     "category": "jlpt", "sub": "jlpt_n4", "product_type": "pdf_material", "price": 0, "currency": "CNY",
     "price_label": "会员专属", "coming_soon": False, "member_included": 1, "target": "准备 N4 的学习者",
     "delivery": "会员资料"},
    {"slug": "jlpt-n5-entry-study-plan", "title": "N5 入门学习计划", "subtitle": "假名、基础词汇与入门语法",
     "category": "jlpt", "sub": "jlpt_n5", "product_type": "checklist", "price": 0, "currency": "CNY",
     "price_label": "免费", "coming_soon": False, "is_free": 1, "target": "刚开始学日语的用户", "delivery": "登录后查看"},

    # 大学院 / 留学
    {"slug": "graduate-school-application-full-pack", "title": "大学院申请全流程资料包", "subtitle": "时间线、材料、教授联系与面试准备",
     "category": "study_japan", "sub": "graduate_school", "product_type": "pdf_material", "price": 99, "currency": "CNY",
     "price_label": "¥99", "coming_soon": True, "member_included": 1, "is_featured": 1, "target": "准备申请大学院的用户",
     "delivery": "数字资料", "tags": ["大学院", "申请流程"]},
    {"slug": "professor-email-template-pack", "title": "教授联系邮件模板", "subtitle": "事前相談与研究室联系",
     "category": "study_japan", "sub": "research_plan", "product_type": "template", "price": 29, "currency": "CNY",
     "price_label": "会员专属", "coming_soon": False, "member_included": 1, "target": "需要联系教授的申请者",
     "delivery": "会员资料"},
    {"slug": "graduate-school-interview-100", "title": "大学院面试问题 100 题", "subtitle": "研究计划、志望理由与逆質問",
     "category": "study_japan", "sub": "interview", "product_type": "pdf_material", "price": 49, "currency": "CNY",
     "price_label": "¥49", "coming_soon": True, "member_included": 1, "target": "准备大学院面试的申请者", "delivery": "数字资料"},
    {"slug": "application-documents-checklist", "title": "出愿材料检查清单", "subtitle": "出愿前逐项确认",
     "category": "study_japan", "sub": "application_documents", "product_type": "checklist", "price": 0, "currency": "CNY",
     "price_label": "会员专属", "coming_soon": False, "member_included": 1, "target": "准备出愿的申请者", "delivery": "会员资料"},
    {"slug": "humanities-research-plan-guide", "title": "文科研究计划书写作指南", "subtitle": "问题意识、先行研究、研究方法",
     "category": "study_japan", "sub": "research_plan", "product_type": "pdf_material", "price": 59, "currency": "CNY",
     "price_label": "¥59", "coming_soon": True, "member_included": 1, "target": "文科大学院申请者", "delivery": "数字资料"},
    {"slug": "science-research-plan-guide", "title": "理科研究计划书写作指南", "subtitle": "课题设定、实验计划与可行性",
     "category": "study_japan", "sub": "research_plan", "product_type": "pdf_material", "price": 59, "currency": "CNY",
     "price_label": "¥59", "coming_soon": True, "member_included": 1, "target": "理工科大学院申请者", "delivery": "数字资料"},
    {"slug": "language-school-selection-guide", "title": "语言学校选择指南", "subtitle": "地区、费用、升学支持和签证流程",
     "category": "study_abroad_japan", "sub": "language_school", "product_type": "pdf_material", "price": 0, "currency": "CNY",
     "price_label": "会员专属", "coming_soon": False, "member_included": 1, "target": "准备申请语言学校的用户", "delivery": "会员资料"},
    {"slug": "coe-material-guide", "title": "COE 材料准备指南", "subtitle": "经费支付人、学历证明与材料节奏",
     "category": "study_abroad_japan", "sub": "visa", "product_type": "checklist", "price": 0, "currency": "CNY",
     "price_label": "会员专属", "coming_soon": False, "member_included": 1, "target": "准备申请留学签证的用户", "delivery": "会员资料"},

    # 就职 / 生活
    {"slug": "rirekisho-template-pack", "title": "履历书模板包", "subtitle": "日本就职标准格式和填写提示",
     "category": "career_japan", "sub": "rirekisho", "product_type": "template", "price": 29, "currency": "CNY",
     "price_label": "会员专属", "coming_soon": False, "member_included": 1, "member_discount": 0, "target": "准备就职的用户", "delivery": "会员资料"},
    {"slug": "shokumukeirekisho-template-pack", "title": "职务经歴书模板包", "subtitle": "中途转职与经验整理",
     "category": "career_japan", "sub": "rirekisho", "product_type": "template", "price": 39, "currency": "CNY",
     "price_label": "会员专属", "coming_soon": False, "member_included": 1, "target": "准备日本转职的用户", "delivery": "会员资料"},
    {"slug": "self-pr-motivation-template", "title": "自己 PR 和志望动机模板", "subtitle": "故事结构和表达模板",
     "category": "career_japan", "sub": "job_interview", "product_type": "template", "price": 39, "currency": "CNY",
     "price_label": "¥39", "coming_soon": True, "member_included": 1, "target": "准备 ES/面试的用户", "delivery": "数字资料"},
    {"slug": "foreigner-company-selection-checklist", "title": "外国人公司选择清单", "subtitle": "签证、语言环境、评价制度和加班文化",
     "category": "career_japan", "sub": "company_selection", "product_type": "checklist", "price": 0, "currency": "CNY",
     "price_label": "会员专属", "coming_soon": False, "member_included": 1, "target": "准备投递公司的用户", "delivery": "会员资料"},
    {"slug": "work-visa-change-checklist", "title": "签证变更材料清单", "subtitle": "留学签转工作签的材料准备",
     "category": "career_japan", "sub": "visa", "product_type": "checklist", "price": 0, "currency": "CNY",
     "price_label": "会员专属", "coming_soon": False, "member_included": 1, "target": "拿到内定准备变更签证的用户", "delivery": "会员资料"},
    {"slug": "bank-account-document-checklist", "title": "日本银行卡申请材料清单", "subtitle": "开户前准备材料",
     "category": "life_japan", "sub": "bank_account_japan", "product_type": "checklist", "price": 0, "currency": "CNY",
     "price_label": "免费", "coming_soon": False, "is_free": 1, "target": "刚到日本需要开户的用户", "delivery": "登录后查看"},
    {"slug": "three-bank-comparison", "title": "三大银行开户对比表", "subtitle": "MUFG、SMBC、Mizuho 对比",
     "category": "life_japan", "sub": "bank_account_japan", "product_type": "member_resource", "price": 0, "currency": "CNY",
     "price_label": "会员专属", "coming_soon": False, "member_included": 1, "target": "需要选择银行的用户", "delivery": "会员资料"},
    {"slug": "national-health-insurance-checklist", "title": "国民健康保险办理清单", "subtitle": "役所办理前后要确认的事项",
     "category": "life_japan", "sub": "national_health_insurance", "product_type": "checklist", "price": 0, "currency": "CNY",
     "price_label": "免费", "coming_soon": False, "is_free": 1, "target": "刚到日本或搬家的用户", "delivery": "登录后查看"},
    {"slug": "pension-exemption-student-guide", "title": "年金免除/学生纳付特例说明", "subtitle": "留学生年金手续",
     "category": "life_japan", "sub": "national_pension", "product_type": "member_resource", "price": 0, "currency": "CNY",
     "price_label": "会员专属", "coming_soon": False, "member_included": 1, "target": "20 岁以上留学生", "delivery": "会员资料"},
    {"slug": "mobile-plan-comparison", "title": "日本手机卡选择对比表", "subtitle": "大手、格安 SIM、eSIM",
     "category": "life_japan", "sub": "mobile_plan_japan", "product_type": "checklist", "price": 0, "currency": "CNY",
     "price_label": "免费", "coming_soon": False, "is_free": 1, "target": "准备办理手机卡的用户", "delivery": "登录后查看"},
    {"slug": "four-carriers-comparison", "title": "四大运营商对比", "subtitle": "Docomo、au、SoftBank、Rakuten Mobile",
     "category": "life_japan", "sub": "mobile_plan_japan", "product_type": "member_resource", "price": 0, "currency": "CNY",
     "price_label": "会员专属", "coming_soon": False, "member_included": 1, "target": "想比较运营商的用户", "delivery": "会员资料"},
    {"slug": "mnp-switching-notes", "title": "MNP 转社注意事项", "subtitle": "携号转网、费用和积分活动风险",
     "category": "life_japan", "sub": "points_and_switching", "product_type": "member_resource", "price": 0, "currency": "CNY",
     "price_label": "会员专属", "coming_soon": False, "member_included": 1, "target": "考虑手机转社的用户", "delivery": "会员资料",
     "notes": "活动条件经常变化，请以运营商和活动页面为准。Machi 不承诺一定获得积分。"},

    # 服务类：只做预约/支付预留，不进入会员免费权益。
    {"slug": "shokumukeirekisho-review-service", "title": "职务经歴书修改服务", "subtitle": "中途转职材料优化",
     "category": "career_japan", "sub": "rirekisho", "product_type": "resume_review", "price": 0, "currency": "CNY",
     "price_label": "¥299 起", "coming_soon": True, "is_service": 1, "member_discount": 1, "target": "准备转职的用户",
     "delivery": "人工服务·线上", "refund_policy": "人工服务预约后按实际确认的服务范围执行，未开始前可联系协商取消。"},
    {"slug": "research-plan-review-service", "title": "研究计划书修改服务", "subtitle": "大学院申请材料辅导",
     "category": "study_japan", "sub": "research_plan", "product_type": "research_plan_review", "price": 0, "currency": "CNY",
     "price_label": "¥499 起", "coming_soon": True, "is_service": 1, "member_discount": 1, "target": "准备大学院申请的用户",
     "delivery": "人工服务·线上"},
    {"slug": "graduate-school-consultation", "title": "大学院申请咨询", "subtitle": "选校、研究室、时间线",
     "category": "study_japan", "sub": "graduate_school", "product_type": "graduate_school_support", "price": 0, "currency": "CNY",
     "price_label": "预约咨询", "coming_soon": True, "is_service": 1, "member_discount": 1, "target": "需要申请规划的用户",
     "delivery": "预约咨询"},
    {"slug": "language-school-consultation", "title": "语言学校申请咨询", "subtitle": "择校、材料和 COE",
     "category": "study_abroad_japan", "sub": "language_school", "product_type": "language_school_support", "price": 0, "currency": "CNY",
     "price_label": "预约咨询", "coming_soon": True, "is_service": 1, "member_discount": 1, "target": "准备赴日留学的用户",
     "delivery": "预约咨询"},
    {"slug": "japan-job-mock-interview", "title": "日本就职模拟面试", "subtitle": "一次/二次/最终面试演练",
     "category": "career_japan", "sub": "job_interview", "product_type": "interview_coaching", "price": 0, "currency": "CNY",
     "price_label": "¥299 起", "coming_soon": True, "is_service": 1, "member_discount": 1, "target": "准备日本就职面试的用户",
     "delivery": "人工服务·线上"},
])

# ---------------------------------------------------------------------------
# JLPT N1-N5「过去问题型趋势分析与原创练习」— 统一 ¥49。
# 合规：原创整理 + 题型趋势 + 原创练习题，绝不包含未授权官方历年真题原文。
# is_member_included 默认 false（可后台改），is_member_discount=true（可后台改）。
# ---------------------------------------------------------------------------
_JLPT_COMPLIANCE_NOTE = (
    "本资料为 Machi 日语学习编辑部原创整理，包含 JLPT 题型趋势分析、备考重点、"
    "公开样题解析思路、原创练习题和学习建议。不包含未授权官方历年真题原文。"
)

def _jlpt_trend_product(level: str, sub: str, contents: list[str], *, featured: bool = False) -> dict[str, Any]:
    body = "、".join(contents)
    return {
        "slug": f"jlpt-{level.lower()}-past-trend-original-practice",
        "title": f"JLPT {level} 过去问题型趋势分析与原创练习",
        "subtitle": f"{level} 题型趋势 + 原创练习，统一 ¥49",
        "category": "jlpt", "sub": sub, "product_type": "pdf_material",
        "price": 49, "currency": "CNY", "price_label": "¥49",
        "coming_soon": False, "is_service": 0,
        "member_included": 0, "member_discount": 1, "member_price": 39,
        "is_featured": 1 if featured else 0,
        "target": f"准备 {level} 的学习者", "delivery": "数字资料（PDF，购买后可在“我的资料”查看）",
        "tags": ["JLPT", level, "过去问趋势", "原创练习"],
        "description": f"内容包含：{body}。\n\n{_JLPT_COMPLIANCE_NOTE}",
        "preview": (
            f"预览：{level} 三大模块（言语知识・阅读・听力）的题型趋势概览、备考重点目录，"
            "以及 2 道原创样题与解题思路示例。"
        ),
        "purchase": (
            f"购买后获得：{level} 完整题型趋势分析 PDF、各模块答题策略、原创练习题，"
            "以及考前 30 天备考计划与错题整理建议。"
        ),
        "refund_policy": "数字资料一经解锁不支持退款；购买前请先查看预览内容。",
        "notes": _JLPT_COMPLIANCE_NOTE,
    }

GUIDE_PRODUCT_SEED.extend([
    _jlpt_trend_product("N1", "jlpt_n1", [
        "N1 题型趋势分析", "高频语法方向", "高频词汇方向", "阅读题型整理",
        "听力题型整理", "原创练习题", "考前 30 天计划", "答题策略",
    ], featured=True),
    _jlpt_trend_product("N2", "jlpt_n2", [
        "N2 题型趋势分析", "高频语法方向", "高频词汇方向", "阅读题型整理",
        "听力题型整理", "原创练习题", "考前 30 天计划", "答题策略",
    ], featured=True),
    _jlpt_trend_product("N3", "jlpt_n3", [
        "N3 题型趋势分析", "语法重点", "词汇重点", "阅读基础训练",
        "听力基础训练", "原创练习题", "备考计划",
    ]),
    _jlpt_trend_product("N4", "jlpt_n4", [
        "N4 题型趋势分析", "基础语法", "基础词汇", "阅读入门",
        "听力入门", "原创练习题", "学习计划",
    ]),
    _jlpt_trend_product("N5", "jlpt_n5", [
        "N5 题型趋势分析", "五十音复习", "入门词汇", "入门语法",
        "简单阅读", "听力入门", "原创练习题", "学习计划",
    ]),
])

# ---------------------------------------------------------------------------
# 日本本地服务商品。is_service=1 ⇒ 永不进入会员免费权益（后台/种子均强制），
# 但可设 member_discount。多数为「预约咨询」(price_label 报价、走预约表单)；
# 有固定价的(如语言学校申请咨询 ¥1000)也可走 Web Stripe。
# ---------------------------------------------------------------------------
def _guide_service(slug: str, title: str, subtitle: str, product_type: str, sub: str,
                   price_label: str, target: str, scope: list[str], excludes: list[str],
                   *, price: int = 0, delivery: str = "人工服务·线上/线下",
                   extra: str = "", featured: bool = False) -> dict[str, Any]:
    desc_parts = [subtitle + "。" if subtitle and not subtitle.endswith("。") else subtitle]
    if extra:
        desc_parts.append(extra)
    desc_parts.append("服务范围：" + "；".join(scope) + "。")
    desc_parts.append("不包含：" + "；".join(excludes) + "。")
    return {
        "slug": slug, "title": title, "subtitle": subtitle,
        "category": "guide_services", "sub": sub, "product_type": product_type,
        "price": price, "currency": "CNY", "price_label": price_label,
        "coming_soon": False, "is_service": 1, "member_discount": 1,
        "is_featured": 1 if featured else 0, "target": target, "delivery": delivery,
        "description": "\n\n".join(p for p in desc_parts if p),
        "refund_policy": "预约后如未开始服务可协商取消；已开始或已完成的人工服务按实际进度结算，不保证特定结果。",
        "notes": "本服务为信息协助性质，不替代任何官方机构的审核与决定，不提供虚假材料。",
    }

GUIDE_PRODUCT_SEED.extend([
    _guide_service("tokyo-disney-park-support", "东京迪士尼游园协助", "第一次去东京迪士尼、不会日语也能更顺利规划",
        "disney_park_support", "japan_tour_support", "预约咨询",
        "第一次去东京迪士尼、不熟悉路线和预约系统的用户",
        ["行程规划", "入园路线建议", "项目优先级建议", "当天流程协助", "简单翻译协助", "拍照点建议", "餐厅/表演安排建议"],
        ["门票费用", "餐饮费用", "交通费用", "快速通行或付费项目费用", "不保证项目等待时间", "不保证园区运营情况"],
        featured=True),
    _guide_service("japan-airport-pickup", "日本机场接机服务", "成田・羽田・关西等机场接机协助",
        "airport_pickup", "japan_tour_support", "预约咨询",
        "初到日本、行李较多、不熟悉交通的用户",
        ["到达口接应", "协助购买交通票", "协助前往住处", "简单入住沟通协助", "行李路线建议"],
        ["交通费", "高速费", "停车费", "额外等待费（可后台设置）", "酒店/房东费用"],
        extra="可选机场：成田、羽田、关西、中部国际、福冈。", featured=True),
    _guide_service("japanese-phone-call-proxy", "日语翻译与电话代打", "用日语联系学校、房东、银行、役所等",
        "translation_call", "japan_language_support", "¥99 起",
        "需要用日语联系学校/房东/中介/银行/手机公司/役所/医院/快递等的用户",
        ["电话前信息整理", "日语电话代打", "简单口译", "通话结果整理", "文字说明反馈"],
        ["法律/医疗专业判断", "替用户作虚假陈述", "高风险合同承诺", "代签文件"]),
    _guide_service("japanese-document-translation", "日语文件翻译协助", "通知、邮件、学校材料的中日翻译协助",
        "translation_call", "japan_language_support", "¥99 起",
        "需要理解简单文件、通知、邮件、生活手续说明的用户",
        ["日文通知理解", "邮件翻译", "简单文件说明", "回复文案建议"],
        ["法律认证翻译", "公证翻译", "医疗诊断翻译", "高风险合同审查"]),
    _guide_service("part-time-job-finding-help", "帮忙找打工服务", "打工方向、招聘筛选与联系协助",
        "part_time_job_support", "japan_job_support", "预约咨询",
        "在日本想找兼职但不熟悉日语招聘、面试、履历书的用户",
        ["打工方向建议", "招聘信息筛选", "履历书准备建议", "电话/邮件联系协助", "面试注意事项", "资格外活动许可提醒"],
        ["不保证录用", "不代替雇主决定", "不协助违规打工", "不提供虚假材料"]),
    _guide_service("bank-account-support", "银行卡办理协助", "开户材料、银行选择与现场沟通协助",
        "bank_account_support", "japan_life_procedure", "预约咨询",
        "刚到日本、不熟悉银行开户流程和日语沟通的用户",
        ["开户材料检查", "银行选择建议", "预约/路线建议", "现场沟通协助", "基础日语沟通协助"],
        ["不保证开户成功", "不代替银行审核", "不提供虚假材料"],
        extra="可选银行：三菱UFJ、三井住友、みずほ、ゆうちょ、りそな等。"),
    _guide_service("housing-application-support", "租房申请协助", "看房、申请、和中介沟通的流程协助",
        "housing_support", "japan_housing", "预约咨询",
        "想在日本租房、看房、申请、和中介沟通的用户",
        ["租房条件整理", "房源沟通协助", "看房流程协助", "申请材料检查", "中介沟通翻译", "初期费用说明", "保证会社说明"],
        ["不保证审查通过", "不承担租赁合同责任", "不代替用户签约", "不提供虚假材料", "不承担房源真实性保证"],
        featured=True),
    _guide_service("city-hall-procedure-support", "役所手续协助", "住民登记、保险、年金等手续协助",
        "procedure_support", "japan_life_procedure", "预约咨询",
        "刚到日本需要办理住民登记、保险、年金、地址变更等手续的用户",
        ["手续清单整理", "材料检查", "役所路线/窗口说明", "现场沟通协助", "简单翻译协助"],
        ["不代替官方审核", "不提供虚假材料", "不承担手续结果"],
        extra="适用手续：住民登记、地址变更、国民健康保险、年金咨询、印章登记、住民票申请。"),
    _guide_service("mobile-sim-support", "手机卡办理协助", "运营商选择、套餐说明与现场办理协助",
        "procedure_support", "japan_life_procedure", "预约咨询",
        "不会日语、不知道选哪家运营商、需要现场协助的用户",
        ["运营商选择建议", "套餐说明", "材料检查", "现场办理协助", "开通协助"],
        ["不代替运营商审核", "不承担套餐费用", "不提供虚假材料"],
        extra="可选：Docomo、au、SoftBank、Rakuten、ahamo、povo、LINEMO、UQ、Y!mobile。"),
    _guide_service("arrival-one-day-support", "入境后生活手续一日协助", "役所・手机卡・银行・交通卡集中梳理",
        "procedure_support", "japan_life_procedure", "预约咨询",
        "刚到日本，需要集中办理役所、手机卡、银行卡、交通卡、住处确认等事项的用户",
        ["当日路线规划", "役所手续协助", "手机卡办理协助", "银行开户材料确认", "交通卡/生活说明", "基础翻译"],
        ["各项官方审核结果", "交通与办理产生的费用", "不提供虚假材料"], featured=True),
    _guide_service("graduate-school-consult", "大学院申请咨询", "方向、研究室、出愿与面试整体咨询",
        "graduate_school_support", "japan_graduate_school", "预约咨询",
        "准备申请日本大学院的用户",
        ["申请方向梳理", "研究室/教授匹配建议", "出愿时间线规划", "材料清单", "面试准备建议"],
        ["不保证合格", "不代替教授决定", "不提供虚假材料"]),
    _guide_service("research-plan-revision", "研究计划书修改服务", "结构、问题意识、研究方法逐项修改",
        "research_plan_review", "japan_graduate_school", "¥499 起",
        "准备大学院出愿、需要打磨研究计划书的用户",
        ["结构梳理", "问题意识与先行研究建议", "研究方法可行性建议", "语言表达润色", "教授视角反馈"],
        ["不代写", "不保证合格", "不提供学术不端协助"]),
    _guide_service("language-school-application-consult", "语言学校申请咨询", "选校、材料、经费与签证全流程",
        "language_school_support", "japan_study_abroad", "¥1000",
        "准备申请语言学校赴日留学的用户",
        ["选校建议", "申请材料清单与检查", "经费支付人材料说明", "COE/签证流程说明", "时间线规划"],
        ["不保证 COE/签证通过", "不代替入管审核", "不提供虚假材料"],
        price=1000, delivery="人工服务·线上（一次性套餐 ¥1000）"),
    _guide_service("shokumukeirekisho-revision", "职务经歴书修改服务", "技能、项目与成果表达打磨",
        "resume_review", "japan_job_support", "¥299 起",
        "准备日本中途就职、需要打磨职务经歴书的用户",
        ["结构梳理", "技能总结建议", "项目经历表达", "成果量化建议", "排版规范"],
        ["不代写虚假经历", "不保证录用"]),
    _guide_service("es-motivation-revision", "ES / 志望动机修改服务", "志望动机与自己 PR 文案打磨",
        "career_support", "japan_job_support", "¥199 起",
        "准备日本就职、需要打磨 ES / 志望动机的用户",
        ["志望动机结构建议", "自己 PR 表达打磨", "公司针对性建议", "日语表达润色"],
        ["不代写虚假内容", "不保证通过筛选"]),
    _guide_service("japan-life-consultation", "日本生活问题咨询", "在留、手续、租房、打工等综合咨询",
        "consultation", "japan_life_procedure", "预约咨询",
        "在日本生活遇到手续、租房、打工、保险等问题、想要一对一咨询的用户",
        ["问题梳理", "可行方案建议", "所需材料/流程说明", "避坑提醒", "后续行动建议"],
        ["法律/医疗/税务专业判断", "不替代官方机构", "不提供虚假材料"]),
    _guide_service("hospital-appointment-call", "医院预约电话协助", "日语电话预约医院、说明症状协助",
        "translation_call", "japan_language_support", "¥99 起",
        "需要用日语预约医院、说明就诊需求的用户",
        ["预约前信息整理", "日语电话预约", "简单症状沟通协助", "预约结果整理"],
        ["医疗诊断与建议", "替用户作虚假陈述", "紧急医疗（请直接拨打急救）"]),
    _guide_service("delivery-utility-call", "快递/水电煤电话协助", "联系快递、水电气等日语电话协助",
        "translation_call", "japan_life_procedure", "¥99 起",
        "需要联系快递、水电煤气等服务的用户",
        ["电话前信息整理", "日语电话代打", "结果整理与反馈"],
        ["费用代缴", "高风险合同承诺", "代签文件"]),
])

# 会员资料库扩充批：与指南文章配套的模板/清单类原创资料。
GUIDE_PRODUCT_SEED.extend([
    {"slug": "renting-initial-cost-worksheet", "title": "租房初期费用核算表", "subtitle": "把敷金礼金中介费一项项算清楚",
     "category": "life_japan", "sub": "housing", "product_type": "checklist", "price": 0, "currency": "CNY",
     "price_label": "会员专属", "coming_soon": False, "member_included": 1, "target": "准备在日本租房的用户",
     "delivery": "会员资料", "tags": ["租房", "初期费用", "会员资料"], "is_featured": 1},
    {"slug": "lease-contract-check-list", "title": "签约前合同检查清单", "subtitle": "重要事项说明 20 个必看条款",
     "category": "life_japan", "sub": "housing", "product_type": "checklist", "price": 0, "currency": "CNY",
     "price_label": "会员专属", "coming_soon": False, "member_included": 1, "target": "即将签订赁贷合同的用户",
     "delivery": "会员资料", "tags": ["租房", "合同", "会员资料"]},
    {"slug": "first-week-procedures-pack", "title": "入境第一周手续包", "subtitle": "在留卡·住民登记·保险·银行一页流",
     "category": "life_japan", "sub": "arrival_preparation", "product_type": "checklist", "price": 0, "currency": "CNY",
     "price_label": "会员专属", "coming_soon": False, "member_included": 1, "target": "刚入境或即将入境日本的用户",
     "delivery": "会员资料", "tags": ["入境", "手续", "会员资料"], "is_featured": 1},
    {"slug": "research-plan-template-annotated", "title": "研究计划书模板（逐段讲解版）", "subtitle": "结构模板+每一段写什么的批注",
     "category": "study_japan", "sub": "research_plan", "product_type": "pdf_material", "price": 0, "currency": "CNY",
     "price_label": "会员专属", "coming_soon": False, "member_included": 1, "target": "准备大学院出愿的用户",
     "delivery": "会员资料", "tags": ["研究计划书", "大学院", "会员资料"], "is_featured": 1},
    {"slug": "shokumu-keirekisho-template", "title": "职务经历书模板与写法示例", "subtitle": "转职材料的核心一页怎么写",
     "category": "career_japan", "sub": "job_change", "product_type": "pdf_material", "price": 0, "currency": "CNY",
     "price_label": "会员专属", "coming_soon": False, "member_included": 1, "target": "准备在日转职的用户",
     "delivery": "会员资料", "tags": ["转职", "職務経歴書", "会员资料"]},
    {"slug": "interview-qa-100", "title": "面接想定问答 100 题", "subtitle": "新卒与转职高频问题+回答框架",
     "category": "career_japan", "sub": "interview", "product_type": "pdf_material", "price": 0, "currency": "CNY",
     "price_label": "会员专属", "coming_soon": False, "member_included": 1, "target": "正在准备日企面试的用户",
     "delivery": "会员资料", "tags": ["面接", "就活", "会员资料"]},
    {"slug": "taishoku-procedures-checklist", "title": "退职手续核对清单", "subtitle": "保险·年金·失业给付·税金时间线",
     "category": "career_japan", "sub": "job_change", "product_type": "checklist", "price": 0, "currency": "CNY",
     "price_label": "会员专属", "coming_soon": False, "member_included": 1, "target": "即将离职或换工作的用户",
     "delivery": "会员资料", "tags": ["退职", "手续", "会员资料"]},
    {"slug": "disaster-kit-checklist", "title": "家庭防灾物资清单", "subtitle": "按人数勾选的常备物资与文件备份表",
     "category": "life_japan", "sub": "safety", "product_type": "checklist", "price": 0, "currency": "CNY",
     "price_label": "会员专属", "coming_soon": False, "member_included": 1, "target": "所有在日居住用户",
     "delivery": "会员资料", "tags": ["防灾", "清单", "会员资料"]},
])

# 学校/公司种子：只录入官方链接、名称、地区、类型等可维护基础字段。
# 评分、评论、申请细节不造数据；verification_status=needs_review。
GUIDE_SCHOOL_SEED: list[dict[str, Any]] = [
    {"slug": "the-university-of-tokyo", "school_name": "东京大学", "school_name_jp": "東京大学",
     "school_name_en": "The University of Tokyo", "school_type": "university", "prefecture": "tokyo", "city": "tokyo",
     "website": "https://www.u-tokyo.ac.jp/", "international_admission_url": "https://www.u-tokyo.ac.jp/en/prospective-students/",
     "fields_of_study": ["Engineering", "Humanities", "Science", "Medicine"], "is_featured": 1},
    {"slug": "kyoto-university", "school_name": "京都大学", "school_name_jp": "京都大学",
     "school_name_en": "Kyoto University", "school_type": "university", "prefecture": "kyoto", "city": "kyoto",
     "website": "https://www.kyoto-u.ac.jp/", "international_admission_url": "https://www.kyoto-u.ac.jp/en/education-campus/education-and-admissions",
     "fields_of_study": ["Engineering", "Science", "Humanities", "Medicine"], "is_featured": 1},
    {"slug": "osaka-university", "school_name": "大阪大学", "school_name_jp": "大阪大学",
     "school_name_en": "Osaka University", "school_type": "university", "prefecture": "osaka", "city": "osaka",
     "website": "https://www.osaka-u.ac.jp/", "international_admission_url": "https://www.osaka-u.ac.jp/en/international",
     "fields_of_study": ["Engineering", "Science", "Humanities"], "is_featured": 1},
    {"slug": "waseda-university", "school_name": "早稻田大学", "school_name_jp": "早稲田大学",
     "school_name_en": "Waseda University", "school_type": "university", "prefecture": "tokyo", "city": "tokyo",
     "website": "https://www.waseda.jp/", "international_admission_url": "https://www.waseda.jp/inst/admission/en/",
     "fields_of_study": ["Business", "Humanities", "Engineering", "Education"], "is_featured": 1},
    {"slug": "keio-university", "school_name": "庆应义塾大学", "school_name_jp": "慶應義塾大学",
     "school_name_en": "Keio University", "school_type": "university", "prefecture": "tokyo", "city": "tokyo",
     "website": "https://www.keio.ac.jp/", "international_admission_url": "https://www.keio.ac.jp/en/admissions/",
     "fields_of_study": ["Business", "Medicine", "Engineering", "Humanities"]},
    {"slug": "tokyo-international-university", "school_name": "东京国际大学", "school_name_jp": "東京国際大学",
     "school_name_en": "Tokyo International University", "school_type": "university", "prefecture": "saitama", "city": "kawagoe",
     "website": "https://www.tiu.ac.jp/", "international_admission_url": "https://www.tiu.ac.jp/etrack/",
     "fields_of_study": ["Business", "International Relations", "Education"]},
    {"slug": "japan-electronics-college", "school_name": "日本电子专门学校", "school_name_jp": "日本電子専門学校",
     "school_name_en": "Japan Electronics College", "school_type": "vocational_school", "prefecture": "tokyo", "city": "tokyo",
     "website": "https://www.jec.ac.jp/", "international_admission_url": "https://www.jec.ac.jp/foreign/",
     "fields_of_study": ["IT", "Engineering", "Anime/Game", "Design"]},
    {"slug": "hal-tokyo", "school_name": "HAL 东京", "school_name_jp": "HAL東京",
     "school_name_en": "HAL Tokyo", "school_type": "vocational_school", "prefecture": "tokyo", "city": "tokyo",
     "website": "https://www.hal.ac.jp/tokyo", "international_admission_url": "https://www.hal.ac.jp/tokyo/apply/overseas",
     "fields_of_study": ["IT", "Anime/Game", "Design"]},
    {"slug": "isi-japanese-language-school", "school_name": "ISI 日本语学校", "school_name_jp": "ISI日本語学校",
     "school_name_en": "ISI Japanese Language School", "school_type": "language_school", "prefecture": "tokyo", "city": "tokyo",
     "website": "https://www.isi-education.com/", "international_admission_url": "https://www.isi-education.com/admission/",
     "fields_of_study": ["Language"]},
    {"slug": "kai-japanese-language-school", "school_name": "KAI 日本语学校", "school_name_jp": "カイ日本語スクール",
     "school_name_en": "KAI Japanese Language School", "school_type": "language_school", "prefecture": "tokyo", "city": "tokyo",
     "website": "https://www.kaij.jp/", "international_admission_url": "https://www.kaij.jp/application/",
     "fields_of_study": ["Language"]},
]

GUIDE_COMPANY_SEED: list[dict[str, Any]] = [
    {"slug": "rakuten-group", "name": "乐天集团", "name_jp": "楽天グループ株式会社", "name_en": "Rakuten Group, Inc.",
     "industry": "it_internet", "city": "tokyo", "website": "https://corp.rakuten.co.jp/",
     "career_url": "https://corp.rakuten.co.jp/careers/", "company_size": "enterprise", "founded": 1997, "is_featured": 1},
    {"slug": "mercari", "name": "Mercari", "name_jp": "株式会社メルカリ", "name_en": "Mercari, Inc.",
     "industry": "it_internet", "city": "tokyo", "website": "https://about.mercari.com/",
     "career_url": "https://careers.mercari.com/", "company_size": "large", "founded": 2013, "is_featured": 1},
    {"slug": "line-yahoo", "name": "LINE Yahoo", "name_jp": "LINEヤフー株式会社", "name_en": "LY Corporation",
     "industry": "it_internet", "city": "tokyo", "website": "https://www.lycorp.co.jp/",
     "career_url": "https://www.lycorp.co.jp/ja/recruit/", "company_size": "enterprise", "founded": 1996, "is_featured": 1},
    {"slug": "sony-group", "name": "Sony Group", "name_jp": "ソニーグループ株式会社", "name_en": "Sony Group Corporation",
     "industry": "electronics", "city": "tokyo", "website": "https://www.sony.com/",
     "career_url": "https://www.sony.com/ja/SonyInfo/Jobs/", "company_size": "enterprise", "founded": 1946},
    {"slug": "softbank-corp", "name": "软银", "name_jp": "ソフトバンク株式会社", "name_en": "SoftBank Corp.",
     "industry": "telecom", "city": "tokyo", "website": "https://www.softbank.jp/corp/",
     "career_url": "https://www.softbank.jp/recruit/", "company_size": "enterprise", "founded": 1986, "is_featured": 1},
    {"slug": "recruit-holdings", "name": "Recruit", "name_jp": "株式会社リクルートホールディングス", "name_en": "Recruit Holdings Co., Ltd.",
     "industry": "it_internet", "city": "tokyo", "website": "https://recruit-holdings.com/",
     "career_url": "https://recruit-holdings.com/ja/recruit/", "company_size": "enterprise", "founded": 1960},
    {"slug": "fast-retailing", "name": "迅销集团（优衣库）", "name_jp": "株式会社ファーストリテイリング", "name_en": "FAST RETAILING CO., LTD.",
     "industry": "retail", "city": "tokyo", "website": "https://www.fastretailing.com/",
     "career_url": "https://www.fastretailing.com/employment/", "company_size": "enterprise", "founded": 1963},
    {"slug": "toyota-motor", "name": "Toyota", "name_jp": "トヨタ自動車株式会社", "name_en": "Toyota Motor Corporation",
     "industry": "automotive", "prefecture": "aichi", "city": "toyota", "website": "https://global.toyota/",
     "career_url": "https://www.toyota-recruit.com/", "company_size": "enterprise", "founded": 1937},
    {"slug": "ntt-data", "name": "NTT DATA", "name_jp": "株式会社NTTデータ", "name_en": "NTT DATA Corporation",
     "industry": "software", "city": "tokyo", "website": "https://www.nttdata.com/global/en/",
     "career_url": "https://www.nttdata.com/global/en/careers", "company_size": "enterprise", "founded": 1988},
    {"slug": "fujitsu", "name": "Fujitsu", "name_jp": "富士通株式会社", "name_en": "Fujitsu Limited",
     "industry": "software", "city": "tokyo", "website": "https://www.fujitsu.com/",
     "career_url": "https://www.fujitsu.com/global/about/careers/", "company_size": "enterprise", "founded": 1935},
]


def _append_guide_school_seed(slug: str, name: str, name_jp: str, name_en: str, school_type: str,
                              prefecture: str, city: str, website: str = "", fields: list[str] | None = None,
                              featured: int = 0) -> None:
    field_list = [f for f in (fields or ["unknown"]) if f]
    source_url = website or "https://www.studyinjapan.go.jp/en/search-school/"
    type_label = {
        "university": "大学/大学院",
        "vocational_school": "专门学校",
        "language_school": "语言学校",
    }.get(school_type, "学校")
    admission_months = "4月,10月" if school_type == "language_school" else "4月"
    payload = {
        "slug": slug,
        "school_name": name,
        "school_name_jp": name_jp,
        "school_name_en": name_en,
        "school_type": school_type,
        "prefecture": prefecture,
        "city": city,
        "website": website,
        "international_admission_url": website,
        "fields_of_study": field_list,
        "short_description": f"{name} 位于 {prefecture}/{city}，收录为{type_label}档案，可按地区、学校类型和专业方向初筛。",
        "description": (
            f"{name}（{name_jp or name_en}）是 Machi 日本学校库的结构化档案。"
            f"当前整理了学校类型、所在地区、官网链接和留学生常关注方向：{', '.join(field_list)}。"
            "申请季、语言要求、学费、奖学金和宿舍等细节请以学校官网与最新募集要项为准。"
        ),
        "is_accepting_international_students": 1 if website else -1,
        "has_japanese_program": 1 if school_type in {"language_school", "vocational_school", "university"} else -1,
        "has_career_support": 1 if school_type in {"vocational_school", "university"} else -1,
        "has_language_support": 1 if school_type in {"language_school", "vocational_school", "university"} else -1,
        "application_periods": "请确认学校最新募集要项",
        "admission_months": admission_months,
        "required_japanese_level": "按项目确认",
        "required_english_level": "按项目确认",
        "tags": [school_type, prefecture, city, *field_list],
        "source_type": "school_website" if website else "study_in_japan",
        "source_name": name_en or name_jp or name,
        "source_url": source_url,
        "verification_status": "needs_review",
        "is_featured": featured,
    }
    existing = next((s for s in GUIDE_SCHOOL_SEED if s["slug"] == slug), None)
    if existing:
        merged_fields = sorted({*existing.get("fields_of_study", []), *field_list})
        merged_tags = sorted({*existing.get("tags", []), *payload["tags"]})
        for key, value in payload.items():
            if value not in ("", [], None):
                existing[key] = value
        existing["fields_of_study"] = merged_fields
        existing["tags"] = merged_tags
        existing["is_featured"] = max(int(existing.get("is_featured", 0)), int(featured))
        return
    GUIDE_SCHOOL_SEED.append(payload)


for _school in [
    ("tohoku-university", "东北大学", "東北大学", "Tohoku University", "university", "miyagi", "sendai", "https://www.tohoku.ac.jp/", ["Engineering", "Science", "Humanities"], 1),
    ("hokkaido-university", "北海道大学", "北海道大学", "Hokkaido University", "university", "hokkaido", "sapporo", "https://www.hokudai.ac.jp/", ["Science", "Agriculture", "Engineering"], 1),
    ("nagoya-university", "名古屋大学", "名古屋大学", "Nagoya University", "university", "aichi", "nagoya", "https://www.nagoya-u.ac.jp/", ["Science", "Engineering", "Humanities"], 1),
    ("kyushu-university", "九州大学", "九州大学", "Kyushu University", "university", "fukuoka", "fukuoka", "https://www.kyushu-u.ac.jp/", ["Engineering", "Science", "Medicine"], 1),
    ("university-of-tsukuba", "筑波大学", "筑波大学", "University of Tsukuba", "university", "ibaraki", "tsukuba", "https://www.tsukuba.ac.jp/", ["Science", "Sports", "Humanities"], 1),
    ("institute-of-science-tokyo", "东京科学大学", "東京科学大学", "Institute of Science Tokyo", "university", "tokyo", "tokyo", "https://www.isct.ac.jp/", ["Science", "Engineering", "Medicine"], 1),
    ("hitotsubashi-university", "一桥大学", "一橋大学", "Hitotsubashi University", "university", "tokyo", "kunitachi", "https://www.hit-u.ac.jp/", ["Commerce", "Economics", "Law"]),
    ("kobe-university", "神户大学", "神戸大学", "Kobe University", "university", "hyogo", "kobe", "https://www.kobe-u.ac.jp/", ["Economics", "Engineering", "Medicine"]),
    ("hiroshima-university", "广岛大学", "広島大学", "Hiroshima University", "university", "hiroshima", "higashihiroshima", "https://www.hiroshima-u.ac.jp/", ["Education", "Science", "Engineering"]),
    ("okayama-university", "冈山大学", "岡山大学", "Okayama University", "university", "okayama", "okayama", "https://www.okayama-u.ac.jp/", ["Medicine", "Science", "Engineering"]),
    ("kanazawa-university", "金泽大学", "金沢大学", "Kanazawa University", "university", "ishikawa", "kanazawa", "https://www.kanazawa-u.ac.jp/", ["Humanities", "Science", "Medicine"]),
    ("chiba-university", "千叶大学", "千葉大学", "Chiba University", "university", "chiba", "chiba", "https://www.chiba-u.ac.jp/", ["Medicine", "Engineering", "Design"]),
    ("yokohama-national-university", "横滨国立大学", "横浜国立大学", "Yokohama National University", "university", "kanagawa", "yokohama", "https://www.ynu.ac.jp/", ["Engineering", "Economics", "Education"]),
    ("tokyo-metropolitan-university", "东京都立大学", "東京都立大学", "Tokyo Metropolitan University", "university", "tokyo", "hachioji", "https://www.tmu.ac.jp/", ["Urban Studies", "Science", "Engineering"]),
    ("osaka-metropolitan-university", "大阪公立大学", "大阪公立大学", "Osaka Metropolitan University", "university", "osaka", "osaka", "https://www.omu.ac.jp/", ["Engineering", "Medicine", "Business"]),
    ("tokyo-university-of-foreign-studies", "东京外国语大学", "東京外国語大学", "Tokyo University of Foreign Studies", "university", "tokyo", "fuchu", "https://www.tufs.ac.jp/", ["Languages", "International Studies"]),
    ("tokyo-university-of-agriculture-and-technology", "东京农工大学", "東京農工大学", "Tokyo University of Agriculture and Technology", "university", "tokyo", "fuchu", "https://www.tuat.ac.jp/", ["Agriculture", "Engineering"]),
    ("ochanomizu-university", "御茶水女子大学", "お茶の水女子大学", "Ochanomizu University", "university", "tokyo", "tokyo", "https://www.ocha.ac.jp/", ["Humanities", "Science"]),
    ("tokyo-gakugei-university", "东京学艺大学", "東京学芸大学", "Tokyo Gakugei University", "university", "tokyo", "koganei", "https://www.u-gakugei.ac.jp/", ["Education"]),
    ("niigata-university", "新潟大学", "新潟大学", "Niigata University", "university", "niigata", "niigata", "https://www.niigata-u.ac.jp/", ["Medicine", "Agriculture", "Engineering"]),
    ("kumamoto-university", "熊本大学", "熊本大学", "Kumamoto University", "university", "kumamoto", "kumamoto", "https://www.kumamoto-u.ac.jp/", ["Engineering", "Medicine", "Humanities"]),
    ("nagasaki-university", "长崎大学", "長崎大学", "Nagasaki University", "university", "nagasaki", "nagasaki", "https://www.nagasaki-u.ac.jp/", ["Medicine", "Global Health", "Engineering"]),
    ("shizuoka-university", "静冈大学", "静岡大学", "Shizuoka University", "university", "shizuoka", "shizuoka", "https://www.shizuoka.ac.jp/", ["Engineering", "Informatics", "Education"]),
    ("shinshu-university", "信州大学", "信州大学", "Shinshu University", "university", "nagano", "matsumoto", "https://www.shinshu-u.ac.jp/", ["Textile Science", "Medicine", "Engineering"]),
    ("gunma-university", "群马大学", "群馬大学", "Gunma University", "university", "gunma", "maebashi", "https://www.gunma-u.ac.jp/", ["Medicine", "Science", "Engineering"]),
    ("saitama-university", "埼玉大学", "埼玉大学", "Saitama University", "university", "saitama", "saitama", "https://www.saitama-u.ac.jp/", ["Education", "Economics", "Engineering"]),
    ("ibaraki-university", "茨城大学", "茨城大学", "Ibaraki University", "university", "ibaraki", "mito", "https://www.ibaraki.ac.jp/", ["Humanities", "Agriculture", "Engineering"]),
    ("utsunomiya-university", "宇都宫大学", "宇都宮大学", "Utsunomiya University", "university", "tochigi", "utsunomiya", "https://www.utsunomiya-u.ac.jp/", ["Agriculture", "Engineering", "Education"]),
    ("university-of-yamanashi", "山梨大学", "山梨大学", "University of Yamanashi", "university", "yamanashi", "kofu", "https://www.yamanashi.ac.jp/", ["Medicine", "Engineering", "Education"]),
    ("mie-university", "三重大学", "三重大学", "Mie University", "university", "mie", "tsu", "https://www.mie-u.ac.jp/", ["Medicine", "Engineering", "Humanities"]),
    ("gifu-university", "岐阜大学", "岐阜大学", "Gifu University", "university", "gifu", "gifu", "https://www.gifu-u.ac.jp/", ["Medicine", "Engineering", "Agriculture"]),
    ("shiga-university", "滋贺大学", "滋賀大学", "Shiga University", "university", "shiga", "hikone", "https://www.shiga-u.ac.jp/", ["Economics", "Education", "Data Science"]),
    ("nara-womens-university", "奈良女子大学", "奈良女子大学", "Nara Women's University", "university", "nara", "nara", "https://www.nara-wu.ac.jp/", ["Humanities", "Science"]),
    ("wakayama-university", "和歌山大学", "和歌山大学", "Wakayama University", "university", "wakayama", "wakayama", "https://www.wakayama-u.ac.jp/", ["Tourism", "Systems Engineering", "Education"]),
    ("ehime-university", "爱媛大学", "愛媛大学", "Ehime University", "university", "ehime", "matsuyama", "https://www.ehime-u.ac.jp/", ["Medicine", "Agriculture", "Engineering"]),
    ("kagawa-university", "香川大学", "香川大学", "Kagawa University", "university", "kagawa", "takamatsu", "https://www.kagawa-u.ac.jp/", ["Medicine", "Engineering", "Economics"]),
    ("tokushima-university", "德岛大学", "徳島大学", "Tokushima University", "university", "tokushima", "tokushima", "https://www.tokushima-u.ac.jp/", ["Medicine", "Science", "Engineering"]),
    ("kochi-university", "高知大学", "高知大学", "Kochi University", "university", "kochi", "kochi", "https://www.kochi-u.ac.jp/", ["Humanities", "Agriculture", "Medicine"]),
    ("yamaguchi-university", "山口大学", "山口大学", "Yamaguchi University", "university", "yamaguchi", "yamaguchi", "https://www.yamaguchi-u.ac.jp/", ["Engineering", "Medicine", "Humanities"]),
    ("saga-university", "佐贺大学", "佐賀大学", "Saga University", "university", "saga", "saga", "https://www.saga-u.ac.jp/", ["Medicine", "Science", "Engineering"]),
    ("oita-university", "大分大学", "大分大学", "Oita University", "university", "oita", "oita", "https://www.oita-u.ac.jp/", ["Medicine", "Economics", "Education"]),
    ("miyazaki-university", "宫崎大学", "宮崎大学", "University of Miyazaki", "university", "miyazaki", "miyazaki", "https://www.miyazaki-u.ac.jp/", ["Medicine", "Agriculture", "Engineering"]),
    ("kagoshima-university", "鹿儿岛大学", "鹿児島大学", "Kagoshima University", "university", "kagoshima", "kagoshima", "https://www.kagoshima-u.ac.jp/", ["Medicine", "Agriculture", "Engineering"]),
    ("university-of-the-ryukyus", "琉球大学", "琉球大学", "University of the Ryukyus", "university", "okinawa", "nishihara", "https://www.u-ryukyu.ac.jp/", ["Medicine", "Engineering", "Tourism"]),
    ("ritsumeikan-university", "立命馆大学", "立命館大学", "Ritsumeikan University", "university", "kyoto", "kyoto", "https://www.ritsumei.ac.jp/", ["International Relations", "Policy Science", "Science"]),
    ("doshisha-university", "同志社大学", "同志社大学", "Doshisha University", "university", "kyoto", "kyoto", "https://www.doshisha.ac.jp/", ["Business", "Law", "Humanities"]),
    ("kansai-university", "关西大学", "関西大学", "Kansai University", "university", "osaka", "suita", "https://www.kansai-u.ac.jp/", ["Law", "Business", "Engineering"]),
    ("kwansei-gakuin-university", "关西学院大学", "関西学院大学", "Kwansei Gakuin University", "university", "hyogo", "nishinomiya", "https://www.kwansei.ac.jp/", ["International Studies", "Economics", "Business"]),
    ("meiji-university", "明治大学", "明治大学", "Meiji University", "university", "tokyo", "tokyo", "https://www.meiji.ac.jp/", ["Law", "Commerce", "Science"]),
    ("aoyama-gakuin-university", "青山学院大学", "青山学院大学", "Aoyama Gakuin University", "university", "tokyo", "tokyo", "https://www.aoyama.ac.jp/", ["Business", "International Politics", "Humanities"]),
    ("rikkyo-university", "立教大学", "立教大学", "Rikkyo University", "university", "tokyo", "tokyo", "https://www.rikkyo.ac.jp/", ["Business", "Tourism", "Humanities"]),
    ("chuo-university", "中央大学", "中央大学", "Chuo University", "university", "tokyo", "hachioji", "https://www.chuo-u.ac.jp/", ["Law", "Commerce", "Science"]),
    ("hosei-university", "法政大学", "法政大学", "Hosei University", "university", "tokyo", "tokyo", "https://www.hosei.ac.jp/", ["Global Studies", "Economics", "Design Engineering"]),
    ("sophia-university", "上智大学", "上智大学", "Sophia University", "university", "tokyo", "tokyo", "https://www.sophia.ac.jp/", ["Liberal Arts", "Global Studies", "Science"]),
    ("tokyo-university-of-science", "东京理科大学", "東京理科大学", "Tokyo University of Science", "university", "tokyo", "tokyo", "https://www.tus.ac.jp/", ["Science", "Engineering", "Pharmacy"]),
    ("nihon-university", "日本大学", "日本大学", "Nihon University", "university", "tokyo", "tokyo", "https://www.nihon-u.ac.jp/", ["Law", "Engineering", "Medicine"]),
    ("toyo-university", "东洋大学", "東洋大学", "Toyo University", "university", "tokyo", "tokyo", "https://www.toyo.ac.jp/", ["Global and Regional Studies", "Economics", "Sociology"]),
    ("komazawa-university", "驹泽大学", "駒澤大学", "Komazawa University", "university", "tokyo", "tokyo", "https://www.komazawa-u.ac.jp/", ["Buddhist Studies", "Law", "Economics"]),
    ("senshu-university", "专修大学", "専修大学", "Senshu University", "university", "tokyo", "tokyo", "https://www.senshu-u.ac.jp/", ["Economics", "Law", "Business"]),
    ("gakushuin-university", "学习院大学", "学習院大学", "Gakushuin University", "university", "tokyo", "tokyo", "https://www.univ.gakushuin.ac.jp/", ["Law", "Economics", "Letters"]),
    ("seikei-university", "成蹊大学", "成蹊大学", "Seikei University", "university", "tokyo", "musashino", "https://www.seikei.ac.jp/university/", ["Economics", "Law", "Science"]),
    ("seijo-university", "成城大学", "成城大学", "Seijo University", "university", "tokyo", "tokyo", "https://www.seijo.ac.jp/", ["Economics", "Law", "Arts"]),
    ("musashi-university", "武藏大学", "武蔵大学", "Musashi University", "university", "tokyo", "tokyo", "https://www.musashi.ac.jp/", ["Economics", "Humanities", "Sociology"]),
    ("tokyo-denki-university", "东京电机大学", "東京電機大学", "Tokyo Denki University", "university", "tokyo", "tokyo", "https://www.dendai.ac.jp/", ["Engineering", "Science"]),
    ("tokyo-city-university", "东京都市大学", "東京都市大学", "Tokyo City University", "university", "tokyo", "tokyo", "https://www.tcu.ac.jp/", ["Engineering", "Urban Life", "Environment"]),
    ("shibaura-institute-of-technology", "芝浦工业大学", "芝浦工業大学", "Shibaura Institute of Technology", "university", "tokyo", "tokyo", "https://www.shibaura-it.ac.jp/", ["Engineering", "Design"]),
    ("kogakuin-university", "工学院大学", "工学院大学", "Kogakuin University", "university", "tokyo", "tokyo", "https://www.kogakuin.ac.jp/", ["Engineering", "Architecture"]),
    ("kindai-university", "近畿大学", "近畿大学", "Kindai University", "university", "osaka", "higashiosaka", "https://www.kindai.ac.jp/", ["Science", "Medicine", "Agriculture"]),
    ("ryukoku-university", "龙谷大学", "龍谷大学", "Ryukoku University", "university", "kyoto", "kyoto", "https://www.ryukoku.ac.jp/", ["Humanities", "Economics", "Agriculture"]),
    ("kyoto-sangyo-university", "京都产业大学", "京都産業大学", "Kyoto Sangyo University", "university", "kyoto", "kyoto", "https://www.kyoto-su.ac.jp/", ["Economics", "Business", "Science"]),
    ("konan-university", "甲南大学", "甲南大学", "Konan University", "university", "hyogo", "kobe", "https://www.konan-u.ac.jp/", ["Science", "Economics", "Letters"]),
    ("fukuoka-university", "福冈大学", "福岡大学", "Fukuoka University", "university", "fukuoka", "fukuoka", "https://www.fukuoka-u.ac.jp/", ["Medicine", "Engineering", "Commerce"]),
    ("asia-university", "亚细亚大学", "亜細亜大学", "Asia University", "university", "tokyo", "musashino", "https://www.asia-u.ac.jp/", ["Business", "International Relations"]),
    ("takushoku-university", "拓殖大学", "拓殖大学", "Takushoku University", "university", "tokyo", "tokyo", "https://www.takushoku-u.ac.jp/", ["International Studies", "Commerce"]),
    ("kokushikan-university", "国士馆大学", "国士舘大学", "Kokushikan University", "university", "tokyo", "tokyo", "https://www.kokushikan.ac.jp/", ["Law", "Sports", "Asia Studies"]),
    ("teikyo-university", "帝京大学", "帝京大学", "Teikyo University", "university", "tokyo", "hachioji", "https://www.teikyo-u.ac.jp/", ["Medicine", "Economics", "Education"]),
]:
    _append_guide_school_seed(*_school)


for _school in [
    ("tokyo-mode-gakuen", "东京 Mode 学园", "東京モード学園", "Tokyo Mode Gakuen", "vocational_school", "tokyo", "tokyo", "https://www.mode.ac.jp/tokyo", ["Fashion", "Design"]),
    ("osaka-mode-gakuen", "大阪 Mode 学园", "大阪モード学園", "Osaka Mode Gakuen", "vocational_school", "osaka", "osaka", "https://www.mode.ac.jp/osaka", ["Fashion", "Design"]),
    ("nagoya-mode-gakuen", "名古屋 Mode 学园", "名古屋モード学園", "Nagoya Mode Gakuen", "vocational_school", "aichi", "nagoya", "https://www.mode.ac.jp/nagoya", ["Fashion", "Design"]),
    ("tokyo-communication-arts", "东京交流艺术专门学校", "東京コミュニケーションアート専門学校", "Tokyo Communication Arts College", "vocational_school", "tokyo", "tokyo", "https://www.tca.ac.jp/", ["Design", "Game", "Animal"]),
    ("tokyo-visual-arts", "东京视觉艺术专门学校", "専門学校東京ビジュアルアーツ", "Tokyo Visual Arts", "vocational_school", "tokyo", "tokyo", "https://www.tva.ac.jp/", ["Photography", "Film", "Music"]),
    ("tokyo-designer-gakuin", "东京设计师学院", "専門学校東京デザイナー学院", "Tokyo Designer Gakuin College", "vocational_school", "tokyo", "tokyo", "https://www.tdg.ac.jp/", ["Design", "Illustration", "Interior"]),
    ("tokyo-school-of-business", "东京商务专门学校", "東京スクールオブビジネス", "Tokyo School of Business", "vocational_school", "tokyo", "tokyo", "https://www.tsb-yyg.ac.jp/", ["Business", "IT", "Pet"]),
    ("tokyo-tourism-college", "东京观光专门学校", "東京観光専門学校", "Tokyo Institute of Tourism", "vocational_school", "tokyo", "tokyo", "https://www.tit.ac.jp/", ["Tourism", "Hotel", "Airline"]),
    ("osaka-eco-college", "大阪 ECO 动物海洋专门学校", "大阪ECO動物海洋専門学校", "Osaka ECO College", "vocational_school", "osaka", "osaka", "https://www.osaka-eco.ac.jp/", ["Animal", "Marine"]),
    ("kyoto-computer-gakuin", "京都计算机学院", "京都コンピュータ学院", "Kyoto Computer Gakuin", "vocational_school", "kyoto", "kyoto", "https://www.kcg.ac.jp/", ["IT", "Game", "Design"]),
    ("tokyo-kosen", "东京工业高等专门学校", "東京工業高等専門学校", "National Institute of Technology, Tokyo College", "college_of_technology", "tokyo", "hachioji", "https://www.tokyo-ct.ac.jp/", ["Engineering"]),
    ("osaka-kosen", "大阪公立大学工业高等专门学校", "大阪公立大学工業高等専門学校", "Osaka Metropolitan University College of Technology", "college_of_technology", "osaka", "neyagawa", "https://www.ct.omu.ac.jp/", ["Engineering"]),
    ("kobe-kosen", "神户市立工业高等专门学校", "神戸市立工業高等専門学校", "Kobe City College of Technology", "college_of_technology", "hyogo", "kobe", "https://www.kobe-kosen.ac.jp/", ["Engineering"]),
    ("nara-kosen", "奈良工业高等专门学校", "奈良工業高等専門学校", "National Institute of Technology, Nara College", "college_of_technology", "nara", "yamatokoriyama", "https://www.nara-k.ac.jp/", ["Engineering"]),
]:
    _append_guide_school_seed(*_school)


for _school in [
    ("arc-academy", "ARC 日本语学校", "ARC日本語学校", "ARC Academy Japanese Language School", "language_school", "tokyo", "tokyo", "https://www.arc.ac.jp/", ["Language"]),
    ("akamonkai-japanese-language-school", "赤门会日本语学校", "赤門会日本語学校", "Akamonkai Japanese Language School", "language_school", "tokyo", "tokyo", "https://www.akamonkai.ac.jp/", ["Language"]),
    ("yoshida-institute", "吉田日本语学院", "吉田日本語学院", "Yoshida Institute of Japanese Language", "language_school", "tokyo", "tokyo", "https://www.yoshida-institute.co.jp/", ["Language"]),
    ("shinjuku-japanese-language-institute", "新宿日本语学校", "新宿日本語学校", "Shinjuku Japanese Language Institute", "language_school", "tokyo", "tokyo", "https://www.sng.ac.jp/", ["Language"]),
    ("tokyo-central-japanese-language-school", "东京中央日本语学院", "東京中央日本語学院", "Tokyo Central Japanese Language School", "language_school", "tokyo", "tokyo", "https://tcj-education.com/", ["Language"]),
    ("kudan-institute", "九段日本文化研究所日本语学院", "九段日本文化研究所日本語学院", "Kudan Institute of Japanese Language and Culture", "language_school", "tokyo", "tokyo", "https://www.kudan-japanese-school.com/", ["Language"]),
    ("japanese-language-school-meiji-academy", "明治学院日本语学校", "明治アカデミー日本語学校", "Meiji Academy Japanese Language School", "language_school", "fukuoka", "fukuoka", "https://www.meijiacademy.com/", ["Language"]),
    ("kyoto-minsai-japanese-language-school", "京都民际日本语学校", "京都民際日本語学校", "Kyoto Minsai Japanese Language School", "language_school", "kyoto", "kyoto", "https://www.kyotominsai.co.jp/", ["Language"]),
    ("osaka-japanese-language-education-center", "大阪日本语教育中心", "大阪日本語教育センター", "Osaka Japanese Language Education Center", "language_school", "osaka", "osaka", "https://www.jasso.go.jp/ryugaku/jlec/ojlec/", ["Language"]),
    ("tokyo-japanese-language-education-center", "东京日本语教育中心", "東京日本語教育センター", "Tokyo Japanese Language Education Center", "language_school", "tokyo", "tokyo", "https://www.jasso.go.jp/ryugaku/jlec/tjlec/", ["Language"]),
]:
    _append_guide_school_seed(*_school)


def _append_guide_company_seed(slug: str, name: str, name_jp: str, name_en: str, industry: str,
                               prefecture: str, city: str, website: str, career_url: str = "",
                               size: str = "enterprise", featured: int = 0, tags: list[str] | None = None) -> None:
    tag_list = [t for t in (tags or []) if t]
    tag_norm = {t.lower() for t in tag_list}
    global_hint = any(t in tag_norm for t in {"foreign", "global", "english-friendly"}) or "english-friendly" in tag_norm
    english_hint = "english-friendly" in tag_norm or "foreign" in tag_norm
    employment_types = ["new_graduate", "mid_career"]
    if any(t in tag_norm for t in {"it", "ai", "saas", "fintech", "hrtech", "data"}):
        employment_types.append("engineer")
    payload = {
        "slug": slug,
        "name": name,
        "name_jp": name_jp,
        "name_en": name_en,
        "industry": industry,
        "prefecture": prefecture,
        "city": city,
        "website": website,
        "career_url": career_url or website,
        "company_size": size,
        "source_type": "company_website",
        "source_name": name_en or name_jp or name,
        "source_url": career_url or website,
        "verification_status": "needs_review",
        "is_featured": featured,
        "tags": tag_list,
        "short_description": f"{name} 的公开公司档案，收录行业、地区、官网与招聘入口，适合外国人求职者做初筛。",
        "description": (
            f"{name}（{name_jp or name_en}）属于 {industry} 行业，主要地区为 {prefecture}/{city}。"
            "Machi 仅整理公开基础信息、招聘入口和求职者关注标签；岗位、签证支持、语言要求和制度请以公司招聘页面为准。"
        ),
        "is_foreigner_friendly": 1 if global_hint else -1,
        "accepts_foreign_applicants": 1 if global_hint else -1,
        "has_english_positions": 1 if english_hint else -1,
        "has_global_roles": 1 if global_hint else -1,
        "has_foreign_employees": 1 if global_hint else -1,
        "supports_new_graduate": 1,
        "supports_mid_career": 1,
        "japanese_level_required": "按岗位确认",
        "english_level_required": "按岗位确认",
        "employment_types": employment_types,
    }
    existing = next((c for c in GUIDE_COMPANY_SEED if c["slug"] == slug), None)
    if existing:
        merged_tags = sorted({*existing.get("tags", []), *tag_list})
        merged_employment = sorted({*existing.get("employment_types", []), *employment_types})
        for key, value in payload.items():
            if value not in ("", [], None):
                existing[key] = value
        existing["tags"] = merged_tags
        existing["employment_types"] = merged_employment
        existing["is_featured"] = max(int(existing.get("is_featured", 0)), int(featured))
        return
    GUIDE_COMPANY_SEED.append(payload)


for _company in [
    ("cyberagent", "CyberAgent", "株式会社サイバーエージェント", "CyberAgent, Inc.", "it_internet", "tokyo", "tokyo", "https://www.cyberagent.co.jp/", "https://www.cyberagent.co.jp/careers/", "large", 1, ["IT", "internet"]),
    ("dena", "DeNA", "株式会社ディー・エヌ・エー", "DeNA Co., Ltd.", "it_internet", "tokyo", "tokyo", "https://dena.com/", "https://dena.com/jp/recruit/", "large", 1, ["IT", "game"]),
    ("gmo-internet-group", "GMO Internet Group", "GMOインターネットグループ株式会社", "GMO Internet Group, Inc.", "it_internet", "tokyo", "tokyo", "https://www.gmo.co.jp/", "https://www.gmo.co.jp/recruit/", "enterprise", 0, ["IT"]),
    ("nec", "NEC", "日本電気株式会社", "NEC Corporation", "it_internet", "tokyo", "tokyo", "https://jpn.nec.com/", "https://jpn.nec.com/recruit/", "enterprise", 1, ["IT", "electronics"]),
    ("smartnews", "SmartNews", "スマートニュース株式会社", "SmartNews, Inc.", "it_internet", "tokyo", "tokyo", "https://www.smartnews.com/", "https://careers.smartnews.com/", "large", 0, ["IT"]),
    ("preferred-networks", "Preferred Networks", "株式会社Preferred Networks", "Preferred Networks, Inc.", "ai_data", "tokyo", "tokyo", "https://www.preferred.jp/", "https://www.preferred.jp/ja/careers/", "large", 1, ["AI"]),
    ("sansan", "Sansan", "Sansan株式会社", "Sansan, Inc.", "software", "tokyo", "tokyo", "https://jp.corp-sansan.com/", "https://jp.corp-sansan.com/recruit/", "large", 0, ["SaaS"]),
    ("freee", "freee", "フリー株式会社", "freee K.K.", "software", "tokyo", "tokyo", "https://corp.freee.co.jp/", "https://jobs.freee.co.jp/", "large", 0, ["SaaS"]),
    ("money-forward", "Money Forward", "株式会社マネーフォワード", "Money Forward, Inc.", "software", "tokyo", "tokyo", "https://corp.moneyforward.com/", "https://corp.moneyforward.com/recruit/", "large", 0, ["FinTech"]),
    ("cybozu", "Cybozu", "サイボウズ株式会社", "Cybozu, Inc.", "software", "tokyo", "tokyo", "https://cybozu.co.jp/", "https://cybozu.co.jp/recruit/", "large", 0, ["SaaS"]),
    ("mixi", "MIXI", "株式会社MIXI", "MIXI, Inc.", "it_internet", "tokyo", "tokyo", "https://mixi.co.jp/", "https://mixi.co.jp/recruit/", "large", 0, ["IT", "game"]),
    ("gree", "GREE", "グリー株式会社", "GREE, Inc.", "game_entertainment", "tokyo", "tokyo", "https://corp.gree.net/", "https://corp.gree.net/jp/ja/recruit/", "large", 0, ["game"]),
    ("paypay", "PayPay", "PayPay株式会社", "PayPay Corporation", "finance", "tokyo", "tokyo", "https://www.paypay-corp.co.jp/", "https://www.paypay-corp.co.jp/careers/", "large", 1, ["FinTech"]),
    ("ubie", "Ubie", "Ubie株式会社", "Ubie, Inc.", "healthcare", "tokyo", "tokyo", "https://ubie.life/", "https://recruit.ubie.life/", "medium", 0, ["healthcare", "AI"]),
    ("layerx", "LayerX", "株式会社LayerX", "LayerX Inc.", "software", "tokyo", "tokyo", "https://layerx.co.jp/", "https://jobs.layerx.co.jp/", "medium", 0, ["SaaS"]),
    ("pksha-technology", "PKSHA Technology", "株式会社PKSHA Technology", "PKSHA Technology Inc.", "ai_data", "tokyo", "tokyo", "https://www.pkshatech.com/", "https://www.pkshatech.com/recruit/", "large", 0, ["AI"]),
    ("abeja", "ABEJA", "株式会社ABEJA", "ABEJA, Inc.", "ai_data", "tokyo", "tokyo", "https://www.abejainc.com/", "https://www.abejainc.com/recruit/", "medium", 0, ["AI"]),
    ("hennge", "HENNGE", "HENNGE株式会社", "HENNGE K.K.", "software", "tokyo", "tokyo", "https://hennge.com/", "https://hennge.com/jp/careers/", "large", 0, ["SaaS"]),
    ("treasure-data", "Treasure Data", "トレジャーデータ株式会社", "Treasure Data K.K.", "ai_data", "tokyo", "tokyo", "https://www.treasuredata.com/jp/", "https://www.treasuredata.com/careers/", "large", 0, ["data"]),
    ("plaid", "Plaid", "株式会社プレイド", "PLAID, Inc.", "software", "tokyo", "tokyo", "https://plaid.co.jp/", "https://plaid.co.jp/recruit/", "large", 0, ["SaaS"]),
    ("visional", "Visional", "ビジョナル株式会社", "Visional, Inc.", "it_internet", "tokyo", "tokyo", "https://www.visional.inc/", "https://www.visional.inc/ja/careers/", "large", 0, ["HRTech"]),
    ("lancers", "Lancers", "ランサーズ株式会社", "Lancers, Inc.", "it_internet", "tokyo", "tokyo", "https://www.lancers.co.jp/", "https://www.lancers.co.jp/recruit/", "medium", 0, ["platform"]),
    ("crowdworks", "CrowdWorks", "株式会社クラウドワークス", "CrowdWorks Inc.", "it_internet", "tokyo", "tokyo", "https://crowdworks.co.jp/", "https://crowdworks.co.jp/careers/", "medium", 0, ["platform"]),
    ("kakaku-com", "Kakaku.com", "株式会社カカクコム", "Kakaku.com, Inc.", "it_internet", "tokyo", "tokyo", "https://corporate.kakaku.com/", "https://corporate.kakaku.com/recruit/", "large", 0, ["IT"]),
    ("dmm-com", "DMM.com", "合同会社DMM.com", "DMM.com LLC", "it_internet", "tokyo", "tokyo", "https://dmm-corp.com/", "https://dmm-corp.com/recruit/", "large", 0, ["IT"]),
    ("dwango", "Dwango", "株式会社ドワンゴ", "Dwango Co., Ltd.", "media_advertising", "tokyo", "tokyo", "https://dwango.co.jp/", "https://dwango.co.jp/recruit/", "large", 0, ["media"]),
    ("cygames", "Cygames", "株式会社Cygames", "Cygames, Inc.", "game_entertainment", "tokyo", "tokyo", "https://www.cygames.co.jp/", "https://www.cygames.co.jp/recruit/", "large", 0, ["game"]),
    ("square-enix", "Square Enix", "株式会社スクウェア・エニックス", "Square Enix Co., Ltd.", "game_entertainment", "tokyo", "tokyo", "https://www.jp.square-enix.com/", "https://www.jp.square-enix.com/recruit/", "enterprise", 0, ["game"]),
    ("bandai-namco", "Bandai Namco", "株式会社バンダイナムコホールディングス", "Bandai Namco Holdings Inc.", "game_entertainment", "tokyo", "tokyo", "https://www.bandainamco.co.jp/", "https://www.bandainamco.co.jp/recruit/", "enterprise", 0, ["game"]),
    ("konami", "Konami", "コナミグループ株式会社", "Konami Group Corporation", "game_entertainment", "tokyo", "tokyo", "https://www.konami.com/", "https://www.konami.com/jobs/ja/jk/", "enterprise", 0, ["game"]),
    ("capcom", "Capcom", "株式会社カプコン", "Capcom Co., Ltd.", "game_entertainment", "osaka", "osaka", "https://www.capcom.co.jp/", "https://www.capcom-games.com/recruit/", "enterprise", 0, ["game", "kansai"]),
    ("sega", "SEGA", "株式会社セガ", "SEGA Corporation", "game_entertainment", "tokyo", "tokyo", "https://www.sega.co.jp/", "https://www.sega.co.jp/recruit/", "enterprise", 0, ["game"]),
    ("nintendo", "Nintendo", "任天堂株式会社", "Nintendo Co., Ltd.", "game_entertainment", "kyoto", "kyoto", "https://www.nintendo.co.jp/", "https://www.nintendo.co.jp/jobs/", "enterprise", 1, ["game", "kansai"]),
    ("honda", "Honda", "本田技研工業株式会社", "Honda Motor Co., Ltd.", "automotive", "tokyo", "tokyo", "https://global.honda/", "https://global.honda/jp/careers/", "enterprise", 1, ["automotive"]),
    ("nissan", "Nissan", "日産自動車株式会社", "Nissan Motor Co., Ltd.", "automotive", "kanagawa", "yokohama", "https://www.nissan-global.com/", "https://www.nissanmotor.jobs/", "enterprise", 0, ["automotive"]),
    ("mazda", "Mazda", "マツダ株式会社", "Mazda Motor Corporation", "automotive", "hiroshima", "fuchu", "https://www.mazda.com/", "https://www.mazda.com/ja/careers/", "enterprise", 0, ["automotive"]),
    ("subaru", "Subaru", "株式会社SUBARU", "Subaru Corporation", "automotive", "tokyo", "tokyo", "https://www.subaru.co.jp/", "https://www.subaru.co.jp/jinji/", "enterprise", 0, ["automotive"]),
    ("suzuki", "Suzuki", "スズキ株式会社", "Suzuki Motor Corporation", "automotive", "shizuoka", "hamamatsu", "https://www.suzuki.co.jp/", "https://www.suzuki.co.jp/recruit/", "enterprise", 0, ["automotive"]),
    ("panasonic", "Panasonic", "パナソニックホールディングス株式会社", "Panasonic Holdings Corporation", "electronics", "osaka", "kadoma", "https://holdings.panasonic/", "https://recruit.jpn.panasonic.com/", "enterprise", 1, ["electronics", "kansai"]),
    ("hitachi", "Hitachi", "株式会社日立製作所", "Hitachi, Ltd.", "electronics", "tokyo", "tokyo", "https://www.hitachi.co.jp/", "https://www.hitachi.co.jp/recruit/", "enterprise", 1, ["electronics"]),
    ("mitsubishi-electric", "Mitsubishi Electric", "三菱電機株式会社", "Mitsubishi Electric Corporation", "electronics", "tokyo", "tokyo", "https://www.mitsubishielectric.co.jp/", "https://www.mitsubishielectric.co.jp/saiyo/", "enterprise", 0, ["electronics"]),
    ("canon", "Canon", "キヤノン株式会社", "Canon Inc.", "electronics", "tokyo", "tokyo", "https://global.canon/", "https://global.canon/ja/careers/", "enterprise", 0, ["electronics"]),
    ("keyence", "Keyence", "株式会社キーエンス", "Keyence Corporation", "electronics", "osaka", "osaka", "https://www.keyence.co.jp/", "https://www.keyence.co.jp/jobs/", "enterprise", 1, ["kansai", "electronics"]),
    ("murata", "Murata Manufacturing", "株式会社村田製作所", "Murata Manufacturing Co., Ltd.", "electronics", "kyoto", "nagaokakyo", "https://www.murata.com/", "https://recruit.murata.com/", "enterprise", 1, ["kansai", "electronics"]),
    ("kyocera", "Kyocera", "京セラ株式会社", "Kyocera Corporation", "electronics", "kyoto", "kyoto", "https://www.kyocera.co.jp/", "https://www.kyocera.co.jp/recruit/", "enterprise", 1, ["kansai", "electronics"]),
    ("omron", "Omron", "オムロン株式会社", "Omron Corporation", "electronics", "kyoto", "kyoto", "https://www.omron.com/jp/ja/", "https://www.omron.com/jp/ja/careers/", "enterprise", 1, ["kansai", "electronics"]),
    ("renesas", "Renesas", "ルネサスエレクトロニクス株式会社", "Renesas Electronics Corporation", "electronics", "tokyo", "tokyo", "https://www.renesas.com/", "https://www.renesas.com/jp/ja/about/careers", "enterprise", 0, ["semiconductor"]),
    ("daikin", "Daikin", "ダイキン工業株式会社", "Daikin Industries, Ltd.", "manufacturing", "osaka", "osaka", "https://www.daikin.co.jp/", "https://www.daikin.co.jp/recruit/", "enterprise", 1, ["kansai", "manufacturing"]),
    ("denso", "Denso", "株式会社デンソー", "DENSO Corporation", "automotive", "aichi", "kariya", "https://www.denso.com/jp/ja/", "https://www.denso.com/jp/ja/careers/", "enterprise", 0, ["automotive"]),
    ("bridgestone", "Bridgestone", "株式会社ブリヂストン", "Bridgestone Corporation", "manufacturing", "tokyo", "tokyo", "https://www.bridgestone.co.jp/", "https://www.bridgestone.co.jp/saiyo/", "enterprise", 0, ["manufacturing"]),
    ("tokyo-electron", "Tokyo Electron", "東京エレクトロン株式会社", "Tokyo Electron Limited", "electronics", "tokyo", "tokyo", "https://www.tel.co.jp/", "https://www.tel.co.jp/careers/", "enterprise", 1, ["semiconductor"]),
    ("disco", "DISCO", "株式会社ディスコ", "DISCO Corporation", "electronics", "tokyo", "tokyo", "https://www.disco.co.jp/", "https://www.disco.co.jp/recruit/", "enterprise", 0, ["semiconductor"]),
    ("softbank", "SoftBank", "ソフトバンク株式会社", "SoftBank Corp.", "telecom", "tokyo", "tokyo", "https://www.softbank.jp/corp/", "https://www.softbank.jp/recruit/", "enterprise", 1, ["telecom"]),
    ("ntt-docomo", "NTT DOCOMO", "株式会社NTTドコモ", "NTT DOCOMO, INC.", "telecom", "tokyo", "tokyo", "https://www.docomo.ne.jp/corporate/", "https://information.nttdocomo-fresh.jp/", "enterprise", 1, ["telecom"]),
    ("kddi", "KDDI", "KDDI株式会社", "KDDI Corporation", "telecom", "tokyo", "tokyo", "https://www.kddi.com/", "https://career.kddi.com/", "enterprise", 1, ["telecom"]),
    ("mufg", "MUFG", "株式会社三菱UFJフィナンシャル・グループ", "Mitsubishi UFJ Financial Group, Inc.", "banking", "tokyo", "tokyo", "https://www.mufg.jp/", "https://www.mufg.jp/careers/", "enterprise", 1, ["finance"]),
    ("smbc", "SMBC", "株式会社三井住友フィナンシャルグループ", "Sumitomo Mitsui Financial Group, Inc.", "banking", "tokyo", "tokyo", "https://www.smfg.co.jp/", "https://www.smbc.co.jp/saiyo/", "enterprise", 1, ["finance"]),
    ("mizuho", "Mizuho", "株式会社みずほフィナンシャルグループ", "Mizuho Financial Group, Inc.", "banking", "tokyo", "tokyo", "https://www.mizuho-fg.co.jp/", "https://www.mizuho-fg.co.jp/saiyou/", "enterprise", 1, ["finance"]),
    ("nomura", "Nomura", "野村ホールディングス株式会社", "Nomura Holdings, Inc.", "securities", "tokyo", "tokyo", "https://www.nomuraholdings.com/", "https://www.nomura-recruit.jp/", "enterprise", 0, ["finance"]),
    ("daiwa-securities", "Daiwa Securities", "大和証券グループ本社", "Daiwa Securities Group Inc.", "securities", "tokyo", "tokyo", "https://www.daiwa-grp.jp/", "https://www.daiwa-grp-recruit.jp/", "enterprise", 0, ["finance"]),
    ("seven-and-i", "Seven & i Holdings", "株式会社セブン＆アイ・ホールディングス", "Seven & i Holdings Co., Ltd.", "retail", "tokyo", "tokyo", "https://www.7andi.com/", "https://www.7andi.com/recruit/", "enterprise", 0, ["retail"]),
    ("aeon", "Aeon", "イオン株式会社", "AEON Co., Ltd.", "retail", "chiba", "chiba", "https://www.aeon.info/", "https://www.aeon.info/recruit/", "enterprise", 0, ["retail"]),
    ("japan-airlines", "Japan Airlines", "日本航空株式会社", "Japan Airlines Co., Ltd.", "aviation", "tokyo", "tokyo", "https://www.jal.com/", "https://www.job-jal.com/", "enterprise", 0, ["aviation"]),
    ("ana", "ANA", "ANAホールディングス株式会社", "ANA Holdings Inc.", "aviation", "tokyo", "tokyo", "https://www.ana.co.jp/group/", "https://www.ana.co.jp/group/recruit/", "enterprise", 0, ["aviation"]),
    ("jr-east", "JR East", "東日本旅客鉄道株式会社", "East Japan Railway Company", "transportation", "tokyo", "tokyo", "https://www.jreast.co.jp/", "https://www.jreast.co.jp/recruit/", "enterprise", 0, ["railway"]),
    ("jr-west", "JR West", "西日本旅客鉄道株式会社", "West Japan Railway Company", "transportation", "osaka", "osaka", "https://www.westjr.co.jp/", "https://www.westjr.co.jp/company/recruit/", "enterprise", 0, ["railway", "kansai"]),
    ("tokyo-metro-company", "Tokyo Metro", "東京地下鉄株式会社", "Tokyo Metro Co., Ltd.", "transportation", "tokyo", "tokyo", "https://www.tokyometro.jp/", "https://www.tokyometro.jp/corporate/recruit/", "enterprise", 0, ["railway"]),
    ("yamato-transport", "Yamato Transport", "ヤマト運輸株式会社", "Yamato Transport Co., Ltd.", "logistics", "tokyo", "tokyo", "https://www.kuronekoyamato.co.jp/", "https://www.kuronekoyamato.co.jp/ytc/recruit/", "enterprise", 0, ["logistics"]),
    ("dentsu", "Dentsu", "株式会社電通グループ", "Dentsu Group Inc.", "media_advertising", "tokyo", "tokyo", "https://www.group.dentsu.com/", "https://www.dentsu.co.jp/recruit/", "enterprise", 0, ["advertising"]),
    ("hakuhodo", "Hakuhodo", "株式会社博報堂", "Hakuhodo Inc.", "media_advertising", "tokyo", "tokyo", "https://www.hakuhodo.co.jp/", "https://www.hakuhodo.co.jp/recruit/", "enterprise", 0, ["advertising"]),
    ("mitsubishi-corporation", "Mitsubishi Corporation", "三菱商事株式会社", "Mitsubishi Corporation", "trading", "tokyo", "tokyo", "https://www.mitsubishicorp.com/", "https://www.mitsubishicorp.com/jp/ja/recruit/", "enterprise", 1, ["trading"]),
    ("mitsui-and-co", "Mitsui & Co.", "三井物産株式会社", "Mitsui & Co., Ltd.", "trading", "tokyo", "tokyo", "https://www.mitsui.com/", "https://www.mitsui.com/jp/ja/recruit/", "enterprise", 0, ["trading"]),
    ("itochu", "ITOCHU", "伊藤忠商事株式会社", "ITOCHU Corporation", "trading", "tokyo", "tokyo", "https://www.itochu.co.jp/", "https://career.itochu.co.jp/", "enterprise", 0, ["trading"]),
    ("sumitomo-corporation", "Sumitomo Corporation", "住友商事株式会社", "Sumitomo Corporation", "trading", "tokyo", "tokyo", "https://www.sumitomocorp.com/", "https://www.sumitomocorp.com/ja/jp/careers", "enterprise", 0, ["trading"]),
    ("marubeni", "Marubeni", "丸紅株式会社", "Marubeni Corporation", "trading", "tokyo", "tokyo", "https://www.marubeni.com/", "https://www.marubeni-recruit.com/", "enterprise", 0, ["trading"]),
    ("amazon-japan", "Amazon Japan", "アマゾンジャパン合同会社", "Amazon Japan", "it_internet", "tokyo", "tokyo", "https://www.amazon.co.jp/", "https://www.amazon.jobs/", "enterprise", 1, ["foreign", "global"]),
    ("google-japan", "Google Japan", "グーグル合同会社", "Google Japan", "it_internet", "tokyo", "tokyo", "https://about.google/intl/ja/", "https://careers.google.com/", "enterprise", 1, ["foreign", "global"]),
    ("microsoft-japan", "Microsoft Japan", "日本マイクロソフト株式会社", "Microsoft Japan", "software", "tokyo", "tokyo", "https://www.microsoft.com/ja-jp/", "https://careers.microsoft.com/", "enterprise", 1, ["foreign", "global"]),
    ("apple-japan", "Apple Japan", "Apple Japan合同会社", "Apple Japan", "electronics", "tokyo", "tokyo", "https://www.apple.com/jp/", "https://www.apple.com/careers/jp/", "enterprise", 1, ["foreign", "global"]),
    ("oracle-japan", "Oracle Japan", "日本オラクル株式会社", "Oracle Japan Corporation", "software", "tokyo", "tokyo", "https://www.oracle.com/jp/", "https://www.oracle.com/careers/", "enterprise", 0, ["foreign"]),
    ("salesforce-japan", "Salesforce Japan", "株式会社セールスフォース・ジャパン", "Salesforce Japan", "software", "tokyo", "tokyo", "https://www.salesforce.com/jp/", "https://careers.salesforce.com/", "enterprise", 1, ["foreign", "SaaS"]),
    ("sap-japan", "SAP Japan", "SAPジャパン株式会社", "SAP Japan Co., Ltd.", "software", "tokyo", "tokyo", "https://www.sap.com/japan/", "https://jobs.sap.com/", "enterprise", 0, ["foreign"]),
    ("ibm-japan", "IBM Japan", "日本アイ・ビー・エム株式会社", "IBM Japan", "consulting", "tokyo", "tokyo", "https://www.ibm.com/jp-ja", "https://www.ibm.com/jp-ja/careers", "enterprise", 1, ["foreign", "consulting"]),
    ("accenture-japan", "Accenture Japan", "アクセンチュア株式会社", "Accenture Japan", "consulting", "tokyo", "tokyo", "https://www.accenture.com/jp-ja", "https://www.accenture.com/jp-ja/careers", "enterprise", 1, ["foreign", "consulting"]),
    ("deloitte-japan", "Deloitte Japan", "デロイト トーマツ グループ", "Deloitte Japan", "consulting", "tokyo", "tokyo", "https://www2.deloitte.com/jp/ja.html", "https://www2.deloitte.com/jp/ja/careers.html", "enterprise", 1, ["foreign", "consulting"]),
    ("pwc-japan", "PwC Japan", "PwC Japanグループ", "PwC Japan", "consulting", "tokyo", "tokyo", "https://www.pwc.com/jp/ja.html", "https://www.pwc.com/jp/ja/careers.html", "enterprise", 0, ["foreign", "consulting"]),
    ("ey-japan", "EY Japan", "EY Japan", "EY Japan", "consulting", "tokyo", "tokyo", "https://www.ey.com/ja_jp", "https://www.ey.com/ja_jp/careers", "enterprise", 0, ["foreign", "consulting"]),
    ("kpmg-japan", "KPMG Japan", "KPMGジャパン", "KPMG Japan", "consulting", "tokyo", "tokyo", "https://kpmg.com/jp/ja/home.html", "https://kpmg.com/jp/ja/home/careers.html", "enterprise", 0, ["foreign", "consulting"]),
    ("mckinsey-japan", "McKinsey Japan", "マッキンゼー・アンド・カンパニー日本支社", "McKinsey Japan", "consulting", "tokyo", "tokyo", "https://www.mckinsey.com/jp", "https://www.mckinsey.com/careers", "enterprise", 0, ["foreign", "consulting"]),
    ("bcg-japan", "BCG Japan", "ボストン コンサルティング グループ", "Boston Consulting Group Japan", "consulting", "tokyo", "tokyo", "https://www.bcg.com/ja-jp/", "https://careers.bcg.com/", "enterprise", 0, ["foreign", "consulting"]),
    ("bain-japan", "Bain Japan", "ベイン・アンド・カンパニー・ジャパン", "Bain & Company Japan", "consulting", "tokyo", "tokyo", "https://www.bain.com/ja/", "https://www.bain.com/careers/", "enterprise", 0, ["foreign", "consulting"]),
    ("goldman-sachs-japan", "Goldman Sachs Japan", "ゴールドマン・サックス証券株式会社", "Goldman Sachs Japan", "finance", "tokyo", "tokyo", "https://www.goldmansachs.com/japan/", "https://www.goldmansachs.com/careers/", "enterprise", 0, ["foreign", "finance"]),
    ("jpmorgan-japan", "J.P. Morgan Japan", "JPモルガン証券株式会社", "J.P. Morgan Japan", "finance", "tokyo", "tokyo", "https://www.jpmorgan.com/JP/ja/about-us", "https://careers.jpmorgan.com/", "enterprise", 0, ["foreign", "finance"]),
    ("bloomberg-japan", "Bloomberg Japan", "ブルームバーグ・エル・ピー", "Bloomberg Japan", "media_advertising", "tokyo", "tokyo", "https://www.bloomberg.co.jp/", "https://www.bloomberg.com/company/careers/", "enterprise", 0, ["foreign", "finance"]),
    ("indeed-japan", "Indeed Japan", "Indeed Japan株式会社", "Indeed Japan", "it_internet", "tokyo", "tokyo", "https://jp.indeed.com/", "https://www.indeed.jobs/", "enterprise", 0, ["foreign", "HRTech"]),
    ("bytedance-japan", "ByteDance Japan", "ByteDance株式会社", "ByteDance Japan", "it_internet", "tokyo", "tokyo", "https://www.bytedance.com/", "https://jobs.bytedance.com/", "enterprise", 0, ["foreign", "global"]),
    ("meta-japan", "Meta Japan", "Meta日本法人", "Meta Japan", "it_internet", "tokyo", "tokyo", "https://www.meta.com/jp/", "https://www.metacareers.com/", "enterprise", 0, ["foreign"]),
    ("adobe-japan", "Adobe Japan", "アドビ株式会社", "Adobe Japan", "software", "tokyo", "tokyo", "https://www.adobe.com/jp/", "https://www.adobe.com/careers.html", "enterprise", 0, ["foreign"]),
    ("nvidia-japan", "NVIDIA Japan", "エヌビディア合同会社", "NVIDIA Japan", "electronics", "tokyo", "tokyo", "https://www.nvidia.com/ja-jp/", "https://www.nvidia.com/en-us/about-nvidia/careers/", "enterprise", 0, ["foreign", "AI"]),
    ("stripe-japan", "Stripe Japan", "ストライプジャパン株式会社", "Stripe Japan", "finance", "tokyo", "tokyo", "https://stripe.com/jp", "https://stripe.com/jobs", "large", 0, ["foreign", "FinTech"]),
    ("hoshino-resorts", "Hoshino Resorts", "株式会社星野リゾート", "Hoshino Resorts Inc.", "hospitality", "nagano", "karuizawa", "https://www.hoshinoresorts.com/", "https://www.hoshinoresorts.com/recruit/", "large", 0, ["hospitality"]),
    ("oriental-land", "Oriental Land", "株式会社オリエンタルランド", "Oriental Land Co., Ltd.", "hospitality", "chiba", "urayasu", "https://www.olc.co.jp/", "https://www.olc.co.jp/ja/recruit.html", "enterprise", 0, ["tourism"]),
    ("usj", "Universal Studios Japan", "合同会社ユー・エス・ジェイ", "USJ LLC", "hospitality", "osaka", "osaka", "https://www.usj.co.jp/company/", "https://recruit.usj.co.jp/", "large", 0, ["kansai", "tourism"]),
    ("nitori", "Nitori", "株式会社ニトリホールディングス", "Nitori Holdings Co., Ltd.", "retail", "hokkaido", "sapporo", "https://www.nitorihd.co.jp/", "https://www.nitori.co.jp/recruit/", "enterprise", 0, ["retail"]),
    ("ryohin-keikaku", "Muji / Ryohin Keikaku", "株式会社良品計画", "Ryohin Keikaku Co., Ltd.", "retail", "tokyo", "tokyo", "https://www.ryohin-keikaku.jp/", "https://www.ryohin-keikaku.jp/recruit/", "enterprise", 0, ["retail"]),
    ("benesse", "Benesse", "株式会社ベネッセホールディングス", "Benesse Holdings, Inc.", "education", "okayama", "okayama", "https://www.benesse-hd.co.jp/", "https://www.benesse.co.jp/fr_s/", "enterprise", 0, ["education"]),
    ("pasona", "Pasona", "株式会社パソナグループ", "Pasona Group Inc.", "education", "tokyo", "tokyo", "https://www.pasonagroup.co.jp/", "https://www.pasonagroup.co.jp/recruit/", "enterprise", 0, ["HR"]),
    ("persol", "Persol Holdings", "パーソルホールディングス株式会社", "Persol Holdings Co., Ltd.", "education", "tokyo", "tokyo", "https://www.persol.com/", "https://www.persol.com/recruit/", "enterprise", 0, ["HR"]),
    ("mynavi", "Mynavi", "株式会社マイナビ", "Mynavi Corporation", "education", "tokyo", "tokyo", "https://www.mynavi.jp/", "https://www.mynavi.jp/saiyou/", "enterprise", 0, ["HR"]),
]:
    _append_guide_company_seed(*_company)


for _company in [
    ("shimadzu", "Shimadzu", "株式会社島津製作所", "Shimadzu Corporation", "electronics", "kyoto", "kyoto", "https://www.shimadzu.co.jp/", "https://www.shimadzu.co.jp/recruit/", "enterprise", 1, ["kansai", "electronics"]),
    ("nidec", "Nidec", "ニデック株式会社", "Nidec Corporation", "electronics", "kyoto", "kyoto", "https://www.nidec.com/jp/", "https://www.nidec.com/jp/recruit/", "enterprise", 1, ["kansai", "electronics"]),
    ("gs-yuasa", "GS Yuasa", "株式会社GSユアサ", "GS Yuasa Corporation", "electronics", "kyoto", "kyoto", "https://www.gs-yuasa.com/jp/", "https://www.gs-yuasa.com/jp/recruit/", "enterprise", 0, ["kansai", "battery"]),
    ("horiba", "HORIBA", "株式会社堀場製作所", "HORIBA, Ltd.", "electronics", "kyoto", "kyoto", "https://www.horiba.com/jpn/", "https://www.horiba.com/jpn/recruit/", "enterprise", 0, ["kansai", "electronics"]),
    ("screen-holdings", "SCREEN Holdings", "株式会社SCREENホールディングス", "SCREEN Holdings Co., Ltd.", "electronics", "kyoto", "kyoto", "https://www.screen.co.jp/", "https://www.screen.co.jp/recruit/", "enterprise", 0, ["kansai", "semiconductor"]),
    ("wacoal", "Wacoal", "株式会社ワコールホールディングス", "Wacoal Holdings Corp.", "fashion", "kyoto", "kyoto", "https://www.wacoalholdings.jp/", "https://www.wacoal.jp/recruit/", "enterprise", 0, ["kansai", "fashion"]),
    ("nissin-foods", "Nissin Foods", "日清食品ホールディングス株式会社", "Nissin Foods Holdings Co., Ltd.", "food_beverage", "osaka", "osaka", "https://www.nissin.com/jp/", "https://www.nissin.com/jp/recruit/", "enterprise", 0, ["kansai", "food"]),
    ("hankyu-hanshin", "Hankyu Hanshin Holdings", "阪急阪神ホールディングス株式会社", "Hankyu Hanshin Holdings, Inc.", "transportation", "osaka", "osaka", "https://www.hankyu-hanshin.co.jp/", "https://www.hankyu-hanshin.co.jp/recruit/", "enterprise", 0, ["kansai", "railway"]),
    ("kintetsu", "Kintetsu Group Holdings", "近鉄グループホールディングス株式会社", "Kintetsu Group Holdings Co., Ltd.", "transportation", "osaka", "osaka", "https://www.kintetsu-g-hd.co.jp/", "https://www.kintetsu-g-hd.co.jp/recruit/", "enterprise", 0, ["kansai", "railway"]),
    ("nankai", "Nankai Electric Railway", "南海電気鉄道株式会社", "Nankai Electric Railway Co., Ltd.", "transportation", "osaka", "osaka", "https://www.nankai.co.jp/", "https://www.nankai.co.jp/company/recruit.html", "enterprise", 0, ["kansai", "railway"]),
    ("keihan", "Keihan Holdings", "京阪ホールディングス株式会社", "Keihan Holdings Co., Ltd.", "transportation", "osaka", "osaka", "https://www.keihan-holdings.co.jp/", "https://www.keihan-holdings.co.jp/recruit/", "enterprise", 0, ["kansai", "railway"]),
    ("takara-holdings", "Takara Holdings", "宝ホールディングス株式会社", "Takara Holdings Inc.", "food_beverage", "kyoto", "kyoto", "https://www.takara.co.jp/", "https://www.takara.co.jp/recruit/", "enterprise", 0, ["kansai", "food"]),
    ("daifuku", "Daifuku", "株式会社ダイフク", "Daifuku Co., Ltd.", "logistics", "osaka", "osaka", "https://www.daifuku.com/jp/", "https://www.daifuku.com/jp/recruit/", "enterprise", 0, ["kansai", "logistics"]),
    ("kansai-electric-power", "Kansai Electric Power", "関西電力株式会社", "The Kansai Electric Power Co., Inc.", "energy", "osaka", "osaka", "https://www.kepco.co.jp/", "https://www.kepco.co.jp/recruit/", "enterprise", 0, ["kansai", "energy"]),
    ("osaka-gas", "Osaka Gas", "大阪ガス株式会社", "Osaka Gas Co., Ltd.", "energy", "osaka", "osaka", "https://www.osakagas.co.jp/", "https://www.osakagas.co.jp/company/recruit/", "enterprise", 0, ["kansai", "energy"]),
    ("sekisui-house", "Sekisui House", "積水ハウス株式会社", "Sekisui House, Ltd.", "construction", "osaka", "osaka", "https://www.sekisuihouse.co.jp/", "https://www.sekisuihouse.co.jp/company/recruit/", "enterprise", 0, ["kansai", "construction"]),
    ("daiwa-house", "Daiwa House", "大和ハウス工業株式会社", "Daiwa House Industry Co., Ltd.", "construction", "osaka", "osaka", "https://www.daiwahouse.co.jp/", "https://www.daiwahouse.co.jp/recruit/", "enterprise", 0, ["kansai", "construction"]),
    ("santen", "Santen Pharmaceutical", "参天製薬株式会社", "Santen Pharmaceutical Co., Ltd.", "pharma", "osaka", "osaka", "https://www.santen.com/ja/", "https://www.santen.com/ja/careers/", "enterprise", 0, ["kansai", "pharma"]),
    ("shionogi", "Shionogi", "塩野義製薬株式会社", "Shionogi & Co., Ltd.", "pharma", "osaka", "osaka", "https://www.shionogi.com/jp/ja/", "https://www.shionogi.com/jp/ja/recruit/", "enterprise", 0, ["kansai", "pharma"]),
    ("takeda", "Takeda Pharmaceutical", "武田薬品工業株式会社", "Takeda Pharmaceutical Company Limited", "pharma", "osaka", "osaka", "https://www.takeda.com/ja-jp/", "https://www.takeda.com/careers/", "enterprise", 1, ["kansai", "pharma", "global"]),
]:
    _append_guide_company_seed(*_company)

# 留学生/外国人关注度最高的国际化大学与语言学校补充批。
for _school in [
    ("international-christian-university", "国际基督教大学", "国際基督教大学", "International Christian University", "university", "tokyo", "mitaka", "https://www.icu.ac.jp/", ["Liberal Arts", "International Studies"], 1),
    ("ritsumeikan-asia-pacific-university", "立命馆亚洲太平洋大学", "立命館アジア太平洋大学", "Ritsumeikan Asia Pacific University", "university", "oita", "beppu", "https://www.apu.ac.jp/", ["International Management", "Asia Pacific Studies"], 1),
    ("akita-international-university", "国际教养大学", "国際教養大学", "Akita International University", "university", "akita", "akita", "https://web.aiu.ac.jp/", ["Liberal Arts", "Global Business"], 1),
    ("naganuma-school", "长沼学校（东京日本语学校）", "学校法人長沼スクール 東京日本語学校", "The Naganuma School Tokyo School of Japanese Language", "language_school", "tokyo", "shibuya", "https://www.naganuma-school.ac.jp/", ["Language"]),
    ("sendagaya-japanese-institute", "千驮谷日本语学校", "千駄ヶ谷日本語学校", "Sendagaya Japanese Institute", "language_school", "tokyo", "shinjuku", "https://jp-sji.org/", ["Language"]),
    ("meros-language-school", "美罗斯言语学院", "メロス言語学院", "Meros Language School", "language_school", "tokyo", "toshima", "https://www.meros.jp/", ["Language"]),
    ("human-academy-japanese-language-school", "修曼日本语学校", "ヒューマンアカデミー日本語学校", "Human Academy Japanese Language School", "language_school", "tokyo", "shinjuku", "https://hajl.athuman.com/", ["Language"]),
    ("intercultural-institute-of-japan", "国际交流学院", "学校法人国際学園 国際外語学院", "Intercultural Institute of Japan", "language_school", "tokyo", "taito", "https://www.incul.com/", ["Language"]),
    ("tokyo-galaxy-japanese-language-school", "东京银星日本语学校", "東京ギャラクシー日本語学校", "Tokyo Galaxy Japanese Language School", "language_school", "tokyo", "chuo", "https://www.tokyogalaxy.ac.jp/", ["Language"]),
    ("kobe-denshi", "神户电子专门学校", "神戸電子専門学校", "Kobe Institute of Computing College", "vocational_school", "hyogo", "kobe", "https://www.kobedenshi.ac.jp/", ["IT", "Game", "Sound", "Design"]),
    ("nippon-engineering-college", "日本工学院专门学校", "日本工学院専門学校", "Nippon Engineering College", "vocational_school", "tokyo", "ota", "https://www.neec.ac.jp/", ["IT", "Design", "Music", "Engineering"]),
]:
    _append_guide_school_seed(*_school)

# 外国人求职关注度最高、此前缺席的代表性雇主补充批。
for _company in [
    ("toyota", "丰田汽车", "トヨタ自動車株式会社", "Toyota Motor Corporation", "manufacturing", "aichi", "toyota", "https://global.toyota/jp/", "https://www.toyota-recruit.com/", "enterprise", 1, ["automotive", "global"]),
    ("sony-group", "索尼集团", "ソニーグループ株式会社", "Sony Group Corporation", "electronics", "tokyo", "minato", "https://www.sony.com/ja/", "https://www.sony.com/ja/SonyInfo/Jobs/", "enterprise", 1, ["electronics", "entertainment", "global"]),
    ("rakuten-group", "乐天集团", "楽天グループ株式会社", "Rakuten Group, Inc.", "it_internet", "tokyo", "setagaya", "https://corp.rakuten.co.jp/", "https://corp.rakuten.co.jp/careers/", "enterprise", 1, ["IT", "ecommerce", "english-friendly"]),
    ("mercari", "Mercari", "株式会社メルカリ", "Mercari, Inc.", "it_internet", "tokyo", "minato", "https://about.mercari.com/", "https://careers.mercari.com/", "large", 1, ["IT", "marketplace", "english-friendly"]),
    ("line-yahoo", "LINEヤフー", "LINEヤフー株式会社", "LY Corporation", "it_internet", "tokyo", "chiyoda", "https://www.lycorp.co.jp/ja/", "https://www.lycorp.co.jp/ja/recruit/", "enterprise", 1, ["IT", "internet"]),
    ("fujitsu", "富士通", "富士通株式会社", "Fujitsu Limited", "it_internet", "kanagawa", "kawasaki", "https://www.fujitsu.com/jp/", "", "enterprise", 1, ["IT", "global"]),
    ("ntt-data", "NTT数据", "株式会社NTTデータ", "NTT DATA Corporation", "it_internet", "tokyo", "koto", "https://www.nttdata.com/jp/ja/", "", "enterprise", 1, ["IT", "SI"]),
    ("recruit", "Recruit", "株式会社リクルート", "Recruit Co., Ltd.", "it_internet", "tokyo", "chiyoda", "https://www.recruit.co.jp/", "https://www.recruit.co.jp/employment/", "enterprise", 1, ["IT", "HR"]),
    ("fast-retailing", "迅销（优衣库母公司）", "株式会社ファーストリテイリング", "Fast Retailing Co., Ltd.", "retail", "yamaguchi", "yamaguchi", "https://www.fastretailing.com/jp/", "https://www.fastretailing.com/employment/ja/", "enterprise", 1, ["retail", "global", "uniqlo"]),
    ("mufg-bank", "三菱UFJ银行", "株式会社三菱UFJ銀行", "MUFG Bank, Ltd.", "finance", "tokyo", "chiyoda", "https://www.bk.mufg.jp/", "", "enterprise", 1, ["finance", "bank"]),
    ("mitsubishi-corporation", "三菱商事", "三菱商事株式会社", "Mitsubishi Corporation", "trading", "tokyo", "chiyoda", "https://www.mitsubishicorp.com/", "", "enterprise", 1, ["trading", "global"]),
    ("itochu", "伊藤忠商事", "伊藤忠商事株式会社", "ITOCHU Corporation", "trading", "tokyo", "minato", "https://www.itochu.co.jp/", "https://career.itochu.co.jp/", "enterprise", 1, ["trading", "global"]),
    ("mitsui-and-co", "三井物产", "三井物産株式会社", "Mitsui & Co., Ltd.", "trading", "tokyo", "chiyoda", "https://www.mitsui.com/jp/ja/", "", "enterprise", 0, ["trading", "global"]),
    ("jr-east", "JR东日本", "東日本旅客鉄道株式会社", "East Japan Railway Company", "transport", "tokyo", "shibuya", "https://www.jreast.co.jp/", "", "enterprise", 0, ["railway", "infrastructure"]),
    ("ana", "全日本空输", "全日本空輸株式会社", "All Nippon Airways Co., Ltd.", "transport", "tokyo", "minato", "https://www.ana.co.jp/", "", "enterprise", 0, ["airline"]),
    ("shiseido", "资生堂", "株式会社資生堂", "Shiseido Company, Limited", "consumer_goods", "tokyo", "chuo", "https://corp.shiseido.com/jp/", "", "enterprise", 0, ["cosmetics", "global"]),
]:
    _append_guide_company_seed(*_company)

