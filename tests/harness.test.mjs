import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { run } from '../harness/process.mjs';
import { classify } from '../cases/terraform/16622/run.mjs';
import { UPPER, LOWER, VERSIONS, MISSING } from '../cases/terraform/16622/registry.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const control = { status: 200, body: VERSIONS };
const exception = {
  class: 'KeyError', message: 'key not found: "versions"',
  backtrace: ['registry_client.rb:100:in RegistryClient#all_module_versions'],
};
const failed = { stage: 'update_checker', control, exception };
const succeeded = { stage: 'update_checker', control, latest_version: '1.1.0' };
const request = (path, body, phase = 'dependabot') => ({ path, body, phase, status: 200 });

test('requires actual Dependabot traffic and the specific error for reproduction', () => {
  assert.equal(classify(failed, [request(LOWER, MISSING)], 1), 'reproduced');
  assert.equal(classify(failed, [], 1), 'blocked');
  assert.equal(classify(failed, [request(LOWER, MISSING, 'ruby-control')], 1), 'blocked');
  assert.equal(classify(failed, [request(LOWER, MISSING)], 0), 'blocked');
  assert.equal(classify({ ...failed, exception: { ...exception, class: 'RuntimeError' } }, [request(LOWER, MISSING)], 1), 'blocked');
  assert.equal(classify({ ...failed, exception: { ...exception, backtrace: ['unrelated_method'] } }, [request(LOWER, MISSING)], 1), 'blocked');
});

test('does not turn fixture setup or unrelated failures into behavior evidence', () => {
  assert.equal(classify({ ...failed, stage: 'parser' }, [request(LOWER, MISSING)], 1), 'blocked');
  assert.equal(classify({ ...failed, control: { status: 200, body: {} } }, [request(LOWER, MISSING)], 1), 'blocked');
  assert.equal(classify(failed, [request(LOWER, {})], 1), 'blocked');
  assert.equal(classify({}, [], 1), 'blocked');
});

test('requires a successful relevant lookup for not_reproduced', () => {
  assert.equal(classify(succeeded, [request(UPPER, VERSIONS)], 0), 'not_reproduced');
  assert.equal(classify(succeeded, [request(UPPER, VERSIONS, 'ruby-control')], 0), 'blocked');
  assert.equal(classify(succeeded, [], 0), 'blocked');
  assert.equal(classify({ ...succeeded, latest_version: null }, [request(UPPER, VERSIONS)], 0), 'blocked');
  assert.equal(classify({ ...succeeded, exception }, [request(UPPER, VERSIONS)], 0), 'blocked');
});

test('logs both child streams and preserves exit codes', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'repro-process-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const log = join(directory, 'run.log');
  const result = await run(process.execPath, ['-e', 'setTimeout(() => { console.log("out"); console.error("err"); process.exitCode = 1; }, 100)'], {
    log, allowFailure: true,
  });
  assert.equal(result.code, 1);
  assert.match(result.stdout, /out/);
  assert.match(result.stderr, /err/);
  assert.match(await readFile(log, 'utf8'), /out/);
  assert.match(await readFile(log, 'utf8'), /err/);
});

test('a pending child leaves the event loop available and timeouts stop it', async () => {
  let ticked = false;
  const pending = run(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { timeout: 300 });
  setTimeout(() => { ticked = true; }, 20);
  await assert.rejects(pending, /timed out/);
  assert.equal(ticked, true);
  await assert.rejects(run('dependabot-repro-nonexistent-command', []), /ENOENT/);
});

test('failed setup produces blocked artifacts and cannot overwrite prior output', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'repro-cli-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const output = join(directory, 'result');
  const env = { ...process.env, DEPENDABOT_CORE: join(directory, 'missing-core') };
  const args = [join(root, 'repro.mjs'), '--issue', '16622', '--output', output];
  const first = await run(process.execPath, args, { env, allowFailure: true });
  assert.equal(first.code, 2);
  const original = await readFile(join(output, 'result.json'), 'utf8');
  const result = JSON.parse(original);
  assert.equal(result.status, 'blocked');
  assert.match(result.reason, /git/);
  assert.deepEqual(JSON.parse(await readFile(join(output, 'requests.json'), 'utf8')), []);
  assert.match(await readFile(join(output, 'run.log'), 'utf8'), /missing-core/);
  await writeFile(join(output, 'keep.txt'), 'keep');
  const second = await run(process.execPath, args, { env, allowFailure: true });
  assert.equal(second.code, 2);
  assert.match(second.stderr, /EEXIST/);
  assert.equal(await readFile(join(output, 'result.json'), 'utf8'), original);
  assert.equal(await readFile(join(output, 'keep.txt'), 'utf8'), 'keep');
});

test('rejects unknown issues before attempting a reproduction', async () => {
  const result = await run(process.execPath, [join(root, 'repro.mjs'), '--issue', '999999'], { allowFailure: true });
  assert.equal(result.code, 2);
  assert.match(result.stderr, /No case/);
});
