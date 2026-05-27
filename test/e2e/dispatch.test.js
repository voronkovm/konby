'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const { run, makeBoard, addTask, cleanup, makeFakeCodexDir, setAgentCli, BIN } = require('../integration/fixtures');
const { loadYaml } = require('../../lib/yaml');
const { listTaskSessions, sessionIdPrefix } = require('../../lib/tmux_sessions');
const { transcriptPathForSession } = require('../../lib/transcript');

const os = require('os');

const hasTmux = spawnSync('tmux', ['-V'], { encoding: 'utf8' }).status === 0;
const missingDep = !hasTmux ? 'tmux not installed' : false;

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function readTask(taskFile) {
  return loadYaml(taskFile);
}

function waitForTask(taskFile, predicate, tries = 100, delayMs = 200) {
  for (let i = 0; i < tries; i++) {
    const task = readTask(taskFile);
    if (predicate(task)) return task;
    sleep(delayMs);
  }
  return readTask(taskFile);
}

function dispatchEnv(fakeCodexDir, extraEnv = {}) {
  return {
    ...process.env,
    OPENAI_API_KEY: '',
    KONBY_SESSION_READY_TRIES: '2',
    PATH: `${fakeCodexDir}:${BIN}:${process.env.PATH || ''}`,
    ...extraEnv,
  };
}

function runDispatch(boardDir, fakeCodexDir, extraEnv = {}) {
  return spawnSync(path.join(BIN, 'dispatch'), ['--board', boardDir], {
    encoding: 'utf8',
    env: dispatchEnv(fakeCodexDir, extraEnv),
  });
}

