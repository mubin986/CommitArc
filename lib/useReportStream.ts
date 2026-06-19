"use client";

import { useState } from "react";
import type { AiSelection, ReportType } from "./types";

export interface ReportStreamState {
  generatingType: ReportType | null;
  text: string;
  error: string | null;
  start: (type: ReportType, ai: AiSelection) => void;
}

/** Generate one AI report for a saved record via /api/report (SSE). */
export function useReportStream(
  recordId: string,
  onDone: (type: ReportType, ok: boolean) => void,
): ReportStreamState {
  const [generatingType, setGeneratingType] = useState<ReportType | null>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);

  function start(type: ReportType, ai: AiSelection) {
    if (generatingType) return;
    setGeneratingType(type);
    setText("");
    setError(null);
    let ok = false;

    (async () => {
      try {
        const res = await fetch("/api/report", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            recordId,
            reportType: type,
            aiProvider: ai.provider || undefined,
            apiKey: ai.provider === "manual" ? ai.apiKey : undefined,
            model: ai.model || undefined,
          }),
        });

        if (!res.ok || !res.body) {
          let m = `Failed (${res.status})`;
          try {
            const j = await res.json();
            if (j?.error) m = j.error;
          } catch {
            /* not JSON */
          }
          setError(m);
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        let acc = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });

          let sep: number;
          while ((sep = buf.indexOf("\n\n")) !== -1) {
            const block = buf.slice(0, sep);
            buf = buf.slice(sep + 2);

            let evn = "message";
            let da = "";
            for (const l of block.split("\n")) {
              if (l.startsWith("event: ")) evn = l.slice(7);
              else if (l.startsWith("data: ")) da += l.slice(6);
            }
            if (!da) continue;

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let p: any;
            try {
              p = JSON.parse(da);
            } catch {
              continue;
            }

            if (evn === "ai_delta") {
              acc += p.text;
              setText(acc);
            } else if (evn === "ai_done") {
              ok = true;
            } else if (evn === "error" || evn === "ai_error") {
              setError(p.message);
            }
          }
        }
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setGeneratingType(null);
        onDone(type, ok);
      }
    })();
  }

  return { generatingType, text, error, start };
}
