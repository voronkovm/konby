const test = require('node:test');
const assert = require('node:assert/strict');
const {
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
} = require('../../lib/session_new');

test('parseSessionNewArgs accepts supported flags and validates required fields', () => {
  assert.deepEqual(parseSessionNewArgs([
    '--agent', 'agents/coder.yaml',
    '--task', 'tasks/1-test.yaml',
    '--board', './board',
    '--status-todo', 'new',
    '--status-in-progress', 'active',
    '--status-success', 'done',
    '--status-failure', 'blocked',
    '--completion-column', 'review',
    '--transcript', 'transcripts/1.txt',
    '--session-ts', '20260527T100000Z',
  ]), {
    agent: 'agents/coder.yaml',
    task: 'tasks/1-test.yaml',
    board: './board',
    statusTodo: 'new',
    statusInProgress: 'active',
    statusSuccess: 'done',
    statusFailure: 'blocked',
    completionColumn: 'review',
    transcript: 'transcripts/1.txt',
    sessionTs: '20260527T100000Z',
    help: false,
  });

  assert.deepEqual(parseSessionNewArgs(['--help']), {
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
    help: true,
  });
  assert.throws(() => parseSessionNewArgs(['--agent', 'agents/coder.yaml']), /--task is required/);
});

test('session identity helpers match tmux session naming invariant', () => {
  assert.equal(agentSlugFromFile('/tmp/agents/coder.yaml'), 'coder');
  assert.equal(sessionTimestampUtc(new Date('2026-05-27T10:00:00.000Z')), '20260527T100000Z');
  assert.equal(
    sessionIdForTask('coder', '/tmp/board/tasks/12-login.yaml', '20260527T100000Z'),
    'coder__12-login__20260527T100000Z',
  );
});

test('status and completion defaults mirror session_new shell defaults', () => {
  assert.deepEqual(statusValues({}), {
    todo: 'todo',
    in_progress: 'in_progress',
    success: 'done',
    failure: 'blocked',
  });
  assert.deepEqual(statusValues({
    statusTodo: 'new',
    statusInProgress: 'active',
    statusSuccess: 'merged',
    statusFailure: 'failed',
  }), {
    todo: 'new',
    in_progress: 'active',
    success: 'merged',
    failure: 'failed',
  });
  assert.equal(completionColumnValue('', ''), 'backlog');
  assert.equal(completionColumnValue('', 'doing'), 'doing');
  assert.equal(completionColumnValue('review', 'doing'), 'review');
  assert.equal(workspaceTypeValue(''), 'local');
});

test('workspace and transcript path helpers are pure path calculations', () => {
  assert.equal(resolveWorkspaceDir({
    workspaceDir: '',
    schemaWorkspaceDefault: 'workspace',
    boardDir: '/tmp/board',
  }), '/tmp/board/workspace');
  assert.equal(resolveWorkspaceDir({
    workspaceDir: '/repo',
    schemaWorkspaceDefault: 'workspace',
    boardDir: '/tmp/board',
  }), '/repo');

  const sessionId = 'coder__1-test__20260527T100000Z';
  assert.equal(defaultTranscriptPath('tasks/1-test.yaml', sessionId), 'transcripts/1-test/coder__1-test__20260527T100000Z.txt');
  assert.equal(transcriptAbsPath('/tmp/board', 'transcripts/1.txt'), '/tmp/board/transcripts/1.txt');
  assert.equal(transcriptPathRelativeToWorkspace('/tmp/board/transcripts/1.txt', '/tmp/board/workspace'), '../transcripts/1.txt');
});

test('worktreePlan delegates branch and directory calculation to worktree helpers', () => {
  assert.deepEqual(worktreePlan('/repo', '/tmp/board/tasks/1-test.yaml'), {
    branch: 'tasks/1-test',
    dir: '/repo/.konby-worktrees/tasks__1-test',
  });
});

test('yamlEscapeScalar uses shared YAML scalar escaping rules', () => {
  assert.equal(yamlEscapeScalar('/tmp/workspace'), '/tmp/workspace');
  assert.equal(yamlEscapeScalar('/tmp/work space'), '"/tmp/work space"');
});

