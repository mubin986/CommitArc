export type AnalysisMode = "dateRange" | "tag";

export type ReportType = "technical" | "presentation" | "demo";

export type AiProviderChoice = "local" | "env" | "manual";

/** Commit analysis only — no AI. AI reports are generated separately. */
export interface AnalyzeRequest {
  url: string;
  mode: AnalysisMode;
  /** dateRange mode */
  since?: string;
  until?: string;
  branch?: string;
  /** tag mode */
  baseTag?: string;
  tag?: string;
  /** Use the local `gh` CLI (required for private repos without a token). */
  usePrivate: boolean;
}

/** On-demand AI report generation against a saved analysis record. */
export interface ReportRequest {
  recordId: string;
  reportType: ReportType;
  aiProvider?: AiProviderChoice;
  apiKey?: string;
  model?: string;
}

export interface AiSelection {
  provider: AiProviderChoice | "";
  model: string;
  apiKey: string;
}

export interface ReportBody {
  rangeLabel: string;
  truncated: boolean;
  commits: CommitInfo[];
  stats: ReportStats;
}

export interface HistorySummary {
  id: string;
  savedAt: number;
  repoFullName: string; // lowercase, for matching
  repoName: string; // original case, for display
  repoUrl: string;
  mode: AnalysisMode;
  rangeLabel: string;
  totalCommits: number;
  hasTechnical: boolean;
  hasPresentation: boolean;
  hasDemo: boolean;
}

export interface HistoryRecord extends HistorySummary {
  result: AnalyzeResponse;
}

export interface AiStatus {
  local: {
    available: boolean;
    source: "file" | "keychain" | "libsecret" | null;
    expired: boolean;
  };
  env: { hasKey: boolean };
  models: { id: string; label: string }[];
  defaultModel: string;
}

export interface CommitAuthor {
  name: string;
  email: string;
  login: string | null;
}

export interface CommitStats {
  additions: number;
  deletions: number;
  total: number;
  files: number;
}

export interface CommitInfo {
  sha: string;
  shortSha: string;
  message: string;
  author: CommitAuthor;
  date: string;
  url: string;
  stats?: CommitStats;
}

export interface RepoMeta {
  owner: string;
  repo: string;
  fullName: string;
  description: string | null;
  private: boolean;
  defaultBranch: string;
  stars: number;
  url: string;
}

export interface AuthorActivity {
  name: string;
  login: string | null;
  commits: number;
  additions: number;
  deletions: number;
}

export interface ReportStats {
  totalCommits: number;
  totalAdditions: number;
  totalDeletions: number;
  fileChanges: number;
  statsAvailable: boolean;
  authors: AuthorActivity[];
  firstCommitDate: string | null;
  lastCommitDate: string | null;
}

export interface PublishedLink {
  target: "gist" | "wiki" | "release";
  url: string;
  at: number;
}

export interface ReportContent {
  text: string;
  model: string | null;
  generatedAt: number;
  published?: PublishedLink[];
}

export interface ReportSet {
  technical: ReportContent | null;
  presentation: ReportContent | null;
  demo: ReportContent | null;
}

export interface AnalyzeResponse {
  repo: RepoMeta;
  rangeLabel: string;
  truncated: boolean;
  commits: CommitInfo[];
  stats: ReportStats;
  reports: ReportSet;
}

export interface GhStatus {
  installed: boolean;
  authenticated: boolean;
  version: string | null;
  account: string | null;
  message: string;
}
