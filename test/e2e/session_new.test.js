'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const { run, makeBoard, addTask, cleanup, makeFakeCodexDir, setAgentCli, BIN } = require('../integration/fixtures');
const { sessionIdForTask, agentSlugFromFile } = require('../../lib/session_new');

// --- precondition guard ---

const hasTmux = spawnSync('tmux', ['-V'], { encoding: 'utf8' }).status === 0;
const missingDep = !hasTmux ? 'tmux not installed' : false;
const hasRealCodex = spawnSync('which', ['codex'], { encoding: 'utf8' }).status === 0;
const missingCodex = hasRealCodex ? false : 'codex not in PATH';

// --- helpers ---

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function makeGitRepo(dir) {
  fs.mkdirSync(dir, { recursive: true });
  spawnSync('git', ['init', dir], { encoding: 'utf8' });
  spawnSync('git', ['-C', dir, 'config', 'user.email', 'test@example.com'], { encoding: 'utf8' });
  spawnSync('git', ['-C', dir, 'config', 'user.name', 'Test'], { encoding: 'utf8' });
  fs.writeFileSync(path.join(dir, 'README.md'), '# test\n');
  spawnSync('git', ['-C', dir, 'add', '.'], { encoding: 'utf8' });
  spawnSync('git', ['-C', dir, 'commit', '-m', 'init'], { encoding: 'utf8' });
}

function makePromptlessCliDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'konby-promptless-cli-'));
  const script = path.join(dir, 'agent');
  fs.writeFileSync(script, `#!/usr/bin/env node
'use strict';

const { execSync } = require('child_process');

process.stdout.write('promptless cli started\\n');
process.stdin.setEncoding('utf8');

let buffer = '';
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  if (!buffer.includes('\\n')) return;

  const raw = buffer;
  buffer = '';
  const command = (raw.match(/konby task move [^\\r\\n]+/) || [])[0];
  if (!command) return;

  try {
    execSync(command, { stdio: 'inherit', env: process.env });
    process.stdout.write('\\npromptless cli completed\\n');
  } catch (err) {
    process.stdout.write('\\npromptless cli failed: ' + (err.message || err) + '\\n');
  }
});

setInterval(() => {}, 1000);
`, 'utf8');
  fs.chmodSync(script, 0o755);
  return dir;
}

function runSessionNew(args) {
  return spawnSync(path.join(BIN, 'session_new'), args, {
    encoding: 'utf8',
    env: { ...process.env, KONBY_SESSION_READY_TRIES: '20' },
    timeout: 90000,
  });
}

function extractSessionId(stdout) {
  const match = String(stdout || '').match(/Started tmux session: (.+)/);
  return match ? match[1].trim() : null;
}

function tmuxHasSession(id) {
  return spawnSync('tmux', ['has-session', '-t', id], { encoding: 'utf8' }).status === 0;
}

function tmuxKillIfExists(id) {
  if (id && tmuxHasSession(id)) {
    spawnSync('tmux', ['kill-session', '-t', id], { encoding: 'utf8' });
  }
}

function tmuxCapture(id, lines = 200) {
  const out = spawnSync(
    'tmux', ['capture-pane', '-t', `${id}:0.0`, '-p', '-S', `-${lines}`],
    { encoding: 'utf8' },
  );
  return out.status === 0 ? String(out.stdout || '') : '';
}

function waitForTmuxContent(id, re, tries = 20, delayMs = 500) {
  for (let i = 0; i < tries; i++) {
    if (re.test(tmuxCapture(id))) return true;
    sleep(delayMs);
  }
  return false;
}

// --- tests ---

