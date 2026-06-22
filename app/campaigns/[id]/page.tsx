"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import AiSettings from "@/components/AiSettings";
import Nav from "@/components/Nav";
import {
  getCampaign,
  patchCampaign,
  streamSSE,
  todayStr,
  type Campaign,
  type Milestone,
} from "@/lib/campaign";
import { exportMarkdownFor } from "@/lib/exportReport";
import type { AiSelection, ReportBody, ReportStats } from "@/lib/types";

const EMPTY_STATS: ReportStats = {
  totalCommits: 0,
  totalAdditions: 0,
  totalDeletions: 0,
  fileChanges: 0,
  statsAvailable: false,
  authors: [],
  firstCommitDate: null,
  lastCommitDate: null,
};

const MODE_LABEL: Record<string, string> = {
  autoDistribute: "even spread",
  cadence: "fixed cadence",
  manual: "manual dates",
};

function statusOf(m: Milestone, today: string) {
  if (m.status === "shown") return { label: "Shown", cls: "text-emerald-500" };
  if (m.scheduledDate < today) return { label: "Overdue", cls: "text-amber-500" };
  if (m.scheduledDate === today) return { label: "Today", cls: "text-sky-400" };
  return { label: "Upcoming", cls: "text-[var(--text-faint)]" };
}

