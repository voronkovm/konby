'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { archiveTask } = require('../../lib/task_archive');

function makeFs(files = {}, dirs = new Set()) {
  const store = { ...files };
  const dirSet = new Set(dirs);

  return {
    existsSync: (p) => p in store || dirSet.has(p),
    mkdirSync: (p, _opts) => dirSet.add(p),
    renameSync: (src, dest) => {
      if (!(src in store)) throw new Error(`ENOENT: ${src}`);
      store[dest] = store[src];
      delete store[src];
    },
    rmSync: (p, _opts) => {
      for (const key of Object.keys(store)) {
        if (key === p || key.startsWith(p + '/')) delete store[key];
      }
      dirSet.delete(p);
    },
    _store: store,
    _dirs: dirSet,
  };
}

function makeLoadYaml(data) {
  return (_filePath) => ({ ...data });
}

function makeSpawnSync(status = 0) {
  const calls = [];
  const fn = (cmd, args, _opts) => {
    calls.push({ cmd, args });
    return { status, stdout: '', stderr: '' };
  };
  fn.calls = calls;
  return fn;
}

const TASK_PATH = '/board/tasks/1-fix-login.yaml';
const ARCHIVE_DIR = '/board/tasks/.archive';
const ARCHIVE_DEST = '/board/tasks/.archive/1-fix-login.yaml';
const TRANSCRIPT_DIR = '/board/transcripts/1-fix-login';

test('archiveTask moves task to .archive directory', () => {
  const fsOps = makeFs({ [TASK_PATH]: 'id: 1-fix-login\ntitle: Fix login\n' });
  archiveTask(TASK_PATH, {
    fs: fsOps,
    spawnSync: makeSpawnSync(),
    loadYaml: makeLoadYaml({ id: '1-fix-login', title: 'Fix login' }),
  });
  assert.ok(ARCHIVE_DEST in fsOps._store, 'task should be at archive path');
  assert.ok(!(TASK_PATH in fsOps._store), 'task should be removed from original location');
  assert.ok(fsOps._dirs.has(ARCHIVE_DIR), 'archive dir should be created');
});

test('archiveTask removes transcript directory when it exists', () => {
  const fsOps = makeFs(
    { [TASK_PATH]: '', [`${TRANSCRIPT_DIR}/session.txt`]: 'log' },
    new Set([TRANSCRIPT_DIR]),
  );
  archiveTask(TASK_PATH, {
    fs: fsOps,
    spawnSync: makeSpawnSync(),
    loadYaml: makeLoadYaml({ id: '1-fix-login', title: 'Fix login' }),
  });
  assert.ok(!fsOps._dirs.has(TRANSCRIPT_DIR), 'transcript dir should be removed');
});

test('archiveTask skips transcript removal when directory does not exist', () => {
  const fsOps = makeFs({ [TASK_PATH]: '' });
  assert.doesNotThrow(() => archiveTask(TASK_PATH, {
    fs: fsOps,
    spawnSync: makeSpawnSync(),
    loadYaml: makeLoadYaml({ id: '1-fix-login', title: 'Fix login' }),
  }));
});

test('archiveTask removes worktree when workspace_type is worktree', () => {
  const WORKTREE = '/repo/.konby-worktrees/tasks__1-fix-login';
  const fsOps = makeFs({ [TASK_PATH]: '' }, new Set([WORKTREE]));
  const spawnSyncFn = makeSpawnSync(0);
  // First call: git rev-parse --git-common-dir → returns /repo/.git
  // Second call: git worktree remove --force
  let callIndex = 0;
  const multiSpawn = (cmd, args, opts) => {
    callIndex += 1;
    if (callIndex === 1) return { status: 0, stdout: '/repo/.git\n', stderr: '' };
    return { status: 0, stdout: '', stderr: '' };
  };
  multiSpawn.calls = [];

  archiveTask(TASK_PATH, {
    fs: fsOps,
    spawnSync: multiSpawn,
    loadYaml: makeLoadYaml({ id: '1-fix-login', workspace_type: 'worktree', workspace: WORKTREE }),
  });
  assert.ok(ARCHIVE_DEST in fsOps._store, 'task should be archived');
});

test('archiveTask skips worktree removal when workspace_type is not worktree', () => {
  const fsOps = makeFs({ [TASK_PATH]: '' });
  const spawnSyncFn = makeSpawnSync();
  archiveTask(TASK_PATH, {
    fs: fsOps,
    spawnSync: spawnSyncFn,
    loadYaml: makeLoadYaml({ id: '1-fix-login', workspace_type: 'local', workspace: '/some/dir' }),
  });
  assert.equal(spawnSyncFn.calls.length, 0, 'no git commands should be run for local workspace_type');
});

test('archiveTask skips worktree removal when workspace field is missing', () => {
  const fsOps = makeFs({ [TASK_PATH]: '' });
  const spawnSyncFn = makeSpawnSync();
  archiveTask(TASK_PATH, {
    fs: fsOps,
    spawnSync: spawnSyncFn,
    loadYaml: makeLoadYaml({ id: '1-fix-login', workspace_type: 'worktree' }),
  });
  assert.equal(spawnSyncFn.calls.length, 0, 'no git commands should be run when workspace is absent');
});

test('archiveTask skips worktree removal when workspace directory does not exist', () => {
  const fsOps = makeFs({ [TASK_PATH]: '' });
  const spawnSyncFn = makeSpawnSync();
  archiveTask(TASK_PATH, {
    fs: fsOps,
    spawnSync: spawnSyncFn,
    loadYaml: makeLoadYaml({ id: '1-fix-login', workspace_type: 'worktree', workspace: '/missing/worktree' }),
  });
  assert.equal(spawnSyncFn.calls.length, 0, 'no git commands should be run when workspace dir is absent');
});

test('archiveTask falls back to rmSync when git worktree remove fails', () => {
  const WORKTREE = '/repo/.konby-worktrees/tasks__1-fix-login';
  const fsOps = makeFs({ [TASK_PATH]: '' }, new Set([WORKTREE]));
  let callIndex = 0;
  const failingSpawn = (cmd, args, _opts) => {
    callIndex += 1;
    if (callIndex === 1) return { status: 0, stdout: '/repo/.git\n', stderr: '' };
    return { status: 1, stdout: '', stderr: 'error' };
  };

  archiveTask(TASK_PATH, {
    fs: fsOps,
    spawnSync: failingSpawn,
    loadYaml: makeLoadYaml({ id: '1-fix-login', workspace_type: 'worktree', workspace: WORKTREE }),
  });
  assert.ok(!fsOps._dirs.has(WORKTREE), 'worktree dir should be removed via rmSync fallback');
});

test('archiveTask throws when task file does not exist', () => {
  const fsOps = makeFs({});
  assert.throws(
    () => archiveTask('/board/tasks/missing.yaml', { fs: fsOps, spawnSync: makeSpawnSync(), loadYaml: makeLoadYaml({}) }),
    /Task file not found/,
  );
});

test('archiveTask returns taskFile, archiveDir, and dest', () => {
  const fsOps = makeFs({ [TASK_PATH]: '' });
  const result = archiveTask(TASK_PATH, {
    fs: fsOps,
    spawnSync: makeSpawnSync(),
    loadYaml: makeLoadYaml({ id: '1-fix-login', title: 'Fix login' }),
  });
  assert.equal(result.taskFile, '1-fix-login.yaml');
  assert.equal(result.archiveDir, ARCHIVE_DIR);
  assert.equal(result.dest, ARCHIVE_DEST);
});
