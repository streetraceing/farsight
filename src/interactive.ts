import { emitKeypressEvents, type Key } from 'node:readline';
import type { FarsightReport } from './types.js';
import {
  createReportViews,
  renderStyle,
  stripAnsi,
  type ReportView,
} from './render.js';

interface InteractiveOptions {
  reload: () => Promise<FarsightReport>;
}

const CLEAR_SCREEN = '\x1b[2J\x1b[H';
const ALT_SCREEN_ON = '\x1b[?1049h';
const ALT_SCREEN_OFF = '\x1b[?1049l';
const HIDE_CURSOR = '\x1b[?25l';
const SHOW_CURSOR = '\x1b[?25h';

function fitLine(value: string, width: number): string {
  const plain = stripAnsi(value);
  if (plain.length <= width) return value;
  if (width <= 1) return '…'.slice(0, width);
  return `${plain.slice(0, width - 1)}…`;
}

function shortcutFor(index: number): string {
  if (index < 9) return String(index + 1);
  if (index === 9) return '0';
  return '·';
}

export function renderTabBar(
  views: readonly Pick<ReportView, 'title'>[],
  activeIndex: number,
  width: number,
): string {
  const labels = views.map((view, index) => {
    // Every tab keeps the same visible brackets in active and inactive states.
    // Selection is represented only through ANSI styling, so switching tabs
    // cannot shift the rest of the header horizontally.
    const label = `[${shortcutFor(index)}:${view.title}]`;
    return index === activeIndex
      ? renderStyle.inverse(renderStyle.bold(renderStyle.cyan(label)))
      : renderStyle.dim(label);
  });
  return fitLine(labels.join(' '), width);
}

function dependencyState(report: FarsightReport): string {
  if (!report.dependencies.available) return 'deps unavailable';
  if (!report.dependencies.checked) return 'deps not checked';
  if (report.dependencies.outdatedCount === 0) return 'deps current';
  return `${report.dependencies.outdatedCount} dependency updates`;
}

export function renderInteractiveContext(
  report: FarsightReport,
  width: number,
): readonly [string, string] {
  const framework = report.project.framework
    ? ` · ${report.project.framework}`
    : '';
  const projectLine = [
    renderStyle.bold(renderStyle.magenta(report.project.primary)),
    renderStyle.blue(report.project.ecosystem),
    `${renderStyle.cyan('kind')} ${report.project.kind}`,
    `${renderStyle.cyan('confidence')} ${
      report.project.confidence === 'high'
        ? renderStyle.green('high')
        : report.project.confidence === 'medium'
          ? renderStyle.yellow('medium')
          : renderStyle.red('low')
    }${framework}`,
  ].join('  ·  ');

  const git = report.git.available
    ? `${renderStyle.cyan(report.git.branch ?? 'detached')} · ${renderStyle.yellow(report.git.commits)} commits · ${renderStyle.magenta(report.git.contributorsCount)} contributors`
    : renderStyle.dim('Git unavailable');
  const statsLine = [
    `${renderStyle.green(report.loc.nonEmpty)} non-empty lines`,
    `${renderStyle.yellow(report.loc.files)} source files`,
    dependencyState(report),
    git,
  ].join('  ·  ');

  return [fitLine(projectLine, width), fitLine(statsLine, width)];
}

