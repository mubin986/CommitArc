import { generateSummaryStream } from "@/lib/ai";
import { attachMilestoneReport, getCampaign } from "@/lib/campaignStore";
import {
  GitHubError,
  enrichWithStats,
  getCommits,
  parseRepoUrl,
} from "@/lib/github";
import { buildStats } from "@/lib/report";
import { resolveAi } from "@/lib/resolveAi";
import type { AiProviderChoice, AnalyzeRequest } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

interface ReportBody {
  milestoneId?: string;
  aiProvider?: AiProviderChoice;
  apiKey?: string;
  model?: string;
}

// Generate one milestone's client-facing deck on demand: fetch that milestone's
// tag range, build stats, and stream the AI presentation/demo. Persists onto
// the milestone when done.
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  let body: ReportBody;
  try {
    body = (await request.json()) as ReportBody;
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
        const campaign = getCampaign(id);
        if (!campaign) {
          send("error", { message: "Campaign not found." });
          return;
        }
        const milestone = campaign.milestones.find(
          (m) => m.id === body.milestoneId,
        );
        if (!milestone) {
          send("error", { message: "Milestone not found." });
          return;
        }

        const ai = resolveAi(body.aiProvider, body.apiKey);
        if ("error" in ai) {
          send("error", { message: ai.error });
          return;
        }

        const { owner, repo } = parseRepoUrl(campaign.repoUrl);
        const opts = {
          useGh: campaign.usePrivate,
          token: process.env.GITHUB_TOKEN || undefined,
        };

        send("phase", { phase: "commits", message: "Fetching this milestone…" });
        const req: AnalyzeRequest = {
          url: campaign.repoUrl,
          mode: "tag",
          baseTag: milestone.baseTag ?? undefined,
          tag: milestone.headTag,
          usePrivate: campaign.usePrivate,
        };
        const { commits, truncated, rangeLabel } = await getCommits(
          owner,
          repo,
          req,
          opts,
        );
        if (commits.length === 0) {
          send("error", {
            message: "No commits found for this milestone's tag range.",
          });
          return;
        }

        const { commits: enriched, statsAvailable } = await enrichWithStats(
          owner,
          repo,
          commits,
          opts,
        );
        const stats = buildStats(enriched, statsAvailable);

        send("ai_start", {});
        let acc = "";
        try {
          for await (const delta of generateSummaryStream(
            {
              repo: campaign.repo,
              rangeLabel,
              stats,
              commits: enriched,
              truncated,
            },
            {
              provider: ai.provider,
              apiKey: ai.apiKey,
              model: body.model ?? "",
              reportType: milestone.reportType,
            },
          )) {
            acc += delta;
            send("ai_delta", { text: delta });
          }
        } catch (e) {
          send("error", { message: (e as Error).message });
          return;
        }

        attachMilestoneReport(id, milestone.id, {
          text: acc,
          model: body.model ?? null,
          generatedAt: Date.now(),
        });
        send("ai_done", {});
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
