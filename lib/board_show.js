const path = require('path');
const { formatYaml } = require('./yaml');

function truncate(text, maxLen) {
  const value = String(text);
  if (maxLen <= 1) return value.slice(0, maxLen);
  if (value.length <= maxLen) return value;
  return `${value.slice(0, maxLen - 1)}…`;
}

function wrapText(text, maxLen) {
  const value = String(text);
  if (maxLen <= 0) return [value];
  const out = [];
  for (let i = 0; i < value.length; i += maxLen) out.push(value.slice(i, i + maxLen));
  return out.length > 0 ? out : [''];
}

function taskLabel(task) {
  const raw = String(task.id || '');
  const match = raw.match(/^(\d+)/);
  const shortId = match ? match[1] : raw;
  const title = task.title && String(task.title).trim() ? String(task.title).trim() : raw;
  return `#${shortId} - ${title}`;
}

function buildTasksByColumn(columns, tasks) {
  const tasksByColumn = new Map(columns.map((c) => [c.name, []]));
  const unknown = [];
  for (const task of tasks) {
    const col = task.column;
    if (!col) unknown.push(task);
    else if (tasksByColumn.has(col)) tasksByColumn.get(col).push(task);
    else unknown.push(task);
  }
  if (unknown.length > 0) {
    if (!tasksByColumn.has('unmapped')) tasksByColumn.set('unmapped', []);
    tasksByColumn.get('unmapped').push(...unknown);
  }
  return tasksByColumn;
}

function visibleColumns(state) {
  const cols = [...state.columns];
  if (state.tasksByColumn.has('unmapped')) cols.push({ name: 'unmapped', wip_limit: '-' });
  return cols;
}

function normalizeSelection(stateRef) {
  const cols = visibleColumns(stateRef.board);
  if (cols.length === 0) {
    stateRef.selectedCol = 0;
    stateRef.selectedTask = 0;
    return;
  }
  if (stateRef.selectedCol >= cols.length) stateRef.selectedCol = cols.length - 1;
  if (stateRef.selectedCol < 0) stateRef.selectedCol = 0;

  const selectedColName = cols[stateRef.selectedCol].name;
  const tasks = stateRef.board.tasksByColumn.get(selectedColName) || [];
  if (tasks.length === 0) stateRef.selectedTask = 0;
  else {
    if (stateRef.selectedTask >= tasks.length) stateRef.selectedTask = tasks.length - 1;
    if (stateRef.selectedTask < 0) stateRef.selectedTask = 0;
  }
}

function selectedTask(stateRef) {
  const cols = visibleColumns(stateRef.board);
  if (!cols[stateRef.selectedCol]) return null;
  const tasks = stateRef.board.tasksByColumn.get(cols[stateRef.selectedCol].name) || [];
  if (tasks.length === 0) return null;
  return tasks[stateRef.selectedTask] || null;
}

function ansiInverse(text) {
  return `\x1b[7m${text}\x1b[0m`;
}

