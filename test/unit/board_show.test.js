const test = require('node:test');
const assert = require('node:assert/strict');
const {
  appendMoveComment,
  buildMoveOptionsFromData,
  buildTasksByColumn,
  clampScrollOffset,
  moveSelection,
  nextMoveField,
  normalizeSelection,
  parseBoardShowArgs,
  parseMouseWheelDelta,
  renderBoard,
  renderTaskDetails,
  selectedTask,
  taskLabel,
  truncate,
  uniqInOrder,
  visibleColumns,
  wrapText,
} = require('../../lib/board_show');

function makeState() {
  const columns = [{ name: 'todo', wip_limit: 3 }, { name: 'doing', wip_limit: 1 }, { name: 'done' }];
  const tasks = [
    { file: '1-login.yaml', id: '1-login', title: 'Login', column: 'todo', status: 'todo', assignee: '-', data: { title: 'Login' } },
    { file: '2-api.yaml', id: '2-api', title: 'API', column: 'doing', status: 'active', assignee: 'coder', data: { title: 'API', status: 'active' } },
    { file: '3-lost.yaml', id: '3-lost', title: 'Lost', column: 'unknown', status: 'todo', assignee: '-', data: { title: 'Lost' } },
  ];
  return {
    board: {
      dispatchFile: '/tmp/board/dispatch.yaml',
      columns,
      tasks,
      tasksByColumn: buildTasksByColumn(columns, tasks),
    },
    selectedCol: 0,
    selectedTask: 0,
    mode: 'normal',
    moveField: 'column',
    moveDraft: { column: '', status: '', assignee: '', comment: '' },
    addBuffer: '',
    commentBuffer: '',
    detailsScroll: 0,
    message: '',
  };
}

test('truncate, wrapText, and taskLabel format compact terminal text', () => {
  assert.equal(truncate('abcdef', 4), 'abc…');
  assert.deepEqual(wrapText('abcdef', 2), ['ab', 'cd', 'ef']);
  assert.equal(taskLabel({ id: '12-login', title: 'Fix login' }), '#12 - Fix login');
  assert.equal(taskLabel({ id: 'abc', title: '' }), '#abc - abc');
});

test('buildTasksByColumn groups unknown columns into unmapped', () => {
  const state = makeState();
  assert.deepEqual([...state.board.tasksByColumn.keys()], ['todo', 'doing', 'done', 'unmapped']);
  assert.equal(state.board.tasksByColumn.get('todo').length, 1);
  assert.equal(state.board.tasksByColumn.get('unmapped')[0].file, '3-lost.yaml');
  assert.deepEqual(visibleColumns(state.board).map((c) => c.name), ['todo', 'doing', 'done', 'unmapped']);
});

test('normalizeSelection clamps selected column and task', () => {
  const state = makeState();
  state.selectedCol = 99;
  state.selectedTask = 99;
  normalizeSelection(state);
  assert.equal(state.selectedCol, 3);
  assert.equal(state.selectedTask, 0);

  state.selectedCol = -1;
  state.selectedTask = -1;
  normalizeSelection(state);
  assert.equal(state.selectedCol, 0);
  assert.equal(state.selectedTask, 0);
});

test('selectedTask and moveSelection skip empty columns when moving sideways', () => {
  const state = makeState();
  assert.equal(selectedTask(state).file, '1-login.yaml');

  moveSelection(state, 1, 0);
  assert.equal(state.selectedCol, 1);
  assert.equal(selectedTask(state).file, '2-api.yaml');

  moveSelection(state, 1, 0);
  assert.equal(state.selectedCol, 3);
  assert.equal(selectedTask(state).file, '3-lost.yaml');
});

