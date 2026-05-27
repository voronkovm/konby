const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const BIN = path.join(__dirname, '../../bin');

function run(script, args, env = {}) {
  return spawnSync(path.join(BIN, script), args, {
    encoding: 'utf8',
    env: { ...process.env, OPENAI_API_KEY: '', ...env },
  });
}

function makeBoard(opts = {}) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'konby-test-'));
  const args = [tmpDir];
  if (opts.preset) args.push('--preset', opts.preset);
  if (opts.workspace) args.push('--workspace', opts.workspace);
  if (opts.force) args.push('--force');
  const out = run('board_new', args);
  if (out.status !== 0) throw new Error(`board_new failed: ${out.stderr}`);
  return tmpDir;
}

function addTask(boardDir, title, extraArgs = []) {
  const out = run('task_add', ['--board', boardDir, '--title', title, ...extraArgs]);
  if (out.status !== 0) throw new Error(`task_add failed: ${out.stderr || out.stdout}`);
  const match = out.stdout.match(/Task added to (.+)/);
  return match ? match[1].trim() : null;
}

function cleanup(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

function makeFakeCodexDir(opts = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'konby-fake-codex-'));
  const script = path.join(dir, 'codex');
  const defaultOutcome = opts.outcome || 'success';
  fs.writeFileSync(script, `#!/usr/bin/env node
'use strict';

const { execSync } = require('child_process');
const defaultOutcome = ${JSON.stringify(defaultOutcome)};

process.stdout.write('fake codex ready\\n› ');
process.stdin.setEncoding('utf8');

let buffer = '';
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  if (buffer.includes('\\x1b[200~') && !buffer.includes('\\x1b[201~')) return;
  if (!buffer.includes('\\n')) return;
  const outcome = String(process.env.FAKE_CODEX_OUTCOME || defaultOutcome).toLowerCase();
  const needsSecond = outcome === 'blocked' || outcome === 'failure';
  const partialCmds = buffer.match(/konby task move [^\\r\\n]+/g) || [];
  if (needsSecond && partialCmds.length < 2 && !buffer.includes('\\x1b[201~')) return;
  const raw = buffer;
  buffer = '';
  const commands = raw.match(/konby task move [^\\r\\n]+/g) || [];
  if (commands.length === 0) {
    process.stdout.write('\\n› ');
    return;
  }
  const command = needsSecond
    ? (commands[1] || commands[0])
    : commands[0];
  try {
    execSync(command, { stdio: 'inherit', env: process.env });
    process.stdout.write('\\nfake codex completed: ' + outcome + '\\n› ');
  } catch (err) {
    process.stdout.write('\\nfake codex failed: ' + (err.message || err) + '\\n› ');
  }
});

setInterval(() => {}, 1000);
`, 'utf8');
  fs.chmodSync(script, 0o755);
  return dir;
}

function setAgentCli(boardDir, cli) {
  const agentsDir = path.join(boardDir, 'agents');
  for (const file of fs.readdirSync(agentsDir)) {
    if (!/\.ya?ml$/i.test(file)) continue;
    const fullPath = path.join(agentsDir, file);
    const content = fs.readFileSync(fullPath, 'utf8');
    fs.writeFileSync(fullPath, content.replace(/^cli:\s*.*$/m, `cli: ${JSON.stringify(cli)}`), 'utf8');
  }
}

module.exports = {
  run,
  makeBoard,
  addTask,
  cleanup,
  makeFakeCodexDir,
  setAgentCli,
  BIN,
};
