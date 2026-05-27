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

module.exports = { run, makeBoard, addTask, cleanup, BIN };
