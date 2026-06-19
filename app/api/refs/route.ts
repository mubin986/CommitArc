import { GitHubError, getRefs, parseRepoUrl } from "@/lib/github";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: { url?: string; usePrivate?: boolean };
  try {
    body = (await request.json()) as { url?: string; usePrivate?: boolean };
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (!body.url) {
    return Response.json({ error: "A repository URL is required." }, { status: 400 });
  }

  try {
    const { owner, repo } = parseRepoUrl(body.url);
    const opts = {
      useGh: Boolean(body.usePrivate),
      token: process.env.GITHUB_TOKEN || undefined,
    };
    const refs = await getRefs(owner, repo, opts);
    return Response.json(refs);
  } catch (e) {
    if (e instanceof GitHubError) {
      const message = e.hint ? `${e.message} — ${e.hint}` : e.message;
      return Response.json(
        { error: message },
        { status: e.status && e.status >= 400 ? e.status : 502 },
      );
    }
    return Response.json(
      { error: (e as Error).message || "Unexpected error." },
      { status: 500 },
    );
  }
}
