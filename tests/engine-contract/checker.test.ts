/**
 * The contract checker itself: each kind of departure from the copy is found,
 * and a conforming exchange is not. Layer 1. If the checker stopped finding
 * one of these, every contract test that relies on it would pass in silence.
 */
import { checkAnswer, checkEvents, checkRequest, type CheckedRequest } from './checker';
import { findOperation } from './spec';

const BASE = 'https://api.tetral.example';

function request(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  const checked: CheckedRequest = {
    method,
    url: BASE + path,
    headers: new Headers(headers),
    body: body === undefined ? undefined : JSON.stringify(body),
  };
  return checkRequest(checked).violations;
}

function answer(
  method: string,
  path: string,
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
) {
  return checkAnswer(findOperation(method, path), `${method} ${path}`, {
    status,
    headers: new Headers({ 'content-type': 'application/json', ...headers }),
    text: body === undefined ? undefined : JSON.stringify(body),
  });
}

const drive = {
  id: 'drive_1',
  skills_path: 'skills/',
  memory: { path: 'memory/', instructions: 'Keep notes short.' },
  limits: { max_bytes: 1_000_000_000, max_files: null },
  usage: { bytes: 2048, files: 3 },
  stored_bytes: null,
  metadata: { team: 'ai' },
  created_at: '2026-10-01T00:00:00Z',
};
const error = { type: 'error', error: { type: 'not_found_error', message: 'no drive' }, request_id: 'req_1' };
const edgeError = (type: string, id = 'req_edge') => ({
  type: 'error',
  error: { type, message: 'x' },
  request_id: id,
});

