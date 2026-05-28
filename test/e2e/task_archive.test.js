'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const { run, makeBoard, addTask, cleanup, BIN } = require('../integration/fixtures');

function runTaskArchive(args) {
  return spawnSync(path.join(BIN, 'task_archive'), args, { encoding: 'utf8' });
}

function git(cwd, args) {
  return spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8' });
}

function makeGitRepo(dir) {
  fs.mkdirSync(dir, { recursive: true });
  spawnSync('git', ['init', dir], { encoding: 'utf8' });
  git(dir, ['config', 'user.email', 'test@example.com']);
  git(dir, ['config', 'user.name', 'Test']);
  fs.writeFileSync(path.join(dir, 'README.md'), '# test\n');
  git(dir, ['add', '.']);
  git(dir, ['commit', '-m', 'init']);
}

test('task_archive prints usage and exits 1 with no arguments', () => {
  const out = runTaskArchive([]);
  assert.equal(out.status, 1);
  assert.match(out.stdout, /Usage: task_archive/i);
});

test('task_archive prints usage and exits 0 with --help', () => {
  const out = runTaskArchive(['--help']);
  assert.equal(out.status, 0);
  assert.match(out.stdout, /Usage: task_archive/i);
});

test('task_archive fails when task file does not exist', () => {
  const out = runTaskArchive(['/tmp/konby-no-such-task.yaml']);
  assert.notEqual(out.status, 0);
  assert.match(out.stderr, /Task file not found/i);
});

test('task_archive moves task to .archive directory', () => {
  const boardDir = makeBoard({ preset: 'swe' });
  try {
    const taskFile = addTask(boardDir, 'Archive me');
    assert.ok(fs.existsSync(taskFile), 'task file should exist before archive');

    const out = runTaskArchive([taskFile]);
    assert.equal(out.status, 0, `task_archive failed:\nstdout: ${out.stdout}\nstderr: ${out.stderr}`);
    assert.match(out.stdout, /Task archived:/);

    assert.ok(!fs.existsSync(taskFile), 'task file should be removed from tasks/');
    const archiveDir = path.join(boardDir, 'tasks', '.archive');
    const archivedFile = path.join(archiveDir, path.basename(taskFile));
    assert.ok(fs.existsSync(archivedFile), 'task file should exist in .archive/');
  } finally {
    cleanup(boardDir);
  }
});

test('task_archive removes transcript directory if present', () => {
  const boardDir = makeBoard({ preset: 'swe' });
  try {
    const taskFile = addTask(boardDir, 'Task with transcript');
    const taskSlug = path.basename(taskFile).replace(/\.ya?ml$/i, '');
    const transcriptDir = path.join(boardDir, 'transcripts', taskSlug);
    fs.mkdirSync(transcriptDir, { recursive: true });
    fs.writeFileSync(path.join(transcriptDir, 'session.txt'), 'log content');

    const out = runTaskArchive([taskFile]);
    assert.equal(out.status, 0, `task_archive failed:\nstdout: ${out.stdout}\nstderr: ${out.stderr}`);
    assert.ok(!fs.existsSync(transcriptDir), 'transcript directory should be removed');
  } finally {
    cleanup(boardDir);
  }
});

test('task_archive succeeds when no transcript directory exists', () => {
  const boardDir = makeBoard({ preset: 'swe' });
  try {
    const taskFile = addTask(boardDir, 'Task without transcript');
    const out = runTaskArchive([taskFile]);
    assert.equal(out.status, 0, `task_archive failed:\nstdout: ${out.stdout}\nstderr: ${out.stderr}`);
  } finally {
    cleanup(boardDir);
  }
});

test('task_archive removes git worktree when workspace_type is worktree', () => {
  const boardDir = makeBoard({ preset: 'swe' });
  const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'konby-repo-'));
  const worktreeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'konby-wt-'));
  fs.rmSync(worktreeDir, { recursive: true, force: true });
  try {
    makeGitRepo(repoDir);
    git(repoDir, ['checkout', '-b', 'feature/archive-test']);
    git(repoDir, ['checkout', 'main']);
    const addWt = git(repoDir, ['worktree', 'add', worktreeDir, 'feature/archive-test']);
    assert.equal(addWt.status, 0, `worktree add failed: ${addWt.stderr}`);

    const taskFile = addTask(boardDir, 'Worktree task', [
      '--workspace', worktreeDir,
      '--set', 'workspace_type=worktree',
    ]);

    const out = runTaskArchive([taskFile]);
    assert.equal(out.status, 0, `task_archive failed:\nstdout: ${out.stdout}\nstderr: ${out.stderr}`);

    assert.ok(!fs.existsSync(worktreeDir), 'worktree directory should be removed');

    const archiveDir = path.join(boardDir, 'tasks', '.archive');
    const archivedFile = path.join(archiveDir, path.basename(taskFile));
    assert.ok(fs.existsSync(archivedFile), 'task file should be in .archive/');
  } finally {
    cleanup(boardDir);
    git(repoDir, ['worktree', 'prune']);
    fs.rmSync(repoDir, { recursive: true, force: true });
    if (fs.existsSync(worktreeDir)) fs.rmSync(worktreeDir, { recursive: true, force: true });
  }
});

test('task_archive does not touch workspace when workspace_type is local', () => {
  const boardDir = makeBoard({ preset: 'swe' });
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'konby-local-ws-'));
  try {
    const taskFile = addTask(boardDir, 'Local workspace task', [
      '--workspace', workspaceDir,
      '--set', 'workspace_type=local',
    ]);

    const out = runTaskArchive([taskFile]);
    assert.equal(out.status, 0, `task_archive failed:\nstdout: ${out.stdout}\nstderr: ${out.stderr}`);
    assert.ok(fs.existsSync(workspaceDir), 'local workspace should not be removed');
  } finally {
    cleanup(boardDir);
    fs.rmSync(workspaceDir, { recursive: true, force: true });
  }
});
