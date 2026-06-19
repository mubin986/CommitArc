# CommitArc

Analyze a GitHub repository's commit history over a **date range** or **up to a tag**, then generate an AI report with Claude — either a **technical engineering summary** or a **client-facing presentation**. Works with public and private repos.

## Features

- Paste any GitHub repo URL (`https://github.com/owner/repo`, `git@…`, or `owner/repo`).
- Two analysis modes:
  - **Date range** — `since` / `until` (+ optional branch).
  - **Up to a tag** — compare `baseTag → tag`, or list all commits reachable from a single tag.
- Aggregate stats: total commits, additions/deletions, file changes, per-contributor activity.
- Per-commit diff stats (additions/deletions/files) when the range is small enough.
- **AI report** in Markdown: executive summary, key changes & themes, notable commits, contributor activity, risks/areas of attention.
- **Analysis first, AI on demand:** analyzing a repo fetches commits + stats with **no AI call**. On the result page you choose which report(s) to generate — so you only spend AI tokens when you want a report, and can produce any combination from one analysis (all are stored together).
- **Three report types:**
  - **🛠 Technical report** — engineering summary: themes, notable commits, contributor activity, risks.
  - **📊 Client presentation** — a non-technical, feature-focused briefing for stakeholders.
  - **📖 Product demo** — a punchy, presenter-ready demo deck: a release headline, a **demo flow** agenda, one slide per key feature with benefit bullets and on-screen **"Show:"** cues, then why-it-matters and what's-next.
  The presentation and demo open as a **fullscreen slide deck** in a new window (each `##` section is a slide; arrow-key navigation, fullscreen, progress bar), and can be **exported to PowerPoint (.pptx)**.
- **Three AI providers** and **model selection** chosen **at generation time** (on the result page, next to the Generate buttons) — Opus 4.8 / Opus 4.7 / Sonnet 4.6 / Haiku 4.5.
- **Branch / tag picker:** click *Fetch branches & tags* to load the repo's refs; the branch and tag fields become autocomplete dropdowns (free-text still allowed).
- **Live progress (SSE):** analysis streams Server-Sent Events (fetch phases + per-commit stat progress), and report generation streams the **AI report token-by-token** as it's written.
- **Persistent history:** every analysis is saved server-side to a gitignored `data/history/` folder (one JSON per run). Re-enter a repo to see its previous runs inline, or open the **History** page to browse/filter all past analyses (by repo, by mode) and re-open any report instantly.
- **Export:** any report → **Markdown** or **Print / Save-as-PDF**; the client presentation and demo also export to **PowerPoint (.pptx)**.
- **Publish (via `gh`):** push a report to a **secret/public Gist** (shareable link, no repo access needed), the **repo Wiki** (best for the technical report), or append it to a **draft Release** for a tag. Each action confirms first, since it writes to GitHub.
- **Multi-page app:** a home page to configure a run, a dedicated `/analyze` page that streams the result, and `/history` + `/history/[id]` for browsing saved reports — with a sticky top nav.
- **Light / dark mode** toggle (defaults to your OS preference, persisted, no flash on load).
- **Private repos** via the local **GitHub CLI (`gh`)**. The app checks whether `gh` is installed and authenticated and shows step-by-step setup instructions in the UI if not.

## Prerequisites

- **Node.js 20+** and npm.
- *(optional)* the **GitHub CLI (`gh`)**, logged in — required for private repos (the app guides you through install/login).
- *(optional)* the **Claude CLI**, logged in — lets the app use your Claude subscription for AI reports with no API key. Otherwise set `ANTHROPIC_API_KEY` or paste a key in the UI.

## Quick start

```bash
npm install
cp .env.example .env.local   # optional keys (see below)
npm run dev                  # http://localhost:3000
```

Production:

```bash
npm run build
npm start
```

## Client presentations (incremental releases)

Pick **Client presentation** as the report type to generate a product-focused, non-technical summary for stakeholders. The AI is instructed to drop all engineering detail (no commit SHAs, files, frameworks, jargon) and speak in features, capabilities, and value — structured as slides.

Typical workflow for presenting progress release-by-release:

1. Release tag `v8` → analyze in **tag mode** with base = *(empty)* and tag = `v8` → present everything up to that release.
2. A week later, release `v15` → analyze with base = `v8`, tag = `v15` → the presentation covers **only what's new since the last one**.

