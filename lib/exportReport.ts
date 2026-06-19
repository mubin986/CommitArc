"use client";

import {
  buildNarrativeMarkdown,
  buildReportMarkdown,
  reportLabel,
} from "./reportMarkdown";
import type { ReportBody, ReportType, RepoMeta } from "./types";

export function downloadFile(
  filename: string,
  content: string,
  type: string,
): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function exportMarkdownFor(
  repo: RepoMeta,
  body: ReportBody,
  text: string,
  type: ReportType,
): void {
  if (type === "presentation" || type === "demo") {
    const suffix = type === "demo" ? "demo" : "presentation";
    downloadFile(
      `${repo.owner}-${repo.repo}-${suffix}.md`,
      buildNarrativeMarkdown(repo, body, text, reportLabel(type)),
      "text/markdown;charset=utf-8",
    );
  } else {
    downloadFile(
      `${repo.owner}-${repo.repo}-report.md`,
      buildReportMarkdown(repo, body, text),
      "text/markdown;charset=utf-8",
    );
  }
}
