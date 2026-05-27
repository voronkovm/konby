const path = require('path');
const childProcess = require('child_process');

const KONBY_PREFIX = 'konby__';

function taskSlugFromTaskFile(taskFile) {
  return path.basename(String(taskFile || '')).replace(/\.ya?ml$/i, '');
}

function sessionIdPrefix(agent, taskFile) {
  return `${KONBY_PREFIX}${String(agent || '').trim()}__${taskSlugFromTaskFile(taskFile)}`;
}

function filterTaskSessions(tmuxOutput, taskSlug, options = {}) {
  const escapedTaskSlug = taskSlug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const taskPattern = new RegExp(`__${escapedTaskSlug}__\\d{8}T\\d{6}Z$`);
  const agent = String(options.agent || '').trim();
  const prefix = agent ? `${KONBY_PREFIX}${agent}__` : KONBY_PREFIX;
  const legacyPrefix = options.includeLegacyPrefix && agent ? `${KONBY_PREFIX}${agent}__${taskSlug}__` : '';

  return String(tmuxOutput || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, createdRaw] = line.split('\t');
      const created = Number(createdRaw || 0);
      return { name: String(name || ''), created: Number.isFinite(created) ? created : 0 };
    })
    .filter((entry) => {
      if (!entry.name.startsWith(prefix)) return false;
      return taskPattern.test(entry.name) || (legacyPrefix && entry.name.startsWith(legacyPrefix));
    })
    .sort((a, b) => b.created - a.created);
}

function listTaskSessions(taskFile, options = {}) {
  const taskSlug = taskSlugFromTaskFile(taskFile);
  const out = childProcess.spawnSync('tmux', ['list-sessions', '-F', '#{session_name}\t#{session_created}'], { encoding: 'utf8' });
  if (out.status !== 0) return [];
  return filterTaskSessions(out.stdout, taskSlug, options);
}

function listAllKonbySessions() {
  const out = childProcess.spawnSync('tmux', ['list-sessions', '-F', '#{session_name}\t#{session_created}'], { encoding: 'utf8' });
  if (out.status !== 0) return [];
  return String(out.stdout || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, createdRaw] = line.split('\t');
      const created = Number(createdRaw || 0);
      return { name: String(name || ''), created: Number.isFinite(created) ? created : 0 };
    })
    .filter((entry) => entry.name.startsWith(KONBY_PREFIX));
}

// Parses agent and taskSlug from a konby session name.
// Format: konby__<agent>__<taskSlug>__<timestamp>
// Returns null if the name does not match the expected format.
function parseKonbySessionName(sessionName) {
  if (!sessionName || !sessionName.startsWith(KONBY_PREFIX)) return null;
  const withoutPrefix = sessionName.slice(KONBY_PREFIX.length);
  const tsMatch = withoutPrefix.match(/^(.+)__(\d{8}T\d{6}Z)$/);
  if (!tsMatch) return null;
  const agentAndSlug = tsMatch[1];
  const sep = agentAndSlug.indexOf('__');
  if (sep === -1) return null;
  return { agent: agentAndSlug.slice(0, sep), taskSlug: agentAndSlug.slice(sep + 2) };
}

module.exports = {
  filterTaskSessions,
  listAllKonbySessions,
  listTaskSessions,
  parseKonbySessionName,
  sessionIdPrefix,
  taskSlugFromTaskFile,
};
