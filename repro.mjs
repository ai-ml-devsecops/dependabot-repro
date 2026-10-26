import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const root = dirname(fileURLToPath(import.meta.url));
const statuses = new Set(['reproduced', 'not_reproduced', 'blocked']);

async function findCase(issue) {
  if (!/^\d+$/.test(issue)) throw new Error('--issue must be an issue number');
  for (const ecosystem of await readdir(join(root, 'cases'), { withFileTypes: true })) {
    if (!ecosystem.isDirectory()) continue;
    const directory = join(root, 'cases', ecosystem.name, issue);
    try {
      const config = JSON.parse(await readFile(join(directory, 'case.json'), 'utf8'));
      return { directory, config };
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  throw new Error(`No case for issue #${issue}`);
}

async function main() {
  const { values } = parseArgs({ options: {
    issue: { type: 'string' }, output: { type: 'string' }, help: { type: 'boolean' },
  } });
  if (values.help) {
    console.log('Usage: node repro.mjs --issue <number> [--output <new-directory>]');
    return;
  }
  if (!values.issue) throw new Error('Specify --issue <number>');
  const { directory, config } = await findCase(values.issue);
  const output = resolve(values.output ?? join(tmpdir(), `dependabot-${values.issue}-${randomUUID()}`));
  await mkdir(dirname(output), { recursive: true });
  // Refuse an existing directory so a run cannot reuse stale evidence.
  await mkdir(output);
  await writeFile(join(output, 'run.log'), '');
  const result = {
    issue: config.issue,
    dependabot_sha: config.dependabot_sha,
    started_at: new Date().toISOString(),
    status: 'blocked',
  };
  try {
    const { run } = await import(pathToFileURL(join(directory, 'run.mjs')));
    const outcome = await run({ output, config });
    if (!statuses.has(outcome.status)) throw new Error('Case returned an invalid status');
    Object.assign(result, outcome);
  } catch (error) {
    result.reason = error.message;
  }
  await writeFile(join(output, 'result.json'), `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify({ status: result.status, output }));
  process.exitCode = result.status === 'blocked' ? 2 : 0;
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 2;
});
