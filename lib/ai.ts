import Anthropic from "@anthropic-ai/sdk";
import { readClaudeCredentials } from "./claudeCreds";
import type {
  CommitInfo,
  ReportStats,
  ReportType,
  RepoMeta,
} from "./types";

const MAX_COMMITS_IN_PROMPT = 400;
const MAX_TOKENS = 8000;

// Exact marker Anthropic requires (as a system *block*) for OAuth requests to
// land in the Claude-Code rate-limit bucket. Without it, local-Claude calls
// share a much smaller quota and 429 quickly. Do not edit this string.
const CC_SYSTEM_MARKER =
  "You are Claude Code, Anthropic's official CLI for Claude.";

export const MODELS = [
  { id: "claude-opus-4-8", label: "Claude Opus 4.8 (most capable)" },
  { id: "claude-opus-4-7", label: "Claude Opus 4.7" },
  { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6 (balanced)" },
  { id: "claude-haiku-4-5", label: "Claude Haiku 4.5 (fast & cheap)" },
] as const;

export const DEFAULT_MODEL = MODELS[0].id;
const MODEL_IDS = new Set<string>(MODELS.map((m) => m.id));

// Adaptive thinking + the `effort` parameter are unsupported on Haiku 4.5
// (and older Sonnet/Haiku), so we only send them for capable models.
const THINKING_MODELS = new Set<string>([
  "claude-opus-4-8",
  "claude-opus-4-7",
  "claude-sonnet-4-6",
]);
const supportsThinking = (model: string) => THINKING_MODELS.has(model);

export function resolveModel(model?: string): string {
  return model && MODEL_IDS.has(model) ? model : DEFAULT_MODEL;
}

export type AiProvider = "local" | "apiKey";

export interface GenerateOptions {
  provider: AiProvider;
  /** Required when provider === "apiKey". */
  apiKey?: string;
  model: string;
  reportType?: ReportType;
}

const SYSTEM_PROMPT = `You are a senior engineering analyst writing a release/changelog report for an engineering team and their stakeholders.

You are given metadata about a GitHub repository and a list of commits from a specific range. Produce a clear, well-structured report in GitHub-flavored Markdown.

Use these sections (omit any that don't apply):

## Executive Summary
A short paragraph (3-6 sentences) describing what happened in this range at a high level: the scope of work, overall direction, and notable outcomes.

## Key Changes & Themes
Group the work into themes (features, fixes, refactors, infra, docs, tests, deps). Use bullet points. Reference concrete commits by short SHA where helpful.

## Notable Commits
A short list of the most significant individual commits and why they matter.

## Contributor Activity
Summarize who did what. Reference the contributor stats.

## Risks & Areas of Attention
Anything that looks risky, breaking, or worth reviewing (large diffs, reverts, security-related, dependency bumps, migrations). If nothing stands out, say so briefly.

Guidelines:
- Be specific and grounded in the commits provided. Do not invent changes that aren't supported by the data.
- Infer intent from commit messages, but flag when something is ambiguous.
- Keep it concise and skimmable. Prefer bullets over long prose.
- Do not include a top-level # title — start at the ## sections.`;

const PRESENTATION_SYSTEM_PROMPT = `You are a product manager preparing a CLIENT-FACING progress presentation. The audience is a non-technical client/stakeholder who is paying for this project and wants to see what has been delivered and the value it brings — NOT how it was built.

You are given the commit history for a release (or the range between two releases). Translate the underlying work into a clear, benefit-oriented presentation in GitHub-flavored Markdown, structured as slides.

Hard rules:
- The audience is non-technical. NEVER mention commit SHAs, file or folder names, function/class/variable names, branches, databases, frameworks or libraries, or engineering jargon (avoid words like "commit", "refactor", "API", "endpoint", "schema", "index", "migration", "backend", "frontend"). Speak only in terms of features, capabilities, screens, and outcomes.
- Focus entirely on the product: what users/clients can now do, what was added or improved, and why it matters to them.
- Be confident and concrete, but honest — only claim what the work supports. Group related work into themes/features rather than listing individual changes.
- Keep it presentation-ready: short headline sections with tight, benefit-oriented bullets a presenter can speak to.

Structure — each "## " heading becomes one slide, so keep each slide focused and short:
## What's in this release
One or two sentences framing this release at a high level (the headline message).
## Highlights
3-5 of the most important things delivered, each a short benefit-oriented bullet.
## What's new
The delivered features grouped by area/theme, in plain language describing what the client/users get.
## Improvements & polish
Smaller enhancements, fixes, and refinements — only if applicable.
## What's next
A brief, forward-looking note ONLY if the work hints at in-progress or upcoming features; otherwise omit this slide.

Do not include a top-level # title. Start at the first ## slide. Do not include a technical changelog or any code-level detail.`;

const DEMO_SYSTEM_PROMPT = `You are preparing a live PRODUCT DEMO deck for a CLIENT. The audience is non-technical and is paying for this project. This is NOT an essay or a story — it is a punchy, scannable demo script the presenter clicks through. Every slide must be tight and easy to present from at a glance.

Write GitHub-flavored Markdown structured as slides — each "## " heading is one slide. Keep slides SHORT: a clear headline plus a few crisp BULLET points. No long paragraphs, no storytelling prose. Bullets are benefit-led and concrete — what the user can now do and why it's good. No engineering detail or jargon (no commit SHAs, file names, frameworks, databases, "API", "endpoint", "refactor", "backend", etc.).

Structure the demo (adapt headings to the ACTUAL product; omit anything that doesn't apply):
## <Release headline>
One line stating what this demo shows (e.g. "What's new in the IFEN Learning Portal — v0.3.0").
## Demo flow
A short numbered list (3-6 steps) of the path you'll walk through — the agenda for the demo.
## <Feature or area #1>
3-5 short benefit bullets (what it does for the user + why it matters). Add ONE line starting with "**Show:**" cueing what to click or point at on screen.
## <Feature or area #2>
…one slide per key feature/area, same shape. Cover the 4-7 most important features as their own slides…
## Why it matters
3-4 punchy bullets on the impact and value for the client.
## What's next
A few short bullets on what's coming — only if the work hints at it.

Rules:
- Punchy and skimmable. Short bullets, NOT paragraphs. Lead each bullet with the benefit.
- One slide per feature or theme. Keep each feature slide to ~5 bullets max so it fits on screen.
- Include a single "**Show:**" cue on each feature slide describing what to demonstrate live.
- Be specific to THIS product based on the commits, but speak in outcomes the client sees, not implementation.
- Do not include a top-level # title; start at the first ## slide.`;

function systemFor(reportType?: ReportType): string {
  if (reportType === "presentation") return PRESENTATION_SYSTEM_PROMPT;
  if (reportType === "demo") return DEMO_SYSTEM_PROMPT;
  return SYSTEM_PROMPT;
}

export interface SummaryInput {
  repo: RepoMeta;
  rangeLabel: string;
  stats: ReportStats;
  commits: CommitInfo[];
  truncated: boolean;
}

function buildUserPrompt(input: SummaryInput): string {
  const { repo, rangeLabel, stats, commits, truncated } = input;
  const lines: string[] = [];

  lines.push(`Repository: ${repo.fullName}`);
  if (repo.description) lines.push(`Description: ${repo.description}`);
  lines.push(`Visibility: ${repo.private ? "private" : "public"}`);
  lines.push(`Range: ${rangeLabel}`);
  lines.push("");
  lines.push("Aggregate stats:");
  lines.push(`- Commits: ${stats.totalCommits}`);
  if (stats.statsAvailable) {
    lines.push(`- Additions: ${stats.totalAdditions}`);
    lines.push(`- Deletions: ${stats.totalDeletions}`);
    lines.push(`- File changes (sum across commits): ${stats.fileChanges}`);
  } else {
    lines.push(
      "- Diff stats unavailable (too many commits to fetch per-commit stats).",
    );
  }
  if (stats.firstCommitDate)
    lines.push(`- First commit: ${stats.firstCommitDate}`);
  if (stats.lastCommitDate)
    lines.push(`- Last commit: ${stats.lastCommitDate}`);
  lines.push("");

  lines.push("Contributors:");
  for (const a of stats.authors.slice(0, 25)) {
    const handle = a.login ? ` (@${a.login})` : "";
    const diff = stats.statsAvailable
      ? `, +${a.additions}/-${a.deletions}`
      : "";
    lines.push(`- ${a.name}${handle}: ${a.commits} commits${diff}`);
  }
  lines.push("");

  const chronological = [...commits].reverse().slice(0, MAX_COMMITS_IN_PROMPT);
  lines.push(
    `Commits (oldest first, ${chronological.length} shown). Each commit's FULL message — subject and body — is included; use the bodies, not just the subjects:`,
  );
  for (const c of chronological) {
    const msg = c.message.trim();
    const subject = msg.split("\n")[0].slice(0, 300);
    const handle = c.author.login ? `@${c.author.login}` : c.author.name;
    const stat = c.stats ? ` [+${c.stats.additions}/-${c.stats.deletions}]` : "";
    const date = c.date ? c.date.slice(0, 10) : "";
    lines.push(`- ${c.shortSha} ${date} ${handle}: ${subject}${stat}`);
    const body = msg.split("\n").slice(1).join("\n").trim();
    if (body) {
      // Indent the body so the model can tell it apart from the next commit.
      for (const bl of body.slice(0, 2000).split("\n")) {
        lines.push(`    ${bl}`);
      }
    }
  }

  if (truncated || commits.length > MAX_COMMITS_IN_PROMPT) {
    lines.push("");
    lines.push(
      "Note: the commit list was truncated; base the report on the commits shown but acknowledge the range is larger.",
    );
  }

  return lines.join("\n");
}

const thinkingParams = (model: string) =>
  supportsThinking(model)
    ? {
        thinking: { type: "adaptive" as const },
        output_config: { effort: "medium" as const },
      }
    : {};

/** Raw body for the local OAuth path (system marker + report prompt). */
function localRequestBody(
  input: SummaryInput,
  model: string,
  stream: boolean,
  system: string,
) {
  return {
    model,
    max_tokens: MAX_TOKENS,
    stream,
    ...thinkingParams(model),
    system: [
      { type: "text", text: CC_SYSTEM_MARKER },
      { type: "text", text: system },
    ],
    messages: [{ role: "user", content: buildUserPrompt(input) }],
  };
}

function apiParams(input: SummaryInput, model: string, system: string) {
  return {
    model,
    max_tokens: MAX_TOKENS,
    ...thinkingParams(model),
    system,
    messages: [{ role: "user" as const, content: buildUserPrompt(input) }],
  };
}

function getLocalToken(): string {
  const creds = readClaudeCredentials();
  if (!creds.available || !creds.accessToken) {
    throw new Error(
      "No local Claude credentials found. Run `claude` and log in, or use an API key.",
    );
  }
  if (creds.expired) {
    throw new Error(
      "Local Claude session has expired. Re-open `claude` to refresh it, or use an API key.",
    );
  }
  return creds.accessToken;
}

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const oauthHeaders = (token: string) => ({
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
  "anthropic-version": "2023-06-01",
  "anthropic-beta": "oauth-2025-04-20",
  "User-Agent": "commitarc/1.0",
});

// ---------------------------------------------------------------------------
// Streaming generators (yield text deltas)
// ---------------------------------------------------------------------------

async function* summaryStreamViaLocal(
  input: SummaryInput,
  model: string,
  system: string,
): AsyncGenerator<string> {
  const token = getLocalToken();
  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: oauthHeaders(token),
    body: JSON.stringify(localRequestBody(input, model, true, system)),
  });
  if (!res.ok || !res.body) {
    const text = res.ok ? "" : await res.text().catch(() => "");
    throw new Error(
      `Local Claude request failed (${res.status}): ${text.slice(0, 300)}`,
    );
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.indexOf("\n\n")) !== -1) {
      const block = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      for (const line of block.split("\n")) {
        const m = line.match(/^data: (.*)$/);
        if (!m) continue;
        if (m[1] === "[DONE]") return;
        try {
          const ev = JSON.parse(m[1]) as {
            type?: string;
            delta?: { type?: string; text?: string };
          };
          if (
            ev.type === "content_block_delta" &&
            ev.delta?.type === "text_delta" &&
            ev.delta.text
          ) {
            yield ev.delta.text;
          }
        } catch {
          /* ignore malformed line */
        }
      }
    }
  }
}

async function* summaryStreamViaApiKey(
  input: SummaryInput,
  apiKey: string,
  model: string,
  system: string,
): AsyncGenerator<string> {
  const client = new Anthropic({ apiKey });
  const stream = client.messages.stream(apiParams(input, model, system));
  for await (const event of stream) {
    if (
      event.type === "content_block_delta" &&
      event.delta.type === "text_delta"
    ) {
      yield event.delta.text;
    }
  }
}

export async function* generateSummaryStream(
  input: SummaryInput,
  opts: GenerateOptions,
): AsyncGenerator<string> {
  const model = resolveModel(opts.model);
  const system = systemFor(opts.reportType);
  if (opts.provider === "local") {
    yield* summaryStreamViaLocal(input, model, system);
    return;
  }
  if (!opts.apiKey) {
    throw new Error("An Anthropic API key is required for the API-key provider.");
  }
  yield* summaryStreamViaApiKey(input, opts.apiKey, model, system);
}
