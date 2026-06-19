import { NextResponse } from "next/server";
import { readClaudeCredentials } from "@/lib/claudeCreds";
import { DEFAULT_MODEL, MODELS } from "@/lib/ai";
import type { AiStatus } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const creds = readClaudeCredentials();
  const status: AiStatus = {
    local: {
      available: creds.available,
      source: creds.source,
      expired: creds.expired,
    },
    env: { hasKey: Boolean(process.env.ANTHROPIC_API_KEY) },
    models: MODELS.map((m) => ({ id: m.id, label: m.label })),
    defaultModel: DEFAULT_MODEL,
  };
  return NextResponse.json(status);
}
