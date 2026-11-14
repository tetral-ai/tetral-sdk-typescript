import type {
  AgentCreateParams,
  AgentUpdateParams,
  BetaManagedAgentsAgent,
  BetaManagedAgentsTetralAgentToolsetParams,
} from '@tetral-ai/sdk/resources/beta/agents';
import { errorResponse, jsonResponse, parseJSONBody, getHeader } from '../tetral-contract-helpers';
import { contractClient } from '../../../engine-contract/contract-fetch';

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

describe('Tetral Agent SDK contract', () => {
  test('create serializes Tetral approval mode, canonical model IDs, and Claude tool family', async () => {
    const captured: { url: string; beta: string | null; body: unknown }[] = [];
    const client = contractClient({
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
      tools: [{ type: 'tetral_agent_toolset', family: 'claude' }],
    });

    expect(captured).toHaveLength(1);
    expect(captured[0]!.url).toBe('https://api.tetral.example/v1/agents?beta=true');
    expect(captured[0]!.beta).toContain('managed-agents-2026-04-01');
    expect(captured[0]!.body).toMatchObject({
      name: 'Tetral Claude Agent',
      model: 'anthropic/claude-opus-4-8',
      approval_mode: 'ask_for_approval',
      multiagent: null,
      tools: [{ type: 'tetral_agent_toolset', family: 'claude' }],
    });
  });

  test('update serializes Tetral approval mode, model config, and GPT tool family', async () => {
    const captured: { url: string; body: unknown }[] = [];
    const client = contractClient({
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
      tools: [{ type: 'tetral_agent_toolset', family: 'gpt' }],
    });

    expect(captured).toHaveLength(1);
    expect(captured[0]!.url).toBe('https://api.tetral.example/v1/agents/agent_123?beta=true');
    expect(captured[0]!.body).toMatchObject({
      version: 1,
      approval_mode: 'approve_for_me',
      model: { id: 'openai/gpt-5.5', speed: 'standard' },
      tools: [{ type: 'tetral_agent_toolset', family: 'gpt' }],
    });
  });

  test('type smoke covers Tetral additions and retained unsupported compatibility shapes', () => {
    const createWithApproval: AgentCreateParams = {
      name: 'full access agent',
      model: 'anthropic/claude-opus-4-8',
      approval_mode: 'full_access',
      tools: [{ type: 'tetral_agent_toolset', family: 'claude' }],
    };
    const createOmittedApproval: AgentCreateParams = {
      name: 'default approval agent',
      model: 'openai/gpt-5.5',
      multiagent: null,
    };
    const approvedTetralModels: Array<AgentCreateParams['model']> = [
      'openai/gpt-5.5',
      'openai/gpt-5.6-sol',
      'anthropic/claude-opus-4-8',
      'anthropic/claude-fable-5',
      'deepseek/deepseek-v4-pro',
      'moonshotai/kimi-k3',
      'zai/glm-5.2',
    ];
    const updateWithApproval: AgentUpdateParams = {
      version: 1,
      approval_mode: 'approve_for_me',
      tools: [{ type: 'tetral_agent_toolset', family: 'gpt' }],
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
    const bothFamilies: Array<BetaManagedAgentsTetralAgentToolsetParams> = [
      { type: 'tetral_agent_toolset', family: 'claude' },
      { type: 'tetral_agent_toolset', family: 'gpt' },
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
    expect(approvedTetralModels).toHaveLength(7);
    expect(updateWithApproval.approval_mode).toBe('approve_for_me');
    expect(responseShape.approval_mode).toBe('ask_for_approval');
    expect(bothFamilies).toHaveLength(2);
    expect(retainedLegacyToolset.tools?.[0]?.type).toBe('agent_toolset_20260401');
    expect(retainedCustomTool.tools?.[0]?.type).toBe('custom');
  });

  // Each shape is one Engine refuses; the SDK sends it as written and parses the 400.
  const refused: Array<{
    shape: string;
    departure: string;
    params: Pick<AgentCreateParams, 'tools' | 'multiagent'>;
  }> = [
    {
      shape: 'non-null multiagent',
      departure: 'body/multiagent: must be null',
      params: {
        tools: [{ type: 'tetral_agent_toolset', family: 'claude' }],
        multiagent: { type: 'coordinator', agents: [{ type: 'self' }] },
      },
    },
    {
      shape: 'an upstream agent toolset',
      departure: 'body/tools/1: type "agent_toolset_20260401" is not a member of the union',
      params: {
        tools: [{ type: 'tetral_agent_toolset', family: 'claude' }, { type: 'agent_toolset_20260401' }],
      },
    },
    {
      shape: 'a custom tool',
      departure: 'body/tools/1: type "custom" is not a member of the union',
      params: {
        tools: [
          { type: 'tetral_agent_toolset', family: 'claude' },
          {
            type: 'custom',
            name: 'lookup',
            description: 'Look a name up.',
            input_schema: { type: 'object', properties: {} },
          },
        ],
      },
    },
  ];
  // `%s` prints the whole name; `$shape` would quote it.
  test.each(refused.map((row) => [row.shape, row] as const))(
    '%s create is sent as written and the 400 answer is parsed',
    async (_shape, { departure, params }) => {
      const captured: { url: string; body: unknown }[] = [];
      const client = contractClient(
        {
          apiKey: 'test-tetral-key',
          baseURL: 'https://api.tetral.example',
          fetch: async (url: any, init?: RequestInit) => {
            captured.push({ url: String(url), body: parseJSONBody(init) });
            return errorResponse(400, 'invalid_request_error', 'not supported by Tetral');
          },
        },
        { requestOutsideContract: departure },
      );
      const request: AgentCreateParams = {
        name: 'retained compatibility agent',
        model: 'anthropic/claude-opus-4-8',
        ...params,
      };

      await expect(client.beta.agents.create(request)).rejects.toMatchObject({
        status: 400,
        type: 'invalid_request_error',
      });

      expect(captured).toHaveLength(1);
      expect(captured[0]!.url).toBe('https://api.tetral.example/v1/agents?beta=true');
      expect(captured[0]!.body).toEqual(request);
    },
  );
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

const toolsetDeclarationTakesNoConfigs: BetaManagedAgentsTetralAgentToolsetParams = {
  type: 'tetral_agent_toolset',
  family: 'gpt',
  // @ts-expect-error Engine refuses per-tool configs on a Tetral toolset declaration.
  configs: [],
};
void toolsetDeclarationTakesNoConfigs;

const approvedModelOpenAI: AgentCreateParams = { name: 'openai', model: 'openai/gpt-5.5' };
const approvedModelOpenAISol: AgentCreateParams = {
  name: 'openai sol',
  model: 'openai/gpt-5.6-sol',
};
const approvedModelAnthropic: AgentCreateParams = {
  name: 'anthropic',
  model: 'anthropic/claude-opus-4-8',
};
const approvedModelAnthropicFable: AgentCreateParams = {
  name: 'anthropic fable',
  model: 'anthropic/claude-fable-5',
};
const approvedModelDeepSeek: AgentCreateParams = {
  name: 'deepseek',
  model: 'deepseek/deepseek-v4-pro',
};
const approvedModelKimi: AgentCreateParams = {
  name: 'kimi',
  model: 'moonshotai/kimi-k3',
};
const approvedModelZAI: AgentCreateParams = { name: 'zai', model: 'zai/glm-5.2' };
void [
  approvedModelOpenAI,
  approvedModelOpenAISol,
  approvedModelAnthropic,
  approvedModelAnthropicFable,
  approvedModelDeepSeek,
  approvedModelKimi,
  approvedModelZAI,
];

const providerlessModelAcceptedBySDKType: AgentCreateParams = {
  name: 'providerless',
  model: 'claude-opus-4-8',
};
void providerlessModelAcceptedBySDKType;

const unknownProviderModelAcceptedBySDKType: AgentCreateParams = {
  name: 'unapproved',
  model: 'anthropic/claude-sonnet-4-5',
};
void unknownProviderModelAcceptedBySDKType;
