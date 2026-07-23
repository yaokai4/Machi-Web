export const meta = {
  name: 'jlpt-bank-gen-v2',
  description: 'Generate + adversarially verify a large original JLPT-style bank for one level×group (args.level, args.group)',
  phases: [
    { title: 'Generate', detail: 'one agent per level×qtype chunk' },
    { title: 'Verify', detail: 'two blind solvers per batch; keep only unanimous' },
    { title: 'Topup', detail: 'regenerate shortfall groups' },
  ],
}

// args 可能以对象或 JSON 字符串到达。解析、合同或运行参数不合格都直接停止；
// 禁止静默回退到 N1/lex/wave=1（该旧行为曾令 N1-rc 根本没有运行）。
const A = (typeof args === 'string')
  ? (() => { try { return JSON.parse(args) } catch (e) { throw new Error('args must be valid JSON') } })()
  : args
if (!A || typeof A !== 'object' || Array.isArray(A)) throw new Error('args must be an object')
const CONTRACT = A.contract
if (!CONTRACT || CONTRACT.contractVersion !== 2 || !CONTRACT.runSchema || !CONTRACT.qtypes) {
  throw new Error('args.contract must be the authoritative v2 contract snapshot')
}
const LEVEL = A.level
const GROUP = A.group // 'lex' = 文字語彙+文法, 'rc' = 読解+聴解
const WAVE = A.wave
const RUN_PROPS = CONTRACT.runSchema.properties || {}
if (!RUN_PROPS.level || !RUN_PROPS.level.enum.includes(LEVEL)) throw new Error('level must be N1 or N2')
if (!RUN_PROPS.group || !RUN_PROPS.group.enum.includes(GROUP)) throw new Error('group must be lex or rc')
if (!Number.isInteger(WAVE) || WAVE < 1 || WAVE > 9999) throw new Error('wave must be an integer from 1 through 9999')

// 同一 level×group 要跑多波；wave 让每波用不同主题偏移 +
// 唯一批次标签,产出新内容(跨波按 stem 去重);每波结果单独落盘,组卷时合并去重。
const NEEDS = CONTRACT.generationNeeds
const PAPER = CONTRACT.paperSpec
const LEX_QTYPES = CONTRACT.generationGroups.lex
const RC_QTYPES = CONTRACT.generationGroups.rc
const SECTION_OF = Object.fromEntries(Object.entries(CONTRACT.qtypes).map(([qtype, spec]) => [qtype, spec.section]))
const LISTEN_QTYPES = new Set(Object.keys(SECTION_OF).filter(qtype => SECTION_OF[qtype] === 'listening'))

const LEVEL_PROFILE = {
  N5: 'N5＝入门级。词汇约800语，汉字约100字。语法：です/ます体、基础助词、て形/ない形/た形、～ましょう、～てください、あります/います、形容词活用。语境全为日常生活；出现的汉字必须在N5范围，仮名为主。',
  N4: 'N4＝基础级。词汇约1500语，汉字约300字。语法：普通形、～と思う、可能形、被动、使役入门、条件（たら/ば/と/なら）、～ながら、～そうだ、～やすい/にくい、授受动词、～ておく/てある/ている、敬语入门。语境：日常+简单学校/职场。',
  N3: 'N3＝中级桥梁。词汇约3700语，汉字约650字。语法：～わけだ、～はずだ、～べきだ、～ばかり、～ところだ、使役被动、～に対して/について/によって、～ば～ほど、复合动词、口语缩约形。语境：生活+职场+社会话题入门；读解含说明文、随笔、书信。',
  N2: 'N2＝中高级。词汇约6000语，汉字约1000字。语法：～ものだ系、～わけにはいかない、～ざるを得ない、～かねる/かねない、～に沿って/に応じて/にわたって/を通じて、～上で/上に、～次第、～がたい、～恐れがある、～ものの、～ながらも、书面语接续。语境：报刊评论、商务文书、科普；干扰项要求近义精细辨析。',
  N1: 'N1＝高级。词汇1万+（含书面语、惯用句、拟声拟态、四字熟语），汉字约2000字。语法：～ならでは、～をもって、～んばかりに、～といえども、～まじき、～なりに、～ずくめ、～きらいがある、～に足る、～を余儀なくされる、古典残留表现、高级敬语。语境：社论、学术、文学随笔、抽象议论；干扰项须母语者也需思考。',
}

