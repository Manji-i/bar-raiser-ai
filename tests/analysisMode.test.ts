import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isAnalysisMode,
  modeFromPath,
  modePath,
  resolveStoredMode,
} from '../services/analysisMode.ts';

test('only candidate and recruiter are valid analysis modes', () => {
  assert.equal(isAnalysisMode('candidate'), true);
  assert.equal(isAnalysisMode('recruiter'), true);
  assert.equal(isAnalysisMode('employer'), false);
  assert.equal(isAnalysisMode(null), false);
});

test('invalid stored modes fall back to recruiter', () => {
  assert.equal(resolveStoredMode(null), 'recruiter');
  assert.equal(resolveStoredMode('broken'), 'recruiter');
  assert.equal(resolveStoredMode('candidate'), 'candidate');
});

test('explicit mode routes are generated and parsed', () => {
  assert.equal(modePath('candidate', 'app'), '/app/candidate');
  assert.equal(modePath('recruiter', 'history'), '/history/recruiter');
  assert.equal(modeFromPath('/app/candidate'), 'candidate');
  assert.equal(modeFromPath('/history/recruiter'), 'recruiter');
  assert.equal(modeFromPath('/report/123'), null);
});