describe('requests', () => {
  test.each([
    ['a conforming request', request('GET', '/v1/drives/drive_1/changes?limit=5'), []],
    [
      'an undeclared path',
      request('GET', '/v1/deployments'),
      ['GET /v1/deployments: the copy declares no such operation'],
    ],
    [
      'an undeclared query name on a closed query',
      request('GET', '/v1/drives?order=desc'),
      ['GET /v1/drives request query: undeclared parameter "order"'],
    ],
    [
      'a query value of the wrong type',
      request('GET', '/v1/drives/drive_1/changes?limit=many'),
      ['GET /v1/drives/{drive_id}/changes request query limit/: must be integer'],
    ],
    [
      'a query parameter that takes one value, sent twice',
      request('GET', '/v1/drives/drive_1/changes?limit=5&limit=6'),
      ['GET /v1/drives/{drive_id}/changes request query limit: sent 2 times'],
    ],
    [
      'a missing required query parameter',
      request('GET', '/v1/sessions'),
      ['GET /v1/sessions request query: missing required beta'],
    ],
    [
      'a missing required header',
      request('POST', '/v1/sessions/sesn_1/computers?beta=true', { environment_id: 'env_1' }),
      ['POST /v1/sessions/{session_id}/computers request header: missing required Idempotency-Key'],
    ],
    [
      'an undeclared body field',
      request('POST', '/v1/sessions/sesn_1?beta=true', { providers: {} }),
      ['POST /v1/sessions/{session_id} request body/: undeclared field "providers"'],
    ],
    [
      'a body field of the wrong type',
      request('POST', '/v1/sessions/sesn_1?beta=true', { title: 7 }),
      ['POST /v1/sessions/{session_id} request body/title: must be string,null'],
    ],
    [
      'a missing required body field',
      request('POST', '/v1/sessions/sesn_1/drives?beta=true', { drive_id: 'drive_1' }),
      ['POST /v1/sessions/{session_id}/drives request body/: missing required field "access"'],
    ],
    [
      'a body that is not JSON, with the reason the parser gives',
      checkRequest({
        method: 'POST',
        url: `${BASE}/v1/sessions/sesn_1?beta=true`,
        headers: new Headers(),
        body: '{"title":',
      }).violations,
      [expect.stringMatching(/^POST \/v1\/sessions\/\{session_id\} request body: not JSON \(.+\)$/)],
    ],
    [
      'a body on an operation that takes none',
      request('POST', '/v1/sessions/sesn_1/archive?beta=true', {}),
      ['POST /v1/sessions/{session_id}/archive request body: the operation takes none'],
    ],
    // A metadata value is a string, and on an update also null; free JSON stays free.
    [
      'a metadata key with a string value',
      request('POST', '/v1/sessions/sesn_1?beta=true', { metadata: { k: 'v' } }),
      [],
    ],
    [
      'a null metadata value on an update',
      request('POST', '/v1/sessions/sesn_1?beta=true', { metadata: { k: null } }),
      [],
    ],
    [
      'a path parameter against its schema',
      request('GET', '/v1/files/doc_1?beta=true'),
      ['GET /v1/files/{file_id} request path file_id/: must match pattern "^file_"'],
    ],
    [
      'a path parameter that is not UTF-8 once decoded',
      request('GET', '/v1/files/file_%C3?beta=true'),
      [
        expect.stringMatching(
          /^GET \/v1\/files\/\{file_id\} request path file_id: not UTF-8 once decoded \(.+\)$/,
        ),
      ],
    ],
    [
      'a path with an invalid percent-encoding, which the edge refuses',
      request('GET', '/v1/files/file_%zz?beta=true'),
      [
        'GET /v1/files/file_%zz: the edge refuses the path, which has an invalid percent-encoding (x-path-handling)',
      ],
    ],
    [
      'a model ID with its slash escaped, which the edge refuses',
      request('GET', '/v1/models/openai%2fgpt-5.5?beta=true'),
      [
        'GET /v1/models/openai%2fgpt-5.5: the edge refuses the path, which has an escaped slash or backslash (x-path-handling)',
      ],
    ],
    [
      'a model ID with its slash written as a path separator',
      request('GET', '/v1/models/openai/gpt-5.5?beta=true'),
      [],
    ],
    [
      'a path as the edge routes it: an escaped unreserved character decoded, repeated slashes merged',
      request('GET', '/v1//%66iles/file_1?beta=true'),
      [],
    ],
    [
      'a header value against its schema',
      request(
        'POST',
        '/v1/sessions/sesn_1/computers?beta=true',
        { environment_id: 'env_1' },
        {
          'Idempotency-Key': 'k'.repeat(256),
        },
      ),
      [
        'POST /v1/sessions/{session_id}/computers request header Idempotency-Key/: must NOT have more than 255 characters',
      ],
    ],
    [
      'a number as a metadata value',
      request('POST', '/v1/sessions/sesn_1?beta=true', { metadata: { k: 1 } }),
      ['POST /v1/sessions/{session_id} request body/metadata/k: must be string,null'],
    ],
  ])('%s', (_name, found, expected) => {
    expect(found).toEqual(expected);
  });
});

test('a multipart part sent twice is checked as a list, not as its last value', () => {
  const form = new FormData();
  form.append('path', 'notes/a.md');
  form.append('path', 'notes/b.md');
  form.append('file', new Blob(['a']), 'a.md');
  const found = checkRequest({
    method: 'POST',
    url: `${BASE}/v1/drives/drive_1/files`,
    headers: new Headers(),
    body: form,
  }).violations;
  expect(found).toEqual(['POST /v1/drives/{drive_id}/files request body/path: must be string']);
});

