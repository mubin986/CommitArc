import {
  deleteCampaign,
  getCampaign,
  updateCampaign,
  type MilestonePatch,
} from "@/lib/campaignStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const campaign = getCampaign(id);
  if (!campaign) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }
  return Response.json(campaign);
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  let body: { patches?: MilestonePatch[] };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (!Array.isArray(body.patches)) {
    return Response.json({ error: "Invalid patch request." }, { status: 400 });
  }
  const campaign = updateCampaign(id, body.patches);
  if (!campaign) {
    return Response.json({ error: "Campaign not found." }, { status: 404 });
  }
  return Response.json(campaign);
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  deleteCampaign(id);
  return new Response(null, { status: 204 });
}
