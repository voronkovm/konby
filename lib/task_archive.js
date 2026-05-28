'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { loadYaml } = require('./yaml');

function resolveWorktreeRepoRoot(workspacePath, spawnSyncFn) {
  const result = spawnSyncFn('git', ['-C', workspacePath, 'rev-parse', '--git-common-dir'], { encoding: 'utf8' });
  if (result.status !== 0) return null;
  const raw = result.stdout.trim();
  const commonGitDir = path.isAbsolute(raw) ? raw : path.resolve(workspacePath, raw);
  return path.dirname(commonGitDir);
}

function removeWorktree(workspacePath, fsOps, spawnSyncFn) {
  const repoRoot = resolveWorktreeRepoRoot(workspacePath, spawnSyncFn);
  if (repoRoot) {
    const result = spawnSyncFn('git', ['-C', repoRoot, 'worktree', 'remove', '--force', workspacePath], { encoding: 'utf8' });
    if (result.status === 0) return;
  }
  fsOps.rmSync(workspacePath, { recursive: true, force: true });
}

function archiveTask(taskPath, options = {}) {
  const fsOps = options.fs || fs;
  const spawnSyncFn = options.spawnSync || spawnSync;
  const loadYamlFn = options.loadYaml || loadYaml;

  const taskAbs = path.resolve(taskPath);
  if (!fsOps.existsSync(taskAbs)) throw new Error(`Task file not found: ${taskAbs}`);

  const tasksDir = path.dirname(taskAbs);
  const projectDir = path.dirname(tasksDir);
  const taskFile = path.basename(taskAbs);
  const taskSlug = taskFile.replace(/\.ya?ml$/i, '');

  const data = loadYamlFn(taskAbs);

  if (data.workspace_type === 'worktree' && data.workspace) {
    let workspacePath = data.workspace;
    if (!path.isAbsolute(workspacePath)) {
      workspacePath = path.join(projectDir, workspacePath);
    }
    if (fsOps.existsSync(workspacePath)) {
      removeWorktree(workspacePath, fsOps, spawnSyncFn);
    }
  }

  const transcriptDir = path.join(projectDir, 'transcripts', taskSlug);
  if (fsOps.existsSync(transcriptDir)) {
    fsOps.rmSync(transcriptDir, { recursive: true, force: true });
  }

  const archiveDir = path.join(tasksDir, '.archive');
  fsOps.mkdirSync(archiveDir, { recursive: true });
  const dest = path.join(archiveDir, taskFile);
  fsOps.renameSync(taskAbs, dest);

  return { taskFile, archiveDir, dest };
}

module.exports = { archiveTask };
