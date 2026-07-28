import { emitKeypressEvents, type Key } from 'node:readline';
import type { FarsightReport } from './types.js';
import { createReportViews, renderStyle } from './render.js';

interface InteractiveOptions {
  reload: () => Promise<FarsightReport>;
}

const CLEAR_SCREEN = '\x1b[2J\x1b[H';
const ALT_SCREEN_ON = '\x1b[?1049h';
const ALT_SCREEN_OFF = '\x1b[?1049l';
const HIDE_CURSOR = '\x1b[?25l';
const SHOW_CURSOR = '\x1b[?25h';

function stripAnsi(value: string): string {
  return value.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '');
}

function fitLine(value: string, width: number): string {
  const plain = stripAnsi(value);
  if (plain.length <= width) return value;
  if (width <= 1) return '…'.slice(0, width);
  return `${plain.slice(0, width - 1)}…`;
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

    const tabLabels = views.map((view, index) => {
      const shortcut = index < 9 ? `${index + 1}` : '0';
      const label = `${shortcut}:${view.title}`;
      return index === activeIndex
        ? renderStyle.bold(renderStyle.cyan(`[${label}]`))
        : renderStyle.dim(label);
    });
    const tabs = fitLine(tabLabels.join('  '), width);
    const help = renderStyle.dim(
      '←/→ tabs  ↑/↓ scroll  PgUp/PgDn  1-9 jump  r refresh  q/Esc quit',
    );
    const contentLines = active.content.split('\n');
    const viewportHeight = Math.max(1, height - 4);
    const maxOffset = Math.max(0, contentLines.length - viewportHeight);
    scrollOffset = Math.max(0, Math.min(scrollOffset, maxOffset));
    const visible = contentLines
      .slice(scrollOffset, scrollOffset + viewportHeight)
      .map((line) => fitLine(line, width));
    while (visible.length < viewportHeight) visible.push('');

    const position = `${scrollOffset + 1}-${Math.min(contentLines.length, scrollOffset + viewportHeight)} / ${contentLines.length}`;
    const footer = refreshing
      ? renderStyle.yellow('Refreshing analysis…')
      : status
        ? renderStyle.green(status)
        : `${help}  ${renderStyle.dim(position)}`;

    output.write(
      `${CLEAR_SCREEN}${tabs}\n${'─'.repeat(Math.min(width, 160))}\n${visible.join('\n')}\n${fitLine(footer, width)}`,
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
    const page = Math.max(1, height - 6);

    if (key.name === 'right' || key.name === 'tab') changeTab(1);
    else if (key.name === 'left') changeTab(-1);
    else if (key.name === 'up') scrollOffset -= 1;
    else if (key.name === 'down') scrollOffset += 1;
    else if (key.name === 'pageup') scrollOffset -= page;
    else if (key.name === 'pagedown') scrollOffset += page;
    else if (key.name === 'home') scrollOffset = 0;
    else if (key.name === 'end') scrollOffset = Number.MAX_SAFE_INTEGER;
    else if (/^[1-9]$/.test(character)) {
      const requested = Number(character) - 1;
      const count = createReportViews(report).length;
      if (requested < count) {
        activeIndex = requested;
        scrollOffset = 0;
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
