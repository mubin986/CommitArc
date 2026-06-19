"use client";

import { useEffect, useState } from "react";
import type { AiProviderChoice, AiSelection, AiStatus } from "@/lib/types";

const FALLBACK_MODELS = [
  { id: "claude-opus-4-8", label: "Claude Opus 4.8 (most capable)" },
  { id: "claude-opus-4-7", label: "Claude Opus 4.7" },
  { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6 (balanced)" },
  { id: "claude-haiku-4-5", label: "Claude Haiku 4.5 (fast & cheap)" },
];

export default function AiSettings({
  onChange,
}: {
  /** Called whenever the selection changes. Pass a stable function. */
  onChange: (selection: AiSelection) => void;
}) {
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [provider, setProvider] = useState<AiProviderChoice | "">("");
  const [model, setModel] = useState("");
  const [manualKey, setManualKey] = useState("");

  // Emit selection upward whenever it changes.
  useEffect(() => {
    onChange({ provider, model, apiKey: manualKey });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, model, manualKey]);

  useEffect(() => {
    setManualKey(localStorage.getItem("commitarc-api-key") ?? "");
    const storedModel = localStorage.getItem("commitarc-model");
    const storedProvider = localStorage.getItem(
      "commitarc-ai-provider",
    ) as AiProviderChoice | null;

    void (async () => {
      try {
        const res = await fetch("/api/ai-status");
        const s = (await res.json()) as AiStatus;
        setStatus(s);
        setModel(storedModel || s.defaultModel);
        const localOk = s.local.available && !s.local.expired;
        const valid =
          (storedProvider === "local" && localOk) ||
          (storedProvider === "env" && s.env.hasKey) ||
          storedProvider === "manual";
        if (valid && storedProvider) setProvider(storedProvider);
        else if (localOk) setProvider("local");
        else if (s.env.hasKey) setProvider("env");
        else setProvider("manual");
      } catch {
        setStatus(null);
        setProvider("manual");
        setModel(storedModel || "claude-opus-4-8");
      }
    })();
  }, []);

  const chooseProvider = (p: AiProviderChoice) => {
    setProvider(p);
    localStorage.setItem("commitarc-ai-provider", p);
  };
  const changeModel = (m: string) => {
    setModel(m);
    localStorage.setItem("commitarc-model", m);
  };
  const changeManualKey = (k: string) => {
    setManualKey(k);
    localStorage.setItem("commitarc-api-key", k);
  };

  const localOk = Boolean(status?.local.available && !status.local.expired);
  const localExpired = Boolean(status?.local.available && status.local.expired);
  const envOk = Boolean(status?.env.hasKey);
  const models = status?.models ?? FALLBACK_MODELS;

  const localLabel = localExpired
    ? `Local Claude (${status?.local.source ?? "logged in"}, expired)`
    : status?.local.available
      ? `Local Claude (${status?.local.source})`
      : "Local Claude (not logged in)";

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--inset)] p-4">
      <span className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
        AI provider &amp; model
      </span>

      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <ProviderOption
          active={provider === "local"}
          disabled={!localOk}
          onClick={() => localOk && chooseProvider("local")}
          title={localLabel}
          subtitle={
            localOk
              ? "uses your Claude subscription"
              : localExpired
                ? "re-open `claude` to refresh"
                : "run `claude` to log in"
          }
        />
        <ProviderOption
          active={provider === "env"}
          disabled={!envOk}
          onClick={() => envOk && chooseProvider("env")}
          title="Server key (.env)"
          subtitle={envOk ? "ANTHROPIC_API_KEY is set" : "not set on server"}
        />
        <ProviderOption
          active={provider === "manual"}
          disabled={false}
          onClick={() => chooseProvider("manual")}
          title="Enter API key"
          subtitle="stored in this browser only"
        />
      </div>

      {provider === "manual" && (
        <input
          type="password"
          value={manualKey}
          onChange={(e) => changeManualKey(e.target.value)}
          placeholder="sk-ant-…"
          aria-label="Anthropic API key"
          autoComplete="off"
          className="input mt-3"
        />
      )}

      <div className="mt-3">
        <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
          Model
        </label>
        <select
          value={model}
          onChange={(e) => changeModel(e.target.value)}
          aria-label="Claude model"
          className="input"
        >
          {models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </div>

      {!status && (
        <p className="mt-2 text-xs text-[var(--text-faint)]">
          Checking AI providers…
        </p>
      )}
    </div>
  );
}

function ProviderOption({
  active,
  disabled,
  onClick,
  title,
  subtitle,
}: {
  active: boolean;
  disabled: boolean;
  onClick: () => void;
  title: string;
  subtitle: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg border p-3 text-left transition ${
        active
          ? "border-sky-500 bg-sky-500/10"
          : "border-[var(--border)] hover:border-[var(--border-strong)]"
      } ${disabled ? "cursor-not-allowed opacity-40" : ""}`}
    >
      <p className="text-sm font-medium text-[var(--text-strong)]">{title}</p>
      <p className="mt-0.5 text-xs text-[var(--text-faint)]">{subtitle}</p>
    </button>
  );
}