describe('answers', () => {
  test.each([
    ['a conforming answer', answer('GET', '/v1/drives/drive_1', 200, drive), []],
    [
      'an undeclared status',
      answer('GET', '/v1/drives/drive_1', 418, error),
      ['GET /v1/drives/{drive_id} answer: 418 is not a declared status'],
    ],
    [
      'an undeclared field',
      answer('GET', '/v1/drives/drive_1', 200, { ...drive, owner: 'me' }),
      ['GET /v1/drives/{drive_id} answer 200 body/: undeclared field "owner"'],
    ],
    [
      'a missing required field',
      answer('GET', '/v1/drives/drive_1', 200, { ...drive, usage: undefined }),
      ['GET /v1/drives/{drive_id} answer 200 body/: missing required field "usage"'],
    ],
    [
      'a field of the wrong type',
      answer('GET', '/v1/drives/drive_1', 200, { ...drive, skills_path: 7 }),
      ['GET /v1/drives/{drive_id} answer 200 body/skills_path: must be string'],
    ],
    [
      'an error type the status does not list',
      answer('GET', '/v1/drives/drive_1', 404, { ...error, error: { type: 'conflict_error', message: 'x' } }),
      [
        'GET /v1/drives/{drive_id} answer 404 body/error/type: "conflict_error" is not one of ["not_found_error"]',
      ],
    ],
    [
      'a contract header on an answer that does not declare it',
      answer('GET', '/v1/drives/drive_1', 404, error, { 'x-should-retry': 'false' }),
      ['GET /v1/drives/{drive_id} answer 404 header: x-should-retry is not declared for this answer'],
    ],
    [
      'the same header where it is declared',
      answer(
        'DELETE',
        '/v1/drives/drive_1/files',
        409,
        { ...error, error: { type: 'invalid_request_error', message: 'x' } },
        { 'x-should-retry': 'false' },
      ),
      [],
    ],
    [
      'a body on an answer that declares none',
      answer('DELETE', '/v1/drives/drive_1', 204, {}),
      ['DELETE /v1/drives/{drive_id} answer 204 body: the answer declares none'],
    ],
    [
      'a JSON answer under another content type',
      answer('GET', '/v1/drives/drive_1', 200, drive, { 'content-type': 'text/plain' }),
      ['GET /v1/drives/{drive_id} answer 200 content type: "text/plain", declared application/json'],
    ],
    [
      'a stream answered without its content type',
      answer('GET', '/v1/drives/drive_1/changes/stream', 200, undefined, { 'content-type': '' }),
      ['GET /v1/drives/{drive_id}/changes/stream answer 200 content type: "", declared text/event-stream'],
    ],
    [
      'an error envelope on a path the copy lists as unsupported',
      answer('GET', '/v1/deployments', 400, {
        ...error,
        error: { type: 'invalid_request_error', message: 'x' },
      }),
      [],
    ],
    [
      'an unsupported path answered as not found',
      answer('GET', '/v1/deployments', 404, error),
      ['GET /v1/deployments answer: 404, and the copy states 400 for this path'],
    ],
    [
      'a path the copy does not know, answered as a bad request',
      answer('GET', '/v1/nothing', 400, { ...error, error: { type: 'invalid_request_error', message: 'x' } }),
      ['GET /v1/nothing answer: 400, and the copy states 404 for this path'],
    ],
    [
      'an unsupported path refused under an error type the copy does not state for it',
      answer('GET', '/v1/deployments', 400, error),
      ['GET /v1/deployments answer 400 body/error/type: "not_found_error" is not invalid_request_error'],
    ],
    [
      'a declared path under a method it does not have, answered as not found',
      answer('PATCH', '/v1/drives/drive_1', 404, error),
      ['PATCH /v1/drives/drive_1 answer: 404, and the copy states 405 for this path'],
    ],
    [
      'any undeclared path without valid credentials',
      answer('GET', '/v1/nothing', 401, { ...error, error: { type: 'authentication_error', message: 'x' } }),
      [],
    ],
    [
      'any undeclared path without valid credentials, under another error type',
      answer('GET', '/v1/nothing', 401, error),
      ['GET /v1/nothing answer 401 body/error/type: "not_found_error" is not authentication_error'],
    ],
    [
      'a file of JSON where the answer declares */*',
      answer('GET', '/v1/files/file_1/content', 200, { any: 'json' }),
      [],
    ],
    [
      'bytes of any type where the answer declares */*',
      answer('GET', '/v1/files/file_1/content', 200, undefined, { 'content-type': 'application/pdf' }),
      [],
    ],
    [
      'an answer body that is not JSON, with the reason the parser gives',
      checkAnswer(findOperation('GET', '/v1/drives/drive_1'), 'GET /v1/drives/drive_1', {
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: '{"id":',
      }),
      [expect.stringMatching(/^GET \/v1\/drives\/\{drive_id\} answer 200 body: not JSON \(.+\)$/)],
    ],
    [
      'an answer on an undeclared path that is not JSON',
      checkAnswer(undefined, 'GET /v1/deployments', {
        status: 400,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: 'no such path',
      }),
      [expect.stringMatching(/^GET \/v1\/deployments answer 400 body: not JSON \(.+\)$/)],
    ],
    [
      'a success on an undeclared path',
      answer('GET', '/v1/deployments', 200, {}),
      [
        'GET /v1/deployments answer: 200 is not an answer of an undeclared path',
        'GET /v1/deployments answer 200 body/: missing required field "type"',
        'GET /v1/deployments answer 200 body/: missing required field "error"',
        'GET /v1/deployments answer 200 body/: missing required field "request_id"',
      ],
    ],
    [
      "the edge's own 503, on an operation that declares none",
      answer('GET', '/v1/drives/drive_1', 503, edgeError('api_error'), { 'request-id': 'req_edge' }),
      [],
    ],
    [
      "the edge's own 503, on an operation that declares a 503 of its own",
      answer('GET', '/v1/instance_requests', 503, edgeError('api_error'), { 'request-id': 'req_edge' }),
      [],
    ],
    [
      "the edge's own 503, on a path the copy does not know",
      answer('GET', '/v1/nothing', 503, edgeError('api_error'), { 'request-id': 'req_edge' }),
      [],
    ],
    [
      "the edge's own 400, to a path it refuses",
      checkAnswer(undefined, 'GET /v1/models/openai%2Fgpt-5.5', {
        status: 400,
        headers: new Headers({ 'content-type': 'application/json', 'request-id': 'edge-1' }),
        text: JSON.stringify(edgeError('invalid_request_error', 'edge-1')),
      }),
      [],
    ],
    [
      'a path the edge refuses, answered other than with 400',
      checkAnswer(undefined, 'GET /v1/models/openai%2Fgpt-5.5', {
        status: 404,
        headers: new Headers({ 'content-type': 'application/json', 'request-id': 'edge-1' }),
        text: JSON.stringify({ ...edgeError('not_found_error', 'edge-1') }),
      }),
      ['GET /v1/models/openai%2Fgpt-5.5 answer: 404, and the edge answers a path it refuses with 400'],
    ],
    [
      'a 503 in JSON on an operation that declares one',
      answer('GET', '/v1/instance_requests', 503, {
        ...error,
        error: { type: 'api_error', message: 'x' },
      }),
      [],
    ],
    [
      "an edge's 503 without a request-id header",
      answer('GET', '/v1/drives/drive_1', 503, edgeError('api_error')),
      [
        'GET /v1/drives/{drive_id} answer 503 header request-id: null, and the body\'s request_id is "req_edge"',
      ],
    ],
    [
      "an edge's 503 whose request-id header is not its request_id",
      answer('GET', '/v1/drives/drive_1', 503, edgeError('api_error'), { 'request-id': 'req_other' }),
      [
        'GET /v1/drives/{drive_id} answer 503 header request-id: "req_other", and the body\'s request_id is "req_edge"',
      ],
    ],
    [
      "an edge's 503 of another error type",
      answer('GET', '/v1/drives/drive_1', 503, edgeError('invalid_request_error'), {
        'request-id': 'req_edge',
      }),
      ['GET /v1/drives/{drive_id} answer 503 body/error/type: "invalid_request_error" is not api_error'],
    ],
    [
      "an edge's 503 with another response header of its operation",
      answer('POST', '/v1/drives/drive_1/files', 503, edgeError('api_error'), {
        'request-id': 'req_edge',
        'retry-after': '1',
      }),
      ["POST /v1/drives/{drive_id}/files answer 503 header: Retry-After is not part of the edge's answer"],
    ],
    [
      "an edge's 503 with a header its operation does not declare",
      answer('GET', '/v1/drives/drive_1', 503, edgeError('api_error'), {
        'request-id': 'req_edge',
        'retry-after': '1',
      }),
      [],
    ],
    [
      'an error answer whose request-id header is not its request_id',
      answer('GET', '/v1/drives/drive_1', 404, error, { 'request-id': 'req_other' }),
      [
        'GET /v1/drives/{drive_id} answer 404 header request-id: "req_other", and the body\'s request_id is "req_1"',
      ],
    ],
    ['an error answer without a request-id header', answer('GET', '/v1/drives/drive_1', 404, error), []],
    [
      'an error answer on an undeclared path whose request-id header is not its request_id',
      answer('GET', '/v1/nothing', 404, error, { 'request-id': 'req_other' }),
      ['GET /v1/nothing answer 404 header request-id: "req_other", and the body\'s request_id is "req_1"'],
    ],
    [
      'a 503 of an operation that declares one, whose request-id header is not its request_id',
      answer('GET', '/v1/instance_requests', 503, edgeError('api_error'), { 'request-id': 'req_other' }),
      [
        'GET /v1/instance_requests answer 503 header request-id: "req_other", and the body\'s request_id is "req_edge"',
      ],
    ],
    [
      "an edge's 503 in plain text, which is no ErrorResponse",
      checkAnswer(findOperation('GET', '/v1/drives/drive_1'), 'GET /v1/drives/drive_1', {
        status: 503,
        headers: new Headers({ 'content-type': 'text/plain' }),
        text: 'no healthy upstream',
      }),
      [expect.stringMatching(/^GET \/v1\/drives\/\{drive_id\} answer 503 body: not JSON \(.+\)$/)],
    ],
  ])('%s', (_name, found, expected) => {
    expect(found).toEqual(expected);
  });
});

