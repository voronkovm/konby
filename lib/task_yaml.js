const fs = require('fs');
const { resolveTaskSchemaPath: resolveTaskSchemaPathFromWorkdir } = require('./workdir');
const { loadYaml, saveYaml } = require('./yaml');

function orderBySchema(value, schema) {
  if (!schema || !value || typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    if (!schema.items) return value.map((item) => orderBySchema(item, null));
    return value.map((item) => orderBySchema(item, schema.items));
  }

  const out = {};
  const props = (schema && schema.properties) || {};
  for (const key of Object.keys(props)) {
    if (Object.prototype.hasOwnProperty.call(value, key)) {
      out[key] = orderBySchema(value[key], props[key]);
    }
  }
  for (const key of Object.keys(value)) {
    if (!Object.prototype.hasOwnProperty.call(out, key)) {
      out[key] = orderBySchema(value[key], props[key] || null);
    }
  }
  return out;
}

function resolveTaskSchemaPath(taskFileAbs, startDir = process.env.PWD || process.cwd()) {
  return resolveTaskSchemaPathFromWorkdir(taskFileAbs, startDir);
}

function saveTaskYamlOrdered(taskFileAbs, obj, options = {}) {
  const schemaPath = resolveTaskSchemaPath(taskFileAbs, options.startDir);
  if (!fs.existsSync(schemaPath)) {
    saveYaml(taskFileAbs, obj);
    return;
  }
  const schema = loadYaml(schemaPath);
  saveYaml(taskFileAbs, orderBySchema(obj, schema));
}

module.exports = {
  orderBySchema,
  resolveTaskSchemaPath,
  saveTaskYamlOrdered,
};
