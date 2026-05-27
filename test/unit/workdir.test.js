const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const {
  candidateDirs,
  findDispatchDirsUnder,
  findUp,
  gitRootFor,
  gitWorktreeDirs,
  isUnderPath,
  resolveBoardDir,
  resolveKonbyHome,
  resolveTaskSchemaPath,
} = require('../../lib/workdir');

function makeTmpDir(...segments) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'konby-workdir-test-'));
  if (segments.length > 0) {
    const sub = path.join(base, ...segments);
    fs.mkdirSync(sub, { recursive: true });
    return { base, sub };
  }
  return base;
}

test('findUp returns directory matching predicate', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'konby-workdir-'));
  const boardDir = path.join(base, 'board');
  const tasksDir = path.join(boardDir, 'tasks');
  fs.mkdirSync(tasksDir, { recursive: true });
  fs.writeFileSync(path.join(boardDir, 'dispatch.yaml'), 'board:\n  columns: []\n', 'utf8');

  const found = findUp(tasksDir, (dir) => fs.existsSync(path.join(dir, 'dispatch.yaml')));
  assert.equal(found, boardDir);
  fs.rmSync(base, { recursive: true, force: true });
});

test('findUp returns null when predicate never matches', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'konby-workdir-'));
  const found = findUp(base, () => false);
  assert.equal(found, null);
  fs.rmSync(base, { recursive: true, force: true });
});

test('resolveBoardDir finds board dir when given pathHint', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'konby-workdir-'));
  const boardDir = path.join(base, 'myboard');
  fs.mkdirSync(boardDir, { recursive: true });
  fs.writeFileSync(path.join(boardDir, 'dispatch.yaml'), 'board:\n  columns: []\n', 'utf8');

  const found = resolveBoardDir({ startDir: base, pathHint: 'myboard' });
  assert.equal(found, boardDir);
  fs.rmSync(base, { recursive: true, force: true });
});

test('resolveBoardDir finds dispatch.yaml in startDir', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'konby-workdir-'));
  fs.writeFileSync(path.join(base, 'dispatch.yaml'), 'board:\n  columns: []\n', 'utf8');

  const found = resolveBoardDir({ startDir: base });
  assert.equal(found, base);
  fs.rmSync(base, { recursive: true, force: true });
});

test('resolveBoardDir walks up to find dispatch.yaml ancestor', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'konby-workdir-'));
  const boardDir = path.join(base, 'project');
  const tasksDir = path.join(boardDir, 'tasks');
  fs.mkdirSync(tasksDir, { recursive: true });
  fs.writeFileSync(path.join(boardDir, 'dispatch.yaml'), 'board:\n  columns: []\n', 'utf8');

  const found = resolveBoardDir({ startDir: tasksDir });
  assert.equal(found, boardDir);
  fs.rmSync(base, { recursive: true, force: true });
});

test('resolveBoardDir throws when no board dir is found', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'konby-workdir-'));
  const emptyDir = path.join(base, 'empty');
  fs.mkdirSync(emptyDir);
  assert.throws(
    () => resolveBoardDir({ startDir: emptyDir }),
    /Could not resolve board directory/,
  );
  fs.rmSync(base, { recursive: true, force: true });
});

test('resolveKonbyHome finds the konby package root from within the project', () => {
  const home = resolveKonbyHome(path.join(__dirname, '..', '..', 'lib'));
  assert.ok(fs.existsSync(path.join(home, 'package.json')));
  assert.ok(fs.existsSync(path.join(home, 'lib', 'workdir.js')));
});

test('resolveKonbyHome throws when starting outside a konby project', () => {
  assert.throws(
    () => resolveKonbyHome(os.tmpdir()),
    /Could not resolve konby home/,
  );
});

// --- isUnderPath ---

test('isUnderPath returns true when child is inside parent', () => {
  assert.equal(isUnderPath('/a/b/c', '/a/b'), true);
  assert.equal(isUnderPath('/a/b/c/d', '/a'), true);
});

