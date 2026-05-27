'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { run, cleanup } = require('../integration/fixtures');

function runBoardNew(args) {
  return run('board_new', args);
}

test('board_new prints usage and exits 1 with no arguments', () => {
  const out = runBoardNew([]);
  assert.equal(out.status, 1);
  assert.match(out.stdout, /Usage:/i);
});

test('board_new prints usage and exits 0 with --help', () => {
  const out = runBoardNew(['--help']);
  assert.equal(out.status, 0);
  assert.match(out.stdout, /Usage:/i);
});

test('board_new creates board with default preset', () => {
  const boardDir = fs.mkdtempSync(path.join(os.tmpdir(), 'konby-bn-'));
  fs.rmSync(boardDir, { recursive: true, force: true });
  try {
    const out = runBoardNew([boardDir]);
    assert.equal(out.status, 0, `stderr: ${out.stderr}`);
    assert.match(out.stdout, /Board initialized in:/);
    assert.ok(fs.existsSync(path.join(boardDir, 'dispatch.yaml')));
    assert.ok(fs.existsSync(path.join(boardDir, 'tasks')));
    assert.ok(fs.existsSync(path.join(boardDir, 'transcripts')));
  } finally {
    cleanup(boardDir);
  }
});

test('board_new --workspace sets default workspace in task.schema.yaml', () => {
  const boardDir = fs.mkdtempSync(path.join(os.tmpdir(), 'konby-bn-'));
  const wsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'konby-ws-'));
  fs.rmSync(boardDir, { recursive: true, force: true });
  try {
    const out = runBoardNew([boardDir, '--workspace', wsDir]);
    assert.equal(out.status, 0, `stderr: ${out.stderr}`);
    assert.match(out.stdout, /Updated workspace default in:/);

    const schemaContent = fs.readFileSync(path.join(boardDir, 'task.schema.yaml'), 'utf8');
    assert.ok(schemaContent.includes(wsDir), 'workspace path not found in task.schema.yaml');
  } finally {
    cleanup(boardDir);
    cleanup(wsDir);
  }
});

test('board_new --force overwrites existing files', () => {
  const boardDir = fs.mkdtempSync(path.join(os.tmpdir(), 'konby-bn-'));
  fs.rmSync(boardDir, { recursive: true, force: true });
  try {
    runBoardNew([boardDir]);
    const schemaPath = path.join(boardDir, 'task.schema.yaml');
    const originalContent = fs.readFileSync(schemaPath, 'utf8');
    fs.writeFileSync(schemaPath, 'modified content\n', 'utf8');

    const out = runBoardNew([boardDir, '--force']);
    assert.equal(out.status, 0, `stderr: ${out.stderr}`);
    assert.match(out.stdout, /Created:/);
    const afterContent = fs.readFileSync(schemaPath, 'utf8');
    assert.equal(afterContent, originalContent);
  } finally {
    cleanup(boardDir);
  }
});

test('board_new fails with unknown preset', () => {
  const boardDir = fs.mkdtempSync(path.join(os.tmpdir(), 'konby-bn-'));
  fs.rmSync(boardDir, { recursive: true, force: true });
  try {
    const out = runBoardNew([boardDir, '--preset', 'nonexistent-preset-xyz']);
    assert.notEqual(out.status, 0);
    assert.match(out.stderr, /Preset not found/i);
  } finally {
    if (fs.existsSync(boardDir)) cleanup(boardDir);
  }
});

test('board_new fails with unknown argument', () => {
  const boardDir = fs.mkdtempSync(path.join(os.tmpdir(), 'konby-bn-'));
  fs.rmSync(boardDir, { recursive: true, force: true });
  try {
    const out = runBoardNew([boardDir, '--unknown-flag']);
    assert.notEqual(out.status, 0);
    assert.match(out.stderr, /Unknown argument/i);
  } finally {
    if (fs.existsSync(boardDir)) cleanup(boardDir);
  }
});

test('board_new fails when --preset has no value', () => {
  const boardDir = fs.mkdtempSync(path.join(os.tmpdir(), 'konby-bn-'));
  fs.rmSync(boardDir, { recursive: true, force: true });
  try {
    const out = runBoardNew([boardDir, '--preset']);
    assert.notEqual(out.status, 0);
    assert.match(out.stderr, /Missing value after --preset/i);
  } finally {
    if (fs.existsSync(boardDir)) cleanup(boardDir);
  }
});

test('board_new fails when --workspace has no value', () => {
  const boardDir = fs.mkdtempSync(path.join(os.tmpdir(), 'konby-bn-'));
  fs.rmSync(boardDir, { recursive: true, force: true });
  try {
    const out = runBoardNew([boardDir, '--workspace']);
    assert.notEqual(out.status, 0);
    assert.match(out.stderr, /Missing value after --workspace/i);
  } finally {
    if (fs.existsSync(boardDir)) cleanup(boardDir);
  }
});
