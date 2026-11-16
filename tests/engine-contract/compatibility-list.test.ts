/**
 * The generated list of COMPATIBILITY.md: the committed text is what the
 * generator writes from the upstream spec and the copy of Engine's OpenAPI
 * file, and the comparison behind it finds each kind of difference it lists.
 * Layer 1: it reads files of this repository.
 */
import fs from 'node:fs';

type Schema = Record<string, unknown>;

// The generator is a plain Node script, so the document can be rewritten without a build.
const list = require('../../scripts/compatibility-list.cjs') as {
  documentPath: string;
  generate(): string;
  withGenerated(document: string, part: string): string;
  compare(
    documents: { upstream: Schema; engine: Schema },
    upstream: Schema,
    engine: Schema,
    at: string,
    found: Set<string>,
  ): void;
  takenSchema(engine: Schema, content: Record<string, { schema: Schema }>): Schema;
};

test('the generated list of COMPATIBILITY.md is the one its script writes today', () => {
  const committed = fs.readFileSync(list.documentPath, 'utf8');
  const current = list.withGenerated(committed, list.generate());
  // Compared line by line, so a failure shows the lines that moved and not the whole document.
  expect(
    committed.split('\n'),
    'COMPATIBILITY.md is out of date: run `node scripts/compatibility-list.cjs`',
  ).toEqual(current.split('\n'));
});

const text = { type: 'string' };
const closed = (properties: Schema, required: string[] = []): Schema => ({
  type: 'object',
  additionalProperties: false,
  properties,
  required,
});
const tagged = (tag: string, properties: Schema = {}): Schema =>
  closed({ type: { const: tag }, ...properties }, ['type']);

test.each<[string, Schema, Schema, Array<[string, string, string]>]>([
  [
    'a field a closed object lacks',
    closed({ a: text, b: text }),
    closed({ a: text }),
    [['body.b', 'field', '']],
  ],
  [
    'a field an open object lacks',
    closed({ a: text, b: text }),
    { type: 'object', properties: { a: text } },
    [],
  ],
  [
    'a member of a union, and a field inside a shared member',
    { oneOf: [tagged('one', { x: text }), tagged('two')] },
    { oneOf: [tagged('one')] },
    [
      ['body', 'member', 'two'],
      ['body<one>.x', 'field', ''],
    ],
  ],
  [
    'a value of a string',
    closed({ speed: { enum: ['standard', 'fast'] } }),
    closed({ speed: { enum: ['standard'] } }),
    [['body.speed', 'value', 'fast']],
  ],
  [
    'an object where only null is taken',
    closed({ topology: { anyOf: [closed({}), { type: 'null' }] } }),
    closed({ topology: { type: 'null' } }),
    [['body.topology', 'null', '']],
  ],
  [
    'a string where only null is taken',
    closed({ retires_at: { anyOf: [text, { type: 'null' }] } }),
    closed({ retires_at: { type: 'null' } }),
    [['body.retires_at', 'null', '']],
  ],
  [
    'null where Engine takes a value and no null',
    closed({ content: { anyOf: [text, { type: 'null' }] } }),
    closed({ content: text }),
    [['body.content', 'value', 'null']],
  ],
  [
    'no refused null where Engine states no type',
    closed({ content: { anyOf: [text, { type: 'null' }] } }),
    closed({ content: {} }),
    [],
  ],
  [
    'a field only Engine requires, in a list item reached through $ref',
    { type: 'array', items: { $ref: '#/item' } },
    { type: 'array', items: closed({ token: text }, ['token']) },
    [['body[].token', 'required', '']],
  ],
  ['the same shapes', closed({ a: text }, ['a']), closed({ a: text }, ['a']), []],
])('the comparison finds %s', (_name, upstream, engine, expected) => {
  const found = new Set<string>();
  list.compare({ upstream: { item: closed({ token: text }) }, engine: {} }, upstream, engine, 'body', found);
  expect([...found].map((one) => JSON.parse(one)).sort()).toEqual(expected);
});

test('a form field that takes several parts is compared under the name the upstream spec gives the list', () => {
  const form = closed({ 'files[]': { type: 'array', items: text }, title: text }, ['files[]']);
  const taken = list.takenSchema({}, { 'multipart/form-data': { schema: form } });
  const found = new Set<string>();
  list.compare(
    { upstream: {}, engine: {} },
    closed({ files: { type: 'array', items: text } }, ['files']),
    taken,
    'body',
    found,
  );
  expect([...found]).toEqual([]);
});