test('isUnderPath returns falsy for equal paths or parent above child', () => {
  assert.ok(!isUnderPath('/a/b', '/a/b'));
  assert.ok(!isUnderPath('/a', '/a/b'));
  assert.ok(!isUnderPath('/x/y', '/a/b'));
});

// --- findDispatchDirsUnder ---

test('findDispatchDirsUnder finds board dirs up to maxDepth', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'konby-workdir-'));
  const boardA = path.join(base, 'a', 'board');
  const boardB = path.join(base, 'b', 'board');
  fs.mkdirSync(boardA, { recursive: true });
  fs.mkdirSync(boardB, { recursive: true });
  fs.writeFileSync(path.join(boardA, 'dispatch.yaml'), '', 'utf8');
  fs.writeFileSync(path.join(boardB, 'dispatch.yaml'), '', 'utf8');

  const results = findDispatchDirsUnder(base);
  assert.ok(results.includes(boardA));
  assert.ok(results.includes(boardB));
  fs.rmSync(base, { recursive: true, force: true });
});

test('findDispatchDirsUnder skips .git and node_modules directories', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'konby-workdir-'));
  const gitBoard = path.join(base, '.git', 'board');
  const nmBoard = path.join(base, 'node_modules', 'board');
  const realBoard = path.join(base, 'real');
  fs.mkdirSync(gitBoard, { recursive: true });
  fs.mkdirSync(nmBoard, { recursive: true });
  fs.mkdirSync(realBoard, { recursive: true });
  fs.writeFileSync(path.join(gitBoard, 'dispatch.yaml'), '', 'utf8');
  fs.writeFileSync(path.join(nmBoard, 'dispatch.yaml'), '', 'utf8');
  fs.writeFileSync(path.join(realBoard, 'dispatch.yaml'), '', 'utf8');

  const results = findDispatchDirsUnder(base);
  assert.ok(results.includes(realBoard));
  assert.ok(!results.some((r) => r.includes('.git')));
  assert.ok(!results.some((r) => r.includes('node_modules')));
  fs.rmSync(base, { recursive: true, force: true });
});

test('findDispatchDirsUnder respects maxDepth limit', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'konby-workdir-'));
  const deep = path.join(base, 'a', 'b', 'c', 'board');
  fs.mkdirSync(deep, { recursive: true });
  fs.writeFileSync(path.join(deep, 'dispatch.yaml'), '', 'utf8');

  const shallow = findDispatchDirsUnder(base, 2);
  assert.equal(shallow.length, 0);

  const deep2 = findDispatchDirsUnder(base, 4);
  assert.ok(deep2.includes(deep));
  fs.rmSync(base, { recursive: true, force: true });
});

test('findDispatchDirsUnder excludes specified root directories', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'konby-workdir-'));
  const boardA = path.join(base, 'a');
  const boardB = path.join(base, 'b');
  fs.mkdirSync(boardA, { recursive: true });
  fs.mkdirSync(boardB, { recursive: true });
  fs.writeFileSync(path.join(boardA, 'dispatch.yaml'), '', 'utf8');
  fs.writeFileSync(path.join(boardB, 'dispatch.yaml'), '', 'utf8');

  const results = findDispatchDirsUnder(base, 6, { excludedRoots: [boardA] });
  assert.ok(!results.includes(boardA));
  assert.ok(results.includes(boardB));
  fs.rmSync(base, { recursive: true, force: true });
});

// --- candidateDirs ---

test('candidateDirs includes startDir and resolves pathHint as a directory', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'konby-workdir-'));
  const sub = path.join(base, 'myboard');
  fs.mkdirSync(sub);

  const dirs = candidateDirs({ startDir: base, pathHint: 'myboard' });
  assert.ok(dirs.includes(sub));
  assert.ok(dirs.includes(base));
  fs.rmSync(base, { recursive: true, force: true });
});

test('candidateDirs resolves pathHint as a file (uses dirname)', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'konby-workdir-'));
  const file = path.join(base, 'dispatch.yaml');
  fs.writeFileSync(file, '', 'utf8');

  const dirs = candidateDirs({ startDir: base, pathHint: 'dispatch.yaml' });
  assert.ok(dirs.includes(base));
  fs.rmSync(base, { recursive: true, force: true });
});