test('renderBoard is deterministic with fixed width and date text', () => {
  const state = makeState();
  const output = renderBoard(state, { width: 80, nowText: 'NOW', dispatchName: 'dispatch.yaml' });
  assert.match(output, /^KANBAN  NOW  config=dispatch\.yaml/);
  assert.match(output, /todo \[1\/3\]/);
  assert.match(output, /doing \[1\/1\]/);
  assert.match(output, /unmapped \[1\/-\]/);
  assert.match(output, /\x1b\[7m#1 - Login/);
});

test('renderTaskDetails clamps scroll and renders task yaml', () => {
  const state = makeState();
  state.selectedCol = 1;
  state.detailsScroll = 99;
  const output = renderTaskDetails(state, { width: 80, height: 8 });
  assert.match(output, /^TASK  2-api.yaml/);
  assert.match(output, /title: API/);
  assert.ok(state.detailsScroll >= 0);
});

test('appendMoveComment normalizes line endings', () => {
  const state = { moveDraft: { comment: '' } };
  appendMoveComment(state, 'a\r\nb\rc');
  assert.equal(state.moveDraft.comment, 'a\nb\nc');
});

test('uniqInOrder keeps first occurrence and stringifies values', () => {
  assert.deepEqual(uniqInOrder(['b', 'a', 'b', 3, null, '', 3]), ['b', 'a', '3']);
});

test('parseMouseWheelDelta recognizes SGR wheel events', () => {
  assert.equal(parseMouseWheelDelta('\x1b[<64;1;1M'), -3);
  assert.equal(parseMouseWheelDelta('\x1b[<65;1;1M'), 3);
  assert.equal(parseMouseWheelDelta('x'), 0);
});

test('parseBoardShowArgs supports positional and --board forms', () => {
  assert.deepEqual(parseBoardShowArgs(['./board']), { help: false, boardPathHint: './board' });
  assert.deepEqual(parseBoardShowArgs(['--board', './board']), { help: false, boardPathHint: './board' });
  assert.deepEqual(parseBoardShowArgs(['--board=./board']), { help: false, boardPathHint: './board' });
  assert.deepEqual(parseBoardShowArgs(['--help']), { help: true, boardPathHint: undefined });
  assert.throws(() => parseBoardShowArgs(['--bad']), /Unknown argument/);
  assert.throws(() => parseBoardShowArgs(['a', 'b']), /Usage/);
});

test('nextMoveField cycles forward through column→status→assignee→comment', () => {
  assert.equal(nextMoveField('column', 1), 'status');
  assert.equal(nextMoveField('status', 1), 'assignee');
  assert.equal(nextMoveField('assignee', 1), 'comment');
  assert.equal(nextMoveField('comment', 1), 'column');
});

test('nextMoveField cycles backward through column→comment→assignee→status', () => {
  assert.equal(nextMoveField('column', -1), 'comment');
  assert.equal(nextMoveField('comment', -1), 'assignee');
  assert.equal(nextMoveField('assignee', -1), 'status');
  assert.equal(nextMoveField('status', -1), 'column');
});

test('nextMoveField defaults to column for unknown field', () => {
  assert.equal(nextMoveField('unknown', 1), 'column');
  assert.equal(nextMoveField('', -1), 'column');
});

test('clampScrollOffset clamps within valid range', () => {
  assert.equal(clampScrollOffset(0, 3, 20, 10), 3);
  assert.equal(clampScrollOffset(8, 3, 20, 10), 10);
  assert.equal(clampScrollOffset(0, -1, 20, 10), 0);
  assert.equal(clampScrollOffset(5, -3, 20, 10), 2);
});

test('clampScrollOffset returns 0 when content fits entirely', () => {
  assert.equal(clampScrollOffset(0, 5, 5, 10), 0);
  assert.equal(clampScrollOffset(0, 5, 3, 10), 0);
});

test('buildMoveOptionsFromData assembles options from provided data', () => {
  const columns = [{ name: 'backlog' }, { name: 'doing' }, { name: 'done' }];
  const statuses = ['todo', 'in_progress', 'done'];
  const agents = ['coder', 'qa'];
  const opts = buildMoveOptionsFromData(columns, statuses, agents);
  assert.deepEqual(opts.column, ['backlog', 'doing', 'done']);
  assert.deepEqual(opts.status, ['todo', 'in_progress', 'done']);
  assert.deepEqual(opts.assignee, ['-', 'coder', 'qa']);
});

test('buildMoveOptionsFromData uses default statuses when statuses is empty', () => {
  const opts = buildMoveOptionsFromData([], [], []);
  assert.deepEqual(opts.status, ['todo', 'in_progress', 'blocked', 'review', 'done']);
  assert.deepEqual(opts.assignee, ['-']);
});

test('buildMoveOptionsFromData deduplicates and skips nullish column names', () => {
  const columns = [{ name: 'todo' }, null, { name: 'todo' }, { name: 'done' }];
  const opts = buildMoveOptionsFromData(columns, ['open'], ['agent1', 'agent1']);
  assert.deepEqual(opts.column, ['todo', 'done']);
  assert.deepEqual(opts.assignee, ['-', 'agent1']);
});

test('renderBoard shows confirm_archive prompt with selected task file', () => {
  const state = makeState();
  state.mode = 'confirm_archive';
  const output = renderBoard(state, { width: 80, nowText: 'NOW', dispatchName: 'dispatch.yaml' });
  assert.match(output, /Archive 1-login\.yaml\? \(y\/Enter = yes, n\/Esc = no\)/);
});

test('renderTaskDetails shows confirm_archive prompt', () => {
  const state = makeState();
  state.selectedCol = 1;
  state.mode = 'confirm_archive';
  const output = renderTaskDetails(state, { width: 80, height: 20 });
  assert.match(output, /Archive 2-api\.yaml\? \(y\/Enter = yes, n\/Esc = no\)/);
});
