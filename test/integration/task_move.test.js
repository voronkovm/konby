const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const { run, makeBoard, addTask, cleanup } = require('./fixtures');

test('task_move updates column', () => {
  const dir = makeBoard();
  try {
    const taskPath = addTask(dir, 'Move me');
    const out = run('task_move', [taskPath, '--column', 'development']);
    assert.equal(out.status, 0, out.stderr);
    const content = fs.readFileSync(taskPath, 'utf8');
    assert.match(content, /column: development/);
  } finally {
    cleanup(dir);
  }
});

test('task_move updates status', () => {
  const dir = makeBoard();
  try {
    const taskPath = addTask(dir, 'Status task');
    const out = run('task_move', [taskPath, '--status', 'in_progress']);
    assert.equal(out.status, 0, out.stderr);
    const content = fs.readFileSync(taskPath, 'utf8');
    assert.match(content, /status: in_progress/);
  } finally {
    cleanup(dir);
  }
});

test('task_move adds comment to updates', () => {
  const dir = makeBoard();
  try {
    const taskPath = addTask(dir, 'Comment task');
    const out = run('task_move', [taskPath, '--comment', 'starting work']);
    assert.equal(out.status, 0, out.stderr);
    const content = fs.readFileSync(taskPath, 'utf8');
    assert.match(content, /starting work/);
    assert.match(content, /updates:/);
  } finally {
    cleanup(dir);
  }
});

test('task_move updates column and status together', () => {
  const dir = makeBoard();
  try {
    const taskPath = addTask(dir, 'Multi update');
    const out = run('task_move', [taskPath, '--column', 'review', '--status', 'in_progress']);
    assert.equal(out.status, 0, out.stderr);
    const content = fs.readFileSync(taskPath, 'utf8');
    assert.match(content, /column: review/);
    assert.match(content, /status: in_progress/);
  } finally {
    cleanup(dir);
  }
});

test('task_move exits with error for missing task file', () => {
  const out = run('task_move', ['/tmp/nonexistent-task.yaml', '--column', 'done']);
  assert.notEqual(out.status, 0);
});

test('task_move sets updated_at', () => {
  const dir = makeBoard();
  try {
    const taskPath = addTask(dir, 'Timestamp task');
    run('task_move', [taskPath, '--status', 'done']);
    const content = fs.readFileSync(taskPath, 'utf8');
    assert.match(content, /updated_at:/);
  } finally {
    cleanup(dir);
  }
});
