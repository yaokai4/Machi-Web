"use client";

// Admin JLPT 题库/词汇批量导入页 (W2-4)。粘贴 JSON → 客户端逐行预校验(规则
// 对照 server_jlpt.py import_questions/import_vocab, :1101-:1218) → 调
// /api/admin/jlpt/{questions,vocab}/import → 展示服务端 inserted/updated/
// skipped 计数。服务端才是校验权威(坏行跳过不致命),预校验只是为了在导入前
// 把「会被跳过的行 + 原因」摆到管理员面前。

import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, FileInput, Loader2, Upload, XCircle } from "lucide-react";
import { GuideAdminShell } from "@/components/guide/GuideAdminKit";
import { adminGuide } from "@/lib/guide";
import { useToasts } from "@/lib/store";

type ImportKind = "questions" | "vocab";

// 与 server_jlpt.py 的白名单/上限保持一致 (LEVELS/SECTIONS/IMPORT_MAX_ROWS)。
const LEVELS = ["N1", "N2", "N3", "N4", "N5"] as const;
const SECTIONS = ["vocab", "grammar", "reading", "listening"] as const;
const IMPORT_MAX_ROWS = 2000;

interface RowIssue {
  row: number; // 1-based
  kind: "skip" | "warn";
  message: string;
}

interface ValidationResult {
  total: number;
  importable: number;
  skipped: number;
  issues: RowIssue[];
  overflow: number; // rows beyond IMPORT_MAX_ROWS the server will ignore
}

function parseItems(content: string): Record<string, unknown>[] | null {
  try {
    const data = JSON.parse(content);
    if (Array.isArray(data)) return data as Record<string, unknown>[];
    if (data && typeof data === "object" && Array.isArray((data as { items?: unknown }).items)) {
      return (data as { items: Record<string, unknown>[] }).items;
    }
    return null;
  } catch {
    return null;
  }
}

// 镜像 server_jlpt.import_questions 的跳行条件；此外把「会被静默回退/截断」
// 的字段作为警告列出(服务端不报告这些)。
function validateQuestions(items: unknown[]): ValidationResult {
  const issues: RowIssue[] = [];
  let importable = 0;
  let skipped = 0;
  const capped = items.slice(0, IMPORT_MAX_ROWS);
  capped.forEach((raw, i) => {
    const row = i + 1;
    const skip = (message: string) => {
      skipped += 1;
      issues.push({ row, kind: "skip", message });
    };
    const warn = (message: string) => issues.push({ row, kind: "warn", message });

    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      skip("不是 JSON 对象");
      return;
    }
    const r = raw as Record<string, unknown>;
    const stem = String(r.stem ?? "").trim();
    if (!stem) {
      skip("缺少 stem（题干）");
      return;
    }
    let choices: unknown = r.choices;
    if (typeof choices === "string") {
      try {
        choices = JSON.parse(choices);
      } catch {
        choices = null;
      }
    }
    if (!Array.isArray(choices) || choices.length < 2) {
      skip("choices 需为至少 2 个选项的数组");
      return;
    }
    const ansRaw = r.answerIndex ?? r.answer_index ?? 0;
    const ans = Number(ansRaw);
    if (!Number.isInteger(ans)) {
      skip(`answerIndex「${String(ansRaw)}」不是整数`);
      return;
    }
    if (ans < 0 || ans >= choices.length) {
      skip(`answerIndex=${ans} 越界（选项数 ${choices.length}，合法范围 0-${choices.length - 1}）`);
      return;
    }

    const level = String(r.level ?? "").trim().toUpperCase();
    if (!(LEVELS as readonly string[]).includes(level)) {
      warn(`level「${String(r.level ?? "")}」不在 N1-N5，导入时将回退为 N5`);
    }
    const section = String(r.section ?? "").trim().toLowerCase();
    if (!(SECTIONS as readonly string[]).includes(section)) {
      warn(`section「${String(r.section ?? "")}」不在 vocab/grammar/reading/listening，导入时将回退为 vocab`);
    }
    if (choices.length > 8) warn(`choices 有 ${choices.length} 项，只保留前 8 项`);
    if (stem.length > 4000) warn("stem 超过 4000 字，将被截断");
    if (String(r.explanation ?? "").length > 4000) warn("explanation 超过 4000 字，将被截断");
    const reviewStatus = String(r.reviewStatus ?? r.review_status ?? "").trim();
    if (!reviewStatus) {
      warn("未提供 reviewStatus，默认按 approved（直接进入抽题池）导入；未人工审核的题请显式设为 pending");
    }
    importable += 1;
  });
  return {
    total: items.length,
    importable,
    skipped,
    issues,
    overflow: Math.max(0, items.length - IMPORT_MAX_ROWS),
  };
}

