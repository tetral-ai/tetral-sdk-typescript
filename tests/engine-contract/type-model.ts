/**
 * One structural model for a TypeScript type of the SDK and for a schema of
 * the Engine OpenAPI copy, so the two can be compared field by field.
 *
 * The model keeps what a value may look like on the wire: its kind, its
 * literals, its properties with their optionality, and the value type of a
 * dictionary. It drops what does not change a TypeScript type: descriptions,
 * formats, patterns and size limits.
 */
import path from 'node:path';
import ts from 'typescript';

import { resolvePointer, type JSONSchema, type OpenAPIDocument } from './spec';

export type Model =
  | { kind: 'string' | 'number' | 'boolean' | 'null' | 'unknown' | 'cycle' }
  | { kind: 'literal'; value: string | number | boolean }
  | { kind: 'array'; items: Model }
  | { kind: 'object'; properties: Record<string, Property>; additional: Model | null }
  | { kind: 'union'; members: Model[] };

export interface Property {
  model: Model;
  optional: boolean;
}

const UNKNOWN: Model = { kind: 'unknown' };

// Keywords that describe or bound a value without changing its TypeScript type.
const ANNOTATIONS = new Set([
  'description',
  'title',
  'format',
  'pattern',
  'minLength',
  'maxLength',
  'minimum',
  'maximum',
  'minItems',
  'maxItems',
  'maxProperties',
  'propertyNames',
  'discriminator',
  'default',
  'deprecated',
  'examples',
  // Rules on the values of an array or a string, not on their type.
  'contains',
  'minContains',
  'maxContains',
  'contentMediaType',
]);

function structuralKeys(schema: JSONSchema): string[] {
  return Object.keys(schema).filter((key) => !ANNOTATIONS.has(key) && !key.startsWith('x-'));
}

function union(members: Model[]): Model {
  const flat: Model[] = [];
  for (const member of members) {
    if (member.kind === 'union') flat.push(...member.members);
    else flat.push(member);
  }
  const byKey = new Map<string, Model>();
  for (const member of flat) byKey.set(canonical(member), member);
  // `true | false` is how TypeScript holds `boolean`.
  const trueKey = canonical({ kind: 'literal', value: true });
  const falseKey = canonical({ kind: 'literal', value: false });
  if (byKey.has(trueKey) && byKey.has(falseKey)) {
    byKey.delete(trueKey);
    byKey.delete(falseKey);
    byKey.set(canonical({ kind: 'boolean' }), { kind: 'boolean' });
  }
  if (byKey.has(canonical(UNKNOWN))) return UNKNOWN;
  const unique = [...byKey.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([, member]) => member);
  return unique.length === 1 ? unique[0]! : { kind: 'union', members: unique };
}

function intersect(models: Model[], where: string): Model {
  if (models.length === 1) return models[0]!;
  const properties: Record<string, Property> = {};
  let additional: Model | null = UNKNOWN;
  for (const model of models) {
    if (model.kind !== 'object') throw new Error(`${where}: allOf of a non-object is not modelled`);
    for (const [name, property] of Object.entries(model.properties)) {
      const existing = properties[name];
      if (existing && canonical(existing.model) !== canonical(property.model)) {
        throw new Error(`${where}: allOf members disagree on ${name}`);
      }
      properties[name] = {
        model: property.model,
        optional: (existing?.optional ?? true) && property.optional,
      };
    }
    if (model.additional === null) additional = null;
    else if (additional !== null && model.additional.kind !== 'unknown') additional = model.additional;
  }
  return { kind: 'object', properties, additional };
}

