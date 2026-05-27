const test = require('node:test');
const assert = require('node:assert/strict');
const { applyTaskMove, parseMoveArgs } = require('../../lib/task_move');

test('parseMoveArgs supports column alias and common update flags', () => {
  assert.deepEqual(
    parseMoveArgs([
      'tasks/1-test.yaml',
      '--stage',
      'doing',
      '--status',
      'in_progress',
      '--assignee',
      'coder',
      '--comment',
      'Started',
      '--attachment',
      'transcripts/1.txt',
      '--author',
      'dispatcher',
    ]),
    {
      taskFile: 'tasks/1-test.yaml',
      column: 'doing',
      status: 'in_progress',
      assignee: 'coder',
      comment: 'Started',
      attachment: 'transcripts/1.txt',
      author: 'dispatcher',
    },
  );
});

test('parseMoveArgs rejects empty update requests', () => {
  assert.throws(() => parseMoveArgs(['tasks/1-test.yaml']), /At least one/);
  assert.deepEqual(parseMoveArgs([]), { help: true });
});

test('applyTaskMove updates task fields and appends audit update', () => {
  const result = applyTaskMove(
    {
      title: 'Test',
      column: 'backlog',
      status: 'todo',
      assignee: '-',
    },
    {
      column: 'doing',
      status: 'in_progress',
      assignee: 'coder',
      comment: 'Started',
      attachment: 'transcripts/1.txt',
      author: 'dispatcher',
    },
    { now: () => '2026-05-27T10:00:00.000Z' },
  );

  assert.equal(result.prevAssignee, '-');
  assert.equal(result.nextAssignee, 'coder');
  assert.equal(result.assigneeChanged, true);
  assert.deepEqual(result.task, {
    title: 'Test',
    column: 'doing',
    status: 'in_progress',
    assignee: 'coder',
    updates: [{
      author: 'dispatcher',
      text: 'status: todo -> in_progress, column: backlog -> doing, assignee: - -> coder, comment: Started',
      created_at: '2026-05-27T10:00:00.000Z',
      attachments: ['transcripts/1.txt'],
    }],
    updated_at: '2026-05-27T10:00:00.000Z',
  });
});

test('applyTaskMove rejects empty comment and author', () => {
  assert.throws(() => applyTaskMove({}, { comment: '   ' }), /--comment cannot be empty/);
  assert.throws(() => applyTaskMove({}, { status: 'todo', author: '   ' }), /--author cannot be empty/);
});
