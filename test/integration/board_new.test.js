const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { run, makeBoard, cleanup } = require('./fixtures');

test('board_new creates required files and directories', () => {
  const dir = makeBoard();
  try {
    assert.ok(fs.existsSync(path.join(dir, 'dispatch.yaml')));
    assert.ok(fs.existsSync(path.join(dir, 'task.schema.yaml')));
    assert.ok(fs.statSync(path.join(dir, 'tasks')).isDirectory());
    assert.ok(fs.statSync(path.join(dir, 'transcripts')).isDirectory());
    assert.ok(fs.statSync(path.join(dir, 'agents')).isDirectory());
  } finally {
    cleanup(dir);
  }
});

test('board_new prints board path on success', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'konby-test-'));
  try {
    const out = run('board_new', [tmpDir]);
    assert.equal(out.status, 0);
    assert.match(out.stdout, /Board initialized in:/);
  } finally {
    cleanup(tmpDir);
  }
});

test('board_new --workspace sets default in task.schema.yaml', () => {
  const dir = makeBoard({ workspace: '/my/project' });
  try {
    const schema = fs.readFileSync(path.join(dir, 'task.schema.yaml'), 'utf8');
    assert.match(schema, /default: "\/my\/project"/);
  } finally {
    cleanup(dir);
  }
});

test('board_new fails with unknown preset', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'konby-test-'));
  try {
    const out = run('board_new', [tmpDir, '--preset', 'nonexistent']);
    assert.notEqual(out.status, 0);
    assert.match(out.stderr, /Preset not found/);
  } finally {
    cleanup(tmpDir);
  }
});

test('board_new fails with no arguments', () => {
  const out = run('board_new', []);
  assert.notEqual(out.status, 0);
});

test('board_new --force overwrites existing files', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'konby-test-'));
  try {
    run('board_new', [tmpDir]);
    const schemaPath = path.join(tmpDir, 'task.schema.yaml');
    const before = fs.readFileSync(schemaPath, 'utf8');
    const out = run('board_new', [tmpDir, '--force']);
    assert.equal(out.status, 0);
    assert.equal(fs.readFileSync(schemaPath, 'utf8'), before);
  } finally {
    cleanup(tmpDir);
  }
});
