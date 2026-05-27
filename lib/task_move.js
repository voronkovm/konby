function parseMoveArgs(argv) {
  if (argv.length === 0 || argv.includes('--help') || argv.includes('-h')) {
    return { help: true };
  }

  const out = {
    taskFile: argv[0],
    column: undefined,
    status: undefined,
    assignee: undefined,
    comment: undefined,
    attachment: undefined,
    author: undefined,
  };

  for (let i = 1; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--column' || token === '--stage') {
      if (!argv[i + 1]) throw new Error(`Missing value after ${token}`);
      out.column = argv[i + 1];
      i += 1;
      continue;
    }
    if (token === '--status') {
      if (!argv[i + 1]) throw new Error('Missing value after --status');
      out.status = argv[i + 1];
      i += 1;
      continue;
    }
    if (token === '--assignee') {
      if (!argv[i + 1]) throw new Error('Missing value after --assignee');
      out.assignee = argv[i + 1];
      i += 1;
      continue;
    }
    if (token === '--comment') {
      if (!argv[i + 1]) throw new Error('Missing value after --comment');
      out.comment = argv[i + 1];
      i += 1;
      continue;
    }
    if (token === '--attachment') {
      if (!argv[i + 1]) throw new Error('Missing value after --attachment');
      out.attachment = argv[i + 1];
      i += 1;
      continue;
    }
    if (token === '--author') {
      if (!argv[i + 1]) throw new Error('Missing value after --author');
      out.author = argv[i + 1];
      i += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${token}`);
  }

  if (
    out.column === undefined &&
    out.status === undefined &&
    out.assignee === undefined &&
    out.comment === undefined &&
    out.attachment === undefined
  ) {
    throw new Error('At least one of --column, --status, --assignee, --comment, --attachment must be provided');
  }

  return out;
}

function applyTaskMove(data, updates, options = {}) {
  const task = { ...data };
  const commentAuthor = String(updates.author === undefined ? (options.defaultAuthor || 'user') : updates.author).trim();
  if (!commentAuthor) throw new Error('--author cannot be empty');

  const prevColumn = String(task.column || '').trim();
  const prevStatus = String(task.status || '').trim();
  const prevAssignee = String(task.assignee || '').trim();

  if (updates.column !== undefined) task.column = updates.column;
  if (updates.status !== undefined) task.status = updates.status;
  if (updates.assignee !== undefined) task.assignee = updates.assignee;

  const nextColumn = String(task.column || '').trim();
  const nextStatus = String(task.status || '').trim();
  const nextAssignee = String(task.assignee || '').trim();
  const columnChanged = prevColumn !== nextColumn;
  const statusChanged = prevStatus !== nextStatus;
  const assigneeChanged = prevAssignee !== nextAssignee;
  const commentText = updates.comment === undefined ? '' : String(updates.comment).trim();
  const attachmentText = updates.attachment === undefined ? '' : String(updates.attachment).trim();

  if (updates.comment !== undefined && !commentText) throw new Error('--comment cannot be empty');
  if (updates.attachment !== undefined && !attachmentText) throw new Error('--attachment cannot be empty');

  if (columnChanged || statusChanged || assigneeChanged || updates.comment !== undefined || updates.attachment !== undefined) {
    const parts = [];
    if (statusChanged) parts.push(`status: ${prevStatus || '-'} -> ${nextStatus || '-'}`);
    if (columnChanged) parts.push(`column: ${prevColumn || '-'} -> ${nextColumn || '-'}`);
    if (assigneeChanged) parts.push(`assignee: ${prevAssignee || '-'} -> ${nextAssignee || '-'}`);
    if (commentText) parts.push(`comment: ${commentText}`);
    const text = parts.join(', ');
    const nextUpdates = Array.isArray(task.updates) ? [...task.updates] : [];
    const nextComment = {
      author: commentAuthor,
      text: text || 'task updated',
      created_at: (options.now || (() => new Date().toISOString()))(),
    };
    if (attachmentText) nextComment.attachments = [attachmentText];
    nextUpdates.push(nextComment);
    task.updates = nextUpdates;
  }

  task.updated_at = (options.now || (() => new Date().toISOString()))();

  return {
    task,
    prevAssignee,
    nextAssignee,
    assigneeChanged,
    columnChanged,
    statusChanged,
  };
}

module.exports = {
  applyTaskMove,
  parseMoveArgs,
};
