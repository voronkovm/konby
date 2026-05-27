function readStatusDefaults(dispatchCfg) {
  const fallback = {
    in_progress: 'in_progress',
    success: 'done',
    failure: 'blocked',
  };
  const raw = (dispatchCfg && dispatchCfg.defaults) || {};
  const todo = String(raw.status_todo || '').trim();
  const inProgress = String(raw.status_in_progress || '').trim();
  const success = String(raw.status_success || '').trim();
  const failure = String(raw.status_failure || '').trim();
  return {
    todo,
    in_progress: inProgress || fallback.in_progress,
    success: success || fallback.success,
    failure: failure || fallback.failure,
  };
}

function countByColumn(tasks) {
  const counts = new Map();
  for (const t of tasks) {
    const col = t.data.column;
    if (!col) continue;
    counts.set(col, (counts.get(col) || 0) + 1);
  }
  return counts;
}

function canEnterColumn(column, columnsByName, counts) {
  const def = columnsByName.get(column);
  if (!def) return true;
  if (def.wip_limit === '-' || def.wip_limit === undefined) return true;
  const limit = Number(def.wip_limit);
  if (!Number.isFinite(limit)) return true;
  return (counts.get(column) || 0) < limit;
}

function extractWhenThen(rule) {
  const whenObj = (rule && rule.when && typeof rule.when === 'object') ? { ...rule.when } : null;
  const thenFromWhen = whenObj && whenObj.then && typeof whenObj.then === 'object'
    ? { ...whenObj.then }
    : null;
  if (whenObj && Object.prototype.hasOwnProperty.call(whenObj, 'then')) delete whenObj.then;

  const when = whenObj || {
    column: rule.column,
    status: rule.status,
    assignee: rule.assignee,
  };
  const thenCfg = (rule && rule.then && typeof rule.then === 'object')
    ? rule.then
    : (thenFromWhen || {
      status_todo: rule.status_todo,
      column: rule.set_column,
      assignee: rule.set_assignee,
      status_in_progress: rule.status_in_progress,
      status: rule.set_status,
      status_success: rule.status_success,
      status_failure: rule.status_failure,
    });
  return { when, thenCfg };
}

function parseWhenValues(raw) {
  if (raw === undefined || raw === null) return [];
  if (Array.isArray(raw)) {
    return raw
      .map((v) => String(v).trim())
      .filter(Boolean);
  }
  return [String(raw).trim()].filter(Boolean);
}

function whenFieldMatches(taskValue, whenValue) {
  if (whenValue === undefined) return true;
  const values = parseWhenValues(whenValue);
  if (values.length === 0) return true;
  if (values.includes('*')) return true;
  const current = String(taskValue || '').trim();
  return values.includes(current);
}

function ruleMatches(task, rule) {
  const { when } = extractWhenThen(rule);
  if (!whenFieldMatches(task.column, when.column)) return false;
  if (!whenFieldMatches(task.status, when.status)) return false;
  return whenFieldMatches(task.assignee, when.assignee);
}

function applyRule(task, rule, defaults, options = {}) {
  const { thenCfg } = extractWhenThen(rule);
  const nextStatusInProgress = thenCfg.status_in_progress || defaults.in_progress;
  if (thenCfg.column) task.column = thenCfg.column;
  if (thenCfg.assignee) task.assignee = thenCfg.assignee;
  if (nextStatusInProgress) task.status = nextStatusInProgress;
  else if (thenCfg.status) task.status = thenCfg.status;
  task.updated_at = (options.now || (() => new Date().toISOString()))();
}

function statusCfgFromThen(thenCfg, defaults) {
  return {
    todo: String(thenCfg.status_todo || defaults.todo || '').trim(),
    in_progress: String(thenCfg.status_in_progress || defaults.in_progress || '').trim(),
    success: String(thenCfg.status_success || defaults.success || '').trim(),
    failure: String(thenCfg.status_failure || defaults.failure || '').trim(),
  };
}

