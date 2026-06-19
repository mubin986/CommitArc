"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Nav from "@/components/Nav";
import ProgressPanel from "@/components/ProgressPanel";
import { useAnalysisStream } from "@/lib/useAnalysisStream";
import type { AnalyzeRequest } from "@/lib/types";

export default function AnalyzePage() {
  const router = useRouter();
  const [request, setRequest] = useState<AnalyzeRequest | null>(null);
  const [noRequest, setNoRequest] = useState(false);

  useEffect(() => {
    const raw = sessionStorage.getItem("commitarc-request");
    if (!raw) {
      setNoRequest(true);
      return;
    }
    try {
      setRequest(JSON.parse(raw) as AnalyzeRequest);
    } catch {
      setNoRequest(true);
    }
  }, []);

  const a = useAnalysisStream(request);

  // Once the analysis is saved, jump to the record page to generate reports.
  useEffect(() => {
    if (a.savedId) router.replace(`/history/${a.savedId}`);
  }, [a.savedId, router]);

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-3xl px-5 py-8">
        <div className="mb-6 flex items-center justify-between gap-3">
          <h1 className="text-xl font-bold text-[var(--text-strong)]">
            {a.repo ? a.repo.fullName : "Analyzing commit history…"}
          </h1>
          <Link
            href="/"
            className="rounded-lg border border-[var(--border)] bg-[var(--panel)] px-3 py-1.5 text-sm text-[var(--text-muted)] transition hover:text-[var(--text-strong)]"
          >
            ← New analysis
          </Link>
        </div>

        {noRequest && (
          <div className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-6 text-center text-sm text-[var(--text-muted)]">
            No analysis in progress.{" "}
            <Link href="/" className="text-sky-400 hover:text-sky-300">
              Start one →
            </Link>
          </div>
        )}

        {a.fatalError && (
          <div className="banner-error rounded-lg p-4 text-sm">
            {a.fatalError}
          </div>
        )}

        {request && !a.fatalError && !a.savedId && (
          <ProgressPanel
            repo={a.repo}
            log={a.progressLog}
            statsProg={a.statsProg}
          />
        )}
      </main>
    </>
  );
}
