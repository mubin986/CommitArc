import fs from "node:fs";
import path from "node:path";
import type {
  AnalysisMode,
  AnalyzeResponse,
  HistoryRecord,
  HistorySummary,
  PublishedLink,
  ReportContent,
  ReportSet,
  ReportType,
} from "./types";

// Server-side history store: one JSON file per analysis under data/history/.
// The data/ folder is gitignored.
const DIR = path.join(process.cwd(), "data", "history");
const MAX = 50;
const ID_RE = /^[A-Za-z0-9_-]+$/;

function ensure(): void {
  fs.mkdirSync(DIR, { recursive: true });
}

function fileFor(id: string): string {
  return path.join(DIR, `${id}.json`);
}

// Migrate legacy records (single aiSummary + reportType) to the reports shape.
function normalize(rec: HistoryRecord): HistoryRecord {
  const result = rec.result as AnalyzeResponse & {
    aiSummary?: string | null;
    reportType?: ReportType;
  };
  if (!result.reports) {
    const legacy = result.aiSummary;
    const rawType =
      (rec as unknown as { reportType?: string }).reportType ?? "technical";
    const type: ReportType =
      rawType === "presentation"
        ? "presentation"
        : rawType === "story" || rawType === "demo"
          ? "demo"
          : "technical";
    result.reports = { technical: null, presentation: null, demo: null };
    if (legacy) {
      result.reports[type] = {
        text: legacy,
        model: null,
        generatedAt: rec.savedAt,
      };
    }
  } else {
    // Normalize slots; migrate any legacy "story" slot to "demo".
    const r = result.reports as Partial<ReportSet> & {
      story?: ReportContent | null;
    };
    result.reports = {
      technical: r.technical ?? null,
      presentation: r.presentation ?? null,
      demo: r.demo ?? r.story ?? null,
    };
  }
  return rec;
}

function readAll(): HistoryRecord[] {
  ensure();
  const out: HistoryRecord[] = [];
  for (const f of fs.readdirSync(DIR)) {
    if (!f.endsWith(".json")) continue;
    try {
      out.push(
        normalize(
          JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")) as HistoryRecord,
        ),
      );
    } catch {
      /* skip corrupt file */
    }
  }
  return out.sort((a, b) => b.savedAt - a.savedAt);
}

function toSummary(r: HistoryRecord): HistorySummary {
  return {
    id: r.id,
    savedAt: r.savedAt,
    repoFullName: r.repoFullName,
    repoName: r.repoName,
    repoUrl: r.repoUrl,
    mode: r.mode,
    rangeLabel: r.rangeLabel,
    totalCommits: r.totalCommits,
    hasTechnical: Boolean(r.result.reports?.technical),
    hasPresentation: Boolean(r.result.reports?.presentation),
    hasDemo: Boolean(r.result.reports?.demo),
  };
}

export function listSummaries(): HistorySummary[] {
  return readAll().map(toSummary);
}

export function getRecord(id: string): HistoryRecord | null {
  if (!ID_RE.test(id)) return null;
  ensure();
  const fp = fileFor(id);
  if (!fs.existsSync(fp)) return null;
  try {
    return normalize(JSON.parse(fs.readFileSync(fp, "utf8")) as HistoryRecord);
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

export function saveRecord(input: {
  repoUrl: string;
  mode: AnalysisMode;
  result: AnalyzeResponse;
}): HistorySummary {
  ensure();
  // Ensure all report slots exist.
  const provided = input.result.reports as
    | (Partial<ReportSet> & { story?: ReportContent | null })
    | undefined;
  input.result.reports = {
    technical: provided?.technical ?? null,
    presentation: provided?.presentation ?? null,
    demo: provided?.demo ?? provided?.story ?? null,
  };
  const rec: HistoryRecord = {
    id: newId(),
    savedAt: Date.now(),
    repoFullName: input.result.repo.fullName.toLowerCase(),
    repoName: input.result.repo.fullName,
    repoUrl: input.repoUrl,
    mode: input.mode,
    rangeLabel: input.result.rangeLabel,
    totalCommits: input.result.stats.totalCommits,
    hasTechnical: Boolean(input.result.reports.technical),
    hasPresentation: Boolean(input.result.reports.presentation),
    hasDemo: Boolean(input.result.reports.demo),
    result: input.result,
  };
  fs.writeFileSync(fileFor(rec.id), JSON.stringify(rec));
  prune();
  return toSummary(rec);
}

/** Attach a generated AI report to an existing record. */
export function attachReport(
  id: string,
  reportType: ReportType,
  content: ReportContent,
): HistoryRecord | null {
  const rec = getRecord(id);
  if (!rec) return null;
  if (!rec.result.reports) {
    rec.result.reports = { technical: null, presentation: null, demo: null };
  }
  rec.result.reports[reportType] = content;
  rec.hasTechnical = Boolean(rec.result.reports.technical);
  rec.hasPresentation = Boolean(rec.result.reports.presentation);
  rec.hasDemo = Boolean(rec.result.reports.demo);
  fs.writeFileSync(fileFor(id), JSON.stringify(rec));
  return rec;
}

function prune(): void {
  const all = readAll();
  for (const r of all.slice(MAX)) {
    try {
      fs.unlinkSync(fileFor(r.id));
    } catch {
      /* ignore */
    }
  }
}

/** Save an edited report text (manual or AI-assisted) onto a record. */
export function updateReportText(
  id: string,
  reportType: ReportType,
  text: string,
): HistoryRecord | null {
  const rec = getRecord(id);
  if (!rec) return null;
  const content = rec.result.reports[reportType];
  if (!content) return null;
  content.text = text;
  content.edited = true;
  content.editedAt = Date.now();
  fs.writeFileSync(fileFor(id), JSON.stringify(rec));
  return rec;
}

/** Record where a report was published (one link per target — replaces same). */
export function addPublishedLink(
  id: string,
  reportType: ReportType,
  link: PublishedLink,
): HistoryRecord | null {
  const rec = getRecord(id);
  if (!rec) return null;
  const content = rec.result.reports[reportType];
  if (!content) return null;
  const others = (content.published ?? []).filter(
    (l) => l.target !== link.target,
  );
  content.published = [...others, link];
  fs.writeFileSync(fileFor(id), JSON.stringify(rec));
  return rec;
}

export function deleteRecord(id: string): void {
  if (!ID_RE.test(id)) return;
  try {
    fs.unlinkSync(fileFor(id));
  } catch {
    /* already gone */
  }
}

export function clearAll(): void {
  ensure();
  for (const f of fs.readdirSync(DIR)) {
    if (!f.endsWith(".json")) continue;
    try {
      fs.unlinkSync(path.join(DIR, f));
    } catch {
      /* ignore */
    }
  }
}
