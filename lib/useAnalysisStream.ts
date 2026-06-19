"use client";

import { useEffect, useState } from "react";
import { saveRecord } from "./history";
import type {
  AnalyzeRequest,
  AnalyzeResponse,
  ReportBody,
  RepoMeta,
} from "./types";

export interface AnalysisState {
  running: boolean;
  fatalError: string | null;
  progressLog: string[];
  statsProg: { done: number; total: number } | null;
  repo: RepoMeta | null;
  savedId: string | null;
}

/**
 * Runs the commit analysis (no AI) for `request`, streams progress, and saves
 * the finished analysis to server history. Exposes the saved record id so the
 * caller can navigate to the record page where AI reports are generated.
 */
export function useAnalysisStream(request: AnalyzeRequest | null): AnalysisState {
  const [running, setRunning] = useState(false);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [progressLog, setProgressLog] = useState<string[]>([]);
  const [statsProg, setStatsProg] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const [repo, setRepo] = useState<RepoMeta | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  useEffect(() => {
    if (!request) return;
    let cancelled = false;
    const ctrl = new AbortController();

    setRunning(true);
    setFatalError(null);
    setProgressLog([]);
    setStatsProg(null);
    setRepo(null);
    setSavedId(null);

    (async () => {
      let localRepo: RepoMeta | null = null;
      let localBody: ReportBody | null = null;
      let saved = false;

      try {
        const res = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(request),
          signal: ctrl.signal,
        });

        if (!res.ok || !res.body) {
          let msg = `Request failed (${res.status})`;
          try {
            const j = await res.json();
            if (j?.error) msg = j.error;
          } catch {
            /* not JSON */
          }
          if (!cancelled) setFatalError(msg);
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
            const rawEvent = buf.slice(0, sep);
            buf = buf.slice(sep + 2);
            if (cancelled) continue;

            let ev = "message";
            let dataStr = "";
            for (const line of rawEvent.split("\n")) {
              if (line.startsWith("event: ")) ev = line.slice(7);
              else if (line.startsWith("data: ")) dataStr += line.slice(6);
            }
            if (!dataStr) continue;

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let p: any;
            try {
              p = JSON.parse(dataStr);
            } catch {
              continue;
            }

            switch (ev) {
              case "phase":
                setProgressLog((l) =>
                  l[l.length - 1] === p.message ? l : [...l, p.message],
                );
                if (p.phase === "stats" && typeof p.total === "number")
                  setStatsProg({ done: p.done ?? 0, total: p.total });
                break;
              case "repo":
                localRepo = p;
                setRepo(p);
                break;
              case "stats_progress":
                setStatsProg({ done: p.done, total: p.total });
                break;
              case "partial":
                localRepo = p.repo;
                setRepo(p.repo);
                localBody = {
                  rangeLabel: p.rangeLabel,
                  truncated: p.truncated,
                  commits: p.commits,
                  stats: p.stats,
                };
                break;
              case "done":
                if (localRepo && localBody && !saved) {
                  saved = true;
                  const result: AnalyzeResponse = {
                    repo: localRepo,
                    rangeLabel: localBody.rangeLabel,
                    truncated: localBody.truncated,
                    commits: localBody.commits,
                    stats: localBody.stats,
                    reports: { technical: null, presentation: null, demo: null },
                  };
                  const summary = await saveRecord({
                    repoUrl: request.url,
                    mode: request.mode,
                    result,
                  });
                  if (!cancelled && summary) setSavedId(summary.id);
                }
                break;
              case "error":
                setFatalError(p.message);
                break;
            }
          }
        }
      } catch (e) {
        if (!cancelled && (e as Error).name !== "AbortError")
          setFatalError((e as Error).message);
      } finally {
        if (!cancelled) setRunning(false);
      }
    })();

    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, [request]);

  return { running, fatalError, progressLog, statsProg, repo, savedId };
}
