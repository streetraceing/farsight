import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import type { ExtensionStats, LocReport } from './types.js';

export const SOURCE_EXTENSIONS: ReadonlySet<string> = new Set([
  '.js', '.jsx', '.mjs', '.cjs',
  '.ts', '.tsx', '.mts', '.cts',
  '.vue', '.svelte', '.astro',
  '.py', '.rb', '.php', '.go', '.rs', '.java', '.kt', '.kts',
  '.c', '.h', '.cc', '.cpp', '.hpp', '.cs', '.swift',
  '.css', '.scss', '.sass', '.less',
  '.html', '.htm', '.sql', '.graphql', '.gql',
  '.sh', '.bash', '.zsh', '.fish', '.ps1',
]);

export const IGNORED_DIRECTORIES: ReadonlySet<string> = new Set([
  '.git', '.hg', '.svn',
  'node_modules', 'vendor',
  'dist', 'build', 'out', 'coverage',
  '.next', '.nuxt', '.svelte-kit', '.astro',
  '.turbo', '.cache', '.parcel-cache',
  'target', 'obj',
]);

export interface CountTextResult {
  lines: number;
  nonEmpty: number;
}

export interface AnalyzeLocOptions {
  maxFileBytes?: number;
  ignoredDirectories?: ReadonlySet<string>;
  sourceExtensions?: ReadonlySet<string>;
}

export function countText(text: string): CountTextResult {
  if (text.length === 0) return { lines: 0, nonEmpty: 0 };
  const lines = text.split(/\r?\n/);
  if (lines.at(-1) === '') lines.pop();
  return {
    lines: lines.length,
    nonEmpty: lines.reduce((sum, line) => sum + (line.trim() ? 1 : 0), 0),
  };
}

export async function analyzeLoc(
  root: string,
  options: AnalyzeLocOptions = {},
): Promise<LocReport> {
  const {
    maxFileBytes = 2 * 1024 * 1024,
    ignoredDirectories = IGNORED_DIRECTORIES,
    sourceExtensions = SOURCE_EXTENSIONS,
  } = options;

  const totals: LocReport = {
    files: 0,
    lines: 0,
    nonEmpty: 0,
    skippedLargeFiles: 0,
    byExtension: {},
  };

  async function visit(directory: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error: unknown) {
      if (isNodeError(error) && (error.code === 'EACCES' || error.code === 'EPERM')) return;
      throw error;
    }

    for (const entry of entries) {
      const fullPath = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        if (!ignoredDirectories.has(entry.name)) await visit(fullPath);
        continue;
      }

      if (!entry.isFile()) continue;
      const extension = path.extname(entry.name).toLowerCase();
      if (!sourceExtensions.has(extension)) continue;

      const metadata = await stat(fullPath);
      if (metadata.size > maxFileBytes) {
        totals.skippedLargeFiles += 1;
        continue;
      }

      const text = await readFile(fullPath, 'utf8');
      if (text.includes('\u0000')) continue;
      const counted = countText(text);

      totals.files += 1;
      totals.lines += counted.lines;
      totals.nonEmpty += counted.nonEmpty;
      const bucket: ExtensionStats = totals.byExtension[extension] ?? {
        files: 0,
        lines: 0,
        nonEmpty: 0,
      };
      bucket.files += 1;
      bucket.lines += counted.lines;
      bucket.nonEmpty += counted.nonEmpty;
      totals.byExtension[extension] = bucket;
    }
  }

  await visit(root);
  totals.byExtension = Object.fromEntries(
    Object.entries(totals.byExtension).sort((a, b) => b[1].nonEmpty - a[1].nonEmpty),
  );
  return totals;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}
