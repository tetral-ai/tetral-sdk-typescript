import Anthropic from '@tetral-ai/sdk';
import type { BetaComputer } from '@tetral-ai/sdk/resources/beta/sessions/computers';
import type { BetaSessionDrive } from '@tetral-ai/sdk/resources/beta/sessions/drives';
import { getHeader, jsonResponse, parseMaybeJSONBody } from '../tetral-contract-helpers';

const COMPUTER: BetaComputer = {
  id: 'comp_example',
  kind: 'user',
  environment_id: null,
  instance_id: 'inst_mac',
  current_instance_id: 'inst_mac',
  working_directory: '/Users/me/code/shop',
  cwd: '/Users/me/code/shop',
  networking: { type: 'blocked' },
  repositories: [],
  drive_exclude: [],
  association_state: 'attached',
  execution_state: 'ready',
  connection_id: 'conn_example',
  binding_id: 'bind_example',
  error: null,
};

const BINDING: BetaSessionDrive = { drive_id: 'drive_team_ai', access: 'read_write' };

interface RouteRow {
  operation: string;
  call: (client: Anthropic) => Promise<unknown>;
  method: string;
  path: string;
  headers?: Record<string, string>;
  body?: unknown;
  status: number;
  response: object | null;
  result: unknown;
}

const ROWS: RouteRow[] = [
  {
    operation: 'sessions.computers.create',
    call: (client) =>
      client.beta.sessions.computers.create(
        'sesn_example',
        {
          instance_id: 'inst_mac',
          working_directory: '/Users/me/code/shop',
          networking: { type: 'blocked' },
          drive_exclude: [{ drive_id: 'drive_team_ai', paths: ['datasets/'] }],
        },
        { idempotencyKey: 'add-mac-1' },
      ),
    method: 'POST',
    path: '/v1/sessions/sesn_example/computers',
    headers: { 'Idempotency-Key': 'add-mac-1' },
    body: {
      instance_id: 'inst_mac',
      working_directory: '/Users/me/code/shop',
      networking: { type: 'blocked' },
      drive_exclude: [{ drive_id: 'drive_team_ai', paths: ['datasets/'] }],
    },
    status: 201,
    response: COMPUTER,
    result: COMPUTER,
  },
  {
    operation: 'sessions.computers.retrieve',
    call: (client) => client.beta.sessions.computers.retrieve('sesn_example', 'comp_example'),
    method: 'GET',
    path: '/v1/sessions/sesn_example/computers/comp_example',
    status: 200,
    response: COMPUTER,
    result: COMPUTER,
  },
  {
    operation: 'sessions.computers.delete',
    call: (client) => client.beta.sessions.computers.delete('sesn_example', 'comp_example'),
    method: 'DELETE',
    path: '/v1/sessions/sesn_example/computers/comp_example',
    status: 202,
    response: { ...COMPUTER, association_state: 'detached', execution_state: 'closing' },
    result: { ...COMPUTER, association_state: 'detached', execution_state: 'closing' },
  },
  {
    operation: 'sessions.drives.create',
    call: (client) =>
      client.beta.sessions.drives.create('sesn_example', { drive_id: 'drive_team_ai', access: 'read_write' }),
    method: 'POST',
    path: '/v1/sessions/sesn_example/drives',
    body: { drive_id: 'drive_team_ai', access: 'read_write' },
    status: 201,
    response: BINDING,
    result: BINDING,
  },
  {
    operation: 'sessions.drives.update',
    call: (client) =>
      client.beta.sessions.drives.update('sesn_example', 'drive_team_ai', { access: 'read_only' }),
    method: 'POST',
    path: '/v1/sessions/sesn_example/drives/drive_team_ai',
    body: { access: 'read_only' },
    status: 200,
    response: { drive_id: 'drive_team_ai', access: 'read_only' },
    result: { drive_id: 'drive_team_ai', access: 'read_only' },
  },
  {
    operation: 'sessions.drives.delete',
    call: (client) => client.beta.sessions.drives.delete('sesn_example', 'drive_team_ai'),
    method: 'DELETE',
    path: '/v1/sessions/sesn_example/drives/drive_team_ai',
    status: 204,
    response: null,
    result: null,
  },
];

describe('Tetral Session computer and drive binding routes', () => {
  test.each(ROWS)('$operation sends its contract request', async (row) => {
    const requests: Array<{ method: string; url: URL; init: RequestInit | undefined }> = [];
    const client = new Anthropic({
      apiKey: 'test-tetral-key',
      baseURL: 'https://api.tetral.example',
      fetch: async (url: any, init?: RequestInit) => {
        requests.push({
          method: String(init?.method ?? 'GET').toUpperCase(),
          url: new URL(String(url)),
          init,
        });
        return row.response === null ?
            new Response(null, { status: row.status })
          : jsonResponse(row.response, row.status);
      },
    });

    const result = await row.call(client);

    expect(requests).toHaveLength(1);
    const request = requests[0]!;
    expect(request.method).toBe(row.method);
    expect(request.url.pathname).toBe(row.path);
    expect(request.url.search).toBe('?beta=true');
    for (const [name, value] of Object.entries(row.headers ?? {})) {
      expect(getHeader(request.init, name)).toBe(value);
    }
    expect(parseMaybeJSONBody(request.init)).toEqual(row.body);
    expect(result).toEqual(row.result);
  });

  test('sessions.computers.delete resolves to null once the computer is closed', async () => {
    const client = new Anthropic({
      apiKey: 'test-tetral-key',
      baseURL: 'https://api.tetral.example',
      fetch: async () => new Response(null, { status: 204 }),
    });

    await expect(client.beta.sessions.computers.delete('sesn_example', 'comp_example')).resolves.toBeNull();
  });
});
