import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { get } from 'node:https';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run } from '../harness/process.mjs';
import { startRegistry, UPPER, LOWER, VERSIONS, MISSING } from '../cases/terraform/16622/registry.mjs';

test('HTTPS fixture verifies trust and hostname, authenticates, and records case-sensitive responses', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'repro-https-test-'));
  const key = join(directory, 'key.pem'), cert = join(directory, 'cert.pem');
  let registry;
  t.after(async () => {
    if (registry) await registry.close();
    await rm(directory, { recursive: true, force: true });
  });
  await run(process.env.OPENSSL_BIN ?? 'openssl', [
    'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
    '-keyout', key, '-out', cert, '-subj', '/CN=localhost',
    '-addext', 'subjectAltName=DNS:localhost',
  ]);
  const ca = await readFile(cert);
  const requests = [];
  registry = await startRegistry({ cert: ca, key: await readFile(key), requests, port: 0 });
  const options = { hostname: '127.0.0.1', servername: 'localhost', port: registry.port, ca, agent: false };
  const request = (path, overrides = {}) => new Promise((resolve, reject) => {
    get({ ...options, path, headers: { Authorization: 'Bearer fixture-only' }, ...overrides }, (response) => {
      let data = '';
      response.on('data', (chunk) => { data += chunk; });
      response.on('end', () => resolve({ status: response.statusCode, body: JSON.parse(data) }));
      response.on('error', reject);
    }).on('error', reject);
  });

  await assert.rejects(request(UPPER, { ca: undefined }), { code: 'DEPTH_ZERO_SELF_SIGNED_CERT' });
  await assert.rejects(request(UPPER, { servername: 'wrong-host.invalid' }), { code: 'ERR_TLS_CERT_ALTNAME_INVALID' });
  assert.deepEqual(await request(UPPER, { headers: {} }), { status: 401, body: {} });
  assert.deepEqual(await request('/.well-known/terraform.json'), { status: 200, body: { 'modules.v1': '/v1/modules/' } });
  assert.deepEqual(await request(UPPER, { headers: { Authorization: 'Bearer fixture-only', 'X-Repro-Phase': 'ruby-control' } }), { status: 200, body: VERSIONS });
  assert.deepEqual(await request(LOWER), { status: 200, body: MISSING });
  assert.deepEqual(await request('/unknown'), { status: 404, body: {} });
  assert.equal(requests.find((entry) => entry.path === UPPER && entry.status === 200).phase, 'ruby-control');
  assert.equal(requests.find((entry) => entry.path === LOWER).phase, 'dependabot');

  // A real child must reach the server while the parent's process helper waits.
  const script = `
    require('https').get({
      hostname: '127.0.0.1', servername: 'localhost', port: Number(process.env.REPRO_TEST_PORT),
      path: '${UPPER}', ca: require('fs').readFileSync(process.env.REPRO_TEST_CA),
      headers: { Authorization: 'Bearer fixture-only' }, agent: false,
    }, (response) => response.pipe(process.stdout)).on('error', () => { process.exitCode = 1; });
  `;
  const child = await run(process.execPath, ['-e', script], {
    env: { ...process.env, REPRO_TEST_PORT: String(registry.port), REPRO_TEST_CA: cert }, timeout: 5_000,
  });
  assert.deepEqual(JSON.parse(child.stdout), VERSIONS);
});
