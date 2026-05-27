#!/usr/bin/env node

const path = require('path');

function sanitizeBranchName(raw) {
  return String(raw || '')
    .toLowerCase()
    .replace(/[^a-z0-9._/-]+/g, '-')
    .replace(/\/{2,}/g, '/')
    .replace(/^\/+|\/+$/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function sanitizeBranchComponent(raw, fallback) {
  const value = sanitizeBranchName(raw).replace(/\//g, '-');
  return value || fallback;
}

function taskSlugFromTaskFile(taskFile) {
  const parsed = path.parse(String(taskFile || ''));
  return parsed.name || 'task';
}

function taskBoardSlugFromTaskFile(taskFile) {
  const taskDir = path.dirname(String(taskFile || ''));
  return sanitizeBranchComponent(path.basename(taskDir), 'tasks');
}

function taskBranchName(taskFile) {
  const boardSlug = taskBoardSlugFromTaskFile(taskFile);
  const taskSlug = taskSlugFromTaskFile(taskFile);
  return sanitizeBranchName(`${boardSlug}/${taskSlug}`) || `${boardSlug}/task`;
}

function taskWorktreeDir(repoRoot, taskFile) {
  const branchName = taskBranchName(taskFile);
  return path.join(repoRoot, '.konby-worktrees', branchName.replace(/\//g, '__'));
}

function parseCliArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      out._.push(token);
      continue;
    }
    const value = argv[i + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value after ${token}`);
    out[token.slice(2)] = value;
    i += 1;
  }
  return out;
}

function runCli() {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv[0] === '--help' || argv[0] === '-h') {
    process.stdout.write('Usage: worktree.js <task-branch|task-worktree-dir> --task <path> [--repo <path>]\n');
    return;
  }

  const cmd = argv[0];
  const args = parseCliArgs(argv.slice(1));
  if (!args.task) throw new Error(`${cmd} requires --task`);

  if (cmd === 'task-branch') {
    process.stdout.write(`${taskBranchName(args.task)}\n`);
    return;
  }

  if (cmd === 'task-worktree-dir') {
    if (!args.repo) throw new Error('task-worktree-dir requires --repo');
    process.stdout.write(`${taskWorktreeDir(args.repo, args.task)}\n`);
    return;
  }

  throw new Error(`Unknown command: ${cmd}`);
}

if (require.main === module) {
  try {
    runCli();
  } catch (err) {
    process.stderr.write(`Error: ${err.message}\n`);
    process.exit(1);
  }
}

module.exports = {
  sanitizeBranchName,
  sanitizeBranchComponent,
  taskSlugFromTaskFile,
  taskBoardSlugFromTaskFile,
  taskBranchName,
  taskWorktreeDir,
};