function runDispatchAsync(boardDir, fakeCodexDir, extraEnv = {}) {
  return new Promise((resolve) => {
    const child = spawn(path.join(BIN, 'dispatch'), ['--board', boardDir], {
      env: dispatchEnv(fakeCodexDir, extraEnv),
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
}

function makeDispatchBoard(fakeCodexDir) {
  const boardDir = makeBoard({ preset: 'swe' });
  setAgentCli(boardDir, path.join(fakeCodexDir, 'codex'));
  return boardDir;
}

function tmuxKillIfExists(sessionId) {
  if (!sessionId) return;
  spawnSync('tmux', ['kill-session', '-t', sessionId], { encoding: 'utf8' });
}

function tmuxKillTaskSessions(taskFile) {
  if (!taskFile) return;
  for (const session of listTaskSessions(taskFile)) {
    tmuxKillIfExists(session.name);
  }
}

function tmuxCapture(sessionId) {
  const out = spawnSync('tmux', ['capture-pane', '-J', '-t', sessionId, '-p', '-S', '-', '-E', '-'], {
    encoding: 'utf8',
  });
  return out.status === 0 ? String(out.stdout || '').split(/\r?\n/).join('\n').trimEnd() : '';
}

function waitForTmuxOutput(sessionId, pattern, tries = 30, delayMs = 100) {
  for (let i = 0; i < tries; i++) {
    const output = tmuxCapture(sessionId);
    if (pattern.test(output)) return output;
    sleep(delayMs);
  }
  return tmuxCapture(sessionId);
}

test('dispatch moves a task through columns according to dispatch rules', { skip: missingDep, timeout: 90000 }, () => {
  const fakeCodexDir = makeFakeCodexDir();
  const boardDir = makeDispatchBoard(fakeCodexDir);
  let taskFile = null;
  try {
    taskFile = addTask(boardDir, 'Dispatch workflow task', [
      '--workspace', boardDir,
      '--workspace_type', 'local',
      '--assignee', '-',
    ]);

    const first = runDispatch(boardDir, fakeCodexDir);
    assert.equal(first.status, 0, first.stderr);
    assert.match(first.stdout, /Launched: 1/);
    let task = waitForTask(taskFile, (t) => t.column === 'refinement' && t.assignee === 'bsa' && t.status === 'done');
    assert.equal(task.column, 'refinement');
    assert.equal(task.status, 'done');
    assert.equal(task.assignee, 'bsa');

    const readyForCoder = run('task_move', [
      taskFile,
      '--column', 'development',
      '--status', 'todo',
      '--assignee', 'coder',
    ]);
    assert.equal(readyForCoder.status, 0, readyForCoder.stderr);

    const second = runDispatch(boardDir, fakeCodexDir);
    assert.equal(second.status, 0, second.stderr);
    assert.match(second.stdout, /Launched: 1/);
    task = waitForTask(taskFile, (t) => t.column === 'development' && t.assignee === 'coder' && t.status === 'done');
    assert.equal(task.assignee, 'coder');
    assert.equal(task.status, 'done');

    const third = runDispatch(boardDir, fakeCodexDir);
    assert.equal(third.status, 0, third.stderr);
    assert.match(third.stdout, /Launched: 1/);
    task = waitForTask(taskFile, (t) => t.column === 'development' && t.assignee === 'qa' && t.status === 'done');
    assert.equal(task.assignee, 'qa');
    assert.equal(task.status, 'done');

    const fourth = runDispatch(boardDir, fakeCodexDir);
    assert.equal(fourth.status, 0, fourth.stderr);
    task = readTask(taskFile);
    assert.equal(task.column, 'review');
    assert.equal(task.status, 'todo');
    assert.equal(task.assignee, '-');

    const readyForDone = run('task_move', [taskFile, '--status', 'done']);
    assert.equal(readyForDone.status, 0, readyForDone.stderr);

    const fifth = runDispatch(boardDir, fakeCodexDir);
    assert.equal(fifth.status, 0, fifth.stderr);
    task = readTask(taskFile);
    assert.equal(task.column, 'done');
    assert.equal(task.status, 'in_progress');
    assert.equal(task.assignee, '-');
  } finally {
    tmuxKillTaskSessions(taskFile);
    cleanup(boardDir);
    cleanup(fakeCodexDir);
  }
});

test('dispatch-launched agent can move a task to blocked', { skip: missingDep, timeout: 60000 }, () => {
  const fakeCodexDir = makeFakeCodexDir({ outcome: 'blocked' });
  const boardDir = makeDispatchBoard(fakeCodexDir);
  let taskFile = null;
  try {
    taskFile = addTask(boardDir, 'Dispatch blocked task', [
      '--workspace', boardDir,
      '--workspace_type', 'local',
      '--assignee', '-',
    ]);

    const out = runDispatch(boardDir, fakeCodexDir);
    assert.equal(out.status, 0, out.stderr);
    assert.match(out.stdout, /Launched: 1/);

    const sessions = listTaskSessions(taskFile, { agent: 'bsa' });
    assert.ok(sessions.length > 0, 'expected a bsa session to be launched by dispatch');
    const sessionId = sessions[0].name;

    const terminalOut = waitForTmuxOutput(sessionId, /fake codex completed/, 60, 500);
    assert.match(terminalOut, /fake codex completed/, 'fake codex did not complete within timeout');

    const task = readTask(taskFile);
    assert.equal(task.column, 'refinement');
    assert.equal(task.status, 'blocked');
    assert.equal(task.assignee, 'bsa');
  } finally {
    tmuxKillTaskSessions(taskFile);
    cleanup(boardDir);
    cleanup(fakeCodexDir);
  }
});

test('dispatch uses LLM classification for stale in-progress task transcripts', { skip: missingDep, timeout: 30000 }, async () => {
  const fakeCodexDir = makeFakeCodexDir();
  const boardDir = makeDispatchBoard(fakeCodexDir);
  let server = null;
  let sessionId = null;
  try {
    const taskFile = addTask(boardDir, 'Dispatch LLM task', [
      '--workspace', boardDir,
      '--workspace_type', 'local',
      '--column', 'refinement',
      '--status', 'in_progress',
      '--assignee', 'bsa',
    ]);

    sessionId = `${sessionIdPrefix('bsa', taskFile)}__20250101T000000Z`;
    tmuxKillIfExists(sessionId);
    const tmux = spawnSync('tmux', ['new-session', '-d', '-s', sessionId, 'sh', '-lc', 'printf "all tests passed\\n"; sleep 600'], {
      encoding: 'utf8',
    });
    assert.equal(tmux.status, 0, tmux.stderr);
    const terminalText = waitForTmuxOutput(sessionId, /all tests passed/);
    assert.match(terminalText, /all tests passed/);

    const transcriptAbsPath = transcriptPathForSession(boardDir, taskFile, sessionId);
    fs.mkdirSync(path.dirname(transcriptAbsPath), { recursive: true });
    fs.writeFileSync(transcriptAbsPath, `${terminalText}\n`, 'utf8');
    const old = new Date(Date.now() - 10 * 60 * 1000);
    fs.utimesSync(transcriptAbsPath, old, old);

    server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          choices: [
            { message: { content: '{"outcome":"success","reason":"tests passed"}' } },
          ],
        }));
      });
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();

    const out = await runDispatchAsync(boardDir, fakeCodexDir, {
      OPENAI_API_KEY: 'test-key',
      OPENAI_BASE_URL: `http://127.0.0.1:${port}`,
      OPENAI_API_ENDPOINT: '/chat/completions',
    });
    assert.equal(out.status, 0, out.stderr);
    assert.match(out.stdout, /Task status checks: 1/);
    assert.match(out.stdout, /llm/);

    const task = readTask(taskFile);
    assert.equal(task.status, 'done');
    assert.match(JSON.stringify(task.updates || []), /tests passed/);
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    tmuxKillIfExists(sessionId);
    cleanup(boardDir);
    cleanup(fakeCodexDir);
  }
});

