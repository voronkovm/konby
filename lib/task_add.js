const {
  formatYaml,
  parseScalar,
  parseYamlSimple,
  yamlScalar,
} = require('./yaml');
const { orderBySchema } = require('./task_yaml');

function parseArgs(argv) {
  const out = { _: [], values: {}, set: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--') {
      out._.push(...argv.slice(i + 1));
      break;
    }
    if (!token.startsWith('--')) {
      out._.push(token);
      continue;
    }

    const raw = token.slice(2);
    if (raw === 'help' || raw === 'h') {
      out.help = true;
      continue;
    }

    if (raw === 'set') {
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) {
        throw new Error('Expected KEY=VALUE after --set');
      }
      out.set.push(next);
      i += 1;
      continue;
    }

    const eq = raw.indexOf('=');
    if (eq >= 0) {
      const key = raw.slice(0, eq);
      const value = raw.slice(eq + 1);
      out.values[key] = value;
      continue;
    }

    const key = raw;
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      out.values[key] = 'true';
      continue;
    }

    out.values[key] = next;
    i += 1;
  }
  return out;
}

function omitIdField(obj) {
  const clone = { ...obj };
  delete clone.id;
  return clone;
}

function coerceWithSchema(raw, schema) {
  if (!schema || !schema.type) return parseScalar(raw);

  if (schema.type === 'array') {
    if (raw.startsWith('[')) {
      const parsed = parseScalar(raw);
      if (!Array.isArray(parsed)) {
        throw new Error(`Expected JSON array, got: ${raw}`);
      }
      return parsed;
    }

    const parts = raw.split(',').map((x) => x.trim()).filter(Boolean);
    return parts.map((part) => coerceWithSchema(part, schema.items));
  }

  if (schema.type === 'object') {
    const parsed = parseScalar(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error(`Expected JSON object for field, got: ${raw}`);
    }
    return parsed;
  }

  if (schema.type === 'number' || schema.type === 'integer') {
    const num = Number(raw);
    if (!Number.isFinite(num)) throw new Error(`Expected number, got: ${raw}`);
    if (schema.type === 'integer' && !Number.isInteger(num)) {
      throw new Error(`Expected integer, got: ${raw}`);
    }
    return num;
  }

  if (schema.type === 'boolean') {
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    throw new Error(`Expected boolean (true|false), got: ${raw}`);
  }

  if (schema.type === 'string') return String(raw);

  return parseScalar(raw);
}

function normalizeKnownAliases(key, value, schemaProps) {
  if (key !== 'priority' || typeof value !== 'string') return value;
  const prop = schemaProps.priority;
  const enums = prop && Array.isArray(prop.enum) ? prop.enum : [];
  if (value === 'normal' && enums.includes('medium')) return 'medium';
  return value;
}

function validate(task, schema) {
  const errors = [];
  validateNode(task, schema, '$', errors);
  return errors;
}

function validateNode(value, schema, pathName, errors) {
  if (!schema || typeof schema !== 'object') return;

  if (schema.type) {
    if (!typeMatches(value, schema.type)) {
      errors.push(`${pathName}: expected ${schema.type}, got ${typeOf(value)}`);
      return;
    }
  }

  if (schema.enum && !schema.enum.includes(value)) {
    errors.push(`${pathName}: must be one of ${schema.enum.join(', ')}`);
  }

  if (schema.type === 'object') {
    const required = Array.isArray(schema.required) ? schema.required : [];
    for (const key of required) {
      if (!(key in value)) errors.push(`${pathName}.${key}: required`);
    }

    const props = schema.properties || {};

    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!(key in props)) errors.push(`${pathName}.${key}: additional property is not allowed`);
      }
    }

    for (const [key, propSchema] of Object.entries(props)) {
      if (key in value) validateNode(value[key], propSchema, `${pathName}.${key}`, errors);
    }
  }

  if (schema.type === 'array') {
    if (schema.uniqueItems === true) {
      const uniq = new Set(value.map((x) => JSON.stringify(x)));
      if (uniq.size !== value.length) errors.push(`${pathName}: must contain unique items`);
    }

    if (schema.items) {
      value.forEach((item, i) => validateNode(item, schema.items, `${pathName}[${i}]`, errors));
    }
  }

  if (schema.type === 'string') {
    if (typeof schema.minLength === 'number' && value.length < schema.minLength) {
      errors.push(`${pathName}: minLength is ${schema.minLength}`);
    }
    if (typeof schema.maxLength === 'number' && value.length > schema.maxLength) {
      errors.push(`${pathName}: maxLength is ${schema.maxLength}`);
    }
    if (schema.pattern) {
      const re = new RegExp(schema.pattern);
      if (!re.test(value)) errors.push(`${pathName}: does not match pattern ${schema.pattern}`);
    }
    if (schema.format === 'date') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) errors.push(`${pathName}: must match format date (YYYY-MM-DD)`);
    }
    if (schema.format === 'date-time') {
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) errors.push(`${pathName}: must match format date-time (ISO-8601)`);
    }
  }

  if (schema.type === 'number' || schema.type === 'integer') {
    if (typeof schema.minimum === 'number' && value < schema.minimum) {
      errors.push(`${pathName}: minimum is ${schema.minimum}`);
    }
    if (typeof schema.maximum === 'number' && value > schema.maximum) {
      errors.push(`${pathName}: maximum is ${schema.maximum}`);
    }
  }
}

function typeMatches(value, expected) {
  if (expected === 'array') return Array.isArray(value);
  if (expected === 'object') return !!value && typeof value === 'object' && !Array.isArray(value);
  if (expected === 'integer') return typeof value === 'number' && Number.isInteger(value);
  return typeof value === expected;
}

