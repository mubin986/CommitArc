# Security Policy

## Reporting a vulnerability

Please report security vulnerabilities **privately** — do not open a public issue.

Use GitHub's private advisory form:
**[Report a vulnerability](https://github.com/mubin986/CommitArc/security/advisories/new)**

Include a description, steps to reproduce, and the impact. We'll acknowledge the
report and work on a fix; please give us a reasonable time to address it before
any public disclosure.

## Scope & good to know

CommitArc is a local-first tool that handles sensitive material:

- **Credentials** come from `ANTHROPIC_API_KEY` / `GITHUB_TOKEN` (env), the local
  Claude OAuth session, the local `gh` CLI, or a key the user pastes (stored only
  in their browser). Tokens are read **server-side** and never sent to the client.
- **Private-repo data** can flow to Anthropic (for AI reports) and, if the user
  chooses to publish, to GitHub (Gist / Wiki / Release). Publishing is always
  confirm-gated.
- History is stored on disk under `data/` (gitignored) — never commit it.

When reporting, **do not include real API keys, tokens, or private-repo
contents** — redact them.

## Supported versions

This is an actively developed project; fixes land on `main` and the latest
release. Please test against the latest before reporting.