/** The model of a schema of the copy. Throws on a schema form it does not model. */
export function schemaModel(
  document: OpenAPIDocument,
  schema: JSONSchema | boolean,
  where = '#',
  stack: string[] = [],
): Model {
  if (schema === true) return UNKNOWN;
  if (schema === false) throw new Error(`${where}: a schema that accepts nothing is not modelled`);
  const keys = structuralKeys(schema);
  if (keys.length === 0) return UNKNOWN;

  if (typeof schema['$ref'] === 'string') {
    const ref = schema['$ref'];
    if (keys.length !== 1) throw new Error(`${where}: $ref beside ${keys.join(', ')} is not modelled`);
    if (stack.includes(ref)) return { kind: 'cycle' };
    return schemaModel(document, resolvePointer(document, ref) as JSONSchema, ref, [...stack, ref]);
  }

  const expect = (allowed: string[]) => {
    const extra = keys.filter((key) => !allowed.includes(key));
    if (extra.length > 0) throw new Error(`${where}: ${extra.join(', ')} is not modelled here`);
  };

  if (schema['allOf']) {
    expect(['allOf']);
    const parts = schema['allOf'] as JSONSchema[];
    return intersect(
      parts.map((part, index) => schemaModel(document, part, `${where}/allOf/${index}`, stack)),
      where,
    );
  }

  const alternatives = (schema['oneOf'] ?? schema['anyOf']) as JSONSchema[] | undefined;
  if (alternatives && !schema['properties']) {
    // `type: object` beside a union only repeats what every member already says.
    expect(['oneOf', 'anyOf', 'type']);
    const key = schema['oneOf'] ? 'oneOf' : 'anyOf';
    return union(
      alternatives.map((part, index) => schemaModel(document, part, `${where}/${key}/${index}`, stack)),
    );
  }

  if ('const' in schema) {
    expect(['const', 'type']);
    // A fixed number is a bound that may move (a limit), so it reads as a number.
    if (typeof schema['const'] === 'number') return { kind: 'number' };
    return literal(schema['const'], where);
  }
  if (schema['enum']) {
    expect(['enum', 'type']);
    return union((schema['enum'] as unknown[]).map((value) => literal(value, where)));
  }

  const type = schema['type'];
  if (Array.isArray(type)) {
    return union(type.map((one) => schemaModel(document, { ...schema, type: one }, where, stack)));
  }
  switch (type) {
    case 'string':
      expect(['type']);
      return { kind: 'string' };
    case 'integer':
    case 'number':
      expect(['type']);
      return { kind: 'number' };
    case 'boolean':
      expect(['type']);
      return { kind: 'boolean' };
    case 'null':
      return { kind: 'null' };
    case 'array':
      expect(['type', 'items']);
      // An array that may hold no item: any array type takes it.
      if (schema['maxItems'] === 0) return { kind: 'array', items: { kind: 'union', members: [] } };
      return {
        kind: 'array',
        items:
          schema['items'] === undefined ?
            UNKNOWN
          : schemaModel(document, schema['items'] as JSONSchema, `${where}/items`, stack),
      };
  }
  if (type === 'object' || schema['properties']) {
    // A `oneOf` beside `properties` only constrains which properties go together;
    // each alternative must not name a property of its own.
    expect(['type', 'properties', 'required', 'additionalProperties', 'oneOf', 'anyOf']);
    for (const alternative of alternatives ?? []) {
      const extra = structuralKeys(alternative).filter((key) => !['required', 'not'].includes(key));
      if (extra.length > 0) {
        throw new Error(`${where}: a union beside properties may only state required/not, got ${extra}`);
      }
    }
    const required = new Set((schema['required'] as string[] | undefined) ?? []);
    const properties: Record<string, Property> = {};
    for (const [name, property] of Object.entries(
      (schema['properties'] as Record<string, JSONSchema> | undefined) ?? {},
    )) {
      properties[name] = {
        model: schemaModel(document, property, `${where}/properties/${name}`, stack),
        optional: !required.has(name),
      };
    }
    const additionalProperties = schema['additionalProperties'] as JSONSchema | boolean | undefined;
    const additional =
      additionalProperties === false ? null
      : additionalProperties === undefined ? UNKNOWN
      : schemaModel(document, additionalProperties, `${where}/additionalProperties`, stack);
    return { kind: 'object', properties, additional };
  }
  throw new Error(`${where}: schema form is not modelled: ${JSON.stringify(schema).slice(0, 200)}`);
}

function literal(value: unknown, where: string): Model {
  if (value === null) return { kind: 'null' };
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return { kind: 'literal', value };
  }
  throw new Error(`${where}: a literal of type ${typeof value} is not modelled`);
}

/** A TypeScript program over the SDK's sources, for reading its declared types. */
export class SDKTypes {
  readonly checker: ts.TypeChecker;
  private readonly program: ts.Program;
  private readonly root: string;
  private unread: string[] = [];

