const test = require('node:test');
const assert = require('node:assert/strict');
const {
  applyRule,
  canEnterColumn,
  countByColumn,
  extractWhenThen,
  lastCommentMeta,
  parseDispatchArgs,
  parseLlmOutcomeResponse,
  parseWhenValues,
  readStatusDefaults,
  resolveStatusCfgForTask,
  ruleMatches,
  sanitizePathToken,
  statusCfgFromThen,
  transcriptForLlm,
  whenFieldMatches,
} = require('../../lib/dispatch');

test('readStatusDefaults applies configured values and fallback statuses', () => {
  assert.deepEqual(readStatusDefaults({ defaults: { status_todo: 'new', status_success: 'merged' } }), {
    todo: 'new',
    in_progress: 'in_progress',
    success: 'merged',
    failure: 'blocked',
  });
});

test('countByColumn and canEnterColumn enforce numeric WIP limits only', () => {
  const counts = countByColumn([
    { data: { column: 'todo' } },
    { data: { column: 'doing' } },
    { data: { column: 'doing' } },
    { data: {} },
  ]);
  const columns = new Map([
    ['doing', { name: 'doing', wip_limit: 2 }],
    ['done', { name: 'done', wip_limit: '-' }],
  ]);

  assert.equal(counts.get('doing'), 2);
  assert.equal(canEnterColumn('doing', columns, counts), false);
  assert.equal(canEnterColumn('done', columns, counts), true);
  assert.equal(canEnterColumn('unknown', columns, counts), true);
});

test('extractWhenThen supports nested and legacy rule shapes', () => {
  assert.deepEqual(
    extractWhenThen({
      when: { column: 'todo', status: ['new', 'todo'] },
      then: { column: 'doing', assignee: 'coder' },
    }),
    {
      when: { column: 'todo', status: ['new', 'todo'] },
      thenCfg: { column: 'doing', assignee: 'coder' },
    },
  );

  assert.deepEqual(
    extractWhenThen({
      column: 'todo',
      status: 'new',
      set_column: 'doing',
      set_assignee: 'coder',
    }),
    {
      when: { column: 'todo', status: 'new', assignee: undefined },
      thenCfg: {
        status_todo: undefined,
        column: 'doing',
        assignee: 'coder',
        status_in_progress: undefined,
        status: undefined,
        status_success: undefined,
        status_failure: undefined,
      },
    },
  );
});

test('ruleMatches handles arrays, wildcards, and empty matchers', () => {
  assert.deepEqual(parseWhenValues([' todo ', '', 'doing']), ['todo', 'doing']);
  assert.equal(whenFieldMatches('anything', '*'), true);
  assert.equal(ruleMatches(
    { column: 'todo', status: 'new', assignee: '-' },
    { when: { column: ['todo', 'backlog'], status: '*', assignee: '-' } },
  ), true);
  assert.equal(ruleMatches(
    { column: 'done', status: 'new', assignee: '-' },
    { when: { column: ['todo', 'backlog'] } },
  ), false);
});

test('applyRule mutates only rule-controlled fields and accepts injected clock', () => {
  const task = { column: 'todo', status: 'new', assignee: '-' };
  applyRule(
    task,
    { then: { column: 'doing', assignee: 'coder', status_in_progress: 'active' } },
    { in_progress: 'in_progress' },
    { now: () => '2026-05-27T10:00:00.000Z' },
  );

  assert.deepEqual(task, {
    column: 'doing',
    status: 'active',
    assignee: 'coder',
    updated_at: '2026-05-27T10:00:00.000Z',
  });
});

