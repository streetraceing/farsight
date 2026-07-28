import type {
  DependencyStatus,
  FarsightReport,
  GitPeriodStats,
} from './types.js';

export type ReportViewId =
  | 'overview'
  | 'project'
  | 'dependencies'
  | 'code'
  | 'git'
  | 'contributors'
  | 'daily'
  | 'weekly'
  | 'monthly';

export interface ReportView {
  id: ReportViewId;
  title: string;
  content: string;
}

type Cell = string | number | null | undefined;
type Alignment = 'left' | 'right';

interface TableOptions {
  align?: readonly Alignment[];
  maxWidth?: number;
}

const useColor = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
const ansi =
  (open: number, close: number) =>
  (text: unknown): string =>
    useColor ? `\x1b[${open}m${String(text)}\x1b[${close}m` : String(text);
const bold = ansi(1, 22);
const dim = ansi(2, 22);
const cyan = ansi(36, 39);
const green = ansi(32, 39);
const yellow = ansi(33, 39);
const red = ansi(31, 39);
const magenta = ansi(35, 39);

const number = new Intl.NumberFormat('en-US');
const percent = new Intl.NumberFormat('en-US', {
  style: 'percent',
  maximumFractionDigits: 0,
});
const dateTime = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

const ANSI_PATTERN = /\x1b\[[0-?]*[ -/]*[@-~]/g;

function stripAnsi(value: string): string {
  return value.replace(ANSI_PATTERN, '');
}

function visibleLength(value: string): number {
  return stripAnsi(value).length;
}

function terminalWidth(): number {
  if (!process.stdout.isTTY) return 120;
  return Math.max(60, Math.min(160, process.stdout.columns || 120));
}

function fitCell(value: string, width: number, alignment: Alignment): string {
  const plain = stripAnsi(value);
  const clipped =
    plain.length > width
      ? width <= 1
        ? '…'.slice(0, width)
        : `${plain.slice(0, width - 1)}…`
      : value;
  const padding = Math.max(0, width - visibleLength(clipped));
  return alignment === 'right'
    ? `${' '.repeat(padding)}${clipped}`
    : `${clipped}${' '.repeat(padding)}`;
}

function resolveWidths(
  data: readonly string[][],
  columnCount: number,
  maxWidth: number,
): number[] {
  const widths = Array.from({ length: columnCount }, (_, index) =>
    Math.min(
      42,
      Math.max(3, ...data.map((row) => visibleLength(row[index] ?? ''))),
    ),
  );
  const borderWidth = columnCount * 3 + 1;
  const minimum = columnCount <= 3 ? 5 : 3;

  while (widths.reduce((sum, width) => sum + width, borderWidth) > maxWidth) {
    let widestIndex = -1;
    let widestValue = minimum;
    for (let index = 0; index < widths.length; index += 1) {
      const width = widths[index] ?? minimum;
      if (width > widestValue) {
        widestIndex = index;
        widestValue = width;
      }
    }
    if (widestIndex < 0) break;
    widths[widestIndex] = widestValue - 1;
  }

  return widths;
}

export function renderTable(
  rows: readonly Cell[][],
  headers: readonly string[],
  options: TableOptions = {},
): string {
  if (rows.length === 0) return dim('No data.');

  const data = [headers, ...rows].map((row) =>
    headers.map((_, index) => String(row[index] ?? '-')),
  );
  const maxWidth = Math.max(40, options.maxWidth ?? terminalWidth());
  const widths = resolveWidths(data, headers.length, maxWidth);
  const alignments = headers.map(
    (_, index): Alignment => options.align?.[index] ?? 'left',
  );
  const border = (left: string, middle: string, right: string): string =>
    `${left}${widths.map((width) => '─'.repeat(width + 2)).join(middle)}${right}`;
  const row = (cells: readonly string[], header = false): string =>
    `│${cells
      .map((cell, index) => {
        const width = widths[index] ?? 3;
        const alignment = header ? 'left' : (alignments[index] ?? 'left');
        const value = fitCell(cell, width, alignment);
        return ` ${header ? bold(value) : value} `;
      })
      .join('│')}│`;

  return [
    border('┌', '┬', '┐'),
    row(data[0] ?? [], true),
    border('├', '┼', '┤'),
    ...data.slice(1).map((cells) => row(cells)),
    border('└', '┴', '┘'),
  ].join('\n');
}

function title(text: string): string {
  return bold(cyan(text));
}

function section(titleText: string, subtitle?: string): string {
  const lines = [
    `${title(titleText)}`,
    '─'.repeat(Math.min(48, titleText.length + 10)),
  ];
  if (subtitle) lines.push(dim(subtitle));
  return lines.join('\n');
}

function keyValueRows(items: readonly [string, Cell][]): Cell[][] {
  return items.map(([label, value]) => [label, value]);
}

function formatTimestamp(value: string | null): string {
  if (!value) return '-';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : dateTime.format(parsed);
}

function formatNet(additions: number, deletions: number): string {
  const net = additions - deletions;
  return `${net >= 0 ? '+' : ''}${number.format(net)}`;
}

function dependencyStatus(status: DependencyStatus): string {
  if (status === 'latest') return green('latest');
  if (status === 'update-within-range') return yellow('update in range');
  if (status === 'newer-outside-range') return red('new range available');
  if (status === 'outdated') return yellow('outdated');
  return dim('unknown');
}

function activityRows(
  items: readonly GitPeriodStats[],
  range: boolean,
): Cell[][] {
  return [...items]
    .reverse()
    .map((item) => [
      item.period,
      ...(range ? [item.startDate, item.endDate] : []),
      number.format(item.commits),
      `+${number.format(item.additions)}`,
      `-${number.format(item.deletions)}`,
      formatNet(item.additions, item.deletions),
    ]);
}

function renderActivity(
  heading: string,
  periodLabel: string,
  items: readonly GitPeriodStats[],
  maxWidth: number,
  range: boolean,
): string {
  const headers = [
    periodLabel,
    ...(range ? ['Start', 'End'] : []),
    'Commits',
    'Added',
    'Deleted',
    'Net',
  ];
  const align = [
    'left',
    ...(range ? ['left', 'left'] : []),
    'right',
    'right',
    'right',
    'right',
  ] as Alignment[];

  return [
    section(
      heading,
      `${number.format(items.length)} active ${items.length === 1 ? 'period' : 'periods'} · complete selected window`,
    ),
    renderTable(activityRows(items, range), headers, { align, maxWidth }),
  ].join('\n');
}

function renderBanner(report: FarsightReport, maxWidth: number): string {
  const width = Math.max(44, Math.min(maxWidth, 120));
  const inner = width - 4;
  const packageName = report.package?.name ?? 'Unnamed project';
  const packageVersion = report.package?.version
    ? ` v${report.package.version}`
    : '';
  const headline = `FARSIGHT  ${packageName}${packageVersion}`;
  const root = report.root;
  const fit = (value: string): string => fitCell(value, inner, 'left');

  return [
    cyan(`╭${'─'.repeat(width - 2)}╮`),
    cyan('│ ') + bold(fit(headline)) + cyan(' │'),
    cyan('│ ') + dim(fit(root)) + cyan(' │'),
    cyan(`╰${'─'.repeat(width - 2)}╯`),
  ].join('\n');
}

function renderOverview(report: FarsightReport, maxWidth: number): string {
  const gitAvailable = report.git.available;
  const dependencyState = !report.dependencies.available
    ? 'Unavailable'
    : !report.dependencies.checked
      ? 'Not checked'
      : report.dependencies.outdatedCount === 0
        ? 'Up to date'
        : `${number.format(report.dependencies.outdatedCount)} updates`;

  return [
    renderBanner(report, maxWidth),
    '',
    section('Overview', `Generated ${formatTimestamp(report.generatedAt)}`),
    renderTable(
      [
        ['Project type', report.project.primary],
        ['Package manager', report.project.packageManager ?? 'Not detected'],
        ['Source files', number.format(report.loc.files)],
        ['Non-empty lines', number.format(report.loc.nonEmpty)],
        ['Dependencies', dependencyState],
        [
          'Git commits',
          gitAvailable ? number.format(report.git.commits) : 'Unavailable',
        ],
        [
          'Contributors',
          gitAvailable
            ? number.format(report.git.contributorsCount)
            : 'Unavailable',
        ],
        [
          'Git changes',
          gitAvailable
            ? `+${number.format(report.git.additions)} / -${number.format(report.git.deletions)}`
            : 'Unavailable',
        ],
      ],
      ['Metric', 'Value'],
      { maxWidth, align: ['left', 'left'] },
    ),
  ].join('\n');
}

function renderProject(report: FarsightReport, maxWidth: number): string {
  const packageState = report.package
    ? report.package.private
      ? 'private'
      : 'public'
    : 'package.json not found';

  const blocks = [
    section('Project details'),
    renderTable(
      keyValueRows([
        ['Root', report.root],
        ['Package', report.package?.name ?? '-'],
        ['Version', report.package?.version ?? '-'],
        ['Visibility', packageState],
        ['Detected type', report.project.primary],
        ['Package manager', report.project.packageManager ?? 'Not detected'],
        ['Traits', report.project.traits.join(', ') || '-'],
        ['Generated at', formatTimestamp(report.generatedAt)],
      ]),
      ['Property', 'Value'],
      { maxWidth },
    ),
  ];

  if (report.project.languages.length > 0) {
    blocks.push(
      '',
      section('Primary languages'),
      renderTable(
        report.project.languages.map((item) => [
          item.extension,
          number.format(item.nonEmptyLines),
          percent.format(item.nonEmptyLines / Math.max(1, report.loc.nonEmpty)),
        ]),
        ['Extension', 'Non-empty lines', 'Share'],
        { maxWidth, align: ['left', 'right', 'right'] },
      ),
    );
  }

  return blocks.join('\n');
}

function renderDependencies(report: FarsightReport, maxWidth: number): string {
  const lines = [section('Dependencies')];
  if (!report.dependencies.available) {
    lines.push(dim(report.dependencies.warning ?? 'package.json not found'));
    return lines.join('\n');
  }

  lines.push(
    renderTable(
      [
        [
          'Declared direct dependencies',
          number.format(report.dependencies.totalDeclared),
        ],
        [
          'Registry check',
          report.dependencies.checked ? 'Completed' : 'Skipped',
        ],
        ['Needs attention', number.format(report.dependencies.outdatedCount)],
      ],
      ['Metric', 'Value'],
      { maxWidth },
    ),
  );

  if (report.dependencies.warning) {
    lines.push('', yellow(report.dependencies.warning));
  }

  if (report.dependencies.checked && report.dependencies.items.length === 0) {
    lines.push('', green('All declared direct dependencies are current.'));
  } else if (report.dependencies.items.length > 0) {
    lines.push(
      '',
      section(
        'Dependency updates',
        'Every dependency returned by npm outdated',
      ),
      renderTable(
        report.dependencies.items.map((item) => [
          item.name,
          item.type ?? '-',
          item.declared ?? '-',
          item.current ?? 'not installed',
          item.wanted ?? '-',
          item.latest ?? '-',
          dependencyStatus(item.status),
        ]),
        [
          'Package',
          'Type',
          'Declared',
          'Current',
          'Wanted',
          'Latest',
          'Status',
        ],
        { maxWidth },
      ),
    );
  }

  return lines.join('\n');
}

function renderCode(report: FarsightReport, maxWidth: number): string {
  const extensionRows = Object.entries(report.loc.byExtension)
    .sort(([, a], [, b]) => b.nonEmpty - a.nonEmpty)
    .map(([extension, stats]) => [
      extension,
      number.format(stats.files),
      number.format(stats.lines),
      number.format(stats.nonEmpty),
      percent.format(stats.nonEmpty / Math.max(1, report.loc.nonEmpty)),
    ]);

  return [
    section('Source code'),
    renderTable(
      [
        ['Source files', number.format(report.loc.files)],
        ['Physical lines', number.format(report.loc.lines)],
        ['Non-empty lines', number.format(report.loc.nonEmpty)],
        ['Skipped large files', number.format(report.loc.skippedLargeFiles)],
      ],
      ['Metric', 'Value'],
      { maxWidth },
    ),
    '',
    section('Extensions', 'Complete source breakdown'),
    renderTable(
      extensionRows,
      ['Extension', 'Files', 'Physical', 'Non-empty', 'Share'],
      { maxWidth, align: ['left', 'right', 'right', 'right', 'right'] },
    ),
  ].join('\n');
}

function renderGit(report: FarsightReport, maxWidth: number): string {
  const lines = [section('Git activity')];
  if (!report.git.available) {
    lines.push(dim(report.git.reason ?? 'Git repository not found'));
    return lines.join('\n');
  }

  lines.push(
    renderTable(
      keyValueRows([
        ['Window', `Last ${number.format(report.git.periodDays ?? 0)} days`],
        ['Branch', report.git.branch ?? '-'],
        ['Remote', report.git.remote ?? '-'],
        ['Last commit', formatTimestamp(report.git.lastCommitAt)],
        ['Non-merge commits', number.format(report.git.commits)],
        ['Active days', number.format(report.git.activeDays)],
        ['Contributors', number.format(report.git.contributorsCount)],
        ['Additions', green(`+${number.format(report.git.additions)}`)],
        ['Deletions', red(`-${number.format(report.git.deletions)}`)],
        ['Net change', formatNet(report.git.additions, report.git.deletions)],
        [
          'Top contributor share',
          percent.format(report.git.topContributorShare),
        ],
      ]),
      ['Metric', 'Value'],
      { maxWidth },
    ),
  );

  return lines.join('\n');
}

function renderContributors(report: FarsightReport, maxWidth: number): string {
  if (!report.git.available) return renderGit(report, maxWidth);
  return [
    section(
      'Contributors',
      `Showing ${number.format(report.git.contributors.length)} of ${number.format(report.git.contributorsCount)} · sorted by commits`,
    ),
    renderTable(
      report.git.contributors.map((item) => [
        item.name,
        item.email ?? '-',
        number.format(item.commits),
        number.format(item.activeDays),
        item.firstCommitAt ?? '-',
        item.lastCommitAt ?? '-',
        `+${number.format(item.additions)}`,
        `-${number.format(item.deletions)}`,
        percent.format(item.commits / Math.max(1, report.git.commits)),
      ]),
      [
        'Author',
        'Email',
        'Commits',
        'Days',
        'First',
        'Last',
        'Added',
        'Deleted',
        'Share',
      ],
      {
        maxWidth,
        align: [
          'left',
          'left',
          'right',
          'right',
          'left',
          'left',
          'right',
          'right',
          'right',
        ],
      },
    ),
  ].join('\n');
}

export function createReportViews(
  report: FarsightReport,
  maxWidth = terminalWidth(),
): ReportView[] {
  const views: ReportView[] = [
    {
      id: 'overview',
      title: 'Overview',
      content: renderOverview(report, maxWidth),
    },
    {
      id: 'project',
      title: 'Project',
      content: renderProject(report, maxWidth),
    },
    {
      id: 'dependencies',
      title: 'Dependencies',
      content: renderDependencies(report, maxWidth),
    },
    { id: 'code', title: 'Code', content: renderCode(report, maxWidth) },
    { id: 'git', title: 'Git', content: renderGit(report, maxWidth) },
  ];

  if (report.git.available) {
    views.push(
      {
        id: 'contributors',
        title: 'Contributors',
        content: renderContributors(report, maxWidth),
      },
      {
        id: 'daily',
        title: 'Daily',
        content: renderActivity(
          'Daily activity',
          'Date',
          report.git.daily,
          maxWidth,
          false,
        ),
      },
      {
        id: 'weekly',
        title: 'Weekly',
        content: renderActivity(
          'Weekly activity',
          'ISO week',
          report.git.weekly,
          maxWidth,
          true,
        ),
      },
      {
        id: 'monthly',
        title: 'Monthly',
        content: renderActivity(
          'Monthly activity',
          'Month',
          report.git.monthly,
          maxWidth,
          true,
        ),
      },
    );
  }

  return views;
}

export function renderReport(report: FarsightReport): string {
  const maxWidth = terminalWidth();
  const views = createReportViews(report, maxWidth);
  return `\n${views.map((view) => view.content).join('\n\n')}`;
}

export const renderStyle = {
  bold,
  dim,
  cyan,
  green,
  yellow,
  red,
  magenta,
};
