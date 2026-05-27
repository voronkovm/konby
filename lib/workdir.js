#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function normalizeDir(dirPath) {
  return path.resolve(dirPath);
}

function defaultStartDir() {
  const pwd = process.env.PWD;
  if (pwd && isDir(pwd)) return pwd;
  return process.cwd();
}

function isFile(filePath) {
  try {
    return fs.statSync(filePath).isFile();
  } catch (_err) {
    return false;
  }
}

function isDir(dirPath) {
  try {
    return fs.statSync(dirPath).isDirectory();
  } catch (_err) {
    return false;
  }
}

function hasDispatchYaml(dirPath) {
  return isFile(path.join(dirPath, 'dispatch.yaml'));
}

function isUnderPath(childPath, parentPath) {
  const rel = path.relative(parentPath, childPath);
  return rel && !rel.startsWith('..') && !path.isAbsolute(rel);
}

function gitWorktreeDirs(repoRoot) {
  const out = spawnSync('git', ['-C', repoRoot, 'worktree', 'list', '--porcelain'], { encoding: 'utf8' });
  if (out.status !== 0) return [];
  const lines = String(out.stdout || '').split(/\r?\n/);
  const dirs = [];
  for (const line of lines) {
    if (!line.startsWith('worktree ')) continue;
    const p = line.slice('worktree '.length).trim();
    if (!p) continue;
    dirs.push(normalizeDir(p));
  }
  return [...new Set(dirs)];
}

function findDispatchDirsUnder(rootDir, maxDepth = 6, options = {}) {
  const root = normalizeDir(rootDir);
  const out = [];
  const queue = [{ dir: root, depth: 0 }];
  const skip = new Set(['.git', 'node_modules']);
  const excludedRoots = (options.excludedRoots || []).map((p) => normalizeDir(p));

  while (queue.length > 0) {
    const { dir, depth } = queue.shift();
    if (excludedRoots.some((excluded) => dir === excluded || isUnderPath(dir, excluded))) continue;
    if (hasDispatchYaml(dir)) out.push(dir);
    if (depth >= maxDepth) continue;

    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (_err) {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (skip.has(entry.name)) continue;
      queue.push({ dir: path.join(dir, entry.name), depth: depth + 1 });
    }
  }
  return out;
}

function findUp(startDir, predicate) {
  let current = normalizeDir(startDir);
  while (true) {
    if (predicate(current)) return current;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function resolveTaskFilePath(taskFile, startDir) {
  if (!taskFile) return null;
  const base = startDir || defaultStartDir();
  return path.resolve(base, taskFile);
}

function gitRootFor(startDir) {
  const probeDir = normalizeDir(startDir || defaultStartDir());
  const out = spawnSync('git', ['-C', probeDir, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' });
  if (out.status !== 0) return null;
  const root = String(out.stdout || '').trim();
  return root ? normalizeDir(root) : null;
}

function candidateDirs({ startDir, pathHint, taskFile }) {
  const out = [];
  const start = normalizeDir(startDir || defaultStartDir());
  out.push(start);

  if (pathHint) {
    const hinted = path.resolve(start, pathHint);
    if (isDir(hinted)) out.unshift(hinted);
    else if (isFile(hinted)) out.unshift(path.dirname(hinted));
    else out.unshift(hinted);
  }

  if (taskFile) {
    const taskAbs = resolveTaskFilePath(taskFile, start);
    const taskDir = path.dirname(taskAbs);
    out.unshift(taskDir);
    if (path.basename(taskDir) === 'tasks') out.unshift(path.dirname(taskDir));
  }

  return [...new Set(out)];
}

function resolveBoardDir(options = {}) {
  const dirs = candidateDirs(options);

  for (const dir of dirs) {
    const found = findUp(dir, hasDispatchYaml);
    if (found) return found;
  }

  for (const dir of dirs) {
    const gitRoot = gitRootFor(dir);
    if (!gitRoot) continue;
    if (hasDispatchYaml(gitRoot)) return gitRoot;
    const worktrees = gitWorktreeDirs(gitRoot).filter((p) => p !== gitRoot);
    const candidates = findDispatchDirsUnder(gitRoot, 6, { excludedRoots: worktrees });
    if (candidates.length === 1) return candidates[0];
    if (candidates.length > 1) {
      throw new Error(`Multiple board directories found under git root ${gitRoot}: ${candidates.join(', ')}. Use --board <path>.`);
    }
  }

  throw new Error(`Could not resolve board directory from: ${dirs.join(', ')}`);
}

function resolveTaskSchemaPath(taskFileAbs, startDir) {
  const boardDir = resolveBoardDir({ startDir: startDir || defaultStartDir(), taskFile: taskFileAbs });
  return path.join(boardDir, 'task.schema.yaml');
}

function resolveKonbyHome(startDir) {
  const current = normalizeDir(startDir || __dirname);
  const found = findUp(current, (dir) => isFile(path.join(dir, 'lib', 'workdir.js')) && isFile(path.join(dir, 'package.json')));
  if (!found) throw new Error(`Could not resolve konby home from ${current}`);
  return found;
}

function parseCliArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const t = argv[i];
    if (!t.startsWith('--')) {
      out._.push(t);
      continue;
    }
    const key = t.slice(2);
    const value = argv[i + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value after ${t}`);
    out[key] = value;
    i += 1;
  }
  return out;
}

function runCli() {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv[0] === '--help' || argv[0] === '-h') {
    process.stdout.write('Usage: workdir.js <resolve-board|resolve-schema|resolve-konby-home> [--start <dir>] [--path <path>] [--task <path>]\n');
    return;
  }

  const cmd = argv[0];
  const args = parseCliArgs(argv.slice(1));
  if (cmd === 'resolve-board') {
    const boardDir = resolveBoardDir({
      startDir: args.start || defaultStartDir(),
      pathHint: args.path,
      taskFile: args.task,
    });
    process.stdout.write(`${boardDir}\n`);
    return;
  }
  if (cmd === 'resolve-schema') {
    if (!args.task) throw new Error('resolve-schema requires --task');
    const schemaPath = resolveTaskSchemaPath(args.task, args.start || defaultStartDir());
    process.stdout.write(`${schemaPath}\n`);
    return;
  }
  if (cmd === 'resolve-konby-home') {
    const home = resolveKonbyHome(args.start || defaultStartDir());
    process.stdout.write(`${home}\n`);
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
  candidateDirs,
  findDispatchDirsUnder,
  findUp,
  gitRootFor,
  gitWorktreeDirs,
  isUnderPath,
  resolveBoardDir,
  resolveKonbyHome,
  resolveTaskSchemaPath,
};
