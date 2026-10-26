import { copyFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { run as command } from '../../../harness/process.mjs';

const directory = dirname(fileURLToPath(import.meta.url));

export function classify(evidence, code) {
  if (code !== 0 || evidence.exception || evidence.stage !== 'complete' || evidence.control !== true
      || evidence.reference?.valid !== true || evidence.reference.ordered_versions?.length !== 20
      || !Array.isArray(evidence.parsing_errors) || !Array.isArray(evidence.core_order)
      || evidence.caret?.requirement !== '^8.0.3.0.1') return 'blocked';
  if (evidence.parsing_errors.length || !isDeepStrictEqual(evidence.core_order, evidence.reference.ordered_versions)) return 'reproduced';
  const error = evidence.caret.exception;
  if (error?.class === 'Gem::Requirement::BadRequirementError' && error.message?.includes('Illformed requirement')) return 'reproduced';
  if (error) return 'blocked';
  const checks = evidence.caret.checks;
  const names = ['lower_bound', 'within_range', 'excludes_previous_major', 'excludes_next_major'];
  if (!names.every((name) => typeof checks?.[name] === 'boolean')) return 'blocked';
  return names.every((name) => checks[name]) ? 'not_reproduced' : 'reproduced';
}

export async function run({ output, config }) {
  const core = resolve(process.env.DEPENDABOT_CORE ?? '/opt/dependabot-core');
  const log = join(output, 'run.log');
  if ((await command('git', ['-C', core, 'rev-parse', 'HEAD'], { log })).stdout.trim() !== config.dependabot_sha) throw new Error('Pinned Dependabot revision is wrong');
  if ((await command('git', ['-C', core, 'status', '--porcelain'], { log })).stdout.trim()) throw new Error('Pinned Dependabot checkout has changes');
  const env = { ...process.env, BUNDLE_GEMFILE: join(core, 'updater', 'Gemfile') };
  await command('bundle', ['check'], { env, cwd: join(core, 'updater'), log });
  const input = join(output, 'versions.json'), reference = join(output, 'reference.json');
  await copyFile(join(directory, 'versions.json'), input);
  await command('pyenv', ['exec', 'python3', join(directory, 'reference.py'), input, reference], { env, log });
  const { code } = await command('bundle', ['exec', 'ruby', join(directory, 'check.rb'), input, reference, join(output, 'checker.json')],
    { env, cwd: tmpdir(), log, allowFailure: true });
  const evidence = JSON.parse(await readFile(join(output, 'checker.json'), 'utf8'));
  const status = classify(evidence, code);
  return { status, exit_code: code, evidence, ...(status === 'blocked' ? { reason: 'Inspect checker.json and run.log' } : {}) };
}