const QTYPE_SPEC = {
  kanji_reading: '漢字読み：自然句子，一词用【】标出（汉字书写），问读法。4个平假名选项，用长音/促音/浊音/音训混淆做干扰。',
  orthography: '表記：句子里一词用【】标出（平假名书写），问正确汉字写法。4个汉字候选（形近/同音异字干扰）。',
  word_formation: '語形成：给出带前后语境的句子，考查接头辞、接尾辞或复合构词；4个同类候选中只有1个能构成自然且符合语境的词。',
  context: '文脈規定：句子挖空（　　），选最合适的词。4个同类词，覆盖名/动/形/副/カタカナ語/接续词。',
  paraphrase: '言い換え類義：句中一词/短语用【】标出，选意思最接近的替换项。4选项。',
  usage: '用法：stem 只写目标词（如「めったに」），4个选项各为一整句，只有1句用法自然正确；错误项须是真实常见误用（搭配/语义/位置错），非乱造。',
  grammar_form: '文法形式判断：一句或对话，挖空（　　），选正确语法形式。4个形近/义近语法项。对话体标「A：」「B：」。',
  sentence_assembly: '文の組み立て（星号题）：stem 为一句含「＿＿＿　＿＿＿　★　＿＿＿」（★是其中一空），4个选项是待排序语块。唯一正确排序下 answerIndex 指向应放★位置的语块，必须保证只有一种自然排序。',
  text_grammar: '文章の文法：写一篇该级别短文（随笔/说明/信件；N5约150字→N1约550字），挖4-5空标（１）（２）…。passage 放全文（含空标记），每空一题，stem 写「（１）に入れるのに最もよいものはどれか。」4选项。同文所有题 passage 一字不差，共用同一 group slug。',
  reading_short: '内容理解（短文）：passage 为原创短文（通知/便条/邮件/随笔片段），配1题问主旨/细节/理由/指代。干扰项须在原文有似是而非依据。',
  reading_mid: '内容理解（中文）：passage 为中等长度原创文章，配2-3题（细节/理由/笔者观点）。同文题目 passage 相同、group 相同。',
  reading_long: '内容理解（長文）/統合理解：长文（N2约900字、N1约1000字），或統合＝两段相关文本「【文章Ａ】…【文章Ｂ】…」并列，配2-3题含比较两文观点题。',
  reading_info: '情報検索：passage 为实用信息文本（活动通知/招募/时刻表/菜单/指南），纯文本+换行分条，配1-2题为条件检索，答案须可从文本唯一推出。',
  listen_task: '聴解・課題理解：passage 写一段对话或独白的完整脚本，每句一行、用「男：」「女：」「店員：」「先生：」等前缀标注说话人（无音频时也能读懂）。设问 stem 为「このあと、〇〇はまず何をしますか。」类，问听后应做的下一步动作。4选项。首行可用「（　）で、男の人と女の人が話しています。」交代场景。',
  listen_point: '聴解・ポイント理解：passage 为带说话人前缀的对话脚本。stem 问某个具体信息（理由/时间/数量/地点/条件），4选项。信息须能从脚本唯一确定。',
  listen_gist: '聴解・概要理解：passage 为独白或对话脚本（带说话人前缀）。stem 问主旨/说话人最想表达什么/内容概要，4选项，不问细节。',
  listen_response: '聴解・即時応答：passage 只写一句发话（如「A：この資料、コピーしておいてくれる？」），4个选项各为一句候选应答，只有1句在语境中自然得体；其余为答非所问/语体不符/时态错位等真实误答。',
  listen_integrated: '聴解・統合理解：passage 为较长的多人对话或「先播一段说明，再是两人讨论」的脚本（带说话人前缀），信息量大。设问 stem 问综合判断（两人各自选择/最终结论）。4选项。',
}

const THEMES = ['日常生活・買い物', '学校・勉強', '仕事・職場', '旅行・交通', '健康・病院', '天気・季節・自然', '趣味・スポーツ', '料理・食事', '住まい・引っ越し', '友達・家族・人間関係', '社会・ニュース', '科学・技術', '文化・伝統', '環境・エコ', '経済・お金', 'メディア・情報', '教育・研究', '心理・行動']

