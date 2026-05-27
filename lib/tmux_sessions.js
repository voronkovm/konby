const path = require('path');
const childProcess = require('child_process');

function taskSlugFromTaskFile(taskFile) {
  return path.basename(String(taskFile || '')).replace(/\.ya?ml$/i, '');
}

function sessionIdPrefix(agent, taskFile) {
  return `${String(agent || '').trim()}__${taskSlugFromTaskFile(taskFile)}`;
}

function filterTaskSessions(tmuxOutput, taskSlug, options = {}) {
  const escapedTaskSlug = taskSlug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const taskPattern = new RegExp(`__${escapedTaskSlug}__\\d{8}T\\d{6}Z$`);
  const agent = String(options.agent || '').trim();
  const prefix = agent ? `${agent}__` : '';
  const legacyPrefix = options.includeLegacyPrefix && agent ? `${prefix}${taskSlug}__` : '';

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
      const agentMatches = !prefix || entry.name.startsWith(prefix);
      if (!agentMatches) return false;
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

module.exports = {
  filterTaskSessions,
  listTaskSessions,
  sessionIdPrefix,
  taskSlugFromTaskFile,
};
