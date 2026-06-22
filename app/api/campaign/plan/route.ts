import { groupTagsIntoMilestones } from "@/lib/ai";
import { GitHubError, getRepoMeta, getTagTimeline, parseRepoUrl } from "@/lib/github";
import { resolveAi } from "@/lib/resolveAi";
import type { AiProviderChoice } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

interface PlanRequest {
  url?: string;
  usePrivate?: boolean;
  targetMilestones?: number;
  aiProvider?: AiProviderChoice;
  apiKey?: string;
  model?: string;
}

// Plan a campaign: fetch the repo's tag timeline and ask the AI to cluster the
// tags into themed milestones. Analysis only — no decks are generated here.
export async function POST(request: Request) {
  let body: PlanRequest;
  try {
    body = (await request.json()) as PlanRequest;
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

        send("phase", { phase: "tags", message: "Reading tag timeline…" });
        const timeline = await getTagTimeline(
          owner,
          repo,
          repoMeta.defaultBranch,
          opts,
        );
        send("phase", {
          phase: "tags",
          message: `Found ${timeline.tags.length} tags`,
        });

        const ai = resolveAi(body.aiProvider, body.apiKey);
        if ("error" in ai) {
          send("error", { message: ai.error });
          return;
        }

        send("phase", {
          phase: "grouping",
          message: "Grouping tags into milestones…",
        });
        const milestones = await groupTagsIntoMilestones(
          { repo: repoMeta, timeline, targetMilestones: body.targetMilestones },
          {
            provider: ai.provider,
            apiKey: ai.apiKey,
            model: body.model ?? "",
          },
        );

        send("plan", {
          repo: repoMeta,
          tagCount: timeline.tags.length,
          truncated: timeline.truncated,
          milestones,
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
