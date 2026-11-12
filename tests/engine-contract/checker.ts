/**
 * Checks one HTTP exchange against the SDK's copy of Engine's OpenAPI file.
 *
 * `checkRequest` holds what a test sends: the operation exists, its query
 * names and values, its required headers and its body are as the copy states.
 * `checkAnswer` holds what a test is given: a declared status, a body of the
 * declared schema, an error type the status lists, and for a stream every
 * event name and its data. Both return the violations they found, each a
 * sentence naming the operation and the place.
 */
import Ajv2020, { type ErrorObject, type ValidateFunction } from 'ajv/dist/2020';

import {
  engineAPI,
  findOperation,
  isDeclaredPath,
  isUnsupportedPath,
  resolvePointer,
  type JSONSchema,
  type MatchedOperation,
  type OpenAPIParameter,
} from './spec';

const DOCUMENT_ID = 'engine-v1';

// Formats annotate; unknown keywords (`x-*`, `discriminator`) are the file's own.
const options = { strict: false, validateFormats: false, validateSchema: false, allErrors: true } as const;
const ajv = new Ajv2020(options);
ajv.addSchema(engineAPI, DOCUMENT_ID);
// Query values arrive as text; a declared integer or boolean is read from it.
const queryAjv = new Ajv2020({ ...options, coerceTypes: true });
queryAjv.addSchema(engineAPI, DOCUMENT_ID);

const compiled = new Map<string, ValidateFunction>();

function validator(instance: Ajv2020, pointer: string): ValidateFunction {
  const key = `${instance === ajv ? 'body' : 'query'} ${pointer}`;
  let validate = compiled.get(key);
  if (!validate) {
    resolvePointer(engineAPI, pointer);
    validate = instance.compile({ $ref: `${DOCUMENT_ID}${pointer}` });
    compiled.set(key, validate);
  }
  return validate;
}

