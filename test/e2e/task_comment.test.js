'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { run, makeBoard, addTask, cleanup } = require('../integration/fixtures');
const { loadYaml } = require('../../lib/yaml');

function runTaskComment(args) {
  return run('task_comment', args);
}

test('task_comment prints usage with --help', () => {
  const out = runTaskComment(['--help']);
  assert.equal(out.status, 0);
  assert.match(out.stdout, /Usage: task_comment/);
});

test('task_comment prints usage with no arguments', () => {
  const out = runTaskComment([]);
  assert.equal(out.status, 0);
  assert.match(out.stdout, /Usage: task_comment/);
});

test('task_comment adds a comment to a task file', () => {
  const boardDir = makeBoard({ preset: 'swe' });
  try {
    const taskFile = addTask(boardDir, 'Comment test task');
    const out = runTaskComment([taskFile, 'My first comment']);
    assert.equal(out.status, 0, `stderr: ${out.stderr}`);
    assert.match(out.stdout, /Comment added:/);
    assert.ok(out.stdout.includes(taskFile));

    const task = loadYaml(taskFile);
    assert.ok(Array.isArray(task.updates));
    const comment = task.updates.find((u) => u.text === 'My first comment');
    assert.ok(comment, 'comment not found in task updates');
    assert.equal(comment.author, 'user');
    assert.ok(comment.created_at);
  } finally {
    cleanup(boardDir);
  }
});

test('task_comment appends to existing updates', () => {
  const boardDir = makeBoard({ preset: 'swe' });
  try {
    const taskFile = addTask(boardDir, 'Multi-comment task');
    runTaskComment([taskFile, 'First comment']);
    runTaskComment([taskFile, 'Second comment']);

    const task = loadYaml(taskFile);
    assert.ok(task.updates.length >= 2);
    const texts = task.updates.map((u) => u.text);
    assert.ok(texts.includes('First comment'));
    assert.ok(texts.includes('Second comment'));
  } finally {
    cleanup(boardDir);
  }
});

test('task_comment fails when task file does not exist', () => {
  const out = runTaskComment(['/tmp/konby-no-such-task.yaml', 'some comment']);
  assert.notEqual(out.status, 0);
  assert.match(out.stderr, /Task file not found/i);
});

test('task_comment fails when comment argument is missing', () => {
  const boardDir = makeBoard({ preset: 'swe' });
  try {
    const taskFile = addTask(boardDir, 'No comment task');
    const out = runTaskComment([taskFile]);
    assert.notEqual(out.status, 0);
    assert.match(out.stderr, /Usage/i);
  } finally {
    cleanup(boardDir);
  }
});
