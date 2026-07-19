import { directDependencies } from './package-info.js';
import { run } from './process.js';
import type {
  DependencyItem,
  DependencyReport,
  DependencyStatus,
  PackageJson,
} from './types.js';

interface DependencyOptions {
  network?: boolean;
}

interface NamedOutdatedRecord extends Record<string, unknown> {
  name: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function flattenOutdated(raw: unknown): NamedOutdatedRecord[] {
  const items: NamedOutdatedRecord[] = [];
  if (!isRecord(raw)) return items;

  for (const [name, value] of Object.entries(raw)) {
    const records = Array.isArray(value) ? value : [value];
    for (const record of records) {
      if (!isRecord(record)) continue;
      items.push({ name, ...record });
    }
  }
  return items;
}

export function classifyDependency(
  item: Pick<DependencyItem, 'current' | 'wanted' | 'latest'>,
): DependencyStatus {
  if (!item.latest) return 'unknown';
  if (item.current && item.wanted && item.current !== item.wanted) return 'update-within-range';
  if (item.wanted && item.latest && item.wanted !== item.latest) return 'newer-outside-range';
  if (item.current && item.latest && item.current !== item.latest) return 'outdated';
  return 'latest';
}

export async function analyzeDependencies(
  root: string,
  pkg: PackageJson | null,
  { network = true }: DependencyOptions = {},
): Promise<DependencyReport> {
  const declared = directDependencies(pkg);
  const base: DependencyReport = {
    available: Boolean(pkg),
    checked: false,
    totalDeclared: declared.length,
    outdatedCount: 0,
    items: [],
    warning: null,
  };

  if (!pkg) return { ...base, warning: 'package.json not found' };
  if (!network) return { ...base, warning: 'network check disabled' };

  try {
    const result = await run(
      process.platform === 'win32' ? 'npm.cmd' : 'npm',
      ['outdated', '--json', '--long', '--depth=0'],
      {
        cwd: root,
        allowExitCodes: [0, 1],
        env: {
          ...process.env,
          NO_COLOR: '1',
          npm_config_color: 'false',
          npm_config_progress: 'false',
        },
      },
    );

    const text = result.stdout.trim();
    const parsed: unknown = text ? JSON.parse(text) : {};
    const declaredByName = new Map(declared.map((item) => [item.name, item]));
    const items = flattenOutdated(parsed)
      .map((item): DependencyItem => {
        const declaration = declaredByName.get(item.name);
        const normalized: Omit<DependencyItem, 'status'> = {
          name: item.name,
          declared: declaration?.declared ?? null,
          type: stringOrNull(item.type) ?? declaration?.type ?? null,
          current: stringOrNull(item.current),
          wanted: stringOrNull(item.wanted),
          latest: stringOrNull(item.latest),
          location: stringOrNull(item.location),
          homepage: stringOrNull(item.homepage),
        };
        return { ...normalized, status: classifyDependency(normalized) };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    return {
      ...base,
      checked: true,
      outdatedCount: items.length,
      items,
      warning: result.stderr.trim() || null,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ...base,
      warning: `dependency check failed: ${message}`,
    };
  }
}