function pointerToken(token: string): string {
  return token.replace(/~/g, '~0').replace(/\//g, '~1');
}

function operationPointer(matched: MatchedOperation): string {
  return `#/paths/${pointerToken(matched.template)}/${matched.method.toLowerCase()}`;
}

function messageOf(error: ErrorObject, at: string): string {
  if (error.keyword === 'additionalProperties') {
    return `${at}: undeclared field ${JSON.stringify(error.params['additionalProperty'])}`;
  }
  if (error.keyword === 'required') {
    return `${at}: missing required field ${JSON.stringify(error.params['missingProperty'])}`;
  }
  const allowed = error.params['allowedValues'];
  return `${at}: ${error.message ?? error.keyword}${allowed ? ` ${JSON.stringify(allowed)}` : ''}`;
}

/** The schema a pointer leads to, through `$ref` and a one-member `allOf`. */
function follow(pointer: string): { pointer: string; schema: JSONSchema } {
  let at = pointer;
  for (;;) {
    const schema = resolvePointer(engineAPI, at) as JSONSchema;
    if (typeof schema['$ref'] === 'string') at = schema['$ref'];
    else if (Array.isArray(schema['allOf']) && schema['allOf'].length === 1) at = `${at}/allOf/0`;
    else return { pointer: at, schema };
  }
}

function acceptsTag(pointer: string, tag: string): boolean {
  const declared = (follow(pointer).schema['properties'] as Record<string, JSONSchema> | undefined)?.['type'];
  if (!declared) return false;
  if ('const' in declared) return declared['const'] === tag;
  return Array.isArray(declared['enum']) && declared['enum'].includes(tag);
}

/**
 * What is wrong with `value` under the schema at `pointer`, as `<place>: <problem>`
 * lines. A validator reports a union as one failure per member; this walks down
 * to the member the value's `type` names and to the field that is wrong, so a
 * line names one place.
 */
function validate(instance: Ajv2020, pointer: string, value: unknown, at = ''): string[] {
  const check = validator(instance, pointer);
  // Called as a plain predicate: its type guard would narrow `value` away.
  const valid: boolean = check(value);
  if (valid) return [];
  const errors = check.errors ?? [];
  const { pointer: resolved, schema } = follow(pointer);
  const isObject = value !== null && typeof value === 'object' && !Array.isArray(value);

  for (const key of ['oneOf', 'anyOf']) {
    const members = schema[key] as JSONSchema[] | undefined;
    const tag = isObject ? (value as Record<string, unknown>)['type'] : undefined;
    if (!members || typeof tag !== 'string') continue;
    const chosen = members
      .map((_, index) => `${resolved}/${key}/${index}`)
      .filter((member) => acceptsTag(member, tag));
    if (chosen.length === 1) return validate(instance, chosen[0]!, value, at);
    if (chosen.length === 0)
      return [`${at || '/'}: type ${JSON.stringify(tag)} is not a member of the union`];
  }

  const found: string[] = [];
  const properties = schema['properties'] as Record<string, JSONSchema> | undefined;
  if (isObject && properties) {
    for (const [name, child] of Object.entries(value as Record<string, unknown>)) {
      if (!(name in properties)) continue;
      found.push(
        ...validate(instance, `${resolved}/properties/${pointerToken(name)}`, child, `${at}/${name}`),
      );
    }
  }
  if (Array.isArray(value) && schema['items']) {
    value.forEach((item, index) =>
      found.push(...validate(instance, `${resolved}/items`, item, `${at}/${index}`)),
    );
  }
  const own = errors.filter(
    (error) => error.instancePath === '' && !['oneOf', 'anyOf'].includes(error.keyword),
  );
  found.push(...own.map((error) => messageOf(error, at || '/')));
  // A failure this walk does not reach (a rule on the whole array, say) is still reported.
  if (found.length === 0)
    found.push(...errors.map((error) => messageOf(error, `${at}${error.instancePath}` || '/')));
  return [...new Set(found)];
}

export interface CheckedRequest {
  method: string;
  url: string;
  headers: Headers;
  body: unknown;
}

export interface RequestCheck {
  operation: MatchedOperation | undefined;
  violations: string[];
}

function parametersOf(matched: MatchedOperation, where: OpenAPIParameter['in']): OpenAPIParameter[] {
  return (matched.operation.parameters ?? []).filter((parameter) => parameter.in === where);
}

function isArraySchema(schema: JSONSchema | undefined): boolean {
  return schema?.['type'] === 'array';
}

/**
 * A multipart body as the object its schema describes: a text part is its
 * text, a file part is a string standing for its bytes.
 */
function formObject(form: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [name, value] of form.entries()) {
    const part = typeof value === 'string' ? value : '<binary>';
    if (name in out) out[name] = ([] as unknown[]).concat(out[name], part);
    else out[name] = part;
  }
  return out;
}

