const test = require('node:test');
const assert = require('node:assert/strict');
const childProcess = require('child_process');
const { filterTaskSessions, listTaskSessions, taskSlugFromTaskFile, sessionIdPrefix } = require('../../lib/tmux_sessions');

const SAMPLE_TMUX_OUTPUT = [
  'coder__10-login__20260527T120000Z\t1748390400',
  'coder__10-login__20260527T100000Z\t1748383200',
  'qa__10-login__20260527T110000Z\t1748386800',
  'coder__5-other__20260527T090000Z\t1748379600',
  'unrelated-session\t1748379600',
].join('\n');

test('taskSlugFromTaskFile strips path and extension', () => {
  assert.equal(taskSlugFromTaskFile('/board/tasks/10-login.yaml'), '10-login');
  assert.equal(taskSlugFromTaskFile('/board/tasks/5-fix-auth.yml'), '5-fix-auth');
  assert.equal(taskSlugFromTaskFile('tasks/3-task.yaml'), '3-task');
  assert.equal(taskSlugFromTaskFile(''), '');
});

test('taskSlugFromTaskFile handles paths without extension', () => {
  assert.equal(taskSlugFromTaskFile('/board/tasks/10-login'), '10-login');
});

test('sessionIdPrefix combines agent slug and task slug', () => {
  assert.equal(sessionIdPrefix('coder', '/board/tasks/10-login.yaml'), 'coder__10-login');
  assert.equal(sessionIdPrefix('qa', 'tasks/5-fix.yml'), 'qa__5-fix');
});

test('sessionIdPrefix trims whitespace from agent name', () => {
  assert.equal(sessionIdPrefix('  coder  ', 'tasks/1-task.yaml'), 'coder__1-task');
});

test('sessionIdPrefix handles empty agent', () => {
  assert.equal(sessionIdPrefix('', 'tasks/1-task.yaml'), '__1-task');
});

test('filterTaskSessions returns all matching sessions sorted newest first', () => {
  const results = filterTaskSessions(SAMPLE_TMUX_OUTPUT, '10-login', { agent: 'coder' });
  assert.equal(results.length, 2);
  assert.equal(results[0].name, 'coder__10-login__20260527T120000Z');
  assert.equal(results[1].name, 'coder__10-login__20260527T100000Z');
});

test('filterTaskSessions filters by agent prefix', () => {
  const results = filterTaskSessions(SAMPLE_TMUX_OUTPUT, '10-login', { agent: 'qa' });
  assert.equal(results.length, 1);
  assert.equal(results[0].name, 'qa__10-login__20260527T110000Z');
});

test('filterTaskSessions without agent option returns all matching task sessions', () => {
  const results = filterTaskSessions(SAMPLE_TMUX_OUTPUT, '10-login');
  assert.equal(results.length, 3);
});

test('filterTaskSessions returns empty array for no matches', () => {
  const results = filterTaskSessions(SAMPLE_TMUX_OUTPUT, 'nonexistent', { agent: 'coder' });
  assert.equal(results.length, 0);
});

test('filterTaskSessions handles empty output', () => {
  assert.deepEqual(filterTaskSessions('', '10-login'), []);
  assert.deepEqual(filterTaskSessions(null, '10-login'), []);
});

test('filterTaskSessions treats non-numeric created as 0', () => {
  // "Infinity" is not finite — should fall back to created=0
  const output = 'coder__10-login__20260527T120000Z\tInfinity';
  const results = filterTaskSessions(output, '10-login', { agent: 'coder' });
  assert.equal(results.length, 1);
  assert.equal(results[0].created, 0);
});

test('filterTaskSessions includes legacy prefix sessions when includeLegacyPrefix is set', () => {
  const output = 'coder__10-login__old-ts\t1000\ncoder__10-login__20260527T100000Z\t2000';
  const results = filterTaskSessions(output, '10-login', { agent: 'coder', includeLegacyPrefix: true });
  // legacy sessions match via startsWith(legacyPrefix) = 'coder__10-login__'
  assert.equal(results.length, 2);
});

test('filterTaskSessions with includeLegacyPrefix but no agent does not add legacyPrefix', () => {
  const output = 'coder__10-login__old-ts\t1000\ncoder__10-login__20260527T100000Z\t2000';
  const results = filterTaskSessions(output, '10-login', { includeLegacyPrefix: true });
  // no agent means no legacyPrefix — only the timestamp-format entry matches
  assert.equal(results.length, 1);
  assert.equal(results[0].name, 'coder__10-login__20260527T100000Z');
});

test('taskSlugFromTaskFile handles null input', () => {
  assert.equal(taskSlugFromTaskFile(null), '');
});

test('sessionIdPrefix handles null agent', () => {
  assert.equal(sessionIdPrefix(null, 'tasks/1-task.yaml'), '__1-task');
});

test('listTaskSessions returns empty array when tmux exits non-zero', (t) => {
  const spy = t.mock.method(childProcess, 'spawnSync', () => ({ status: 1, stdout: '', stderr: '' }));
  const results = listTaskSessions('tasks/10-login.yaml');
  assert.deepEqual(results, []);
  spy.mock.restore();
});

test('listTaskSessions returns filtered sessions when tmux succeeds', (t) => {
  const tmuxOutput = [
    'coder__10-login__20260527T120000Z\t1748390400',
    'coder__10-login__20260527T100000Z\t1748383200',
    'unrelated\t1748379600',
  ].join('\n');
  const spy = t.mock.method(childProcess, 'spawnSync', () => ({ status: 0, stdout: tmuxOutput }));
  const results = listTaskSessions('tasks/10-login.yaml', { agent: 'coder' });
  assert.equal(results.length, 2);
  assert.equal(results[0].name, 'coder__10-login__20260527T120000Z');
  spy.mock.restore();
});

test('listTaskSessions passes taskSlug derived from file path', (t) => {
  const tmuxOutput = 'qa__5-fix__20260527T120000Z\t1748390400\n';
  const spy = t.mock.method(childProcess, 'spawnSync', () => ({ status: 0, stdout: tmuxOutput }));
  const results = listTaskSessions('/board/tasks/5-fix.yaml', { agent: 'qa' });
  assert.equal(results.length, 1);
  assert.equal(results[0].name, 'qa__5-fix__20260527T120000Z');
  spy.mock.restore();
});
