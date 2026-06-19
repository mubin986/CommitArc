import { deleteRecord, getRecord } from "@/lib/historyStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const record = getRecord(id);
  if (!record) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }
  return Response.json(record);
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  deleteRecord(id);
  return new Response(null, { status: 204 });
}