const GEN_SCHEMA = {
  type: 'object', required: ['questions'],
  properties: {
    questions: {
      type: 'array',
      items: {
        type: 'object',
        required: ['qtype', 'stem', 'choices', 'answerIndex', 'explanation', 'difficulty'],
        properties: {
          qtype: { type: 'string' },
          stem: { type: 'string' },
          passage: { type: 'string' },
          group: { type: 'string' },
          choices: { type: 'array', items: { type: 'string' }, minItems: 4, maxItems: 4 },
          answerIndex: { type: 'integer', minimum: 0, maximum: 3 },
          explanation: {
            type: 'object',
            required: ['correctAnswerMeaningUsage', 'knowledgePoint', 'whyCorrect', 'distractorReasons'],
            properties: {
              correctAnswerMeaningUsage: { type: 'string', minLength: 24 },
              knowledgePoint: { type: 'string', minLength: 24 },
              whyCorrect: { type: 'string', minLength: 24 },
              distractorReasons: {
                type: 'array', minItems: 3, maxItems: 3,
                items: {
                  type: 'object', required: ['choice', 'reason'],
                  properties: {
                    choice: { type: 'string' },
                    reason: { type: 'string', minLength: 20 },
                  },
                },
              },
            },
          },
          difficulty: { type: 'integer', minimum: 1, maximum: 5 },
        },
      },
    },
  },
}
const VERIFY_SCHEMA = {
  type: 'object', required: ['verdicts'],
  properties: {
    verdicts: {
      type: 'array',
      items: {
        type: 'object',
        required: [
          'index', 'answerIndex', 'answerAccepted', 'answerFatal',
          'explanationAccepted', 'explanationFatal', 'explanationNote',
        ],
        properties: {
          index: { type: 'integer' },
          answerIndex: { type: 'integer', minimum: -1, maximum: 3 },
          answerAccepted: { type: 'boolean' },
          answerFatal: { type: 'boolean' },
          explanationAccepted: { type: 'boolean' },
          explanationFatal: { type: 'boolean' },
          explanationNote: { type: 'string' },
        },
      },
    },
  },
}

function genPrompt(level, qtype, count, themeA, themeB) {
  const listeningNote = LISTEN_QTYPES.has(qtype)
    ? '\n【听力特别要求】passage 必须是可独立朗读的完整脚本：每句一行，说话人用「男：」「女：」「店員：」等前缀；避免括号内的舞台指示混进朗读文本（场景交代可作为脚本第一行的旁白句）。脚本长度贴合该级别真实听力（N4/N5 短、N1/N2 长且信息密）。'
    : ''
  return [
    '你是资深 JLPT 出题专家（日语母语水平），为面向中文用户的日语学习 App 编写完全原创的 JLPT 风格模拟题。',
    '绝对禁止复述或改写任何官方真题原文——所有句子、文章、听力脚本必须原创；但题型格式、指示语、难度必须与真实 JLPT（2020 改订后）一致。',
    '',
    '【级别定位】' + LEVEL_PROFILE[level],
    '【题型规格】' + QTYPE_SPEC[qtype],
    '【本批任务】编写 ' + count + ' 道 ' + level + ' 的该题型题目。主题围绕：' + themeA + '、' + themeB + '（可扩展，避免雷同）。' + listeningNote,
    '',
    '【硬性要求】',
    '1. 每题恰好 4 个选项，恰好 1 个无争议正确答案；干扰项要有迷惑性但经得起母语者推敲，不得有第二个可辩护正确项。',
    '2. 词汇语法严格限制在该级别及以下（读解/听力文本可有极少量超纲词但不影响答题）。',
    '3. stem/passage/choices 全部日语。',
    '4. 【explanation 极详细 · 每题必写全】用简体中文输出结构化对象，四个键缺一不可：',
    '   ① correctAnswerMeaningUsage：正确项的准确含义、词性、读音或活用、搭配、语感与适用场景；',
    '   ② knowledgePoint：本题考查规则，如接续、活用、敬语层级、近义辨析或音训；',
    '   ③ whyCorrect：结合句意说明为何该项唯一成立；',
    '   ④ distractorReasons：恰好 3 个 {choice, reason}，逐一覆盖三个错误选项，说明意思与具体错误原因。',
    '   三个核心段各至少 24 个有效字符，每个错误项理由至少 20 个有效字符。',
    '   禁止“占位/待补充/同上/见上/TODO/TBD”等占位表达，三个核心段不得互相复制。',
    '   宁详勿简，写成能让学习者真正学会的讲解（通常 4-8 句以上）。',
    '',
    '5. 【逐字引用选项原文 —— 最容易失分的一条，务必照做】',
    '   校验器做的是**字面子串匹配**（去空白后），只写“正确项/選択肢1/前者”一律判不通过：',
    '   · correctAnswerMeaningUsage 与 whyCorrect 里都必须**原样出现正确选项的完整文本**；',
    '   · distractorReasons 的 choice 必须**逐字等于**对应错误选项（不加引号、不加编号、不改写）；',
    '   · 每条 reason 的正文里也必须**原样出现该错误选项的完整文本**；',
    '   · 三条 reason 的 choice 合起来正好覆盖三个错误选项，不重不漏。',
    '   例（正确选项「不動」，错误选项「不変」「不朽」「不屈」）：',
    '     whyCorrect：「…因此只有「不動」能与「地位」搭配…」  ← 出现了「不動」✓',
    '     distractorReasons[0] = { choice: "不変", reason: "「不変」指性质不改变…" }  ← choice 逐字、reason 也出现 ✓',
    '     ✗ 反例：choice: "选项B" / reason: "该项语义不符"（没写出「不変」，判不通过）',
    '6. 阅读/文章语法/听力：passage 完整原创；同一篇的多题 passage 一字不差重复，group 填同一短 slug；单题 passage 留空、group 留空。',
    '7. difficulty 为该级别内部难度 1-5（3=标准）。qtype 固定填 "' + qtype + '"。',
    '直接输出结构化结果。',
  ].join('\n')
}

