import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { classify } from '../cases/uv/16589/run.mjs';
import { run } from '../harness/process.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const requests = {
  name: 'requests',
  requirements: [{ file: 'pyproject.toml', requirement: '>=2.31.0', groups: ['dependencies'] }],
};
const evidence = (actual) => ({ stage: 'parser', control: { dependencies: [requests] }, actual: { dependencies: actual } });

test('uv #16589 requires a successful control before claiming dropped dependencies', () => {
  assert.equal(classify(evidence([]), 0), 'reproduced');
  assert.equal(classify({ ...evidence([]), control: { dependencies: [] } }, 0), 'blocked');
  assert.equal(classify({ ...evidence([]), control: { dependencies: [{ name: 'requests', requirements: [] }] } }, 0), 'blocked');
  assert.equal(classify({ ...evidence([]), exception: { class: 'RuntimeError' } }, 0), 'blocked');
  assert.equal(classify(evidence([]), 1), 'blocked');
  assert.equal(classify({ ...evidence([]), stage: 'control' }, 0), 'blocked');
  assert.equal(classify({}, 0), 'blocked');
});

test('uv #16589 requires the declared direct requirement for not_reproduced', () => {
  assert.equal(classify(evidence([requests]), 0), 'not_reproduced');
  assert.equal(classify(evidence([{ name: 'requests', requirements: [] }]), 0), 'blocked');
  assert.equal(classify(evidence([{ ...requests, name: 'urllib3' }]), 0), 'blocked');
  assert.equal(classify(evidence([{ ...requests, requirements: [{ ...requests.requirements[0], requirement: '>=1' }] }]), 0), 'blocked');
});

test('uv #16589 is discoverable and failed setup produces blocked artifacts', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'repro-uv-cli-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const output = join(directory, 'result');
  const result = await run(process.execPath, [join(root, 'repro.mjs'), '--issue', '16589', '--output', output], {
    env: { ...process.env, DEPENDABOT_CORE: join(directory, 'missing-core') }, allowFailure: true,
  });
  assert.equal(result.code, 2);
  const artifact = JSON.parse(await readFile(join(output, 'result.json'), 'utf8'));
  assert.equal(artifact.issue, 'https://github.com/dependabot/dependabot-core/issues/16589');
  assert.equal(artifact.status, 'blocked');
  assert.match(artifact.reason, /git/);
});