test('dispatch leaves agent-set terminal non-in-progress status unchanged', { skip: missingDep, timeout: 30000 }, () => {
  const fakeCodexDir = makeFakeCodexDir();
  const boardDir = makeDispatchBoard(fakeCodexDir);
  try {
    const taskFile = addTask(boardDir, 'Dispatch terminal task', [
      '--workspace', boardDir,
      '--workspace_type', 'local',
      '--column', 'refinement',
      '--status', 'blocked',
      '--assignee', 'bsa',
    ]);

    const out = runDispatch(boardDir, fakeCodexDir);
    assert.equal(out.status, 0, out.stderr);
    assert.doesNotMatch(out.stdout, /Moved: [1-9]/);

    const task = readTask(taskFile);
    assert.equal(task.column, 'refinement');
    assert.equal(task.status, 'blocked');
    assert.equal(task.assignee, 'bsa');
  } finally {
    cleanup(boardDir);
    cleanup(fakeCodexDir);
  }
});

test('dispatch skips moves when destination WIP limit is reached', { timeout: 30000 }, () => {
  const fakeCodexDir = makeFakeCodexDir();
  const boardDir = makeDispatchBoard(fakeCodexDir);
  try {
    for (let i = 0; i < 5; i++) {
      addTask(boardDir, `Existing refinement task ${i + 1}`, [
        '--workspace', boardDir,
        '--workspace_type', 'local',
        '--column', 'refinement',
        '--status', 'in_progress',
        '--assignee', '-',
      ]);
    }
    const blockedByWip = addTask(boardDir, 'Blocked by WIP task', [
      '--workspace', boardDir,
      '--workspace_type', 'local',
      '--assignee', '-',
    ]);

    const out = runDispatch(boardDir, fakeCodexDir);
    assert.equal(out.status, 0, out.stderr);
    assert.match(out.stdout, /Skipped: 1/);
    assert.match(out.stdout, /WIP limit reached in column refinement/);

    const task = readTask(blockedByWip);
    assert.equal(task.column, 'backlog');
    assert.equal(task.status, 'todo');
  } finally {
    cleanup(boardDir);
    cleanup(fakeCodexDir);
  }
});

test('dispatch prints usage and exits 0 with --help', () => {
  const out = spawnSync(path.join(BIN, 'dispatch'), ['--help'], {
    encoding: 'utf8',
    env: { ...process.env, OPENAI_API_KEY: '' },
  });
  assert.equal(out.status, 0);
  assert.match(out.stdout, /Usage: dispatch/);
});

test('dispatch skips when another instance is already running', () => {
  const boardDir = makeBoard({ preset: 'swe' });
  try {
    const safe = path.resolve(boardDir).replace(/[^A-Za-z0-9_.-]/g, '_');
    const lockDir = path.join(os.tmpdir(), `code-conveyor-dispatch.lock.${safe}`);
    const ownerFile = path.join(lockDir, 'owner.json');
    fs.mkdirSync(lockDir, { recursive: true });
    fs.writeFileSync(ownerFile, JSON.stringify({ pid: process.pid, started_at: new Date().toISOString() }));
    try {
      const out = run('dispatch', ['--board', boardDir]);
      assert.equal(out.status, 0);
      assert.match(out.stdout, /Skipped: bin\/dispatch is already running/);
    } finally {
      fs.rmSync(lockDir, { recursive: true, force: true });
    }
  } finally {
    cleanup(boardDir);
  }
});

test('dispatch clears stale lock from a dead process and runs', () => {
  const boardDir = makeBoard({ preset: 'swe' });
  try {
    const safe = path.resolve(boardDir).replace(/[^A-Za-z0-9_.-]/g, '_');
    const lockDir = path.join(os.tmpdir(), `code-conveyor-dispatch.lock.${safe}`);
    const ownerFile = path.join(lockDir, 'owner.json');
    fs.mkdirSync(lockDir, { recursive: true });
    fs.writeFileSync(ownerFile, JSON.stringify({ pid: 2147483647, started_at: new Date().toISOString() }));
    try {
      const out = run('dispatch', ['--board', boardDir]);
      assert.equal(out.status, 0, `stderr: ${out.stderr}`);
      assert.match(out.stdout, /Moved: 0/);
    } finally {
      if (fs.existsSync(lockDir)) fs.rmSync(lockDir, { recursive: true, force: true });
    }
  } finally {
    cleanup(boardDir);
  }
});

test('dispatch clears lock with malformed owner file and runs', () => {
  const boardDir = makeBoard({ preset: 'swe' });
  try {
    const safe = path.resolve(boardDir).replace(/[^A-Za-z0-9_.-]/g, '_');
    const lockDir = path.join(os.tmpdir(), `code-conveyor-dispatch.lock.${safe}`);
    const ownerFile = path.join(lockDir, 'owner.json');
    fs.mkdirSync(lockDir, { recursive: true });
    fs.writeFileSync(ownerFile, 'not valid json{{');
    try {
      const out = run('dispatch', ['--board', boardDir]);
      assert.equal(out.status, 0, `stderr: ${out.stderr}`);
      assert.match(out.stdout, /Moved: 0/);
    } finally {
      if (fs.existsSync(lockDir)) fs.rmSync(lockDir, { recursive: true, force: true });
    }
  } finally {
    cleanup(boardDir);
  }
});
