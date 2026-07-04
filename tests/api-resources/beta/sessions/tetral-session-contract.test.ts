import Anthropic from '@tetral-ai/sdk';
import type {
  BetaManagedAgentsEventParams,
  SessionCreateParams,
  SessionUpdateParams,
  TetralSessionProviderSelectors,
} from '@tetral-ai/sdk/resources/beta/sessions';
import { jsonResponse, parseJSONBody } from '../tetral-contract-helpers';

const SESSION_RESPONSE = {
  id: 'sesn_123',
  type: 'session',
  agent: {
    id: 'agent_123',
    description: null,
    mcp_servers: [],
    approval_mode: 'ask_for_approval',
    model: { id: 'openai/gpt-5.5' },
    multiagent: null,
    name: 'Tetral Agent',
    skills: [],
    system: null,
    tools: [
      {
        type: 'tetral_agent_toolset',
        family: 'gpt',
        configs: [],
        default_config: { enabled: true, permission_policy: { type: 'always_ask' } },
      },
    ],
    type: 'agent',
    version: 1,
  },
  archived_at: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  environment_id: 'env_123',
  metadata: {},
  outcome_evaluations: [],
  resources: [],
  stats: {},
  status: 'idle',
  title: null,
  usage: {
    input_tokens: 12,
    output_tokens: 7,
    server_tool_use: {
      web_fetch_requests: 1,
      web_search_requests: 2,
    },
  },
  vault_ids: [],
  deployment_id: null,
};

describe('Tetral Session SDK contract', () => {
  test('create serializes explicit vault_ids and provider selectors', async () => {
    const captured: { url: string; body: unknown }[] = [];
    const client = new Anthropic({
      apiKey: 'test-tetral-key',
      baseURL: 'https://api.tetral.example',
      fetch: async (url: any, init?: RequestInit) => {
        captured.push({ url: String(url), body: parseJSONBody(init) });
        return jsonResponse(SESSION_RESPONSE);
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

  test('update serializes providers clearing without mutating vault_ids locally', async () => {
    const captured: { url: string; body: unknown }[] = [];
    const client = new Anthropic({
      apiKey: 'test-tetral-key',
      baseURL: 'https://api.tetral.example',
      fetch: async (url: any, init?: RequestInit) => {
        captured.push({ url: String(url), body: parseJSONBody(init) });
        return jsonResponse(SESSION_RESPONSE);
      },
    });

    await client.beta.sessions.update('sesn_123', {
      providers: {},
      agent: {
        approval_mode: 'approve_for_me',
      },
      title: 'updated title',
    });

    expect(captured).toHaveLength(1);
    expect(captured[0]!.url).toBe('https://api.tetral.example/v1/sessions/sesn_123?beta=true');
    expect(captured[0]!.body).toEqual({
      providers: {},
      agent: {
        approval_mode: 'approve_for_me',
      },
      title: 'updated title',
    });
  });

  test('parses session usage.server_tool_use counters from response fixtures', async () => {
    const client = new Anthropic({
      apiKey: 'test-tetral-key',
      baseURL: 'https://api.tetral.example',
      fetch: async () => jsonResponse(SESSION_RESPONSE),
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
      const client = new Anthropic({
        apiKey: 'test-tetral-key',
        baseURL: 'https://api.tetral.example',
        fetch: async (_url: any, init?: RequestInit) => {
          captured.push(parseJSONBody(init));
          return jsonResponse(
            {
              type: 'error',
              error: { type: 'invalid_request_error', message: `${event.type} is unsupported` },
            },
            400,
          );
        },
      });

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
    const updateClearingProviders: SessionUpdateParams = {
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
    expect(updateClearingProviders.providers).toEqual({});
    expect(retainedVaultUpdateCompatibility.vault_ids).toEqual(['vlt_123']);
  });
});

// @ts-expect-error Tetral Session create requires explicit vault_ids, even [].
const createWithoutVaultIDs: SessionCreateParams = {
  agent: 'agent_123',
  environment_id: 'env_123',
};
void createWithoutVaultIDs;