describe('stream events', () => {
  const frame = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

  test.each([
    ['a declared event', frame('drive.changed', { drive_id: 'drive_1', seq: 1 }), []],
    ['a comment line, which carries no event', ': heartbeat\n\n', []],
    [
      'an undeclared event',
      frame('drive.deleted', { drive_id: 'drive_1' }),
      ['GET /v1/drives/{drive_id}/changes/stream answer 200 stream: undeclared event "drive.deleted"'],
    ],
    [
      'event data that is not JSON',
      'event: drive.changed\ndata: {"drive_id":\n\n',
      [
        expect.stringMatching(
          /^GET \/v1\/drives\/\{drive_id\}\/changes\/stream answer 200 stream event drive.changed data: not JSON \(.+\)$/,
        ),
      ],
    ],
    [
      'an undeclared field in an event',
      frame('drive.changed', { drive_id: 'drive_1', seq: 1, path: 'a' }),
      [
        'GET /v1/drives/{drive_id}/changes/stream answer 200 stream event drive.changed/: undeclared field "path"',
      ],
    ],
    [
      'an id line, which no frame of the copy has',
      'id: 7\n' + frame('drive.changed', { drive_id: 'drive_1', seq: 1 }),
      [
        'GET /v1/drives/{drive_id}/changes/stream answer 200 stream: a line of field "id", which no frame of the copy has',
      ],
    ],
    [
      'an id line on a Thread stream, whose description says it sends none',
      'id: 7\n\n',
      [
        'GET /v1/sessions/{session_id}/threads/{thread_id}/stream answer 200 stream: a line of field "id", which no frame of the copy has',
      ],
      '/v1/sessions/sesn_1/threads/sthr_1/stream',
    ],
  ])('%s', (_name, text, expected, path = '/v1/drives/drive_1/changes/stream') => {
    expect(checkEvents(findOperation('GET', path)!, 200, text)).toEqual(expected);
  });

  test('a union member is reported by the member its type names', () => {
    const events = findOperation('GET', '/v1/sessions/sesn_1/events/stream')!;
    const text = frame('session.error', {
      type: 'session.error',
      id: 'evt_1',
      processed_at: '2026-11-01T00:00:00Z',
      error: {
        type: 'drive_mount_error',
        message: 'm',
        retry_status: { type: 'retrying' },
        computer_id: 'c',
      },
    });
    expect(checkEvents(events, 200, text)).toEqual([
      'GET /v1/sessions/{session_id}/events/stream answer 200 stream event session.error/error: missing required field "drive_id"',
    ]);
  });
});
