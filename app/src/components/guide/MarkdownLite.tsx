"use client";

// A dependency-free "markdown-lite" renderer for Guide article bodies.
// Supports exactly the subset the Guide editor emits:
//   ## / ### headings, - unordered lists, 1. ordered lists,
//   | pipe | tables |, **bold**, and [text](url) links.
// Everything else renders as a normal paragraph, preserving single line breaks.
// It is intentionally NOT a general markdown engine — no HTML passthrough, no
// images, no raw script — so article bodies can't inject markup. Colors come
// from kx-* tokens, so light/dark are both covered with no hand-written dark:.

import { Fragment, type ReactNode } from "react";

// ---- inline: **bold** and [text](url) --------------------------------------

// Only http(s) and in-app (/...) links are allowed through; anything else
// (javascript:, data:, mailto with tricks) renders as plain text.
function safeHref(raw: string): string | null {
  const href = raw.trim();
  if (/^https?:\/\//i.test(href)) return href;
  if (href.startsWith("/") && !href.startsWith("//")) return href;
  return null;
}

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  // Split on **bold** or [text](url), keeping the delimiters via capture groups.
  const pattern = /(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g;
  const parts = text.split(pattern);
  parts.forEach((part, i) => {
    if (!part) return;
    const boldMatch = /^\*\*([^*]+)\*\*$/.exec(part);
    if (boldMatch) {
      nodes.push(
        <strong key={`${keyPrefix}-b${i}`} className="font-black text-kx-text">
          {boldMatch[1]}
        </strong>,
      );
      return;
    }
    const linkMatch = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
    if (linkMatch) {
      const href = safeHref(linkMatch[2]);
      if (href) {
        const external = /^https?:\/\//i.test(href);
        nodes.push(
          <a
            key={`${keyPrefix}-a${i}`}
            href={href}
            {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
            className="font-bold text-kx-accent underline decoration-kx-accent/40 underline-offset-2 hover:decoration-kx-accent"
          >
            {linkMatch[1]}
          </a>,
        );
        return;
      }
      // Unsafe URL: show the visible text only.
      nodes.push(<Fragment key={`${keyPrefix}-t${i}`}>{linkMatch[1]}</Fragment>);
      return;
    }
    nodes.push(<Fragment key={`${keyPrefix}-p${i}`}>{part}</Fragment>);
  });
  return nodes;
}

// ---- block-level -----------------------------------------------------------

type Block =
  | { kind: "heading"; level: 2 | 3; text: string }
  | { kind: "ul"; items: string[] }
  | { kind: "ol"; items: string[] }
  | { kind: "table"; header: string[]; rows: string[][] }
  | { kind: "p"; text: string };

function splitRow(line: string): string[] {
  // | a | b | c |  ->  ["a","b","c"]
  return line
    .replace(/^\s*\|/, "")
    .replace(/\|\s*$/, "")
    .split("|")
    .map((c) => c.trim());
}

function isDividerRow(line: string): boolean {
  // | --- | :--: | ---: |
  return /^\s*\|?[\s:|-]+\|?\s*$/.test(line) && line.includes("-");
}

function parseBlocks(body: string): Block[] {
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length) {
      blocks.push({ kind: "p", text: paragraph.join("\n") });
      paragraph = [];
    }
  };

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      flushParagraph();
      i += 1;
      continue;
    }

    // Headings: ## or ###
    const heading = /^(#{2,3})\s+(.*)$/.exec(trimmed);
    if (heading) {
      flushParagraph();
      blocks.push({ kind: "heading", level: heading[1].length === 2 ? 2 : 3, text: heading[2].trim() });
      i += 1;
      continue;
    }

    // Tables: a header row starting with | followed by a divider row.
    if (trimmed.startsWith("|") && i + 1 < lines.length && isDividerRow(lines[i + 1])) {
      flushParagraph();
      const header = splitRow(trimmed);
      const rows: string[][] = [];
      i += 2; // skip header + divider
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        rows.push(splitRow(lines[i].trim()));
        i += 1;
      }
      blocks.push({ kind: "table", header, rows });
      continue;
    }

    // Unordered list: -, *, or •
    if (/^[-*•]\s+/.test(trimmed)) {
      flushParagraph();
      const items: string[] = [];
      while (i < lines.length && /^[-*•]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*•]\s+/, ""));
        i += 1;
      }
      blocks.push({ kind: "ul", items });
      continue;
    }

    // Ordered list: 1. 2. 3.
    if (/^\d+[.)]\s+/.test(trimmed)) {
      flushParagraph();
      const items: string[] = [];
      while (i < lines.length && /^\d+[.)]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+[.)]\s+/, ""));
        i += 1;
      }
      blocks.push({ kind: "ol", items });
      continue;
    }

    // Otherwise accumulate into a paragraph (single newlines preserved).
    paragraph.push(line);
    i += 1;
  }
  flushParagraph();
  return blocks;
}

export function MarkdownLite({ body }: { body: string }) {
  const blocks = parseBlocks(body || "");
  return (
    <div className="space-y-4">
      {blocks.map((block, idx) => {
        switch (block.kind) {
          case "heading":
            return block.level === 2 ? (
              <h2 key={idx} className="mt-6 text-xl font-black text-kx-text sm:text-2xl">
                {renderInline(block.text, `h${idx}`)}
              </h2>
            ) : (
              <h3 key={idx} className="mt-5 text-lg font-black text-kx-text">
                {renderInline(block.text, `h${idx}`)}
              </h3>
            );
          case "ul":
            return (
              <ul key={idx} className="ml-1 space-y-1.5">
                {block.items.map((item, j) => (
                  <li key={j} className="flex gap-2 text-[15px] leading-8 text-kx-text/90">
                    <span className="mt-3 h-1.5 w-1.5 shrink-0 rounded-full bg-kx-accent" />
                    <span>{renderInline(item, `ul${idx}-${j}`)}</span>
                  </li>
                ))}
              </ul>
            );
          case "ol":
            return (
              <ol key={idx} className="ml-1 space-y-1.5">
                {block.items.map((item, j) => (
                  <li key={j} className="flex gap-2 text-[15px] leading-8 text-kx-text/90">
                    <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-kx-accentSoft text-[11px] font-black text-kx-accent">
                      {j + 1}
                    </span>
                    <span>{renderInline(item, `ol${idx}-${j}`)}</span>
                  </li>
                ))}
              </ol>
            );
          case "table":
            return (
              <div key={idx} className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr>
                      {block.header.map((cell, j) => (
                        <th
                          key={j}
                          className="border border-kx-stroke/50 bg-kx-soft px-3 py-2 text-left font-black text-kx-text"
                        >
                          {renderInline(cell, `th${idx}-${j}`)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, r) => (
                      <tr key={r}>
                        {row.map((cell, c) => (
                          <td key={c} className="border border-kx-stroke/40 px-3 py-2 align-top text-kx-text/90">
                            {renderInline(cell, `td${idx}-${r}-${c}`)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          default:
            return (
              <p key={idx} className="whitespace-pre-line text-[15px] leading-8 text-kx-text/90">
                {renderInline(block.text, `p${idx}`)}
              </p>
            );
        }
      })}
    </div>
  );
}
