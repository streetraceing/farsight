#!/usr/bin/env node
import { main } from '../src/cli.js';

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`farsight: ${message}`);
  process.exitCode = 1;
});
