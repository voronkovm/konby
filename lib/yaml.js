const fs = require('fs');
const YAML = require('yaml');

function parseScalar(value) {
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null') return null;
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  if (value === '-') return '-';

  if ((value.startsWith('{') && value.endsWith('}')) || (value.startsWith('[') && value.endsWith(']'))) {
    try {
      return JSON.parse(value);
    } catch (_) {
      if (value.startsWith('[') && value.endsWith(']')) return parseInlineList(value);
      return value;
    }
  }

  return value;
}

function parseInlineList(text) {
  const body = text.slice(1, -1).trim();
  if (!body) return [];
  return body.split(',').map((part) => parseScalar(part.trim()));
}

function parseYamlSimple(input) {
  const normalized = input.replace(/^(\s*[^#\s][^:\n]*:\s*)-(\s*(?:#.*)?)$/gm, '$1"-"$2');
  const parsed = YAML.parse(normalized);
  return parsed == null ? {} : parsed;
}

function loadYaml(filePath) {
  return parseYamlSimple(fs.readFileSync(filePath, 'utf8'));
}

function yamlScalar(value) {
  if (value === null) return 'null';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value === '-') return '"-"';
  if (typeof value === 'string' && /^[A-Za-z0-9_./:@+-]+$/.test(value)) return value;
  return JSON.stringify(value);
}

function formatYaml(value, indent = 0) {
  const sp = ' '.repeat(indent);
  if (Array.isArray(value)) {
    if (value.length === 0) return `${sp}[]`;
    return value.map((item) => {
      if (item === null || typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean') {
        return `${sp}- ${yamlScalar(item)}`;
      }
      if (Array.isArray(item)) {
        return `${sp}-\n${formatYaml(item, indent + 2)}`;
      }
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        const nested = formatYaml(item, indent + 2).split('\n');
        return `${sp}- ${nested[0].trimStart()}\n${nested.slice(1).join('\n')}`;
      }
      return `${sp}- ${yamlScalar(item)}`;
    }).join('\n');
  }

  if (!value || typeof value !== 'object') return `${sp}${yamlScalar(value)}`;

  const lines = [];
  for (const [key, val] of Object.entries(value)) {
    if (Array.isArray(val)) {
      if (val.length === 0) lines.push(`${sp}${key}: []`);
      else lines.push(`${sp}${key}:\n${formatYaml(val, indent + 2)}`);
      continue;
    }
    if (val && typeof val === 'object') {
      lines.push(`${sp}${key}:\n${formatYaml(val, indent + 2)}`);
      continue;
    }
    lines.push(`${sp}${key}: ${yamlScalar(val)}`);
  }
  return lines.join('\n');
}

function saveYaml(filePath, obj) {
  fs.writeFileSync(filePath, `${formatYaml(obj)}\n`, 'utf8');
}

module.exports = {
  parseScalar,
  parseInlineList,
  parseYamlSimple,
  loadYaml,
  yamlScalar,
  formatYaml,
  saveYaml,
};
