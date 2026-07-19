import assert from 'node:assert/strict';
import test from 'node:test';
import { parseGitLog } from '../src/git.js';

test('parseGitLog aggregates contributors and numstat', () => {
  const sample = [
    '@@@a1\x1fAlice\x1falice@example.com\x1f2026-07-01',
    '10\t2\tsrc/a.ts',
    '@@@b2\x1fBob\x1fbob@example.com\x1f2026-07-02',
    '5\t1\tsrc/b.ts',
    '@@@c3\x1fAlice\x1falice@example.com\x1f2026-07-02',
    '3\t4\tsrc/c.ts',
  ].join('\n');

  const report = parseGitLog(sample);
  assert.equal(report.commits, 3);
  assert.equal(report.activeDays, 2);
  assert.equal(report.additions, 18);
  assert.equal(report.deletions, 7);
  assert.equal(report.contributorsCount, 2);
  assert.equal(report.contributors[0]?.name, 'Alice');
  assert.equal(report.contributors[0]?.commits, 2);
});
