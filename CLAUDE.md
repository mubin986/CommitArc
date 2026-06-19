# CLAUDE.md

Guidance for Claude Code (and contributors) working in this repository.

## Project overview

**CommitArc** is a Next.js (App Router) app that analyzes a GitHub repo's commit
history over a date range or up to a tag, then generates AI reports with Claude.
There are three report types (`lib/types.ts` → `ReportType`): **technical** (an
engineering summary), **presentation** (a non-technical client briefing), and
**demo** (a punchy product-demo deck). Analysis and AI generation are decoupled:
analyzing fetches commits/stats with no AI call; each report is generated on demand
and stored on the record. The presentation and demo are viewable as a fullscreen
slide deck and exportable to Markdown/PPTX. See [README.md](README.md) for the full
feature list.

Stack: Next.js 16 (App Router, Turbopack), React 19, TypeScript (strict),
Tailwind CSS v4, `@anthropic-ai/sdk`. No database — history is JSON files on disk
under `data/` (gitignored).

## Commands

```bash
npm run dev        # dev server (http://localhost:3000)
npm run build      # production build (also type-checks)
npm start          # serve the production build
npm run typecheck  # tsc --noEmit
```

Always run `npm run build` before committing — it type-checks the whole project.

## Architecture (where things live)

- `app/` — pages (`/`, `/analyze`, `/history`, `/history/[id]`, `/present/[id]`)
  and API routes.
  - `api/analyze` — SSE, **analysis only** (no AI): `phase` / `repo` / `stats_progress` / `partial` / `done` / `error`.
  - `api/report` — SSE, generates one AI report (`?reportType`) and attaches it to the saved record.
  - `api/history`, `api/history/[id]` — server-side history CRUD.
  - `api/gh-status`, `api/ai-status`, `api/refs` — status/lookup helpers.
  - `api/publish` — pushes a report to a Gist / Wiki / Release via `gh` (+ `git`).
- `components/` — `Nav`, `ConfigForm` (analysis-only form), `ProgressPanel`,
  `AiSettings` (provider+model picker, used at generation time), `RecordView`
  (analysis + tabbed per-type report generation + export), `PublishMenu`
  (Gist/Wiki/Release popover), `Deck` (standalone fullscreen slide deck, opened
  in a new window via `/present/[id]`).
- `lib/` — `github.ts` (REST + `gh` CLI), `ai.ts` (technical/presentation/demo
  prompts + streaming), `reportMarkdown.ts` (server-safe report→Markdown),
  `slides.ts` (markdown → paginated slides), `claudeCreds.ts` (local Claude OAuth
  reader), `historyStore.ts` (fs), `useAnalysisStream.ts` / `useReportStream.ts`
  (client SSE hooks), `exportReport.ts` (Markdown/print), `exportPptx.ts`
  (pptxgenjs), `report.ts`, `types.ts`.

## Conventions

- **TypeScript strict.** No `any` except the narrow SSE-parse spots already marked
  with an eslint-disable. Prefer the shared types in `lib/types.ts`.
- **Theming via CSS variables.** Colors come from tokens in `app/globals.css`
  (`--bg`, `--panel`, `--border`, `--text`, …) with a `.dark` override. Use
  `text-[var(--text)]`, `bg-[var(--panel)]`, etc. — do not hardcode hex or rely on
  raw Tailwind grays, so light/dark both work. Mark print-hidden UI with `no-print`.
- **SSE pattern.** Routes return a `ReadableStream` emitting `event:`/`data:` lines;
  client hooks parse on `\n\n` boundaries. Follow the existing shape.
- **History is server-side** under `data/history/*.json`. Never read/write it from
  client code — go through `/api/history` and `lib/history.ts`.

## Claude / Anthropic specifics

- Default model is `claude-opus-4-8`. Allowed models: see `MODELS` in `lib/ai.ts`.
- **Adaptive thinking + `effort` are gated** (`THINKING_MODELS`) — Haiku 4.5 does
  not support them, so they're omitted for it. Keep that gating when adding models.
- **Local Claude OAuth marker is load-bearing.** `lib/ai.ts` sends the exact system
  block `"You are Claude Code, Anthropic's official CLI for Claude."` for the local
  provider so OAuth requests land in the right rate-limit bucket. Do not edit or
  remove it. The access token is read server-side only and never sent to the client.
- Don't hardcode API keys. Keys come from `ANTHROPIC_API_KEY`, the local Claude
  session, or a key the user pastes (stored only in their browser).

## Conventional Commits (required)

This repo uses **[Conventional Commits](https://www.conventionalcommits.org/)**, and
releases are automated from them (see Releases below). **Every commit must follow it.**

Format:

```
<type>(<optional scope>): <short imperative summary>

<optional body — what & why>

<optional footer — BREAKING CHANGE:, Refs: #123>
```

Types:

| Type | Use for | Version effect |
|---|---|---|
| `feat` | a new feature | minor bump |
| `fix` | a bug fix | patch bump |
| `perf` | a performance improvement | patch bump |
| `refactor` | code change that neither fixes a bug nor adds a feature | none |
| `docs` | documentation only | none |
| `style` | formatting/whitespace (no logic) | none |
| `test` | adding/fixing tests | none |
| `build` | build system or dependencies | none |
| `ci` | CI configuration | none |
| `chore` | maintenance, tooling, misc | none |

- A `!` after the type/scope **or** a `BREAKING CHANGE:` footer → **major** bump.
  Example: `feat(api)!: rename /api/analyze response shape`.
- Suggested scopes: `analyze`, `report`, `history`, `github`, `ai`, `ui`, `config`,
  `export`, `ci`.
- Subject: imperative mood, lowercase, no trailing period, ≤ ~72 chars.

Examples:

```
feat(report): add client presentation slide deck
fix(github): handle 404 on private repos with a clear hint
refactor(ai): split technical and presentation system prompts
chore(deps): bump next to 16.x
feat(history)!: store technical and presentation reports per analysis

BREAKING CHANGE: AnalyzeResponse.aiSummary replaced by reports{technical,presentation}.
```

## Releases

On every push to `main`, `.github/workflows/release.yml` runs
[conventional-changelog-action](https://github.com/TriPSs/conventional-changelog-action):
it computes the next version from the commits, updates `CHANGELOG.md` and
`package.json`, tags the commit, and opens a **draft GitHub Release** with the
generated notes. Review and publish the draft manually. The bump only happens when
there are releasable commits (`feat`/`fix`/breaking) since the last tag.

## Don'ts

- Don't commit `data/`, `.env*`, or secrets.
- Don't break the Claude Code system marker in `lib/ai.ts`.
- Don't add heavy client dependencies for things the app already does simply
  (PDF export is intentionally print-based; Markdown is built from data).
- Publishing (`/api/publish`) writes report content — which may include
  **private-repo data** — to GitHub (Gist/Wiki/Release). Keep it confirm-gated in
  the UI, never auto-publish, and redact the `gh` token from any error surfaced
  to the client (the wiki remote URL embeds it).
