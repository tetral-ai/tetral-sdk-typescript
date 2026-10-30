import Anthropic, { toFile } from '@tetral-ai/sdk';
import type { BetaDrive, BetaDriveRestoreResult } from '@tetral-ai/sdk/resources/beta/drives/drives';
import type { BetaDriveChange } from '@tetral-ai/sdk/resources/beta/drives/changes';
import type { BetaDriveFile } from '@tetral-ai/sdk/resources/beta/drives/files';
import type { BetaDriveSkill } from '@tetral-ai/sdk/resources/beta/drives/skills';
import type { BetaDriveUsage } from '@tetral-ai/sdk/resources/beta/drives/usage';
import type { BetaDriveVersion } from '@tetral-ai/sdk/resources/beta/drives/versions';
import { jsonResponse, parseMaybeJSONBody } from '../tetral-contract-helpers';

const SHA = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

const DRIVE: BetaDrive = {
  id: 'drive_team_ai',
  skills_path: 'skills/',
  memory: { path: 'memory/', instructions: 'Keep notes short.' },
  limits: { max_bytes: 1_000_000_000, max_files: null },
  usage: { bytes: 2048, files: 3 },
  stored_bytes: null,
  metadata: { team: 'ai' },
  created_at: '2026-10-01T00:00:00Z',
};

const USAGE: BetaDriveUsage = { bytes: 2048, files: 3, max_bytes: 500_000_000_000, max_files: 100_000 };

const FILE: BetaDriveFile = {
  path: 'notes/plan.md',
  size_bytes: 12,
  content_sha256: SHA,
  version_id: 'dver_2',
  executable: false,
};

const VERSION: BetaDriveVersion = {
  version_id: 'dver_1',
  path: 'notes/plan.md',
  operation: 'created',
  size_bytes: 12,
  content_sha256: SHA,
  executable: false,
  writer: { type: 'session_actor', session_id: 'sesn_example', computer_id: 'comp_example' },
  created_at: '2026-10-01T00:00:00Z',
  redacted: false,
  redacted_by: null,
};

const REDACTED: BetaDriveVersion = {
  ...VERSION,
  redacted: true,
  redacted_by: { type: 'api_actor', api_key_id: 'apikey_example' },
};

const SKILL: BetaDriveSkill = { name: 'review', description: 'Reviews pull requests.', error: null };

const CHANGE: BetaDriveChange = {
  seq: 42,
  path: 'notes/plan.md',
  operation: 'modified',
  version_id: 'dver_2',
  writer: { type: 'user_actor', user_id: 'user_example' },
  created_at: '2026-10-02T00:00:00Z',
};

const RESTORE: BetaDriveRestoreResult = {
  seq: 43,
  restored: 2,
  redacted_paths: ['memory/secret.md'],
  removed_paths: [],
};

interface RouteRow {
  operation: string;
  call: (client: Anthropic) => Promise<unknown>;
  method: string;
  path: string;
  search: string;
  body?: unknown;
  multipart?: string[];
  response: () => Response;
  /** Turns the resolved value into plain data the row can compare. */
  read?: (value: any) => Promise<unknown> | unknown;
  result: unknown;
}

const page = <T>(item: T) => ({ data: [item], next_page: 'page_2' });
const readPage = (value: any) => ({ data: value.data, next_page: value.next_page });
const binary = () =>
  new Response('plan contents', { status: 200, headers: { 'Content-Type': 'application/octet-stream' } });
const noContent = () => new Response(null, { status: 204 });

