import {
  GitHubError,
  enrichWithStats,
  getCommits,
  getRepoMeta,
  parseRepoUrl,
} from "@/lib/github";
import { buildStats } from "@/lib/report";
import type { AnalyzeRequest } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Commit analysis only — fetches repo + commits + diff stats and streams
// progress. AI reports are generated on demand via /api/report.
export async function POST(request: Request) {
  let body: AnalyzeRequest;
  try {
    body = (await request.json()) as AnalyzeRequest;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (event: string, data: unknown) => {
        if (closed) return;
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      };

      try {
        if (!body.url) throw new GitHubError("A repository URL is required.");
        const { owner, repo } = parseRepoUrl(body.url);

        const opts = {
          useGh: Boolean(body.usePrivate),
          token: process.env.GITHUB_TOKEN || undefined,
        };

        send("phase", { phase: "repo", message: "Fetching repository…" });
        const repoMeta = await getRepoMeta(owner, repo, opts);
        send("repo", repoMeta);

        send("phase", { phase: "commits", message: "Listing commits…" });
        const { commits, truncated, rangeLabel } = await getCommits(
          owner,
          repo,
          body,
          opts,
        );

        if (commits.length === 0) {
          send("error", {
            message:
              "No commits found for that range. Double-check the dates, tag, or branch.",
          });
          return;
        }

        send("phase", {
          phase: "commits",
          message: `Found ${commits.length} commits`,
        });

        send("phase", {
          phase: "stats",
          message: "Fetching diff stats…",
          done: 0,
          total: commits.length,
        });
        const { commits: enriched, statsAvailable } = await enrichWithStats(
          owner,
          repo,
          commits,
          opts,
          (done, total) => send("stats_progress", { done, total }),
        );

        const stats = buildStats(enriched, statsAvailable);

        send("partial", {
          repo: repoMeta,
          rangeLabel,
          truncated,
          commits: enriched,
          stats,
        });

        send("done", {});
      } catch (e) {
        const message =
          e instanceof GitHubError
            ? e.hint
              ? `${e.message} — ${e.hint}`
              : e.message
            : (e as Error).message || "Unexpected error.";
        send("error", { message });
      } finally {
        closed = true;
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
