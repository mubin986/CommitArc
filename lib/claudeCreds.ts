import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Reads the local Claude Code OAuth credentials so we can call Anthropic on the
 * user's existing subscription — no separate API key needed.
 *
 * Storage differs by platform (matches the Claude Code CLI):
 *   - file:      <CLAUDE_DIR>/.credentials.json  (Windows + Linux fallback)
 *   - macOS:     login Keychain, service "Claude Code-credentials"
 *   - Linux:     libsecret, same service name
 *
 * The access token never leaves the server.
 */

export type CredsSource = "file" | "keychain" | "libsecret";

export interface ClaudeCreds {
  available: boolean;
  source: CredsSource | null;
  accessToken: string | null;
  expiresAt: number | null;
  expired: boolean;
}

function candidateDirs(): string[] {
  const dirs: string[] = [];
  if (process.env.CLAUDE_DIR) dirs.push(process.env.CLAUDE_DIR);
  dirs.push(path.join(os.homedir(), ".claude"));

  if (process.platform === "win32") {
    if (process.env.APPDATA) {
      dirs.push(
        path.join(process.env.APPDATA, "Claude"),
        path.join(process.env.APPDATA, ".claude"),
      );
    }
    if (process.env.LOCALAPPDATA)
      dirs.push(path.join(process.env.LOCALAPPDATA, "Claude"));
    if (process.env.USERPROFILE)
      dirs.push(path.join(process.env.USERPROFILE, ".claude"));
  } else if (process.platform === "darwin") {
    dirs.push(path.join(os.homedir(), "Library", "Application Support", "Claude"));
  } else {
    const xdg =
      process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
    dirs.push(path.join(xdg, "claude"));
  }

  return [...new Set(dirs.map((d) => path.resolve(d)))];
}

interface RawCreds {
  claudeAiOauth?: { accessToken?: string; expiresAt?: number };
}

function fromRaw(raw: RawCreds, source: CredsSource): ClaudeCreds | null {
  const token = raw?.claudeAiOauth?.accessToken;
  if (!token) return null;
  const expiresAt = raw.claudeAiOauth?.expiresAt ?? null;
  const expired = expiresAt != null ? Date.now() >= expiresAt : false;
  return { available: true, source, accessToken: token, expiresAt, expired };
}

const NONE: ClaudeCreds = {
  available: false,
  source: null,
  accessToken: null,
  expiresAt: null,
  expired: false,
};

export function readClaudeCredentials(): ClaudeCreds {
  // 1. Plain file across candidate dirs.
  for (const dir of candidateDirs()) {
    const filePath = path.join(dir, ".credentials.json");
    if (!fs.existsSync(filePath)) continue;
    try {
      const raw = JSON.parse(fs.readFileSync(filePath, "utf8")) as RawCreds;
      const creds = fromRaw(raw, "file");
      if (creds) return creds;
    } catch {
      /* unreadable — keep looking */
    }
  }

  // 2. Platform secret store.
  if (process.platform === "darwin") {
    try {
      const out = execFileSync(
        "security",
        ["find-generic-password", "-s", "Claude Code-credentials", "-w"],
        { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 3000 },
      ).trim();
      if (out) {
        const creds = fromRaw(JSON.parse(out) as RawCreds, "keychain");
        if (creds) return creds;
      }
    } catch {
      /* not present / locked / missing tool */
    }
  } else if (process.platform === "linux") {
    try {
      const out = execFileSync(
        "secret-tool",
        [
          "lookup",
          "service",
          "Claude Code-credentials",
          "account",
          os.userInfo().username,
        ],
        { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 3000 },
      ).trim();
      if (out) {
        const creds = fromRaw(JSON.parse(out) as RawCreds, "libsecret");
        if (creds) return creds;
      }
    } catch {
      /* not present / no keyring / missing tool */
    }
  }

  return NONE;
}