function verifyPrompt(level, qtype, qs) {
  const stripped = qs.map((q, i) => ({
    index: i,
    stem: q.stem,
    passage: q.passage || '',
    choices: q.choices,
    explanation: q.explanation,
  }))
  return [
    '你是 JLPT ' + level + ' 级资深考官，盲审一批 ' + level + ' 模拟题（题型：' + qtype + '）。你看不到出题人答案，必须完全独立作答。',
    QTYPE_SPEC[qtype] ? '【题型说明】' + QTYPE_SPEC[qtype] : '',
    '逐题：1) 独立解题给出唯一正确 answerIndex(0-3)；若无正确项/多个可辩护/组句排序不唯一/即時応答无唯一得体应答，填 -1，answerAccepted=false 且 answerFatal=true。',
    '2) 独立检查日语是否自然、答案是否唯一、难度是否明显偏离 ' + level + '；结论写入 answerAccepted/answerFatal。',
    '3) 单独审查 explanation：核对正确项含义与用法、知识点、为何唯一正确，以及三个干扰项逐项错误理由；任何事实错误、遗漏或模板占位都令 explanationAccepted=false，严重误导令 explanationFatal=true，并在 explanationNote 给出具体依据。',
    '题目（JSON）：',
    JSON.stringify(stripped, null, 1),
    '逐题输出 verdicts，index 与输入对应。',
  ].join('\n')
}

function chunkCount(qtype) {
  if (qtype === 'text_grammar' || qtype === 'reading_mid' || qtype === 'reading_long' || qtype === 'reading_info') return 4
  if (qtype === 'listen_integrated') return 4
  if (LISTEN_QTYPES.has(qtype)) return 6
  if (qtype === 'reading_short') return 5
  return 9
}

function buildBatches(needs, round, suffix) {
  const batches = []
  // 主题起点随 wave 偏移,让不同波覆盖不同主题组合,减少跨波重复。
  let t = WAVE * 5
  const qtypes = GROUP === 'lex' ? LEX_QTYPES : RC_QTYPES
  for (const qtype of qtypes) {
    const need = (needs[LEVEL] || {})[qtype]
    if (!need || need <= 0) continue
    const request = Math.ceil(need * (round === 1 ? 1.3 : 1.5))
    const per = chunkCount(qtype)
    let remaining = request, part = 0
    while (remaining > 0) {
      const n = Math.min(per, remaining)
      remaining -= n
      part += 1
      const themeA = THEMES[t % THEMES.length]; const themeB = THEMES[(t + 9) % THEMES.length]; t += 1
      // 批次 id 带 wave,跨波不撞缓存(resume 只在同一 wave 内命中)。
      batches.push({ id: LEVEL.toLowerCase() + '-' + qtype + '-w' + WAVE + suffix + part, level: LEVEL, qtype, count: n, themeA, themeB })
    }
  }
  return batches
}

function sanitize(batch, raw) {
  const out = []
  for (const q of (raw && raw.questions) || []) {
    if (!q || q.qtype !== batch.qtype) continue
    if (!q.stem || typeof q.stem !== 'string' || q.stem.trim().length < 2) continue
    if (!Array.isArray(q.choices) || q.choices.length !== 4) continue
    if (q.choices.some(c => typeof c !== 'string' || !c.trim())) continue
    if (!(Number.isInteger(q.answerIndex) && q.answerIndex >= 0 && q.answerIndex <= 3)) continue
    if (!q.explanation || typeof q.explanation !== 'object' || Array.isArray(q.explanation)) continue
    const needsPassage = batch.qtype === 'text_grammar' || batch.qtype.startsWith('reading_') || LISTEN_QTYPES.has(batch.qtype)
    const minPassage = LISTEN_QTYPES.has(batch.qtype) ? (batch.qtype === 'listen_response' ? 6 : 20) : 30
    if (needsPassage && (!q.passage || q.passage.trim().length < minPassage)) continue
    out.push({
      level: batch.level, section: SECTION_OF[batch.qtype], qtype: batch.qtype,
      stem: q.stem.trim(), passage: (q.passage || '').trim(), group: (q.group || '').trim(),
      choices: q.choices.map(c => c.trim()), answerIndex: q.answerIndex,
      explanation: q.explanation, difficulty: Math.min(5, Math.max(1, q.difficulty || 3)),
      theme: batch.themeA,
    })
  }
  return out
}

