const path = require('path');
const fs = require('fs');
const { sessionIdPrefix, taskSlugFromTaskFile } = require('./tmux_sessions');
const { taskBranchName, taskWorktreeDir } = require('./worktree');
const { yamlScalar } = require('./yaml');

function parseSessionNewArgs(argv) {
  const out = {
    agent: '',
    task: '',
    board: '',
    statusTodo: '',
    statusInProgress: '',
    statusSuccess: '',
    statusFailure: '',
    completionColumn: '',
    transcript: '',
    sessionTs: '',
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    const requireValue = () => {
      const value = argv[i + 1];
      if (!value) throw new Error(`${token} requires a value`);
      i += 1;
      return value;
    };

    if (token === '--agent') out.agent = requireValue();
    else if (token === '--task') out.task = requireValue();
    else if (token === '--board' || token === '--dir') out.board = requireValue();
    else if (token === '--status-todo') out.statusTodo = requireValue();
    else if (token === '--status-in-progress') out.statusInProgress = requireValue();
    else if (token === '--status-success') out.statusSuccess = requireValue();
    else if (token === '--status-failure') out.statusFailure = requireValue();
    else if (token === '--completion-column') out.completionColumn = requireValue();
    else if (token === '--transcript') out.transcript = requireValue();
    else if (token === '--session-ts') out.sessionTs = requireValue();
    else if (token === '--help' || token === '-h') out.help = true;
    else throw new Error(`Unknown argument: ${token}`);
  }

  if (!out.help && !out.agent) throw new Error('--agent is required');
  if (!out.help && !out.task) throw new Error('--task is required');
  return out;
}

function agentSlugFromFile(agentFile) {
  return path.basename(String(agentFile || '')).replace(/\.ya?ml$/i, '');
}