test('session_new starts a tmux session with configured CLI', { skip: missingDep, timeout: 120000 }, () => {
  const fakeCodexDir = makeFakeCodexDir();
  const boardDir = makeBoard({ preset: 'swe' });
  setAgentCli(boardDir, path.join(fakeCodexDir, 'codex'));
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'konby-ws-'));
  let taskFile = null;
  let sessionId = null;
  try {
    taskFile = addTask(boardDir, 'e2e test task', [
      '--workspace', workspaceDir,
      '--workspace_type', 'local',
      '--assignee', 'coder',
    ]);
    const out = runSessionNew([
      '--agent', 'agents/coder.yaml',
      '--task', taskFile,
      '--board', boardDir,
    ]);
    assert.equal(out.status, 0, `session_new failed:\n${out.stderr}`);
    assert.match(out.stdout, /Started tmux session:/);
    sessionId = extractSessionId(out.stdout);
    assert.ok(sessionId, 'should extract session ID from stdout');
    assert.ok(tmuxHasSession(sessionId), `tmux session should exist: ${sessionId}`);
    assert.ok(
      waitForTmuxContent(sessionId, /fake codex ready|›/i),
      'configured CLI output should appear in pane',
    );
  } finally {
    tmuxKillIfExists(sessionId);
    cleanup(boardDir);
    cleanup(fakeCodexDir);
    cleanup(workspaceDir);
  }
});

test('session_new detects input readiness without a CLI prompt glyph', { skip: missingDep, timeout: 120000 }, () => {
  const cliDir = makePromptlessCliDir();
  const boardDir = makeBoard({ preset: 'swe' });
  setAgentCli(boardDir, path.join(cliDir, 'agent'));
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'konby-ws-'));
  let taskFile = null;
  let sessionId = null;
  try {
    taskFile = addTask(boardDir, 'promptless cli task', [
      '--workspace', workspaceDir,
      '--workspace_type', 'local',
      '--assignee', 'coder',
    ]);
    const out = runSessionNew([
      '--agent', 'agents/coder.yaml',
      '--task', taskFile,
      '--board', boardDir,
    ]);
    assert.equal(out.status, 0, `session_new failed:\n${out.stderr}`);
    sessionId = extractSessionId(out.stdout);
    assert.ok(sessionId, 'should extract session ID from stdout');
    assert.ok(tmuxHasSession(sessionId), `tmux session should exist: ${sessionId}`);
    assert.ok(
      waitForTmuxContent(sessionId, /promptless cli completed/i),
      'prompt should be injected after probe text becomes visible',
    );
  } finally {
    tmuxKillIfExists(sessionId);
    cleanup(boardDir);
    cleanup(cliDir);
    cleanup(workspaceDir);
  }
});

test('session_new creates git worktree and starts session', { skip: missingDep, timeout: 120000 }, () => {
  const fakeCodexDir = makeFakeCodexDir();
  const boardDir = makeBoard({ preset: 'swe' });
  setAgentCli(boardDir, path.join(fakeCodexDir, 'codex'));
  const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'konby-repo-'));
  let taskFile = null;
  let sessionId = null;
  try {
    makeGitRepo(repoDir);
    // workspace_type defaults to 'worktree' in the swe preset schema
    taskFile = addTask(boardDir, 'worktree task', [
      '--workspace', repoDir,
      '--assignee', 'coder',
    ]);
    const out = runSessionNew([
      '--agent', 'agents/coder.yaml',
      '--task', taskFile,
      '--board', boardDir,
    ]);
    assert.equal(out.status, 0, `session_new failed:\n${out.stderr}`);
    assert.match(out.stdout, /Started tmux session:/);
    sessionId = extractSessionId(out.stdout);
    assert.ok(tmuxHasSession(sessionId), `tmux session should exist: ${sessionId}`);

    // task YAML should be updated with the worktree path
    const taskContent = fs.readFileSync(taskFile, 'utf8');
    assert.match(taskContent, /\.konby-worktrees/, 'workspace should point into .konby-worktrees');

    // worktree directory should exist on disk
    const wsMatch = taskContent.match(/^workspace:\s*(.+)$/m);
    assert.ok(wsMatch, 'task YAML should have workspace field');
    const worktreeDir = wsMatch[1].trim().replace(/^['"]|['"]$/g, '');
    assert.ok(fs.existsSync(worktreeDir), `worktree dir should exist: ${worktreeDir}`);
  } finally {
    tmuxKillIfExists(sessionId);
    cleanup(boardDir);
    cleanup(fakeCodexDir);
    fs.rmSync(repoDir, { recursive: true, force: true });
  }
});

