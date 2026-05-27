const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildTask,
  coerceWithSchema,
  deriveTaskIdentityFromNumber,
  generateLocalSlug,
  nextTaskNumberFromFileNames,
  parseArgs,
  parseGeneratedTaskMeta,
  parseYamlSimple,
  taskYamlContent,
  validate,
} = require('../../lib/task_add');

const schema = {
  type: 'object',
  required: ['title', 'status', 'priority'],
  additionalProperties: false,
  properties: {
    title: { type: 'string', minLength: 1 },
    status: { type: 'string', enum: ['todo', 'in_progress', 'done'], default: 'todo' },
    priority: { type: 'string', enum: ['low', 'medium', 'high'], default: 'medium' },
    tags: { type: 'array', items: { type: 'string' }, uniqueItems: true },
    estimate: { type: 'integer', minimum: 1 },
    created_at: { type: 'string', format: 'date-time' },
  },
};

test('parseArgs supports positional title, boolean flags, key=value, and --set', () => {
  assert.deepEqual(
    parseArgs(['--title=Fix login', '--force', '--set', 'estimate=3', 'extra', 'words']),
    {
      _: ['extra', 'words'],
      values: { title: 'Fix login', force: 'true' },
      set: ['estimate=3'],
    },
  );
});

test('coerceWithSchema coerces primitives, arrays, and objects', () => {
  assert.equal(coerceWithSchema('3', { type: 'integer' }), 3);
  assert.equal(coerceWithSchema('true', { type: 'boolean' }), true);
  assert.deepEqual(coerceWithSchema('api,ui', { type: 'array', items: { type: 'string' } }), ['api', 'ui']);
  assert.deepEqual(coerceWithSchema('{"a":1}', { type: 'object' }), { a: 1 });
  assert.throws(() => coerceWithSchema('3.5', { type: 'integer' }), /Expected integer/);
});

test('buildTask applies schema defaults, aliases priority normal, and accepts injected clock', () => {
  const task = buildTask(
    {
      _: [],
      values: { title: 'Fix login', priority: 'normal', estimate: '2' },
      set: ['tags=api,auth'],
    },
    schema,
    { now: () => '2026-05-27T10:00:00.000Z' },
  );

  assert.deepEqual(task, {
    title: 'Fix login',
    priority: 'medium',
    estimate: 2,
    tags: ['api', 'auth'],
    status: 'todo',
    created_at: '2026-05-27T10:00:00.000Z',
  });
});

test('validate reports required fields, enum errors, uniqueness, and extra properties', () => {
  assert.deepEqual(validate({
    title: '',
    status: 'blocked',
    priority: 'medium',
    tags: ['api', 'api'],
    extra: true,
  }, schema), [
    '$.extra: additional property is not allowed',
    '$.title: minLength is 1',
    '$.status: must be one of todo, in_progress, done',
    '$.tags: must contain unique items',
  ]);
});

test('slug and identity generation are pure and deterministic', () => {
  assert.equal(generateLocalSlug('Добавить OAuth вход!'), 'dobavit-oauth-vhod');
  assert.equal(nextTaskNumberFromFileNames(['1-a.yaml', '003-b.yml', 'note.txt']), 4);
  assert.deepEqual(
    deriveTaskIdentityFromNumber({ title: 'Fix Login Flow' }, 12),
    { id: '12-fix-login-flow', fileName: '12-fix-login-flow.yaml' },
  );
});

test('parseGeneratedTaskMeta tolerates JSON wrapped in text and normalizes type', () => {
  assert.deepEqual(
    parseGeneratedTaskMeta('Result: {"slug":"Fix Login","type":"Bug"}', 'fallback title', ['task', 'bug']),
    { slug: 'fix-login', type: 'bug' },
  );
  assert.deepEqual(
    parseGeneratedTaskMeta('not json', 'Fallback Title', ['task', 'bug']),
    { slug: 'not-json', type: 'task' },
  );
});

test('parseYamlSimple and taskYamlContent keep schema order without id field', () => {
  const parsed = parseYamlSimple([
    'type: object',
    'properties:',
    '  title:',
    '    type: string',
    '  status:',
    '    type: string',
  ].join('\n'));

  assert.deepEqual(parsed, {
    type: 'object',
    properties: {
      title: { type: 'string' },
      status: { type: 'string' },
    },
  });

  assert.equal(
    taskYamlContent({ id: '1-test', status: 'todo', title: 'Test' }, parsed),
    'title: Test\nstatus: todo\n',
  );
});
