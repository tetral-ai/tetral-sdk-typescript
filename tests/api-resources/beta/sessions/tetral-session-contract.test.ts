import type {
  BetaManagedAgentsEventParams,
  SessionCreateParams,
  SessionUpdateParams,
  TetralSessionProviderSelectors,
} from '@tetral-ai/sdk/resources/beta/sessions';
import { SESSION_ANSWER, errorResponse, jsonResponse, parseJSONBody } from '../tetral-contract-helpers';
import { contractClient } from '../../../engine-contract/contract-fetch';

describe('Tetral Session SDK contract', () => {
  test('create serializes explicit vault_ids and provider selectors', async () => {
    const captured: { url: string; body: unknown }[] = [];
    const client = contractClient({
      apiKey: 'test-tetral-key',
      baseURL: 'https://api.tetral.example',
      fetch: async (url: any, init?: RequestInit) => {
        captured.push({ url: String(url), body: parseJSONBody(init) });
        return jsonResponse(SESSION_ANSWER);
      },
    });

    await client.beta.sessions.create({
      agent: 'agent_123',
      environment_id: 'env_123',
      vault_ids: [],
      resources: [
        {
          type: 'memory_store',
          memory_store_id: 'memstore_123',
          access: 'read_write',
        },
      ],
      providers: {
        openai: { credential_id: 'cred_123' },
      },
    });

    expect(captured).toHaveLength(1);
    expect(captured[0]!.url).toBe('https://api.tetral.example/v1/sessions?beta=true');
    expect(captured[0]!.body).toMatchObject({
      agent: 'agent_123',
      environment_id: 'env_123',
      vault_ids: [],
      resources: [
        {
          type: 'memory_store',
          memory_store_id: 'memstore_123',
          access: 'read_write',
        },
      ],
      providers: { openai: { credential_id: 'cred_123' } },
    });
  });

  test('update serializes the Session-local approval mode and title, and nothing else', async () => {
    const captured: { url: string; body: unknown }[] = [];
    const client = contractClient({
      apiKey: 'test-tetral-key',
      baseURL: 'https://api.tetral.example',
      fetch: async (url: any, init?: RequestInit) => {
        captured.push({ url: String(url), body: parseJSONBody(init) });
        return jsonResponse(SESSION_ANSWER);
      },
    });

    await client.beta.sessions.update('sesn_123', {
      agent: {
        approval_mode: 'approve_for_me',
      },
      title: 'updated title',
    });

    expect(captured).toHaveLength(1);
    expect(captured[0]!.url).toBe('https://api.tetral.example/v1/sessions/sesn_123?beta=true');
    expect(captured[0]!.body).toEqual({
      agent: {
        approval_mode: 'approve_for_me',
      },
      title: 'updated title',
    });
  });

  test('archive posts to the Session and parses the archived Session', async () => {
    const captured: { method: string | undefined; url: string }[] = [];
    const archived = { ...SESSION_ANSWER, archived_at: '2026-10-05T00:00:00Z' };
    const client = contractClient({
      apiKey: 'test-tetral-key',
      baseURL: 'https://api.tetral.example',
      fetch: async (url: any, init?: RequestInit) => {
        captured.push({ method: init?.method, url: String(url) });
        return jsonResponse(archived);
      },
    });

    await expect(client.beta.sessions.archive('sesn_123')).resolves.toEqual(archived);
    expect(captured).toEqual([
      { method: 'POST', url: 'https://api.tetral.example/v1/sessions/sesn_123/archive?beta=true' },
    ]);
  });

  test('parses session usage.server_tool_use counters from response fixtures', async () => {
    const client = contractClient({
      apiKey: 'test-tetral-key',
      baseURL: 'https://api.tetral.example',
      fetch: async () => jsonResponse(SESSION_ANSWER),
    });

    const session = await client.beta.sessions.retrieve('sesn_123');

    expect(session.usage.server_tool_use).toEqual({
      web_fetch_requests: 1,
      web_search_requests: 2,
    });
  });

  test.each([
    [{ type: 'user.tool_result', tool_use_id: 'toolu_123' }],
    [{ type: 'user.custom_tool_result', custom_tool_use_id: 'ctu_123' }],
    [
      {
        type: 'user.define_outcome',
        description: 'ship the task',
        rubric: { type: 'text', content: 'The task is complete.' },
      },
    ],
    [{ type: 'system.message', content: [{ type: 'text', text: 'internal context' }] }],
  ] satisfies Array<[BetaManagedAgentsEventParams]>)(
    'sends unsupported event variant %s through the normal request path and parses backend 400',
    async (event) => {
      const captured: unknown[] = [];
      const client = contractClient(
        {
          apiKey: 'test-tetral-key',
          baseURL: 'https://api.tetral.example',
          fetch: async (_url: any, init?: RequestInit) => {
            captured.push(parseJSONBody(init));
            return errorResponse(400, 'invalid_request_error', `${event.type} is unsupported`);
          },
        },
        { requestOutsideContract: `body/events/0: type "${event.type}" is not a member of the union` },
      );

      await expect(client.beta.sessions.events.send('sesn_123', { events: [event] })).rejects.toMatchObject({
        status: 400,
        type: 'invalid_request_error',
      });
      expect(captured).toEqual([{ events: [event] }]);
    },
  );

  test('type smoke covers providers and explicit create-time vault_ids', () => {
    const providers: TetralSessionProviderSelectors = {
      openai: { credential_id: 'cred_123' },
    };
    const createWithVaults: SessionCreateParams = {
      agent: 'agent_123',
      environment_id: 'env_123',
      vault_ids: ['vlt_123'],
      resources: [{ type: 'memory_store', memory_store_id: 'memstore_123' }],
      providers,
    };
    const createWithNoVaults: SessionCreateParams = {
      agent: 'agent_123',
      environment_id: 'env_123',
      vault_ids: [],
    };
    const updateWithProviders: SessionUpdateParams = {
      // @ts-expect-error Provider selectors are fixed when the Session is created.
      providers: {},
    };
    const retainedVaultUpdateCompatibility: SessionUpdateParams = {
      vault_ids: ['vlt_123'],
    };

    expect(createWithVaults.providers).toBe(providers);
    expect(createWithVaults.resources?.[0]).toMatchObject({
      type: 'memory_store',
      memory_store_id: 'memstore_123',
    });
    expect(createWithNoVaults.vault_ids).toEqual([]);
    void updateWithProviders;
    expect(retainedVaultUpdateCompatibility.vault_ids).toEqual(['vlt_123']);
  });

  test('list forward pagination is unchanged under BidirectionalPageCursor and prev_page degrades to null', async () => {
    const captured: string[] = [];
    const pages = [
      { data: [SESSION_ANSWER], next_page: 'cursor_page_2' },
      { data: [SESSION_ANSWER], next_page: null },
    ];
    const client = contractClient({
      apiKey: 'test-tetral-key',
      baseURL: 'https://api.tetral.example',
      fetch: async (url: any) => {
        const urlStr = String(url);
        captured.push(urlStr);
        return jsonResponse(urlStr.includes('page=') ? pages[1]! : pages[0]!);
      },
    });

    const firstPage = await client.beta.sessions.list({ limit: 1 });
    // Engine responses carry only next_page; the reverse direction stays
    // retained-unsupported and must degrade to null, not throw.
    expect(firstPage.prev_page).toBeNull();
    expect(firstPage.next_page).toBe('cursor_page_2');

    const items = [];
    for await (const session of client.beta.sessions.list({ limit: 1 })) {
      items.push(session);
    }
    expect(items).toHaveLength(2);

    // Forward iteration sends the same wire shape as the previous PageCursor:
    // the follow-up request carries the next_page cursor as the `page` query.
    expect(captured[0]).toBe('https://api.tetral.example/v1/sessions?beta=true&limit=1');
    expect(captured[captured.length - 1]).toBe(
      'https://api.tetral.example/v1/sessions?beta=true&limit=1&page=cursor_page_2',
    );
  });
});

// @ts-expect-error Tetral Session create requires explicit vault_ids, even [].
const createWithoutVaultIDs: SessionCreateParams = {
  agent: 'agent_123',
  environment_id: 'env_123',
};
void createWithoutVaultIDs;
