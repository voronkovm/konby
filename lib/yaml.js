const fs = require('fs');

function parseScalar(value) {
  if (value.startsWith('[') && value.endsWith(']')) {
    const inner = value.slice(1, -1).trim();
    if (!inner) return [];
    return inner.split(',').map((item) => parseScalar(item.trim()));
  }
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null') return null;
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  if (value === '-') return '-';
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function parseYamlSimple(input) {
  const root = {};
  const stack = [{ indent: -1, kind: 'object', value: root }];
  const lines = input.replace(/\t/g, '  ').split(/\r?\n/);

  for (let idx = 0; idx < lines.length; idx += 1) {
    const raw = lines[idx];
    if (!raw.trim() || raw.trim().startsWith('#')) continue;

    const indent = raw.match(/^\s*/)[0].length;
    const line = raw.trim();

    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) stack.pop();
    const parent = stack[stack.length - 1];

    if (line.startsWith('- ')) {
      if (parent.kind !== 'array') throw new Error(`Invalid YAML list item at line ${idx + 1}`);
      const content = line.slice(2).trim();
      if (!content) {
        const node = {};
        parent.value.push(node);
        stack.push({ indent, kind: 'object', value: node });
        continue;
      }
      const keyMatch = content.match(/^([^:]+):(.*)$/);
      if (keyMatch) {
        const key = keyMatch[1].trim();
        const rawValue = keyMatch[2].trim();
        const node = {};
        node[key] = rawValue ? parseScalar(rawValue) : {};
        parent.value.push(node);
        if (!rawValue) {
          stack.push({ indent, kind: 'object', value: node[key] });
        } else {
          stack.push({ indent, kind: 'object', value: node });
        }
        continue;
      }
      parent.value.push(parseScalar(content));
      continue;
    }

    if (parent.kind !== 'object') throw new Error(`Invalid YAML map entry at line ${idx + 1}`);

    const match = line.match(/^([^:]+):(.*)$/);
    if (!match) throw new Error(`Cannot parse YAML line ${idx + 1}: ${line}`);

    const key = match[1].trim();
    const rawValue = match[2].trim();

    if (!rawValue) {
      const nextLine = lines.slice(idx + 1).find((l) => l.trim() && !l.trim().startsWith('#'));
      const nextTrim = nextLine ? nextLine.trim() : '';
      const isArray = nextTrim.startsWith('- ');
      if (isArray) {
        const arr = [];
        parent.value[key] = arr;
        stack.push({ indent, kind: 'array', value: arr });
      } else {
        const obj = {};
        parent.value[key] = obj;
        stack.push({ indent, kind: 'object', value: obj });
      }
      continue;
    }

    parent.value[key] = parseScalar(rawValue);
  }

  return root;
}

function loadYaml(filePath) {
  return parseYamlSimple(fs.readFileSync(filePath, 'utf8'));
}

function yamlScalar(value) {
  if (value === null) return 'null';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value === 'string' && /^[A-Za-z0-9_./:@+-]+$/.test(value)) return value;
  return JSON.stringify(value);
}

function formatYaml(value, indent = 0) {
  const sp = ' '.repeat(indent);
  if (Array.isArray(value)) {
    if (value.length === 0) return `${sp}[]`;
    return value.map((item) => {
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        const nested = formatYaml(item, indent + 2).split('\n');
        return `${sp}- ${nested[0].trimStart()}\n${nested.slice(1).join('\n')}`;
      }
      return `${sp}- ${yamlScalar(item)}`;
    }).join('\n');
  }

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
  parseYamlSimple,
  loadYaml,
  yamlScalar,
  formatYaml,
  saveYaml,
};
