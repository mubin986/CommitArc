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
  /** When present, revise the existing report with this instruction instead of generating fresh. */
  instruction?: string;
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
  edited?: boolean;
  editedAt?: number;
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

// ---------------------------------------------------------------------------
// Campaigns — phased rollout of a finished project's tags to a client.
//
// A campaign takes a repo's tag history, lets the AI cluster contiguous tags
// into themed "milestones", schedules those milestones across a future window,
// and generates a client-facing deck per milestone on demand.
// ---------------------------------------------------------------------------

/** How milestone show-dates are computed. */
export type ScheduleMode = "autoDistribute" | "cadence" | "manual";

export type MilestoneStatus = "upcoming" | "shown";

/** A tag plus the commit info we resolved for it (for ordering/bucketing). */
export interface TimelineTag {
  name: string;
  sha: string;
  date: string | null;
}

/** A tag with the commit subjects attributed to it — input to AI grouping. */
export interface TaggedWork {
  name: string;
  date: string | null;
  /** Commit subjects delivered up to this tag (since the previous tag). */
  subjects: string[];
}

/** The repo's tag timeline, ready to feed to the grouping prompt. */
export interface TagTimeline {
  tags: TaggedWork[];
  truncated: boolean;
}

/** A grouping the AI proposes — before scheduling/persistence. */
export interface PlannedMilestone {
  title: string;
  summary: string;
  /** Tag names in this group, chronological. */
  tags: string[];
  /** Tag immediately before the group (range base); null = repo start. */
  baseTag: string | null;
  /** Last tag in the group (the range head). */
  headTag: string;
  rangeLabel: string;
  commitCount: number;
}

export interface Milestone extends PlannedMilestone {
  id: string;
  /** yyyy-mm-dd — when to show this milestone to the client. */
  scheduledDate: string;
  status: MilestoneStatus;
  /** Client-facing deck type to generate for this milestone. */
  reportType: ReportType;
  /** Generated on demand; null until the user builds it. */
  report: ReportContent | null;
}

export interface CampaignSummary {
  id: string;
  savedAt: number;
  repoFullName: string; // lowercase, for matching
  repoName: string; // original case, for display
  repoUrl: string;
  usePrivate: boolean;
  scheduleMode: ScheduleMode;
  startDate: string;
  endDate?: string;
  cadenceDays?: number;
  milestoneCount: number;
  shownCount: number;
}

export interface Campaign extends CampaignSummary {
  repo: RepoMeta;
  milestones: Milestone[];
}
