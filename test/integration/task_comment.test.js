const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const { run, makeBoard, addTask, cleanup } = require('./fixtures');

test('task_comment appends to updates array', () => {
  const dir = makeBoard();
  try {
    const taskPath = addTask(dir, 'Comment target');
    const out = run('task_comment', [taskPath, 'First comment']);
    assert.equal(out.status, 0, out.stderr);
    const content = fs.readFileSync(taskPath, 'utf8');
    assert.match(content, /updates:/);
    assert.match(content, /First comment/);
    assert.match(content, /author: user/);
  } finally {
    cleanup(dir);
  }
});

test('task_comment sets updated_at', () => {
  const dir = makeBoard();
  try {
    const taskPath = addTask(dir, 'Timestamp task');
    run('task_comment', [taskPath, 'A comment']);
    const content = fs.readFileSync(taskPath, 'utf8');
    assert.match(content, /updated_at:/);
  } finally {
    cleanup(dir);
  }
});

test('task_comment appends multiple comments', () => {
  const dir = makeBoard();
  try {
    const taskPath = addTask(dir, 'Multi comment');
    run('task_comment', [taskPath, 'First']);
    run('task_comment', [taskPath, 'Second']);
    const content = fs.readFileSync(taskPath, 'utf8');
    assert.match(content, /First/);
    assert.match(content, /Second/);
  } finally {
    cleanup(dir);
  }
});

test('task_comment prints confirmation to stdout', () => {
  const dir = makeBoard();
  try {
    const taskPath = addTask(dir, 'Output check');
    const out = run('task_comment', [taskPath, 'hello']);
    assert.equal(out.status, 0);
    assert.match(out.stdout, /Comment added/);
  } finally {
    cleanup(dir);
  }
});

test('task_comment exits with error for missing task file', () => {
  const out = run('task_comment', ['/tmp/no-such-task.yaml', 'comment']);
  assert.notEqual(out.status, 0);
  assert.match(out.stderr, /Error:/);
});

test('task_comment exits with error when comment is missing', () => {
  const dir = makeBoard();
  try {
    const taskPath = addTask(dir, 'No comment');
    const out = run('task_comment', [taskPath]);
    assert.notEqual(out.status, 0);
  } finally {
    cleanup(dir);
  }
});
