import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { addPublishedLink, getRecord } from "@/lib/historyStore";
import { markdownForReport, reportLabel } from "@/lib/reportMarkdown";
import type { ReportType } from "@/lib/types";

const execFileAsync = promisify(execFile);
const EXEC = { maxBuffer: 64 * 1024 * 1024 } as const;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

interface PublishBody {
  recordId: string;
  reportType: ReportType;
  target: "gist" | "wiki" | "release";
  public?: boolean;
  tag?: string;
}

function sanitizePage(s: string): string {
  return s.replace(/[\\/:*?"<>|#]+/g, "-").replace(/\s+/g, " ").trim();
}

function headTag(rangeLabel: string): string {
  if (rangeLabel.includes("→")) return rangeLabel.split("→").pop()!.trim();
  const m = rangeLabel.match(/up to (.+)/i);
  return m ? m[1].trim() : "";
}

function redact(s: string): string {
  return s.replace(/x-access-token:[^@]+@/g, "x-access-token:***@");
}

async function gh(args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("gh", args, EXEC);
  return stdout.trim();
}

export async function POST(request: Request) {
  let body: PublishBody;
  try {
    body = (await request.json()) as PublishBody;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { recordId, reportType, target } = body;
  if (
    !recordId ||
    !["technical", "presentation", "demo"].includes(reportType) ||
    !["gist", "wiki", "release"].includes(target)
  ) {
    return Response.json({ error: "Invalid publish request." }, { status: 400 });
  }

  const rec = getRecord(recordId);
  if (!rec) return Response.json({ error: "Record not found." }, { status: 404 });
  if (!rec.result.reports[reportType]) {
    return Response.json(
      { error: `Generate the ${reportType} report first.` },
      { status: 400 },
    );
  }

  try {
    await execFileAsync("gh", ["auth", "status"]);
  } catch {
    return Response.json(
      {
        error:
          "GitHub CLI is not installed or not authenticated. Run `gh auth login`.",
      },
      { status: 400 },
    );
  }

  const md = markdownForReport(rec.result, reportType);
  const { owner, repo, fullName } = rec.result.repo;
  const label = reportLabel(reportType);

  try {
    if (target === "gist") {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "commitarc-gist-"));
      try {
        const file = path.join(dir, `${owner}-${repo}-${reportType}.md`);
        fs.writeFileSync(file, md);
        const args = [
          "gist",
          "create",
          file,
          "--desc",
          `${fullName} — ${label} (${rec.result.rangeLabel})`,
        ];
        if (body.public) args.push("--public");
        const url = await gh(args);
        addPublishedLink(recordId, reportType, {
          target: "gist",
          url,
          at: Date.now(),
        });
        return Response.json({
          ok: true,
          url,
          message: `Published as ${body.public ? "public" : "secret"} gist.`,
        });
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    }

    if (target === "wiki") {
      const token = await gh(["auth", "token"]);
      const remote = `https://x-access-token:${token}@github.com/${owner}/${repo}.wiki.git`;
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "commitarc-wiki-"));
      try {
        let cloned = true;
        try {
          await execFileAsync("git", ["clone", "--depth", "1", remote, dir], EXEC);
        } catch {
          cloned = false;
        }
        if (!cloned) {
          await execFileAsync("git", ["init", dir], EXEC);
          await execFileAsync("git", ["-C", dir, "remote", "add", "origin", remote], EXEC);
        }
        const page = sanitizePage(`${label} ${rec.result.rangeLabel}`) || label;
        fs.writeFileSync(path.join(dir, `${page}.md`), md);
        await execFileAsync("git", ["-C", dir, "add", "."], EXEC);
        await execFileAsync(
          "git",
          [
            "-C", dir,
            "-c", "user.email=commitarc@users.noreply.github.com",
            "-c", "user.name=CommitArc",
            "commit", "-m", `Publish ${label}: ${rec.result.rangeLabel}`,
          ],
          EXEC,
        );
        await execFileAsync("git", ["-C", dir, "push", "origin", "HEAD:master"], EXEC);
        const wikiUrl = `https://github.com/${owner}/${repo}/wiki/${encodeURIComponent(
          page.replace(/ /g, "-"),
        )}`;
        addPublishedLink(recordId, reportType, {
          target: "wiki",
          url: wikiUrl,
          at: Date.now(),
        });
        return Response.json({ ok: true, url: wikiUrl, message: "Published to wiki." });
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    }

    // release
    const tag = body.tag?.trim() || headTag(rec.result.rangeLabel);
    if (!tag) {
      return Response.json(
        { error: "No tag to attach the release to. Provide a tag." },
        { status: 400 },
      );
    }
    const repoFlag = `${owner}/${repo}`;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "commitarc-rel-"));
    try {
      const file = path.join(dir, "notes.md");
      let exists = true;
      try {
        await execFileAsync("gh", ["release", "view", tag, "--repo", repoFlag], EXEC);
      } catch {
        exists = false;
      }
      if (exists) {
        const old = await gh([
          "release", "view", tag, "--repo", repoFlag, "--json", "body", "-q", ".body",
        ]).catch(() => "");
        fs.writeFileSync(file, (old ? `${old}\n\n---\n\n` : "") + md);
        await gh(["release", "edit", tag, "--repo", repoFlag, "--notes-file", file]);
      } else {
        fs.writeFileSync(file, md);
        await gh([
          "release", "create", tag, "--repo", repoFlag, "--draft",
          "--title", tag, "--notes-file", file,
        ]);
      }
      const relUrl = `https://github.com/${owner}/${repo}/releases/tag/${encodeURIComponent(tag)}`;
      addPublishedLink(recordId, reportType, {
        target: "release",
        url: relUrl,
        at: Date.now(),
      });
      return Response.json({
        ok: true,
        url: relUrl,
        message: exists
          ? `Appended the ${label} to release ${tag}.`
          : `Created draft release ${tag} with the ${label}.`,
      });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  } catch (e) {
    const err = e as { stderr?: string; message?: string };
    let msg = redact((err.stderr || err.message || "Publish failed.").trim());
    if (target === "wiki" && /not found|could not read|denied/i.test(msg)) {
      msg +=
        " — make sure the repo's Wiki is enabled (Settings → Features → Wikis) and has an initial page.";
    }
    return Response.json({ error: msg }, { status: 500 });
  }
}
