"use client";

import { useState } from "react";
import type { ReportType } from "@/lib/types";

function parseHeadTag(rangeLabel: string): string {
  if (rangeLabel.includes("→")) return rangeLabel.split("→").pop()!.trim();
  const m = rangeLabel.match(/up to (.+)/i);
  return m ? m[1].trim() : "";
}

type Target = "gist" | "wiki" | "release";

const BTN =
  "mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--inset)] px-2.5 py-1.5 text-xs font-medium text-[var(--text)] transition hover:border-sky-500 disabled:opacity-50";

export default function PublishMenu({
  recordId,
  reportType,
  rangeLabel,
  onPublished,
}: {
  recordId: string;
  reportType: ReportType;
  rangeLabel: string;
  onPublished?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<Target | null>(null);
  const [result, setResult] = useState<{ url?: string; message: string } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [isPublic, setIsPublic] = useState(false);
  const [tag, setTag] = useState(parseHeadTag(rangeLabel));

  async function publish(target: Target, confirmMsg: string) {
    if (!window.confirm(confirmMsg)) return;
    setBusy(target);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recordId,
          reportType,
          target,
          public: target === "gist" ? isPublic : undefined,
          tag: target === "release" ? tag.trim() : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || `Failed (${res.status})`);
      } else {
        setResult({ url: data.url, message: data.message });
        onPublished?.();
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="rounded-lg border border-[var(--border)] bg-[var(--inset)] px-3 py-1.5 text-xs font-medium text-[var(--text)] transition hover:border-sky-500"
      >
        Publish ▾
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-2 w-72 rounded-lg border border-[var(--border)] bg-[var(--panel)] p-3 text-left shadow-xl">
          {/* Gist */}
          <div className="mb-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[var(--text-strong)]">
                Secret Gist
              </span>
              <label className="flex items-center gap-1 text-xs text-[var(--text-muted)]">
                <input
                  type="checkbox"
                  checked={isPublic}
                  onChange={(e) => setIsPublic(e.target.checked)}
                  className="h-3.5 w-3.5 accent-sky-500"
                />
                public
              </label>
            </div>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() =>
                publish(
                  "gist",
                  `Publish the ${reportType} report as a ${isPublic ? "PUBLIC" : "secret"} gist?`,
                )
              }
              className={BTN}
            >
              {busy === "gist" ? "Publishing…" : "Create gist"}
            </button>
            <p className="mt-1 text-[11px] text-[var(--text-faint)]">
              Shareable link — no repo access needed.
            </p>
          </div>

          {/* Wiki */}
          <div className="mb-3 border-t border-[var(--border)] pt-3">
            <span className="text-xs font-semibold text-[var(--text-strong)]">
              Repo Wiki
            </span>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() =>
                publish(
                  "wiki",
                  `Publish the ${reportType} report to the repo Wiki? This pushes a page to <owner>/<repo>.wiki.git.`,
                )
              }
              className={BTN}
            >
              {busy === "wiki" ? "Publishing…" : "Publish to wiki"}
            </button>
            <p className="mt-1 text-[11px] text-[var(--text-faint)]">
              Wiki must be enabled. Best for the technical report (viewers need
              repo access).
            </p>
          </div>

          {/* Release */}
          <div className="border-t border-[var(--border)] pt-3">
            <span className="text-xs font-semibold text-[var(--text-strong)]">
              Release notes
            </span>
            <input
              type="text"
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              placeholder="tag (e.g. v1.2.0)"
              aria-label="Release tag"
              className="input mt-1"
            />
            <button
              type="button"
              disabled={busy !== null || !tag.trim()}
              onClick={() =>
                publish(
                  "release",
                  `Append the ${reportType} report to release ${tag.trim()}? A draft release is created if none exists.`,
                )
              }
              className={BTN}
            >
              {busy === "release" ? "Publishing…" : "Add to release"}
            </button>
          </div>

          {result && (
            <p className="mt-3 text-xs text-emerald-500">
              {result.message}{" "}
              {result.url && (
                <a
                  href={result.url}
                  target="_blank"
                  rel="noreferrer"
                  className="underline hover:text-emerald-400"
                >
                  Open ↗
                </a>
              )}
            </p>
          )}
          {error && <p className="mt-3 text-xs text-red-500">{error}</p>}
        </div>
      )}
    </div>
  );
}
