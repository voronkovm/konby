const test = require('node:test');
const assert = require('node:assert/strict');
const {
  formatYaml,
  parseInlineList,
  parseScalar,
  parseYamlSimple,
  yamlScalar,
} = require('../../lib/yaml');
const { orderBySchema } = require('../../lib/task_yaml');

test('parseScalar handles primitive values and JSON-style objects or arrays', () => {
  assert.equal(parseScalar('true'), true);
  assert.equal(parseScalar('42'), 42);
  assert.equal(parseScalar('null'), null);
  assert.deepEqual(parseScalar('{"a":1}'), { a: 1 });
  assert.deepEqual(parseScalar('[a,b]'), ['a', 'b']);
});

test('parseYamlSimple parses nested objects and arrays', () => {
  assert.deepEqual(parseYamlSimple([
    'title: Test',
    'tags: [api, ui]',
    'meta:',
    '  priority: high',
    'updates:',
    '  - author: coder',
    '    text: Done',
  ].join('\n')), {
    title: 'Test',
    tags: ['api', 'ui'],
    meta: { priority: 'high' },
    updates: [{ author: 'coder', text: 'Done' }],
  });
});

test('parseYamlSimple parses YAML folded block scalars', () => {
  assert.deepEqual(parseYamlSimple([
    'title: Implement i18n for all pages',
    'description: >',
    '  Implement i18n for all pages of canvs.io on the server side, not on',
    '  the JS/browser side.',
    '  EN is the default language.',
    'type: task',
  ].join('\n')), {
    title: 'Implement i18n for all pages',
    description: 'Implement i18n for all pages of canvs.io on the server side, not on the JS/browser side. EN is the default language.\n',
    type: 'task',
  });
});

test('formatYaml and yamlScalar produce stable simple YAML', () => {
  assert.equal(yamlScalar('/tmp/workspace'), '/tmp/workspace');
  assert.equal(yamlScalar('/tmp/work space'), '"/tmp/work space"');
  assert.equal(yamlScalar('-'), '"-"');
  assert.equal(formatYaml({
    title: 'Test task',
    tags: ['api', 'ui'],
    nested: { ok: true },
  }), [
    'title: "Test task"',
    'tags:',
    '  - api',
    '  - ui',
    'nested:',
    '  ok: true',
  ].join('\n'));
});

test('parseYamlSimple accepts legacy dash scalar output', () => {
  assert.deepEqual(parseYamlSimple([
    'assignee: -',
    'board:',
    '  columns:',
    '    - name: done',
    '      wip_limit: -',
  ].join('\n')), {
    assignee: '-',
    board: {
      columns: [
        { name: 'done', wip_limit: '-' },
      ],
    },
  });
});

test('parseYamlSimple decodes double-quoted JSON escapes emitted by formatYaml', () => {
  const value = 'Line one\rLine two with "quotes" and \\ slash';
  const formatted = formatYaml({ description: value });
  const parsed = parseYamlSimple(formatted);

  assert.equal(parsed.description, value);
  assert.equal(formatYaml(parsed), formatted);
});

test('parseInlineList parses comma-separated values including scalars', () => {
  assert.deepEqual(parseInlineList('[a, b, c]'), ['a', 'b', 'c']);
  assert.deepEqual(parseInlineList('[1, true, null]'), [1, true, null]);
  assert.deepEqual(parseInlineList('[]'), []);
});

test('parseScalar falls back to inline list when JSON.parse fails on bracket string', () => {
  // [a, b] is not valid JSON but should be parsed as inline list
  assert.deepEqual(parseScalar('[a, b]'), ['a', 'b']);
  // invalid object fallback
  assert.equal(parseScalar('{invalid}'), '{invalid}');
});

test('parseYamlSimple handles list item with key and no value', () => {
  // "- key:" in a list → key with no inline value; deeper-indented lines nest under it
  const result = parseYamlSimple([
    'items:',
    '  - title:',
    '      sub: yes',
  ].join('\n'));
  assert.deepEqual(result.items[0], { title: { sub: 'yes' } });
});

test('formatYaml renders array of objects with nested objects and nested arrays', () => {
  const obj = {
    tags: [['inner1', 'inner2']],
    updates: [{ author: 'coder', notes: { detail: 'done' } }],
    empty: [],
  };
  const out = formatYaml(obj);
  assert.match(out, /tags:/);
  assert.match(out, /inner1/);
  assert.match(out, /updates:/);
  assert.match(out, /author: coder/);
  assert.match(out, /empty: \[\]/);
});

test('orderBySchema recursively orders known fields before unknown fields', () => {
  const schema = {
    properties: {
      title: { type: 'string' },
      status: { type: 'string' },
      nested: {
        properties: {
          a: { type: 'string' },
        },
      },
    },
  };

  assert.deepEqual(orderBySchema({
    extra: 1,
    nested: { z: 2, a: 1 },
    status: 'todo',
    title: 'Test',
  }, schema), {
    title: 'Test',
    status: 'todo',
    nested: { a: 1, z: 2 },
    extra: 1,
  });
});
