import {
  generateRevisionStream,
  generateSummaryStream,
  type AiProvider,
} from "@/lib/ai";
import {
  attachReport,
  getRecord,
  updateReportText,
} from "@/lib/historyStore";
import { readClaudeCredentials } from "@/lib/claudeCreds";
import type { ReportRequest, ReportType } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function resolveAi(body: ReportRequest):
  | { provider: AiProvider; apiKey?: string }
  | { error: string } {
  const choice = body.aiProvider;
  const envKey = process.env.ANTHROPIC_API_KEY || undefined;

  if (choice === "local") return { provider: "local" };
  if (choice === "manual") {
    if (!body.apiKey?.trim())
      return { error: "Enter an Anthropic API key, or pick another provider." };
    return { provider: "apiKey", apiKey: body.apiKey.trim() };
  }
  if (choice === "env") {
    if (!envKey) return { error: "ANTHROPIC_API_KEY is not set on the server." };
    return { provider: "apiKey", apiKey: envKey };
  }

  if (envKey) return { provider: "apiKey", apiKey: envKey };
  if (readClaudeCredentials().available) return { provider: "local" };
  return {
    error:
      "No AI provider available. Set ANTHROPIC_API_KEY, enter a key, or log in to Claude (`claude`).",
  };
}

export async function POST(request: Request) {
  let body: ReportRequest;
  try {
    body = (await request.json()) as ReportRequest;
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
        if (
          !body.recordId ||
          !["technical", "presentation", "demo"].includes(body.reportType)
        ) {
          send("error", { message: "Invalid report request." });
          return;
        }

        const rec = getRecord(body.recordId);
        if (!rec) {
          send("error", { message: "Analysis record not found." });
          return;
        }

        const ai = resolveAi(body);
        if ("error" in ai) {
          send("error", { message: ai.error });
          return;
        }

        const isRevise = Boolean(body.instruction?.trim());
        const aiOpts = {
          provider: ai.provider,
          apiKey: ai.apiKey,
          model: body.model ?? "",
          reportType: body.reportType,
        };

        send("ai_start", {});
        let acc = "";
        try {
          const gen = isRevise
            ? generateRevisionStream(
                {
                  currentText: rec.result.reports[body.reportType]?.text ?? "",
                  instruction: body.instruction!.trim(),
                  reportType: body.reportType,
                },
                aiOpts,
              )
            : generateSummaryStream(
                {
                  repo: rec.result.repo,
                  rangeLabel: rec.result.rangeLabel,
                  stats: rec.result.stats,
                  commits: rec.result.commits,
                  truncated: rec.result.truncated,
                },
                aiOpts,
              );
          for await (const delta of gen) {
            acc += delta;
            send("ai_delta", { text: delta });
          }
        } catch (e) {
          send("error", { message: (e as Error).message });
          return;
        }

        // Generation persists immediately; a revision streams to the editor and
        // is saved explicitly by the user (PUT), so don't attach it here.
        if (!isRevise) {
          attachReport(body.recordId, body.reportType, {
            text: acc,
            model: body.model ?? null,
            generatedAt: Date.now(),
          });
        }
        send("ai_done", {});
      } catch (e) {
        send("error", { message: (e as Error).message || "Unexpected error." });
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

// Save an edited report (manual or AI-revised) onto the record.
export async function PUT(request: Request) {
  let body: { recordId?: string; reportType?: ReportType; text?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (
    !body.recordId ||
    !body.reportType ||
    !["technical", "presentation", "demo"].includes(body.reportType) ||
    typeof body.text !== "string"
  ) {
    return Response.json({ error: "Invalid edit request." }, { status: 400 });
  }
  const rec = updateReportText(body.recordId, body.reportType, body.text);
  if (!rec) {
    return Response.json(
      { error: "Record or report not found." },
      { status: 404 },
    );
  }
  return Response.json({ ok: true });
}
