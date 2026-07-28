import assert from 'node:assert/strict';
import test from 'node:test';
import { createReportViews, renderReport } from '../src/render.js';
import type { FarsightReport, GitPeriodStats } from '../src/types.js';

function period(day: number): GitPeriodStats {
  const date = `2026-07-${String(day).padStart(2, '0')}`;
  return {
    period: date,
    startDate: date,
    endDate: date,
    commits: day,
    additions: day * 10,
    deletions: day,
  };
}

function report(): FarsightReport {
  return {
    schemaVersion: 1,
    generatedAt: '2026-07-28T12:00:00.000Z',
    root: '/tmp/project',
    package: { name: 'sample', version: '1.0.0', private: false },
    project: {
      primary: 'Node.js CLI package',
      packageManager: 'npm',
      traits: ['TypeScript'],
      languages: [{ extension: '.ts', nonEmptyLines: 100 }],
    },
    dependencies: {
      available: true,
      checked: true,
      totalDeclared: 1,
      outdatedCount: 0,
      items: [],
      warning: null,
    },
    loc: {
      files: 2,
      lines: 120,
      nonEmpty: 100,
      skippedLargeFiles: 0,
      byExtension: { '.ts': { files: 2, lines: 120, nonEmpty: 100 } },
    },
    git: {
      available: true,
      reason: null,
      branch: 'main',
      remote: null,
      lastCommitAt: '2026-07-28T10:00:00.000Z',
      periodDays: 90,
      commits: 120,
      activeDays: 15,
      contributorsCount: 1,
      additions: 1200,
      deletions: 120,
      topContributorShare: 1,
      contributors: [
        {
          name: 'Alice',
          email: 'alice@example.com',
          commits: 120,
          activeDays: 15,
          additions: 1200,
          deletions: 120,
          firstCommitAt: '2026-07-01',
          lastCommitAt: '2026-07-15',
        },
      ],
      daily: Array.from({ length: 15 }, (_, index) => period(index + 1)),
      weekly: [
        {
          period: '2026-W27',
          startDate: '2026-06-29',
          endDate: '2026-07-05',
          commits: 10,
          additions: 100,
          deletions: 10,
        },
      ],
      monthly: [
        {
          period: '2026-07',
          startDate: '2026-07-01',
          endDate: '2026-07-31',
          commits: 120,
          additions: 1200,
          deletions: 120,
        },
      ],
    },
  };
}

test('renderReport includes every active day and weekly boundaries', () => {
  const output = renderReport(report());
  assert.match(output, /2026-07-01/);
  assert.match(output, /2026-07-15/);
  assert.match(output, /2026-W27/);
  assert.match(output, /2026-06-29/);
  assert.match(output, /2026-07-05/);
});

test('createReportViews exposes keyboard-friendly report sections', () => {
  const views = createReportViews(report(), 100);
  assert.deepEqual(
    views.map((view) => view.id),
    [
      'overview',
      'project',
      'dependencies',
      'code',
      'git',
      'contributors',
      'daily',
      'weekly',
      'monthly',
    ],
  );
});
