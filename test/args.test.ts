import assert from 'node:assert/strict';
import test from 'node:test';
import { parseArgs } from '../src/cli.js';

test('parseArgs reads common flags', () => {
  const parsed = parseArgs([
    '--cwd=.',
    '--since=30',
    '--top',
    '5',
    '--interactive',
    '--no-network',
  ]);
  assert.equal(parsed.sinceDays, 30);
  assert.equal(parsed.top, 5);
  assert.equal(parsed.interactive, true);
  assert.equal(parsed.network, false);
});

test('parseArgs rejects invalid windows', () => {
  assert.throws(() => parseArgs(['--since=0']), /--since/);
});

test('parseArgs rejects a flag without a value', () => {
  assert.throws(() => parseArgs(['--cwd']), /requires a value/);
});

test('parseArgs rejects JSON in interactive mode', () => {
  assert.throws(
    () => parseArgs(['--json', '--interactive']),
    /cannot be used together/,
  );
});
