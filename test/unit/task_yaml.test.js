const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { orderBySchema, saveTaskYamlOrdered } = require('../../lib/task_yaml');

const schema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    title: { type: 'string' },
    status: { type: 'string' },
    column: { type: 'string' },
    updates: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          author: { type: 'string' },
          text: { type: 'string' },
        },
      },
    },
  },
};

test('orderBySchema puts schema-defined keys before unknown keys', () => {
  const obj = { extra: 'x', title: 'hello', status: 'todo', id: '1' };
  const ordered = orderBySchema(obj, schema);
  const keys = Object.keys(ordered);
  assert.ok(keys.indexOf('id') < keys.indexOf('extra'));
  assert.ok(keys.indexOf('title') < keys.indexOf('extra'));
  assert.equal(ordered.extra, 'x');
});

test('orderBySchema recursively orders nested objects', () => {
  const obj = {
    updates: [
      { text: 'done', author: 'coder' },
    ],
  };
  const ordered = orderBySchema(obj, schema);
  const updateKeys = Object.keys(ordered.updates[0]);
  assert.equal(updateKeys[0], 'author');
  assert.equal(updateKeys[1], 'text');
});

test('orderBySchema returns primitives and null unchanged', () => {
  assert.equal(orderBySchema('hello', schema), 'hello');
  assert.equal(orderBySchema(null, schema), null);
  assert.equal(orderBySchema(42, schema), 42);
});

test('orderBySchema passes through arrays without items schema', () => {
  const obj = { updates: [{ b: 2, a: 1 }] };
  const noItemsSchema = { type: 'object', properties: { updates: { type: 'array' } } };
  const ordered = orderBySchema(obj, noItemsSchema);
  assert.deepEqual(ordered.updates[0], { b: 2, a: 1 });
});

test('saveTaskYamlOrdered writes task without schema when schema file is missing', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'konby-taskyaml-'));
  // create a board-like dir with dispatch.yaml but no task.schema.yaml
  fs.writeFileSync(path.join(tmpDir, 'dispatch.yaml'), 'board:\n  columns: []\n', 'utf8');
  const taskFile = path.join(tmpDir, 'task.yaml');
  const taskData = { title: 'Test', status: 'todo', extra: 'value' };
  saveTaskYamlOrdered(taskFile, taskData, { startDir: tmpDir });
  const written = fs.readFileSync(taskFile, 'utf8');
  assert.match(written, /title: Test/);
  assert.match(written, /status: todo/);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('saveTaskYamlOrdered orders by schema when schema file exists', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'konby-taskyaml-'));
  const boardDir = path.join(tmpDir, 'board');
  fs.mkdirSync(boardDir);
  fs.writeFileSync(path.join(boardDir, 'dispatch.yaml'), 'board:\n  columns: []\n', 'utf8');
  fs.writeFileSync(
    path.join(boardDir, 'task.schema.yaml'),
    'type: object\nproperties:\n  id:\n    type: string\n  title:\n    type: string\n  status:\n    type: string\n',
    'utf8',
  );
  const tasksDir = path.join(boardDir, 'tasks');
  fs.mkdirSync(tasksDir);
  const taskFile = path.join(tasksDir, '1-task.yaml');
  saveTaskYamlOrdered(taskFile, { extra: 'z', title: 'T', id: '1', status: 'todo' }, { startDir: tasksDir });
  const written = fs.readFileSync(taskFile, 'utf8');
  const idPos = written.indexOf('id:');
  const titlePos = written.indexOf('title:');
  const extraPos = written.indexOf('extra:');
  assert.ok(idPos < extraPos, 'id should come before extra');
  assert.ok(titlePos < extraPos, 'title should come before extra');
  fs.rmSync(tmpDir, { recursive: true, force: true });
});
