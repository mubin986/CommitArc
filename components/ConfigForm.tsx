"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { loadHistory, type HistorySummary } from "@/lib/history";
import type { AnalysisMode, GhStatus } from "@/lib/types";

function parseRepoFullName(input: string): string | null {
  let s = input.trim();
  if (!s) return null;
  s = s
    .replace(/^git@github\.com:/i, "")
    .replace(/^https?:\/\/(www\.)?github\.com\//i, "")
    .replace(/^github\.com\//i, "")
    .replace(/\.git$/i, "");
  const p = s.split("/").filter(Boolean);
  if (p.length < 2) return null;
  return `${p[0]}/${p[1]}`.toLowerCase();
}

export default function ConfigForm() {
  const router = useRouter();

  const [url, setUrl] = useState("");
  const [mode, setMode] = useState<AnalysisMode>("dateRange");
  const [since, setSince] = useState("");
  const [until, setUntil] = useState("");
  const [branch, setBranch] = useState("");
  const [baseTag, setBaseTag] = useState("");
  const [tag, setTag] = useState("");
  const [usePrivate, setUsePrivate] = useState(false);

  const [refs, setRefs] = useState<{
    branches: string[];
    tags: string[];
  } | null>(null);
  const [refsLoading, setRefsLoading] = useState(false);
  const [refsError, setRefsError] = useState<string | null>(null);

  const [gh, setGh] = useState<GhStatus | null>(null);
  const [ghLoading, setGhLoading] = useState(false);

  const [history, setHistory] = useState<HistorySummary[]>([]);

  useEffect(() => {
    void loadHistory().then(setHistory);
  }, []);

  // Restore the last form config (survives going to /analyze and back).
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("commitarc-form");
      if (!raw) return;
      const f = JSON.parse(raw) as Record<string, unknown>;
      if (typeof f.url === "string") setUrl(f.url);
      if (f.mode === "tag" || f.mode === "dateRange") setMode(f.mode);
      if (typeof f.since === "string") setSince(f.since);
      if (typeof f.until === "string") setUntil(f.until);
      if (typeof f.branch === "string") setBranch(f.branch);
      if (typeof f.baseTag === "string") setBaseTag(f.baseTag);
      if (typeof f.tag === "string") setTag(f.tag);
      if (typeof f.usePrivate === "boolean") setUsePrivate(f.usePrivate);
    } catch {
      /* ignore */
    }
  }, []);

  const checkGh = useCallback(async () => {
    setGhLoading(true);
    try {
      const res = await fetch("/api/gh-status");
      setGh((await res.json()) as GhStatus);
    } catch {
      setGh({
        installed: false,
        authenticated: false,
        version: null,
        account: null,
        message: "Could not reach the gh-status endpoint.",
      });
    } finally {
      setGhLoading(false);
    }
  }, []);

  useEffect(() => {
    if (usePrivate && !gh && !ghLoading) void checkGh();
  }, [usePrivate, gh, ghLoading, checkGh]);

  const ghBlocked =
    usePrivate && gh !== null && (!gh.installed || !gh.authenticated);

  const fetchRefs = useCallback(async () => {
    if (!url) return;
    setRefsLoading(true);
    setRefsError(null);
    try {
      const res = await fetch("/api/refs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, usePrivate }),
      });
      const data = await res.json();
      if (!res.ok) {
        setRefsError(data.error || `Failed (${res.status})`);
        setRefs(null);
      } else {
        setRefs(data as { branches: string[]; tags: string[] });
      }
    } catch (e) {
      setRefsError((e as Error).message);
    } finally {
      setRefsLoading(false);
    }
  }, [url, usePrivate]);

  async function pasteUrl() {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setUrl(text.trim());
        setRefs(null);
        setRefsError(null);
      }
    } catch {
      /* clipboard blocked — ignore */
    }
  }

  const repoFullName = parseRepoFullName(url);
  const repoRecent = repoFullName
    ? history.filter((r) => r.repoFullName === repoFullName)
    : [];

  const tagMissing = mode === "tag" && !tag.trim();
  const submitDisabled = !url.trim() || ghBlocked || tagMissing;

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitDisabled) return;
    const form = {
      url: url.trim(),
      mode,
      since,
      until,
      branch,
      baseTag,
      tag,
      usePrivate,
    };
    sessionStorage.setItem("commitarc-request", JSON.stringify(form));
    sessionStorage.setItem("commitarc-form", JSON.stringify(form));
    router.push("/analyze");
  }

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-5 shadow-lg"
    >
      {/* Repository type — first choice, before the URL */}
      <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
        Repository type
      </label>
      <div className="inline-flex rounded-lg border border-[var(--border)] p-1">
        {(
          [
            [false, "Public"],
            [true, "Private"],
          ] as [boolean, string][]
        ).map(([val, label]) => (
          <button
            type="button"
            key={label}
            onClick={() => setUsePrivate(val)}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${
              usePrivate === val
                ? "bg-sky-500 text-white"
                : "text-[var(--text-muted)] hover:text-[var(--text)]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <p className="mt-1 text-xs text-[var(--text-faint)]">
        {usePrivate ? (
          <>
            Private repos are accessed via the local{" "}
            <code className="codechip">gh</code> CLI.
          </>
        ) : (
          "Public repos are read through the GitHub API."
        )}
      </p>

      {usePrivate && (
        <GhSetup gh={gh} loading={ghLoading} onRecheck={checkGh} />
      )}

      <label className="mb-1 mt-5 block text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
        Repository URL
      </label>
      <div className="relative">
        <input
          type="text"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            setRefs(null);
            setRefsError(null);
          }}
          placeholder="https://github.com/owner/repo"
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--inset)] py-2.5 pl-3 pr-20 text-sm text-[var(--text-strong)] outline-none focus:border-sky-500"
        />
        <button
          type="button"
          onClick={pasteUrl}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md border border-[var(--border)] bg-[var(--panel)] px-2.5 py-1 text-xs font-medium text-[var(--text-muted)] transition hover:text-[var(--text-strong)]"
        >
          Paste
        </button>
      </div>

      {repoRecent.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-[var(--text-faint)]">
            {repoRecent.length} previous run
            {repoRecent.length > 1 ? "s" : ""} for {repoFullName}:
          </span>
          {repoRecent.slice(0, 4).map((r) => (
            <Link
              key={r.id}
              href={`/history/${r.id}`}
              className="rounded border border-[var(--border)] bg-[var(--inset)] px-2 py-0.5 text-[var(--text)] hover:border-sky-500"
            >
              {r.rangeLabel} · {new Date(r.savedAt).toLocaleDateString()}
            </Link>
          ))}
        </div>
      )}

      {/* Fetch branches & tags */}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={fetchRefs}
          disabled={!url || refsLoading || ghBlocked}
          className="rounded-lg border border-[var(--border)] bg-[var(--inset)] px-3 py-1.5 text-xs font-medium text-[var(--text)] transition hover:border-sky-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {refsLoading ? "Fetching…" : "Fetch branches & tags"}
        </button>
        {refs && (
          <span className="text-xs text-[var(--text-faint)]">
            {refs.branches.length} branches · {refs.tags.length} tags — pick
            from the fields below
          </span>
        )}
        {refsError && <span className="text-xs text-red-500">{refsError}</span>}
      </div>

      {/* Mode toggle */}
      <div className="mt-4 inline-flex rounded-lg border border-[var(--border)] p-1">
        {(
          [
            ["dateRange", "Date range"],
            ["tag", "Up to a tag"],
          ] as [AnalysisMode, string][]
        ).map(([value, label]) => (
          <button
            type="button"
            key={value}
            onClick={() => setMode(value)}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${
              mode === value
                ? "bg-sky-500 text-white"
                : "text-[var(--text-muted)] hover:text-[var(--text)]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === "dateRange" ? (
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Since">
            <input
              type="date"
              value={since}
              onChange={(e) => setSince(e.target.value)}
              aria-label="Since date"
              className="input"
            />
          </Field>
          <Field label="Until">
            <input
              type="date"
              value={until}
              onChange={(e) => setUntil(e.target.value)}
              aria-label="Until date"
              className="input"
            />
          </Field>
          <Field label="Branch (optional)">
            <RefField
              value={branch}
              onChange={setBranch}
              options={refs?.branches ?? null}
              placeholder="main"
              emptyLabel="Default branch"
            />
          </Field>
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Tag to analyze (required)">
            <RefField
              value={tag}
              onChange={setTag}
              options={refs?.tags ?? null}
              placeholder="v1.1.0"
              emptyLabel="— select a tag —"
            />
          </Field>
          <Field label="Compare from base (optional)">
            <RefField
              value={baseTag}
              onChange={setBaseTag}
              options={refs?.tags ?? null}
              placeholder="v1.0.0"
              emptyLabel="(none — from start)"
            />
          </Field>
          <p className="text-xs text-[var(--text-faint)] sm:col-span-2">
            Pick the tag you want the report up to. Optionally set a base tag to
            compare only the commits between the two; leave it empty to include
            all commits reachable from the tag.
          </p>
        </div>
      )}

      {tagMissing && (
        <p className="mt-4 text-xs text-red-500">
          Select or enter a tag to analyze in tag mode.
        </p>
      )}

      <button
        type="submit"
        disabled={submitDisabled}
        className="mt-4 w-full rounded-lg bg-sky-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Analyze commit history
      </button>
      <p className="mt-2 text-center text-xs text-[var(--text-faint)]">
        Analysis only — you&apos;ll choose to generate a technical or client
        report afterwards.
      </p>
    </form>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
        {label}
      </label>
      {children}
    </div>
  );
}

