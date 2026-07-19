import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { analyzeLoc, countText } from '../src/loc.js';

test('countText handles trailing newline', () => {
  assert.deepEqual(countText('one\n\ntwo\n'), { lines: 3, nonEmpty: 2 });
});

test('analyzeLoc ignores node_modules and counts source files', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'farsight-loc-'));
  try {
    await mkdir(path.join(root, 'src'));
    await mkdir(path.join(root, 'node_modules'));
    await writeFile(path.join(root, 'src', 'index.ts'), 'const a = 1;\n\nexport { a };\n');
    await writeFile(path.join(root, 'src', 'style.css'), 'body {}\n');
    await writeFile(path.join(root, 'node_modules', 'ignored.ts'), 'x\ny\nz\n');
    const report = await analyzeLoc(root);
    assert.equal(report.files, 2);
    assert.equal(report.lines, 4);
    assert.equal(report.nonEmpty, 3);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
