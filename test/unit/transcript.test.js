const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { transcriptPathForSession } = require('../../lib/transcript');

test('transcriptPathForSession produces a deterministic path', () => {
  // session id contains __<taskSlug>__ which gets collapsed to __ in the session slug
  const result = transcriptPathForSession('/board', 'tasks/10-login.yaml', 'coder__10-login__20260527T100000Z');
  assert.equal(result, path.join('/board', 'transcripts', '10-login', 'coder__20260527t100000z.txt'));
});

test('transcriptPathForSession strips task slug from session slug', () => {
  const result = transcriptPathForSession('/board', '/board/tasks/5-auth.yaml', 'qa__5-auth__20260527T120000Z');
  assert.match(result, /transcripts[/\\]5-auth[/\\]/);
  assert.doesNotMatch(result, /5-auth__5-auth/);
});

test('transcriptPathForSession handles legacy triple-underscore task token', () => {
  const result = transcriptPathForSession('/board', 'tasks/3-fix.yaml', 'agent___3-fix__20260527T000000Z');
  assert.match(result, /transcripts[/\\]3-fix[/\\]/);
  assert.doesNotMatch(result, /3-fix__3-fix/);
});

test('transcriptPathForSession uses "session" fallback for empty sessionId', () => {
  const result = transcriptPathForSession('/board', 'tasks/1-task.yaml', '');
  assert.match(result, /transcripts[/\\]1-task[/\\]session\.txt$/);
});

test('transcriptPathForSession sanitizes special chars in task filename', () => {
  const result = transcriptPathForSession('/board', 'tasks/Task #1!.yaml', 'agent__20260527T000000Z');
  assert.match(result, /transcripts[/\\]task_1[/\\]/);
});
