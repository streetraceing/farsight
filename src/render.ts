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
  let clipped = plain;
  if (plain.length > width) {
    clipped =
      width <= 3 ? plain.slice(0, width) : `${plain.slice(0, width - 3)}...`;
  }
  const padding = Math.max(0, width - clipped.length);
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

function renderTable(
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
      `${left}${widths
        .map((width) => '─'.repeat(width + 2))
        .join(middle)}${right}`,
    );
  const row = (
    cells: readonly string[],
    header = false,
    rowIndex = -1,
  ): string =>
    dim('│') +
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
      .join(dim('│')) +
    dim('│');

  return [
    border('┌', '┬', '┐'),
    row(data[0] ?? [], true),
    border('├', '┼', '┤'),
    ...data.slice(1).map((cells, index) => row(cells, false, index)),
    border('└', '┴', '┘'),
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Styling helpers
//
// Values are styled explicitly where they are produced, instead of being
// sniffed with regular expressions at render time. Every metric row carries
// its own style; table cells are styled per column.
// ---------------------------------------------------------------------------

type ValueStyle =
  | 'bold'
  | 'dim'
  | 'cyan'
  | 'blue'
  | 'green'
  | 'yellow'
  | 'red'
  | 'magenta'
  | null;

const palette = {
  bold,
  dim,
  cyan,
  blue,
  green,
  yellow,
  red,
  magenta,
} as const;

function paint(value: Cell, style: ValueStyle = null): string {
  const text = String(value ?? '-');
  return style ? palette[style](text) : text;
}

function confidenceStyle(confidence: string): ValueStyle {
  if (confidence === 'high') return 'green';
  if (confidence === 'medium') return 'yellow';
  return 'red';
}

// A metric row is a label, a value, and an optional style for the value.
type MetricRow = readonly [string, Cell, ValueStyle?];

function renderMetrics(items: readonly MetricRow[], maxWidth: number): string {
  return renderTable(
    items.map(([label, value, style]) => [label, paint(value, style)]),
    ['Metric', 'Value'],
    {
      maxWidth,
      cellStyle: (value, _rowIndex, columnIndex) =>
        columnIndex === 0 ? cyan(value) : value,
    },
  );
}

function section(titleText: string, subtitle?: string): string {
  const lines = [bold(cyan(titleText)), dim('─'.repeat(titleText.length))];
  if (subtitle) lines.push(dim(subtitle));
  return lines.join('\n');
}

function formatTimestamp(value: string | null): string {
  if (!value) return dim('-');
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : dateTime.format(parsed);
}

function signed(value: number): string {
  return value >= 0 ? `+${number.format(value)}` : number.format(value);
}

function netValue(additions: number, deletions: number): string {
  return green(signed(additions - deletions));
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

function peakPeriod(items: readonly GitPeriodStats[]): GitPeriodStats | null {
  return (
    [...items].sort(
      (a, b) =>
        b.commits - a.commits ||
        b.additions + b.deletions - (a.additions + a.deletions),
    )[0] ?? null
  );
}

function peakLabel(peak: GitPeriodStats | null): string {
  return peak
    ? `${peak.period} (${number.format(peak.commits)} commits)`
    : dim('-');
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

function renderBanner(report: FarsightReport, maxWidth: number): string {
  const packageName = report.package?.name ?? 'Unnamed project';
  const packageVersion = report.package?.version
    ? ` v${report.package.version}`
    : '';
  const headline = `FARSIGHT${packageVersion}`;
  const root = report.root;

  const plainWidths = [headline.length, packageName.length, root.length];
  const inner = Math.min(Math.max(...plainWidths), Math.max(20, maxWidth - 4));
  const border = (left: string, right: string): string =>
    dim(`${left}${'─'.repeat(inner + 2)}${right}`);

  const line = (value: string, style: (text: unknown) => string): string =>
    `${dim('│ ')}${style(fitCell(value, inner, 'left'))}${dim(' │')}`;

  return [
    border('╭', '╮'),
    line(headline, (text) => bold(cyan(text))),
    line(packageName, (text) => bold(text)),
    line(root, dim),
    border('╰', '╯'),
  ].join('\n');
}

function renderOverview(report: FarsightReport, maxWidth: number): string {
  const gitAvailable = report.git.available;
  const dominantLanguage = report.project.languages[0];

  let dependenciesRow: MetricRow;
  if (!report.dependencies.available) {
    dependenciesRow = ['Dependencies', 'Unavailable', 'dim'];
  } else if (!report.dependencies.checked) {
    dependenciesRow = ['Dependencies', 'Not checked', 'dim'];
  } else if (report.dependencies.outdatedCount === 0) {
    dependenciesRow = ['Dependencies', 'Up to date', 'green'];
  } else {
    dependenciesRow = [
      'Dependencies',
      `${number.format(report.dependencies.outdatedCount)} updates`,
      'yellow',
    ];
  }

  const gitRows: MetricRow[] = gitAvailable
    ? [
        [
          'Git branch',
          report.git.branch ?? '-',
          report.git.branch ? null : 'dim',
        ],
        ['Git commits', number.format(report.git.commits)],
        ['Contributors', number.format(report.git.contributorsCount)],
        [
          'Git changes',
          `${green(`+${number.format(report.git.additions)}`)} / ${red(`-${number.format(report.git.deletions)}`)}`,
        ],
      ]
    : [
        ['Git branch', 'Unavailable', 'dim'],
        ['Git commits', 'Unavailable', 'dim'],
        ['Contributors', 'Unavailable', 'dim'],
        ['Git changes', 'Unavailable', 'dim'],
      ];

  return [
    renderBanner(report, maxWidth),
    '',
    section('Overview', `Generated ${formatTimestamp(report.generatedAt)}`),
    renderMetrics(
      [
        ['Project type', report.project.primary, 'magenta'],
        ['Ecosystem', report.project.ecosystem, 'blue'],
        [
          'Framework',
          report.project.framework ?? '-',
          report.project.framework ? null : 'dim',
        ],
        ['Project kind', report.project.kind],
        [
          'Detection confidence',
          report.project.confidence,
          confidenceStyle(report.project.confidence),
        ],
        [
          'Toolchain / package manager',
          report.project.packageManager ?? 'Not detected',
          report.project.packageManager ? null : 'dim',
        ],
        [
          'Dominant language',
          dominantLanguage
            ? `${dominantLanguage.extension}, ${number.format(dominantLanguage.nonEmptyLines)} lines`
            : '-',
          dominantLanguage ? null : 'dim',
        ],
        ['Source files', number.format(report.loc.files)],
        ['Non-empty lines', number.format(report.loc.nonEmpty)],
        dependenciesRow,
        ...gitRows,
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
            ? `${dominant.extension}, ${percent.format(dominantShare)}`
            : '-',
          dominant ? null : 'dim',
        ],
        ['Non-empty line density', percent.format(codeDensity)],
        [
          'Dependency health',
          report.dependencies.available
            ? `${number.format(healthyDependencies)} current / ${number.format(report.dependencies.outdatedCount)} need attention`
            : 'Unavailable',
          report.dependencies.available ? null : 'dim',
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
          ['Peak day', peakLabel(peakDay), peakDay ? 'blue' : 'dim'],
          ['Peak week', peakLabel(peakWeek), peakWeek ? 'blue' : 'dim'],
          [
            'Net source change',
            netValue(report.git.additions, report.git.deletions),
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
    : null;

  const blocks = [
    section('Project details'),
    renderMetrics(
      [
        ['Root', report.root],
        [
          'Package',
          report.package?.name ?? '-',
          report.package?.name ? null : 'dim',
        ],
        [
          'Version',
          report.package?.version ?? '-',
          report.package?.version ? null : 'dim',
        ],
        [
          'Visibility',
          packageState ?? 'package.json not found',
          packageState === 'private' ? 'yellow' : packageState ? null : 'dim',
        ],
        ['Detected type', report.project.primary, 'magenta'],
        ['Ecosystem', report.project.ecosystem, 'blue'],
        [
          'Framework',
          report.project.framework ?? '-',
          report.project.framework ? null : 'dim',
        ],
        ['Project kind', report.project.kind],
        [
          'Detection confidence',
          report.project.confidence,
          confidenceStyle(report.project.confidence),
        ],
        [
          'Toolchain / package manager',
          report.project.packageManager ?? 'Not detected',
          report.project.packageManager ? null : 'dim',
        ],
        [
          'Traits',
          report.project.traits.join(', ') || '-',
          report.project.traits.length ? null : 'dim',
        ],
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
          cellStyle: (value, _row, column) =>
            column === 0 ? cyan(value) : value,
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
            column === 0 ? dim(value) : value,
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
            if (column === 0) return cyan(value);
            if (column === 2) return dim(value);
            return value;
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
          report.dependencies.checked ? 'green' : 'dim',
        ],
        ['Current', number.format(currentCount)],
        [
          'Needs attention',
          number.format(report.dependencies.outdatedCount),
          report.dependencies.outdatedCount > 0 ? 'yellow' : null,
        ],
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
            if (column === 2) return dim(value);
            if (column === 3 && value === 'not installed') return red(value);
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
            ? `${dominant[0]}, ${percent.format(dominant[1].nonEmpty / Math.max(1, report.loc.nonEmpty))}`
            : '-',
          dominant ? null : 'dim',
        ],
        [
          'Skipped large files',
          number.format(report.loc.skippedLargeFiles),
          report.loc.skippedLargeFiles > 0 ? 'yellow' : null,
        ],
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
        cellStyle: (value, _row, column) =>
          column === 0 ? cyan(value) : value,
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
        ['First active date', earliestDay ?? '-', earliestDay ? 'blue' : 'dim'],
        ['Branch', report.git.branch ?? '-', report.git.branch ? null : 'dim'],
        ['Remote', report.git.remote ?? '-', 'dim'],
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
        ['Additions', signed(report.git.additions), 'green'],
        ['Deletions', `-${number.format(report.git.deletions)}`, 'red'],
        ['Net change', netValue(report.git.additions, report.git.deletions)],
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
        ['Peak day', peakLabel(peakDay), peakDay ? 'blue' : 'dim'],
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
      `Showing ${number.format(report.git.contributors.length)} of ${number.format(report.git.contributorsCount)}, sorted by commits`,
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
            ? `${topContributor.name} (${number.format(topContributor.commits)} commits)`
            : '-',
          topContributor ? null : 'dim',
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
        signed(item.additions),
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
          if (column === 4 || column === 5) return blue(value);
          if (column === 6) return green(value);
          if (column === 7) return red(value);
          return value;
        },
      },
    ),
  ].join('\n');
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
      signed(item.additions),
      `-${number.format(item.deletions)}`,
      signed(item.additions - item.deletions),
    ]);
}

function activityCellStyle(
  value: string,
  _rowIndex: number,
  columnIndex: number,
  range: boolean,
): string {
  // Daily rows: date, commits, added, deleted, net.
  // Weekly and monthly rows: period, start, end, commits, added, deleted, net.
  const dateColumns = range ? [1, 2] : [0];
  const periodColumn = range ? 0 : null;
  const addedColumn = range ? 4 : 2;
  const deletedColumn = range ? 5 : 3;
  const netColumn = range ? 6 : 4;

  if (periodColumn !== null && columnIndex === periodColumn) return cyan(value);
  if (dateColumns.includes(columnIndex)) return blue(value);
  if (columnIndex === addedColumn) return green(value);
  if (columnIndex === deletedColumn) return red(value);
  if (columnIndex === netColumn)
    return value.startsWith('-') ? red(value) : green(value);
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
  const subtitle =
    items.length === 1
      ? '1 active period, newest first'
      : `${number.format(items.length)} active periods, newest first`;

  return [
    section(heading, subtitle),
    renderMetrics(
      [
        ['Active periods', number.format(items.length)],
        ['Total commits', number.format(totals.commits)],
        [
          'Average commits / active period',
          decimal.format(totals.commits / Math.max(1, items.length)),
        ],
        ['Busiest period', peakLabel(peak), peak ? null : 'dim'],
        ['Added lines', signed(totals.additions), 'green'],
        ['Deleted lines', `-${number.format(totals.deletions)}`, 'red'],
        ['Net change', netValue(totals.additions, totals.deletions)],
      ],
      maxWidth,
    ),
    '',
    renderTable(activityRows(items, range), headers, {
      align,
      maxWidth,
      cellStyle: (value, rowIndex, columnIndex) =>
        activityCellStyle(value, rowIndex, columnIndex, range),
    }),
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
