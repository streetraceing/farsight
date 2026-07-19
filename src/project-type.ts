import { access } from 'node:fs/promises';
import path from 'node:path';
import type { LocReport, PackageJson, ProjectReport } from './types.js';

async function exists(root: string, relativePath: string): Promise<boolean> {
  try {
    await access(path.join(root, relativePath));
    return true;
  } catch {
    return false;
  }
}

function dependencySet(pkg: PackageJson | null): Set<string> {
  return new Set([
    ...Object.keys(pkg?.dependencies ?? {}),
    ...Object.keys(pkg?.devDependencies ?? {}),
    ...Object.keys(pkg?.peerDependencies ?? {}),
    ...Object.keys(pkg?.optionalDependencies ?? {}),
  ]);
}

function hasAny(deps: ReadonlySet<string>, names: readonly string[]): boolean {
  return names.some((name) => deps.has(name));
}

export async function detectProjectType(
  root: string,
  pkg: PackageJson | null,
  loc: LocReport,
): Promise<ProjectReport> {
  const deps = dependencySet(pkg);
  const traits: string[] = [];

  const packageManager = await (async (): Promise<string | null> => {
    if (await exists(root, 'pnpm-lock.yaml')) return 'pnpm';
    if (await exists(root, 'yarn.lock')) return 'yarn';
    if (await exists(root, 'bun.lockb') || await exists(root, 'bun.lock')) return 'bun';
    if (await exists(root, 'package-lock.json') || await exists(root, 'npm-shrinkwrap.json')) return 'npm';
    return pkg ? 'unknown' : null;
  })();

  const isMonorepo = Boolean(pkg?.workspaces)
    || await exists(root, 'pnpm-workspace.yaml')
    || hasAny(deps, ['turbo', 'nx', 'lerna']);
  if (isMonorepo) traits.push('monorepo');

  const hasTypeScript = deps.has('typescript')
    || await exists(root, 'tsconfig.json')
    || Object.keys(loc.byExtension).some((extension) => ['.ts', '.tsx', '.mts', '.cts'].includes(extension));
  if (hasTypeScript) traits.push('TypeScript');

  let primary = 'Unknown project';

  if (deps.has('next')) primary = 'Next.js application';
  else if (deps.has('nuxt')) primary = 'Nuxt application';
  else if (deps.has('@sveltejs/kit')) primary = 'SvelteKit application';
  else if (deps.has('@angular/core')) primary = 'Angular application';
  else if (deps.has('astro')) primary = 'Astro application';
  else if (deps.has('expo')) primary = 'Expo / React Native application';
  else if (deps.has('react-native')) primary = 'React Native application';
  else if (deps.has('electron')) primary = 'Electron desktop application';
  else if (deps.has('@nestjs/core')) primary = 'NestJS backend';
  else if (hasAny(deps, ['express', 'fastify', 'koa', 'hapi', '@hapi/hapi', 'hono'])) primary = 'Node.js backend';
  else if (deps.has('react') && deps.has('vite')) primary = 'React + Vite frontend';
  else if (deps.has('vue') && deps.has('vite')) primary = 'Vue + Vite frontend';
  else if (deps.has('svelte')) primary = 'Svelte frontend';
  else if (deps.has('react')) primary = 'React frontend/library';
  else if (deps.has('vue')) primary = 'Vue frontend/library';
  else if (deps.has('vite')) primary = 'Vite application/library';
  else if (pkg?.bin) primary = 'Node.js CLI package';
  else if (pkg) primary = 'Node.js package/application';
  else if (loc.files > 0) primary = 'Source-code project';

  if (hasAny(deps, ['vitest', 'jest', 'mocha', 'ava'])) traits.push('unit tests');
  if (hasAny(deps, ['playwright', '@playwright/test', 'cypress'])) traits.push('end-to-end tests');
  if (deps.has('storybook') || deps.has('@storybook/react') || deps.has('@storybook/vue3')) traits.push('Storybook');
  if (pkg?.private) traits.push('private package');

  const languages = Object.entries(loc.byExtension)
    .slice(0, 5)
    .map(([extension, stats]) => ({ extension, nonEmptyLines: stats.nonEmpty }));

  return {
    primary: isMonorepo ? `Monorepo: ${primary}` : primary,
    packageManager,
    traits,
    languages,
  };
}
