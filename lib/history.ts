"use client";

import type {
  AnalysisMode,
  AnalyzeResponse,
  HistoryRecord,
  HistorySummary,
} from "./types";

export type { HistoryRecord, HistorySummary } from "./types";

// History now lives server-side (data/history/*.json). These helpers are thin
// fetch wrappers over /api/history.

export async function loadHistory(): Promise<HistorySummary[]> {
  try {
    const res = await fetch("/api/history");
    if (!res.ok) return [];
    return (await res.json()) as HistorySummary[];
  } catch {
    return [];
  }
}

export async function getRecord(id: string): Promise<HistoryRecord | null> {
  try {
    const res = await fetch(`/api/history/${id}`);
    if (!res.ok) return null;
    return (await res.json()) as HistoryRecord;
  } catch {
    return null;
  }
}

export async function saveRecord(input: {
  repoUrl: string;
  mode: AnalysisMode;
  result: AnalyzeResponse;
}): Promise<HistorySummary | null> {
  try {
    const res = await fetch("/api/history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) return null;
    return (await res.json()) as HistorySummary;
  } catch {
    return null;
  }
}

export async function deleteRecord(id: string): Promise<void> {
  try {
    await fetch(`/api/history/${id}`, { method: "DELETE" });
  } catch {
    /* ignore */
  }
}

export async function clearHistory(): Promise<void> {
  try {
    await fetch("/api/history", { method: "DELETE" });
  } catch {
    /* ignore */
  }
}