export function checkRequest(request: CheckedRequest): RequestCheck {
  const url = new URL(request.url);
  const matched = findOperation(request.method, url.pathname);
  const label = `${request.method.toUpperCase()} ${url.pathname}`;
  if (!matched) {
    return { operation: undefined, violations: [`${label}: the copy declares no such operation`] };
  }
  const violations: string[] = [];
  const add = (message: string) => violations.push(`${matched.name} request ${message}`);

  const query = parametersOf(matched, 'query');
  const byName = new Map(query.map((parameter) => [parameter.name, parameter]));
  const sent = new Map<string, string[]>();
  for (const [name, value] of url.searchParams.entries()) {
    sent.set(name, [...(sent.get(name) ?? []), value]);
  }
  for (const [name, values] of sent) {
    const parameter = byName.get(name);
    if (!parameter) {
      if (matched.operation['x-closed-query']) add(`query: undeclared parameter ${JSON.stringify(name)}`);
      continue;
    }
    if (!parameter.schema) continue;
    if (!isArraySchema(parameter.schema) && values.length > 1) {
      add(`query ${name}: sent ${values.length} times`);
      continue;
    }
    const index = (matched.operation.parameters ?? []).indexOf(parameter);
    const value = isArraySchema(parameter.schema) ? [...values] : values[0];
    for (const problem of validate(
      queryAjv,
      `${operationPointer(matched)}/parameters/${index}/schema`,
      value,
    )) {
      add(`query ${name}${problem}`);
    }
  }
  for (const parameter of query) {
    if (parameter.required && !sent.has(parameter.name)) add(`query: missing required ${parameter.name}`);
  }
  for (const parameter of parametersOf(matched, 'header')) {
    if (parameter.required && !request.headers.has(parameter.name)) {
      add(`header: missing required ${parameter.name}`);
    }
  }

  const declared = matched.operation.requestBody;
  const body = request.body;
  if (!declared) {
    if (body !== undefined && body !== null) add('body: the operation takes none');
    return { operation: matched, violations };
  }
  if (body === undefined || body === null) {
    if (declared.required) add('body: missing');
    return { operation: matched, violations };
  }
  const mediaType = body instanceof FormData ? 'multipart/form-data' : 'application/json';
  if (!declared.content[mediaType]) {
    add(`body: ${mediaType} is not a declared content type`);
    return { operation: matched, violations };
  }
  let value: unknown;
  if (body instanceof FormData) value = formObject(body);
  else if (typeof body === 'string') {
    try {
      value = JSON.parse(body);
    } catch {
      add('body: not JSON');
      return { operation: matched, violations };
    }
  } else {
    add(`body: a ${Object.prototype.toString.call(body)} cannot be checked`);
    return { operation: matched, violations };
  }
  const pointer = `${operationPointer(matched)}/requestBody/content/${pointerToken(mediaType)}/schema`;
  for (const problem of validate(ajv, pointer, value)) add(`body${problem}`);
  return { operation: matched, violations };
}

export interface CheckedAnswer {
  status: number;
  headers: Headers;
  /** The whole JSON body as text. A stream's frames go to `checkEvents`; bytes are not read. */
  text: string | undefined;
}

// The headers the copy defines; an answer may carry one only where its response declares it.
const CONTRACT_HEADERS = Object.keys(
  (engineAPI.components as unknown as { headers: Record<string, unknown> }).headers,
);

/** The frames of a `text/event-stream` body, as the copy's `x-event-streams` states them. */
export function parseEventStream(text: string): Array<{ event: string | undefined; data: string }> {
  const frames: Array<{ event: string | undefined; data: string }> = [];
  for (const block of text.split(/\r?\n\r?\n/)) {
    let event: string | undefined;
    const data: string[] = [];
    for (const line of block.split(/\r?\n/)) {
      if (line === '' || line.startsWith(':')) continue;
      const colon = line.indexOf(':');
      const field = colon === -1 ? line : line.slice(0, colon);
      const value = colon === -1 ? '' : line.slice(colon + 1).replace(/^ /, '');
      if (field === 'event') event = value;
      else if (field === 'data') data.push(value);
    }
    if (event !== undefined || data.length > 0) frames.push({ event, data: data.join('\n') });
  }
  return frames;
}