test('candidateDirs handles taskFile in a tasks/ subdirectory', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'konby-workdir-'));
  const taskFile = path.join(base, 'board', 'tasks', '1-task.yaml');
  fs.mkdirSync(path.dirname(taskFile), { recursive: true });

  const dirs = candidateDirs({ startDir: base, taskFile });
  // tasks/ parent (board/) should be included
  assert.ok(dirs.includes(path.join(base, 'board')));
  fs.rmSync(base, { recursive: true, force: true });
});

// --- gitRootFor ---

test('gitRootFor returns the git root from within the konby repo', () => {
  const konbyRoot = path.join(__dirname, '..', '..');
  const root = gitRootFor(konbyRoot);
  assert.ok(root !== null);
  assert.ok(fs.existsSync(path.join(root, '.git')));
});

test('gitRootFor returns null when outside a git repository', () => {
  const result = gitRootFor(os.tmpdir());
  assert.equal(result, null);
});

// --- gitWorktreeDirs ---

test('gitWorktreeDirs returns the main worktree from within the konby repo', () => {
  const konbyRoot = path.join(__dirname, '..', '..');
  const dirs = gitWorktreeDirs(konbyRoot);
  assert.ok(Array.isArray(dirs));
  assert.ok(dirs.length >= 1);
  assert.ok(dirs.includes(path.resolve(konbyRoot)));
});

test('gitWorktreeDirs returns empty array for a non-git directory', () => {
  const result = gitWorktreeDirs(os.tmpdir());
  assert.deepEqual(result, []);
});

// --- resolveTaskSchemaPath ---

test('resolveTaskSchemaPath resolves schema path relative to board dir', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'konby-workdir-'));
  const boardDir = path.join(base, 'board');
  const tasksDir = path.join(boardDir, 'tasks');
  fs.mkdirSync(tasksDir, { recursive: true });
  fs.writeFileSync(path.join(boardDir, 'dispatch.yaml'), '', 'utf8');
  const taskFile = path.join(tasksDir, '1-task.yaml');

  const schemaPath = resolveTaskSchemaPath(taskFile, tasksDir);
  assert.equal(schemaPath, path.join(boardDir, 'task.schema.yaml'));
  fs.rmSync(base, { recursive: true, force: true });
});

// --- CLI via execFileSync ---

test('workdir.js CLI resolve-board finds a board given --path', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'konby-workdir-'));
  const boardDir = path.join(base, 'board');
  fs.mkdirSync(boardDir);
  fs.writeFileSync(path.join(boardDir, 'dispatch.yaml'), '', 'utf8');

  const workdirJs = path.join(__dirname, '..', '..', 'lib', 'workdir.js');
  const out = execFileSync(process.execPath, [workdirJs, 'resolve-board', '--start', base, '--path', 'board'], { encoding: 'utf8' });
  assert.equal(out.trim(), boardDir);
  fs.rmSync(base, { recursive: true, force: true });
});

test('workdir.js CLI resolve-konby-home returns the konby root', () => {
  const workdirJs = path.join(__dirname, '..', '..', 'lib', 'workdir.js');
  const konbyRoot = path.join(__dirname, '..', '..');
  const out = execFileSync(process.execPath, [workdirJs, 'resolve-konby-home', '--start', path.join(konbyRoot, 'lib')], { encoding: 'utf8' });
  assert.equal(out.trim(), path.resolve(konbyRoot));
});

test('workdir.js CLI resolve-schema returns schema path', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'konby-workdir-'));
  const boardDir = path.join(base, 'board');
  const tasksDir = path.join(boardDir, 'tasks');
  fs.mkdirSync(tasksDir, { recursive: true });
  fs.writeFileSync(path.join(boardDir, 'dispatch.yaml'), '', 'utf8');

  const workdirJs = path.join(__dirname, '..', '..', 'lib', 'workdir.js');
  const taskFile = path.join(tasksDir, '1.yaml');
  const out = execFileSync(process.execPath, [workdirJs, 'resolve-schema', '--start', tasksDir, '--task', taskFile], { encoding: 'utf8' });
  assert.equal(out.trim(), path.join(boardDir, 'task.schema.yaml'));
  fs.rmSync(base, { recursive: true, force: true });
});

