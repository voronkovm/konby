const fs = require('fs');

function parseEnvFileContent(text) {
  const result = {};
  for (const rawLine of String(text || '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

function applyEnvToProcess(parsed, env = process.env) {
  for (const [key, value] of Object.entries(parsed)) {
    if (!Object.prototype.hasOwnProperty.call(env, key)) {
      env[key] = value;
    }
  }
}

function loadEnvFile(envPath, env = process.env) {
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, 'utf8');
  applyEnvToProcess(parseEnvFileContent(content), env);
}

module.exports = { parseEnvFileContent, applyEnvToProcess, loadEnvFile };