test('YAML text readers mirror session_new shell scalar lookups', () => {
  const agentYaml = [
    'cli: codex',
    'role: |',
    '  You are coder.',
    '',
    '  Follow instructions.',
    'other: value',
  ].join('\n');
  const taskYaml = [
    'title: Test',
    'column: development',
    'workspace: "../repo path"',
  ].join('\n');
  const schemaYaml = [
    'properties:',
    '  workspace:',
    '    type: string',
    '    default: "../workspace"',
    '  status:',
    '    default: todo',
  ].join('\n');

  assert.equal(readBlockScalarText(agentYaml, 'role'), 'You are coder.\n\nFollow instructions.');
  assert.equal(readScalarText(agentYaml, 'cli'), 'codex');
  assert.equal(readScalarText(taskYaml, 'workspace'), '../repo path');
  assert.equal(readSchemaPropertyDefaultText(schemaYaml, 'workspace'), '../workspace');
  assert.equal(readSchemaPropertyDefaultText(schemaYaml, 'missing'), '');
});

test('runCli exposes YAML file readers for shell use', () => {
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'konby-session-test-'));
  const file = path.join(root, 'agent.yaml');
  fs.writeFileSync(file, 'cli: codex\nrole: |\n  Hello\n', 'utf8');

  const writes = [];
  const originalWrite = process.stdout.write;
  process.stdout.write = (chunk) => {
    writes.push(String(chunk));
    return true;
  };
  try {
    runCli(['read-scalar', '--file', file, '--key', 'cli']);
    runCli(['read-block', '--file', file, '--key', 'role']);
  } finally {
    process.stdout.write = originalWrite;
    fs.rmSync(root, { recursive: true, force: true });
  }

  assert.deepEqual(writes, ['codex', 'Hello']);
});

test('buildTaskMoveCommand and buildPrompt produce completion protocol text', () => {
  assert.equal(buildTaskMoveCommand({
    taskAbsPath: '/tmp/board/tasks/1-test.yaml',
    completionColumn: 'review',
    status: 'done',
    transcriptPath: '../transcripts/1.txt',
    agentSlug: 'coder',
    commentPlaceholder: '<short summary>',
  }), 'konby task move "/tmp/board/tasks/1-test.yaml" --column "review" --status "done" --comment "<short summary>" --attachment "../transcripts/1.txt" --author "coder"');

  const prompt = buildPrompt({
    roleText: 'You are coder.',
    taskText: 'title: Test',
    taskAbsPath: '/tmp/board/tasks/1-test.yaml',
    completionColumn: 'review',
    successStatus: 'done',
    failureStatus: 'blocked',
    transcriptPath: '../transcripts/1.txt',
    agentSlug: 'coder',
  });

  assert.match(prompt, /You are coder\./);
  assert.match(prompt, /<task>\ntitle: Test\n<\/task>/);
  assert.match(prompt, /--status "done"/);
  assert.match(prompt, /--status "blocked"/);
});

test('runCli exposes shell-consumable helper commands', () => {
  const writes = [];
  const originalWrite = process.stdout.write;
  process.stdout.write = (chunk) => {
    writes.push(String(chunk));
    return true;
  };
  try {
    runCli(['agent-slug', '--agent', 'agents/coder.yaml']);
    runCli(['session-id', '--agentSlug', 'coder', '--task', 'tasks/1-test.yaml', '--sessionTs', '20260527T100000Z']);
    runCli(['default-transcript', '--task', 'tasks/1-test.yaml', '--sessionId', 'coder__1-test__20260527T100000Z']);
    runCli(['yaml-escape', '--value', '/tmp/work space']);
  } finally {
    process.stdout.write = originalWrite;
  }

  assert.deepEqual(writes, [
    'coder\n',
    'coder__1-test__20260527T100000Z\n',
    'transcripts/1-test/coder__1-test__20260527T100000Z.txt\n',
    '"/tmp/work space"\n',
  ]);
});
