import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { detectProjectType } from '../src/project-type.js';
import type { LocReport } from '../src/types.js';

const loc: LocReport = {
  files: 1,
  lines: 10,
  nonEmpty: 10,
  skippedLargeFiles: 0,
  byExtension: { '.tsx': { files: 1, lines: 10, nonEmpty: 10 } },
};

test('detects a TypeScript Next.js project', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'farsight-project-'));
  try {
    await writeFile(path.join(root, 'package-lock.json'), '{}');
    await writeFile(path.join(root, 'tsconfig.json'), '{}');
    const result = await detectProjectType(
      root,
      {
        dependencies: { next: '^15.0.0', react: '^19.0.0' },
        devDependencies: { typescript: '^5.0.0' },
      },
      loc,
    );
    assert.equal(result.primary, 'Next.js application');
    assert.equal(result.packageManager, 'npm');
    assert.ok(result.traits.includes('TypeScript'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
