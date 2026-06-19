"use client";

import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";
import { BlockNoteView } from "@blocknote/mantine";
import { useCreateBlockNote } from "@blocknote/react";
import { useEffect, useState } from "react";
import type { AiSelection, ReportType } from "@/lib/types";

export default function ReportEditor({
  recordId,
  reportType,
  initialText,
  ai,
  onSaved,
  onCancel,
}: {
  recordId: string;
  reportType: ReportType;
  initialText: string;
  ai: AiSelection;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const editor = useCreateBlockNote();
  const [ready, setReady] = useState(false);
  const [changed, setChanged] = useState(false);
  const [saving, setSaving] = useState(false);
  const [revising, setRevising] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [dark, setDark] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  // Load the report Markdown into the block editor on mount.
  useEffect(() => {
    let active = true;
    void (async () => {
      const blocks = await editor.tryParseMarkdownToBlocks(initialText || "");
      if (!active) return;
      editor.replaceBlocks(editor.document, blocks);
      setReady(true);
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  // Fullscreen: Esc to exit + lock background scroll.
  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFullscreen(false);
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [fullscreen]);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const md = (await editor.blocksToMarkdownLossy(editor.document)).trim();
      const res = await fetch("/api/report", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recordId, reportType, text: md }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error || `Save failed (${res.status})`);
      else onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function revise() {
    if (!instruction.trim() || revising || !ready) return;
    setRevising(true);
    setError(null);
    try {
      const res = await fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recordId,
          reportType,
          instruction: instruction.trim(),
          aiProvider: ai.provider || undefined,
          apiKey: ai.provider === "manual" ? ai.apiKey : undefined,
          model: ai.model || undefined,
        }),
      });
      if (!res.ok || !res.body) {
        let m = `Revise failed (${res.status})`;
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
      let started = false;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let i: number;
        while ((i = buf.indexOf("\n\n")) !== -1) {
          const blk = buf.slice(0, i);
          buf = buf.slice(i + 2);
          let ev = "";
          let da = "";
          for (const l of blk.split("\n")) {
            if (l.startsWith("event: ")) ev = l.slice(7);
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
          if (ev === "ai_delta") {
            if (!started) {
              started = true;
              acc = "";
            }
            acc += p.text;
          } else if (ev === "error") {
            setError(p.message);
          }
        }
      }
      if (acc.trim()) {
        const blocks = await editor.tryParseMarkdownToBlocks(acc.trim());
        editor.replaceBlocks(editor.document, blocks);
        setChanged(true);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRevising(false);
    }
  }

  const label =
    reportType === "technical"
      ? "Technical report"
      : reportType === "demo"
        ? "Product demo"
        : "Client presentation";

  return (
    <div
      className={`no-print${fullscreen ? " fixed inset-0 z-[60] overflow-y-auto bg-[var(--bg)]" : ""}`}
    >
      <div className={fullscreen ? "mx-auto max-w-4xl px-5 py-6 pb-24" : ""}>
        <div className="mb-3 flex items-center justify-between gap-2">
          <span className="text-sm font-semibold text-[var(--text-strong)]">
            {fullscreen ? `Editing — ${label}` : ""}
          </span>
          <button
            type="button"
            onClick={() => setFullscreen((f) => !f)}
            className="rounded-lg border border-[var(--border)] bg-[var(--inset)] px-3 py-1.5 text-xs font-medium text-[var(--text)] transition hover:border-sky-500"
          >
            {fullscreen ? "⤢ Exit fullscreen" : "⤢ Fullscreen"}
          </button>
        </div>

      {/* AI revise */}
      <div className="mb-3 flex flex-wrap gap-2">
        <input
          type="text"
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void revise();
          }}
          placeholder="Revise with AI — e.g. “make it more concise”, “lead with certificates”…"
          aria-label="AI revise instruction"
          disabled={revising}
          className="input flex-1"
        />
        <button
          type="button"
          onClick={() => void revise()}
          disabled={revising || !instruction.trim() || !ready}
          className="rounded-lg bg-sky-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-sky-400 disabled:opacity-50"
        >
          {revising ? "Revising…" : "✦ Revise"}
        </button>
      </div>

      {/* Block editor */}
      <div
        className="overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--panel)] py-2"
        style={
          fullscreen
            ? { minHeight: "72vh" }
            : { minHeight: "42vh", maxHeight: "66vh" }
        }
      >
        {!ready && (
          <p className="px-4 py-3 text-sm text-[var(--text-muted)]">
            Loading editor…
          </p>
        )}
        <BlockNoteView
          editor={editor}
          theme={dark ? "dark" : "light"}
          editable={!revising}
          onChange={() => {
            if (ready) setChanged(true);
          }}
        />
      </div>

      <p className="mt-2 text-xs text-[var(--text-faint)]">
        Type <code className="codechip">/</code> for blocks · drag the handle to
        reorder · select text for formatting. Heading 2 starts a new slide.
      </p>

      {error && <p className="mt-2 text-xs text-red-500">{error}</p>}

      {/* Footer (fixed at the bottom in fullscreen) */}
      <div
        className={
          fullscreen
            ? "fixed inset-x-0 bottom-0 z-[61] border-t border-[var(--border)] bg-[var(--panel)]"
            : "mt-3"
        }
      >
        <div
          className={`flex items-center justify-between gap-2${
            fullscreen ? " mx-auto max-w-4xl px-5 py-3" : ""
          }`}
        >
          <span className="text-xs text-[var(--text-faint)]">
            {revising
              ? "AI is revising…"
              : changed
                ? "unsaved changes"
                : "no changes"}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={saving || revising}
              className="rounded-lg border border-[var(--border)] bg-[var(--inset)] px-3 py-1.5 text-xs font-medium text-[var(--text)] transition hover:border-sky-500 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving || revising || !changed}
              className="rounded-lg bg-sky-500 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-sky-400 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
