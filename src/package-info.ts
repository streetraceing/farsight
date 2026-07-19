import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { DirectDependency, DependencyKind, PackageJson } from './types.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((item) => typeof item === 'string');
}

function parsePackageJson(raw: string): PackageJson {
  const parsed: unknown = JSON.parse(raw);
  if (!isRecord(parsed)) throw new Error('package.json must contain a JSON object');

  for (const key of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
    const value = parsed[key];
    if (value !== undefined && !isStringRecord(value)) {
      throw new Error(`package.json field "${key}" must be an object of string versions`);
    }
  }

  return parsed as PackageJson;
}

export async function readPackageInfo(root: string): Promise<PackageJson | null> {
  try {
    const raw = await readFile(path.join(root, 'package.json'), 'utf8');
    return parsePackageJson(raw);
  } catch (error: unknown) {
    if (isNodeError(error) && error.code === 'ENOENT') return null;
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid package.json: ${error.message}`);
    }
    throw error;
  }
}

export function directDependencies(pkg: PackageJson | null): DirectDependency[] {
  if (!pkg) return [];

  const groups: Array<[DependencyKind, Record<string, string> | undefined]> = [
    ['dependency', pkg.dependencies],
    ['devDependency', pkg.devDependencies],
    ['peerDependency', pkg.peerDependencies],
    ['optionalDependency', pkg.optionalDependencies],
  ];

  const byName = new Map<string, DirectDependency>();
  for (const [type, values] of groups) {
    for (const [name, declared] of Object.entries(values ?? {})) {
      const previous = byName.get(name);
      byName.set(name, {
        name,
        declared,
        type: previous ? `${previous.type},${type}` : type,
      });
    }
  }

  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}