const ROWS: RouteRow[] = [
  {
    operation: 'drives.create',
    call: (client) =>
      client.beta.drives.create({
        skills_path: 'skills',
        memory: { path: 'memory', instructions: 'Keep notes short.' },
        limits: { max_bytes: 1_000_000_000 },
        metadata: { team: 'ai' },
      }),
    method: 'POST',
    path: '/v1/drives',
    search: '?beta=true',
    body: {
      skills_path: 'skills',
      memory: { path: 'memory', instructions: 'Keep notes short.' },
      limits: { max_bytes: 1_000_000_000 },
      metadata: { team: 'ai' },
    },
    response: () => jsonResponse(DRIVE, 201),
    result: DRIVE,
  },
  {
    operation: 'drives.usage.retrieve',
    call: (client) => client.beta.drives.usage.retrieve(),
    method: 'GET',
    path: '/v1/drives/usage',
    search: '?beta=true',
    response: () => jsonResponse(USAGE),
    result: USAGE,
  },
  {
    operation: 'drives.retrieve',
    call: (client) => client.beta.drives.retrieve('drive_team_ai'),
    method: 'GET',
    path: '/v1/drives/drive_team_ai',
    search: '?beta=true',
    response: () => jsonResponse(DRIVE),
    result: DRIVE,
  },
  {
    operation: 'drives.list',
    call: (client) => client.beta.drives.list({ limit: 1, page: 'page_1' }),
    method: 'GET',
    path: '/v1/drives',
    search: '?beta=true&limit=1&page=page_1',
    response: () => jsonResponse(page(DRIVE)),
    read: readPage,
    result: page(DRIVE),
  },
  {
    operation: 'drives.update',
    call: (client) =>
      client.beta.drives.update('drive_team_ai', { limits: { max_files: null }, metadata: { team: null } }),
    method: 'POST',
    path: '/v1/drives/drive_team_ai',
    search: '?beta=true',
    body: { limits: { max_files: null }, metadata: { team: null } },
    response: () => jsonResponse(DRIVE),
    result: DRIVE,
  },
  {
    operation: 'drives.delete',
    call: (client) => client.beta.drives.delete('drive_team_ai'),
    method: 'DELETE',
    path: '/v1/drives/drive_team_ai',
    search: '?beta=true',
    response: noContent,
    result: null,
  },
  {
    operation: 'drives.files.upload',
    call: async (client) =>
      client.beta.drives.files.upload('drive_team_ai', {
        path: 'notes/plan.md',
        file: await toFile(Buffer.from('plan contents'), 'plan.md'),
        expected_content_sha256: SHA,
      }),
    method: 'POST',
    path: '/v1/drives/drive_team_ai/files',
    search: '?beta=true',
    multipart: ['path', 'file', 'expected_content_sha256'],
    response: () => jsonResponse({ version_id: 'dver_2', content_sha256: SHA }, 201),
    result: { version_id: 'dver_2', content_sha256: SHA },
  },
  {
    operation: 'drives.files.list',
    call: (client) => client.beta.drives.files.list('drive_team_ai', { path_prefix: 'notes', limit: 10 }),
    method: 'GET',
    path: '/v1/drives/drive_team_ai/files',
    search: '?beta=true&path_prefix=notes&limit=10',
    response: () => jsonResponse(page(FILE)),
    read: readPage,
    result: page(FILE),
  },
  {
    operation: 'drives.files.download',
    call: (client) => client.beta.drives.files.download('drive_team_ai', { path: 'notes/plan.md' }),
    method: 'GET',
    path: '/v1/drives/drive_team_ai/files/content',
    search: '?beta=true&path=notes%2Fplan.md',
    response: binary,
    read: (value: Response) => value.text(),
    result: 'plan contents',
  },
  {
    operation: 'drives.files.delete',
    call: (client) =>
      client.beta.drives.files.delete('drive_team_ai', {
        path: 'notes/plan.md',
        expected_content_sha256: SHA,
      }),
    method: 'DELETE',
    path: '/v1/drives/drive_team_ai/files',
    search: `?beta=true&path=notes%2Fplan.md&expected_content_sha256=${SHA}`,
    response: () => jsonResponse({ version_id: 'dver_3' }),
    result: { version_id: 'dver_3' },
  },
  {
    operation: 'drives.files.versions.list',
    call: (client) => client.beta.drives.files.versions.list('drive_team_ai', { path: 'notes/plan.md' }),
    method: 'GET',
    path: '/v1/drives/drive_team_ai/files/versions',
    search: '?beta=true&path=notes%2Fplan.md',
    response: () => jsonResponse(page(VERSION)),
    read: readPage,
    result: page(VERSION),
  },
  {
    operation: 'drives.files.versions.retrieve',
    call: (client) => client.beta.drives.files.versions.retrieve('drive_team_ai', 'dver_1'),
    method: 'GET',
    path: '/v1/drives/drive_team_ai/versions/dver_1',
    search: '?beta=true',
    response: () => jsonResponse(VERSION),
    result: VERSION,
  },
  {
    operation: 'drives.files.versions.content',
    call: (client) => client.beta.drives.files.versions.content('drive_team_ai', 'dver_1'),
    method: 'GET',
    path: '/v1/drives/drive_team_ai/versions/dver_1/content',
    search: '?beta=true',
    response: binary,
    read: (value: Response) => value.text(),
    result: 'plan contents',
  },
  {
    operation: 'drives.files.versions.redact',
    call: (client) => client.beta.drives.files.versions.redact('drive_team_ai', 'dver_1'),
    method: 'POST',
    path: '/v1/drives/drive_team_ai/versions/dver_1/redact',
    search: '?beta=true',
    response: () => jsonResponse(REDACTED),
    result: REDACTED,
  },
  {
    operation: 'drives.skills.upload',
    call: async (client) =>
      client.beta.drives.skills.upload('drive_team_ai', {
        archive: await toFile(Buffer.from('PK\u0003\u0004'), 'review.zip'),
      }),
    method: 'POST',
    path: '/v1/drives/drive_team_ai/skills',
    search: '?beta=true',
    multipart: ['archive'],
    response: () => jsonResponse(SKILL, 201),
    result: SKILL,
  },
  {
    operation: 'drives.skills.list',
    call: (client) => client.beta.drives.skills.list('drive_team_ai', { limit: 5 }),
    method: 'GET',
    path: '/v1/drives/drive_team_ai/skills',
    search: '?beta=true&limit=5',
    response: () => jsonResponse(page({ ...SKILL, error: 'SKILL.md has no description' })),
    read: readPage,
    result: page({ ...SKILL, error: 'SKILL.md has no description' }),
  },
  {
    operation: 'drives.skills.retrieve',
    call: (client) => client.beta.drives.skills.retrieve('drive_team_ai', 'review'),
    method: 'GET',
    path: '/v1/drives/drive_team_ai/skills/review',
    search: '?beta=true',
    response: () => jsonResponse(SKILL),
    result: SKILL,
  },
  {
    operation: 'drives.skills.delete',
    call: (client) => client.beta.drives.skills.delete('drive_team_ai', 'review'),
    method: 'DELETE',
    path: '/v1/drives/drive_team_ai/skills/review',
    search: '?beta=true',
    response: noContent,
    result: null,
  },
  {
    operation: 'drives.changes.list',
    call: (client) =>
      client.beta.drives.changes.list('drive_team_ai', { after: 41, session_id: 'sesn_example', limit: 2 }),
    method: 'GET',
    path: '/v1/drives/drive_team_ai/changes',
    search: '?beta=true&after=41&session_id=sesn_example&limit=2',
    response: () => jsonResponse({ data: [CHANGE], has_more: true }),
    result: { data: [CHANGE], has_more: true },
  },
  {
    operation: 'drives.changes.stream',
    call: (client) => client.beta.drives.changes.stream('drive_team_ai'),
    method: 'GET',
    path: '/v1/drives/drive_team_ai/changes/stream',
    search: '?beta=true',
    response: () =>
      new Response(
        'event: drive.changed\ndata: {"drive_id":"drive_team_ai","seq":42}\n\n' +
          'event: drive.changed\ndata: {"drive_id":"drive_team_ai","seq":44}\n\n',
        { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
      ),
    read: async (stream: AsyncIterable<unknown>) => {
      const notices: unknown[] = [];
      for await (const notice of stream) notices.push(notice);
      return notices;
    },
    result: [
      { drive_id: 'drive_team_ai', seq: 42 },
      { drive_id: 'drive_team_ai', seq: 44 },
    ],
  },
  {
    operation: 'drives.restore',
    call: (client) =>
      client.beta.drives.restore('drive_team_ai', { path_prefix: 'memory', as_of: '2026-10-01T00:00:00Z' }),
    method: 'POST',
    path: '/v1/drives/drive_team_ai/restore',
    search: '?beta=true',
    body: { path_prefix: 'memory', as_of: '2026-10-01T00:00:00Z' },
    response: () => jsonResponse(RESTORE),
    result: RESTORE,
  },
];

async function multipartFieldNames(body: RequestInit['body']): Promise<string[]> {
  const text = await new Response(body).text();
  return [...text.matchAll(/Content-Disposition: form-data; name="([^"]+)"/g)].map((match) => match[1]!);
}

describe('Tetral drive routes', () => {
  test.each(ROWS)('$operation sends its contract request', async (row) => {
    const requests: Array<{ method: string; url: URL; init: RequestInit | undefined }> = [];
    const client = new Anthropic({
      apiKey: 'test-tetral-key',
      baseURL: 'https://api.tetral.example',
      fetch: async (url: any, init?: RequestInit) => {
        // The multipart helper first probes the fetch with a `data:` URL.
        if (String(url).startsWith('data:')) return new Response('');
        requests.push({
          method: String(init?.method ?? 'GET').toUpperCase(),
          url: new URL(String(url)),
          init,
        });
        return row.response();
      },
    });

    const value = await row.call(client);
    const result = row.read ? await row.read(value) : value;

    expect(requests).toHaveLength(1);
    const request = requests[0]!;
    expect(request.method).toBe(row.method);
    expect(request.url.pathname).toBe(row.path);
    expect(request.url.search).toBe(row.search);
    if (row.multipart) {
      expect(await multipartFieldNames(request.init?.body)).toEqual(row.multipart);
    } else {
      expect(parseMaybeJSONBody(request.init)).toEqual(row.body);
    }
    expect(result).toEqual(row.result);
  });
});
