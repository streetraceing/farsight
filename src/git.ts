import { run } from './process.js';
import type { Contributor, GitReport } from './types.js';

interface MutableContributor extends Omit<Contributor, 'activeDays'> {
  activeDays: Set<string>;
}

export interface ParsedGitLog {
  commits: number;
  activeDays: number;
  additions: number;
  deletions: number;
  contributorsCount: number;
  topContributorShare: number;
  contributors: Contributor[];
}

interface AnalyzeGitOptions {
  sinceDays?: number;
  top?: number;
}

function emptyGit(reason: string | null = null): GitReport {
  return {
    available: false,
    reason,
    branch: null,
    remote: null,
    lastCommitAt: null,
    periodDays: null,
    commits: 0,
    activeDays: 0,
    contributorsCount: 0,
    additions: 0,
    deletions: 0,
    topContributorShare: 0,
    contributors: [],
  };
}

export function parseGitLog(text: string): ParsedGitLog {
  const contributorMap = new Map<string, MutableContributor>();
  const activeDays = new Set<string>();
  let current: MutableContributor | null = null;
  let commits = 0;
  let additions = 0;
  let deletions = 0;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (!line) continue;

    if (line.startsWith('@@@')) {
      const [hash = '', name = '', email = '', date = ''] = line.slice(3).split('\x1f');
      const key = (email || name || hash).toLowerCase();
      const contributor: MutableContributor = contributorMap.get(key) ?? {
        name: name || 'Unknown',
        email: email || null,
        commits: 0,
        activeDays: new Set<string>(),
        additions: 0,
        deletions: 0,
        firstCommitAt: date || null,
        lastCommitAt: date || null,
      };
      contributor.commits += 1;
      if (date) {
        contributor.activeDays.add(date);
        activeDays.add(date);
        if (!contributor.firstCommitAt || date < contributor.firstCommitAt) contributor.firstCommitAt = date;
        if (!contributor.lastCommitAt || date > contributor.lastCommitAt) contributor.lastCommitAt = date;
      }
      contributorMap.set(key, contributor);
      current = contributor;
      commits += 1;
      continue;
    }

    const match = line.match(/^(\d+|-)\t(\d+|-)\t/);
    if (!match || !current) continue;
    const addedText = match[1];
    const deletedText = match[2];
    if (!addedText || !deletedText || addedText === '-' || deletedText === '-') continue;

    const added = Number(addedText);
    const deleted = Number(deletedText);
    current.additions += added;
    current.deletions += deleted;
    additions += added;
    deletions += deleted;
  }

  const contributors = [...contributorMap.values()]
    .map((item): Contributor => ({ ...item, activeDays: item.activeDays.size }))
    .sort((a, b) => b.commits - a.commits || b.activeDays - a.activeDays || a.name.localeCompare(b.name));

  const topContributorShare = commits > 0 && contributors[0]
    ? contributors[0].commits / commits
    : 0;

  return {
    commits,
    activeDays: activeDays.size,
    additions,
    deletions,
    contributorsCount: contributors.length,
    topContributorShare,
    contributors,
  };
}

async function safeGit(
  root: string,
  args: readonly string[],
  allowExitCodes: readonly number[] = [0],
): Promise<string | null> {
  try {
    const result = await run('git', args, { cwd: root, allowExitCodes });
    return result.stdout.trim();
  } catch {
    return null;
  }
}

export async function analyzeGit(
  root: string,
  { sinceDays = 90, top = 10 }: AnalyzeGitOptions = {},
): Promise<GitReport> {
  const inside = await safeGit(root, ['rev-parse', '--is-inside-work-tree']);
  if (inside !== 'true') return emptyGit('not a Git repository');

  const [branch, remote, lastCommitAt, log] = await Promise.all([
    safeGit(root, ['branch', '--show-current']),
    safeGit(root, ['config', '--get', 'remote.origin.url'], [0, 1]),
    safeGit(root, ['log', '-1', '--format=%cI'], [0, 128]),
    safeGit(root, [
      'log',
      `--since=${sinceDays}.days`,
      '--no-merges',
      '--date=short',
      '--pretty=format:@@@%H%x1f%aN%x1f%aE%x1f%ad',
      '--numstat',
      '--no-renames',
    ], [0, 128]),
  ]);

  const parsed = parseGitLog(log ?? '');
  return {
    available: true,
    reason: null,
    branch: branch || '(detached HEAD)',
    remote: remote || null,
    lastCommitAt: lastCommitAt || null,
    periodDays: sinceDays,
    ...parsed,
    contributors: parsed.contributors.slice(0, top),
  };
}