  constructor(files: string[]) {
    this.root = path.resolve(__dirname, '../..');
    const configPath = path.join(this.root, 'tsconfig.json');
    const config = ts.getParsedCommandLineOfConfigFile(configPath, undefined, {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
        throw new Error(ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
      },
    });
    if (!config) throw new Error(`cannot read ${configPath}`);
    this.program = ts.createProgram(
      files.map((file) => path.join(this.root, file)),
      { ...config.options, noEmit: true },
    );
    this.checker = this.program.getTypeChecker();
  }

  /** The declared type of an exported interface or type alias of a source file. */
  type(file: string, name: string): ts.Type {
    const source = this.program.getSourceFile(path.join(this.root, file));
    const moduleSymbol = source && this.checker.getSymbolAtLocation(source);
    if (!moduleSymbol) throw new Error(`${file} is not a module of the program`);
    const symbol = this.checker.getExportsOfModule(moduleSymbol).find((entry) => entry.name === name);
    if (!symbol) throw new Error(`${file} exports no ${name}`);
    const target = symbol.flags & ts.SymbolFlags.Alias ? this.checker.getAliasedSymbol(symbol) : symbol;
    return this.checker.getDeclaredTypeOfSymbol(target);
  }

  /**
   * The model of a declared type. A property named in `unread` is modelled as
   * anything: a file part, whose TypeScript type describes no JSON.
   */
  model(file: string, name: string, unread: string[] = []): Model {
    this.unread = unread;
    try {
      return this.modelOf(this.type(file, name), `${name}`, []);
    } finally {
      this.unread = [];
    }
  }

  /** The files of the program that declare an exported interface or type alias of this name. */
  declaring(name: string): string[] {
    const found: string[] = [];
    for (const source of this.program.getRootFileNames().map((file) => this.program.getSourceFile(file)!)) {
      const moduleSymbol = this.checker.getSymbolAtLocation(source);
      const symbol =
        moduleSymbol && this.checker.getExportsOfModule(moduleSymbol).find((entry) => entry.name === name);
      // A re-export is an alias; only the file that writes the declaration counts.
      if (!symbol || symbol.flags & ts.SymbolFlags.Alias) continue;
      const declared = (symbol.declarations ?? []).some(
        (one) =>
          one.getSourceFile() === source &&
          (ts.isInterfaceDeclaration(one) || ts.isTypeAliasDeclaration(one)),
      );
      if (declared) found.push(path.relative(this.root, source.fileName));
    }
    return found;
  }

  private modelOf(type: ts.Type, where: string, stack: ts.Type[]): Model {
    const checker = this.checker;
    const flags = type.flags;
    if (flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) return UNKNOWN;
    if (flags & ts.TypeFlags.Null) return { kind: 'null' };
    if (flags & ts.TypeFlags.BooleanLiteral) {
      return { kind: 'literal', value: checker.typeToString(type) === 'true' };
    }
    if (flags & (ts.TypeFlags.StringLiteral | ts.TypeFlags.NumberLiteral)) {
      return { kind: 'literal', value: (type as ts.LiteralType).value as string | number };
    }
    if (flags & ts.TypeFlags.String) return { kind: 'string' };
    if (flags & ts.TypeFlags.Number) return { kind: 'number' };
    if (flags & ts.TypeFlags.Boolean) return { kind: 'boolean' };
    if (type.isUnion()) {
      return union(
        type.types
          .filter((member) => !(member.flags & ts.TypeFlags.Undefined))
          .map((member) => this.modelOf(member, where, stack)),
      );
    }
    if (type.isIntersection()) {
      // `(string & {})` keeps literal completion on an open string: it is a string.
      const primitive = type.types.find((member) => member.flags & ts.TypeFlags.String);
      if (primitive) return { kind: 'string' };
    }
    if (stack.includes(type)) return { kind: 'cycle' };
    const next = [...stack, type];
    if (checker.isArrayType(type)) {
      const [items] = checker.getTypeArguments(type as ts.TypeReference);
      return { kind: 'array', items: this.modelOf(items!, `${where}[]`, next) };
    }
    if (flags & ts.TypeFlags.Object || type.isIntersection()) {
      if (type.getCallSignatures().length > 0) {
        throw new Error(`${where}: a function type has no wire shape`);
      }
      const properties: Record<string, Property> = {};
      for (const symbol of checker.getPropertiesOfType(type)) {
        const declared = checker.getTypeOfSymbol(symbol);
        // `name?: never` says the property must not be sent: it is no property.
        const absent = (one: ts.Type) => Boolean(one.flags & (ts.TypeFlags.Never | ts.TypeFlags.Undefined));
        if (declared.isUnion() ? declared.types.every(absent) : absent(declared)) continue;
        properties[symbol.name] = {
          model:
            this.unread.includes(symbol.name) ?
              UNKNOWN
            : this.modelOf(declared, `${where}.${symbol.name}`, next),
          optional: Boolean(symbol.flags & ts.SymbolFlags.Optional),
        };
      }
      const index = checker
        .getIndexInfosOfType(type)
        .find((info) => info.keyType.flags & ts.TypeFlags.String);
      return {
        kind: 'object',
        properties,
        additional: index ? this.modelOf(index.type, `${where}[key]`, next) : null,
      };
    }
    throw new Error(`${where}: TypeScript type is not modelled: ${checker.typeToString(type)}`);
  }
}

