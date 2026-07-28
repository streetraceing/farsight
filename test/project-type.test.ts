import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { detectProjectType } from '../src/project-type.js';
import type { LocReport, PackageJson } from '../src/types.js';

function loc(byExtension: LocReport['byExtension']): LocReport {
  const values = Object.values(byExtension);
  return {
    files: values.reduce((sum, item) => sum + item.files, 0),
    lines: values.reduce((sum, item) => sum + item.lines, 0),
    nonEmpty: values.reduce((sum, item) => sum + item.nonEmpty, 0),
    skippedLargeFiles: 0,
    byExtension,
  };
}

async function writeProjectFile(
  root: string,
  relativePath: string,
  content = '',
): Promise<void> {
  const target = path.join(root, relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content);
}

async function withProject(
  files: Record<string, string>,
  pkg: PackageJson | null,
  source: LocReport,
  assertion: (
    result: Awaited<ReturnType<typeof detectProjectType>>,
  ) => void | Promise<void>,
): Promise<void> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'farsight-project-'));
  try {
    for (const [relativePath, content] of Object.entries(files)) {
      await writeProjectFile(root, relativePath, content);
    }
    assertion(await detectProjectType(root, pkg, source));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test('detects a TypeScript Next.js project', async () => {
  await withProject(
    {
      'package.json': '{}',
      'package-lock.json': '{}',
      'tsconfig.json': '{}',
    },
    {
      dependencies: { next: '^15.0.0', react: '^19.0.0' },
      devDependencies: { typescript: '^5.0.0' },
    },
    loc({ '.tsx': { files: 1, lines: 10, nonEmpty: 10 } }),
    (result) => {
      assert.equal(result.primary, 'Next.js application');
      assert.equal(result.ecosystem, 'JavaScript / Node.js');
      assert.equal(result.framework, 'Next.js');
      assert.equal(result.packageManager, 'npm');
      assert.equal(result.confidence, 'high');
      assert.ok(result.traits.includes('TypeScript'));
      assert.ok(result.signals.some((signal) => signal.label === 'Framework'));
    },
  );
});

test('detects a mixed Tauri desktop application', async () => {
  await withProject(
    {
      'package.json': '{}',
      'pnpm-lock.yaml': '',
      'src-tauri/tauri.conf.json': '{}',
      'src-tauri/Cargo.toml': '[dependencies]\ntauri = "2"\n',
      'src-tauri/src/main.rs': 'fn main() {}',
    },
    {
      dependencies: { '@tauri-apps/api': '^2.0.0', react: '^19.0.0' },
      devDependencies: { '@tauri-apps/cli': '^2.0.0' },
    },
    loc({
      '.tsx': { files: 4, lines: 200, nonEmpty: 160 },
      '.rs': { files: 2, lines: 80, nonEmpty: 60 },
    }),
    (result) => {
      assert.equal(result.primary, 'Tauri desktop application');
      assert.equal(result.ecosystem, 'Rust + JavaScript');
      assert.equal(result.framework, 'Tauri');
      assert.equal(result.kind, 'desktop application');
      assert.equal(result.packageManager, 'pnpm + Cargo');
      assert.ok(result.detectedFiles.includes('src-tauri/tauri.conf.json'));
    },
  );
});

test('detects a pure Rust CLI application', async () => {
  await withProject(
    {
      'Cargo.toml': '[package]\nname = "demo"\n[dependencies]\nclap = "4"\n',
      'Cargo.lock': '',
      'src/main.rs': 'fn main() {}',
    },
    null,
    loc({ '.rs': { files: 2, lines: 100, nonEmpty: 80 } }),
    (result) => {
      assert.equal(result.primary, 'Rust CLI application');
      assert.equal(result.ecosystem, 'Rust');
      assert.equal(result.packageManager, 'Cargo');
      assert.equal(result.kind, 'command-line application');
      assert.equal(result.confidence, 'high');
    },
  );
});

test('detects an ASP.NET Core C# project', async () => {
  await withProject(
    {
      'Sample.sln': '',
      'src/Sample/Sample.csproj':
        '<Project Sdk="Microsoft.NET.Sdk.Web"><PropertyGroup><TargetFramework>net9.0</TargetFramework></PropertyGroup></Project>',
      'src/Sample/Program.cs': 'var app = WebApplication.CreateBuilder(args);',
    },
    null,
    loc({ '.cs': { files: 5, lines: 200, nonEmpty: 170 } }),
    (result) => {
      assert.equal(result.primary, 'ASP.NET Core application');
      assert.equal(result.ecosystem, 'Microsoft .NET');
      assert.equal(result.framework, 'ASP.NET Core');
      assert.equal(result.packageManager, '.NET SDK / NuGet');
      assert.ok(result.traits.includes('workspace / monorepo'));
    },
  );
});

test('detects Python and Go toolchains from native manifests', async () => {
  await withProject(
    {
      'pyproject.toml': '[project]\nname = "api"\ndependencies = ["fastapi"]\n',
      'uv.lock': '',
      'app/main.py': 'from fastapi import FastAPI',
    },
    null,
    loc({ '.py': { files: 3, lines: 90, nonEmpty: 72 } }),
    (result) => {
      assert.equal(result.primary, 'FastAPI backend');
      assert.equal(result.packageManager, 'uv');
      assert.equal(result.framework, 'FastAPI');
    },
  );

  await withProject(
    {
      'go.mod': 'module example.com/tool\n',
      'cmd/tool/main.go': 'package main',
    },
    null,
    loc({ '.go': { files: 3, lines: 120, nonEmpty: 100 } }),
    (result) => {
      assert.equal(result.primary, 'Go application / CLI');
      assert.equal(result.ecosystem, 'Go');
      assert.equal(result.packageManager, 'Go modules');
    },
  );
});
