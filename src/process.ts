import { spawn } from 'node:child_process';

export interface RunOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  allowExitCodes?: readonly number[];
  maxOutputBytes?: number;
}

export interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface RunError extends Error, RunResult {}

export function run(
  command: string,
  args: readonly string[],
  options: RunOptions = {},
): Promise<RunResult> {
  const {
    cwd = process.cwd(),
    env = process.env,
    allowExitCodes = [0],
    maxOutputBytes = 20 * 1024 * 1024,
  } = options;

  return new Promise<RunResult>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      shell: false,
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';
    let outputBytes = 0;
    let settled = false;

    const fail = (error: Error): void => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    const append = (kind: 'stdout' | 'stderr', chunk: Buffer): void => {
      outputBytes += chunk.byteLength;
      if (outputBytes > maxOutputBytes) {
        child.kill();
        fail(new Error(`${command} produced too much output`));
        return;
      }

      if (kind === 'stdout') stdout += chunk.toString('utf8');
      else stderr += chunk.toString('utf8');
    };

    child.stdout.on('data', (chunk: Buffer) => append('stdout', chunk));
    child.stderr.on('data', (chunk: Buffer) => append('stderr', chunk));
    child.on('error', fail);
    child.on('close', (code) => {
      if (settled) return;
      settled = true;

      const exitCode = code ?? 1;
      const result: RunResult = { stdout, stderr, exitCode };
      if (allowExitCodes.includes(exitCode)) {
        resolve(result);
        return;
      }

      const error = new Error(
        stderr.trim() || `${command} exited with code ${exitCode}`,
      ) as RunError;
      Object.assign(error, result);
      reject(error);
    });
  });
}
