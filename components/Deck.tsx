"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { buildSlides } from "@/lib/slides";

export default function Deck({
  title,
  subtitle,
  date,
  markdown,
}: {
  title: string;
  subtitle: string;
  date?: string;
  markdown: string;
}) {
  const sections = useMemo(() => buildSlides(markdown), [markdown]);
  const total = sections.length + 1; // + cover slide
  const [i, setI] = useState(0);
  const [fs, setFs] = useState(false);

  const next = useCallback(
    () => setI((x) => Math.min(total - 1, x + 1)),
    [total],
  );
  const prev = useCallback(() => setI((x) => Math.max(0, x - 1)), []);

  const toggleFs = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (["ArrowRight", " ", "PageDown"].includes(e.key)) {
        e.preventDefault();
        next();
      } else if (["ArrowLeft", "PageUp"].includes(e.key)) {
        prev();
      } else if (e.key === "Home") {
        setI(0);
      } else if (e.key === "End") {
        setI(total - 1);
      } else if (e.key.toLowerCase() === "f") {
        toggleFs();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev, total, toggleFs]);

  useEffect(() => {
    const h = () => setFs(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", h);
    return () => document.removeEventListener("fullscreenchange", h);
  }, []);

  const isCover = i === 0;
  const sec = sections[i - 1];
  const progress = total > 1 ? (i / (total - 1)) * 100 : 100;

  return (
    <div className="deck-root">
      <div className="deck-progress" style={{ width: `${progress}%` }} />

      <div
        className="deck-stage"
        onClick={(e) => {
          if (e.clientX > window.innerWidth * 0.35) next();
          else prev();
        }}
      >
        {isCover ? (
          <div className="deck-slide deck-cover" key="cover">
            <span className="deck-cover-accent" />
            <div>
              {subtitle && <p className="deck-eyebrow">{subtitle}</p>}
              <h1 className="deck-title">{title}</h1>
              {date && <p className="deck-date">{date}</p>}
            </div>
          </div>
        ) : (
          <div className="deck-slide" key={i}>
            {sec.heading && <h2 className="deck-heading">{sec.heading}</h2>}
            <div className="deck-md">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {sec.body}
              </ReactMarkdown>
            </div>
          </div>
        )}
      </div>

      <div className="deck-chrome">
        <span className="deck-brand">
          Commit<span style={{ color: "#0ea5e9" }}>Arc</span>
        </span>
        <div className="deck-controls">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              prev();
            }}
            disabled={i === 0}
            aria-label="Previous slide"
          >
            ‹
          </button>
          <span className="deck-count">
            {i + 1} / {total}
          </span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              next();
            }}
            disabled={i === total - 1}
            aria-label="Next slide"
          >
            ›
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggleFs();
            }}
            className="deck-fs"
            aria-label="Toggle fullscreen"
          >
            {fs ? "⤢ Exit" : "⤢ Fullscreen"}
          </button>
        </div>
      </div>
    </div>
  );
}
