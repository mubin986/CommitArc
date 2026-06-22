import type { AiProvider } from "./ai";
import { readClaudeCredentials } from "./claudeCreds";
import type { AiProviderChoice } from "./types";

/**
 * Resolve which Anthropic provider to use from the client's choice (server-side).
 * Mirrors the logic in /api/report. Returns either a provider config or an error.
 */
export function resolveAi(
  choice: AiProviderChoice | undefined,
  apiKey?: string,
): { provider: AiProvider; apiKey?: string } | { error: string } {
  const envKey = process.env.ANTHROPIC_API_KEY || undefined;

  if (choice === "local") return { provider: "local" };
  if (choice === "manual") {
    if (!apiKey?.trim())
      return { error: "Enter an Anthropic API key, or pick another provider." };
    return { provider: "apiKey", apiKey: apiKey.trim() };
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