export default function CampaignDashboard() {
  const params = useParams<{ id: string }>();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [ai, setAi] = useState<AiSelection>({
    provider: "",
    model: "",
    apiKey: "",
  });
  const [showSettings, setShowSettings] = useState(false);

  const [genId, setGenId] = useState<string | null>(null);
  const [genText, setGenText] = useState("");
  const [genStatus, setGenStatus] = useState("");
  const [genError, setGenError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const today = todayStr();

  const refresh = useCallback(() => {
    void getCampaign(params.id).then((c) => {
      setCampaign(c);
      setLoading(false);
    });
  }, [params.id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function patch(mid: string, p: Partial<Milestone>) {
    const c = await patchCampaign(params.id, [{ id: mid, ...p }]);
    if (c) setCampaign(c);
  }

  async function generate(m: Milestone) {
    if (genId) return;
    setGenId(m.id);
    setGenText("");
    setGenStatus("");
    setGenError(null);
    setOpenId(m.id);
    await streamSSE(
      `/api/campaign/${params.id}/report`,
      {
        milestoneId: m.id,
        aiProvider: ai.provider || undefined,
        apiKey: ai.provider === "manual" ? ai.apiKey : undefined,
        model: ai.model || undefined,
      },
      (event, data) => {
        if (event === "ai_delta") {
          setGenText((t) => t + String(data.text ?? ""));
        } else if (event === "phase") {
          setGenStatus(String(data.message ?? ""));
        } else if (event === "error") {
          setGenError(String(data.message ?? "Generation failed."));
        }
      },
    );
    setGenId(null);
    setGenStatus("");
    refresh();
  }

  if (loading) {
    return (
      <>
        <Nav />
        <main className="mx-auto max-w-3xl px-5 py-8">
          <p className="text-sm text-[var(--text-faint)]">Loading…</p>
        </main>
      </>
    );
  }

  if (!campaign) {
    return (
      <>
        <Nav />
        <main className="mx-auto max-w-3xl px-5 py-8">
          <p className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-6 text-center text-sm text-[var(--text-faint)]">
            Campaign not found.{" "}
            <Link href="/campaigns" className="text-sky-400 hover:text-sky-300">
              Back to campaigns →
            </Link>
          </p>
        </main>
      </>
    );
  }

  const sorted = [...campaign.milestones].sort((a, b) =>
    a.scheduledDate < b.scheduledDate ? -1 : a.scheduledDate > b.scheduledDate ? 1 : 0,
  );
  const shown = campaign.milestones.filter((m) => m.status === "shown").length;
  const pct = campaign.milestones.length
    ? Math.round((shown / campaign.milestones.length) * 100)
    : 0;

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-3xl px-5 py-8">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-bold text-[var(--text-strong)]">
              {campaign.repoName}
            </h1>
            <p className="text-xs text-[var(--text-faint)]">
              {campaign.milestones.length} milestones ·{" "}
              {MODE_LABEL[campaign.scheduleMode] ?? campaign.scheduleMode} · from{" "}
              {campaign.startDate}
            </p>
          </div>
          <Link
            href="/campaigns"
            className="shrink-0 rounded-lg border border-[var(--border)] bg-[var(--panel)] px-3 py-1.5 text-sm text-[var(--text-muted)] transition hover:text-[var(--text-strong)]"
          >
            ← Campaigns
          </Link>
        </div>

        <div className="mb-5 rounded-xl border border-[var(--border)] bg-[var(--panel)] p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-[var(--text-strong)]">
              Progress
            </span>
            <span className="text-[var(--text-muted)]">
              {shown}/{campaign.milestones.length} shown · {pct}%
            </span>
          </div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded bg-[var(--inset)]">
            <div
              className="h-full rounded bg-sky-500 transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        <div className="mb-5">
          <button
            type="button"
            onClick={() => setShowSettings((s) => !s)}
            className="mb-2 text-xs font-medium text-sky-400 hover:text-sky-300"
          >
            {showSettings ? "Hide AI settings" : "AI settings"}
          </button>
          {showSettings && <AiSettings onChange={setAi} />}
        </div>

        <ol className="space-y-3">
          {sorted.map((m, i) => {
            const st = statusOf(m, today);
            const isGen = genId === m.id;
            const isOpen = openId === m.id;
            return (
              <li
                key={m.id}
                className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-4"
              >
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sky-500/15 text-xs font-semibold text-sky-400">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-medium text-[var(--text-strong)]">
                        {m.title}
                      </h3>
                      <span className={`shrink-0 text-xs font-medium ${st.cls}`}>
                        {st.label}
                      </span>
                    </div>
                    {m.summary && (
                      <p className="mt-1 text-sm text-[var(--text-muted)]">
                        {m.summary}
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[var(--text-faint)]">
                      <span className="rounded bg-[var(--chip)] px-1.5 py-0.5 text-[var(--text-muted)]">
                        {m.rangeLabel}
                      </span>
                      <span>{m.tags.length} tags</span>
                      <span>·</span>
                      <span className="capitalize">{m.reportType}</span>
                      <label className="ml-auto flex items-center gap-1">
                        <span>show on</span>
                        <input
                          type="date"
                          value={m.scheduledDate}
                          onChange={(e) =>
                            void patch(m.id, { scheduledDate: e.target.value })
                          }
                          className="input max-w-[150px] px-2 py-1"
                          aria-label={`${m.title} date`}
                        />
                      </label>
                    </div>

                    {/* actions */}
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {m.report ? (
                        <>
                          <Link
                            href={`/campaigns/${campaign.id}/present/${m.id}`}
                            target="_blank"
                            className="rounded-lg bg-sky-500 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-sky-400"
                          >
                            ▶ Present
                          </Link>
                          <button
                            type="button"
                            onClick={() => setOpenId(isOpen ? null : m.id)}
                            className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-muted)] transition hover:text-[var(--text-strong)]"
                          >
                            {isOpen ? "Hide" : "View"}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const body: ReportBody = {
                                rangeLabel: m.rangeLabel,
                                truncated: false,
                                commits: [],
                                stats: EMPTY_STATS,
                              };
                              exportMarkdownFor(
                                campaign.repo,
                                body,
                                m.report!.text,
                                m.reportType,
                              );
                            }}
                            className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-muted)] transition hover:text-[var(--text-strong)]"
                          >
                            Markdown
                          </button>
                          <button
                            type="button"
                            disabled={Boolean(genId)}
                            onClick={() => void generate(m)}
                            className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-muted)] transition hover:text-[var(--text-strong)] disabled:opacity-50"
                          >
                            {isGen ? "Regenerating…" : "Regenerate"}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              void patch(m.id, {
                                status:
                                  m.status === "shown" ? "upcoming" : "shown",
                              })
                            }
                            className="ml-auto rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-muted)] transition hover:text-[var(--text-strong)]"
                          >
                            {m.status === "shown"
                              ? "↩ Mark upcoming"
                              : "✓ Mark shown"}
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          disabled={Boolean(genId)}
                          onClick={() => void generate(m)}
                          className="rounded-lg bg-sky-500 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-sky-400 disabled:opacity-50"
                        >
                          {isGen ? "Generating…" : "⚡ Generate deck"}
                        </button>
                      )}
                    </div>

                    {/* live generation / error */}
                    {isGen && (
                      <div className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--inset)] p-3">
                        <p className="mb-1 flex items-center gap-2 text-xs text-[var(--text-muted)]">
                          <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-sky-500 border-t-transparent" />
                          {genStatus || "Generating…"}
                        </p>
                        {genText && (
                          <pre className="max-h-48 overflow-auto whitespace-pre-wrap text-xs text-[var(--text-muted)]">
                            {genText}
                          </pre>
                        )}
                      </div>
                    )}
                    {isGen && genError && (
                      <div className="banner-error mt-2 rounded-lg p-3 text-xs">
                        {genError}
                      </div>
                    )}

                    {/* rendered report */}
                    {!isGen && isOpen && m.report && (
                      <div className="md mt-3 rounded-lg border border-[var(--border)] bg-[var(--inset)] p-4">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {m.report.text}
                        </ReactMarkdown>
                      </div>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </main>
    </>
  );
}
