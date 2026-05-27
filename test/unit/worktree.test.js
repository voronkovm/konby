const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('child_process');
const path = require('path');
const {
  sanitizeBranchName,
  sanitizeBranchComponent,
  taskBoardSlugFromTaskFile,
  taskBranchName,
  taskSlugFromTaskFile,
  taskWorktreeDir,
} = require('../../lib/worktree');

test('sanitizeBranchName normalizes branch-safe names', () => {
  assert.equal(sanitizeBranchName(' Feature: OAuth Login!! '), 'feature-oauth-login');
  assert.equal(sanitizeBranchName('boards//sprint 1/task'), 'boards/sprint-1/task');
  assert.equal(sanitizeBranchName('/boards/task/'), 'boards/task');
});

test('task slug and board slug are derived from task path only', () => {
  assert.equal(taskSlugFromTaskFile('/tmp/board/tasks/10-login.yaml'), '10-login');
  assert.equal(taskBoardSlugFromTaskFile('/tmp/product board/tasks/10-login.yaml'), 'tasks');
  assert.equal(taskBranchName('/tmp/product board/tasks/10-login.yaml'), 'tasks/10-login');
});

test('taskWorktreeDir maps branch path separators to stable directory separators', () => {
  assert.equal(
    taskWorktreeDir('/repo', '/tmp/board/tasks/10-login.yaml'),
    '/repo/.konby-worktrees/tasks__10-login',
  );
});

test('sanitizeBranchComponent falls back after sanitization', () => {
  assert.equal(sanitizeBranchComponent('###', 'fallback'), 'fallback');
});

test('worktree.js CLI task-branch returns expected branch name', () => {
  const worktreeJsPath = path.join(__dirname, '..', '..', 'lib', 'worktree.js');
  const out = execFileSync(process.execPath, [worktreeJsPath, 'task-branch', '--task', '/repo/tasks/10-login.yaml'], { encoding: 'utf8' });
  assert.equal(out.trim(), 'tasks/10-login');
});

test('worktree.js CLI task-worktree-dir returns expected path', () => {
  const worktreeJsPath = path.join(__dirname, '..', '..', 'lib', 'worktree.js');
  const out = execFileSync(process.execPath, [worktreeJsPath, 'task-worktree-dir', '--task', '/repo/tasks/10-login.yaml', '--repo', '/myrepo'], { encoding: 'utf8' });
  assert.equal(out.trim(), '/myrepo/.konby-worktrees/tasks__10-login');
});

test('worktree.js CLI throws for unknown command', () => {
  const worktreeJsPath = path.join(__dirname, '..', '..', 'lib', 'worktree.js');
  assert.throws(
    () => execFileSync(process.execPath, [worktreeJsPath, 'unknown-cmd', '--task', '/repo/tasks/t.yaml'], { encoding: 'utf8' }),
    /unknown-cmd/,
  );
});

test('worktree.js CLI prints help when no args given', () => {
  const worktreeJsPath = path.join(__dirname, '..', '..', 'lib', 'worktree.js');
  const out = execFileSync(process.execPath, [worktreeJsPath, '--help'], { encoding: 'utf8' });
  assert.match(out, /Usage/);
});

test('worktree.js CLI throws for flag missing value', () => {
  const worktreeJsPath = path.join(__dirname, '..', '..', 'lib', 'worktree.js');
  assert.throws(
    () => execFileSync(process.execPath, [worktreeJsPath, 'task-branch', '--task'], { encoding: 'utf8', stdio: 'pipe' }),
  );
});
