import type {
  DependencyStatus,
  FarsightReport,
  GitPeriodStats,
} from './types.js';

export type ReportViewId =
  | 'overview'
  | 'insights'
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
type CellStyler = (
  value: string,
  rowIndex: number,
  columnIndex: number,
) => string;

interface TableOptions {
  align?: readonly Alignment[];
  maxWidth?: number;
  cellStyle?: CellStyler;
}

const forceColor = process.env.FORCE_COLOR;
const useColor =
  !process.env.NO_COLOR &&
  (Boolean(process.stdout.isTTY) ||
    (forceColor !== undefined && forceColor !== '' && forceColor !== '0'));
const ansi =
  (open: number, close: number) =>
  (text: unknown): string =>
    useColor ? `\x1b[${open}m${String(text)}\x1b[${close}m` : String(text);
const bold = ansi(1, 22);
const dim = ansi(2, 22);
const inverse = ansi(7, 27);
const cyan = ansi(36, 39);
const blue = ansi(34, 39);
const green = ansi(32, 39);
const yellow = ansi(33, 39);
const red = ansi(31, 39);
const magenta = ansi(35, 39);

const number = new Intl.NumberFormat('en-US');
const decimal = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });
const percent = new Intl.NumberFormat('en-US', {
  style: 'percent',
  maximumFractionDigits: 0,
});
const dateTime = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

