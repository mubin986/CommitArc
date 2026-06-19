"use client";

import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import Deck from "@/components/Deck";
import { getRecord, type HistoryRecord } from "@/lib/history";
import type { ReportType } from "@/lib/types";

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="deck-root">
      <div className="deck-stage" style={{ cursor: "default" }}>
        <p
          style={{
            maxWidth: "42rem",
            textAlign: "center",
            color: "#475569",
            fontSize: "1.15rem",
            lineHeight: 1.6,
          }}
        >
          {children}
        </p>
      </div>
    </div>
  );
}

function PresentInner() {
  const params = useParams<{ id: string }>();
  const sp = useSearchParams();
  // Only the client-facing reports are presentable as a deck.
  const type: ReportType = sp.get("type") === "demo" ? "demo" : "presentation";

  const [record, setRecord] = useState<HistoryRecord | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void getRecord(params.id).then((r) => {
      if (active) {
        setRecord(r);
        setLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, [params.id]);

  useEffect(() => {
    const kind = type === "demo" ? "Demo" : "Presentation";
    document.title = record ? `${record.repoName} — ${kind}` : kind;
  }, [record, type]);

  if (loading) return <Centered>Loading…</Centered>;

  const content = record?.result.reports[type];
  if (!record || !content) {
    const kind = type === "demo" ? "product demo" : "client presentation";
    return (
      <Centered>
        No {kind} has been generated for this analysis. Go back and click{" "}
        <strong>Generate</strong> on the {kind} tab.
      </Centered>
    );
  }

  const label = type === "demo" ? "Product demo" : "Release";
  return (
    <Deck
      title={record.result.repo.fullName}
      subtitle={`${label} · ${record.result.rangeLabel}`}
      date={new Date(record.savedAt).toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
      })}
      markdown={content.text}
    />
  );
}

export default function PresentPage() {
  return (
    <Suspense fallback={<Centered>Loading…</Centered>}>
      <PresentInner />
    </Suspense>
  );
}