async function runBatches(batches, phaseGen, phaseVer) {
  return pipeline(
    batches,
    b => agent(genPrompt(b.level, b.qtype, b.count, b.themeA, b.themeB), { label: 'gen:' + b.id, phase: phaseGen, schema: GEN_SCHEMA, effort: 'high' }),
    (gen, b) => {
      const qs = sanitize(b, gen)
      if (!qs.length) return { b, qs: [], vs: [] }
      return parallel([1, 2].map(k => () =>
        agent(verifyPrompt(b.level, b.qtype, qs), { label: 'ver' + k + ':' + b.id, phase: phaseVer, schema: VERIFY_SCHEMA, effort: 'high' })
      )).then(vs => ({ b, qs, vs }))
    },
    pack => {
      if (!pack || !pack.qs.length) return { batch: pack ? pack.b.id : '?', kept: [] }
      const maps = pack.vs.filter(Boolean).map(v => {
        const m = {}
        for (const d of (v.verdicts || [])) m[d.index] = d
        return m
      })
      const kept = []
      pack.qs.forEach((q, i) => {
        if (maps.length < 2) return
        const a = maps[0][i], b2 = maps[1][i]
        const ok = a && b2 &&
          a.answerAccepted && b2.answerAccepted && !a.answerFatal && !b2.answerFatal &&
          a.explanationAccepted && b2.explanationAccepted &&
          !a.explanationFatal && !b2.explanationFatal &&
          a.answerIndex === q.answerIndex && b2.answerIndex === q.answerIndex
        if (ok) kept.push(q)
      })
      return { batch: pack.b.id, kept }
    }
  )
}

function tally(pool) {
  const t = {}
  for (const q of pool) t[q.qtype] = (t[q.qtype] || 0) + 1
  return t
}

phase('Generate')
log(`解析 args → LEVEL=${LEVEL} GROUP=${GROUP} WAVE=${WAVE}（qtypes=${(GROUP === 'lex' ? LEX_QTYPES : RC_QTYPES).join(',')}）`)
log(`${LEVEL} / ${GROUP} / wave${WAVE}: 第一轮生成`)
const round1 = await runBatches(buildBatches(NEEDS, 1, 'a'), 'Generate', 'Verify')
let pool = []
for (const r of round1.filter(Boolean)) pool = pool.concat(r.kept || [])

const seen = new Set()
pool = pool.filter(q => {
  const key = q.qtype + '|' + q.stem.replace(/[\s　]/g, '') + '|' + q.passage.slice(0, 24)
  if (seen.has(key)) return false
  seen.add(key); return true
})
log(`第一轮通过 ${pool.length} 题`)

phase('Topup')
const counts = tally(pool)
const shortfall = {}
let missing = 0
const qtypes = GROUP === 'lex' ? LEX_QTYPES : RC_QTYPES
for (const qtype of qtypes) {
  const target = (NEEDS[LEVEL] || {})[qtype] || 0
  if (!target) continue
  const have = counts[qtype] || 0
  if (have < target) {
    shortfall[LEVEL] = shortfall[LEVEL] || {}
    shortfall[LEVEL][qtype] = target - have
    missing += target - have
  }
}
if (missing > 20) {
  log(`缺口 ${missing} 题，追加生成`)
  const round2 = await runBatches(buildBatches(shortfall, 2, 'b'), 'Topup', 'Topup')
  for (const r of round2.filter(Boolean)) {
    for (const q of (r.kept || [])) {
      const key = q.qtype + '|' + q.stem.replace(/[\s　]/g, '') + '|' + q.passage.slice(0, 24)
      if (!seen.has(key)) { seen.add(key); pool.push(q) }
    }
  }
  log(`追加后共 ${pool.length} 题`)
}

return { level: LEVEL, group: GROUP, stats: { total: pool.length, byQtype: tally(pool) }, pool }