function renderBoard(stateRef, options = {}) {
  const state = stateRef.board;
  const cols = visibleColumns(state);
  const totalWidth = options.width || 120;
  const nowText = options.nowText || new Date().toLocaleString();
  const gap = 2;
  const colCount = Math.max(cols.length, 1);
  const colWidth = Math.max(24, Math.floor((totalWidth - gap * (colCount - 1)) / colCount));

  const dispatchName = options.dispatchName || path.basename(state.dispatchFile);
  const header = `KANBAN  ${nowText}  config=${dispatchName}  (Ctrl+C to quit)`;
  const lines = [truncate(header, totalWidth)];
  lines.push('Hotkeys: a - add new task | d - dispatch once | arrows - select task');
  lines.push('Hotkeys for a task: m - move | t - open tmux | p - PR | g - merge | x - archive');
  lines.push('');

  const colLines = cols.map((col, colIndex) => {
    const tasks = state.tasksByColumn.get(col.name) || [];
    const limit = col.wip_limit === undefined ? '-' : String(col.wip_limit);
    const title = `${col.name} [${tasks.length}/${limit}]`;
    const out = [truncate(title, colWidth), '-'.repeat(colWidth)];

    for (let taskIndex = 0; taskIndex < tasks.length; taskIndex += 1) {
      const task = tasks[taskIndex];
      const selected = colIndex === stateRef.selectedCol && taskIndex === stateRef.selectedTask;
      const taskLines = [
        ...wrapText(taskLabel(task), colWidth),
        truncate(`@${task.assignee} / ${task.status}`, colWidth),
      ];
      for (let i = 0; i < taskLines.length; i += 1) {
        const line = taskLines[i];
        out.push(selected ? ansiInverse(line.padEnd(colWidth, ' ')) : line);
      }
      out.push('');
    }

    if (tasks.length === 0) out.push('(empty)');
    return out;
  });

  const maxHeight = Math.max(...colLines.map((x) => x.length));
  for (let i = 0; i < maxHeight; i += 1) {
    const rowParts = colLines.map((col) => {
      const chunk = col[i] || '';
      if (chunk.includes('\x1b[')) return chunk;
      return chunk.padEnd(colWidth, ' ');
    });
    lines.push(rowParts.join(' '.repeat(gap)).replace(/\s+$/, ''));
  }

  if (stateRef.message) lines.push(`Status: ${stateRef.message}`);
  if (stateRef.mode === 'move') {
    lines.push('');
    lines.push('Move task: (↑/↓ switch field, ←/→ select value, Enter save, Esc cancel)');
    const marker = (field) => (stateRef.moveField === field ? '>' : ' ');
    lines.push(`${marker('column')} column: ${stateRef.moveDraft.column}`);
    lines.push(`${marker('status')} status: ${stateRef.moveDraft.status}`);
    lines.push(`${marker('assignee')} assignee: ${stateRef.moveDraft.assignee}`);
    lines.push(`${marker('comment')} comment (optional):`);
    const commentLines = String(stateRef.moveDraft.comment || '').split('\n');
    if (commentLines.length === 1 && commentLines[0] === '') {
      lines.push('  (empty)');
    } else {
      for (const line of commentLines) lines.push(`  ${line}`);
    }
    lines.push('Tip: paste multi-line text from clipboard directly into comment.');
  }
  if (stateRef.mode === 'add') {
    lines.push('');
    lines.push('Add task popup (Enter save, Esc cancel):');
    lines.push(`title: ${stateRef.addBuffer}`);
  }
  if (stateRef.mode === 'confirm_merge') {
    const task = selectedTask(stateRef);
    lines.push('');
    lines.push(`Confirm merge for ${task ? task.file : 'selected task'}? (y/Enter = yes, n/Esc = no)`);
  }
  if (stateRef.mode === 'confirm_archive') {
    const task = selectedTask(stateRef);
    lines.push('');
    lines.push(`Archive ${task ? task.file : 'selected task'}? (y/Enter = yes, n/Esc = no)`);
  }
  if (stateRef.mode === 'confirm_pr') {
    const task = selectedTask(stateRef);
    lines.push('');
    lines.push(`Create PR for ${task ? task.file : 'selected task'}? (y/Enter = yes, n/Esc = no)`);
  }

  return lines.join('\n');
}

function renderTaskDetails(stateRef, options = {}) {
  const task = selectedTask(stateRef);
  const totalWidth = options.width || 120;
  const height = options.height || 40;
  const bodyHeight = Math.max(5, height - 6);
  const lines = [];
  const header = `TASK  ${task ? task.file : '(not found)'}  (Esc to board)`;
  lines.push(truncate(header, totalWidth));
  lines.push('Hotkeys for a task: m - move | t - open tmux | p - PR | g - merge | x - archive');
  lines.push('');

  if (!task) {
    lines.push('Task not found.');
    return lines.join('\n');
  }

  const details = (options.formatYaml || formatYaml)(task.data).split('\n');
  const maxOffset = Math.max(0, details.length - bodyHeight);
  if (stateRef.detailsScroll > maxOffset) stateRef.detailsScroll = maxOffset;
  if (stateRef.detailsScroll < 0) stateRef.detailsScroll = 0;
  const slice = details.slice(stateRef.detailsScroll, stateRef.detailsScroll + bodyHeight);
  for (const line of slice) lines.push(truncate(line, totalWidth));

  if (details.length > bodyHeight) {
    lines.push('');
    lines.push(`Scroll: ${stateRef.detailsScroll + 1}-${Math.min(stateRef.detailsScroll + bodyHeight, details.length)} / ${details.length}`);
  }
  if (stateRef.message) lines.push(`Status: ${stateRef.message}`);
  if (stateRef.mode === 'comment') {
    lines.push('');
    lines.push('Add comment (Enter save, Esc cancel):');
    lines.push(`text: ${stateRef.commentBuffer}`);
  }
  if (stateRef.mode === 'confirm_merge') {
    const taskForConfirm = selectedTask(stateRef);
    lines.push('');
    lines.push(`Confirm merge for ${taskForConfirm ? taskForConfirm.file : 'selected task'}? (y/Enter = yes, n/Esc = no)`);
  }
  if (stateRef.mode === 'confirm_archive') {
    const taskForConfirm = selectedTask(stateRef);
    lines.push('');
    lines.push(`Archive ${taskForConfirm ? taskForConfirm.file : 'selected task'}? (y/Enter = yes, n/Esc = no)`);
  }
  if (stateRef.mode === 'confirm_pr') {
    const taskForConfirm = selectedTask(stateRef);
    lines.push('');
    lines.push(`Create PR for ${taskForConfirm ? taskForConfirm.file : 'selected task'}? (y/Enter = yes, n/Esc = no)`);
  }

  return lines.join('\n');
}