function resolveStatusCfgForTask(task, rules, defaults) {
  const base = statusCfgFromThen({}, defaults);
  let best = null;
  let bestScore = -1;

  for (const rule of rules || []) {
    const { when, thenCfg } = extractWhenThen(rule);
    const thenAssignee = String(thenCfg.assignee || '').trim();
    if (!thenAssignee || thenAssignee === '-' || thenAssignee === '*') continue;
    if (String(task.assignee || '').trim() !== thenAssignee) continue;

    let score = 2;
    const expectedColumns = parseWhenValues(thenCfg.column || when.column);
    if (expectedColumns.length > 0 && !expectedColumns.includes('*')) {
      const currentColumn = String(task.column || '').trim();
      if (!expectedColumns.includes(currentColumn)) continue;
      score += 2;
    }

    const cfg = statusCfgFromThen(thenCfg, defaults);
    const taskStatus = String(task.status || '').trim().toLowerCase();
    if (cfg.in_progress && taskStatus === cfg.in_progress.toLowerCase()) score += 1;

    if (score > bestScore) {
      bestScore = score;
      best = cfg;
    }
  }

  return best || base;
}

function sanitizePathToken(value, fallback) {
  const safe = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return safe || fallback;
}

function transcriptForLlm(fullText, edgeLines = 150) {
  const lines = String(fullText || '').split(/\r?\n/);
  if (lines.length <= edgeLines * 2) return lines.join('\n').trimEnd();
  const head = lines.slice(0, edgeLines).join('\n').trimEnd();
  const tail = lines.slice(-edgeLines).join('\n').trimEnd();
  return `${head}\n\n... [${lines.length - edgeLines * 2} lines omitted] ...\n\n${tail}`.trimEnd();
}

function lastCommentMeta(taskData) {
  const updates = Array.isArray(taskData?.updates) ? taskData.updates : [];
  if (updates.length === 0) return { author: '', timestampMs: null };
  const dated = updates
    .map((comment, idx) => ({
      idx,
      author: String(comment?.author || '').trim(),
      ts: Date.parse(String(comment?.created_at || '')),
    }))
    .filter((entry) => entry.author);
  if (dated.length === 0) return { author: '', timestampMs: null };
  const hasValidDates = dated.some((entry) => Number.isFinite(entry.ts));
  if (!hasValidDates) return { author: dated[dated.length - 1].author, timestampMs: null };
  dated.sort((a, b) => {
    const ta = Number.isFinite(a.ts) ? a.ts : -Infinity;
    const tb = Number.isFinite(b.ts) ? b.ts : -Infinity;
    if (ta !== tb) return ta - tb;
    return a.idx - b.idx;
  });
  const last = dated[dated.length - 1];
  return { author: last.author, timestampMs: Number.isFinite(last.ts) ? last.ts : null };
}

function parseLlmOutcomeResponse(raw) {
  let normalized = '';
  let reason = '';
  try {
    const parsed = JSON.parse(String(raw || '').trim());
    normalized = String((parsed || {}).outcome || '').trim().toLowerCase();
    reason = String((parsed || {}).reason || '').trim();
  } catch (_e) {}
  if (normalized === 'success' || normalized === 'failure') return { outcome: normalized, reason };
  const lower = String(raw || '').toLowerCase();
  if (lower.includes('success')) return { outcome: 'success', reason: reason || 'classifier fallback: success keyword' };
  if (lower.includes('failure')) return { outcome: 'failure', reason: reason || 'classifier fallback: failure keyword' };
  return { outcome: 'failure', reason: reason || 'classifier fallback: ambiguous output' };
}

function parseDispatchArgs(argv) {
  let boardPathHint;
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--board' || token === '--dir') {
      const next = argv[i + 1];
      if (!next) throw new Error(`Missing value after ${token}`);
      boardPathHint = next;
      i += 1;
      continue;
    }
    if (token.startsWith('--board=')) {
      boardPathHint = token.slice('--board='.length);
      continue;
    }
    if (token.startsWith('--dir=')) {
      boardPathHint = token.slice('--dir='.length);
      continue;
    }
    if (token === '--help' || token === '-h') {
      return { help: true, boardPathHint };
    }
    throw new Error(`Unknown argument: ${token}`);
  }
  return { help: false, boardPathHint };
}

module.exports = {
  applyRule,
  canEnterColumn,
  countByColumn,
  extractWhenThen,
  lastCommentMeta,
  parseDispatchArgs,
  parseLlmOutcomeResponse,
  parseWhenValues,
  readStatusDefaults,
  resolveStatusCfgForTask,
  ruleMatches,
  sanitizePathToken,
  statusCfgFromThen,
  transcriptForLlm,
  whenFieldMatches,
};
