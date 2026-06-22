import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type {
  AnalyzeRequest,
  CommitInfo,
  GhStatus,
  RepoMeta,
  TagTimeline,
  TaggedWork,
  TimelineTag,
} from "./types";

const execFileAsync = promisify(execFile);

const MAX_PAGES = 10; // hard cap for date-range listing (~1000 commits)
const STATS_LIMIT = 80; // fetch per-commit diff stats only up to this many commits
const STATS_CONCURRENCY = 6;
const EXEC_OPTS = { maxBuffer: 128 * 1024 * 1024 } as const;

export class GitHubError extends Error {
  status?: number;
  hint?: string;
  constructor(message: string, status?: number, hint?: string) {
    super(message);
    this.name = "GitHubError";
    this.status = status;
    this.hint = hint;
  }
}

interface RequestOpts {
  useGh: boolean;
  token?: string;
}

// ---------------------------------------------------------------------------
// URL parsing
// ---------------------------------------------------------------------------

export function parseRepoUrl(input: string): { owner: string; repo: string } {
  let s = input.trim();
  if (!s) throw new GitHubError("Repository URL is required.");
  s = s.replace(/^git@github\.com:/i, "");
  s = s.replace(/^https?:\/\/(www\.)?github\.com\//i, "");
  s = s.replace(/^github\.com\//i, "");
  s = s.replace(/\.git$/i, "");
  const parts = s.split("/").filter(Boolean);
  if (parts.length < 2) {
    throw new GitHubError(
      "Could not parse owner/repo. Use a URL like https://github.com/owner/repo",
    );
  }
  return { owner: parts[0], repo: parts[1] };
}

// ---------------------------------------------------------------------------
// `gh` CLI status
// ---------------------------------------------------------------------------

export async function getGhStatus(): Promise<GhStatus> {
  let version: string | null = null;
  try {
    const { stdout } = await execFileAsync("gh", ["--version"]);
    version = stdout.split("\n")[0]?.trim() ?? null;
  } catch {
    return {
      installed: false,
      authenticated: false,
      version: null,
      account: null,
      message: "GitHub CLI (gh) is not installed or not on PATH.",
    };
  }

  try {
    // `gh auth status` exits 0 when authenticated and writes to stderr.
    const { stdout, stderr } = await execFileAsync("gh", ["auth", "status"]);
    const text = `${stdout}\n${stderr}`;
    const account =
      text.match(/Logged in to github\.com (?:account )?([^\s(]+)/i)?.[1] ??
      text.match(/account ([^\s(]+)/i)?.[1] ??
      null;
    return {
      installed: true,
      authenticated: true,
      version,
      account,
      message: text.trim(),
    };
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string };
    return {
      installed: true,
      authenticated: false,
      version,
      account: null,
      message:
        (err.stderr || err.stdout || "Not logged in to GitHub.").trim(),
    };
  }
}

// ---------------------------------------------------------------------------
// Low-level request helpers (gh CLI or REST fetch)
// ---------------------------------------------------------------------------

function ghHeaders(token?: string): Record<string, string> {
  const h: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "commitarc",
  };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

async function restError(res: Response): Promise<GitHubError> {
  let message = res.statusText;
  try {
    const body = (await res.json()) as { message?: string };
    if (body.message) message = body.message;
  } catch {
    /* ignore */
  }
  return new GitHubError(`GitHub API ${res.status}: ${message}`, res.status);
}

function ghCliError(e: unknown): GitHubError {
  const err = e as { stderr?: string; message?: string };
  const raw = (err.stderr || err.message || "gh command failed").trim();
  let status: number | undefined;
  const m = raw.match(/HTTP (\d{3})/);
  if (m) status = Number(m[1]);
  return new GitHubError(raw, status);
}

/** Single-object request (e.g. repo metadata, commit detail, compare). */
async function ghRequest(path: string, opts: RequestOpts): Promise<unknown> {
  if (opts.useGh) {
    try {
      const { stdout } = await execFileAsync("gh", ["api", path], EXEC_OPTS);
      return JSON.parse(stdout);
    } catch (e) {
      throw ghCliError(e);
    }
  }
  const res = await fetch(`https://api.github.com/${path}`, {
    headers: ghHeaders(opts.token),
  });
  if (!res.ok) throw await restError(res);
  return res.json();
}

function parseNextLink(link: string | null): string | null {
  if (!link) return null;
  for (const part of link.split(",")) {
    if (part.includes('rel="next"')) {
      const m = part.match(/<([^>]+)>/);
      if (m) return m[1];
    }
  }
  return null;
}

/** Paginated array request. Returns { items, truncated }. */
async function ghPaginated(
  path: string,
  opts: RequestOpts,
): Promise<{ items: unknown[]; truncated: boolean }> {
  if (opts.useGh) {
    try {
      const { stdout } = await execFileAsync(
        "gh",
        ["api", "--paginate", path],
        EXEC_OPTS,
      );
      return { items: JSON.parse(stdout) as unknown[], truncated: false };
    } catch (e) {
      throw ghCliError(e);
    }
  }

  const items: unknown[] = [];
  const sep = path.includes("?") ? "&" : "?";
  let url: string | null = `https://api.github.com/${path}${sep}per_page=100`;
  let pages = 0;
  let truncated = false;

  while (url) {
    if (pages >= MAX_PAGES) {
      truncated = true;
      break;
    }
    const res = await fetch(url, { headers: ghHeaders(opts.token) });
    if (!res.ok) throw await restError(res);
    const batch = (await res.json()) as unknown[];
    items.push(...batch);
    url = parseNextLink(res.headers.get("link"));
    pages++;
  }
  return { items, truncated };
}

// ---------------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------------

interface RawCommit {
  sha: string;
  html_url?: string;
  commit?: {
    message?: string;
    author?: { name?: string; email?: string; date?: string };
    committer?: { date?: string };
  };
  author?: { login?: string } | null;
}

function mapCommit(c: RawCommit): CommitInfo {
  return {
    sha: c.sha,
    shortSha: c.sha.slice(0, 7),
    message: c.commit?.message ?? "",
    author: {
      name: c.commit?.author?.name ?? "Unknown",
      email: c.commit?.author?.email ?? "",
      login: c.author?.login ?? null,
    },
    date: c.commit?.author?.date ?? c.commit?.committer?.date ?? "",
    url: c.html_url ?? "",
  };
}

function mapRepoMeta(owner: string, repo: string, raw: unknown): RepoMeta {
  const r = raw as {
    full_name?: string;
    description?: string | null;
    private?: boolean;
    default_branch?: string;
    stargazers_count?: number;
    html_url?: string;
  };
  return {
    owner,
    repo,
    fullName: r.full_name ?? `${owner}/${repo}`,
    description: r.description ?? null,
    private: Boolean(r.private),
    defaultBranch: r.default_branch ?? "main",
    stars: r.stargazers_count ?? 0,
    url: r.html_url ?? `https://github.com/${owner}/${repo}`,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function getRepoMeta(
  owner: string,
  repo: string,
  opts: RequestOpts,
): Promise<RepoMeta> {
  try {
    const raw = await ghRequest(`repos/${owner}/${repo}`, opts);
    return mapRepoMeta(owner, repo, raw);
  } catch (e) {
    const err = e as GitHubError;
    if (err.status === 404 && !opts.useGh) {
      err.hint =
        "Repo not found. If it's private, enable the private-repo option to use the gh CLI, or set GITHUB_TOKEN.";
    } else if (err.status === 401 || err.status === 403) {
      err.hint =
        "Authentication failed. Check GITHUB_TOKEN or run `gh auth login`.";
    }
    throw err;
  }
}

function normalizeSince(value?: string): string | undefined {
  if (!value) return undefined;
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? `${value}T00:00:00Z`
    : value;
}

function normalizeUntil(value?: string): string | undefined {
  if (!value) return undefined;
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? `${value}T23:59:59Z`
    : value;
}

export async function getCommits(
  owner: string,
  repo: string,
  req: AnalyzeRequest,
  opts: RequestOpts,
): Promise<{ commits: CommitInfo[]; truncated: boolean; rangeLabel: string }> {
  if (req.mode === "tag") {
    const head = req.tag?.trim();
    if (!head) throw new GitHubError("A tag (or ref) is required for tag mode.");

    if (req.baseTag?.trim()) {
      const base = req.baseTag.trim();
      const raw = (await ghRequest(
        `repos/${owner}/${repo}/compare/${encodeURIComponent(
          base,
        )}...${encodeURIComponent(head)}`,
        opts,
      )) as { commits?: RawCommit[]; total_commits?: number };
      const commits = (raw.commits ?? []).map(mapCommit).reverse();
      const truncated = (raw.total_commits ?? commits.length) > commits.length;
      return {
        commits,
        truncated,
        rangeLabel: `${base} → ${head}`,
      };
    }

    const { items, truncated } = await ghPaginated(
      `repos/${owner}/${repo}/commits?sha=${encodeURIComponent(head)}`,
      opts,
    );
    return {
      commits: (items as RawCommit[]).map(mapCommit),
      truncated,
      rangeLabel: `up to ${head}`,
    };
  }

  // date range
  const qs = new URLSearchParams();
  const since = normalizeSince(req.since);
  const until = normalizeUntil(req.until);
  if (since) qs.set("since", since);
  if (until) qs.set("until", until);
  if (req.branch?.trim()) qs.set("sha", req.branch.trim());

  const query = qs.toString();
  const { items, truncated } = await ghPaginated(
    `repos/${owner}/${repo}/commits${query ? `?${query}` : ""}`,
    opts,
  );

  const label =
    since || until
      ? `${req.since || "start"} → ${req.until || "now"}`
      : "all history";

  return {
    commits: (items as RawCommit[]).map(mapCommit),
    truncated,
    rangeLabel: req.branch?.trim() ? `${label} (${req.branch.trim()})` : label,
  };
}

/** Fetch the repo's branch and tag names (for pickers). */
export async function getRefs(
  owner: string,
  repo: string,
  opts: RequestOpts,
): Promise<{ branches: string[]; tags: string[] }> {
  try {
    const [branchesRes, tagsRes] = await Promise.all([
      ghPaginated(`repos/${owner}/${repo}/branches`, opts),
      ghPaginated(`repos/${owner}/${repo}/tags`, opts),
    ]);
    const names = (items: unknown[]) =>
      (items as { name?: string }[])
        .map((x) => x.name)
        .filter((n): n is string => Boolean(n));
    return { branches: names(branchesRes.items), tags: names(tagsRes.items) };
  } catch (e) {
    const err = e as GitHubError;
    if (err.status === 404 && !opts.useGh) {
      err.hint =
        "Repo not found. If it's private, enable the private-repo option, or set GITHUB_TOKEN.";
    } else if (err.status === 401 || err.status === 403) {
      err.hint =
        "Authentication failed. Check GITHUB_TOKEN or run `gh auth login`.";
    }
    throw err;
  }
}

interface RawCommitDetail {
  stats?: { additions?: number; deletions?: number; total?: number };
  files?: unknown[];
}

/**
 * Enrich commits with per-commit diff stats. Skipped when there are more than
 * STATS_LIMIT commits (too many round-trips); returns statsAvailable=false then.
 */
export async function enrichWithStats(
  owner: string,
  repo: string,
  commits: CommitInfo[],
  opts: RequestOpts,
  onProgress?: (done: number, total: number) => void,
): Promise<{ commits: CommitInfo[]; statsAvailable: boolean }> {
  if (commits.length === 0) return { commits, statsAvailable: false };
  if (commits.length > STATS_LIMIT) return { commits, statsAvailable: false };

  const out = [...commits];
  let next = 0;
  let done = 0;

  async function worker() {
    while (next < commits.length) {
      const idx = next++;
      try {
        const detail = (await ghRequest(
          `repos/${owner}/${repo}/commits/${commits[idx].sha}`,
          opts,
        )) as RawCommitDetail;
        out[idx] = {
          ...commits[idx],
          stats: {
            additions: detail.stats?.additions ?? 0,
            deletions: detail.stats?.deletions ?? 0,
            total: detail.stats?.total ?? 0,
            files: detail.files?.length ?? 0,
          },
        };
      } catch {
        /* leave commit without stats */
      } finally {
        done++;
        onProgress?.(done, commits.length);
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(STATS_CONCURRENCY, commits.length) }, worker),
  );
  return { commits: out, statsAvailable: true };
}

// ---------------------------------------------------------------------------
// Tag timeline (for campaign planning)
// ---------------------------------------------------------------------------

const TAG_DETAIL_LIMIT = 150; // resolve dates for at most this many undated tags
const SUBJECTS_PER_TAG = 12; // cap commit subjects per tag in the grouping input

interface RawTag {
  name?: string;
  commit?: { sha?: string };
}

const subjectOf = (message: string) => message.trim().split("\n")[0].slice(0, 200);

/**
 * Build the repo's tag timeline: every tag in chronological order, each with
 * the commit subjects delivered since the previous tag. This is the raw
 * material the AI groups into milestones. One tags request + the default-branch
 * commit list (capped); undated tags (outside that window) get a detail fetch.
 */
export async function getTagTimeline(
  owner: string,
  repo: string,
  defaultBranch: string,
  opts: RequestOpts,
): Promise<TagTimeline> {
  let tagsRes: { items: unknown[]; truncated: boolean };
  let commitsRes: { items: unknown[]; truncated: boolean };
  try {
    [tagsRes, commitsRes] = await Promise.all([
      ghPaginated(`repos/${owner}/${repo}/tags`, opts),
      ghPaginated(
        `repos/${owner}/${repo}/commits?sha=${encodeURIComponent(defaultBranch)}`,
        opts,
      ),
    ]);
  } catch (e) {
    const err = e as GitHubError;
    if (err.status === 404 && !opts.useGh) {
      err.hint =
        "Repo not found. If it's private, enable the private-repo option, or set GITHUB_TOKEN.";
    } else if (err.status === 401 || err.status === 403) {
      err.hint =
        "Authentication failed. Check GITHUB_TOKEN or run `gh auth login`.";
    }
    throw err;
  }

  const rawTags = (tagsRes.items as RawTag[])
    .map((t) => ({ name: t.name, sha: t.commit?.sha }))
    .filter((t): t is { name: string; sha: string } =>
      Boolean(t.name && t.sha),
    );
  if (rawTags.length === 0) {
    throw new GitHubError(
      "This repository has no tags. Campaigns group a project's release tags — tag your releases first.",
    );
  }

  // Default-branch commits give us dates + subjects for shas in the window.
  const commits = (commitsRes.items as RawCommit[]).map(mapCommit);
  const dateBySha = new Map<string, string>();
  for (const c of commits) if (c.date) dateBySha.set(c.sha, c.date);

  // Resolve dates for tags whose commit fell outside the listed window.
  const tags: TimelineTag[] = rawTags.map((t) => ({
    name: t.name,
    sha: t.sha,
    date: dateBySha.get(t.sha) ?? null,
  }));
  const undated = tags.filter((t) => !t.date).slice(0, TAG_DETAIL_LIMIT);
  let next = 0;
  async function resolveWorker() {
    while (next < undated.length) {
      const t = undated[next++];
      try {
        const detail = (await ghRequest(
          `repos/${owner}/${repo}/commits/${t.sha}`,
          opts,
        )) as RawCommit;
        t.date =
          detail.commit?.author?.date ?? detail.commit?.committer?.date ?? null;
      } catch {
        /* leave undated */
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(STATS_CONCURRENCY, undated.length) }, resolveWorker),
  );

  // Oldest → newest. Undated tags sort last, preserving their listed order.
  const ordered = [...tags].sort((a, b) => {
    if (a.date && b.date) return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
    if (a.date) return -1;
    if (b.date) return 1;
    return 0;
  });

  // Bucket commit subjects into the half-open window (prevTagDate, tagDate].
  const dated = commits
    .filter((c) => c.date)
    .map((c) => ({ date: c.date, subject: subjectOf(c.message) }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const work: TaggedWork[] = [];
  let prevDate: string | null = null;
  let cursor = 0;
  for (const tag of ordered) {
    const subjects: string[] = [];
    if (tag.date) {
      while (cursor < dated.length && dated[cursor].date <= tag.date) {
        if (prevDate === null || dated[cursor].date > prevDate) {
          subjects.push(dated[cursor].subject);
        }
        cursor++;
      }
      prevDate = tag.date;
    }
    work.push({
      name: tag.name,
      date: tag.date,
      subjects: subjects.slice(0, SUBJECTS_PER_TAG),
    });
  }

  return { tags: work, truncated: tagsRes.truncated || commitsRes.truncated };
}
