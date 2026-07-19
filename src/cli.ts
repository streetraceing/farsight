import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeDependencies } from './dependencies.js';
import { analyzeGit } from './git.js';
import { analyzeLoc } from './loc.js';
import { readPackageInfo } from './package-info.js';
import { detectProjectType } from './project-type.js';
import { renderReport } from './render.js';
import type { CliOptions, FarsightReport } from './types.js';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));

function requireValue(argv: readonly string[], index: number, option: string): string {
  const value = argv[index];
  if (!value || value.startsWith('--')) throw new Error(`${option} requires a value`);
  return value;
}

export function parseArgs(argv: readonly string[]): CliOptions {
  const options: CliOptions = {
    cwd: process.cwd(),
    sinceDays: 90,
    top: 10,
    json: false,
    network: true,
    help: false,
    version: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument) continue;

    if (argument === '--json') options.json = true;
    else if (argument === '--no-network') options.network = false;
    else if (argument === '--help' || argument === '-h') options.help = true;
    else if (argument === '--version' || argument === '-v') options.version = true;
    else if (argument === '--cwd') options.cwd = requireValue(argv, ++index, '--cwd');
    else if (argument.startsWith('--cwd=')) options.cwd = argument.slice(6);
    else if (argument === '--since') options.sinceDays = Number(requireValue(argv, ++index, '--since'));
    else if (argument.startsWith('--since=')) options.sinceDays = Number(argument.slice(8));
    else if (argument === '--top') options.top = Number(requireValue(argv, ++index, '--top'));
    else if (argument.startsWith('--top=')) options.top = Number(argument.slice(6));
    else throw new Error(`Unknown option: ${argument}`);
  }

  if (!options.cwd) throw new Error('--cwd requires a path');
  if (!Number.isInteger(options.sinceDays) || options.sinceDays < 1 || options.sinceDays > 3650) {
    throw new Error('--since must be an integer between 1 and 3650');
  }
  if (!Number.isInteger(options.top) || options.top < 1 || options.top > 100) {
    throw new Error('--top must be an integer between 1 and 100');
  }

  options.cwd = path.resolve(options.cwd);
  return options;
}

export function helpText(): string {
  return `farsight [options]\n\nAnalyze a project in the current directory.\n\nOptions:\n  --cwd <path>       analyze another directory\n  --since <days>     Git activity window (default: 90)\n  --top <count>      number of contributors to show (default: 10)\n  --json             print machine-readable JSON\n  --no-network       skip npm registry dependency check\n  -v, --version      print version\n  -h, --help         print help`;
}

async function readOwnVersion(): Promise<string> {
  const candidates = [
    path.resolve(currentDirectory, '..', 'package.json'),
    path.resolve(currentDirectory, '..', '..', 'package.json'),
  ];

  for (const packagePath of candidates) {
    try {
      const raw = await readFile(packagePath, 'utf8');
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed !== 'object' || parsed === null || !('version' in parsed)) continue;
      const version = (parsed as { version?: unknown }).version;
      if (typeof version === 'string') return version;
    } catch (error: unknown) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') continue;
      throw error;
    }
  }

  throw new Error('Unable to read Farsight version');
}

export async function analyzeProject(options: CliOptions): Promise<FarsightReport> {
  const root = options.cwd;
  const pkg = await readPackageInfo(root);
  const [loc, dependencies, git] = await Promise.all([
    analyzeLoc(root),
    analyzeDependencies(root, pkg, { network: options.network }),
    analyzeGit(root, { sinceDays: options.sinceDays, top: options.top }),
  ]);
  const project = await detectProjectType(root, pkg, loc);

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    root,
    package: pkg
      ? {
          name: pkg.name ?? null,
          version: pkg.version ?? null,
          private: Boolean(pkg.private),
        }
      : null,
    project,
    dependencies,
    loc,
    git,
  };
}

export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<void> {
  const options = parseArgs(argv);
  if (options.help) {
    console.log(helpText());
    return;
  }
  if (options.version) {
    console.log(await readOwnVersion());
    return;
  }

  const report = await analyzeProject(options);
  console.log(options.json ? JSON.stringify(report, null, 2) : renderReport(report));
}
