"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import Nav from "@/components/Nav";
import RecordView from "@/components/RecordView";
import { deleteRecord, getRecord, type HistoryRecord } from "@/lib/history";

export default function HistoryRecordPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [record, setRecord] = useState<HistoryRecord | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    void getRecord(params.id).then((r) => {
      setRecord(r);
      setLoading(false);
    });
  }, [params.id]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-4xl px-5 py-8">
        <div className="no-print mb-6 flex items-center justify-between">
          <Link
            href="/history"
            className="text-sm text-sky-400 hover:text-sky-300"
          >
            ← History
          </Link>
          {record && (
            <button
              type="button"
              onClick={() => {
                if (
                  window.confirm(
                    `Delete the saved analysis of ${record.result.repo.fullName}?`,
                  )
                )
                  void deleteRecord(record.id).then(() =>
                    router.push("/history"),
                  );
              }}
              className="text-xs text-red-500 hover:text-red-400"
            >
              Delete
            </button>
          )}
        </div>

        {loading ? (
          <p className="text-sm text-[var(--text-faint)]">Loading…</p>
        ) : !record ? (
          <p className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-6 text-center text-sm text-[var(--text-muted)]">
            Not found.{" "}
            <Link href="/history" className="text-sky-400 hover:text-sky-300">
              Back to history
            </Link>
          </p>
        ) : (
          <RecordView record={record} onRefresh={load} />
        )}
      </main>
    </>
  );
}
