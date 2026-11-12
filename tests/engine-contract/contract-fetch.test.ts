/**
 * The wiring of the contract fetch: what the checker finds on a request, an
 * answer or a stream frame reaches the failure a contract test ends with, and
 * a request marked as outside the copy is excused its one departure only.
 * Layer 1. If this wiring broke, every contract test would pass in silence.
 */
import { contractFetch, failOnViolations, type ContractFetchOptions } from './contract-fetch';

const BASE = 'https://api.tetral.example';
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
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const stream = (data: unknown) =>
  new Response(`event: drive.changed\ndata: ${JSON.stringify(data)}\n\n`, {
    headers: { 'content-type': 'text/event-stream' },
  });
const refusal = () =>
  json({ type: 'error', error: { type: 'invalid_request_error', message: 'x' }, request_id: 'req_1' }, 400);
const update = (body: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body) });

interface Row {
  name: string;
  path: string;
  init?: RequestInit;
  answer: () => Response;
  options?: ContractFetchOptions;
  /** Text of the failure, or none when the exchange passes. */
  fails?: string;
}

const ROWS: Row[] = [
  { name: 'a conforming exchange passes', path: '/v1/drives/drive_1', answer: () => json(drive) },
  {
    name: 'a request the copy refuses fails',
    path: '/v1/drives/drive_1?order=desc',
    answer: () => json(drive),
    fails: 'GET /v1/drives/{drive_id} request query: undeclared parameter "order"',
  },
  {
    name: 'an answer the copy does not declare fails',
    path: '/v1/drives/drive_1',
    answer: () => json({ ...drive, owner: 'me' }),
    fails: 'GET /v1/drives/{drive_id} answer 200 body/: undeclared field "owner"',
  },
  {
    name: 'a stream frame the copy does not declare fails',
    path: '/v1/drives/drive_1/changes/stream',
    answer: () => stream({ drive_id: 'drive_1', seq: 1, path: 'a' }),
    fails: 'stream event drive.changed/: undeclared field "path"',
  },
  {
    name: 'a conforming stream passes',
    path: '/v1/drives/drive_1/changes/stream',
    answer: () => stream({ drive_id: 'drive_1', seq: 1 }),
  },
  {
    name: 'a marked request with its one departure passes',
    path: '/v1/sessions/sesn_1?beta=true',
    init: update({ providers: {} }),
    answer: refusal,
    options: { requestOutsideContract: 'body/: undeclared field "providers"' },
  },
  {
    name: 'a marked request with a second departure fails on the second',
    path: '/v1/sessions/sesn_1?beta=true',
    init: update({ providers: {}, title: 7 }),
    answer: refusal,
    options: { requestOutsideContract: 'body/: undeclared field "providers"' },
    fails: 'POST /v1/sessions/{session_id} request body/title: must be string,null',
  },
  {
    name: 'a marked request with the same fault at another place fails',
    path: '/v1/sessions/sesn_1?beta=true',
    init: update({ agent: { providers: {} } }),
    answer: refusal,
    options: { requestOutsideContract: 'body/: undeclared field "providers"' },
    fails: 'POST /v1/sessions/{session_id} request body/agent: undeclared field "providers"',
  },
  {
    name: 'a mark that does not name the place of its departure fails',
    path: '/v1/sessions/sesn_1?beta=true',
    init: update({ providers: {} }),
    answer: refusal,
    options: { requestOutsideContract: 'undeclared field "providers"' },
    fails: 'POST /v1/sessions/{session_id} request body/: undeclared field "providers"',
  },
  {
    name: "an error envelope as the edge's answer fails, whatever content type it is sent under",
    path: '/v1/drives/drive_1?beta=true',
    init: { method: 'GET' },
    answer: () =>
      new Response(
        JSON.stringify({ type: 'error', error: { type: 'api_error', message: 'x' }, request_id: 'req_1' }),
        { status: 503 },
      ),
    fails: 'GET /v1/drives/{drive_id} answer 503 body: an error envelope, which the edge does not send',
  },
  {
    name: 'a marked request that the copy takes fails',
    path: '/v1/sessions/sesn_1?beta=true',
    init: update({ title: 'a title' }),
    answer: refusal,
    options: { requestOutsideContract: 'body/: undeclared field "providers"' },
    fails: 'marked as outside the copy by "body/: undeclared field \\"providers\\"", which it is not',
  },
];

// `%s` prints the whole name; `$name` would cut it short.
test.each(ROWS.map((row) => [row.name, row] as const))('%s', async (_name, row) => {
  const { path, init, answer, options, fails } = row;
  const response = await contractFetch(answer, options)(BASE + path, init);
  // A stream is checked as it is read.
  await response.text();
  if (fails === undefined) expect(failOnViolations).not.toThrow();
  else expect(failOnViolations).toThrow(fails);
});
