import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyDependency } from '../src/dependencies.js';

test('classifyDependency reports not-installed packages as unknown', () => {
  assert.equal(
    classifyDependency({ current: null, wanted: '1.2.0', latest: '1.3.0' }),
    'unknown',
  );
  assert.equal(
    classifyDependency({ current: '1.0.0', wanted: null, latest: null }),
    'unknown',
  );
});

test('classifyDependency distinguishes in-range and breaking updates', () => {
  assert.equal(
    classifyDependency({ current: '1.0.0', wanted: '1.2.0', latest: '1.2.0' }),
    'update-within-range',
  );
  assert.equal(
    classifyDependency({ current: '1.0.0', wanted: '1.0.0', latest: '2.0.0' }),
    'newer-outside-range',
  );
  assert.equal(
    classifyDependency({ current: '1.0.0', wanted: null, latest: '2.0.0' }),
    'outdated',
  );
  assert.equal(
    classifyDependency({ current: '2.0.0', wanted: '2.0.0', latest: '2.0.0' }),
    'latest',
  );
});
