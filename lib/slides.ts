export interface Slide {
  heading: string;
  body: string;
}

const DEFAULT_MAX_BULLETS = 5;

// Split one section's body into chunks of at most `max` top-level bullets,
// keeping any intro text on the first chunk. Returns [body] if short.
function paginateBody(body: string, max: number): string[] {
  const lines = body.split("\n");
  const intro: string[] = [];
  const items: string[][] = [];
  let cur: string[] | null = null;
  for (const ln of lines) {
    if (/^\s*[-*]\s+/.test(ln)) {
      if (cur) items.push(cur);
      cur = [ln];
    } else if (cur) {
      cur.push(ln);
    } else {
      intro.push(ln);
    }
  }
  if (cur) items.push(cur);

  if (items.length <= max) return [body];

  const chunks: string[] = [];
  for (let k = 0; k < items.length; k += max) {
    const slice = items
      .slice(k, k + max)
      .map((it) => it.join("\n"))
      .join("\n");
    chunks.push(
      k === 0
        ? [intro.join("\n"), slice].filter((x) => x.trim()).join("\n")
        : slice,
    );
  }
  return chunks;
}

/** Parse report markdown into presentation slides (new slide per ## or ###). */
export function buildSlides(
  markdown: string,
  maxBullets: number = DEFAULT_MAX_BULLETS,
): Slide[] {
  const raw: Slide[] = [];
  let cur: Slide | null = null;
  for (const line of markdown.split("\n")) {
    const m = line.match(/^#{2,3}\s+(.*)/);
    if (m) {
      if (cur) raw.push(cur);
      cur = { heading: m[1].trim(), body: "" };
    } else {
      if (!cur) cur = { heading: "", body: "" };
      cur.body += line + "\n";
    }
  }
  if (cur) raw.push(cur);

  const out: Slide[] = [];
  for (const s of raw) {
    const chunks = paginateBody(s.body, maxBullets);
    if (chunks.length <= 1) {
      out.push(s);
    } else {
      chunks.forEach((c, idx) =>
        out.push({
          heading: idx === 0 ? s.heading : `${s.heading} (cont.)`,
          body: c,
        }),
      );
    }
  }
  return out.filter((s) => s.heading || s.body.trim());
}
