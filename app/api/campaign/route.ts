import { listCampaigns, saveCampaign } from "@/lib/campaignStore";
import type { Milestone, RepoMeta, ScheduleMode } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(listCampaigns());
}

interface SaveBody {
  repo?: RepoMeta;
  repoUrl?: string;
  usePrivate?: boolean;
  scheduleMode?: ScheduleMode;
  startDate?: string;
  endDate?: string;
  cadenceDays?: number;
  milestones?: Milestone[];
}

export async function POST(request: Request) {
  let body: SaveBody;
  try {
    body = (await request.json()) as SaveBody;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (
    !body.repo?.fullName ||
    !body.repoUrl ||
    !body.startDate ||
    !Array.isArray(body.milestones) ||
    body.milestones.length === 0
  ) {
    return Response.json({ error: "Invalid campaign." }, { status: 400 });
  }

  const campaign = saveCampaign({
    repo: body.repo,
    repoUrl: body.repoUrl,
    usePrivate: Boolean(body.usePrivate),
    scheduleMode: body.scheduleMode ?? "cadence",
    startDate: body.startDate,
    endDate: body.endDate,
    cadenceDays: body.cadenceDays,
    milestones: body.milestones,
  });
  return Response.json(campaign);
}