export function checkAnswer(
  matched: MatchedOperation | undefined,
  label: string,
  answer: CheckedAnswer,
): string[] {
  const status = String(answer.status);
  const contentType = (answer.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase();
  // While a service behind Engine's edge cannot be reached, the edge answers for
  // any request: its answer is not JSON, is no error envelope, and carries none of
  // the headers the copy defines. A JSON answer of such a status is the operation's own.
  if (engineAPI['x-edge-answers'].statuses.includes(status) && contentType !== 'application/json') {
    const name = matched?.name ?? label;
    const violations = CONTRACT_HEADERS.filter((header) => answer.headers.has(header)).map(
      (header) => `${name} answer ${status} header: ${header} is not part of the edge's answer`,
    );
    if (validate(ajv, '#/components/schemas/ErrorResponse', parseJSON(answer.text)).length === 0) {
      violations.push(`${name} answer ${status} body: an error envelope, which the edge does not send`);
    }
    return violations;
  }
  if (!matched) {
    // An undeclared path has one stated set of answers, each an error envelope:
    // 401 without valid credentials; otherwise 400 on a path the copy lists as
    // unsupported, 405 on a path declared with other methods, and 404 on any other.
    const violations: string[] = [];
    const pathname = label.slice(label.indexOf(' ') + 1);
    const refusal =
      isUnsupportedPath(pathname) ? '400'
      : isDeclaredPath(pathname) ? '405'
      : '404';
    if (!engineAPI['x-undeclared-paths'].statuses.includes(status)) {
      violations.push(`${label} answer: ${status} is not an answer of an undeclared path`);
    } else if (status !== '401' && status !== refusal) {
      violations.push(`${label} answer: ${status}, and the copy states ${refusal} for this path`);
    }
    // The copy names the error type of two of them.
    const stated = { '401': 'authentication_error', '400': 'invalid_request_error' }[status];
    const errorType = (parseJSON(answer.text) as { error?: { type?: unknown } } | undefined)?.error?.type;
    if (stated && typeof errorType === 'string' && errorType !== stated) {
      violations.push(
        `${label} answer ${status} body/error/type: ${JSON.stringify(errorType)} is not ${stated}`,
      );
    }
    for (const problem of validate(ajv, '#/components/schemas/ErrorResponse', parseJSON(answer.text))) {
      violations.push(`${label} answer ${status} body${problem}`);
    }
    return violations;
  }
  const violations: string[] = [];
  const add = (message: string) => violations.push(`${matched.name} answer ${status} ${message}`);
  const response = matched.operation.responses[status];
  if (!response) return [`${matched.name} answer: ${status} is not a declared status`];
  const declaredHeaders = Object.keys(response.headers ?? {}).map((name) => name.toLowerCase());
  for (const name of CONTRACT_HEADERS) {
    if (answer.headers.has(name) && !declaredHeaders.includes(name.toLowerCase())) {
      add(`header: ${name} is not declared for this answer`);
    }
  }
  const content = response.content ?? {};
  if (Object.keys(content).length === 0) {
    if (answer.text) add('body: the answer declares none');
    return violations;
  }
  // `*/*` declares bytes of any type, whatever type the bytes name.
  const declared =
    content[contentType] ? contentType
    : content['*/*'] ? '*/*'
    : undefined;
  if (declared === undefined) {
    add(`content type: ${JSON.stringify(contentType)}, declared ${Object.keys(content).join(' or ')}`);
    return violations;
  }
  if (declared === 'text/event-stream') {
    violations.push(...checkEvents(matched, answer.status, answer.text ?? ''));
    return violations;
  }
  if (declared === 'application/json') {
    const body = parseJSON(answer.text);
    const pointer = `${operationPointer(matched)}/responses/${status}/content/application~1json/schema`;
    for (const problem of validate(ajv, pointer, body)) add(`body${problem}`);
    const errorTypes = response['x-error-types'];
    const errorType = (body as { error?: { type?: unknown } } | undefined)?.error?.type;
    if (errorTypes && typeof errorType === 'string' && !errorTypes.includes(errorType)) {
      add(`body/error/type: ${JSON.stringify(errorType)} is not one of ${JSON.stringify(errorTypes)}`);
    }
    return violations;
  }
  // Bytes (a file's content, an archive) have no schema to check.
  return violations;
}

/** Every frame of `text`, a whole number of frames of a stream answer, against its `x-events`. */
export function checkEvents(matched: MatchedOperation, status: number, text: string): string[] {
  const violations: string[] = [];
  const add = (message: string) => violations.push(`${matched.name} answer ${status} ${message}`);
  const events = matched.operation.responses[String(status)]?.content?.['text/event-stream']?.['x-events'];
  if (!events) return [`${matched.name} answer ${status}: no event stream is declared`];
  const base = `${operationPointer(matched)}/responses/${status}/content/text~1event-stream/x-events`;
  for (const frame of parseEventStream(text)) {
    if (frame.event === undefined || !(frame.event in events)) {
      add(`stream: undeclared event ${JSON.stringify(frame.event)}`);
      continue;
    }
    for (const problem of validate(ajv, `${base}/${pointerToken(frame.event)}`, parseJSON(frame.data))) {
      add(`stream event ${frame.event}${problem}`);
    }
  }
  return violations;
}

function parseJSON(text: string | undefined): unknown {
  if (text === undefined || text === '') return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
