import test from 'node:test';
import assert from 'node:assert/strict';
import { classify as commentsStatus } from '../cases/pip/3143/run.mjs';

const compiled = (version, path) => `repro-demo==${version}\n    # via -r ${path}\n`;
const commentsEvidence = {
  stage: 'complete',
  control: { 'requirements.txt': compiled('2.0.0', 'requirements.in') },
  grouped: {
    'ussd/requirements.txt': compiled('2.0.0', 'ussd/requirements.in'),
    'other/requirements.txt': compiled('2.0.0', 'other/requirements.in'),
  },
  single: { 'requirements.txt': compiled('3.0.0', 'requirements.in') },
};

test('#3143 requires successful version updates and an actual path change in both directions', () => {
  assert.equal(commentsStatus(commentsEvidence, 0), 'reproduced');
  assert.equal(commentsStatus({ ...commentsEvidence, grouped: {
    'ussd/requirements.txt': compiled('2.0.0', 'requirements.in'),
    'other/requirements.txt': compiled('2.0.0', 'requirements.in'),
  } }, 0), 'not_reproduced');
  assert.equal(commentsStatus({ ...commentsEvidence, single: { 'requirements.txt': compiled('2.0.0', 'requirements.in') } }, 0), 'blocked');
  assert.equal(commentsStatus({ ...commentsEvidence, control: {} }, 0), 'blocked');
  assert.equal(commentsStatus({ ...commentsEvidence, exception: { class: 'RuntimeError' } }, 0), 'blocked');
  assert.equal(commentsStatus(commentsEvidence, 1), 'blocked');
});