function canonical(model: Model): string {
  switch (model.kind) {
    case 'literal':
      return JSON.stringify(model.value);
    case 'array':
      return `Array<${canonical(model.items)}>`;
    case 'union':
      return model.members.map(canonical).join(' | ');
    case 'object': {
      const fields = Object.keys(model.properties)
        .sort()
        .map((name) => {
          const property = model.properties[name]!;
          return `${name}${property.optional ? '?' : ''}: ${canonical(property.model)}`;
        });
      if (model.additional) fields.push(`[key]: ${canonical(model.additional)}`);
      return `{ ${fields.join('; ')} }`;
    }
    default:
      return model.kind;
  }
}

/** A short rendering of a model for a failure message. */
export function show(model: Model): string {
  const text = canonical(model);
  return text.length > 160 ? `${text.slice(0, 157)}...` : text;
}

function members(model: Model): Model[] {
  return model.kind === 'union' ? model.members : [model];
}

function tagOf(model: Model): string | undefined {
  const tag = model.kind === 'object' ? model.properties['type']?.model : undefined;
  return tag?.kind === 'literal' && typeof tag.value === 'string' ? tag.value : undefined;
}

/**
 * The same model with every object whose `type` is one of several literals
 * written as one object per literal, so `{type: 'a' | 'b'}` and
 * `{type: 'a'} | {type: 'b'}` read alike.
 */
export function expand(model: Model): Model {
  switch (model.kind) {
    case 'array':
      return { kind: 'array', items: expand(model.items) };
    case 'union':
      return union(model.members.map(expand));
    case 'object': {
      const properties: Record<string, Property> = {};
      for (const [name, property] of Object.entries(model.properties)) {
        properties[name] = { model: expand(property.model), optional: property.optional };
      }
      const expanded: Model = {
        kind: 'object',
        properties,
        additional: model.additional && expand(model.additional),
      };
      const tag = properties['type'];
      if (!tag || tag.model.kind !== 'union' || !tag.model.members.every((one) => one.kind === 'literal')) {
        return expanded;
      }
      return union(
        tag.model.members.map((one) => ({
          ...expanded,
          properties: { ...properties, type: { model: one, optional: tag.optional } },
        })),
      );
    }
    default:
      return model;
  }
}

export interface Sides {
  /** The name of the side whose values are tested, as "the SDK type". */
  from: string;
  /** The name of the side that must take them. */
  into: string;
}

/**
 * Why a value of `from` may fail to be a value of `into`: one line per place.
 * Empty when every value `from` allows is one `into` allows.
 */
export function outside(from: Model, into: Model, at: string, sides: Sides): string[] {
  return outsideOf(expand(from), expand(into), at, sides);
}