test('session_new commits dirty repo state before creating worktree branch', { skip: missingDep, timeout: 120000 }, () => {
  const fakeCodexDir = makeFakeCodexDir();
  const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'konby-repo-'));
  const boardDir = path.join(repoDir, 'tasks');
  let taskFile = null;
  let sessionId = null;
  try {
    makeGitRepo(repoDir);
    const boardOut = run('board_new', [boardDir, '--preset', 'swe', '--workspace', repoDir]);
    assert.equal(boardOut.status, 0, `board_new failed:\n${boardOut.stderr}`);
    setAgentCli(boardDir, path.join(fakeCodexDir, 'codex'));
    spawnSync('git', ['-C', repoDir, 'add', '.'], { encoding: 'utf8' });
    spawnSync('git', ['-C', repoDir, 'commit', '-m', 'add board'], { encoding: 'utf8' });

    taskFile = addTask(boardDir, 'worktree base commit task', [
      '--workspace', repoDir,
      '--assignee', 'coder',
    ]);
    const transcriptRel = path.join('transcripts', '1-worktree-base-commit-task', 'coder__base.txt');
    const transcriptAbs = path.join(boardDir, transcriptRel);
    fs.mkdirSync(path.dirname(transcriptAbs), { recursive: true });
    fs.writeFileSync(transcriptAbs, 'base transcript\n');

    const out = runSessionNew([
      '--agent', 'agents/coder.yaml',
      '--task', taskFile,
      '--board', boardDir,
    ]);
    assert.equal(out.status, 0, `session_new failed:\n${out.stderr}`);
    sessionId = extractSessionId(out.stdout);

    const branch = 'tasks/1-worktree-base-commit-task';
    const transcriptPathInRepo = path.relative(repoDir, transcriptAbs);
    const showBase = spawnSync('git', ['-C', repoDir, 'show', `HEAD:${transcriptPathInRepo}`], { encoding: 'utf8' });
    assert.equal(showBase.stdout, 'base transcript\n');
    const mergeBase = spawnSync('git', ['-C', repoDir, 'merge-base', 'HEAD', branch], { encoding: 'utf8' });
    assert.equal(mergeBase.status, 0, mergeBase.stderr);
    const showBranchBase = spawnSync('git', ['-C', repoDir, 'show', `${mergeBase.stdout.trim()}:${transcriptPathInRepo}`], { encoding: 'utf8' });
    assert.equal(showBranchBase.stdout, 'base transcript\n');
  } finally {
    tmuxKillIfExists(sessionId);
    cleanup(fakeCodexDir);
    fs.rmSync(repoDir, { recursive: true, force: true });
  }
});

test('session_new fails when CLI prompt not detected within timeout', { skip: missingDep, timeout: 30000 }, () => {
  const fakeCodexDir = makeFakeCodexDir();
  const boardDir = makeBoard({ preset: 'swe' });
  setAgentCli(boardDir, path.join(fakeCodexDir, 'codex'));
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'konby-ws-'));
  const sessionTs = '20250101T010000Z';
  let sessionId = null;
  try {
    const taskFile = addTask(boardDir, 'cli prompt timeout task', [
      '--workspace', workspaceDir,
      '--workspace_type', 'local',
      '--assignee', 'coder',
    ]);
    sessionId = sessionIdForTask(agentSlugFromFile('agents/coder.yaml'), taskFile, sessionTs);
    tmuxKillIfExists(sessionId);

    const out = spawnSync(path.join(BIN, 'session_new'), [
      '--agent', 'agents/coder.yaml',
      '--task', taskFile,
      '--board', boardDir,
      '--session-ts', sessionTs,
    ], {
      encoding: 'utf8',
      env: { ...process.env, KONBY_SESSION_READY_TRIES: '0' },
      timeout: 10000,
    });

    assert.notEqual(out.status, 0, 'session_new should fail when CLI prompt is not detected');
    assert.match(out.stderr, /timed out/i);
  } finally {
    tmuxKillIfExists(sessionId);
    cleanup(boardDir);
    cleanup(fakeCodexDir);
    cleanup(workspaceDir);
  }
});

