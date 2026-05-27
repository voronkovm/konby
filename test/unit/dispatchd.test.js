const test = require('node:test');
const assert = require('node:assert/strict');
const { parseDispatchdArgs } = require('../../lib/dispatchd');

test('parseDispatchdArgs returns defaults for empty argv', () => {
  const result = parseDispatchdArgs([]);
  assert.deepEqual(result, { board: '', logFile: '', daemon: false, help: false });
});

test('parseDispatchdArgs parses --board and --dir', () => {
  assert.equal(parseDispatchdArgs(['--board', '/my/board']).board, '/my/board');
  assert.equal(parseDispatchdArgs(['--dir', '/other']).board, '/other');
});

test('parseDispatchdArgs parses --log-file', () => {
  assert.equal(parseDispatchdArgs(['--log-file', '/tmp/out.log']).logFile, '/tmp/out.log');
});

test('parseDispatchdArgs parses --daemon', () => {
  assert.equal(parseDispatchdArgs(['--daemon']).daemon, true);
});

test('parseDispatchdArgs returns help: true for --help and -h', () => {
  assert.equal(parseDispatchdArgs(['--help']).help, true);
  assert.equal(parseDispatchdArgs(['-h']).help, true);
});

test('parseDispatchdArgs ignores args after --help', () => {
  const result = parseDispatchdArgs(['--help', '--board', '/x']);
  assert.equal(result.help, true);
  assert.equal(result.board, '');
});

test('parseDispatchdArgs throws on missing value for --board', () => {
  assert.throws(() => parseDispatchdArgs(['--board']), /requires a value/);
  assert.throws(() => parseDispatchdArgs(['--dir']), /requires a value/);
  assert.throws(() => parseDispatchdArgs(['--log-file']), /requires a value/);
});

test('parseDispatchdArgs throws on unknown argument', () => {
  assert.throws(() => parseDispatchdArgs(['--unknown']), /Unknown argument/);
});

test('parseDispatchdArgs handles combined flags', () => {
  const result = parseDispatchdArgs(['--board', '/b', '--log-file', '/l', '--daemon']);
  assert.equal(result.board, '/b');
  assert.equal(result.logFile, '/l');
  assert.equal(result.daemon, true);
});