function RefField({
  value,
  onChange,
  options,
  placeholder,
  emptyLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[] | null;
  placeholder: string;
  emptyLabel: string;
}) {
  if (options && options.length > 0) {
    const known = options.includes(value);
    return (
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={placeholder}
        className="input"
      >
        <option value="">{emptyLabel}</option>
        {value && !known && <option value={value}>{value} (custom)</option>}
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  }
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label={placeholder}
      className="input"
    />
  );
}

function GhSetup({
  gh,
  loading,
  onRecheck,
}: {
  gh: GhStatus | null;
  loading: boolean;
  onRecheck: () => void;
}) {
  return (
    <div className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--inset)] p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
          GitHub CLI status
        </span>
        <button
          type="button"
          onClick={onRecheck}
          disabled={loading}
          className="text-xs text-sky-400 hover:text-sky-300 disabled:opacity-50"
        >
          {loading ? "Checking…" : "Re-check"}
        </button>
      </div>

      {loading && !gh && (
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          Checking gh setup…
        </p>
      )}

      {gh && (
        <div className="mt-3 space-y-3 text-sm">
          <StatusRow ok={gh.installed} label="gh installed">
            {gh.version ?? "not found on PATH"}
          </StatusRow>
          <StatusRow ok={gh.authenticated} label="gh authenticated">
            {gh.authenticated
              ? gh.account
                ? `logged in as ${gh.account}`
                : "logged in"
              : "not logged in"}
          </StatusRow>

          {!gh.installed && (
            <Instructions
              title="Install the GitHub CLI"
              steps={[
                ["macOS (Homebrew)", "brew install gh"],
                ["Windows (winget)", "winget install --id GitHub.cli"],
                ["Linux (Debian/Ubuntu)", "sudo apt install gh"],
              ]}
              footer="See https://cli.github.com for all platforms, then click Re-check."
            />
          )}

          {gh.installed && !gh.authenticated && (
            <Instructions
              title="Log in to GitHub"
              steps={[
                ["Start login", "gh auth login"],
                [
                  "Pick",
                  "GitHub.com → HTTPS → authenticate with a browser (or paste a token)",
                ],
                ["Verify", "gh auth status"],
              ]}
              footer="Make sure the account has access to the private repo, then click Re-check."
            />
          )}

          {gh.installed && gh.authenticated && (
            <p className="banner-ok rounded-md px-3 py-2">
              gh is installed and authenticated — private repos you can access
              will work.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function StatusRow({
  ok,
  label,
  children,
}: {
  ok: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold ${
          ok
            ? "bg-emerald-500/20 text-emerald-500"
            : "bg-red-500/20 text-red-500"
        }`}
      >
        {ok ? "✓" : "✕"}
      </span>
      <span className="text-[var(--text)]">{label}:</span>
      <span className="text-[var(--text-muted)]">{children}</span>
    </div>
  );
}

function Instructions({
  title,
  steps,
  footer,
}: {
  title: string;
  steps: [string, string][];
  footer: string;
}) {
  return (
    <div className="banner-warn rounded-md p-3">
      <p className="mb-2 font-medium text-[var(--text-strong)]">{title}</p>
      <ol className="space-y-2">
        {steps.map(([label, cmd], i) => (
          <li key={i} className="text-[var(--text)]">
            <span className="text-[var(--text-muted)]">
              {i + 1}. {label}:
            </span>
            <pre className="mt-1 overflow-x-auto rounded bg-[var(--chip)] px-3 py-2 text-xs text-[var(--code-fg)]">
              {cmd}
            </pre>
          </li>
        ))}
      </ol>
      <p className="mt-2 text-xs text-[var(--text-faint)]">{footer}</p>
    </div>
  );
}
