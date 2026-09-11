import assert from 'node:assert/strict';
import test from 'node:test';
import { run } from '../src/process.js';

test('run decodes multibyte output split across chunks', async () => {
  const text = 'привет!';
  const bytes = Buffer.from(text, 'utf8');
  assert.ok(bytes.length > text.length, 'the sample must be multibyte');
  // The first write ends in the middle of a multi-byte sequence, so the
  // child must not decode chunks independently.
  const script = [
    `const b = Buffer.from('${bytes.toString('base64')}', 'base64');`,
    "require('node:fs').writeSync(1, b.subarray(0, 3));",
    "setTimeout(() => require('node:fs').writeSync(1, b.subarray(3)), 40);",
  ].join('\n');

  const result = await run(process.execPath, ['-e', script]);
  assert.equal(result.stdout, text);
});

test('run rejects an unexpected exit code and reports stderr', async () => {
  await assert.rejects(
    run(process.execPath, [
      '-e',
      'process.stderr.write("boom"); process.exit(3)',
    ]),
    /boom/,
  );
});
