import { copyFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { run as command } from '../../../harness/process.mjs';
import { startRegistry, UPPER, LOWER, VERSIONS, MISSING } from './registry.mjs';

const directory = dirname(fileURLToPath(import.meta.url));

export function classify(evidence, requests, code) {
  const control = evidence.control;
  if (evidence.stage !== 'update_checker' || control?.status !== 200 || !isDeepStrictEqual(control.body, VERSIONS)) {
    return 'blocked';
  }
  const seen = (path, body) => requests.some((request) => request.phase === 'dependabot'
    && request.path === path && request.status === 200 && isDeepStrictEqual(request.body, body));
  const error = evidence.exception;
  if (code === 1 && seen(LOWER, MISSING) && error?.class === 'KeyError'
      && error.message?.includes('"versions"') && error.backtrace?.some((line) => line.includes('all_module_versions'))) {
    return 'reproduced';
  }
  if (code === 0 && !error && seen(UPPER, VERSIONS) && evidence.latest_version === '1.1.0') {
    return 'not_reproduced';
  }
  return 'blocked';
}

export async function run({ output, config }) {
  const requests = [];
  const log = join(output, 'run.log');
  let temporary, registry;
  try {
    const core = resolve(process.env.DEPENDABOT_CORE ?? '/opt/dependabot-core');
    const head = await command('git', ['-C', core, 'rev-parse', 'HEAD'], { log });
    if (head.stdout.trim() !== config.dependabot_sha) throw new Error('Pinned Dependabot revision is wrong');
    const changes = await command('git', ['-C', core, 'status', '--porcelain'], { log });
    if (changes.stdout.trim()) throw new Error('Pinned Dependabot checkout has changes');
    const env = Object.fromEntries(Object.entries(process.env)
      .filter(([key]) => !['http_proxy', 'https_proxy', 'all_proxy'].includes(key.toLowerCase())));
    env.BUNDLE_GEMFILE = join(core, 'updater', 'Gemfile');
    await command('bundle', ['check'], { env, cwd: join(core, 'updater'), log });

    temporary = await mkdtemp(join(tmpdir(), 'dependabot-16622-'));
    const ca = join(temporary, 'ca.pem'), cert = join(temporary, 'cert.pem'), key = join(temporary, 'key.pem');
    const caKey = join(temporary, 'ca-key.pem'), csr = join(temporary, 'csr'), ext = join(temporary, 'ext');
    await writeFile(ext, 'basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\nsubjectAltName=DNS:localhost\n');
    const commands = [
      ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-keyout', caKey, '-out', ca, '-subj', '/CN=CA', '-addext', 'basicConstraints=critical,CA:TRUE', '-addext', 'keyUsage=critical,keyCertSign,cRLSign'],
      ['req', '-new', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', csr, '-subj', '/CN=localhost'],
      ['x509', '-req', '-in', csr, '-CA', ca, '-CAkey', caKey, '-CAcreateserial', '-out', cert, '-days', '1', '-extfile', ext],
    ];
    for (const args of commands) await command('openssl', args, { log });
    registry = await startRegistry({ cert: await readFile(cert), key: await readFile(key), requests });
    const main = join(output, 'main.tf');
    await copyFile(join(directory, 'main.tf'), main);
    Object.assign(env, { REPRO_CA: ca, SSL_CERT_FILE: ca, NO_PROXY: 'localhost,127.0.0.1', REPRO_UPPER_URL: `https://localhost${UPPER}` });
    const { code } = await command('bundle', ['exec', 'ruby', join(directory, 'check.rb'), main, join(output, 'checker.json')],
      { env, log, allowFailure: true });
    const evidence = JSON.parse(await readFile(join(output, 'checker.json'), 'utf8'));
    const status = classify(evidence, requests, code);
    return {
      status, exit_code: code, evidence,
      ...(status === 'blocked' ? { reason: 'Checker did not establish either expected outcome; inspect checker.json, requests.json and run.log' } : {}),
    };
  } finally {
    if (registry) await registry.close();
    if (temporary) await rm(temporary, { recursive: true, force: true });
    await writeFile(join(output, 'requests.json'), `${JSON.stringify(requests, null, 2)}\n`);
  }
}
