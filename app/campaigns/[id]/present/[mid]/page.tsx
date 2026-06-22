"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import Deck from "@/components/Deck";
import { getCampaign, type Campaign } from "@/lib/campaign";

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

export default function MilestonePresentPage() {
  const params = useParams<{ id: string; mid: string }>();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void getCampaign(params.id).then((c) => {
      if (active) {
        setCampaign(c);
        setLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, [params.id]);

  const milestone = campaign?.milestones.find((m) => m.id === params.mid);

  useEffect(() => {
    document.title = milestone
      ? `${campaign?.repoName} — ${milestone.title}`
      : "Milestone";
  }, [campaign, milestone]);

  if (loading) return <Centered>Loading…</Centered>;
  if (!campaign || !milestone) return <Centered>Milestone not found.</Centered>;
  if (!milestone.report) {
    return (
      <Centered>
        No deck has been generated for “{milestone.title}” yet. Go back to the
        campaign and click <strong>Generate deck</strong>.
      </Centered>
    );
  }

  const label = milestone.reportType === "demo" ? "Product demo" : "Release";
  return (
    <Deck
      title={milestone.title}
      subtitle={`${label} · ${campaign.repoName} · ${milestone.rangeLabel}`}
      date={new Date(milestone.scheduledDate).toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
      })}
      markdown={milestone.report.text}
    />
  );
}
