import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const run = promisify(execFile);

describe('worker entry module graph', () => {
  it('loads under native ESM, where import cycles hit the temporal dead zone', async () => {
    const cwd = fileURLToPath(new URL('..', import.meta.url));
    const { stdout } = await run(
      process.execPath,
      [
        '--import',
        '@swc-node/register/esm-register',
        '--input-type=module',
        '-e',
        "await import('reflect-metadata'); await import('./src/worker.module.ts'); console.log('loaded');",
      ],
      { cwd },
    );
    expect(stdout.trim()).toBe('loaded');
  }, 60_000);
});
