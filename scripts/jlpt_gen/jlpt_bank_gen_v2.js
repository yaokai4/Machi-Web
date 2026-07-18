export const meta = {
  name: 'jlpt-bank-gen-v2',
  description: 'Generate + adversarially verify a large original JLPT-style bank for one level×group (args.level, args.group)',
  phases: [
    { title: 'Generate', detail: 'one agent per level×qtype chunk' },
    { title: 'Verify', detail: 'two blind solvers per batch; keep only unanimous' },
    { title: 'Topup', detail: 'regenerate shortfall groups' },
  ],
}

const LEVEL = (args && args.level) || 'N1'
const GROUP = (args && args.group) || 'lex' // 'lex' = 文字語彙+文法, 'rc' = 読解+聴解
// 同一 level×group 要跑很多波才能累积到 5000/级。wave 让每波用不同主题偏移 +
// 唯一批次标签,产出新内容(跨波按 stem 去重);每波结果单独落盘,组卷时合并去重。
const WAVE = (args && args.wave) || 1

// ── 各级各题型「已校验目标数」。N1/N2 加权。overproduction 交给 request 系数。──
const NEEDS = {
  N1: { kanji_reading: 110, context: 130, paraphrase: 100, usage: 100, grammar_form: 200, sentence_assembly: 100, text_grammar: 85,
        reading_short: 55, reading_mid: 120, reading_long: 90, reading_info: 40,
        listen_task: 100, listen_point: 100, listen_gist: 70, listen_response: 100, listen_integrated: 40 },
  N2: { kanji_reading: 95, orthography: 80, context: 120, paraphrase: 95, usage: 95, grammar_form: 190, sentence_assembly: 95, text_grammar: 80,
        reading_short: 55, reading_mid: 110, reading_long: 75, reading_info: 40,
        listen_task: 95, listen_point: 95, listen_gist: 65, listen_response: 95, listen_integrated: 35 },
  N3: { kanji_reading: 70, orthography: 60, context: 90, paraphrase: 60, usage: 60, grammar_form: 120, sentence_assembly: 55, text_grammar: 50,
        reading_short: 40, reading_mid: 70, reading_long: 45, reading_info: 25,
        listen_task: 55, listen_point: 55, listen_gist: 35, listen_response: 55, listen_integrated: 20 },
  N4: { kanji_reading: 55, orthography: 45, context: 65, paraphrase: 40, usage: 35, grammar_form: 90, sentence_assembly: 40, text_grammar: 35,
        reading_short: 30, reading_mid: 45, reading_info: 20,
        listen_task: 40, listen_point: 40, listen_gist: 25, listen_response: 40 },
  N5: { kanji_reading: 55, orthography: 45, context: 60, paraphrase: 40, grammar_form: 90, sentence_assembly: 40, text_grammar: 35,
        reading_short: 30, reading_mid: 40, reading_info: 20,
        listen_task: 40, listen_point: 40, listen_gist: 25, listen_response: 40 },
}
// 组卷底线（缺口检查用；实际组卷在 Python 步骤）——每级每张卷所需，各 qtype。
const PAPER = {
  N1: { kanji_reading: 6, context: 7, paraphrase: 6, usage: 6, grammar_form: 10, sentence_assembly: 5, text_grammar: 5,
        reading_short: 4, reading_mid: 9, reading_long: 4, reading_info: 2,
        listen_task: 6, listen_point: 6, listen_gist: 5, listen_response: 11, listen_integrated: 3 },
  N2: { kanji_reading: 5, orthography: 5, context: 7, paraphrase: 5, usage: 5, grammar_form: 12, sentence_assembly: 5, text_grammar: 5,
        reading_short: 5, reading_mid: 9, reading_long: 4, reading_info: 2,
        listen_task: 5, listen_point: 6, listen_gist: 5, listen_response: 11, listen_integrated: 4 },
  N3: { kanji_reading: 8, orthography: 6, context: 11, paraphrase: 5, usage: 5, grammar_form: 13, sentence_assembly: 5, text_grammar: 5,
        reading_short: 4, reading_mid: 6, reading_long: 4, reading_info: 2,
        listen_task: 6, listen_point: 6, listen_gist: 3, listen_response: 4 },
  N4: { kanji_reading: 7, orthography: 5, context: 8, paraphrase: 4, usage: 4, grammar_form: 13, sentence_assembly: 4, text_grammar: 4,
        reading_short: 4, reading_mid: 4, reading_info: 2,
        listen_task: 6, listen_point: 6, listen_gist: 3, listen_response: 4 },
  N5: { kanji_reading: 7, orthography: 5, context: 6, paraphrase: 3, grammar_form: 9, sentence_assembly: 4, text_grammar: 4,
        reading_short: 3, reading_mid: 2, reading_info: 1,
        listen_task: 5, listen_point: 5, listen_gist: 2, listen_response: 4 },
}

