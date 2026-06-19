"use client";

import type { RepoMeta } from "@/lib/types";

export default function ProgressPanel({
  repo,
  log,
  statsProg,
}: {
  repo: RepoMeta | null;
  log: string[];
  statsProg: { done: number; total: number } | null;
}) {
  const pct =
    statsProg && statsProg.total > 0
      ? Math.round((statsProg.done / statsProg.total) * 100)
      : 0;
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-5">
      <div className="flex items-center gap-3">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-sky-500 border-t-transparent" />
        <span className="text-sm font-medium text-[var(--text-strong)]">
          {repo ? repo.fullName : "Analyzing…"}
        </span>
      </div>
      <ul className="mt-3 space-y-1">
        {log.map((m, i) => (
          <li key={i} className="text-sm text-[var(--text-muted)]">
            {i === log.length - 1 ? "▶ " : "✓ "}
            {m}
          </li>
        ))}
      </ul>
      {statsProg && statsProg.total > 0 && (
        <div className="mt-3">
          <div className="mb-1 flex justify-between text-xs text-[var(--text-faint)]">
            <span>Fetching diff stats</span>
            <span>
              {statsProg.done}/{statsProg.total}
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded bg-[var(--inset)]">
            <div
              className="h-full bg-sky-500 transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