export async function runInteractive(
  initialReport: FarsightReport,
  { reload }: InteractiveOptions,
): Promise<void> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error('--interactive requires an interactive terminal');
  }

  const input = process.stdin;
  const output = process.stdout;
  let report = initialReport;
  let activeIndex = 0;
  let scrollOffset = 0;
  let refreshing = false;
  let status = '';
  let closed = false;

  emitKeypressEvents(input);
  input.setRawMode(true);
  input.resume();
  output.write(`${ALT_SCREEN_ON}${HIDE_CURSOR}`);

  const render = (): void => {
    const width = Math.max(40, output.columns || 100);
    const height = Math.max(12, output.rows || 30);
    const views = createReportViews(report, Math.max(40, width - 2));
    activeIndex = Math.min(activeIndex, Math.max(0, views.length - 1));
    const active = views[activeIndex];
    if (!active) return;

    const tabs = renderTabBar(views, activeIndex, width);
    const [projectLine, statsLine] = renderInteractiveContext(report, width);
    const help = renderStyle.dim(
      '←/→/Tab sections  ↑/↓ scroll  PgUp/PgDn  1-9/0 jump  r refresh  q/Esc quit',
    );
    const contentLines = active.content.split('\n');
    const viewportHeight = Math.max(1, height - 5);
    const maxOffset = Math.max(0, contentLines.length - viewportHeight);
    scrollOffset = Math.max(0, Math.min(scrollOffset, maxOffset));
    const visible = contentLines
      .slice(scrollOffset, scrollOffset + viewportHeight)
      .map((line) => fitLine(line, width));
    while (visible.length < viewportHeight) visible.push('');

    const position = `${scrollOffset + 1}-${Math.min(
      contentLines.length,
      scrollOffset + viewportHeight,
    )} / ${contentLines.length}`;
    const footer = refreshing
      ? renderStyle.yellow('Refreshing analysis…')
      : status
        ? renderStyle.green(status)
        : `${help}  ${renderStyle.dim(position)}`;

    output.write(
      `${CLEAR_SCREEN}${tabs}\n${projectLine}\n${statsLine}\n${renderStyle.dim(
        renderStyle.cyan('─'.repeat(Math.min(width, 160))),
      )}\n${visible.join('\n')}\n${fitLine(footer, width)}`,
    );
  };

  const cleanup = (): void => {
    if (closed) return;
    closed = true;
    input.off('keypress', onKeypress);
    output.off('resize', render);
    input.setRawMode(false);
    input.pause();
    output.write(`${SHOW_CURSOR}${ALT_SCREEN_OFF}`);
  };

  let resolveDone: (() => void) | undefined;
  const done = new Promise<void>((resolve) => {
    resolveDone = resolve;
  });

  const close = (): void => {
    cleanup();
    resolveDone?.();
  };

  const changeTab = (delta: number): void => {
    const count = createReportViews(report).length;
    activeIndex = (activeIndex + delta + count) % count;
    scrollOffset = 0;
    status = '';
  };

  const onKeypress = async (character: string, key: Key): Promise<void> => {
    if (closed) return;
    if (
      (key.ctrl && key.name === 'c') ||
      key.name === 'escape' ||
      character === 'q'
    ) {
      close();
      return;
    }

    const height = Math.max(12, output.rows || 30);
    const page = Math.max(1, height - 7);

    if (key.name === 'right' || key.name === 'tab') changeTab(1);
    else if (key.name === 'left') changeTab(-1);
    else if (key.name === 'up') scrollOffset -= 1;
    else if (key.name === 'down') scrollOffset += 1;
    else if (key.name === 'pageup') scrollOffset -= page;
    else if (key.name === 'pagedown') scrollOffset += page;
    else if (key.name === 'home') scrollOffset = 0;
    else if (key.name === 'end') scrollOffset = Number.MAX_SAFE_INTEGER;
    else if (/^[0-9]$/.test(character)) {
      const requested = character === '0' ? 9 : Number(character) - 1;
      const count = createReportViews(report).length;
      if (requested < count) {
        activeIndex = requested;
        scrollOffset = 0;
        status = '';
      }
    } else if (character === 'r' && !refreshing) {
      refreshing = true;
      status = '';
      render();
      try {
        report = await reload();
        scrollOffset = 0;
        status = 'Analysis refreshed';
      } catch (error: unknown) {
        status = error instanceof Error ? error.message : String(error);
      } finally {
        refreshing = false;
      }
    }

    render();
  };

  input.on('keypress', onKeypress);
  output.on('resize', render);
  render();

  try {
    await done;
  } finally {
    cleanup();
  }
}