// 镜像 server_jlpt.import_vocab 的跳行条件。
function validateVocab(items: unknown[]): ValidationResult {
  const issues: RowIssue[] = [];
  let importable = 0;
  let skipped = 0;
  const capped = items.slice(0, IMPORT_MAX_ROWS);
  capped.forEach((raw, i) => {
    const row = i + 1;
    const skip = (message: string) => {
      skipped += 1;
      issues.push({ row, kind: "skip", message });
    };
    const warn = (message: string) => issues.push({ row, kind: "warn", message });

    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      skip("不是 JSON 对象");
      return;
    }
    const r = raw as Record<string, unknown>;
    if (!String(r.word ?? "").trim()) {
      skip("缺少 word（单词）");
      return;
    }
    if (!String(r.meaningZh ?? r.meaning_zh ?? "").trim()) {
      skip("缺少 meaningZh（中文释义）");
      return;
    }
    const level = String(r.level ?? "").trim().toUpperCase();
    if (!(LEVELS as readonly string[]).includes(level)) {
      warn(`level「${String(r.level ?? "")}」不在 N1-N5，导入时将回退为 N5`);
    }
    importable += 1;
  });
  return {
    total: items.length,
    importable,
    skipped,
    issues,
    overflow: Math.max(0, items.length - IMPORT_MAX_ROWS),
  };
}

const QUESTION_EXAMPLE = `[
  {
    "level": "N2",
    "section": "grammar",
    "stem": "彼は忙しい（　）、手伝ってくれた。",
    "choices": ["にもかかわらず", "おかげで", "ばかりに", "あまり"],
    "answerIndex": 0,
    "explanation": "「にもかかわらず」表示逆接：尽管忙,还是帮了忙。",
    "difficulty": 3,
    "tags": "逆接,接续",
    "reviewStatus": "pending"
  }
]`;

const VOCAB_EXAMPLE = `[
  {
    "level": "N3",
    "word": "取り組む",
    "reading": "とりくむ",
    "meaningZh": "致力于；认真处理",
    "meaningEn": "to tackle; to work on",
    "pos": "动词",
    "example": "新しい課題に取り組む。",
    "exampleZh": "着手处理新的课题。",
    "tags": "高频"
  }
]`;

interface ImportCounts {
  inserted: number;
  updated: number;
  skipped: number;
  total: number;
}