test('session_new fails when tmux session already exists', { skip: missingDep, timeout: 180000 }, () => {
  const fakeCodexDir = makeFakeCodexDir();
  const boardDir = makeBoard({ preset: 'swe' });
  setAgentCli(boardDir, path.join(fakeCodexDir, 'codex'));
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'konby-ws-'));
  const sessionTs = '20250101T000000Z';
  let taskFile = null;
  let duplicateSessionId = null;
  try {
    taskFile = addTask(boardDir, 'duplicate session task', [
      '--workspace', workspaceDir,
      '--workspace_type', 'local',
      '--assignee', 'coder',
    ]);

    duplicateSessionId = sessionIdForTask(agentSlugFromFile('agents/coder.yaml'), taskFile, sessionTs);
    tmuxKillIfExists(duplicateSessionId);

    const baseArgs = [
      '--agent', 'agents/coder.yaml',
      '--task', taskFile,
      '--board', boardDir,
      '--session-ts', sessionTs,
    ];

    const first = runSessionNew(baseArgs);
    assert.equal(first.status, 0, `first session_new failed:\n${first.stderr}`);

    const second = runSessionNew(baseArgs);
    assert.notEqual(second.status, 0, 'second call with same session-ts should fail');
    assert.match(second.stderr, /tmux session already exists/i);
  } finally {
    tmuxKillIfExists(duplicateSessionId);
    cleanup(boardDir);
    cleanup(fakeCodexDir);
    cleanup(workspaceDir);
  }
});

test('session_new fails when task file does not exist', { skip: missingDep }, () => {
  const boardDir = makeBoard({ preset: 'swe' });
  try {
    const out = runSessionNew([
      '--agent', 'agents/coder.yaml',
      '--task', '/tmp/konby-no-such-task.yaml',
      '--board', boardDir,
    ]);
    assert.notEqual(out.status, 0);
    assert.match(out.stderr, /Task file not found/i);
  } finally {
    cleanup(boardDir);
  }
});

test('session_new fails when agent file does not exist', { skip: missingDep }, () => {
  const boardDir = makeBoard({ preset: 'swe' });
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'konby-ws-'));
  try {
    const taskFile = addTask(boardDir, 'missing agent task', [
      '--workspace', workspaceDir,
      '--workspace_type', 'local',
    ]);
    const out = runSessionNew([
      '--agent', 'agents/no-such-agent.yaml',
      '--task', taskFile,
      '--board', boardDir,
    ]);
    assert.notEqual(out.status, 0);
    assert.match(out.stderr, /Agent file not found/i);
  } finally {
    cleanup(boardDir);
    cleanup(workspaceDir);
  }
});

test('session_new launches real codex and injects prompt via bracket paste', { skip: missingDep || missingCodex, timeout: 120000 }, () => {
  // Uses real codex binary from PATH — no fake CLI substitution.
  // Verifies the full pipeline: tmux session created, input readiness is detected,
  // bracket-paste prompt injection completes, session remains alive.
  const boardDir = makeBoard({ preset: 'swe' });
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'konby-ws-'));
  let taskFile = null;
  let sessionId = null;
  try {
    taskFile = addTask(boardDir, 'real codex prompt injection test', [
      '--workspace', workspaceDir,
      '--workspace_type', 'local',
      '--assignee', 'coder',
    ]);

    // Use real process.env (API keys etc.) and default KONBY_SESSION_READY_TRIES
    // so session_new waits the full 60 s for codex to show its › prompt.
    const out = spawnSync(path.join(BIN, 'session_new'), [
      '--agent', 'agents/coder.yaml',
      '--task', taskFile,
      '--board', boardDir,
    ], {
      encoding: 'utf8',
      env: { ...process.env },
      timeout: 120000,
    });

    assert.equal(out.status, 0, `session_new failed:\n${out.stderr}`);
    assert.match(out.stdout, /Started tmux session:/);
    sessionId = extractSessionId(out.stdout);
    assert.ok(sessionId, 'session ID should appear in session_new output');
    assert.ok(tmuxHasSession(sessionId), `tmux session should exist: ${sessionId}`);

    // Give codex a moment to process the pasted input, then confirm the session
    // is still alive — i.e. codex did not crash on receiving the prompt.
    sleep(2000);
    assert.ok(tmuxHasSession(sessionId), 'tmux session should remain alive after prompt injection');
  } finally {
    tmuxKillIfExists(sessionId);
    cleanup(boardDir);
    cleanup(workspaceDir);
  }
});
