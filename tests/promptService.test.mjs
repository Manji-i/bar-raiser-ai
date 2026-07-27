import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';

import { DEFAULT_CANDIDATE_PROMPT_CONTENT } from '../services/candidatePrompt.js';
import { createPromptService } from '../services/promptService.js';
import { initializeSchema } from '../services/schema.js';

test('招聘官和候选人 Prompt 独立初始化与版本更新', () => {
  const directory = mkdtempSync(join(tmpdir(), 'evalbar-prompt-service-'));
  const database = new DatabaseSync(join(directory, 'app.db'));

  try {
    initializeSchema(database);
    const service = createPromptService(database);

    assert.equal(service.getCurrentPrompt('recruiter').version, 1);
    assert.equal(service.getCurrentPrompt('candidate').content, DEFAULT_CANDIDATE_PROMPT_CONTENT);

    const updated = service.updatePrompt('候选人新版 Prompt', 'candidate');
    assert.equal(updated.version, 2);
    assert.equal(service.getCurrentPrompt('candidate').content, '候选人新版 Prompt');
    assert.equal(service.getCurrentPrompt('recruiter').version, 1);
    assert.throws(() => service.getCurrentPrompt('employer'), /Invalid analysisMode/);
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
