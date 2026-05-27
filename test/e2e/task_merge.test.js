'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const { run, makeBoard, addTask, cleanup, BIN } = require('../integration/fixtures');

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

function createFeatureBranch(repoDir, branchName) {
  git(repoDir, ['checkout', '-b', branchName]);
  fs.writeFileSync(path.join(repoDir, 'feature.txt'), 'feature content\n');
  git(repoDir, ['add', 'feature.txt']);
  git(repoDir, ['commit', '-m', 'add feature']);
}

function defaultBranchName(repoDir) {
  for (const candidate of ['main', 'master', 'trunk']) {
    if (git(repoDir, ['show-ref', '--verify', '--quiet', `refs/heads/${candidate}`]).status === 0) {
      return candidate;
    }
  }
  return null;
}

function runTaskMerge(args) {
  return spawnSync(path.join(BIN, 'task_merge'), args, { encoding: 'utf8' });
}

test('task_merge merges feature branch into default branch', () => {
  const boardDir = makeBoard({ preset: 'swe' });
  const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'konby-repo-'));
  try {
    makeGitRepo(repoDir);
    createFeatureBranch(repoDir, 'feature/task-1');
    // repo is now on feature/task-1

    const taskFile = addTask(boardDir, 'Merge task', ['--workspace', repoDir]);
    const out = runTaskMerge([taskFile]);

    assert.equal(out.status, 0, `task_merge failed:\nstdout: ${out.stdout}\nstderr: ${out.stderr}`);
    assert.match(out.stdout, /Merged feature\/task-1 into/);

    // verify feature.txt landed on the default branch
    const defBranch = defaultBranchName(repoDir);
    git(repoDir, ['checkout', defBranch]);
    assert.ok(fs.existsSync(path.join(repoDir, 'feature.txt')), 'feature.txt should exist on default branch after merge');
  } finally {
    cleanup(boardDir);
    fs.rmSync(repoDir, { recursive: true, force: true });
  }
});

test('task_merge works with a git worktree as workspace', () => {
  const boardDir = makeBoard({ preset: 'swe' });
  const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'konby-repo-'));
  const worktreeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'konby-wt-'));
  fs.rmSync(worktreeDir, { recursive: true, force: true }); // git worktree add requires non-existing path
  try {
    makeGitRepo(repoDir);
    // create branch in main repo (repo stays on default branch)
    git(repoDir, ['checkout', '-b', 'feature/task-2']);
    fs.writeFileSync(path.join(repoDir, 'wt-feature.txt'), 'worktree feature\n');
    git(repoDir, ['add', 'wt-feature.txt']);
    git(repoDir, ['commit', '-m', 'add wt feature']);
    git(repoDir, ['checkout', defaultBranchName(repoDir)]);
    // create linked worktree for the feature branch
    const addWt = git(repoDir, ['worktree', 'add', worktreeDir, 'feature/task-2']);
    assert.equal(addWt.status, 0, `worktree add failed: ${addWt.stderr}`);

    const taskFile = addTask(boardDir, 'Worktree merge task', ['--workspace', worktreeDir]);
    const out = runTaskMerge([taskFile]);

    assert.equal(out.status, 0, `task_merge failed:\nstdout: ${out.stdout}\nstderr: ${out.stderr}`);
    assert.match(out.stdout, /Merged feature\/task-2 into/);

    const defBranch = defaultBranchName(repoDir);
    assert.ok(
      git(repoDir, ['show', `${defBranch}:wt-feature.txt`]).status === 0,
      'wt-feature.txt should exist on default branch after merge',
    );
  } finally {
    cleanup(boardDir);
    git(repoDir, ['worktree', 'prune']);
    fs.rmSync(repoDir, { recursive: true, force: true });
    if (fs.existsSync(worktreeDir)) fs.rmSync(worktreeDir, { recursive: true, force: true });
  }
});

