import type { DependencyStatus, FarsightReport, GitPeriodStats } from './types.js';

type Cell = string | number | null | undefined;

const useColor = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
const ansi = (open: number, close: number) => (text: unknown): string => (
  useColor ? `\x1b[${open}m${String(text)}\x1b[${close}m` : String(text)
);
const bold = ansi(1, 22);
const dim = ansi(2, 22);
const cyan = ansi(36, 39);
const green = ansi(32, 39);
const yellow = ansi(33, 39);
const red = ansi(31, 39);

const number = new Intl.NumberFormat('en-US');
const percent = new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 0 });

function section(title: string): string {
  return `\n${bold(cyan(title))}\n${'─'.repeat(Math.min(72, title.length + 12))}`;
}

function table(rows: Cell[][], headers: string[]): string {
  if (rows.length === 0) return '';
  const data = [headers, ...rows].map((row) => row.map((cell) => String(cell ?? '-')));
  const widths = headers.map((_, index) => Math.min(
    36,
    Math.max(...data.map((row) => row[index]?.length ?? 0)),
  ));

  return data.map((row, rowIndex) => {
    const rendered = row.map((cell, index) => {
      const width = widths[index] ?? 0;
      const clipped = cell.length > width ? `${cell.slice(0, Math.max(0, width - 1))}…` : cell;
      return clipped.padEnd(width);
    }).join('  ');
    return rowIndex === 0
      ? `${bold(rendered)}\n${widths.map((width) => '─'.repeat(width)).join('  ')}`
      : rendered;
  }).join('\n');
}

function dependencyStatus(status: DependencyStatus): string {
  if (status === 'update-within-range') return yellow('update available');
  if (status === 'newer-outside-range') return red('new major/range available');
  if (status === 'outdated') return yellow('outdated');
  return dim(status);
}

function activityRows(items: readonly GitPeriodStats[], limit: number): Cell[][] {
  return items.slice(-limit).map((item) => [
    item.period,
    number.format(item.commits),
    `+${number.format(item.additions)}`,
    `-${number.format(item.deletions)}`,
    `${item.additions - item.deletions >= 0 ? '+' : ''}${number.format(item.additions - item.deletions)}`,
  ]);
}

function addActivitySection(
  lines: string[],
  title: string,
  label: string,
  items: readonly GitPeriodStats[],
  limit: number,
): void {
  if (items.length === 0) return;
  const shown = Math.min(items.length, limit);
  lines.push(section(title));
  lines.push(dim(`Showing the latest ${shown} ${label} with activity`));
  lines.push(table(activityRows(items, limit), [label, 'Commits', 'Added', 'Deleted', 'Net']));
}

export function renderReport(report: FarsightReport): string {
  const lines: string[] = [];

  lines.push('');
  lines.push(bold('Farsight - project analysis'));
  lines.push(dim(report.root));

  lines.push(section('Project'));
  lines.push(`Type: ${bold(report.project.primary)}`);
  lines.push(`Package manager: ${report.project.packageManager ?? 'not detected'}`);
  if (report.project.traits.length) lines.push(`Traits: ${report.project.traits.join(', ')}`);

  lines.push(section('Dependencies'));
  if (!report.dependencies.available) {
    lines.push(dim(report.dependencies.warning ?? 'package.json not found'));
  } else {
    lines.push(`Direct dependencies: ${number.format(report.dependencies.totalDeclared)}`);
    if (!report.dependencies.checked) {
      lines.push(yellow(report.dependencies.warning ?? 'Dependency check was not run'));
    } else if (report.dependencies.items.length === 0) {
      lines.push(green('No outdated direct dependencies found.'));
    } else {
      lines.push(`Needs attention: ${yellow(number.format(report.dependencies.outdatedCount))}`);
      lines.push(table(
        report.dependencies.items.map((item) => [
          item.name,
          item.current ?? 'not installed',
          item.wanted ?? '-',
          item.latest ?? '-',
          dependencyStatus(item.status),
        ]),
        ['Package', 'Current', 'Wanted', 'Latest', 'Status'],
      ));
    }
    if (report.dependencies.checked && report.dependencies.warning) lines.push(dim(report.dependencies.warning));
  }

  lines.push(section('Code'));
  lines.push(`Source files: ${number.format(report.loc.files)}`);
  lines.push(`Physical lines: ${number.format(report.loc.lines)}`);
  lines.push(`Non-empty lines: ${bold(number.format(report.loc.nonEmpty))}`);

  lines.push('');

  if (report.loc.skippedLargeFiles) lines.push(dim(`Skipped large files: ${report.loc.skippedLargeFiles}`));
  const extensionRows = Object.entries(report.loc.byExtension)
    .slice(0, 10)
    .map(([extension, stats]) => [extension, number.format(stats.files), number.format(stats.nonEmpty)]);
  if (extensionRows.length) lines.push(table(extensionRows, ['Extension', 'Files', 'Non-empty lines']));

  lines.push(section('Git activity'));
  if (!report.git.available) {
    lines.push(dim(report.git.reason ?? 'Git repository not found'));
  } else {
    lines.push(`Period: last ${report.git.periodDays} days`);
    lines.push(`Branch: ${report.git.branch}`);
    if (report.git.remote) lines.push(`Remote: ${report.git.remote}`);
    lines.push(`Non-merge commits: ${number.format(report.git.commits)}`);
    lines.push(`Active days: ${number.format(report.git.activeDays)}`);
    lines.push(`Contributors: ${number.format(report.git.contributorsCount)}`);
    lines.push(`Changes: ${green(`+${number.format(report.git.additions)}`)} ${red(`-${number.format(report.git.deletions)}`)}`);
    if (report.git.commits) lines.push(`Top contributor's commit share: ${percent.format(report.git.topContributorShare)}`);

    addActivitySection(lines, 'Daily activity', 'Day', report.git.daily, 14);
    addActivitySection(lines, 'Weekly activity', 'Week', report.git.weekly, 12);
    addActivitySection(lines, 'Monthly activity', 'Month', report.git.monthly, 12);

    if (report.git.contributors.length) {
      lines.push(section('Contributors'));
      lines.push(`Showing ${number.format(report.git.contributors.length)} of ${number.format(report.git.contributorsCount)}`);
      lines.push(dim('Sorted by commit count'));
      
      lines.push('');

      lines.push(table(
        report.git.contributors.map((item) => [
          item.name,
          number.format(item.commits),
          number.format(item.activeDays),
          `+${number.format(item.additions)} / -${number.format(item.deletions)}`,
          percent.format(item.commits / report.git.commits),
        ]),
        ['Author', 'Commits', 'Days', 'Changes', 'Share'],
      ));
    }
  }

  return lines.join('\n');
}