function outsideOf(from: Model, into: Model, at: string, sides: Sides): string[] {
  if (into.kind === 'unknown' || from.kind === 'cycle' || into.kind === 'cycle') return [];
  if (canonical(from) === canonical(into)) return [];
  if (from.kind === 'union') {
    return from.members.flatMap((member) => outsideOf(member, into, at, sides));
  }
  if (into.kind === 'union') {
    const tag = tagOf(from);
    const tagged = tag === undefined ? [] : into.members.filter((member) => tagOf(member) === tag);
    if (
      tag !== undefined &&
      tagged.length === 0 &&
      into.members.some((member) => tagOf(member) !== undefined)
    ) {
      return [`${at}: type ${JSON.stringify(tag)} is in ${sides.from}, not in ${sides.into}`];
    }
    // An object is a value of an object member only; `null` beside it explains nothing.
    const takesObjects = into.members.filter((member) =>
      ['object', 'unknown', 'cycle'].includes(member.kind),
    );
    const fitting = from.kind === 'object' && takesObjects.length > 0 ? takesObjects : into.members;
    const candidates = tagged.length > 0 ? tagged : fitting;
    const attempts = candidates.map((member) =>
      outsideOf(from, member, tag === undefined ? at : `${at}<${tag}>`, sides),
    );
    const best = attempts.sort((x, y) => x.length - y.length)[0]!;
    if (best.length === 0) return [];
    // The members may differ by a second fixed property, as `family` beside `type`:
    // a value of `from` then belongs to the member that fixes the value it carries.
    for (const [name, pieces] of splitBy(from, candidates)) {
      return pieces.flatMap((piece) => outsideOf(piece, into, `${at}<${name}>`, sides));
    }
    // Against several untagged members no single member's reasons explain the miss.
    return candidates.length === 1 ? best : [`${at}: ${show(from)} of ${sides.from} is not in ${sides.into}`];
  }
  if (from.kind === 'literal') {
    if (into.kind === typeof from.value) return [];
    return [`${at}: ${JSON.stringify(from.value)} of ${sides.from} is not in ${sides.into} (${show(into)})`];
  }
  if (from.kind === 'array' && into.kind === 'array') {
    return outsideOf(from.items, into.items, `${at}[]`, sides);
  }
  if (from.kind === 'object' && into.kind === 'object') {
    const out: string[] = [];
    for (const [name, property] of Object.entries(from.properties)) {
      const other = into.properties[name];
      if (other) {
        if (property.optional && !other.optional) {
          out.push(`${at}.${name}: may be absent in ${sides.from}, required in ${sides.into}`);
        }
        out.push(...outsideOf(property.model, other.model, `${at}.${name}`, sides));
      } else if (into.additional) {
        out.push(...outsideOf(property.model, into.additional, `${at}.${name}`, sides));
      } else {
        out.push(`${at}.${name}: in ${sides.from}, not in ${sides.into}`);
      }
    }
    for (const [name, property] of Object.entries(into.properties)) {
      if (!property.optional && !from.properties[name]) {
        out.push(`${at}.${name}: required in ${sides.into}, not in ${sides.from}`);
      }
    }
    if (from.additional) {
      if (!into.additional) out.push(`${at}: ${sides.from} takes other keys, ${sides.into} does not`);
      else out.push(...outsideOf(from.additional, into.additional, `${at}[key]`, sides));
    }
    return out;
  }
  return [`${at}: ${show(from)} of ${sides.from} is not in ${sides.into} (${show(into)})`];
}

/**
 * `from` written as one object per literal of a property that every candidate
 * fixes to a single literal, for each such property that `from` leaves open.
 */
function splitBy(from: Model, candidates: Model[]): Array<[string, Model[]]> {
  if (from.kind !== 'object') return [];
  const out: Array<[string, Model[]]> = [];
  for (const [name, property] of Object.entries(from.properties)) {
    const open = property.model;
    if (open.kind !== 'union' || !open.members.every((one) => one.kind === 'literal')) continue;
    const fixed = candidates.every(
      (candidate) => candidate.kind === 'object' && candidate.properties[name]?.model.kind === 'literal',
    );
    if (!fixed) continue;
    out.push([
      name,
      open.members.map((one) => ({
        ...from,
        properties: { ...from.properties, [name]: { model: one, optional: property.optional } },
      })),
    ]);
  }
  return out;
}

const SDK_INTO_COPY: Sides = { from: 'the SDK type', into: 'the copy' };
const COPY_INTO_SDK: Sides = { from: 'the copy', into: 'the SDK type' };

/** Why the SDK type and the copy's schema do not allow the same values. */
export function unequal(sdk: Model, copy: Model, at: string): string[] {
  return [...outside(sdk, copy, at, SDK_INTO_COPY), ...outside(copy, sdk, at, COPY_INTO_SDK)];
}