test('task_merge commits pending worktree changes before merging', () => {
  const boardDir = makeBoard({ preset: 'swe' });
  const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'konby-repo-'));
  const worktreeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'konby-wt-'));
  fs.rmSync(worktreeDir, { recursive: true, force: true }); // git worktree add requires non-existing path
  try {
    makeGitRepo(repoDir);
    git(repoDir, ['checkout', '-b', 'feature/task-3']);
    git(repoDir, ['checkout', defaultBranchName(repoDir)]);
    const addWt = git(repoDir, ['worktree', 'add', worktreeDir, 'feature/task-3']);
    assert.equal(addWt.status, 0, `worktree add failed: ${addWt.stderr}`);

    fs.mkdirSync(path.join(worktreeDir, 'tests'));
    fs.writeFileSync(path.join(worktreeDir, 'hello_world.py'), 'print("hello world")\n');
    fs.writeFileSync(path.join(worktreeDir, 'tests', 'test_hello_world.py'), 'def test_hello_world():\n    assert True\n');

    const taskFile = addTask(boardDir, 'Pending worktree merge task', ['--workspace', worktreeDir]);
    const out = runTaskMerge([taskFile]);

    assert.equal(out.status, 0, `task_merge failed:\nstdout: ${out.stdout}\nstderr: ${out.stderr}`);
    assert.match(out.stdout, /Committed pending workspace changes on feature\/task-3 before merge/);

    const defBranch = defaultBranchName(repoDir);
    assert.equal(git(repoDir, ['show', `${defBranch}:hello_world.py`]).stdout, 'print("hello world")\n');
    assert.equal(
      git(repoDir, ['show', `${defBranch}:tests/test_hello_world.py`]).stdout,
      'def test_hello_world():\n    assert True\n',
    );
  } finally {
    cleanup(boardDir);
    git(repoDir, ['worktree', 'prune']);
    fs.rmSync(repoDir, { recursive: true, force: true });
    if (fs.existsSync(worktreeDir)) fs.rmSync(worktreeDir, { recursive: true, force: true });
  }
});

test('task_merge fails when task file does not exist', () => {
  const out = runTaskMerge(['/tmp/konby-no-such-task.yaml']);
  assert.notEqual(out.status, 0);
  assert.match(out.stderr, /Task file not found/i);
});

test('task_merge fails when workspace does not exist', () => {
  const boardDir = makeBoard({ preset: 'swe' });
  try {
    const taskFile = addTask(boardDir, 'No workspace task', ['--workspace', '/tmp/konby-nonexistent-ws-xyz']);
    const out = runTaskMerge([taskFile]);
    assert.notEqual(out.status, 0);
    assert.match(out.stderr, /workspace does not exist/i);
  } finally {
    cleanup(boardDir);
  }
});

test('task_merge fails when workspace is not a git repository', () => {
  const boardDir = makeBoard({ preset: 'swe' });
  const notARepo = fs.mkdtempSync(path.join(os.tmpdir(), 'konby-notgit-'));
  try {
    const taskFile = addTask(boardDir, 'Not git task', ['--workspace', notARepo]);
    const out = runTaskMerge([taskFile]);
    assert.notEqual(out.status, 0);
    assert.match(out.stderr, /not a git repository/i);
  } finally {
    cleanup(boardDir);
    fs.rmSync(notARepo, { recursive: true, force: true });
  }
});

test('task_merge fails when workspace is already on the default branch', () => {
  const boardDir = makeBoard({ preset: 'swe' });
  const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'konby-repo-'));
  try {
    makeGitRepo(repoDir);
    // repo stays on default branch — nothing to merge
    const taskFile = addTask(boardDir, 'On default branch task', ['--workspace', repoDir]);
    const out = runTaskMerge([taskFile]);
    assert.notEqual(out.status, 0);
    assert.match(out.stderr, /equals default branch/i);
  } finally {
    cleanup(boardDir);
    fs.rmSync(repoDir, { recursive: true, force: true });
  }
});

test('task_merge prints usage and exits 1 with no arguments', () => {
  const out = runTaskMerge([]);
  assert.equal(out.status, 1);
  assert.match(out.stdout, /Usage: task_merge/i);
});
