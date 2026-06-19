"use client";

import { buildSlides } from "./slides";
import type { ReportBody, ReportType, RepoMeta } from "./types";

const ACCENT = "0EA5E9";

function strip(s: string): string {
  return s
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
}

interface Run {
  text: string;
  options?: Record<string, unknown>;
}

function bodyToRuns(body: string): Run[] {
  const runs: Run[] = [];
  for (const raw of body.split("\n")) {
    const line = raw.replace(/\s+$/, "");
    if (!line.trim()) continue;

    const bullet = line.match(/^\s*[-*]\s+(.*)/);
    const inner = strip(bullet ? bullet[1] : line);
    const show = inner.match(/^show:\s*(.*)/i);

    if (show) {
      runs.push({
        text: `▶ ${show[1]}`,
        options: { italic: true, color: "0284C7", breakLine: true },
      });
      continue;
    }

    if (bullet) {
      const sep = inner.indexOf(" — ");
      if (sep > 0 && sep < 70) {
        runs.push({
          text: inner.slice(0, sep),
          options: { bold: true, bullet: true, color: "0F172A" },
        });
        runs.push({
          text: inner.slice(sep),
          options: { breakLine: true, color: "1E293B" },
        });
      } else {
        runs.push({
          text: inner,
          options: { bullet: true, breakLine: true, color: "1E293B" },
        });
      }
    } else {
      runs.push({
        text: inner,
        options: { breakLine: true, color: "1E293B", paraSpaceAfter: 6 },
      });
    }
  }
  return runs;
}

export async function exportPptx(
  repo: RepoMeta,
  body: ReportBody,
  text: string,
  type: ReportType,
): Promise<void> {
  const PptxGen = (await import("pptxgenjs")).default;
  const pptx = new PptxGen();
  pptx.layout = "LAYOUT_WIDE"; // 13.33 x 7.5 in

  // pptxgenjs' ShapeType enum isn't reliably attached to the ESM default
  // export, so use the underlying shape-name string ("rect") directly.
  const RECT = ((PptxGen as { ShapeType?: { rect?: string } }).ShapeType?.rect ??
    "rect") as never;

  const label =
    type === "demo"
      ? "Product Demo"
      : type === "presentation"
        ? "Client Presentation"
        : "Report";

  // Cover slide
  const cover = pptx.addSlide();
  cover.background = { color: "F8FAFC" };
  cover.addShape(RECT, {
    x: 0,
    y: 0,
    w: 0.18,
    h: 7.5,
    fill: { color: ACCENT },
  });
  cover.addText(label.toUpperCase(), {
    x: 0.9,
    y: 2.35,
    w: 11.5,
    h: 0.5,
    fontSize: 16,
    bold: true,
    color: ACCENT,
    charSpacing: 2,
  });
  cover.addText(repo.fullName, {
    x: 0.9,
    y: 2.85,
    w: 11.5,
    h: 1.7,
    fontSize: 44,
    bold: true,
    color: "0F172A",
  });
  cover.addText(`Release · ${body.rangeLabel}`, {
    x: 0.9,
    y: 4.6,
    w: 11.5,
    h: 0.6,
    fontSize: 18,
    color: "64748B",
  });
  cover.addText("CommitArc", {
    x: 0.9,
    y: 6.7,
    w: 5,
    h: 0.4,
    fontSize: 12,
    bold: true,
    color: "0F172A",
  });

  // Content slides
  for (const s of buildSlides(text)) {
    const slide = pptx.addSlide();
    slide.background = { color: "FFFFFF" };
    slide.slideNumber = { x: 12.6, y: 7.05, fontSize: 10, color: "94A3B8" };
    if (s.heading) {
      slide.addText(strip(s.heading), {
        x: 0.6,
        y: 0.5,
        w: 12.1,
        h: 1.0,
        fontSize: 30,
        bold: true,
        color: "0F172A",
      });
      slide.addShape(RECT, {
        x: 0.62,
        y: 1.5,
        w: 1.6,
        h: 0.06,
        fill: { color: ACCENT },
      });
    }
    const runs = bodyToRuns(s.body);
    if (runs.length) {
      slide.addText(runs as never, {
        x: 0.6,
        y: 1.8,
        w: 12.1,
        h: 5.1,
        fontSize: 18,
        color: "1E293B",
        valign: "top",
        lineSpacingMultiple: 1.15,
        bullet: false,
      });
    }
  }

  const suffix =
    type === "demo"
      ? "demo"
      : type === "presentation"
        ? "presentation"
        : "report";
  await pptx.writeFile({ fileName: `${repo.owner}-${repo.repo}-${suffix}.pptx` });
}