On the report, click **▶ Present** for a fullscreen slide deck (← → / click to navigate, Esc to exit). Export via **Download Markdown** or **Print / Save-as-PDF**. A collapsed "Technical changelog" stays available for your own reference but isn't part of the client view. Each saved run is tagged 📊 Presentation or 🛠 Technical in history.

## AI providers

The AI report can be generated three ways — choose in the **AI provider & model** panel. CommitArc calls `GET /api/ai-status` to detect what's available and pre-selects the best option.

1. **Local Claude (recommended if you use the Claude CLI).** If you're logged in to Claude on this machine, CommitArc reuses that session — **no API key needed**, billed against your Claude subscription. It reads the Claude Code OAuth credentials the same way the CLI does:
   - `<CLAUDE_DIR>/.credentials.json` (Windows / Linux fallback), the macOS **Keychain**, or Linux **libsecret** (service `Claude Code-credentials`).
   - The access token stays server-side and is sent only to `api.anthropic.com`.
   - Not logged in? Run `claude` and sign in, then re-open the panel.
2. **Server key.** Set `ANTHROPIC_API_KEY` in `.env.local`.
3. **GUI key.** Paste a key in the app — stored only in your browser's `localStorage`, sent to your own server per request, never persisted server-side.

**Model selection:** pick `claude-opus-4-8` (default), `claude-opus-4-7`, `claude-sonnet-4-6`, or `claude-haiku-4-5`. Adaptive thinking + effort are applied automatically only for models that support them (Haiku runs without them).

## Environment variables

All optional — put them in `.env.local`:

