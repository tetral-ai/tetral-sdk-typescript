import Anthropic from '@anthropic-ai/sdk';
import type {
  BetaManagedAgentsDeletedMemoryStore,
  BetaManagedAgentsMemoryStore,
  MemoryStoreListParams,
} from '@anthropic-ai/sdk/resources/beta/memory-stores/memory-stores';
import type {
  BetaManagedAgentsDeletedMemory,
  BetaManagedAgentsMemory,
  MemoryDeleteParams,
  MemoryRetrieveParams,
  MemoryUpdateParams,
} from '@anthropic-ai/sdk/resources/beta/memory-stores/memories';
import type {
  BetaManagedAgentsMemoryVersion,
  MemoryVersionListParams,
  MemoryVersionRedactParams,
} from '@anthropic-ai/sdk/resources/beta/memory-stores/memory-versions';
import type { SessionCreateParams } from '@anthropic-ai/sdk/resources/beta/sessions';

const MEMORY_STORE: BetaManagedAgentsMemoryStore = {
  id: 'memstore_123',
  created_at: '2026-01-01T00:00:00Z',
  name: 'User Preferences',
  type: 'memory_store',
  updated_at: '2026-01-01T00:00:00Z',
  archived_at: null,
  description: 'Long-lived user preferences.',
  metadata: { owner: 'user_123' },
};

const MEMORY: BetaManagedAgentsMemory = {
  id: 'mem_123',
  content_sha256: 'a'.repeat(64),
  content_size_bytes: 5,
  created_at: '2026-01-01T00:00:00Z',
  memory_store_id: 'memstore_123',
  memory_version_id: 'memver_123',
  path: '/notes/hello.md',
  type: 'memory',
  updated_at: '2026-01-01T00:00:00Z',
  content: 'hello',
};

const MEMORY_VERSION: BetaManagedAgentsMemoryVersion = {
  id: 'memver_123',
  created_at: '2026-01-01T00:00:00Z',
  memory_id: 'mem_123',
  memory_store_id: 'memstore_123',
  operation: 'modified',
  type: 'memory_version',
  content: 'hello',
  content_sha256: 'a'.repeat(64),
  content_size_bytes: 5,
  created_by: { type: 'session_actor', session_id: 'sesn_123' },
  path: '/notes/hello.md',
  redacted_at: null,
};

function jsonResponse(body: object, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'request-id': 'req_123' },
  });
}

function parseJSONBody(init: RequestInit | undefined): unknown {
  if (typeof init?.body !== 'string') {
    throw new Error(`Expected JSON string body, got ${typeof init?.body}`);
  }
  return JSON.parse(init.body);
}

function requestMethod(init: RequestInit | undefined): string {
  return String(init?.method ?? 'GET').toUpperCase();
}