const LEX_QTYPES = ['kanji_reading', 'orthography', 'context', 'paraphrase', 'usage', 'grammar_form', 'sentence_assembly', 'text_grammar']
const RC_QTYPES = ['reading_short', 'reading_mid', 'reading_long', 'reading_info', 'listen_task', 'listen_point', 'listen_gist', 'listen_response', 'listen_integrated']
const LISTEN_QTYPES = new Set(['listen_task', 'listen_point', 'listen_gist', 'listen_response', 'listen_integrated'])

const SECTION_OF = {
  kanji_reading: 'vocab', orthography: 'vocab', context: 'vocab', paraphrase: 'vocab', usage: 'vocab',
  grammar_form: 'grammar', sentence_assembly: 'grammar', text_grammar: 'grammar',
  reading_short: 'reading', reading_mid: 'reading', reading_long: 'reading', reading_info: 'reading',
  listen_task: 'listening', listen_point: 'listening', listen_gist: 'listening', listen_response: 'listening', listen_integrated: 'listening',
}

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
          explanation: { type: 'string' },
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
        required: ['index', 'answerIndex', 'fatal'],
        properties: {
          index: { type: 'integer' },
          answerIndex: { type: 'integer', minimum: -1, maximum: 3 },
          fatal: { type: 'boolean' },
          note: { type: 'string' },
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
    '4. 【explanation 极详细 · 每题必写全】用简体中文，面向备考者把这道题讲透，必须逐项包含：',
    '   ①【正确答案的意思与用法】：该词/语法/表达的准确含义、词性、读音或活用、常见搭配与语感、适用场景；',
    '   ②【涉及的知识点】：这道题考查的语法点或词汇知识（如接续、活用形、敬语层级、近义辨析、汉字音训、惯用固定用法等），点明规则；',
    '   ③【为什么这个选项正确】：结合句意/语境说明为何该选项唯一成立；',
    '   ④【逐一说明每个干扰项为什么错】：对其余 3 个选项各自说明它的意思是什么、为什么在此处不对（搭配不当/语义偏差/活用错误/语体不符/张冠李戴等），不要只笼统带过。',
    '   宁详勿简，写成能让学习者真正学会的讲解（通常 4-8 句以上）。',
    '5. 阅读/文章语法/听力：passage 完整原创；同一篇的多题 passage 一字不差重复，group 填同一短 slug；单题 passage 留空、group 留空。',
    '6. difficulty 为该级别内部难度 1-5（3=标准）。qtype 固定填 "' + qtype + '"。',
    '直接输出结构化结果。',
  ].join('\n')
}

function verifyPrompt(level, qtype, qs) {
  const stripped = qs.map((q, i) => ({ index: i, stem: q.stem, passage: q.passage || '', choices: q.choices }))
  return [
    '你是 JLPT ' + level + ' 级资深考官，盲审一批 ' + level + ' 模拟题（题型：' + qtype + '）。你看不到出题人答案，必须完全独立作答。',
    QTYPE_SPEC[qtype] ? '【题型说明】' + QTYPE_SPEC[qtype] : '',
    '逐题：1) 独立解题给出唯一正确 answerIndex(0-3)；若无正确项/多个可辩护/组句排序不唯一/即時応答无唯一得体应答，填 -1 且 fatal=true。',
    '2) 检查日语是否自然、有无语法用字错误、难度是否明显偏离 ' + level + '（如 ' + level + ' 题里塞了超纲考点）。有致命问题 fatal=true 并在 note 说明。',
    '3) 轻微瑕疵不算 fatal，仅在 note 备注。',
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
    if (!q.explanation) continue
    const needsPassage = batch.qtype === 'text_grammar' || batch.qtype.startsWith('reading_') || LISTEN_QTYPES.has(batch.qtype)
    const minPassage = LISTEN_QTYPES.has(batch.qtype) ? (batch.qtype === 'listen_response' ? 6 : 20) : 30
    if (needsPassage && (!q.passage || q.passage.trim().length < minPassage)) continue
    out.push({
      level: batch.level, section: SECTION_OF[batch.qtype], qtype: batch.qtype,
      stem: q.stem.trim(), passage: (q.passage || '').trim(), group: (q.group || '').trim(),
      choices: q.choices.map(c => c.trim()), answerIndex: q.answerIndex,
      explanation: String(q.explanation).trim(), difficulty: Math.min(5, Math.max(1, q.difficulty || 3)),
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
        const ok = a && b2 && !a.fatal && !b2.fatal && a.answerIndex === q.answerIndex && b2.answerIndex === q.answerIndex
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
log(`${LEVEL} / ${GROUP}: 第一轮生成`)
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
