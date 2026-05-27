'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');

const { run, makeBoard, addTask, cleanup } = require('../integration/fixtures');

test('task_move saves attachment path', () => {
  const dir = makeBoard();
  try {
    const taskPath = addTask(dir, 'Attachment task');
    const out = run('task_move', [taskPath, '--attachment', 'output/result.txt']);
    assert.equal(out.status, 0, out.stderr);
    const content = fs.readFileSync(taskPath, 'utf8');
    assert.match(content, /output\/result\.txt/);
    assert.match(content, /attachments:/);
  } finally {
    cleanup(dir);
  }
});

test('task_move uses custom author in comment', () => {
  const dir = makeBoard();
  try {
    const taskPath = addTask(dir, 'Author task');
    const out = run('task_move', [taskPath, '--status', 'done', '--author', 'bot']);
    assert.equal(out.status, 0, out.stderr);
    const content = fs.readFileSync(taskPath, 'utf8');
    assert.match(content, /author: bot/);
  } finally {
    cleanup(dir);
  }
});

test('task_move prints session stats when assignee changes', () => {
  const dir = makeBoard();
  try {
    const taskPath = addTask(dir, 'Session stats task', ['--assignee', 'alice']);
    const out = run('task_move', [taskPath, '--assignee', 'bob']);
    assert.equal(out.status, 0, out.stderr);
    assert.match(out.stdout, /Task sessions: found=\d+, closed=\d+, transcript_updated=\d+/);
    const content = fs.readFileSync(taskPath, 'utf8');
    assert.match(content, /assignee: bob/);
  } finally {
    cleanup(dir);
  }
});

test('task_move prints no session stats when assignee is unchanged', () => {
  const dir = makeBoard();
  try {
    const taskPath = addTask(dir, 'No session stats task', ['--assignee', 'alice']);
    const out = run('task_move', [taskPath, '--column', 'done', '--assignee', 'alice']);
    assert.equal(out.status, 0, out.stderr);
    assert.doesNotMatch(out.stdout, /Task sessions:/);
  } finally {
    cleanup(dir);
  }
});

test('task_move prints no session stats when only column changes', () => {
  const dir = makeBoard();
  try {
    const taskPath = addTask(dir, 'Column only task');
    const out = run('task_move', [taskPath, '--column', 'review']);
    assert.equal(out.status, 0, out.stderr);
    assert.doesNotMatch(out.stdout, /Task sessions:/);
  } finally {
    cleanup(dir);
  }
});

test('task_move prints usage and exits 0 with --help', () => {
  const out = run('task_move', ['--help']);
  assert.equal(out.status, 0);
  assert.match(out.stdout, /Usage: task_move/i);
});
