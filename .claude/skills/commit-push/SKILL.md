---
name: commit-push
description: Commit the current working changes with a proper Conventional Commit message and push to the remote. Use when the user asks to commit, commit and push, ship, or save/publish work to GitHub.
---

# Commit & Push

Commit the working changes and push them to the remote for this repo, following
[CLAUDE.md](../../../CLAUDE.md). The user invoking this skill authorizes the push.

## Steps

1. **Inspect.** Run `git status --short` and `git diff --stat`. If there is
   nothing to commit, stop and say so.
2. **Secret check.** Make sure nothing sensitive is being committed: `git ls-files`
   plus newly-staged files must NOT include `.env` / `.env*.local` (the
   `.env.example` template is fine) or anything under `data/`. These are
   gitignored; if any appear tracked, STOP and warn the user instead of committing.
3. **Build / type-check.** Run `npm run build` (it type-checks the whole project).
   If it fails, STOP — do not commit. Surface the error so the user can fix it.
   (Skip only if the change is docs/config that can't affect the build and the
   user explicitly said to skip.)
4. **Stage.** `git add -A`.
5. **Compose the message — Conventional Commits (required).** Releases are
   automated from these, so the format matters.
   - Subject: `<type>(<optional scope>): <imperative summary>` — lowercase, no
     trailing period, ≤ ~72 chars.
   - Types: `feat` (minor bump), `fix`/`perf` (patch bump), `refactor`, `docs`,
     `style`, `test`, `build`, `ci`, `chore` (no bump). A `!` after the
     type/scope or a `BREAKING CHANGE:` footer → major bump.
   - Suggested scopes: `analyze`, `report`, `history`, `github`, `ai`, `ui`,
     `config`, `export`, `publish`, `ci`.
   - Add a short body (what & why) when the subject alone isn't self-explanatory.
   - If the user supplied a message, use it (make sure it's conventional);
     otherwise derive one from the diff.
   - **End every commit** with the trailer:
     `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
6. **Commit.** Use separate `-m` flags so paragraphs/trailer are split correctly:
   `git commit -m "<subject>" -m "<body>" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"`
   (drop the body `-m` if there's no meaningful body).
7. **Branch.** Confirm the current branch (`git branch --show-current`). This repo
   releases from `main`; committing/pushing to `main` directly is expected here.
   If on the default branch and the change is substantial, that's fine — no PR
   required unless the user asks.
8. **Push.** `git push origin HEAD` (add `-u` on the first push of a new branch).
9. **Report.** Show the commit hash + subject and the push result.

## Notes

- **Release impact:** pushing to `main` triggers `.github/workflows/release.yml`
  (conventional-changelog-action) → version bump, `CHANGELOG.md`, tag, and a
  GitHub Release. Use `feat:`/`fix:`/breaking ONLY when a version bump is intended;
  use `chore:`/`docs:`/`refactor:`/`ci:`/`style:`/`test:` for changes that should
  not cut a release.
- Never commit `data/`, `.env*` (except `.env.example`), or secrets.
- Don't amend or force-push unless the user explicitly asks.
