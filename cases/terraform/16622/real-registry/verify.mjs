import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const dir = process.argv[2];
if (!dir) throw new Error('Usage: node verify.mjs EVIDENCE_DIRECTORY');
const read = (name) => readFile(join(dir, name), 'utf8');
const json = async (name) => JSON.parse(await read(name));
const coreSha = '7683222c5d538d4125b170ddfb85a4e3663fb8b7';
const fixtureSha = '6fdf4bd9b9f70145901c8f95c73486467580c17a';
const checks = {};
const upper = await json('uppercase.json');
const lower = await json('lowercase.json');
const httpStatus = async (name) => Number((await read(name)).split(/\r?\n/)[0].split(/\s+/)[1]);
checks.uppercase_versions = await httpStatus('uppercase.headers') === 200
  && JSON.stringify(upper.modules?.[0]?.versions?.map((v) => v.version).sort()) === '["1.0.0","1.1.0"]';
checks.lowercase_missing_versions = await httpStatus('lowercase.headers') === 200
  && JSON.stringify(lower) === '{"modules":[{}]}';
checks.authentication_required = await httpStatus('unauthenticated.headers') === 401;
const images = await json('images.json');
checks.real_registry_image = images.some((i) => i.RepoDigests?.includes(
  'ghcr.io/boring-registry/boring-registry@sha256:1286b2c3630cbaaebbd911ce1346b586fe7f77d10f38eb05607c730b308157ef'));
const log = await read('dry-run.log');
checks.pinned_core = log.includes(`Core SHA: ${coreSha}`);
checks.real_clone_and_checkout = log.includes('git clone --no-tags')
  && log.includes(`=> checking out commit ${fixtureSha}`);
checks.full_dry_run_parsed_dependency = log.includes('=> parsing dependency files')
  && log.includes('=> updating 1 dependencies: acme/rds/aws');
checks.dependabot_lowercase_request = log.includes('--> GET https://localhost/v1/modules/acme/rds/aws/versions')
  && log.includes('<-- 200 https://localhost/v1/modules/acme/rds/aws/versions');
checks.reported_failure = log.includes('An error occurred: KeyError, key not found: "versions"')
  && (await read('dry-run-exit-code.txt')).trim() === '1';
const started = Date.parse((await read('dry-run-started.txt')).trim());
const events = (await read('registry.log')).trim().split(/\r?\n/).map(JSON.parse);
checks.real_registry_received_dry_run = events.some((e) => Date.parse(e.time) >= started
  && e.op === 'ListModuleVersions' && e.module?.name === 'rds'
  && e.module.namespace === 'acme' && e.module.provider === 'aws');
checks.authenticated_during_dry_run = events.some((e) => Date.parse(e.time) >= started
  && e.msg === 'successfully verified token' && e.provider === 'static');
const result = {
  status: Object.values(checks).every(Boolean) ? 'reproduced' : 'blocked',
  scope: 'Unmodified Core bin/dry-run.rb with live GitHub fetch and real boring-registry; stops at the reported exception.',
  core_sha: coreSha, fixture_sha: fixtureSha,
  core_image_id: (await json('core-image.json'))[0].Id,
  dry_run_started: new Date(started).toISOString(),
  checks,
};
await writeFile(join(dir, 'result.json'), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
process.exitCode = result.status === 'reproduced' ? 0 : 1;
