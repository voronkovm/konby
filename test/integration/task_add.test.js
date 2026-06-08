const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { run, makeBoard, addTask, cleanup } = require('./fixtures');

test('task_add creates a yaml file in tasks/', () => {
  const dir = makeBoard();
  try {
    const taskPath = addTask(dir, 'Fix the bug');
    assert.ok(taskPath, 'should return task path');
    assert.ok(fs.existsSync(taskPath));
    assert.match(taskPath, /tasks\//);
    assert.match(taskPath, /\.yaml$/);
  } finally {
    cleanup(dir);
  }
});

test('task_add yaml contains required fields', () => {
  const dir = makeBoard();
  try {
    const taskPath = addTask(dir, 'Add feature');
    const content = fs.readFileSync(taskPath, 'utf8');
    assert.match(content, /title:/);
    assert.match(content, /created_at:/);
    // id is encoded in the filename, not repeated in the body
    assert.match(path.basename(taskPath), /^[a-z0-9][a-z0-9-]*\.yaml$/);
  } finally {
    cleanup(dir);
  }
});

test('task_add stores positional task text as description and creates fallback title', () => {
  const dir = makeBoard();
  try {
    const out = run('task_add', ['--board', dir, 'My specific task description with extra words']);
    assert.equal(out.status, 0, out.stderr || out.stdout);
    const match = out.stdout.match(/Task added to (.+)/);
    const taskPath = match && match[1].trim();
    assert.ok(taskPath);
    const content = fs.readFileSync(taskPath, 'utf8');
    // YAML serializer quotes strings with spaces
    assert.match(content, /title: "My specific task description with"/);
    assert.match(content, /description: "My specific task description with extra words"/);
  } finally {
    cleanup(dir);
  }
});

test('task_add keeps explicit --title as title', () => {
  const dir = makeBoard();
  try {
    const taskPath = addTask(dir, 'My explicit title');
    const content = fs.readFileSync(taskPath, 'utf8');
    assert.match(content, /title: "My explicit title"/);
    assert.doesNotMatch(content, /description:/);
  } finally {
    cleanup(dir);
  }
});

test('task_add accepts long description text', () => {
  const dir = makeBoard();
  try {
    const longDescription = `one two three four five six ${'details '.repeat(1500)}`.trim();
    assert.ok(longDescription.length > 10000);
    const out = run('task_add', ['--board', dir, '--description', longDescription]);
    assert.equal(out.status, 0, out.stderr || out.stdout);
    const match = out.stdout.match(/Task added to (.+)/);
    const taskPath = match && match[1].trim();
    assert.ok(taskPath);
    const content = fs.readFileSync(taskPath, 'utf8');
    assert.match(content, /title: "one two three four five"/);
    assert.ok(content.includes(longDescription));
  } finally {
    cleanup(dir);
  }
});

test('task_add respects --column flag', () => {
  const dir = makeBoard();
  try {
    const taskPath = addTask(dir, 'In development', ['--column', 'development']);
    const content = fs.readFileSync(taskPath, 'utf8');
    assert.match(content, /column: development/);
  } finally {
    cleanup(dir);
  }
});

test('task_add respects --status flag', () => {
  const dir = makeBoard();
  try {
    const taskPath = addTask(dir, 'Already done', ['--status', 'done']);
    const content = fs.readFileSync(taskPath, 'utf8');
    assert.match(content, /status: done/);
  } finally {
    cleanup(dir);
  }
});

test('task_add increments task number for each task', () => {
  const dir = makeBoard();
  try {
    const p1 = addTask(dir, 'First task');
    const p2 = addTask(dir, 'Second task');
    assert.notEqual(p1, p2);
    const files = fs.readdirSync(path.join(dir, 'tasks'));
    assert.equal(files.length, 2);
  } finally {
    cleanup(dir);
  }
});

test('task_add exits with error when board has no schema', () => {
  const dir = makeBoard();
  try {
    fs.unlinkSync(path.join(dir, 'task.schema.yaml'));
    const out = run('task_add', ['--board', dir, '--title', 'Test'], { OPENAI_API_KEY: '' });
    assert.notEqual(out.status, 0);
  } finally {
    cleanup(dir);
  }
});