const ANSI_PATTERN = /\x1b\[[0-?]*[ -/]*[@-~]/g;

export function stripAnsi(value: string): string {
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
      48,
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

function semanticValue(value: string): string {
  if (ANSI_PATTERN.test(value)) {
    ANSI_PATTERN.lastIndex = 0;
    return value;
  }
  ANSI_PATTERN.lastIndex = 0;
  const plain = value.trim();
  if (!plain || plain === '-') return dim(value);
  if (/^(?:unavailable|unknown|not detected|not checked|skipped)/i.test(plain))
    return dim(value);
  if (
    /^(?:high|completed|up to date|latest|public|available|healthy)/i.test(
      plain,
    )
  )
    return green(value);
  if (/^(?:medium|outdated|needs|warning|update)/i.test(plain))
    return yellow(value);
  if (/^(?:low|failed|error|new range)/i.test(plain)) return red(value);
  if (/^\+\d/.test(plain)) return green(value);
  if (/^-\d/.test(plain)) return red(value);
  if (/^-?\d[\d,.]*(?:\s|$)/.test(plain)) return yellow(value);
  if (/\d+%$/.test(plain)) return magenta(value);
  if (/^\d{4}-\d{2}(?:-\d{2})?/.test(plain)) return blue(value);
  return value;
}

function metricCellStyle(
  value: string,
  _rowIndex: number,
  columnIndex: number,
): string {
  return columnIndex === 0 ? cyan(value) : semanticValue(value);
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
    dim(
      cyan(
        `${left}${widths
          .map((width) => '─'.repeat(width + 2))
          .join(middle)}${right}`,
      ),
    );
  const row = (
    cells: readonly string[],
    header = false,
    rowIndex = -1,
  ): string =>
    dim(cyan('│')) +
    cells
      .map((cell, index) => {
        const width = widths[index] ?? 3;
        const alignment = header ? 'left' : (alignments[index] ?? 'left');
        const styled = header
          ? bold(cyan(cell))
          : (options.cellStyle?.(cell, rowIndex, index) ?? cell);
        const value = fitCell(styled, width, alignment);
        return ` ${value} `;
      })
      .join(dim(cyan('│'))) +
    dim(cyan('│'));

  return [
    border('┌', '┬', '┐'),
    row(data[0] ?? [], true),
    border('├', '┼', '┤'),
    ...data.slice(1).map((cells, index) => row(cells, false, index)),
    border('└', '┴', '┘'),
  ].join('\n');
}

function title(text: string): string {
  return bold(cyan(text));
}

function section(titleText: string, subtitle?: string): string {
  const lines = [
    title(titleText),
    dim(cyan('─'.repeat(Math.min(56, titleText.length + 12)))),
  ];
  if (subtitle) lines.push(dim(subtitle));
  return lines.join('\n');
}

function keyValueRows(items: readonly [string, Cell][]): Cell[][] {
  return items.map(([label, value]) => [label, value]);
}

function renderMetrics(
  items: readonly [string, Cell][],
  maxWidth: number,
): string {
  return renderTable(keyValueRows(items), ['Metric', 'Value'], {
    maxWidth,
    cellStyle: metricCellStyle,
  });
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

function coloredNet(additions: number, deletions: number): string {
  const value = formatNet(additions, deletions);
  return additions - deletions >= 0 ? green(value) : red(value);
}

function dependencyStatus(status: DependencyStatus): string {
  if (status === 'latest') return green('latest');
  if (status === 'update-within-range') return yellow('update in range');
  if (status === 'newer-outside-range') return red('new range available');
  if (status === 'outdated') return yellow('outdated');
  return dim('unknown');
}

function shareBar(value: number, width = 14): string {
  const safe = Math.max(0, Math.min(1, value));
  const filled = Math.round(safe * width);
  return `${magenta('█'.repeat(filled))}${dim('░'.repeat(width - filled))}`;
}

function sumPeriods(items: readonly GitPeriodStats[]): {
  commits: number;
  additions: number;
  deletions: number;
} {
  return items.reduce(
    (totals, item) => ({
      commits: totals.commits + item.commits,
      additions: totals.additions + item.additions,
      deletions: totals.deletions + item.deletions,
    }),
    { commits: 0, additions: 0, deletions: 0 },
  );
}

function peakPeriod(items: readonly GitPeriodStats[]): GitPeriodStats | null {
  return (
    [...items].sort(
      (a, b) =>
        b.commits - a.commits ||
        b.additions + b.deletions - (a.additions + a.deletions),
    )[0] ?? null
  );
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
      coloredNet(item.additions, item.deletions),
    ]);
}

function activityCellStyle(
  value: string,
  _rowIndex: number,
  columnIndex: number,
): string {
  if (columnIndex === 0) return cyan(value);
  const plain = stripAnsi(value);
  if (/^\+/.test(plain)) return green(value);
  if (/^-/.test(plain)) return red(value);
  if (/^\d{4}-/.test(plain)) return blue(value);
  if (/^\d/.test(plain)) return yellow(value);
  return value;
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
  const totals = sumPeriods(items);
  const peak = peakPeriod(items);

  return [
    section(
      heading,
      `${number.format(items.length)} active ${items.length === 1 ? 'period' : 'periods'} · complete selected window`,
    ),
    renderMetrics(
      [
        ['Active periods', number.format(items.length)],
        ['Total commits', number.format(totals.commits)],
        [
          'Average commits / active period',
          decimal.format(totals.commits / Math.max(1, items.length)),
        ],
        [
          'Busiest period',
          peak
            ? `${peak.period} · ${number.format(peak.commits)} commits`
            : '-',
        ],
        ['Added lines', `+${number.format(totals.additions)}`],
        ['Deleted lines', `-${number.format(totals.deletions)}`],
        ['Net change', coloredNet(totals.additions, totals.deletions)],
      ],
      maxWidth,
    ),
    '',
    renderTable(activityRows(items, range), headers, {
      align,
      maxWidth,
      cellStyle: activityCellStyle,
    }),
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

function dependencySummary(report: FarsightReport): string {
  if (!report.dependencies.available) return 'Unavailable';
  if (!report.dependencies.checked) return 'Not checked';
  if (report.dependencies.outdatedCount === 0) return 'Up to date';
  return `${number.format(report.dependencies.outdatedCount)} updates`;
}

function renderOverview(report: FarsightReport, maxWidth: number): string {
  const gitAvailable = report.git.available;
  const dominantLanguage = report.project.languages[0];

  return [
    renderBanner(report, maxWidth),
    '',
    section('Overview', `Generated ${formatTimestamp(report.generatedAt)}`),
    renderMetrics(
      [
        ['Project type', magenta(report.project.primary)],
        ['Ecosystem', blue(report.project.ecosystem)],
        ['Framework', report.project.framework ?? '-'],
        ['Project kind', report.project.kind],
        ['Detection confidence', report.project.confidence],
        [
          'Toolchain / package manager',
          report.project.packageManager ?? 'Not detected',
        ],
        [
          'Dominant language',
          dominantLanguage
            ? `${dominantLanguage.extension} · ${number.format(dominantLanguage.nonEmptyLines)} lines`
            : '-',
        ],
        ['Source files', number.format(report.loc.files)],
        ['Non-empty lines', number.format(report.loc.nonEmpty)],
        ['Dependencies', dependencySummary(report)],
        [
          'Git branch',
          gitAvailable ? (report.git.branch ?? '-') : 'Unavailable',
        ],
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
            ? `${green(`+${number.format(report.git.additions)}`)} / ${red(`-${number.format(report.git.deletions)}`)}`
            : 'Unavailable',
        ],
      ],
      maxWidth,
    ),
  ].join('\n');
}

function renderInsights(report: FarsightReport, maxWidth: number): string {
  const dominant = report.project.languages[0];
  const dominantShare = dominant
    ? dominant.nonEmptyLines / Math.max(1, report.loc.nonEmpty)
    : 0;
  const codeDensity = report.loc.nonEmpty / Math.max(1, report.loc.lines);
  const healthyDependencies = Math.max(
    0,
    report.dependencies.totalDeclared - report.dependencies.outdatedCount,
  );
  const blocks = [
    section('Insights', 'Derived indicators for quick orientation'),
    renderMetrics(
      [
        ['Detection signals', number.format(report.project.signals.length)],
        [
          'Detected project files',
          number.format(report.project.detectedFiles.length),
        ],
        [
          'Dominant source share',
          dominant
            ? `${dominant.extension} · ${percent.format(dominantShare)}`
            : '-',
        ],
        ['Non-empty line density', percent.format(codeDensity)],
        [
          'Dependency health',
          report.dependencies.available
            ? `${number.format(healthyDependencies)} current / ${number.format(report.dependencies.outdatedCount)} need attention`
            : 'Unavailable',
        ],
      ],
      maxWidth,
    ),
  ];

  if (report.git.available) {
    const peakDay = peakPeriod(report.git.daily);
    const peakWeek = peakPeriod(report.git.weekly);
    blocks.push(
      '',
      section('Git intensity'),
      renderMetrics(
        [
          [
            'Commits / active day',
            decimal.format(
              report.git.commits / Math.max(1, report.git.activeDays),
            ),
          ],
          [
            'Commits / contributor',
            decimal.format(
              report.git.commits / Math.max(1, report.git.contributorsCount),
            ),
          ],
          [
            'Changed lines / commit',
            decimal.format(
              (report.git.additions + report.git.deletions) /
                Math.max(1, report.git.commits),
            ),
          ],
          [
            'Active-day coverage',
            percent.format(
              report.git.activeDays / Math.max(1, report.git.periodDays ?? 1),
            ),
          ],
          [
            'Top contributor share',
            percent.format(report.git.topContributorShare),
          ],
          [
            'Peak day',
            peakDay
              ? `${peakDay.period} · ${number.format(peakDay.commits)} commits`
              : '-',
          ],
          [
            'Peak week',
            peakWeek
              ? `${peakWeek.period} · ${number.format(peakWeek.commits)} commits`
              : '-',
          ],
          [
            'Net source change',
            coloredNet(report.git.additions, report.git.deletions),
          ],
        ],
        maxWidth,
      ),
    );
  }

  return blocks.join('\n');
}

function renderProject(report: FarsightReport, maxWidth: number): string {
  const packageState = report.package
    ? report.package.private
      ? 'private'
      : 'public'
    : 'package.json not found';

  const blocks = [
    section('Project details'),
    renderMetrics(
      [
        ['Root', report.root],
        ['Package', report.package?.name ?? '-'],
        ['Version', report.package?.version ?? '-'],
        ['Visibility', packageState],
        ['Detected type', magenta(report.project.primary)],
        ['Ecosystem', blue(report.project.ecosystem)],
        ['Framework', report.project.framework ?? '-'],
        ['Project kind', report.project.kind],
        ['Detection confidence', report.project.confidence],
        [
          'Toolchain / package manager',
          report.project.packageManager ?? 'Not detected',
        ],
        ['Traits', report.project.traits.join(', ') || '-'],
        ['Generated at', formatTimestamp(report.generatedAt)],
      ],
      maxWidth,
    ),
  ];

  if (report.project.languages.length > 0) {
    blocks.push(
      '',
      section('Primary languages'),
      renderTable(
        report.project.languages.map((item) => {
          const share = item.nonEmptyLines / Math.max(1, report.loc.nonEmpty);
          return [
            item.extension,
            number.format(item.nonEmptyLines),
            percent.format(share),
            shareBar(share),
          ];
        }),
        ['Extension', 'Non-empty lines', 'Share', 'Distribution'],
        {
          maxWidth,
          align: ['left', 'right', 'right', 'left'],
          cellStyle: (value, _row, column) => {
            if (column === 0) return magenta(value);
            if (column === 1) return green(value);
            if (column === 2) return cyan(value);
            return value;
          },
        },
      ),
    );
  }

  if (report.project.detectedFiles.length > 0) {
    blocks.push(
      '',
      section(
        'Detected project files',
        'Manifests and configuration used by the detector',
      ),
      renderTable(
        report.project.detectedFiles.map((file, index) => [index + 1, file]),
        ['#', 'File'],
        {
          maxWidth,
          align: ['right', 'left'],
          cellStyle: (value, _row, column) =>
            column === 0 ? yellow(value) : blue(value),
        },
      ),
    );
  }

  if (report.project.signals.length > 0) {
    blocks.push(
      '',
      section(
        'Detection evidence',
        'Concrete signals behind the classification',
      ),
      renderTable(
        report.project.signals.map((signal) => [
          signal.label,
          signal.detail,
          signal.source,
        ]),
        ['Signal', 'Detected', 'Source'],
        {
          maxWidth,
          cellStyle: (value, _row, column) => {
            if (column === 0) return magenta(value);
            if (column === 2) return blue(value);
            return green(value);
          },
        },
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

  const currentCount = Math.max(
    0,
    report.dependencies.totalDeclared - report.dependencies.outdatedCount,
  );
  lines.push(
    renderMetrics(
      [
        [
          'Declared direct dependencies',
          number.format(report.dependencies.totalDeclared),
        ],
        [
          'Registry check',
          report.dependencies.checked ? 'Completed' : 'Skipped',
        ],
        ['Current', number.format(currentCount)],
        ['Needs attention', number.format(report.dependencies.outdatedCount)],
        [
          'Current share',
          percent.format(
            currentCount / Math.max(1, report.dependencies.totalDeclared),
          ),
        ],
      ],
      maxWidth,
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
        {
          maxWidth,
          cellStyle: (value, _row, column) => {
            if (column === 0) return cyan(value);
            if (column === 1) return magenta(value);
            if (column === 2 || column === 3) return dim(value);
            if (column === 4) return yellow(value);
            if (column === 5) return green(value);
            return value;
          },
        },
      ),
    );
  }

  return lines.join('\n');
}

function renderCode(report: FarsightReport, maxWidth: number): string {
  const extensionRows = Object.entries(report.loc.byExtension)
    .sort(([, a], [, b]) => b.nonEmpty - a.nonEmpty)
    .map(([extension, stats]) => {
      const share = stats.nonEmpty / Math.max(1, report.loc.nonEmpty);
      return [
        extension,
        number.format(stats.files),
        number.format(stats.lines),
        number.format(stats.nonEmpty),
        percent.format(share),
        shareBar(share),
      ];
    });
  const dominant = Object.entries(report.loc.byExtension)[0];

  return [
    section('Source code'),
    renderMetrics(
      [
        ['Source files', number.format(report.loc.files)],
        ['Physical lines', number.format(report.loc.lines)],
        ['Non-empty lines', number.format(report.loc.nonEmpty)],
        [
          'Blank lines',
          number.format(Math.max(0, report.loc.lines - report.loc.nonEmpty)),
        ],
        [
          'Non-empty density',
          percent.format(report.loc.nonEmpty / Math.max(1, report.loc.lines)),
        ],
        [
          'Dominant extension',
          dominant
            ? `${dominant[0]} · ${percent.format(dominant[1].nonEmpty / Math.max(1, report.loc.nonEmpty))}`
            : '-',
        ],
        ['Skipped large files', number.format(report.loc.skippedLargeFiles)],
      ],
      maxWidth,
    ),
    '',
    section('Extensions', 'Complete source breakdown'),
    renderTable(
      extensionRows,
      ['Extension', 'Files', 'Physical', 'Non-empty', 'Share', 'Distribution'],
      {
        maxWidth,
        align: ['left', 'right', 'right', 'right', 'right', 'left'],
        cellStyle: (value, _row, column) => {
          if (column === 0) return magenta(value);
          if (column === 1) return cyan(value);
          if (column === 2) return yellow(value);
          if (column === 3) return green(value);
          if (column === 4) return blue(value);
          return value;
        },
      },
    ),
  ].join('\n');
}

function renderGit(report: FarsightReport, maxWidth: number): string {
  const lines = [section('Git activity')];
  if (!report.git.available) {
    lines.push(dim(report.git.reason ?? 'Git repository not found'));
    return lines.join('\n');
  }

  const earliestDay = report.git.daily[0]?.startDate ?? null;
  const peakDay = peakPeriod(report.git.daily);
  lines.push(
    renderMetrics(
      [
        ['Window', `Last ${number.format(report.git.periodDays ?? 0)} days`],
        ['First active date', earliestDay ?? '-'],
        ['Branch', report.git.branch ?? '-'],
        ['Remote', report.git.remote ?? '-'],
        ['Last commit', formatTimestamp(report.git.lastCommitAt)],
        ['Non-merge commits', number.format(report.git.commits)],
        ['Active days', number.format(report.git.activeDays)],
        [
          'Commits / active day',
          decimal.format(
            report.git.commits / Math.max(1, report.git.activeDays),
          ),
        ],
        ['Contributors', number.format(report.git.contributorsCount)],
        ['Additions', green(`+${number.format(report.git.additions)}`)],
        ['Deletions', red(`-${number.format(report.git.deletions)}`)],
        ['Net change', coloredNet(report.git.additions, report.git.deletions)],
        [
          'Changed lines / commit',
          decimal.format(
            (report.git.additions + report.git.deletions) /
              Math.max(1, report.git.commits),
          ),
        ],
        [
          'Top contributor share',
          percent.format(report.git.topContributorShare),
        ],
        [
          'Peak day',
          peakDay
            ? `${peakDay.period} · ${number.format(peakDay.commits)} commits`
            : '-',
        ],
      ],
      maxWidth,
    ),
  );

  return lines.join('\n');
}

function renderContributors(report: FarsightReport, maxWidth: number): string {
  if (!report.git.available) return renderGit(report, maxWidth);
  const topContributor = report.git.contributors[0];
  return [
    section(
      'Contributors',
      `Showing ${number.format(report.git.contributors.length)} of ${number.format(report.git.contributorsCount)} · sorted by commits`,
    ),
    renderMetrics(
      [
        ['Contributors in window', number.format(report.git.contributorsCount)],
        [
          'Average commits / contributor',
          decimal.format(
            report.git.commits / Math.max(1, report.git.contributorsCount),
          ),
        ],
        [
          'Top contributor',
          topContributor
            ? `${topContributor.name} · ${number.format(topContributor.commits)} commits`
            : '-',
        ],
        [
          'Top contributor share',
          percent.format(report.git.topContributorShare),
        ],
      ],
      maxWidth,
    ),
    '',
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
        cellStyle: (value, _row, column) => {
          if (column === 0) return cyan(value);
          if (column === 1) return dim(value);
          if (column === 2) return yellow(value);
          if (column === 3 || column === 8) return magenta(value);
          if (column === 4 || column === 5) return blue(value);
          if (column === 6) return green(value);
          if (column === 7) return red(value);
          return value;
        },
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
      id: 'insights',
      title: 'Insights',
      content: renderInsights(report, maxWidth),
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
  inverse,
  cyan,
  blue,
  green,
  yellow,
  red,
  magenta,
};