describe('Tetral Memory SDK contract', () => {
  test('memory store lifecycle and list pagination stay on explicit store paths', async () => {
    const requests: Array<{ method: string; url: URL; body?: unknown }> = [];
    let listCalls = 0;
    const client = new Anthropic({
      apiKey: 'redacted-key-test',
      baseURL: 'https://api.tetral.example',
      fetch: async (url: any, init?: RequestInit) => {
        const parsedURL = new URL(String(url));
        const method = requestMethod(init);
        requests.push({
          method,
          url: parsedURL,
          body: init?.body == null ? undefined : parseJSONBody(init),
        });

        if (method === 'GET' && parsedURL.pathname === '/v1/memory_stores') {
          listCalls += 1;
          return jsonResponse({
            data: [{ ...MEMORY_STORE, id: `memstore_page_${listCalls}` }],
            next_page: listCalls === 1 ? 'cursor_2' : null,
          });
        }
        if (method === 'DELETE') {
          return jsonResponse({
            id: 'memstore_123',
            type: 'memory_store_deleted',
          } satisfies BetaManagedAgentsDeletedMemoryStore);
        }
        return jsonResponse(MEMORY_STORE);
      },
    });

    await client.beta.memoryStores.create({ name: 'User Preferences', metadata: { owner: 'user_123' } });
    await client.beta.memoryStores.retrieve('memstore_123');
    await client.beta.memoryStores.update('memstore_123', { description: 'Updated' });
    await client.beta.memoryStores.delete('memstore_123');
    await client.beta.memoryStores.archive('memstore_123');

    const listed: string[] = [];
    for await (const store of client.beta.memoryStores.list({
      limit: 1,
      include_archived: true,
      'created_at[gte]': '2026-01-01T00:00:00Z',
    })) {
      listed.push(store.id);
    }

    expect(requests.map((request) => [request.method, request.url.pathname])).toEqual([
      ['POST', '/v1/memory_stores'],
      ['GET', '/v1/memory_stores/memstore_123'],
      ['POST', '/v1/memory_stores/memstore_123'],
      ['DELETE', '/v1/memory_stores/memstore_123'],
      ['POST', '/v1/memory_stores/memstore_123/archive'],
      ['GET', '/v1/memory_stores'],
      ['GET', '/v1/memory_stores'],
    ]);
    const firstListURL = requests[5]!.url;
    expect(firstListURL.searchParams.get('beta')).toBe('true');
    expect(firstListURL.searchParams.get('limit')).toBe('1');
    expect(firstListURL.searchParams.get('include_archived')).toBe('true');
    expect(firstListURL.searchParams.get('created_at[gte]')).toBe('2026-01-01T00:00:00Z');
    expect(requests[6]!.url.searchParams.get('page')).toBe('cursor_2');
    expect(listed).toEqual(['memstore_page_1', 'memstore_page_2']);
  });

  test('memories require store scoping and serialize view, preconditions, and expected hashes', async () => {
    const requests: Array<{ method: string; url: URL; body?: unknown }> = [];
    let listCalls = 0;
    const client = new Anthropic({
      apiKey: 'redacted-key-test',
      baseURL: 'https://api.tetral.example',
      fetch: async (url: any, init?: RequestInit) => {
        const method = requestMethod(init);
        requests.push({
          method,
          url: new URL(String(url)),
          body: init?.body == null ? undefined : parseJSONBody(init),
        });
        if (method === 'GET' && String(url).includes('/v1/memory_stores/memstore_123/memories?')) {
          listCalls += 1;
          return jsonResponse({
            data: [{ ...MEMORY, id: `mem_page_${listCalls}` }],
            next_page: listCalls === 1 ? 'cursor_2' : null,
          });
        }
        if (method === 'DELETE') {
          return jsonResponse({
            id: 'mem_123',
            type: 'memory_deleted',
          } satisfies BetaManagedAgentsDeletedMemory);
        }
        return jsonResponse(MEMORY);
      },
    });

    await client.beta.memoryStores.memories.create('memstore_123', {
      path: '/notes/hello.md',
      content: 'hello',
      view: 'full',
    });
    await client.beta.memoryStores.memories.retrieve('mem_123', {
      memory_store_id: 'memstore_123',
      view: 'basic',
    });
    await client.beta.memoryStores.memories.update('mem_123', {
      memory_store_id: 'memstore_123',
      view: 'full',
      path: '/notes/renamed.md',
      content: 'updated',
      precondition: { type: 'content_sha256', content_sha256: 'a'.repeat(64) },
    });
    await client.beta.memoryStores.memories.delete('mem_123', {
      memory_store_id: 'memstore_123',
      expected_content_sha256: 'b'.repeat(64),
    });
    const listed: string[] = [];
    for await (const memory of client.beta.memoryStores.memories.list('memstore_123', {
      limit: 1,
      path_prefix: '/notes/',
      depth: 1,
      order: 'asc',
      order_by: 'path',
      view: 'basic',
    })) {
      listed.push(memory.type === 'memory' ? memory.id : memory.path);
    }

    expect(requests.map((request) => [request.method, request.url.pathname])).toEqual([
      ['POST', '/v1/memory_stores/memstore_123/memories'],
      ['GET', '/v1/memory_stores/memstore_123/memories/mem_123'],
      ['POST', '/v1/memory_stores/memstore_123/memories/mem_123'],
      ['DELETE', '/v1/memory_stores/memstore_123/memories/mem_123'],
      ['GET', '/v1/memory_stores/memstore_123/memories'],
      ['GET', '/v1/memory_stores/memstore_123/memories'],
    ]);
    expect(requests[0]!.url.searchParams.get('view')).toBe('full');
    expect(requests[0]!.body).toEqual({ path: '/notes/hello.md', content: 'hello' });
    expect(requests[1]!.url.searchParams.get('view')).toBe('basic');
    expect(requests[2]!.url.searchParams.get('view')).toBe('full');
    expect(requests[2]!.body).toEqual({
      path: '/notes/renamed.md',
      content: 'updated',
      precondition: { type: 'content_sha256', content_sha256: 'a'.repeat(64) },
    });
    expect(requests[3]!.url.searchParams.get('expected_content_sha256')).toBe('b'.repeat(64));
    const firstListURL = requests[4]!.url;
    expect(firstListURL.searchParams.get('limit')).toBe('1');
    expect(firstListURL.searchParams.get('path_prefix')).toBe('/notes/');
    expect(firstListURL.searchParams.get('depth')).toBe('1');
    expect(firstListURL.searchParams.get('order')).toBe('asc');
    expect(firstListURL.searchParams.get('order_by')).toBe('path');
    expect(firstListURL.searchParams.get('view')).toBe('basic');
    expect(requests[5]!.url.searchParams.get('page')).toBe('cursor_2');
    expect(listed).toEqual(['mem_page_1', 'mem_page_2']);
  });

  test('memory versions keep store-scoped retrieve/list/redact and session_id filtering', async () => {
    const requests: Array<{ method: string; url: URL }> = [];
    let listCalls = 0;
    const client = new Anthropic({
      apiKey: 'redacted-key-test',
      baseURL: 'https://api.tetral.example',
      fetch: async (url: any, init?: RequestInit) => {
        const parsedURL = new URL(String(url));
        const method = requestMethod(init);
        requests.push({ method, url: parsedURL });

        if (method === 'GET' && parsedURL.pathname === '/v1/memory_stores/memstore_123/memory_versions') {
          listCalls += 1;
          return jsonResponse({
            data: [{ ...MEMORY_VERSION, id: `memver_page_${listCalls}` }],
            next_page: listCalls === 1 ? 'cursor_2' : null,
          });
        }
        if (method === 'POST') {
          return jsonResponse({
            ...MEMORY_VERSION,
            redacted_at: '2026-01-02T00:00:00Z',
            redacted_by: { type: 'api_actor', api_key_id: 'key_123' },
            content: null,
            content_sha256: null,
            content_size_bytes: null,
            path: null,
          });
        }
        return jsonResponse(MEMORY_VERSION);
      },
    });

    await client.beta.memoryStores.memoryVersions.retrieve('memver_123', {
      memory_store_id: 'memstore_123',
      view: 'full',
    });

    const listed: string[] = [];
    for await (const version of client.beta.memoryStores.memoryVersions.list('memstore_123', {
      limit: 1,
      memory_id: 'mem_123',
      operation: 'modified',
      session_id: 'sesn_123',
      api_key_id: 'key_123',
      'created_at[gte]': '2026-01-01T00:00:00Z',
      view: 'basic',
    })) {
      listed.push(version.id);
    }

    const redacted = await client.beta.memoryStores.memoryVersions.redact('memver_123', {
      memory_store_id: 'memstore_123',
    });

    expect(requests.map((request) => [request.method, request.url.pathname])).toEqual([
      ['GET', '/v1/memory_stores/memstore_123/memory_versions/memver_123'],
      ['GET', '/v1/memory_stores/memstore_123/memory_versions'],
      ['GET', '/v1/memory_stores/memstore_123/memory_versions'],
      ['POST', '/v1/memory_stores/memstore_123/memory_versions/memver_123/redact'],
    ]);
    const listURL = requests[1]!.url;
    expect(listURL.searchParams.get('session_id')).toBe('sesn_123');
    expect(listURL.searchParams.get('memory_id')).toBe('mem_123');
    expect(listURL.searchParams.get('operation')).toBe('modified');
    expect(listURL.searchParams.get('api_key_id')).toBe('key_123');
    expect(listURL.searchParams.get('created_at[gte]')).toBe('2026-01-01T00:00:00Z');
    expect(listURL.searchParams.get('view')).toBe('basic');
    expect(requests[2]!.url.searchParams.get('page')).toBe('cursor_2');
    expect(listed).toEqual(['memver_page_1', 'memver_page_2']);
    expect(redacted.redacted_at).toBe('2026-01-02T00:00:00Z');
    expect(redacted.content).toBeNull();
  });

  test('memory write conflicts parse backend 409 invalid_request_error without SDK preflight', async () => {
    const captured: unknown[] = [];
    const client = new Anthropic({
      apiKey: 'redacted-key-test',
      baseURL: 'https://api.tetral.example',
      maxRetries: 0,
      fetch: async (_url: any, init?: RequestInit) => {
        captured.push(parseJSONBody(init));
        return jsonResponse(
          {
            type: 'error',
            error: { type: 'invalid_request_error', message: 'memory precondition failed' },
          },
          409,
        );
      },
    });

    await expect(
      client.beta.memoryStores.memories.update('mem_123', {
        memory_store_id: 'memstore_123',
        content: 'updated',
        precondition: { type: 'content_sha256', content_sha256: 'a'.repeat(64) },
      }),
    ).rejects.toMatchObject({
      status: 409,
      type: 'invalid_request_error',
    });
    expect(captured).toEqual([
      {
        content: 'updated',
        precondition: { type: 'content_sha256', content_sha256: 'a'.repeat(64) },
      },
    ]);
  });

  test('type smoke covers view, redaction, session filters, and explicit Memory Store attachment', () => {
    const storeListParams: MemoryStoreListParams = {
      limit: 20,
      page: 'cursor_1',
      include_archived: false,
    };
    const versionListParams: MemoryVersionListParams = {
      session_id: 'sesn_123',
      operation: 'deleted',
      view: 'full',
    };
    const redactParams: MemoryVersionRedactParams = { memory_store_id: 'memstore_123' };
    const sessionWithExplicitStore: SessionCreateParams = {
      agent: 'agent_123',
      environment_id: 'env_123',
      vault_ids: [],
      resources: [{ type: 'memory_store', memory_store_id: 'memstore_123' }],
    };

    expect(storeListParams.limit).toBe(20);
    expect(versionListParams.session_id).toBe('sesn_123');
    expect(redactParams.memory_store_id).toBe('memstore_123');
    expect(sessionWithExplicitStore.resources?.[0]).toMatchObject({
      type: 'memory_store',
      memory_store_id: 'memstore_123',
    });
  });
});

// @ts-expect-error Memory reads must name the store; there is no workspace default.
const retrieveMemoryWithoutStore: MemoryRetrieveParams = { view: 'full' };
void retrieveMemoryWithoutStore;

// @ts-expect-error Memory updates must name the store; there is no workspace default.
const updateMemoryWithoutStore: MemoryUpdateParams = { content: 'updated' };
void updateMemoryWithoutStore;

// @ts-expect-error Memory deletes must name the store; there is no workspace default.
const deleteMemoryWithoutStore: MemoryDeleteParams = { expected_content_sha256: 'a'.repeat(64) };
void deleteMemoryWithoutStore;

// @ts-expect-error Memory version redaction must name the store; there is no workspace default.
const redactVersionWithoutStore: MemoryVersionRedactParams = {};
void redactVersionWithoutStore;