function moveSelection(stateRef, dx, dy) {
  const cols = visibleColumns(stateRef.board);
  if (cols.length === 0) return;

  if (dx !== 0) {
    const step = dx > 0 ? 1 : -1;
    let nextCol = stateRef.selectedCol + step;
    let movedToNonEmpty = false;
    while (nextCol >= 0 && nextCol < cols.length) {
      const nextTasks = stateRef.board.tasksByColumn.get(cols[nextCol].name) || [];
      if (nextTasks.length > 0) {
        stateRef.selectedCol = nextCol;
        movedToNonEmpty = true;
        break;
      }
      nextCol += step;
    }
    if (!movedToNonEmpty) return;
  } else {
    stateRef.selectedCol = Math.max(0, Math.min(cols.length - 1, stateRef.selectedCol));
  }

  const tasks = stateRef.board.tasksByColumn.get(cols[stateRef.selectedCol].name) || [];
  if (tasks.length === 0) stateRef.selectedTask = 0;
  else stateRef.selectedTask = Math.max(0, Math.min(tasks.length - 1, stateRef.selectedTask + dy));
}

function uniqInOrder(values) {
  const seen = new Set();
  const out = [];
  for (const raw of values) {
    if (raw === undefined || raw === null || raw === '') continue;
    const v = String(raw);
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

function appendMoveComment(stateRef, text) {
  if (!text) return;
  stateRef.moveDraft.comment += String(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function parseMouseWheelDelta(key) {
  if (typeof key !== 'string') return 0;
  const up = /\x1b\[<64;\d+;\d+[mM]/.test(key);
  const down = /\x1b\[<65;\d+;\d+[mM]/.test(key);
  if (up) return -3;
  if (down) return 3;
  return 0;
}

const MOVE_FIELDS = ['column', 'status', 'assignee', 'comment'];

function nextMoveField(field, direction) {
  const idx = MOVE_FIELDS.indexOf(field);
  if (idx === -1) return MOVE_FIELDS[0];
  return MOVE_FIELDS[(idx + direction + MOVE_FIELDS.length) % MOVE_FIELDS.length];
}

function clampScrollOffset(current, delta, totalLines, bodyHeight) {
  const maxOffset = Math.max(0, totalLines - bodyHeight);
  return Math.max(0, Math.min(maxOffset, current + delta));
}

function buildMoveOptionsFromData(columns, schemaStatuses, agentNames) {
  const column = uniqInOrder(columns.map((c) => c && c.name));
  const status = schemaStatuses.length > 0 ? schemaStatuses : ['todo', 'in_progress', 'blocked', 'review', 'done'];
  const assignees = uniqInOrder(['-', ...agentNames]);
  return {
    column,
    status,
    assignee: assignees.length > 0 ? assignees : ['-', 'bsa', 'coder', 'qa'],
  };
}

function parseBoardShowArgs(argv) {
  let boardPathHint;
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--help' || token === '-h') {
      return { help: true, boardPathHint };
    }
    if (token === '--board') {
      const next = argv[i + 1];
      if (!next) throw new Error('Missing value after --board');
      boardPathHint = next;
      i += 1;
      continue;
    }
    if (token.startsWith('--board=')) {
      boardPathHint = token.slice('--board='.length);
      continue;
    }
    if (token.startsWith('-')) {
      throw new Error(`Unknown argument: ${token}`);
    }
    if (boardPathHint !== undefined) {
      throw new Error('Usage: board_show [path] [--board <path>]');
    }
    boardPathHint = token;
  }
  return { help: false, boardPathHint };
}

module.exports = {
  ansiInverse,
  appendMoveComment,
  buildMoveOptionsFromData,
  buildTasksByColumn,
  clampScrollOffset,
  moveSelection,
  nextMoveField,
  normalizeSelection,
  parseBoardShowArgs,
  parseMouseWheelDelta,
  renderBoard,
  renderTaskDetails,
  selectedTask,
  taskLabel,
  truncate,
  uniqInOrder,
  visibleColumns,
  wrapText,
};
