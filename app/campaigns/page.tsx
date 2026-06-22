"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import Nav from "@/components/Nav";
import {
  deleteCampaign,
  loadCampaigns,
  type CampaignSummary,
} from "@/lib/campaign";

const MODE_LABEL: Record<string, string> = {
  autoDistribute: "Even spread",
  cadence: "Fixed cadence",
  manual: "Manual dates",
};

export default function CampaignsPage() {
  const [items, setItems] = useState<CampaignSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    void loadCampaigns().then((r) => {
      setItems(r);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-3xl px-5 py-8">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-xl font-bold text-[var(--text-strong)]">
            Campaigns ({items.length})
          </h1>
          <Link
            href="/campaigns/new"
            className="rounded-lg bg-sky-500 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-sky-400"
          >
            + New campaign
          </Link>
        </div>

        <p className="mb-5 text-sm text-[var(--text-muted)]">
          Turn a finished project&apos;s release tags into a scheduled sequence of
          client-facing milestones — drip the progress out over weeks.
        </p>

        {loading ? (
          <p className="text-sm text-[var(--text-faint)]">Loading…</p>
        ) : items.length === 0 ? (
          <p className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-6 text-center text-sm text-[var(--text-faint)]">
            No campaigns yet.{" "}
            <Link href="/campaigns/new" className="text-sky-400 hover:text-sky-300">
              Plan one →
            </Link>
          </p>
        ) : (
          <ul className="space-y-2">
            {items.map((c) => {
              const pct = c.milestoneCount
                ? Math.round((c.shownCount / c.milestoneCount) * 100)
                : 0;
              return (
                <li
                  key={c.id}
                  className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--panel)] p-3"
                >
                  <Link href={`/campaigns/${c.id}`} className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-[var(--text-strong)]">
                      {c.repoName}
                    </p>
                    <p className="text-xs text-[var(--text-faint)]">
                      {c.shownCount}/{c.milestoneCount} shown · {pct}% ·{" "}
                      {MODE_LABEL[c.scheduleMode] ?? c.scheduleMode} · from{" "}
                      {c.startDate} · {new Date(c.savedAt).toLocaleDateString()}
                    </p>
                    <div className="mt-1.5 h-1 w-full overflow-hidden rounded bg-[var(--inset)]">
                      <div
                        className="h-full rounded bg-sky-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </Link>
                  <Link
                    href={`/campaigns/${c.id}`}
                    className="rounded border border-[var(--border)] px-2 py-1 text-xs text-sky-400 hover:border-sky-500"
                  >
                    Open
                  </Link>
                  <button
                    type="button"
                    onClick={() => {
                      if (
                        window.confirm(`Delete the campaign for ${c.repoName}?`)
                      )
                        void deleteCampaign(c.id).then(refresh);
                    }}
                    className="rounded border border-[var(--border)] px-2 py-1 text-xs text-red-500 hover:border-red-500"
                  >
                    Delete
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </>
  );
}
