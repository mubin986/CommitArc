import { clearAll, listSummaries, saveRecord } from "@/lib/historyStore";
import type { AnalyzeRequest } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(listSummaries());
}

export async function POST(request: Request) {
  let body: {
    repoUrl?: string;
    mode?: AnalyzeRequest["mode"];
    result?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const result = body.result as { repo?: unknown } | undefined;
  if (!body.repoUrl || !body.mode || !result?.repo) {
    return Response.json({ error: "Invalid history record." }, { status: 400 });
  }
  const summary = saveRecord({
    repoUrl: body.repoUrl,
    mode: body.mode,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    result: body.result as any,
  });
  return Response.json(summary);
}

export async function DELETE() {
  clearAll();
  return new Response(null, { status: 204 });
}
