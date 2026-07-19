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
  assert.deepEqual(report.daily, [
    { period: '2026-07-01', commits: 1, additions: 10, deletions: 2 },
    { period: '2026-07-02', commits: 2, additions: 8, deletions: 5 },
  ]);
  assert.equal(report.weekly.length, 1);
  assert.equal(report.weekly[0]?.commits, 3);
  assert.deepEqual(report.monthly, [
    { period: '2026-07', commits: 3, additions: 18, deletions: 7 },
  ]);
});
