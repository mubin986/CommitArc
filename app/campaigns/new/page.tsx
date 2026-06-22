"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import AiSettings from "@/components/AiSettings";
import Nav from "@/components/Nav";
import {
  addDaysStr,
  saveCampaign,
  scheduleDates,
  streamSSE,
  todayStr,
} from "@/lib/campaign";
import type {
  AiSelection,
  PlannedMilestone,
  ReportType,
  RepoMeta,
  ScheduleMode,
} from "@/lib/types";

interface Plan {
  repo: RepoMeta;
  tagCount: number;
  truncated: boolean;
  milestones: PlannedMilestone[];
}

type Phase = "form" | "planning" | "review";

export default function NewCampaignPage() {
  const router = useRouter();

  const [phase, setPhase] = useState<Phase>("form");
  const [url, setUrl] = useState("");
  const [usePrivate, setUsePrivate] = useState(false);
  const [target, setTarget] = useState("");
  const [ai, setAi] = useState<AiSelection>({
    provider: "",
    model: "",
    apiKey: "",
  });

  const [log, setLog] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [plan, setPlan] = useState<Plan | null>(null);
  const [titles, setTitles] = useState<string[]>([]);
  const [summaries, setSummaries] = useState<string[]>([]);
  const [reportType, setReportType] = useState<ReportType>("presentation");

  // Schedule controls
  const [mode, setMode] = useState<ScheduleMode>("autoDistribute");
  const [startDate, setStartDate] = useState(todayStr());
  const [endDate, setEndDate] = useState(addDaysStr(todayStr(), 84));
  const [cadenceDays, setCadenceDays] = useState(14);
  const [dates, setDates] = useState<string[]>([]);

  const cfg = useMemo(
    () => ({ mode, startDate, endDate, cadenceDays }),
    [mode, startDate, endDate, cadenceDays],
  );

  // Recompute dates as schedule controls change. In manual mode, only seed.
  useEffect(() => {
    if (!plan) return;
    const n = plan.milestones.length;
    if (mode === "manual") {
      setDates((prev) =>
        prev.length === n
          ? prev
          : scheduleDates(n, { mode: "cadence", startDate, cadenceDays }),
      );
    } else {
      setDates(scheduleDates(n, cfg));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, cfg]);

  async function runPlan() {
    if (!url.trim()) {
      setError("Enter a repository URL.");
      return;
    }
    setError(null);
    setLog([]);
    setPhase("planning");
    let done = false;
    await streamSSE(
      "/api/campaign/plan",
      {
        url: url.trim(),
        usePrivate,
        targetMilestones: target ? Number(target) : undefined,
        aiProvider: ai.provider || undefined,
        apiKey: ai.provider === "manual" ? ai.apiKey : undefined,
        model: ai.model || undefined,
      },
      (event, data) => {
        if (event === "phase") {
          setLog((l) => [...l, String(data.message ?? "")]);
        } else if (event === "plan") {
          const p = data as unknown as Plan;
          setPlan(p);
          setTitles(p.milestones.map((m) => m.title));
          setSummaries(p.milestones.map((m) => m.summary));
          setPhase("review");
        } else if (event === "done") {
          done = true;
        } else if (event === "error") {
          setError(String(data.message ?? "Planning failed."));
        }
      },
    );
    if (!done && !plan) {
      setPhase((p) => (p === "planning" ? "form" : p));
    }
  }

  async function save() {
    if (!plan) return;
    const milestones = plan.milestones.map((m, i) => ({
      ...m,
      title: titles[i] ?? m.title,
      summary: summaries[i] ?? m.summary,
      id:
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}-${i}`,
      scheduledDate: dates[i] ?? startDate,
      status: "upcoming" as const,
      reportType,
      report: null,
    }));
    const saved = await saveCampaign({
      repo: plan.repo,
      repoUrl: url.trim(),
      usePrivate,
      scheduleMode: mode,
      startDate,
      endDate: mode === "autoDistribute" ? endDate : undefined,
      cadenceDays: mode === "cadence" ? cadenceDays : undefined,
      milestones,
    });
    if (saved) router.replace(`/campaigns/${saved.id}`);
    else setError("Could not save the campaign.");
  }

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-3xl px-5 py-8">
        <div className="mb-6 flex items-center justify-between gap-3">
          <h1 className="text-xl font-bold text-[var(--text-strong)]">
            New campaign
          </h1>
          <Link
            href="/campaigns"
            className="rounded-lg border border-[var(--border)] bg-[var(--panel)] px-3 py-1.5 text-sm text-[var(--text-muted)] transition hover:text-[var(--text-strong)]"
          >
            ← Campaigns
          </Link>
        </div>

        {error && (
          <div className="banner-error mb-4 rounded-lg p-4 text-sm">{error}</div>
        )}

        {phase === "form" && (
          <div className="space-y-4">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-5">
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
                Repository
              </label>
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://github.com/owner/repo"
                aria-label="Repository URL"
                className="input"
              />
              <label className="mt-3 flex items-center gap-2 text-sm text-[var(--text-muted)]">
                <input
                  type="checkbox"
                  checked={usePrivate}
                  onChange={(e) => setUsePrivate(e.target.checked)}
                />
                Private repo (use the local <code className="codechip">gh</code>{" "}
                CLI)
              </label>
              <label className="mt-3 block text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
                Target milestones (optional)
              </label>
              <input
                value={target}
                onChange={(e) =>
                  setTarget(e.target.value.replace(/[^0-9]/g, ""))
                }
                placeholder="auto (≈ 1 per 4 tags)"
                inputMode="numeric"
                aria-label="Target number of milestones"
                className="input max-w-[220px]"
              />
            </div>

            <AiSettings onChange={setAi} />

            <button
              type="button"
              onClick={() => void runPlan()}
              className="rounded-lg bg-sky-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-400"
            >
              Plan campaign →
            </button>
          </div>
        )}

        {phase === "planning" && (
          <div className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-6">
            <p className="mb-3 flex items-center gap-2 text-sm font-medium text-[var(--text-strong)]">
              <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-sky-500 border-t-transparent" />
              Planning your campaign…
            </p>
            <ul className="space-y-1 text-sm text-[var(--text-muted)]">
              {log.map((l, i) => (
                <li key={i}>
                  {i === log.length - 1 ? "▶ " : "✓ "}
                  {l}
                </li>
              ))}
            </ul>
          </div>
        )}

        {phase === "review" && plan && (
          <Review
            plan={plan}
            titles={titles}
            summaries={summaries}
            setTitles={setTitles}
            setSummaries={setSummaries}
            reportType={reportType}
            setReportType={setReportType}
            mode={mode}
            setMode={setMode}
            startDate={startDate}
            setStartDate={setStartDate}
            endDate={endDate}
            setEndDate={setEndDate}
            cadenceDays={cadenceDays}
            setCadenceDays={setCadenceDays}
            dates={dates}
            setDates={setDates}
            onSave={() => void save()}
          />
        )}
      </main>
    </>
  );
}

function Review(props: {
  plan: Plan;
  titles: string[];
  summaries: string[];
  setTitles: (v: string[]) => void;
  setSummaries: (v: string[]) => void;
  reportType: ReportType;
  setReportType: (v: ReportType) => void;
  mode: ScheduleMode;
  setMode: (v: ScheduleMode) => void;
  startDate: string;
  setStartDate: (v: string) => void;
  endDate: string;
  setEndDate: (v: string) => void;
  cadenceDays: number;
  setCadenceDays: (v: number) => void;
  dates: string[];
  setDates: (v: string[]) => void;
  onSave: () => void;
}) {
  const { plan, titles, summaries, dates } = props;

  const editTitle = (i: number, v: string) => {
    const next = [...titles];
    next[i] = v;
    props.setTitles(next);
  };
  const editSummary = (i: number, v: string) => {
    const next = [...summaries];
    next[i] = v;
    props.setSummaries(next);
  };
  const editDate = (i: number, v: string) => {
    const next = [...dates];
    next[i] = v;
    props.setDates(next);
  };

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-5">
        <p className="text-sm text-[var(--text-strong)]">
          <strong>{plan.repo.fullName}</strong> · {plan.tagCount} tags →{" "}
          {plan.milestones.length} milestones
          {plan.truncated && (
            <span className="text-[var(--text-faint)]">
              {" "}
              (tag list was truncated)
            </span>
          )}
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
              Deck type per milestone
            </label>
            <select
              value={props.reportType}
              onChange={(e) => props.setReportType(e.target.value as ReportType)}
              className="input"
              aria-label="Deck type"
            >
              <option value="presentation">Client presentation</option>
              <option value="demo">Product demo</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
              Schedule
            </label>
            <select
              value={props.mode}
              onChange={(e) => props.setMode(e.target.value as ScheduleMode)}
              className="input"
              aria-label="Schedule mode"
            >
              <option value="autoDistribute">Even spread (start → end)</option>
              <option value="cadence">Fixed cadence</option>
              <option value="manual">Manual dates</option>
            </select>
          </div>
        </div>

        <div className="mt-3 grid gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
              Start date
            </label>
            <input
              type="date"
              value={props.startDate}
              onChange={(e) => props.setStartDate(e.target.value)}
              className="input"
              aria-label="Start date"
            />
          </div>
          {props.mode === "autoDistribute" && (
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
                End date
              </label>
              <input
                type="date"
                value={props.endDate}
                onChange={(e) => props.setEndDate(e.target.value)}
                className="input"
                aria-label="End date"
              />
            </div>
          )}
          {props.mode === "cadence" && (
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
                Every (days)
              </label>
              <input
                type="number"
                min={1}
                value={props.cadenceDays}
                onChange={(e) =>
                  props.setCadenceDays(Math.max(1, Number(e.target.value) || 1))
                }
                className="input"
                aria-label="Cadence in days"
              />
            </div>
          )}
        </div>
      </div>

      <ol className="space-y-3">
        {plan.milestones.map((m, i) => (
          <li
            key={i}
            className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-4"
          >
            <div className="flex items-start gap-3">
              <span className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sky-500/15 text-xs font-semibold text-sky-400">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <input
                  value={titles[i] ?? ""}
                  onChange={(e) => editTitle(i, e.target.value)}
                  className="input font-medium"
                  aria-label={`Milestone ${i + 1} title`}
                />
                <textarea
                  value={summaries[i] ?? ""}
                  onChange={(e) => editSummary(i, e.target.value)}
                  rows={2}
                  className="input mt-2 resize-y text-sm"
                  aria-label={`Milestone ${i + 1} summary`}
                />
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[var(--text-faint)]">
                  <span className="rounded bg-[var(--chip)] px-1.5 py-0.5 text-[var(--text-muted)]">
                    {m.rangeLabel}
                  </span>
                  <span>{m.tags.length} tags</span>
                  <span>·</span>
                  <span>~{m.commitCount} commits</span>
                  <span className="ml-auto flex items-center gap-1">
                    <span>show on</span>
                    <input
                      type="date"
                      value={dates[i] ?? ""}
                      onChange={(e) => editDate(i, e.target.value)}
                      disabled={props.mode !== "manual"}
                      className="input max-w-[150px] px-2 py-1 disabled:opacity-60"
                      aria-label={`Milestone ${i + 1} date`}
                    />
                  </span>
                </div>
              </div>
            </div>
          </li>
        ))}
      </ol>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={props.onSave}
          className="rounded-lg bg-sky-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-400"
        >
          Save campaign →
        </button>
        <span className="text-xs text-[var(--text-faint)]">
          Decks are generated on demand from the campaign page.
        </span>
      </div>
    </div>
  );
}
