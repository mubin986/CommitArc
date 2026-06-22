"use client";

import type {
  Campaign,
  CampaignSummary,
  Milestone,
  PlannedMilestone,
  ReportType,
  ScheduleMode,
} from "./types";

export type { Campaign, CampaignSummary, Milestone } from "./types";

// Thin fetch wrappers over /api/campaign plus pure client-side scheduling math.

export async function loadCampaigns(): Promise<CampaignSummary[]> {
  try {
    const res = await fetch("/api/campaign");
    if (!res.ok) return [];
    return (await res.json()) as CampaignSummary[];
  } catch {
    return [];
  }
}

export async function getCampaign(id: string): Promise<Campaign | null> {
  try {
    const res = await fetch(`/api/campaign/${id}`);
    if (!res.ok) return null;
    return (await res.json()) as Campaign;
  } catch {
    return null;
  }
}

export interface SaveCampaignBody {
  repo: Campaign["repo"];
  repoUrl: string;
  usePrivate: boolean;
  scheduleMode: ScheduleMode;
  startDate: string;
  endDate?: string;
  cadenceDays?: number;
  milestones: Milestone[];
}

export async function saveCampaign(
  body: SaveCampaignBody,
): Promise<Campaign | null> {
  try {
    const res = await fetch("/api/campaign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    return (await res.json()) as Campaign;
  } catch {
    return null;
  }
}

export interface MilestonePatch {
  id: string;
  title?: string;
  summary?: string;
  scheduledDate?: string;
  status?: Milestone["status"];
  reportType?: ReportType;
  reportText?: string;
}

export async function patchCampaign(
  id: string,
  patches: MilestonePatch[],
): Promise<Campaign | null> {
  try {
    const res = await fetch(`/api/campaign/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ patches }),
    });
    if (!res.ok) return null;
    return (await res.json()) as Campaign;
  } catch {
    return null;
  }
}

export async function deleteCampaign(id: string): Promise<void> {
  try {
    await fetch(`/api/campaign/${id}`, { method: "DELETE" });
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------
// Scheduling math (pure)
// ---------------------------------------------------------------------------

const DAY = 86_400_000;

/** Parse yyyy-mm-dd at UTC noon (TZ-safe) → epoch ms. */
function parseDay(d: string): number {
  const [y, m, day] = d.split("-").map(Number);
  return Date.UTC(y, (m || 1) - 1, day || 1, 12);
}

/** Format epoch ms → yyyy-mm-dd. */
export function toDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export function addDaysStr(d: string, days: number): string {
  return toDay(parseDay(d) + days * DAY);
}

export interface ScheduleConfig {
  mode: ScheduleMode;
  startDate: string;
  endDate?: string;
  cadenceDays?: number;
}

/**
 * Compute a show-date per milestone. autoDistribute spreads evenly between
 * start and end; cadence steps by a fixed interval; manual seeds weekly spacing
 * the user then edits by hand.
 */
export function scheduleDates(count: number, cfg: ScheduleConfig): string[] {
  if (count <= 0) return [];
  const start = parseDay(cfg.startDate);

  if (cfg.mode === "autoDistribute" && cfg.endDate) {
    const end = parseDay(cfg.endDate);
    if (count === 1 || end <= start) return [toDay(start)];
    const step = (end - start) / (count - 1);
    return Array.from({ length: count }, (_, i) => toDay(start + step * i));
  }

  // cadence (and manual's initial seed) — fixed step.
  const step = (cfg.cadenceDays && cfg.cadenceDays > 0 ? cfg.cadenceDays : 7) * DAY;
  return Array.from({ length: count }, (_, i) => toDay(start + step * i));
}

function uid(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Build schedulable Milestone objects from an AI plan + a schedule. */
export function buildMilestones(
  plans: PlannedMilestone[],
  reportType: ReportType,
  cfg: ScheduleConfig,
): Milestone[] {
  const dates = scheduleDates(plans.length, cfg);
  return plans.map((p, i) => ({
    ...p,
    id: uid(),
    scheduledDate: dates[i] ?? cfg.startDate,
    status: "upcoming" as const,
    reportType,
    report: null,
  }));
}

// ---------------------------------------------------------------------------
// SSE consumer (shared by plan + milestone-report streams)
// ---------------------------------------------------------------------------

/** POST a JSON body and dispatch event:/data: SSE blocks to onEvent. */
export async function streamSSE(
  url: string,
  body: unknown,
  onEvent: (event: string, data: Record<string, unknown>) => void,
): Promise<void> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) {
    let m = `Failed (${res.status})`;
    try {
      const j = await res.json();
      if (j?.error) m = j.error;
    } catch {
      /* not JSON */
    }
    onEvent("error", { message: m });
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let sep: number;
    while ((sep = buf.indexOf("\n\n")) !== -1) {
      const block = buf.slice(0, sep);
      buf = buf.slice(sep + 2);
      let evn = "message";
      let da = "";
      for (const l of block.split("\n")) {
        if (l.startsWith("event: ")) evn = l.slice(7);
        else if (l.startsWith("data: ")) da += l.slice(6);
      }
      if (!da) continue;
      try {
        onEvent(evn, JSON.parse(da) as Record<string, unknown>);
      } catch {
        /* ignore malformed block */
      }
    }
  }
}
