import { spawn } from 'node:child_process';
import { appendFileSync } from 'node:fs';

// Use asynchronous children so a case's local server keeps serving requests.
export function run(command, args, { env, cwd, log, timeout = 120_000, allowFailure = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env, cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '', timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, timeout);
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
      if (log) appendFileSync(log, chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
      if (log) appendFileSync(log, chunk);
    });
    child.on('error', (error) => { clearTimeout(timer); reject(error); });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      if (timedOut) return reject(new Error(`${command} timed out after ${timeout} ms`));
      if (signal) return reject(new Error(`${command} terminated by ${signal}`));
      if (code !== 0 && !allowFailure) {
        return reject(new Error(`${command} exited ${code}: ${(stderr || stdout).trim()}`));
      }
      resolve({ code, stdout, stderr });
    });
  });
}