| Variable | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Claude API key for the "Server key" provider. Not needed if you use **Local Claude** or the GUI key. Get one at [console.anthropic.com](https://console.anthropic.com/). |
| `CLAUDE_DIR` | Override the Claude credentials directory (auto-detected otherwise). |
| `GITHUB_TOKEN` | GitHub PAT for public repos / higher rate limit. Without it, anonymous GitHub REST is ~60 requests/hour. |

> Requests to the Claude API are streamed (API-key path) to avoid HTTP timeouts.

## Private repositories

CommitArc supports two ways to reach private repos:

1. **GitHub CLI (`gh`) — recommended for local use.** Tick **"Private repository"** in the UI. The app calls `GET /api/gh-status`, which checks:
   - is `gh` installed? (`gh --version`)
   - is it authenticated? (`gh auth status`)

   If either fails, the UI shows the exact commands to fix it:

   ```bash
   # install (pick your platform)
   brew install gh                       # macOS
   winget install --id GitHub.cli        # Windows
   sudo apt install gh                   # Debian/Ubuntu

   # authenticate
   gh auth login        # GitHub.com → HTTPS → browser (or paste a token)
   gh auth status       # verify
   ```

   Make sure the logged-in account has access to the repo, then click **Re-check**.

2. **`GITHUB_TOKEN`** with `repo` scope in `.env.local` — works without `gh` (and works when deployed to serverless, where `gh` isn't available). Leave the "Private repository" box unticked; the token is used automatically.

### Why `gh`, and when to use what

| Method | Works where | Friction | Multi-user |
|---|---|---|---|
| `gh` CLI | local / dev machine only | zero-config if already logged in | no (uses host's account) |
| `GITHUB_TOKEN` | anywhere, incl. serverless | paste a PAT once | no (one token) |
| GitHub OAuth/App | hosted web app | OAuth flow | yes (each user's own repos) |

`gh` is the lowest-friction option for a **local/personal tool** and is what this app defaults to for private repos. `GITHUB_TOKEN` is the portable fallback (e.g. if you deploy to Vercel, where `gh` doesn't exist). If you ever host CommitArc for multiple users, the right upgrade is **GitHub OAuth** so each visitor authorizes their own access — not implemented here.

## How it works

```
app/
  page.tsx                 Home — hero + config form (analysis only)
  analyze/page.tsx         Streams the analysis, saves it, redirects to the record
  history/page.tsx         History list + filters (report badges)
  history/[id]/page.tsx    Record hub: analysis + tabbed report generation
  present/[id]/page.tsx    Standalone fullscreen slide deck (new window)
  api/gh-status/route.ts   GET  → { installed, authenticated, version, account }
  api/ai-status/route.ts   GET  → { local availability, env key present, models }
  api/analyze/route.ts     POST → SSE (analysis only): phase / repo / stats_progress
                           / partial / done / error  (no AI)
  api/report/route.ts      POST → SSE: ai_start / ai_delta / ai_done / error,
                           then attaches the report to the record
  api/refs/route.ts        POST → { branches[], tags[] }
  api/publish/route.ts     POST → publish a report to a Gist / Wiki / Release (gh)
  api/history/route.ts     GET list (summaries) · POST save · DELETE clear all
  api/history/[id]/route.ts GET full record · DELETE one
components/
  Nav.tsx                  Sticky top nav + theme toggle
  ConfigForm.tsx           Repo/range form → stash request → /analyze
  ProgressPanel.tsx        Spinner + phase log + stats progress bar
  AiSettings.tsx           Provider + model picker (used at generation time)
  RecordView.tsx           Analysis + tabbed per-type report generation + export
  PublishMenu.tsx          Publish popover (Gist / Wiki / Release)
  Deck.tsx                 Polished slide deck (cover, progress bar, fullscreen)
lib/
  github.ts                URL parsing, gh-status, REST + gh CLI requests, commits, stats, refs
  claudeCreds.ts           cross-platform reader for local Claude OAuth credentials
  report.ts                aggregate stats (totals, per-author)
  ai.ts                    prompts (technical / presentation / demo) + streaming, model gating
  reportMarkdown.ts        server-safe report → Markdown builders
  slides.ts                parse report markdown into deck/PPTX slides (paginated)
  useAnalysisStream.ts     client hook: stream analysis, save record, expose savedId
  useReportStream.ts       client hook: stream one AI report via /api/report
  exportReport.ts          trigger Markdown download / print
  exportPptx.ts            build a .pptx (pptxgenjs) from a report
  historyStore.ts          server-side history (data/history/*.json) + attachReport
  history.ts               client fetch wrappers over /api/history
  types.ts                 shared types
data/
  history/                 saved analyses + generated reports (gitignored)
```

Flow: **Home** (`ConfigForm`) stashes the request and navigates to **`/analyze`**, which runs `useAnalysisStream` (SSE, **no AI**), saves the analysis to `/api/history`, and redirects to **`/history/[id]`**. There, `RecordView` shows the analysis with three report tabs — **Technical**, **Client presentation**, and **Product demo**. Click **Generate** on a tab to stream that AI report (`useReportStream` → `/api/report`), which is attached to the same record; generate any combination. The presentation and demo open as a fullscreen deck via `/present/[id]` (new window) and export to **Markdown / PPTX**; all reports **Print → Save-as-PDF**. The history list badges which reports each record has.

History lives in `data/history/<id>.json` (one file per analysis, capped at 50, oldest pruned). The analysis is saved on `/analyze`'s `done`; each generated report is then attached to that file by `/api/report`. The history list endpoint returns lightweight summaries; the full record (with reports) is fetched on demand when you open one.

- **Commit fetching** uses the GitHub REST API (`fetch`, paginated via the `Link` header) when unauthenticated/token mode, or shells out to `gh api --paginate` for the private path.
- **Tag compare** uses `GET /repos/{o}/{r}/compare/{base}...{head}` (capped at 250 commits by GitHub). A single tag without a base lists commits reachable from it.
- **Diff stats** are fetched per commit (concurrency-limited) only when a range has ≤ 80 commits; larger ranges show totals without additions/deletions to avoid excessive API calls.
- Large date ranges are capped (≈ 1000 commits over REST) and flagged as `truncated` in the report.

## Commits & releases

This project follows **[Conventional Commits](https://www.conventionalcommits.org/)** — see [CLAUDE.md](CLAUDE.md) for the full convention and project guidelines. Commit types drive automated versioning:

- `feat:` → minor bump · `fix:` → patch bump · `feat!:` or a `BREAKING CHANGE:` footer → major bump.

On every push to `main`, the [release workflow](.github/workflows/release.yml) — powered by [conventional-changelog-action](https://github.com/TriPSs/conventional-changelog-action) — bumps the version in `package.json`, updates `CHANGELOG.md`, tags the commit, and opens a **draft GitHub Release** with generated notes for you to review and publish.

## Notes & limits

- Unauthenticated GitHub REST is rate-limited to ~60 req/hour. Add `GITHUB_TOKEN` or use the `gh` path to avoid it.
- The AI report is grounded in the commit data passed to it (up to 400 commits in the prompt); for very large ranges it summarizes from the sample and says so.
- History is stored on disk under `data/` (gitignored). On an ephemeral/serverless host it won't persist; this app is designed to run locally or on a persistent host.

## License

MIT — see [LICENSE](LICENSE).
