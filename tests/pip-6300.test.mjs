import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { classify as versionsStatus } from '../cases/pip/6300/run.mjs';

const versions = JSON.parse(await readFile(new URL('../cases/pip/6300/versions.json', import.meta.url), 'utf8')).ordered_versions;
const versionEvidence = {
  stage: 'complete', control: true, reference: { valid: true, ordered_versions: versions },
  parsing_errors: [], core_order: versions,
  caret: { requirement: '^8.0.3.0.1', checks: { lower_bound: true, within_range: true, excludes_previous_major: true, excludes_next_major: true } },
};

test('#6300 distinguishes version/caret failures from setup failures', () => {
  assert.equal(versionsStatus(versionEvidence, 0), 'not_reproduced');
  assert.equal(versionsStatus({ ...versionEvidence, core_order: [...versions].reverse() }, 0), 'reproduced');
  assert.equal(versionsStatus({ ...versionEvidence, caret: { requirement: '^8.0.3.0.1', exception: { class: 'Gem::Requirement::BadRequirementError', message: 'Illformed requirement ["< 9.0.0.dev.0.0"]' } } }, 0), 'reproduced');
  assert.equal(versionsStatus({ ...versionEvidence, control: false }, 0), 'blocked');
  assert.equal(versionsStatus({ ...versionEvidence, exception: { class: 'NameError' } }, 0), 'blocked');
  assert.equal(versionsStatus(versionEvidence, 1), 'blocked');
  assert.equal(versionsStatus({ ...versionEvidence, caret: { requirement: '^8.0.3.0.1' } }, 0), 'blocked');
});