export function JlptAdminImportPage() {
  const pushToast = useToasts((s) => s.push);
  const [kind, setKind] = useState<ImportKind>("questions");
  const [content, setContent] = useState("");
  const [result, setResult] = useState<ImportCounts | null>(null);

  const items = useMemo(() => parseItems(content), [content]);
  const validation = useMemo(() => {
    if (!items) return null;
    return kind === "questions" ? validateQuestions(items) : validateVocab(items);
  }, [items, kind]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!items) throw new Error("JSON 解析失败");
      return kind === "questions" ? adminGuide.importJlptQuestions(items) : adminGuide.importJlptVocab(items);
    },
    onSuccess: (data) => {
      setResult(data);
      pushToast({ kind: "success", message: `导入完成：新增 ${data.inserted}、更新 ${data.updated}、跳过 ${data.skipped}` });
    },
    onError: (error) => pushToast({ kind: "error", message: error instanceof Error ? error.message : "导入失败" }),
  });

  const switchKind = (next: ImportKind) => {
    setKind(next);
    setResult(null);
  };

  const shownIssues = validation ? validation.issues.slice(0, 100) : [];

  return (
    <GuideAdminShell
      title="JLPT 题库导入"
      subtitle="粘贴 JSON 批量导入题目/词汇；导入前逐行预校验并列出会被跳过的行与原因，服务端按行独立处理（坏行跳过不影响其余行）。"
    >
      <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr]">
        <section className="rounded-kx-lg border border-kx-stroke/60 bg-kx-card p-4">
          <div className="mb-3 flex items-center gap-2">
            <FileInput className="h-5 w-5 text-kx-accent" />
            <h2 className="font-black">批量导入</h2>
            <select
              className="ml-auto h-9 rounded-kx-md border border-kx-stroke/70 bg-kx-card px-3 text-sm"
              value={kind}
              onChange={(e) => switchKind(e.target.value as ImportKind)}
            >
              <option value="questions">题目（questions）</option>
              <option value="vocab">词汇（vocab）</option>
            </select>
          </div>
          <textarea
            className="min-h-[360px] w-full rounded-kx-md border border-kx-stroke/70 bg-kx-soft/40 p-3 font-mono text-xs outline-none"
            value={content}
            onChange={(e) => {
              setContent(e.target.value);
              setResult(null);
            }}
            placeholder='粘贴 JSON 数组，或 {"items": [...]} 包装对象'
          />

          {/* 逐行预校验结果 */}
          {content.trim() && !items ? (
            <p className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-kx-danger">
              <XCircle className="h-4 w-4" /> JSON 解析失败：需要数组或含 items 数组的对象
            </p>
          ) : null}
          {validation ? (
            <div className="mt-3 rounded-kx-md border border-kx-stroke/60 bg-kx-soft/40 p-3 text-sm">
              <p className="font-bold text-kx-text">
                共 {validation.total} 行：可导入 {validation.importable} 行
                {validation.skipped > 0 ? `，将被跳过 ${validation.skipped} 行` : ""}
                {validation.overflow > 0 ? `（超出单次上限 ${IMPORT_MAX_ROWS} 行，最后 ${validation.overflow} 行本次不会被处理）` : ""}
              </p>
              {shownIssues.length > 0 ? (
                <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto text-xs">
                  {shownIssues.map((issue, i) => (
                    <li key={`${issue.row}-${i}`} className="flex items-start gap-1.5">
                      {issue.kind === "skip" ? (
                        <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-kx-danger" />
                      ) : (
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                      )}
                      <span className={issue.kind === "skip" ? "text-kx-danger" : "text-kx-subtle"}>
                        第 {issue.row} 行{issue.kind === "skip" ? "（跳过）" : "（警告）"}：{issue.message}
                      </span>
                    </li>
                  ))}
                  {validation.issues.length > shownIssues.length ? (
                    <li className="text-kx-muted">… 还有 {validation.issues.length - shownIssues.length} 条未显示</li>
                  ) : null}
                </ul>
              ) : (
                <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-kx-subtle">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> 全部行通过预校验
                </p>
              )}
            </div>
          ) : null}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              className="kx-button-primary"
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending || !items || (validation ? validation.importable === 0 : true)}
            >
              {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} 开始导入
            </button>
            <button
              className="kx-button-ghost"
              onClick={() => {
                setContent(kind === "questions" ? QUESTION_EXAMPLE : VOCAB_EXAMPLE);
                setResult(null);
              }}
              disabled={mutation.isPending}
            >
              填入示例
            </button>
          </div>

          {/* 服务端导入计数 */}
          {result ? (
            <div className="mt-3 rounded-kx-md border border-emerald-400/30 bg-emerald-400/[0.06] p-3 text-sm">
              <p className="inline-flex items-center gap-1.5 font-bold text-kx-text">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" /> 服务端导入完成
              </p>
              <p className="mt-1 text-xs text-kx-subtle">
                新增 {result.inserted} 条 · 更新 {result.updated} 条 · 跳过 {result.skipped} 条 · 实际写入 {result.total} 条
              </p>
            </div>
          ) : null}
        </section>

        <section className="rounded-kx-lg border border-kx-stroke/60 bg-kx-card p-4 text-sm">
          <h2 className="mb-2 font-black">格式说明（{kind === "questions" ? "题目" : "词汇"}）</h2>
          {kind === "questions" ? (
            <ul className="list-disc space-y-1.5 pl-4 text-xs leading-5 text-kx-subtle">
              <li><b>必填</b>：stem（题干，≤4000 字）、choices（2-8 个选项的数组）、answerIndex（0 起的正确项下标）。</li>
              <li>level：N1-N5（非法值回退 N5）；section：vocab / grammar / reading / listening（非法值回退 vocab）。</li>
              <li>可选：passage（≤8000）、explanation（≤4000）、difficulty（1-5，默认 3）、tags、isMemberOnly、sortOrder。</li>
              <li>reviewStatus 默认 <b>approved</b>、status 默认 <b>published</b> —— 即导入后直接进入练习/模考抽题池；<b>未经人工审核的题必须显式设 &quot;reviewStatus&quot;: &quot;pending&quot;</b>。</li>
              <li>提供 id 则按 id 更新（幂等重导），否则新建。source 默认 imported。</li>
              <li>单次最多 {IMPORT_MAX_ROWS} 行；坏行服务端自动跳过，不影响其余行。</li>
              <li>内容必须为原创或已授权，<b>禁止粘贴 JLPT 官方历年真题原文</b>。</li>
            </ul>
          ) : (
            <ul className="list-disc space-y-1.5 pl-4 text-xs leading-5 text-kx-subtle">
              <li><b>必填</b>：word（单词，≤128 字）、meaningZh（中文释义，≤512 字）。</li>
              <li>level：N1-N5（非法值回退 N5）。</li>
              <li>可选：reading（读音）、meaningEn、pos（词性）、example / exampleZh（例句，各 ≤512）、tags、sortOrder。</li>
              <li>提供 id 则按 id 更新（幂等重导），否则新建。source 默认 imported，status 默认 published。</li>
              <li>单次最多 {IMPORT_MAX_ROWS} 行；坏行服务端自动跳过，不影响其余行。</li>
              <li>导入后可用「/api/admin/jlpt/deck/upsert」把词组织进词表（deck）供前台背诵。</li>
            </ul>
          )}
          <p className="mt-3 mb-1 text-xs font-bold text-kx-muted">示例 JSON</p>
          <pre className="overflow-x-auto rounded-kx-md border border-kx-stroke/60 bg-kx-soft/40 p-3 font-mono text-[11px] leading-4 text-kx-subtle">
            {kind === "questions" ? QUESTION_EXAMPLE : VOCAB_EXAMPLE}
          </pre>
        </section>
      </div>
    </GuideAdminShell>
  );
}