test('statusCfgFromThen and resolveStatusCfgForTask prefer matching assignee and column', () => {
  const defaults = { todo: 'new', in_progress: 'doing', success: 'done', failure: 'blocked' };
  assert.deepEqual(statusCfgFromThen({ status_success: 'merged' }, defaults), {
    todo: 'new',
    in_progress: 'doing',
    success: 'merged',
    failure: 'blocked',
  });

  const rules = [
    { then: { assignee: 'coder', column: 'doing', status_in_progress: 'coding', status_success: 'implemented' } },
    { then: { assignee: 'qa', column: 'review', status_in_progress: 'testing' } },
  ];

  assert.deepEqual(resolveStatusCfgForTask({ assignee: 'coder', column: 'doing', status: 'coding' }, rules, defaults), {
    todo: 'new',
    in_progress: 'coding',
    success: 'implemented',
    failure: 'blocked',
  });
  assert.deepEqual(resolveStatusCfgForTask({ assignee: '-', column: 'doing' }, rules, defaults), defaults);
});

test('transcript helpers are deterministic', () => {
  assert.equal(sanitizePathToken(' Task #1 / Coder ', 'fallback'), 'task_1_coder');
  assert.equal(sanitizePathToken('###', 'fallback'), 'fallback');

  const long = Array.from({ length: 8 }, (_, i) => `line ${i + 1}`).join('\n');
  assert.equal(
    transcriptForLlm(long, 2),
    'line 1\nline 2\n\n... [4 lines omitted] ...\n\nline 7\nline 8',
  );
});

test('lastCommentMeta returns latest dated author or latest author without dates', () => {
  assert.deepEqual(lastCommentMeta({ updates: [] }), { author: '', timestampMs: null });
  assert.deepEqual(lastCommentMeta({
    updates: [
      { author: 'coder' },
      { author: 'qa' },
    ],
  }), { author: 'qa', timestampMs: null });
  assert.deepEqual(lastCommentMeta({
    updates: [
      { author: 'qa', created_at: '2026-05-27T09:00:00.000Z' },
      { author: 'dispatcher', created_at: '2026-05-27T10:00:00.000Z' },
    ],
  }), { author: 'dispatcher', timestampMs: Date.parse('2026-05-27T10:00:00.000Z') });
});

test('parseDispatchArgs supports board and dir options', () => {
  assert.deepEqual(parseDispatchArgs(['--board', './board']), { help: false, boardPathHint: './board' });
  assert.deepEqual(parseDispatchArgs(['--dir=./board']), { help: false, boardPathHint: './board' });
  assert.deepEqual(parseDispatchArgs(['--help']), { help: true, boardPathHint: undefined });
  assert.throws(() => parseDispatchArgs(['--unknown']), /Unknown argument/);
});

test('parseLlmOutcomeResponse parses clean JSON outcome', () => {
  assert.deepEqual(
    parseLlmOutcomeResponse('{"outcome":"success","reason":"tests passed"}'),
    { outcome: 'success', reason: 'tests passed' },
  );
  assert.deepEqual(
    parseLlmOutcomeResponse('{"outcome":"failure","reason":"build error"}'),
    { outcome: 'failure', reason: 'build error' },
  );
});

test('parseLlmOutcomeResponse falls back to keyword search for non-JSON', () => {
  assert.equal(parseLlmOutcomeResponse('The task ended in success').outcome, 'success');
  assert.equal(parseLlmOutcomeResponse('There was a failure').outcome, 'failure');
});

test('parseLlmOutcomeResponse returns failure for ambiguous or empty input', () => {
  assert.equal(parseLlmOutcomeResponse('').outcome, 'failure');
  assert.equal(parseLlmOutcomeResponse('unknown result').outcome, 'failure');
  assert.match(parseLlmOutcomeResponse('').reason, /ambiguous/);
});

test('parseLlmOutcomeResponse is case-insensitive for keyword fallback', () => {
  assert.equal(parseLlmOutcomeResponse('Task completed: SUCCESS').outcome, 'success');
  assert.equal(parseLlmOutcomeResponse('Task completed: FAILURE').outcome, 'failure');
});

test('applyRule uses thenCfg.status when status_in_progress and defaults are both empty', () => {
  const task = { column: 'todo', status: 'new', assignee: '-' };
  applyRule(
    task,
    { then: { status: 'pending' } },
    { in_progress: '' },
    { now: () => '2026-01-01T00:00:00.000Z' },
  );
  assert.equal(task.status, 'pending');
});
