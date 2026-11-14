/**
 * The SDK's copy of Engine's OpenAPI file, read once, with the lookups the
 * contract checks need: an operation by method and path, a schema by pointer.
 */
import fs from 'node:fs';
import path from 'node:path';

export type JSONSchema = Record<string, unknown>;

export interface OpenAPIResponse {
  description?: string;
  headers?: Record<string, unknown>;
  content?: Record<string, { schema?: JSONSchema; 'x-events'?: Record<string, JSONSchema> }>;
  'x-error-types'?: string[];
}

export interface OpenAPIParameter {
  name: string;
  in: 'path' | 'query' | 'header';
  required?: boolean;
  schema?: JSONSchema;
  /** A path parameter that takes everything after the template's literal part: one segment or more. */
  'x-rest-of-path'?: boolean;
}

export interface OpenAPIOperation {
  operationId: string;
  parameters?: OpenAPIParameter[];
  requestBody?: { required?: boolean; content: Record<string, { schema?: JSONSchema }> };
  responses: Record<string, OpenAPIResponse>;
  'x-closed-query'?: boolean;
}

export interface OpenAPIDocument {
  paths: Record<string, Record<string, OpenAPIOperation>>;
  components: { schemas: Record<string, JSONSchema> };
  'x-undeclared-paths': { statuses: string[]; unsupported: string[] };
  'x-edge-answers': { statuses: string[] };
}

export const copyPath = path.resolve(__dirname, '../../api/engine-v1.openapi.json');
export const sourcePath = path.resolve(__dirname, '../../api/engine-v1.source.json');

export const engineAPI = JSON.parse(fs.readFileSync(copyPath, 'utf8')) as OpenAPIDocument;

export function resolvePointer(document: object, pointer: string): unknown {
  if (!pointer.startsWith('#/')) throw new Error(`not a local pointer: ${pointer}`);
  let at: unknown = document;
  for (const raw of pointer.slice(2).split('/')) {
    const token = raw.replace(/~1/g, '/').replace(/~0/g, '~');
    if (at === null || typeof at !== 'object' || !(token in at)) {
      throw new Error(`pointer does not resolve: ${pointer}`);
    }
    at = (at as Record<string, unknown>)[token];
  }
  return at;
}

export function schema(name: string): JSONSchema {
  const found = engineAPI.components.schemas[name];
  if (!found) throw new Error(`the copy has no schema ${name}`);
  return found;
}

export interface MatchedOperation {
  /** `METHOD /path/{template}` as the copy declares it. */
  name: string;
  method: string;
  template: string;
  operation: OpenAPIOperation;
}

const METHODS = ['get', 'post', 'put', 'patch', 'delete'];

const operations: Array<MatchedOperation & { pattern: RegExp }> = [];
for (const [template, item] of Object.entries(engineAPI.paths)) {
  for (const method of METHODS) {
    const operation = item[method];
    if (!operation) continue;
    const pattern = new RegExp(
      '^' +
        template
          .split(/(\{[^}]+\})/)
          .map((part) =>
            !part.startsWith('{') ? part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
            : restOfPath(operation, part) ? '[^/]+(?:/[^/]+)*'
            : '[^/]+',
          )
          .join('') +
        '$',
    );
    operations.push({
      name: `${method.toUpperCase()} ${template}`,
      method: method.toUpperCase(),
      template,
      operation,
      pattern,
    });
  }
}

/** The path parameter a template part such as `{model_id}` names, when it is marked `x-rest-of-path`. */
export function restOfPath(operation: OpenAPIOperation, part: string): OpenAPIParameter | undefined {
  return operation.parameters?.find(
    (parameter) => parameter.in === 'path' && `{${parameter.name}}` === part && parameter['x-rest-of-path'],
  );
}

/**
 * Why the edge refuses a path before it is routed (`x-path-handling`): an
 * invalid percent-encoding, or an escaped slash or backslash.
 */
export function pathRefusal(pathname: string): string | undefined {
  if (/%(?![0-9A-Fa-f]{2})/.test(pathname)) return 'an invalid percent-encoding';
  if (/%(?:2F|5C)/i.test(pathname)) return 'an escaped slash or backslash';
  return undefined;
}

/**
 * The path Engine routes (`x-path-handling`): a percent-encoded unreserved
 * character decoded, dot segments removed, then repeated slashes merged.
 */
export function routedPath(pathname: string): string {
  const decoded = pathname.replace(/%([0-9A-Fa-f]{2})/g, (escape, hex: string) => {
    const character = String.fromCharCode(parseInt(hex, 16));
    return /[A-Za-z0-9\-._~]/.test(character) ? character : escape;
  });
  // Joined as text: as a relative reference, a path that starts with `//` would name a host.
  return new URL(`http://path.invalid${decoded}`).pathname.replace(/\/{2,}/g, '/');
}

export function allOperations(): MatchedOperation[] {
  return operations;
}

/** The streams of the copy that the SDK has no method for. */
export const STREAMS_WITHOUT_A_METHOD = ['GET /v1/instance_requests/stream', 'GET /v1/instances/stream'];

/** The event names of each operation the copy answers as a stream, by operation name. */
export function streamEvents(): Record<string, string[]> {
  return Object.fromEntries(
    operations.flatMap(({ name, operation }) => {
      const events = operation.responses['200']?.content?.['text/event-stream']?.['x-events'];
      return events ? [[name, Object.keys(events)]] : [];
    }),
  );
}

/**
 * The operation a request addresses. A literal path segment wins over a path
 * parameter, as `/v1/drives/usage` wins over `/v1/drives/{drive_id}`.
 */
export function findOperation(method: string, pathname: string): MatchedOperation | undefined {
  const matches = operations.filter(
    (candidate) => candidate.method === method.toUpperCase() && candidate.pattern.test(pathname),
  );
  matches.sort((a, b) => parameterCount(a.template) - parameterCount(b.template));
  return matches[0];
}

/** Whether a path is one Engine refuses as unsupported: a pattern of `x-undeclared-paths`, `*` for any text. */
export function isUnsupportedPath(pathname: string): boolean {
  return engineAPI['x-undeclared-paths'].unsupported.some((pattern) =>
    new RegExp(
      `^${pattern
        .split('*')
        .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
        .join('.*')}$`,
    ).test(pathname),
  );
}

/** Whether the copy declares the path with any method. */
export function isDeclaredPath(pathname: string): boolean {
  return operations.some((candidate) => candidate.pattern.test(pathname));
}

function parameterCount(template: string): number {
  return template.split('{').length - 1;
}
