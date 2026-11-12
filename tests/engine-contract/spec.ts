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
          .map((part) => (part.startsWith('{') ? '[^/]+' : part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
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

export function allOperations(): MatchedOperation[] {
  return operations;
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
