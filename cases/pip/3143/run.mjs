import { copyFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { run as command } from '../../../harness/process.mjs';

const directory = dirname(fileURLToPath(import.meta.url));
const paths = (content) => [...content.matchAll(/^\s*# via -r (\S+)\s*$/gm)].map((match) => match[1].replace(/^\.\//, ''));

export function classify(evidence, code) {
  if (code !== 0 || evidence.exception || evidence.stage !== 'complete') return 'blocked';
  const files = [
    [evidence.control?.['requirements.txt'], '2.0.0'],
    [evidence.grouped?.['ussd/requirements.txt'], '2.0.0'],
    [evidence.grouped?.['other/requirements.txt'], '2.0.0'],
    [evidence.single?.['requirements.txt'], '3.0.0'],
  ];
  if (!files.every(([content, version]) => typeof content === 'string'
    && content.split('\n').some((line) => line.trim() === `repro-demo==${version}`))) return 'blocked';
  const [control, ussd, other, single] = files.map(([content]) => paths(content));
  if (![control, ussd, other, single].every((annotations) => annotations.length === 1)
    || control[0] !== 'requirements.in'
    || !['requirements.in', 'ussd/requirements.in'].includes(ussd[0])
    || !['requirements.in', 'other/requirements.in'].includes(other[0])
    || !['requirements.in', 'ussd/requirements.in'].includes(single[0])) return 'blocked';
  return ussd[0] === 'ussd/requirements.in' && other[0] === 'other/requirements.in' && single[0] === 'requirements.in'
    ? 'reproduced' : 'not_reproduced';
}

export async function run({ output, config }) {
  const core = resolve(process.env.DEPENDABOT_CORE ?? '/opt/dependabot-core');
  const log = join(output, 'run.log');
  if ((await command('git', ['-C', core, 'rev-parse', 'HEAD'], { log })).stdout.trim() !== config.dependabot_sha) throw new Error('Pinned Dependabot revision is wrong');
  if ((await command('git', ['-C', core, 'status', '--porcelain'], { log })).stdout.trim()) throw new Error('Pinned Dependabot checkout has changes');
  const env = { ...process.env, BUNDLE_GEMFILE: join(core, 'updater', 'Gemfile'), PIP_NO_INDEX: '1', PIP_FIND_LINKS: '/opt/repro-wheels', PIP_DISABLE_PIP_VERSION_CHECK: '1' };
  await command('bundle', ['check'], { env, cwd: join(core, 'updater'), log });
  for (const name of ['requirements.in', 'requirements.txt']) await copyFile(join(directory, name), join(output, name));
  const { code } = await command('bundle', ['exec', 'ruby', join(directory, 'check.rb'), output, join(output, 'checker.json')],
    { env, cwd: tmpdir(), log, allowFailure: true });
  const evidence = JSON.parse(await readFile(join(output, 'checker.json'), 'utf8'));
  const status = classify(evidence, code);
  return { status, exit_code: code, evidence, ...(status === 'blocked' ? { reason: 'Inspect checker.json and run.log' } : {}) };
}
