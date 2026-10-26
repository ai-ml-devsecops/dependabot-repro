import { copyFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { run as command } from '../../../harness/process.mjs';

const directory = dirname(fileURLToPath(import.meta.url));

function findsRequests(dependencies) {
  return dependencies.some((dependency) => dependency.name === 'requests'
    && dependency.requirements?.some((requirement) => requirement.file === 'pyproject.toml'
      && requirement.requirement === '>=2.31.0' && requirement.groups?.includes('dependencies')));
}

export function classify(evidence, code) {
  const control = evidence.control?.dependencies;
  const actual = evidence.actual?.dependencies;
  if (code !== 0 || evidence.exception || evidence.stage !== 'parser'
      || !Array.isArray(control) || !findsRequests(control) || !Array.isArray(actual)) {
    return 'blocked';
  }
  if (actual.length === 0) return 'reproduced';
  if (findsRequests(actual)) return 'not_reproduced';
  return 'blocked';
}

export async function run({ output, config }) {
  const core = resolve(process.env.DEPENDABOT_CORE ?? '/opt/dependabot-core');
  const log = join(output, 'run.log');
  const head = await command('git', ['-C', core, 'rev-parse', 'HEAD'], { log });
  if (head.stdout.trim() !== config.dependabot_sha) throw new Error('Pinned Dependabot revision is wrong');
  const changes = await command('git', ['-C', core, 'status', '--porcelain'], { log });
  if (changes.stdout.trim()) throw new Error('Pinned Dependabot checkout has changes');
  const env = { ...process.env, BUNDLE_GEMFILE: join(core, 'updater', 'Gemfile') };
  await command('bundle', ['check'], { env, cwd: join(core, 'updater'), log });
  for (const name of ['pyproject.toml', 'control.toml']) {
    await copyFile(join(directory, name), join(output, name));
  }
  const { code } = await command('bundle', ['exec', 'ruby', join(directory, 'check.rb'), output, join(output, 'checker.json')],
    { env, cwd: tmpdir(), log, allowFailure: true });
  const evidence = JSON.parse(await readFile(join(output, 'checker.json'), 'utf8'));
  const status = classify(evidence, code);
  return {
    status, exit_code: code, evidence,
    ...(status === 'blocked' ? { reason: 'Parser did not establish either expected outcome; inspect checker.json and run.log' } : {}),
  };
}