/** Why the SDK type allows a value the copy's schema refuses. */
export function sdkBeyondCopy(sdk: Model, copy: Model, at: string): string[] {
  return outside(sdk, copy, at, SDK_INTO_COPY);
}

/** Why the copy's schema allows a value the SDK type does not hold. */
export function copyBeyondSDK(sdk: Model, copy: Model, at: string): string[] {
  return outside(copy, sdk, at, COPY_INTO_SDK);
}

/**
 * The property names the copy's schema takes that the SDK type offers nowhere,
 * as paths. A name counts as offered when any member of the SDK type has it.
 */
export function namesNotOffered(sdk: Model, copy: Model, at: string): string[] {
  const out: string[] = [];
  const offered = members(sdk);
  for (const member of members(copy)) {
    if (member.kind === 'array') {
      const items = offered.flatMap((one) => (one.kind === 'array' ? [one.items] : []));
      if (items.length > 0) out.push(...namesNotOffered(union(items), member.items, `${at}[]`));
    } else if (member.kind === 'object') {
      for (const [name, property] of Object.entries(member.properties)) {
        const found = offered.flatMap((one) =>
          one.kind === 'object' && one.properties[name] ? [one.properties[name]!.model] : [],
        );
        if (found.length === 0) out.push(`${at}.${name}`);
        else out.push(...namesNotOffered(union(found), property.model, `${at}.${name}`));
      }
    }
  }
  return [...new Set(out)];
}

/** The model at a path of property names; `[]` steps into the items of an array. */
export function at(model: Model, ...steps: string[]): Model {
  let here = model;
  for (const step of steps) {
    const next: Model[] = [];
    for (const member of members(here)) {
      if (step === '[]' && member.kind === 'array') next.push(member.items);
      else if (member.kind === 'object' && member.properties[step]) next.push(member.properties[step]!.model);
    }
    if (next.length === 0) throw new Error(`no ${step} in ${show(here)}`);
    here = union(next);
  }
  return here;
}

/** An object model, or each object of a union, cut down to the named properties. */
export function pick(model: Model, names: string[]): Model {
  if (model.kind === 'union') return union(model.members.map((member) => pick(member, names)));
  if (model.kind !== 'object') throw new Error(`not an object: ${show(model)}`);
  const properties: Record<string, Property> = {};
  for (const name of names) {
    const property = model.properties[name];
    if (property) properties[name] = property;
  }
  return { kind: 'object', properties, additional: null };
}

/** A model with each of its objects changed: the model itself, or each member of a union. */
function eachObject(
  model: Model,
  change: (properties: Record<string, Property>) => Record<string, Property>,
): Model {
  if (model.kind === 'union') return union(model.members.map((member) => eachObject(member, change)));
  if (model.kind !== 'object') throw new Error(`not an object: ${show(model)}`);
  return { ...model, properties: change(model.properties) };
}

/** An object model, or each object of a union, without the named properties. */
export function omit(model: Model, names: string[]): Model {
  return eachObject(model, (properties) =>
    Object.fromEntries(Object.entries(properties).filter(([name]) => !names.includes(name))),
  );
}

/** The same objects with each property changed. */
export function mapProperties(model: Model, change: (name: string, property: Property) => Property): Model {
  return eachObject(model, (properties) =>
    Object.fromEntries(Object.entries(properties).map(([name, property]) => [name, change(name, property)])),
  );
}

/** A property that may be `null` read as one that may be absent, as a query string writes it. */
export function nullAsAbsent(model: Model): Model {
  return mapProperties(model, (_name, property) => {
    const kept = members(property.model).filter((member) => member.kind !== 'null');
    if (kept.length === members(property.model).length) return property;
    return { model: union(kept), optional: true };
  });
}

/** The literal values of a model that is a literal or a union holding literals. */
export function literals(model: Model): Array<string | number | boolean> {
  return members(model).flatMap((member) => (member.kind === 'literal' ? [member.value] : []));
}

/** The `type` literals of a union's members. */
export function typeTags(model: Model): string[] {
  return members(expand(model)).flatMap((member) => tagOf(member) ?? []);
}

/** The members of a union whose `type` literal is `tag`, as one model. */
export function memberByType(model: Model, tag: string): Model | undefined {
  const found = members(expand(model)).filter((member) => tagOf(member) === tag);
  return found.length === 0 ? undefined : union(found);
}
