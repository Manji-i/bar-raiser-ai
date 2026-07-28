import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AUTH_MODE_KEY,
  clearAuthMode,
  clearPostLoginMode,
  consumePostLoginMode,
  consumePostLoginPath,
  getAuthMode,
  getRecentMode,
  isAnalysisMode,
  modeFromPath,
  modePath,
  reportMatchesAuthMode,
  rememberMode,
  resolveModeAccess,
  resolveStoredMode,
  setAuthMode,
  setPostLoginMode,
  setPostLoginPath,
} from '../services/analysisMode.ts';

const storage = (values: Map<string, string>) => ({
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => values.set(key, value),
  removeItem: (key: string) => values.delete(key),
});

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

test('browser helpers remember mode and only consume safe post-login paths', () => {
  const localValues = new Map<string, string>();
  const sessionValues = new Map<string, string>();
  const previousWindow = (globalThis as any).window;
  (globalThis as any).window = {
    localStorage: storage(localValues),
    sessionStorage: storage(sessionValues),
  };

  try {
    assert.equal(getRecentMode(), 'recruiter');
    rememberMode('candidate');
    assert.equal(getRecentMode(), 'candidate');
    setPostLoginPath('candidate');
    assert.equal(consumePostLoginPath(), '/app/candidate');
    assert.equal(consumePostLoginPath(), null);

    sessionValues.set('evalbar_post_login_path', 'https://evil.example');
    assert.equal(consumePostLoginPath(), null);
  } finally {
    if (previousWindow === undefined) delete (globalThis as any).window;
    else (globalThis as any).window = previousWindow;
  }
});

test('auth mode is strict and uses the auth lifecycle storage', () => {
  const localValues = new Map<string, string>();
  const sessionValues = new Map<string, string>();
  const previousWindow = (globalThis as any).window;
  (globalThis as any).window = {
    localStorage: storage(localValues),
    sessionStorage: storage(sessionValues),
  };

  try {
    assert.equal(getAuthMode(), null);
    setAuthMode('candidate');
    assert.equal(localValues.get(AUTH_MODE_KEY), 'candidate');
    assert.equal(getAuthMode(), 'candidate');
    localValues.set(AUTH_MODE_KEY, 'broken');
    assert.equal(getAuthMode(), null);
    clearAuthMode();
    assert.equal(localValues.has(AUTH_MODE_KEY), false);
  } finally {
    if (previousWindow === undefined) delete (globalThis as any).window;
    else (globalThis as any).window = previousWindow;
  }
});

test('post-login intent stores a mode rather than a trusted destination', () => {
  const localValues = new Map<string, string>();
  const sessionValues = new Map<string, string>();
  const previousWindow = (globalThis as any).window;
  (globalThis as any).window = {
    localStorage: storage(localValues),
    sessionStorage: storage(sessionValues),
  };

  try {
    setPostLoginMode('candidate');
    assert.equal(consumePostLoginMode(), 'candidate');
    assert.equal(consumePostLoginMode(), null);
    setPostLoginMode('recruiter');
    clearPostLoginMode();
    assert.equal(consumePostLoginMode(), null);

    sessionValues.set('evalbar_post_login_mode', 'https://evil.example');
    assert.equal(consumePostLoginMode(), null);
  } finally {
    if (previousWindow === undefined) delete (globalThis as any).window;
    else (globalThis as any).window = previousWindow;
  }
});

test('locked mode owns all business route decisions', () => {
  assert.equal(resolveModeAccess('candidate', 'candidate', 'app'), '/app/candidate');
  assert.equal(resolveModeAccess('recruiter', 'candidate', 'app'), '/app/candidate');
  assert.equal(resolveModeAccess(null, 'recruiter', 'history'), '/history/recruiter');
  assert.equal(reportMatchesAuthMode('candidate', 'candidate'), true);
  assert.equal(reportMatchesAuthMode('recruiter', 'candidate'), false);
  assert.equal(reportMatchesAuthMode(undefined, 'recruiter'), true);
});