test('workdir.js CLI prints usage when called with --help', () => {
  const workdirJs = path.join(__dirname, '..', '..', 'lib', 'workdir.js');
  const out = execFileSync(process.execPath, [workdirJs, '--help'], { encoding: 'utf8' });
  assert.match(out, /Usage/);
});

test('workdir.js CLI throws for unknown command', () => {
  const workdirJs = path.join(__dirname, '..', '..', 'lib', 'workdir.js');
  assert.throws(
    () => execFileSync(process.execPath, [workdirJs, 'unknown-cmd'], { encoding: 'utf8', stdio: 'pipe' }),
  );
});

test('workdir.js CLI throws for resolve-schema without --task', () => {
  const workdirJs = path.join(__dirname, '..', '..', 'lib', 'workdir.js');
  assert.throws(
    () => execFileSync(process.execPath, [workdirJs, 'resolve-schema'], { encoding: 'utf8', stdio: 'pipe' }),
  );
});

test('workdir.js CLI throws for flag with missing value', () => {
  const workdirJs = path.join(__dirname, '..', '..', 'lib', 'workdir.js');
  assert.throws(
    () => execFileSync(process.execPath, [workdirJs, 'resolve-board', '--start'], { encoding: 'utf8', stdio: 'pipe' }),
  );
});

// --- defaultStartDir (via CLI with no --start) ---

test('workdir.js CLI resolve-konby-home uses defaultStartDir when --start omitted', () => {
  const workdirJs = path.join(__dirname, '..', '..', 'lib', 'workdir.js');
  // Running from the konby project root, defaultStartDir resolves from PWD/cwd
  const out = execFileSync(process.execPath, [workdirJs, 'resolve-konby-home'], {
    encoding: 'utf8',
    cwd: path.join(__dirname, '..', '..'),
  });
  assert.ok(out.trim().length > 0);
});

// --- isDir / isFile error paths ---

test('findDispatchDirsUnder silently skips unreadable directories', () => {
  // Pass a non-existent root — should return empty rather than throw
  const result = findDispatchDirsUnder('/nonexistent-dir-that-cannot-exist-xyz');
  assert.deepEqual(result, []);
});

// --- candidateDirs with non-existent pathHint ---

test('candidateDirs includes non-existent pathHint as a candidate anyway', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'konby-workdir-'));
  const dirs = candidateDirs({ startDir: base, pathHint: 'does-not-exist' });
  assert.ok(dirs.some((d) => d.endsWith('does-not-exist')));
  fs.rmSync(base, { recursive: true, force: true });
});

// --- resolveBoardDir git fallback (board inside a git repo without dispatch.yaml at root) ---

test('resolveBoardDir finds board via git fallback when dispatch.yaml is nested under git root', () => {
  const konbyRoot = path.join(__dirname, '..', '..');
  // The konby repo itself has no dispatch.yaml at root, but our test boards in /tmp do.
  // Instead, use the konby project dir directly — it has a package.json but no dispatch.yaml.
  // Create a tmp dir that has a git repo with dispatch.yaml nested inside.
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'konby-workdir-'));
  const gitDir = path.join(base, 'repo');
  const boardDir = path.join(gitDir, 'myboard');
  fs.mkdirSync(boardDir, { recursive: true });
  fs.writeFileSync(path.join(boardDir, 'dispatch.yaml'), 'board:\n  columns: []\n', 'utf8');
  // init a real git repo
  const { spawnSync } = require('child_process');
  spawnSync('git', ['init', gitDir], { encoding: 'utf8' });

  const found = resolveBoardDir({ startDir: gitDir });
  // On macOS /tmp is a symlink; resolve both sides to canonical paths
  assert.equal(found, fs.realpathSync(boardDir));
  fs.rmSync(base, { recursive: true, force: true });
});
