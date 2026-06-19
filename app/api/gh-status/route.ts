import { NextResponse } from "next/server";
import { getGhStatus } from "@/lib/github";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const status = await getGhStatus();
  return NextResponse.json(status);
}
