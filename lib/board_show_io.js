const fs = require('fs');
const path = require('path');
const { loadYaml } = require('./yaml');
const { uniqInOrder } = require('./board_show');

function readAgentNames(projectDir) {
  const agentsDir = path.join(projectDir, 'agents');
  try {
    return fs.readdirSync(agentsDir)
      .filter((f) => /\.ya?ml$/i.test(f))
      .map((f) => f.replace(/\.ya?ml$/i, ''))
      .filter(Boolean);
  } catch (_) {
    return [];
  }
}

function readSchemaEnum(projectDir, propertyName) {
  const schemaPath = path.join(projectDir, 'task.schema.yaml');
  try {
    const schema = loadYaml(schemaPath);
    const values = schema
      && schema.properties
      && schema.properties[propertyName]
      && Array.isArray(schema.properties[propertyName].enum)
        ? schema.properties[propertyName].enum
        : [];
    return uniqInOrder(values);
  } catch (_) {
    return [];
  }
}

module.exports = {
  readAgentNames,
  readSchemaEnum,
};
