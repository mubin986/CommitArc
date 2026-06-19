"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import Nav from "@/components/Nav";
import {
  clearHistory,
  deleteRecord,
  loadHistory,
  type HistorySummary,
} from "@/lib/history";
import type { AnalysisMode } from "@/lib/types";

export default function HistoryPage() {
  const [records, setRecords] = useState<HistorySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [modeF, setModeF] = useState<"all" | AnalysisMode>("all");

  const refresh = useCallback(() => {
    void loadHistory().then((r) => {
      setRecords(r);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const filtered = records.filter(
    (r) =>
      (modeF === "all" || r.mode === modeF) &&
      r.repoFullName.includes(q.trim().toLowerCase()),
  );

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-3xl px-5 py-8">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-xl font-bold text-[var(--text-strong)]">
            History ({records.length})
          </h1>
          {records.length > 0 && (
            <button
              type="button"
              onClick={() => {
                if (
                  window.confirm(
                    `Delete all ${records.length} saved analyses? This cannot be undone.`,
                  )
                )
                  void clearHistory().then(() => setRecords([]));
              }}
              className="text-xs text-red-500 hover:text-red-400"
            >
              Clear all
            </button>
          )}
        </div>

        <div className="mb-4 flex gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter by repo…"
            aria-label="Filter by repo"
            className="input"
          />
          <select
            value={modeF}
            onChange={(e) => setModeF(e.target.value as "all" | AnalysisMode)}
            aria-label="Filter by mode"
            className="input max-w-[160px]"
          >
            <option value="all">All modes</option>
            <option value="dateRange">Date range</option>
            <option value="tag">Tag</option>
          </select>
        </div>

        {loading ? (
          <p className="text-sm text-[var(--text-faint)]">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-6 text-center text-sm text-[var(--text-faint)]">
            No matching history.{" "}
            <Link href="/" className="text-sky-400 hover:text-sky-300">
              Run one →
            </Link>
          </p>
        ) : (
          <ul className="space-y-2">
            {filtered.map((r) => (
              <li
                key={r.id}
                className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--panel)] p-3"
              >
                <Link href={`/history/${r.id}`} className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-[var(--text-strong)]">
                    {r.hasTechnical && (
                      <span className="mr-1 rounded bg-[var(--chip)] px-1.5 py-0.5 text-xs text-[var(--text-muted)]">
                        🛠 Technical
                      </span>
                    )}
                    {r.hasPresentation && (
                      <span className="mr-1 rounded bg-sky-500/15 px-1.5 py-0.5 text-xs text-sky-400">
                        📊 Presentation
                      </span>
                    )}
                    {r.hasDemo && (
                      <span className="mr-1 rounded bg-indigo-500/15 px-1.5 py-0.5 text-xs text-indigo-400">
                        📖 Demo
                      </span>
                    )}
                    {!r.hasTechnical && !r.hasPresentation && !r.hasDemo && (
                      <span className="mr-2 rounded bg-[var(--chip)] px-1.5 py-0.5 text-xs text-[var(--text-faint)]">
                        analysis only
                      </span>
                    )}
                    {r.repoName}
                  </p>
                  <p className="text-xs text-[var(--text-faint)]">
                    {r.rangeLabel} · {r.totalCommits} commits · {r.mode} ·{" "}
                    {new Date(r.savedAt).toLocaleString()}
                  </p>
                </Link>
                <Link
                  href={`/history/${r.id}`}
                  className="rounded border border-[var(--border)] px-2 py-1 text-xs text-sky-400 hover:border-sky-500"
                >
                  Open
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm(`Delete the saved analysis of ${r.repoName}?`))
                      void deleteRecord(r.id).then(refresh);
                  }}
                  className="rounded border border-[var(--border)] px-2 py-1 text-xs text-red-500 hover:border-red-500"
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
