import type { AuthorActivity, CommitInfo, ReportStats } from "./types";

export function buildStats(
  commits: CommitInfo[],
  statsAvailable: boolean,
): ReportStats {
  const authorMap = new Map<string, AuthorActivity>();
  let totalAdditions = 0;
  let totalDeletions = 0;
  let fileChanges = 0;
  let firstDate: string | null = null;
  let lastDate: string | null = null;

  for (const c of commits) {
    const key = c.author.login || c.author.email || c.author.name;
    const existing =
      authorMap.get(key) ??
      ({
        name: c.author.name,
        login: c.author.login,
        commits: 0,
        additions: 0,
        deletions: 0,
      } satisfies AuthorActivity);

    existing.commits += 1;
    if (c.stats) {
      existing.additions += c.stats.additions;
      existing.deletions += c.stats.deletions;
      totalAdditions += c.stats.additions;
      totalDeletions += c.stats.deletions;
      fileChanges += c.stats.files;
    }
    authorMap.set(key, existing);

    if (c.date) {
      if (!firstDate || c.date < firstDate) firstDate = c.date;
      if (!lastDate || c.date > lastDate) lastDate = c.date;
    }
  }

  const authors = [...authorMap.values()].sort((a, b) => b.commits - a.commits);

  return {
    totalCommits: commits.length,
    totalAdditions,
    totalDeletions,
    fileChanges,
    statsAvailable,
    authors,
    firstCommitDate: firstDate,
    lastCommitDate: lastDate,
  };
}
