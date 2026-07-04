import Anthropic from '@tetral-ai/sdk';
import type {
  AgentCreateParams,
  AgentUpdateParams,
  BetaManagedAgentsAgent,
  BetaManagedAgentsTetralAgentToolsetParams,
  BetaManagedAgentsTetralClaudeAgentToolsetParams,
  BetaManagedAgentsTetralGPTAgentToolsetParams,
} from '@tetral-ai/sdk/resources/beta/agents';

const AGENT_RESPONSE = {
  id: 'agent_123',
  archived_at: null,
  created_at: '2026-01-01T00:00:00Z',
  description: null,
  mcp_servers: [],
  approval_mode: 'ask_for_approval',
  metadata: {},
  model: { id: 'anthropic/claude-opus-4-8' },
  multiagent: null,
  name: 'Tetral Agent',
  skills: [],
  system: null,
  tools: [
    {
      type: 'tetral_agent_toolset',
      family: 'claude',
      configs: [],
      default_config: { enabled: true, permission_policy: { type: 'always_ask' } },
    },
  ],
  type: 'agent',
  updated_at: '2026-01-01T00:00:00Z',
  version: 1,
};

function jsonResponse(body: object, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function getHeader(init: RequestInit | undefined, name: string): string | null {
  if (!init?.headers) return null;
  if (init.headers instanceof Headers) return init.headers.get(name);
  if (Array.isArray(init.headers)) {
    const entry = init.headers.find(([k]) => k?.toLowerCase() === name.toLowerCase());
    return entry?.[1] ?? null;
  }
  return (init.headers as Record<string, string>)[name] ?? null;
}

function parseJSONBody(init: RequestInit | undefined): unknown {
  if (typeof init?.body !== 'string') {
    throw new Error(`Expected JSON string body, got ${typeof init?.body}`);
  }
  return JSON.parse(init.body);
}

describe('Tetral Agent SDK contract', () => {
  test('create serializes Tetral approval mode, canonical model IDs, and Claude tool family', async () => {
    const captured: { url: string; beta: string | null; body: unknown }[] = [];
    const client = new Anthropic({
      apiKey: 'test-tetral-key',
      baseURL: 'https://api.tetral.example',
      fetch: async (url: any, init?: RequestInit) => {
        captured.push({
          url: String(url),
          beta: getHeader(init, 'anthropic-beta'),
          body: parseJSONBody(init),
        });
        return jsonResponse(AGENT_RESPONSE);
      },
    });

    await client.beta.agents.create({
      name: 'Tetral Claude Agent',
      model: 'anthropic/claude-opus-4-8',
      approval_mode: 'ask_for_approval',
      multiagent: null,
      tools: [
        {
          type: 'tetral_agent_toolset',
          family: 'claude',
          configs: [
            { name: 'bash', enabled: true, permission_policy: { type: 'always_ask' } },
            { name: 'web', enabled: true },
          ],
        },
      ],
    });

    expect(captured).toHaveLength(1);
    expect(captured[0]!.url).toBe('https://api.tetral.example/v1/agents?beta=true');
    expect(captured[0]!.beta).toContain('managed-agents-2026-04-01');
    expect(captured[0]!.body).toMatchObject({
      name: 'Tetral Claude Agent',
      model: 'anthropic/claude-opus-4-8',
      approval_mode: 'ask_for_approval',
      multiagent: null,
      tools: [
        {
          type: 'tetral_agent_toolset',
          family: 'claude',
          configs: [{ name: 'bash' }, { name: 'web' }],
        },
      ],
    });
  });

  test('update serializes Tetral approval mode, model config, and GPT tool family', async () => {
    const captured: { url: string; body: unknown }[] = [];
    const client = new Anthropic({
      apiKey: 'test-tetral-key',
      baseURL: 'https://api.tetral.example',
      fetch: async (url: any, init?: RequestInit) => {
        captured.push({ url: String(url), body: parseJSONBody(init) });
        return jsonResponse({ ...AGENT_RESPONSE, approval_mode: 'approve_for_me', version: 2 });
      },
    });

    await client.beta.agents.update('agent_123', {
      version: 1,
      approval_mode: 'approve_for_me',
      model: { id: 'openai/gpt-5.5', speed: 'standard' },
      tools: [
        {
          type: 'tetral_agent_toolset',
          family: 'gpt',
          configs: [{ name: 'exec_command' }, { name: 'subagent' }],
        },
      ],
    });

    expect(captured).toHaveLength(1);
    expect(captured[0]!.url).toBe('https://api.tetral.example/v1/agents/agent_123?beta=true');
    expect(captured[0]!.body).toMatchObject({
      version: 1,
      approval_mode: 'approve_for_me',
      model: { id: 'openai/gpt-5.5', speed: 'standard' },
      tools: [
        {
          type: 'tetral_agent_toolset',
          family: 'gpt',
          configs: [{ name: 'exec_command' }, { name: 'subagent' }],
        },
      ],
    });
  });

  test('type smoke covers Tetral additions and retained unsupported compatibility shapes', () => {
    const createWithApproval: AgentCreateParams = {
      name: 'full access agent',
      model: 'anthropic/claude-opus-4-8',
      approval_mode: 'full_access',
      tools: [{ type: 'tetral_agent_toolset', family: 'claude', configs: [{ name: 'memory' }] }],
    };
    const createOmittedApproval: AgentCreateParams = {
      name: 'default approval agent',
      model: 'openai/gpt-5.5',
      multiagent: null,
    };
    const approvedTetralModels: Array<AgentCreateParams['model']> = [
      'openai/gpt-5.5',
      'anthropic/claude-opus-4-8',
      'deepseek/deepseek-v4-pro',
      'moonshotai/kimi-k2.7-code',
      'zai/glm-5.2',
    ];
    const updateWithApproval: AgentUpdateParams = {
      version: 1,
      approval_mode: 'approve_for_me',
      tools: [{ type: 'tetral_agent_toolset', family: 'gpt', configs: [{ name: 'view_image' }] }],
    };
    const responseShape: Pick<BetaManagedAgentsAgent, 'approval_mode' | 'multiagent' | 'tools'> = {
      approval_mode: 'ask_for_approval',
      multiagent: null,
      tools: [
        {
          type: 'tetral_agent_toolset',
          family: 'claude',
          configs: [],
          default_config: { enabled: true, permission_policy: { type: 'always_ask' } },
        },
      ],
    };
    const platformToolsInBothFamilies: Array<BetaManagedAgentsTetralAgentToolsetParams> = [
      { type: 'tetral_agent_toolset', family: 'claude', configs: [{ name: 'web' }, { name: 'subagent' }] },
      { type: 'tetral_agent_toolset', family: 'gpt', configs: [{ name: 'memory' }, { name: 'subagent' }] },
    ];

    const retainedLegacyToolset: AgentCreateParams = {
      name: 'legacy compatibility agent',
      model: 'anthropic/claude-opus-4-8',
      tools: [{ type: 'agent_toolset_20260401' }],
    };
    const retainedCustomTool: AgentCreateParams = {
      name: 'custom compatibility agent',
      model: 'anthropic/claude-opus-4-8',
      tools: [
        {
          type: 'custom',
          name: 'lookup',
          description: 'Retained unsupported compatibility shape.',
          input_schema: { type: 'object' },
        },
      ],
    };

    expect(createWithApproval.approval_mode).toBe('full_access');
    expect(createOmittedApproval.multiagent).toBeNull();
    expect(approvedTetralModels).toHaveLength(5);
    expect(updateWithApproval.approval_mode).toBe('approve_for_me');
    expect(responseShape.approval_mode).toBe('ask_for_approval');
    expect(platformToolsInBothFamilies).toHaveLength(2);
    expect(retainedLegacyToolset.tools?.[0]?.type).toBe('agent_toolset_20260401');
    expect(retainedCustomTool.tools?.[0]?.type).toBe('custom');
  });

  test('non-null multiagent create reaches the mock server and parses backend 400', async () => {
    const captured: { url: string; body: unknown }[] = [];
    const client = new Anthropic({
      apiKey: 'test-tetral-key',
      baseURL: 'https://api.tetral.example',
      fetch: async (url: any, init?: RequestInit) => {
        captured.push({ url: String(url), body: parseJSONBody(init) });
        return jsonResponse(
          {
            type: 'error',
            error: {
              type: 'invalid_request_error',
              message: 'multiagent is not supported by Tetral',
            },
          },
          400,
        );
      },
    });

    await expect(
      client.beta.agents.create({
        name: 'retained multiagent compatibility agent',
        model: 'anthropic/claude-opus-4-8',
        multiagent: { type: 'coordinator', agents: [{ type: 'self' }] },
      }),
    ).rejects.toMatchObject({
      status: 400,
      type: 'invalid_request_error',
    });

    expect(captured).toHaveLength(1);
    expect(captured[0]!.url).toBe('https://api.tetral.example/v1/agents?beta=true');
    expect(captured[0]!.body).toMatchObject({
      name: 'retained multiagent compatibility agent',
      model: 'anthropic/claude-opus-4-8',
      multiagent: { type: 'coordinator', agents: [{ type: 'self' }] },
    });
  });
});

const createApprovalCannotBeNull: AgentCreateParams = {
  name: 'invalid approval',
  model: 'anthropic/claude-opus-4-8',
  // @ts-expect-error approval_mode does not accept null.
  approval_mode: null,
};
void createApprovalCannotBeNull;

const updateApprovalCannotBeNull: AgentUpdateParams = {
  version: 1,
  // @ts-expect-error approval_mode does not accept null.
  approval_mode: null,
};
void updateApprovalCannotBeNull;

// @ts-expect-error family is required for tetral_agent_toolset.
const missingTetralFamily: BetaManagedAgentsTetralAgentToolsetParams = { type: 'tetral_agent_toolset' };
void missingTetralFamily;

const gptRejectsClaudeOnlyTool: BetaManagedAgentsTetralGPTAgentToolsetParams = {
  type: 'tetral_agent_toolset',
  family: 'gpt',
  configs: [
    {
      // @ts-expect-error GPT family does not accept Claude-only built-ins.
      name: 'bash',
    },
  ],
};
void gptRejectsClaudeOnlyTool;

const claudeRejectsGPTOnlyTool: BetaManagedAgentsTetralClaudeAgentToolsetParams = {
  type: 'tetral_agent_toolset',
  family: 'claude',
  configs: [
    {
      // @ts-expect-error Claude family does not accept GPT-only built-ins.
      name: 'exec_command',
    },
  ],
};
void claudeRejectsGPTOnlyTool;

const approvedModelOpenAI: AgentCreateParams = { name: 'openai', model: 'openai/gpt-5.5' };
const approvedModelAnthropic: AgentCreateParams = {
  name: 'anthropic',
  model: 'anthropic/claude-opus-4-8',
};
const approvedModelDeepSeek: AgentCreateParams = {
  name: 'deepseek',
  model: 'deepseek/deepseek-v4-pro',
};
const approvedModelKimi: AgentCreateParams = {
  name: 'kimi',
  model: 'moonshotai/kimi-k2.7-code',
};
const approvedModelZAI: AgentCreateParams = { name: 'zai', model: 'zai/glm-5.2' };
void [
  approvedModelOpenAI,
  approvedModelAnthropic,
  approvedModelDeepSeek,
  approvedModelKimi,
  approvedModelZAI,
];

const providerlessModelRejected: AgentCreateParams = {
  name: 'providerless',
  // @ts-expect-error Tetral model IDs must be provider/model.
  model: 'claude-opus-4-8',
};
void providerlessModelRejected;

const unapprovedProviderModelRejected: AgentCreateParams = {
  name: 'unapproved',
  // @ts-expect-error Only the five approved Tetral model IDs are accepted.
  model: 'anthropic/claude-sonnet-4-5',
};
void unapprovedProviderModelRejected;