function sessionTimestampUtc(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function sessionIdForTask(agentSlug, taskFile, sessionTs) {
  return `${sessionIdPrefix(agentSlug, taskFile)}__${sessionTs}`;
}

function statusValues(args = {}) {
  return {
    todo: args.statusTodo || 'todo',
    in_progress: args.statusInProgress || 'in_progress',
    success: args.statusSuccess || 'done',
    failure: args.statusFailure || 'blocked',
  };
}

function completionColumnValue(argValue, taskColumn) {
  return argValue || taskColumn || 'backlog';
}

function workspaceTypeValue(taskWorkspaceType) {
  return taskWorkspaceType || 'local';
}

function resolveWorkspaceDir({ workspaceDir, schemaWorkspaceDefault, boardDir }) {
  let out = workspaceDir || schemaWorkspaceDefault || boardDir;
  if (!path.isAbsolute(out)) out = path.join(boardDir, out);
  return out;
}

function defaultTranscriptPath(taskFile, sessionId) {
  const taskSlug = taskSlugFromTaskFile(taskFile);
  return path.join('transcripts', taskSlug, `${sessionId}.txt`);
}

function transcriptAbsPath(boardDir, transcriptPath) {
  if (path.isAbsolute(transcriptPath)) return transcriptPath;
  return path.join(boardDir, transcriptPath);
}

function transcriptPathRelativeToWorkspace(transcriptAbs, workspaceDir) {
  return path.relative(workspaceDir, transcriptAbs) || '.';
}

function worktreePlan(repoRoot, taskFile) {
  return {
    branch: taskBranchName(taskFile),
    dir: taskWorktreeDir(repoRoot, taskFile),
  };
}

function yamlEscapeScalar(value) {
  return yamlScalar(String(value));
}

function readBlockScalarText(input, key) {
  const lines = String(input || '').replace(/\t/g, '  ').split(/\r?\n/);
  let inBlock = false;
  let baseIndent = -1;
  const out = [];

  for (const raw of lines) {
    if (!inBlock) {
      const re = new RegExp(`^\\s*${escapeRegExp(key)}:\\s*\\|`);
      if (re.test(raw)) inBlock = true;
      continue;
    }

    if (/^\s*$/.test(raw)) {
      out.push('');
      continue;
    }

    const indent = raw.match(/^\s*/)[0].length;
    if (baseIndent < 0) baseIndent = indent;
    if (indent < baseIndent) break;
    out.push(raw.slice(baseIndent));
  }

  return out.join('\n').replace(/\n+$/, '');
}

function readScalarText(input, key) {
  const lines = String(input || '').replace(/\t/g, '  ').split(/\r?\n/);
  const re = new RegExp(`^\\s*${escapeRegExp(key)}:\\s*(.*)$`);
  for (const raw of lines) {
    const match = raw.match(re);
    if (!match) continue;
    return unquoteYamlishScalar(match[1].trim());
  }
  return '';
}

function readSchemaPropertyDefaultText(input, property) {
  const lines = String(input || '').replace(/\t/g, '  ').split(/\r?\n/);
  let inProp = false;
  let propIndent = -1;
  const propRe = new RegExp(`^\\s*${escapeRegExp(property)}:\\s*$`);

  for (const raw of lines) {
    if (!inProp) {
      if (propRe.test(raw)) {
        propIndent = raw.match(/^\s*/)[0].length;
        inProp = true;
      }
      continue;
    }

    if (/^\s*$/.test(raw)) continue;
    const indent = raw.match(/^\s*/)[0].length;
    if (indent <= propIndent) {
      inProp = false;
      continue;
    }

    const match = raw.match(/^\s*default:\s*(.*)$/);
    if (match) return unquoteYamlishScalar(match[1].trim());
  }

  return '';
}

function unquoteYamlishScalar(value) {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildTaskMoveCommand({ taskAbsPath, completionColumn, status, transcriptPath, agentSlug, commentPlaceholder }) {
  return [
    'konby task move',
    JSON.stringify(taskAbsPath),
    '--column',
    JSON.stringify(completionColumn),
    '--status',
    JSON.stringify(status),
    '--comment',
    JSON.stringify(commentPlaceholder),
    '--attachment',
    JSON.stringify(transcriptPath),
    '--author',
    JSON.stringify(agentSlug),
  ].join(' ');
}

function buildPrompt({
  roleText,
  taskText,
  taskAbsPath,
  completionColumn,
  successStatus,
  failureStatus,
  transcriptPath,
  agentSlug,
}) {
  const successCommand = buildTaskMoveCommand({
    taskAbsPath,
    completionColumn,
    status: successStatus,
    transcriptPath,
    agentSlug,
    commentPlaceholder: '<short summary>',
  });
  const failureCommand = buildTaskMoveCommand({
    taskAbsPath,
    completionColumn,
    status: failureStatus,
    transcriptPath,
    agentSlug,
    commentPlaceholder: '<short blocker reason>',
  });

  return `${roleText}

Do the following task considering  its desription and updates:
<task>
${taskText}
</task>

Completion protocol:
- If you successfully completed instructions, update task with:
${successCommand}
- If can not complete instructions/role in regards to the task, update task with:
${failureCommand}
- If additional input from the user is required to proceed, move the task to "${failureStatus}" and explain what input is needed in the comment.
- Never modify/create any files outside of the workspace/sandbox other than by means of 'konby ...' commands.
- Never manually modify/create tasks/*.yaml or transcripts/*.txt files.`;
}

function cliArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      out._.push(token);
      continue;
    }
    const key = token.slice(2);
    const value = argv[i + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value after ${token}`);
    out[key] = value;
    i += 1;
  }
  return out;
}

function runCli(argv = process.argv.slice(2)) {
  const cmd = argv[0];
  const args = cliArgs(argv.slice(1));

  if (cmd === 'agent-slug') {
    if (!args.agent) throw new Error('agent-slug requires --agent');
    process.stdout.write(`${agentSlugFromFile(args.agent)}\n`);
    return;
  }

  if (cmd === 'session-id') {
    if (!args.agentSlug) throw new Error('session-id requires --agentSlug');
    if (!args.task) throw new Error('session-id requires --task');
    if (!args.sessionTs) throw new Error('session-id requires --sessionTs');
    process.stdout.write(`${sessionIdForTask(args.agentSlug, args.task, args.sessionTs)}\n`);
    return;
  }

  if (cmd === 'default-transcript') {
    if (!args.task) throw new Error('default-transcript requires --task');
    if (!args.sessionId) throw new Error('default-transcript requires --sessionId');
    process.stdout.write(`${defaultTranscriptPath(args.task, args.sessionId)}\n`);
    return;
  }

  if (cmd === 'yaml-escape') {
    if (!Object.prototype.hasOwnProperty.call(args, 'value')) throw new Error('yaml-escape requires --value');
    process.stdout.write(`${yamlEscapeScalar(args.value)}\n`);
    return;
  }

  if (cmd === 'read-block') {
    if (!args.file) throw new Error('read-block requires --file');
    if (!args.key) throw new Error('read-block requires --key');
    process.stdout.write(readBlockScalarText(fs.readFileSync(args.file, 'utf8'), args.key));
    return;
  }

  if (cmd === 'read-scalar') {
    if (!args.file) throw new Error('read-scalar requires --file');
    if (!args.key) throw new Error('read-scalar requires --key');
    process.stdout.write(readScalarText(fs.readFileSync(args.file, 'utf8'), args.key));
    return;
  }

  if (cmd === 'read-schema-default') {
    if (!args.file) throw new Error('read-schema-default requires --file');
    if (!args.property) throw new Error('read-schema-default requires --property');
    if (!fs.existsSync(args.file)) return;
    process.stdout.write(readSchemaPropertyDefaultText(fs.readFileSync(args.file, 'utf8'), args.property));
    return;
  }

  throw new Error(`Unknown command: ${cmd || ''}`);
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
  agentSlugFromFile,
  buildPrompt,
  buildTaskMoveCommand,
  completionColumnValue,
  defaultTranscriptPath,
  parseSessionNewArgs,
  readBlockScalarText,
  readScalarText,
  readSchemaPropertyDefaultText,
  resolveWorkspaceDir,
  runCli,
  sessionIdForTask,
  sessionTimestampUtc,
  statusValues,
  transcriptAbsPath,
  transcriptPathRelativeToWorkspace,
  workspaceTypeValue,
  worktreePlan,
  yamlEscapeScalar,
};
