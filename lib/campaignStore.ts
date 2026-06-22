import fs from "node:fs";
import path from "node:path";
import type {
  Campaign,
  CampaignSummary,
  Milestone,
  ReportContent,
} from "./types";

// Server-side campaign store: one JSON file per campaign under data/campaigns/.
// The data/ folder is gitignored. Mirrors lib/historyStore.ts.
const DIR = path.join(process.cwd(), "data", "campaigns");
const MAX = 50;
const ID_RE = /^[A-Za-z0-9_-]+$/;

function ensure(): void {
  fs.mkdirSync(DIR, { recursive: true });
}

function fileFor(id: string): string {
  return path.join(DIR, `${id}.json`);
}

function readAll(): Campaign[] {
  ensure();
  const out: Campaign[] = [];
  for (const f of fs.readdirSync(DIR)) {
    if (!f.endsWith(".json")) continue;
    try {
      out.push(JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")) as Campaign);
    } catch {
      /* skip corrupt file */
    }
  }
  return out.sort((a, b) => b.savedAt - a.savedAt);
}

export function toSummary(c: Campaign): CampaignSummary {
  return {
    id: c.id,
    savedAt: c.savedAt,
    repoFullName: c.repoFullName,
    repoName: c.repoName,
    repoUrl: c.repoUrl,
    usePrivate: c.usePrivate,
    scheduleMode: c.scheduleMode,
    startDate: c.startDate,
    endDate: c.endDate,
    cadenceDays: c.cadenceDays,
    milestoneCount: c.milestones.length,
    shownCount: c.milestones.filter((m) => m.status === "shown").length,
  };
}

export function listCampaigns(): CampaignSummary[] {
  return readAll().map(toSummary);
}

export function getCampaign(id: string): Campaign | null {
  if (!ID_RE.test(id)) return null;
  ensure();
  const fp = fileFor(id);
  if (!fs.existsSync(fp)) return null;
  try {
    return JSON.parse(fs.readFileSync(fp, "utf8")) as Campaign;
  } catch {
    return null;
  }
}

function newId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function prune(): void {
  for (const c of readAll().slice(MAX)) {
    try {
      fs.unlinkSync(fileFor(c.id));
    } catch {
      /* ignore */
    }
  }
}

export interface SaveCampaignInput {
  repo: Campaign["repo"];
  repoUrl: string;
  usePrivate: boolean;
  scheduleMode: Campaign["scheduleMode"];
  startDate: string;
  endDate?: string;
  cadenceDays?: number;
  milestones: Milestone[];
}

export function saveCampaign(input: SaveCampaignInput): Campaign {
  ensure();
  const campaign: Campaign = {
    id: newId(),
    savedAt: Date.now(),
    repoFullName: input.repo.fullName.toLowerCase(),
    repoName: input.repo.fullName,
    repoUrl: input.repoUrl,
    usePrivate: input.usePrivate,
    scheduleMode: input.scheduleMode,
    startDate: input.startDate,
    endDate: input.endDate,
    cadenceDays: input.cadenceDays,
    milestoneCount: input.milestones.length,
    shownCount: input.milestones.filter((m) => m.status === "shown").length,
    repo: input.repo,
    // Ensure every milestone has an id and a clean report slot.
    milestones: input.milestones.map((m) => ({
      ...m,
      id: m.id && ID_RE.test(m.id) ? m.id : newId(),
      report: m.report ?? null,
      status: m.status === "shown" ? "shown" : "upcoming",
    })),
  };
  fs.writeFileSync(fileFor(campaign.id), JSON.stringify(campaign));
  prune();
  return campaign;
}

function write(c: Campaign): Campaign {
  c.milestoneCount = c.milestones.length;
  c.shownCount = c.milestones.filter((m) => m.status === "shown").length;
  fs.writeFileSync(fileFor(c.id), JSON.stringify(c));
  return c;
}

/** Attach a generated deck to a milestone. */
export function attachMilestoneReport(
  campaignId: string,
  milestoneId: string,
  content: ReportContent,
): Campaign | null {
  const c = getCampaign(campaignId);
  if (!c) return null;
  const m = c.milestones.find((x) => x.id === milestoneId);
  if (!m) return null;
  m.report = content;
  return write(c);
}

/** Patch editable fields on milestones (title, summary, date, status, text). */
export interface MilestonePatch {
  id: string;
  title?: string;
  summary?: string;
  scheduledDate?: string;
  status?: Milestone["status"];
  reportType?: Milestone["reportType"];
  reportText?: string;
}

export function updateCampaign(
  campaignId: string,
  patches: MilestonePatch[],
): Campaign | null {
  const c = getCampaign(campaignId);
  if (!c) return null;
  for (const p of patches) {
    const m = c.milestones.find((x) => x.id === p.id);
    if (!m) continue;
    if (typeof p.title === "string") m.title = p.title;
    if (typeof p.summary === "string") m.summary = p.summary;
    if (typeof p.scheduledDate === "string") m.scheduledDate = p.scheduledDate;
    if (p.status === "shown" || p.status === "upcoming") m.status = p.status;
    if (p.reportType) m.reportType = p.reportType;
    if (typeof p.reportText === "string" && m.report) {
      m.report.text = p.reportText;
      m.report.edited = true;
      m.report.editedAt = Date.now();
    }
  }
  return write(c);
}

export function deleteCampaign(id: string): void {
  if (!ID_RE.test(id)) return;
  try {
    fs.unlinkSync(fileFor(id));
  } catch {
    /* already gone */
  }
}
