"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import AiSettings from "./AiSettings";
import PublishMenu from "./PublishMenu";
import { exportMarkdownFor } from "@/lib/exportReport";
import { exportPptx } from "@/lib/exportPptx";
import { useReportStream } from "@/lib/useReportStream";
import type {
  AiSelection,
  CommitInfo,
  HistoryRecord,
  ReportBody,
  ReportType,
} from "@/lib/types";

const TABS: { id: ReportType; label: string }[] = [
  { id: "technical", label: "🛠 Technical report" },
  { id: "presentation", label: "📊 Client presentation" },
  { id: "demo", label: "📖 Product demo" },
];

export default function RecordView({
  record,
  onRefresh,
}: {
  record: HistoryRecord;
  onRefresh: () => void;
}) {
  const { result } = record;
  const repo = result.repo;
  const stats = result.stats;
  const body: ReportBody = {
    rangeLabel: result.rangeLabel,
    truncated: result.truncated,
    commits: result.commits,
    stats: result.stats,
  };

  const hasTech = Boolean(result.reports.technical);
  const hasPres = Boolean(result.reports.presentation);
  const hasDemo = Boolean(result.reports.demo);
  const done = (t: ReportType) =>
    t === "technical" ? hasTech : t === "presentation" ? hasPres : hasDemo;

  const [ai, setAi] = useState<AiSelection>({
    provider: "",
    model: "",
    apiKey: "",
  });
  const [showSettings, setShowSettings] = useState(
    !hasTech && !hasPres && !hasDemo,
  );
  const [active, setActive] = useState<ReportType>(
    hasTech ? "technical" : hasPres ? "presentation" : hasDemo ? "demo" : "technical",
  );

  const report = useReportStream(record.id, (_type, ok) => {
    if (ok) onRefresh();
  });

  const busy = report.generatingType !== null;
  const generate = (type: ReportType) => {
    setActive(type);
    report.start(type, ai);
  };

  const content = result.reports[active];
  const generating = report.generatingType === active;
  const text = generating ? report.text : (content?.text ?? "");
  const error = !report.generatingType ? report.error : null;

  return (
    <div className={`pv print-${active} space-y-6`}>
      {/* Title */}
      <div className="pv-title rounded-xl border border-[var(--border)] bg-[var(--panel)] p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <a
            href={repo.url}
            target="_blank"
            rel="noreferrer"
            className="text-lg font-semibold text-[var(--text-strong)] hover:text-sky-400"
          >
            {repo.fullName}
          </a>
          <span className="text-xs text-[var(--text-faint)]">
            {repo.private ? "private" : "public"} · saved{" "}
            {new Date(record.savedAt).toLocaleString()}
          </span>
        </div>
        {repo.description && (
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            {repo.description}
          </p>
        )}
        <p className="mt-2 text-xs text-[var(--text-faint)]">
          Release / range:{" "}
          <span className="text-[var(--text)]">{body.rangeLabel}</span>
          {body.truncated && (
            <span className="ml-2 text-amber-400">(truncated)</span>
          )}
        </p>
      </div>

      {/* Stat cards */}
      <div className="pv-stats grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Commits" value={stats.totalCommits.toLocaleString()} />
        <Stat
          label="Additions"
          value={
            stats.statsAvailable
              ? `+${stats.totalAdditions.toLocaleString()}`
              : "—"
          }
          tone="pos"
        />
        <Stat
          label="Deletions"
          value={
            stats.statsAvailable
              ? `-${stats.totalDeletions.toLocaleString()}`
              : "—"
          }
          tone="neg"
        />
        <Stat label="Contributors" value={stats.authors.length.toString()} />
      </div>

      {/* Reports — tabbed, full width */}
      <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--panel)]">
        <div className="no-print flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] px-3 py-2">
          <div className="flex gap-1">
            {TABS.map((t) => {
              const isActive = active === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setActive(t.id)}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                    isActive
                      ? "bg-sky-500/10 text-sky-400"
                      : "text-[var(--text-muted)] hover:text-[var(--text-strong)]"
                  }`}
                >
                  {t.label}
                  {done(t.id) && (
                    <span className="ml-1.5 text-emerald-500">✓</span>
                  )}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => setShowSettings((s) => !s)}
            className="rounded-md px-2.5 py-1.5 text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-strong)]"
          >
            ⚙ AI provider {showSettings ? "▲" : "▼"}
          </button>
        </div>

        {showSettings && (
          <div className="no-print border-b border-[var(--border)] p-4">
            <AiSettings onChange={setAi} />
          </div>
        )}

        <div className="p-5">
          {/* Actions */}
          <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-[var(--text-faint)]">
              {generating ? (
                <span className="animate-pulse text-sky-400">
                  ● generating…
                </span>
              ) : content?.model ? (
                `${content.model} · ${new Date(content.generatedAt).toLocaleString()}`
              ) : (
                ""
              )}
            </span>
            <div className="flex flex-wrap gap-2">
              {(active === "presentation" || active === "demo") &&
                content && (
                  <button
                    type="button"
                    onClick={() =>
                      window.open(
                        `/present/${record.id}?type=${active}`,
                        "_blank",
                        "noopener,noreferrer",
                      )
                    }
                    className="rounded-lg bg-sky-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-sky-400"
                  >
                    ▶ Present
                  </button>
                )}
              {content && (
                <>
                  <button
                    type="button"
                    onClick={() =>
                      exportMarkdownFor(repo, body, content.text, active)
                    }
                    className="rounded-lg border border-[var(--border)] bg-[var(--inset)] px-3 py-1.5 text-xs font-medium text-[var(--text)] transition hover:border-sky-500"
                  >
                    Markdown
                  </button>
                  {(active === "presentation" || active === "demo") && (
                    <button
                      type="button"
                      onClick={() =>
                        void exportPptx(repo, body, content.text, active)
                      }
                      className="rounded-lg border border-[var(--border)] bg-[var(--inset)] px-3 py-1.5 text-xs font-medium text-[var(--text)] transition hover:border-sky-500"
                    >
                      PPTX
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="rounded-lg border border-[var(--border)] bg-[var(--inset)] px-3 py-1.5 text-xs font-medium text-[var(--text)] transition hover:border-sky-500"
                  >
                    Print / Save PDF
                  </button>
                  <button
                    type="button"
                    onClick={() => generate(active)}
                    disabled={busy}
                    className="rounded-lg border border-[var(--border)] bg-[var(--inset)] px-3 py-1.5 text-xs font-medium text-[var(--text)] transition hover:border-sky-500 disabled:opacity-50"
                  >
                    Regenerate
                  </button>
                  <PublishMenu
                    recordId={record.id}
                    reportType={active}
                    rangeLabel={body.rangeLabel}
                    onPublished={onRefresh}
                  />
                </>
              )}
            </div>
          </div>

          {content?.published && content.published.length > 0 && (
            <p className="no-print mb-3 text-xs text-[var(--text-faint)]">
              Published:{" "}
              {content.published.map((p, i) => (
                <span key={p.target}>
                  {i > 0 && " · "}
                  <a
                    href={p.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sky-400 underline hover:text-sky-300"
                  >
                    {p.target === "gist"
                      ? "Gist"
                      : p.target === "wiki"
                        ? "Wiki"
                        : "Release"}{" "}
                    ↗
                  </a>
                </span>
              ))}
            </p>
          )}

          {error && <p className="mb-3 text-xs text-red-500">{error}</p>}

          {text ? (
            <div className={active === "technical" ? "md" : "md md-lg"}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
            </div>
          ) : generating ? (
            <p className="text-sm text-[var(--text-muted)]">Generating…</p>
          ) : (
            <div className="py-12 text-center">
              <p className="mx-auto max-w-md text-sm text-[var(--text-muted)]">
                {active === "technical"
                  ? "A technical engineering report — themes, notable commits, contributors, risks."
                  : active === "presentation"
                    ? "A non-technical, feature-focused summary for clients, viewable as a slide deck."
                    : "A punchy product demo for clients — agenda, key features with on-screen ‘show’ cues, and value — as a slide deck."}
              </p>
              <button
                type="button"
                onClick={() => generate(active)}
                disabled={busy}
                className="mt-4 rounded-lg bg-sky-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-400 disabled:opacity-50"
              >
                {busy
                  ? "Generating…"
                  : `Generate ${
                      active === "technical"
                        ? "report"
                        : active === "presentation"
                          ? "presentation"
                          : "demo"
                    }`}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Commit analysis details */}
      <details className="pv-details rounded-xl border border-[var(--border)] bg-[var(--panel)]" open>
        <summary className="cursor-pointer px-5 py-3 text-sm font-semibold uppercase tracking-wide text-[var(--text-muted)]">
          Commit analysis — {stats.authors.length} contributors ·{" "}
          {body.commits.length} commits
        </summary>
        <div className="space-y-5 border-t border-[var(--border)] p-5">
          {stats.authors.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase text-[var(--text-faint)]">
                    <th className="pb-2">Author</th>
                    <th className="pb-2 text-right">Commits</th>
                    {stats.statsAvailable && (
                      <>
                        <th className="pb-2 text-right">+</th>
                        <th className="pb-2 text-right">-</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {stats.authors.map((a) => (
                    <tr
                      key={`${a.name}-${a.login}`}
                      className="border-t border-[var(--border)]"
                    >
                      <td className="py-1.5 text-[var(--text)]">
                        {a.name}
                        {a.login && (
                          <span className="text-[var(--text-faint)]">
                            {" "}
                            @{a.login}
                          </span>
                        )}
                      </td>
                      <td className="py-1.5 text-right text-[var(--text)]">
                        {a.commits}
                      </td>
                      {stats.statsAvailable && (
                        <>
                          <td className="py-1.5 text-right text-emerald-500">
                            {a.additions}
                          </td>
                          <td className="py-1.5 text-right text-red-500">
                            {a.deletions}
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <ul className="divide-y divide-[var(--border)]">
            {body.commits.map((c) => (
              <CommitItem key={c.sha} c={c} />
            ))}
          </ul>
        </div>
      </details>
    </div>
  );
}

function CommitItem({ c }: { c: CommitInfo }) {
  const [open, setOpen] = useState(false);
  const lines = c.message.split("\n");
  const subject = lines[0];
  const cbody = lines.slice(1).join("\n").trim();

  return (
    <li className="py-2.5">
      <div className="flex items-start gap-3">
        <a
          href={c.url}
          target="_blank"
          rel="noreferrer"
          className="mt-0.5 shrink-0 rounded bg-[var(--chip)] px-2 py-0.5 font-mono text-xs text-sky-400 hover:text-sky-300"
        >
          {c.shortSha}
        </a>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-[var(--text)]">{subject}</p>
          <p className="mt-0.5 text-xs text-[var(--text-faint)]">
            {c.author.login ? `@${c.author.login}` : c.author.name}
            {c.date && ` · ${c.date.slice(0, 10)}`}
            {c.stats && (
              <span className="ml-2">
                <span className="text-emerald-500">+{c.stats.additions}</span>{" "}
                <span className="text-red-500">-{c.stats.deletions}</span>
              </span>
            )}
            {cbody && (
              <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                className="no-print ml-2 text-sky-400 hover:text-sky-300"
              >
                {open ? "hide details" : "show details"}
              </button>
            )}
          </p>
          {cbody && open && (
            <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded bg-[var(--chip)] p-3 text-xs text-[var(--text)]">
              {cbody}
            </pre>
          )}
        </div>
      </div>
    </li>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "pos" | "neg";
}) {
  const color =
    tone === "pos"
      ? "text-emerald-500"
      : tone === "neg"
        ? "text-red-500"
        : "text-[var(--text-strong)]";
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-4">
      <p className="text-xs uppercase tracking-wide text-[var(--text-faint)]">
        {label}
      </p>
      <p className={`mt-1 text-2xl font-bold ${color}`}>{value}</p>
    </div>
  );
}
