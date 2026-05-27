const test = require('node:test');
const assert = require('node:assert/strict');
const childProcess = require('child_process');
const {
  filterTaskSessions,
  listAllKonbySessions,
  listTaskSessions,
  parseKonbySessionName,
  sessionIdPrefix,
  taskSlugFromTaskFile,
} = require('../../lib/tmux_sessions');

const SAMPLE_TMUX_OUTPUT = [
  'konby__coder__10-login__20260527T120000Z\t1748390400',
  'konby__coder__10-login__20260527T100000Z\t1748383200',
  'konby__qa__10-login__20260527T110000Z\t1748386800',
  'konby__coder__5-other__20260527T090000Z\t1748379600',
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

test('sessionIdPrefix includes konby__ prefix and combines agent slug and task slug', () => {
  assert.equal(sessionIdPrefix('coder', '/board/tasks/10-login.yaml'), 'konby__coder__10-login');
  assert.equal(sessionIdPrefix('qa', 'tasks/5-fix.yml'), 'konby__qa__5-fix');
});

test('sessionIdPrefix trims whitespace from agent name', () => {
  assert.equal(sessionIdPrefix('  coder  ', 'tasks/1-task.yaml'), 'konby__coder__1-task');
});

test('sessionIdPrefix handles empty agent', () => {
  assert.equal(sessionIdPrefix('', 'tasks/1-task.yaml'), 'konby____1-task');
});

test('filterTaskSessions returns all matching sessions sorted newest first', () => {
  const results = filterTaskSessions(SAMPLE_TMUX_OUTPUT, '10-login', { agent: 'coder' });
  assert.equal(results.length, 2);
  assert.equal(results[0].name, 'konby__coder__10-login__20260527T120000Z');
  assert.equal(results[1].name, 'konby__coder__10-login__20260527T100000Z');
});

test('filterTaskSessions filters by agent prefix', () => {
  const results = filterTaskSessions(SAMPLE_TMUX_OUTPUT, '10-login', { agent: 'qa' });
  assert.equal(results.length, 1);
  assert.equal(results[0].name, 'konby__qa__10-login__20260527T110000Z');
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
  const output = 'konby__coder__10-login__20260527T120000Z\tInfinity';
  const results = filterTaskSessions(output, '10-login', { agent: 'coder' });
  assert.equal(results.length, 1);
  assert.equal(results[0].created, 0);
});

test('filterTaskSessions includes legacy prefix sessions when includeLegacyPrefix is set', () => {
  const output = 'konby__coder__10-login__old-ts\t1000\nkonby__coder__10-login__20260527T100000Z\t2000';
  const results = filterTaskSessions(output, '10-login', { agent: 'coder', includeLegacyPrefix: true });
  assert.equal(results.length, 2);
});

test('filterTaskSessions with includeLegacyPrefix but no agent does not add legacyPrefix', () => {
  const output = 'konby__coder__10-login__old-ts\t1000\nkonby__coder__10-login__20260527T100000Z\t2000';
  const results = filterTaskSessions(output, '10-login', { includeLegacyPrefix: true });
  assert.equal(results.length, 1);
  assert.equal(results[0].name, 'konby__coder__10-login__20260527T100000Z');
});

test('taskSlugFromTaskFile handles null input', () => {
  assert.equal(taskSlugFromTaskFile(null), '');
});

test('sessionIdPrefix handles null agent', () => {
  assert.equal(sessionIdPrefix(null, 'tasks/1-task.yaml'), 'konby____1-task');
});

test('listTaskSessions returns empty array when tmux exits non-zero', (t) => {
  const spy = t.mock.method(childProcess, 'spawnSync', () => ({ status: 1, stdout: '', stderr: '' }));
  const results = listTaskSessions('tasks/10-login.yaml');
  assert.deepEqual(results, []);
  spy.mock.restore();
});

test('listTaskSessions returns filtered sessions when tmux succeeds', (t) => {
  const tmuxOutput = [
    'konby__coder__10-login__20260527T120000Z\t1748390400',
    'konby__coder__10-login__20260527T100000Z\t1748383200',
    'unrelated\t1748379600',
  ].join('\n');
  const spy = t.mock.method(childProcess, 'spawnSync', () => ({ status: 0, stdout: tmuxOutput }));
  const results = listTaskSessions('tasks/10-login.yaml', { agent: 'coder' });
  assert.equal(results.length, 2);
  assert.equal(results[0].name, 'konby__coder__10-login__20260527T120000Z');
  spy.mock.restore();
});

test('listTaskSessions passes taskSlug derived from file path', (t) => {
  const tmuxOutput = 'konby__qa__5-fix__20260527T120000Z\t1748390400\n';
  const spy = t.mock.method(childProcess, 'spawnSync', () => ({ status: 0, stdout: tmuxOutput }));
  const results = listTaskSessions('/board/tasks/5-fix.yaml', { agent: 'qa' });
  assert.equal(results.length, 1);
  assert.equal(results[0].name, 'konby__qa__5-fix__20260527T120000Z');
  spy.mock.restore();
});

test('listAllKonbySessions returns empty array when tmux exits non-zero', (t) => {
  const spy = t.mock.method(childProcess, 'spawnSync', () => ({ status: 1, stdout: '', stderr: '' }));
  const results = listAllKonbySessions();
  assert.deepEqual(results, []);
  spy.mock.restore();
});

test('listAllKonbySessions returns only sessions with konby__ prefix', (t) => {
  const spy = t.mock.method(childProcess, 'spawnSync', () => ({ status: 0, stdout: SAMPLE_TMUX_OUTPUT }));
  const results = listAllKonbySessions();
  assert.equal(results.length, 4);
  assert.ok(results.every((s) => s.name.startsWith('konby__')));
  spy.mock.restore();
});

test('parseKonbySessionName returns null for non-konby names', () => {
  assert.equal(parseKonbySessionName('coder__10-login__20260527T120000Z'), null);
  assert.equal(parseKonbySessionName('unrelated-session'), null);
  assert.equal(parseKonbySessionName(''), null);
  assert.equal(parseKonbySessionName(null), null);
});

test('parseKonbySessionName returns null when timestamp is missing', () => {
  assert.equal(parseKonbySessionName('konby__coder__10-login'), null);
  assert.equal(parseKonbySessionName('konby__coder__10-login__notadate'), null);
});

test('parseKonbySessionName extracts agent and taskSlug', () => {
  assert.deepEqual(
    parseKonbySessionName('konby__coder__10-login__20260527T120000Z'),
    { agent: 'coder', taskSlug: '10-login' },
  );
  assert.deepEqual(
    parseKonbySessionName('konby__qa__5-fix-auth__20260101T000000Z'),
    { agent: 'qa', taskSlug: '5-fix-auth' },
  );
  assert.deepEqual(
    parseKonbySessionName('konby__bsa__1-task__20260527T090000Z'),
    { agent: 'bsa', taskSlug: '1-task' },
  );
});

test('parseKonbySessionName handles taskSlug containing double underscores', () => {
  // agent is the first __ segment; rest is taskSlug
  assert.deepEqual(
    parseKonbySessionName('konby__coder__my__task__20260527T120000Z'),
    { agent: 'coder', taskSlug: 'my__task' },
  );
});
