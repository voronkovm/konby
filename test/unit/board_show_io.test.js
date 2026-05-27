const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { readAgentNames, readSchemaEnum } = require('../../lib/board_show_io');

function makeTmpBoard() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'konby-board-io-test-'));
  return tmpDir;
}

test('readAgentNames returns names from agents/ directory', () => {
  const dir = makeTmpBoard();
  const agentsDir = path.join(dir, 'agents');
  fs.mkdirSync(agentsDir);
  fs.writeFileSync(path.join(agentsDir, 'bsa.yaml'), 'role: |\\n  bsa', 'utf8');
  fs.writeFileSync(path.join(agentsDir, 'coder.yml'), 'role: |\\n  coder', 'utf8');
  fs.writeFileSync(path.join(agentsDir, 'notes.txt'), 'ignore', 'utf8');
  const names = readAgentNames(dir);
  assert.deepEqual(names.sort(), ['bsa', 'coder']);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('readAgentNames returns empty array when agents/ is missing', () => {
  const dir = makeTmpBoard();
  assert.deepEqual(readAgentNames(dir), []);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('readSchemaEnum returns enum values from task.schema.yaml', () => {
  const dir = makeTmpBoard();
  const schema = {
    properties: {
      status: { type: 'string', enum: ['todo', 'in_progress', 'done'] },
    },
  };
  fs.writeFileSync(
    path.join(dir, 'task.schema.yaml'),
    `properties:\n  status:\n    type: string\n    enum:\n      - todo\n      - in_progress\n      - done\n`,
    'utf8',
  );
  const values = readSchemaEnum(dir, 'status');
  assert.deepEqual(values, ['todo', 'in_progress', 'done']);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('readSchemaEnum returns empty array when schema is missing', () => {
  const dir = makeTmpBoard();
  assert.deepEqual(readSchemaEnum(dir, 'status'), []);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('readSchemaEnum returns empty array for property without enum', () => {
  const dir = makeTmpBoard();
  fs.writeFileSync(
    path.join(dir, 'task.schema.yaml'),
    `properties:\n  title:\n    type: string\n`,
    'utf8',
  );
  assert.deepEqual(readSchemaEnum(dir, 'title'), []);
  assert.deepEqual(readSchemaEnum(dir, 'nonexistent'), []);
  fs.rmSync(dir, { recursive: true, force: true });
});
