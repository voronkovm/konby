const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { parseEnvFileContent, applyEnvToProcess, loadEnvFile } = require('../../lib/env');

test('parseEnvFileContent parses simple KEY=VALUE pairs', () => {
  assert.deepEqual(parseEnvFileContent('FOO=bar\nBAZ=qux'), { FOO: 'bar', BAZ: 'qux' });
});

test('parseEnvFileContent strips double and single quotes', () => {
  assert.deepEqual(parseEnvFileContent('A="hello world"\nB=\'world\''), { A: 'hello world', B: 'world' });
});

test('parseEnvFileContent skips comments and blank lines', () => {
  assert.deepEqual(parseEnvFileContent('# comment\n\nFOO=1\n  # indented comment\nBAR=2'), { FOO: '1', BAR: '2' });
});

test('parseEnvFileContent ignores lines without = or with empty key', () => {
  assert.deepEqual(parseEnvFileContent('NOEQUALS\n=NOKEY\nVALID=ok'), { VALID: 'ok' });
});

test('parseEnvFileContent handles windows line endings', () => {
  assert.deepEqual(parseEnvFileContent('A=1\r\nB=2\r\n'), { A: '1', B: '2' });
});

test('applyEnvToProcess only sets keys not already present', () => {
  const env = { EXISTING: 'keep' };
  applyEnvToProcess({ EXISTING: 'ignored', NEW: 'added' }, env);
  assert.equal(env.EXISTING, 'keep');
  assert.equal(env.NEW, 'added');
});

test('loadEnvFile silently returns when file does not exist', () => {
  const env = {};
  loadEnvFile('/nonexistent/.env', env);
  assert.deepEqual(env, {});
});

test('loadEnvFile reads and applies a real .env file', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'konby-env-test-'));
  const envPath = path.join(tmpDir, '.env');
  fs.writeFileSync(envPath, 'MY_TOKEN=secret\nDEBUG=true\n', 'utf8');
  const env = {};
  loadEnvFile(envPath, env);
  assert.equal(env.MY_TOKEN, 'secret');
  assert.equal(env.DEBUG, 'true');
  fs.rmSync(tmpDir, { recursive: true, force: true });
});
