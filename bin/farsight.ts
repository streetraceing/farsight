#!/usr/bin/env node
import { CliUsageError, main } from '../src/cli.js';

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`farsight: ${message}`);
  if (error instanceof CliUsageError)
    console.error("Run 'farsight --help' to see the available options.");
  process.exitCode = 1;
});