function typeOf(value) {
  if (Array.isArray(value)) return 'array';
  if (value === null) return 'null';
  return typeof value;
}

function buildTask(args, schema, options = {}) {
  const task = {};
  const schemaProps = schema.properties || {};
  const now = options.now || (() => new Date().toISOString());

  for (const [key, raw] of Object.entries(args.values)) {
    if (key === 'file' || key === 'schema' || key === 'dir' || key === 'force') continue;
    const propSchema = schemaProps[key] || null;
    const coerced = coerceWithSchema(raw, propSchema);
    task[key] = normalizeKnownAliases(key, coerced, schemaProps);
  }

  for (const pair of args.set) {
    const eq = pair.indexOf('=');
    if (eq < 1) throw new Error(`Invalid --set value: ${pair}. Use KEY=VALUE`);
    const key = pair.slice(0, eq);
    const rawValue = pair.slice(eq + 1);
    const propSchema = schemaProps[key] || null;
    const coerced = coerceWithSchema(rawValue, propSchema);
    task[key] = normalizeKnownAliases(key, coerced, schemaProps);
  }

  for (const [key, prop] of Object.entries(schemaProps)) {
    if (!(key in task) && Object.prototype.hasOwnProperty.call(prop, 'default')) {
      task[key] = prop.default;
    }
  }

  if (!(Object.prototype.hasOwnProperty.call(task, 'created_at')) && schemaProps.created_at) {
    task.created_at = now();
  }

  if (
    !(Object.prototype.hasOwnProperty.call(task, 'title')) &&
    Array.isArray(args._) &&
    args._.length > 0
  ) {
    task.title = args._.join(' ').trim();
  }

  return task;
}

function usage(schema) {
  const keys = Object.keys(schema.properties || {});
  return [
    'Usage:',
    '  task_add [--tasks <tasks_dir_rel>] [--schema <task.schema.yaml>] --description "..." [--id 10-my-task] [--status todo] [--priority medium] [--column backlog] [--board <path>]',
    '  task_add Текст задачи без параметра description',
    '  task_add --board ./my-board --set title="Fix bug" --set status=in_progress --set priority=critical',
    '',
    `Known fields from schema: ${keys.join(', ')}`,
    'If title is omitted, it is generated from description using LLM or the first 5 description words.',
    'If --id is omitted, id is auto-generated from title.',
    'File name is auto-generated as <N>-<title-slug>.yaml.',
    'Array fields: pass JSON (["a","b"]) or comma list (a,b).',
    'Object fields: pass JSON ({"k":"v"}).',
  ].join('\n');
}

function sanitizeFileNamePart(text) {
  return String(text).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

function transliterateRuToLat(text) {
  const translit = {
    а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i',
    й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't',
    у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '',
    э: 'e', ю: 'yu', я: 'ya',
  };
  const raw = String(text).toLowerCase();
  let mapped = '';
  for (const ch of raw) {
    mapped += Object.prototype.hasOwnProperty.call(translit, ch) ? translit[ch] : ch;
  }
  return mapped;
}

function generateLocalSlug(text, maxWords = 5) {
  const normalized = transliterateRuToLat(text);
  const tokens = normalized
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, maxWords);
  const slug = sanitizeFileNamePart(tokens.join('-'));
  return slug || 'task';
}

function nextTaskNumberFromFileNames(fileNames) {
  let max = 0;
  for (const name of fileNames || []) {
    const m = String(name).match(/^(\d+)-.*\.ya?ml$/i);
    if (!m) continue;
    const n = Number(m[1]);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max + 1;
}

function normalizeTaskType(value, allowedTypes) {
  const normalized = String(value || '').trim().toLowerCase();
  if (allowedTypes.includes(normalized)) return normalized;
  return 'task';
}

function firstWordsTitle(text, maxWords = 5) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean).slice(0, maxWords);
  return words.join(' ') || 'Task';
}

function parseGeneratedTaskMeta(content, fallbackText, allowedTypes) {
  let parsed = null;
  const raw = String(content || '');
  try {
    parsed = JSON.parse(raw.trim());
  } catch (_) {
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        parsed = JSON.parse(match[0]);
      } catch (_) {}
    }
  }

  const slugCandidate = parsed && typeof parsed.slug === 'string' ? parsed.slug : raw;
  const titleCandidate = parsed && typeof parsed.title === 'string' ? parsed.title.trim() : '';
  const cleanedSlug = sanitizeFileNamePart(slugCandidate);
  const title = titleCandidate ? firstWordsTitle(titleCandidate, 5) : firstWordsTitle(fallbackText, 5);
  return {
    title,
    slug: cleanedSlug || generateLocalSlug(fallbackText, 5),
    type: normalizeTaskType(parsed && parsed.type, allowedTypes),
  };
}

function deriveTaskIdentityFromNumber(obj, number, precomputedSlug) {
  const sourceText = obj.title || obj.id || 'task';
  const titleSlug = precomputedSlug || generateLocalSlug(sourceText, 5);
  const base = `${number}-${titleSlug || 'task'}`;
  return { id: base, fileName: `${base}.yaml` };
}

function taskYamlContent(obj, schema) {
  const ordered = orderBySchema(omitIdField(obj), schema);
  return `${formatYaml(ordered)}\n`;
}

module.exports = {
  buildTask,
  coerceWithSchema,
  deriveTaskIdentityFromNumber,
  firstWordsTitle,
  formatYaml,
  generateLocalSlug,
  nextTaskNumberFromFileNames,
  normalizeTaskType,
  orderBySchema,
  parseArgs,
  parseGeneratedTaskMeta,
  parseScalar,
  parseYamlSimple,
  sanitizeFileNamePart,
  taskYamlContent,
  transliterateRuToLat,
  usage,
  validate,
  yamlScalar,
};
