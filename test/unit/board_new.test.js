const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { copyPresetTree, createFileIfMissing, setWorkspaceDefaultContent } = require('../../lib/board_new');

const SCHEMA_WITH_DEFAULT = `
properties:
  workspace:
    type: string
    default: "/old/path"
    description: workspace dir
  title:
    type: string
`.trim();

const SCHEMA_WITHOUT_DEFAULT = `
properties:
  workspace:
    type: string
    description: workspace dir
  title:
    type: string
`.trim();

const SCHEMA_NO_WORKSPACE = `
properties:
  title:
    type: string
`.trim();

test('setWorkspaceDefaultContent replaces an existing default value', () => {
  const result = setWorkspaceDefaultContent(SCHEMA_WITH_DEFAULT, '/new/path');
  assert.match(result, /default: "\/new\/path"/);
  assert.doesNotMatch(result, /\/old\/path/);
});

test('setWorkspaceDefaultContent inserts default when none exists', () => {
  const result = setWorkspaceDefaultContent(SCHEMA_WITHOUT_DEFAULT, '/my/workspace');
  assert.match(result, /default: "\/my\/workspace"/);
});

test('setWorkspaceDefaultContent is a no-op when workspace key is absent', () => {
  const result = setWorkspaceDefaultContent(SCHEMA_NO_WORKSPACE, '/ignored');
  assert.equal(result, SCHEMA_NO_WORKSPACE);
  assert.doesNotMatch(result, /default/);
});

test('setWorkspaceDefaultContent handles content ending inside workspace block', () => {
  const content = 'properties:\n  workspace:\n    type: string';
  const result = setWorkspaceDefaultContent(content, '/end');
  assert.match(result, /default: "\/end"/);
});

test('setWorkspaceDefaultContent preserves lines before and after workspace block', () => {
  const content = 'title: schema\nproperties:\n  workspace:\n    default: "/old"\n  id:\n    type: string';
  const result = setWorkspaceDefaultContent(content, '/new');
  assert.match(result, /title: schema/);
  assert.match(result, /id:/);
  assert.match(result, /default: "\/new"/);
  assert.doesNotMatch(result, /\/old/);
});

test('createFileIfMissing copies file when destination does not exist', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'konby-bn-test-'));
  const src = path.join(tmpDir, 'src.txt');
  const dst = path.join(tmpDir, 'dst.txt');
  fs.writeFileSync(src, 'hello', 'utf8');
  createFileIfMissing(src, dst, false);
  assert.equal(fs.readFileSync(dst, 'utf8'), 'hello');
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('createFileIfMissing skips existing file when force is false', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'konby-bn-test-'));
  const src = path.join(tmpDir, 'src.txt');
  const dst = path.join(tmpDir, 'dst.txt');
  fs.writeFileSync(src, 'new content', 'utf8');
  fs.writeFileSync(dst, 'original', 'utf8');
  createFileIfMissing(src, dst, false);
  assert.equal(fs.readFileSync(dst, 'utf8'), 'original');
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('createFileIfMissing overwrites existing file when force is true', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'konby-bn-test-'));
  const src = path.join(tmpDir, 'src.txt');
  const dst = path.join(tmpDir, 'dst.txt');
  fs.writeFileSync(src, 'new content', 'utf8');
  fs.writeFileSync(dst, 'original', 'utf8');
  createFileIfMissing(src, dst, true);
  assert.equal(fs.readFileSync(dst, 'utf8'), 'new content');
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('copyPresetTree mirrors directory tree from source to destination', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'konby-bn-test-'));
  const src = path.join(tmpDir, 'preset');
  const dst = path.join(tmpDir, 'board');
  fs.mkdirSync(path.join(src, 'agents'), { recursive: true });
  fs.writeFileSync(path.join(src, 'dispatch.yaml'), 'board: {}', 'utf8');
  fs.writeFileSync(path.join(src, 'agents', 'coder.yaml'), 'role: coder', 'utf8');
  fs.mkdirSync(dst, { recursive: true });
  copyPresetTree(src, dst, false);
  assert.ok(fs.existsSync(path.join(dst, 'dispatch.yaml')));
  assert.ok(fs.existsSync(path.join(dst, 'agents', 'coder.yaml')));
  assert.equal(fs.readFileSync(path.join(dst, 'dispatch.yaml'), 'utf8'), 'board: {}');
  fs.rmSync(tmpDir, { recursive: true, force: true });
});
