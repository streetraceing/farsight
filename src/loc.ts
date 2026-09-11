import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import type { ExtensionStats, LocReport } from './types.js';

export const SOURCE_EXTENSIONS: ReadonlySet<string> = new Set([
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
  '.vue',
  '.svelte',
  '.astro',
  '.py',
  '.rb',
  '.php',
  '.go',
  '.rs',
  '.java',
  '.kt',
  '.kts',
  '.c',
  '.h',
  '.cc',
  '.cpp',
  '.hpp',
  '.cs',
  '.fs',
  '.fsx',
  '.vb',
  '.dart',
  '.swift',
  '.scala',
  '.groovy',
  '.lua',
  '.gd',
  '.ex',
  '.exs',
  '.erl',
  '.hrl',
  '.clj',
  '.cljs',
  '.r',
  '.css',
  '.scss',
  '.sass',
  '.less',
  '.html',
  '.htm',
  '.sql',
  '.graphql',
  '.gql',
  '.sh',
  '.bash',
  '.zsh',
  '.fish',
  '.ps1',
]);

export const IGNORED_DIRECTORIES: ReadonlySet<string> = new Set([
  '.git',
  '.hg',
  '.svn',
  'node_modules',
  'vendor',
  'dist',
  'build',
  'out',
  'coverage',
  '.next',
  '.nuxt',
  '.svelte-kit',
  '.astro',
  '.turbo',
  '.cache',
  '.parcel-cache',
  'target',
  'obj',
  '.venv',
  'venv',
  '__pycache__',
  '.gradle',
  '.dart_tool',
  '.pub-cache',
  'Pods',
  'DerivedData',
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
  const sourceFiles: string[] = [];

  async function collect(directory: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }

    const pending: Promise<void>[] = [];
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!ignoredDirectories.has(entry.name))
          pending.push(collect(path.join(directory, entry.name)));
      } else if (
        entry.isFile() &&
        sourceExtensions.has(path.extname(entry.name).toLowerCase())
      ) {
        sourceFiles.push(path.join(directory, entry.name));
      }
    }
    await Promise.all(pending);
  }

  async function measure(fullPath: string): Promise<void> {
    let metadata;
    try {
      metadata = await stat(fullPath);
    } catch {
      return;
    }
    if (metadata.size > maxFileBytes) {
      totals.skippedLargeFiles += 1;
      return;
    }

    let text: string;
    try {
      text = await readFile(fullPath, 'utf8');
    } catch {
      return;
    }
    if (text.includes('\u0000')) return;
    const counted = countText(text);

    totals.files += 1;
    totals.lines += counted.lines;
    totals.nonEmpty += counted.nonEmpty;
    const extension = path.extname(fullPath).toLowerCase();
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

  await collect(root);
  await Promise.all(sourceFiles.map(measure));

  totals.byExtension = Object.fromEntries(
    Object.entries(totals.byExtension).sort(
      (a, b) => b[1].nonEmpty - a[1].nonEmpty,
    ),
  );
  return totals;
}
