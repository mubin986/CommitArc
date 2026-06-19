# Contributing to CommitArc

Thanks for your interest in improving CommitArc! Bug reports, feature ideas, and
pull requests are all welcome.

## Ways to contribute

- **Report a bug** → open a [Bug report](https://github.com/mubin986/CommitArc/issues/new?template=bug_report.yml).
- **Request a feature** → open a [Feature request](https://github.com/mubin986/CommitArc/issues/new?template=feature_request.yml).
- **Ask a question / share an idea** → use [Discussions](https://github.com/mubin986/CommitArc/discussions).
- **Report a security issue** → see [SECURITY.md](SECURITY.md) (do **not** open a public issue).

## Local setup

```bash
git clone https://github.com/mubin986/CommitArc.git
cd CommitArc
npm install
cp .env.example .env.local   # optional keys — see README
npm run dev                  # http://localhost:3000
```

Requires **Node.js 20+**. For private repos you'll want the **GitHub CLI (`gh`)**
logged in; for AI reports, either the **Claude CLI** logged in, an
`ANTHROPIC_API_KEY`, or a key pasted in the UI. See the [README](README.md).

## Development workflow

1. Create a branch off `main`.
2. Make your change. Keep TypeScript **strict** and follow the conventions in
   [CLAUDE.md](CLAUDE.md) (CSS-variable theming, SSE pattern, server-side history,
   the load-bearing Claude system marker — don't touch it).
3. Run `npm run build` — it type-checks the whole project. It must pass.
4. Commit using **[Conventional Commits](https://www.conventionalcommits.org/)**
   (releases are automated from them — see below).
5. Open a pull request; fill in the template.

## Commit messages (required)

Format: `<type>(<optional scope>): <imperative summary>`

| Type | For | Version effect |
|---|---|---|
| `feat` | a new feature | minor |
| `fix` / `perf` | a bug fix / perf improvement | patch |
| `refactor` `docs` `style` `test` `build` `ci` `chore` | everything else | none |

A `!` or a `BREAKING CHANGE:` footer → major. Suggested scopes: `analyze`,
`report`, `history`, `github`, `ai`, `ui`, `config`, `export`, `publish`, `ci`.

On every push to `main`, the release workflow bumps the version, updates
`CHANGELOG.md`, tags, and opens a GitHub Release from the commits.

## Code style

- TypeScript strict — avoid `any` (a couple of narrow SSE-parse spots are the
  only exceptions, already marked).
- Use the theme tokens (`text-[var(--text)]`, `bg-[var(--panel)]`, …) so light and
  dark both work. Mark print-hidden UI with `no-print`.
- Don't add heavy client dependencies for things the app already does simply.

By contributing, you agree your contributions are licensed under the project's
[MIT License](LICENSE) and that you'll follow the
[Code of Conduct](CODE_OF_CONDUCT.md).
