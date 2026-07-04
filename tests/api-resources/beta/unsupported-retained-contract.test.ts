import Anthropic from '@tetral-ai/sdk';
import type {
  AgentCreateParams,
  BetaManagedAgentsAgentToolset20260401Params,
  BetaManagedAgentsCustomToolParams,
} from '@tetral-ai/sdk/resources/beta/agents';
import type {
  DeploymentCreateParams,
  Deployments as DeploymentsResource,
} from '@tetral-ai/sdk/resources/beta/deployments';
import type { DeploymentRuns } from '@tetral-ai/sdk/resources/beta/deployment-runs';
import type { Messages } from '@tetral-ai/sdk/resources/beta/messages/messages';
import type { Batches } from '@tetral-ai/sdk/resources/beta/messages/batches';
import type { Models } from '@tetral-ai/sdk/resources/beta/models';
import type { BetaManagedAgentsEventParams } from '@tetral-ai/sdk/resources/beta/sessions';
import type { UserProfiles } from '@tetral-ai/sdk/resources/beta/user-profiles';
import type { Webhooks } from '@tetral-ai/sdk/resources/beta/webhooks';

interface CapturedRequest {
  url: string;
  method: string | undefined;
  body: unknown;
}

function jsonResponse(body: object, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'request-id': 'req_123' },
  });
}

function parseMaybeJSONBody(init: RequestInit | undefined): unknown {
  if (init?.body == null) return undefined;
  if (typeof init.body !== 'string') {
    throw new Error(`Expected JSON string body, got ${typeof init.body}`);
  }
  return JSON.parse(init.body);
}

function makeUnsupportedClient(captured: CapturedRequest[]): Anthropic {
  return new Anthropic({
    apiKey: 'test-tetral-key',
    baseURL: 'https://api.tetral.example',
    fetch: async (url: any, init?: RequestInit) => {
      captured.push({
        url: String(url),
        method: init?.method,
        body: parseMaybeJSONBody(init),
      });
      return jsonResponse(
        {
          type: 'error',
          error: { type: 'invalid_request_error', message: 'Tetral deferred compatibility surface' },
        },
        400,
      );
    },
  });
}

describe('Tetral retained unsupported SDK surface contract', () => {
  test('ordinary generated unsupported resources keep request paths and parse backend 400 errors', async () => {
    const captured: CapturedRequest[] = [];
    const client = makeUnsupportedClient(captured);

    const deployment: DeploymentCreateParams = {
      agent: 'agent_123',
      environment_id: 'env_123',
      initial_events: [{ type: 'user.message', content: [{ type: 'text', text: 'start' }] }],
      name: 'retained deployment',
      vault_ids: [],
    };

    await expect(client.beta.deployments.create(deployment)).rejects.toMatchObject({
      status: 400,
      type: 'invalid_request_error',
    });
    await expect(client.beta.deploymentRuns.retrieve('drun_123')).rejects.toMatchObject({
      status: 400,
      type: 'invalid_request_error',
    });
    await expect(client.beta.models.retrieve('model_123')).rejects.toMatchObject({
      status: 400,
      type: 'invalid_request_error',
    });
    await expect(
      client.beta.messages.create({
        max_tokens: 1,
        model: 'anthropic/claude-opus-4-8',
        messages: [{ role: 'user', content: 'hello' }],
      }),
    ).rejects.toMatchObject({
      status: 400,
      type: 'invalid_request_error',
    });
    await expect(
      client.beta.messages.batches.create({
        requests: [
          {
            custom_id: 'req_1',
            params: {
              max_tokens: 1,
              model: 'anthropic/claude-opus-4-8',
              messages: [{ role: 'user', content: 'hello' }],
            },
          },
        ],
      }),
    ).rejects.toMatchObject({
      status: 400,
      type: 'invalid_request_error',
    });
    await expect(
      client.beta.userProfiles.create({ external_id: 'user_123', relationship: 'external' }),
    ).rejects.toMatchObject({
      status: 400,
      type: 'invalid_request_error',
    });

    expect(captured.map((r) => [r.method, r.url])).toEqual([
      ['POST', 'https://api.tetral.example/v1/deployments?beta=true'],
      ['GET', 'https://api.tetral.example/v1/deployment_runs/drun_123?beta=true'],
      ['GET', 'https://api.tetral.example/v1/models/model_123?beta=true'],
      ['POST', 'https://api.tetral.example/v1/messages?beta=true'],
      ['POST', 'https://api.tetral.example/v1/messages/batches?beta=true'],
      ['POST', 'https://api.tetral.example/v1/user_profiles?beta=true'],
    ]);
    expect(captured[0]!.body).toEqual(deployment);
    expect(captured[3]!.body).toMatchObject({
      model: 'anthropic/claude-opus-4-8',
      messages: [{ role: 'user', content: 'hello' }],
    });
    expect(captured).toHaveLength(6);
  });

  test('retained unsupported resources and helper surfaces remain importable', () => {
    const client = new Anthropic({ apiKey: 'test-tetral-key', baseURL: 'https://api.tetral.example' });
    const retainedResources: [
      DeploymentsResource,
      DeploymentRuns,
      Models,
      Messages,
      Batches,
      UserProfiles,
      Webhooks,
    ] = [
      client.beta.deployments,
      client.beta.deploymentRuns,
      client.beta.models,
      client.beta.messages,
      client.beta.messages.batches,
      client.beta.userProfiles,
      client.beta.webhooks,
    ];

    expect(retainedResources).toHaveLength(7);
    expect(
      client.beta.webhooks.unwrap(JSON.stringify({ type: 'event', data: {} }), {
        headers: undefined as never,
      }),
    ).toEqual({ type: 'event', data: {} });
  });

  test('type smoke covers retained unsupported params and event variants', () => {
    const retainedMultiagent: AgentCreateParams = {
      name: 'coordinator compatibility agent',
      model: 'anthropic/claude-opus-4-8',
      multiagent: { type: 'coordinator', agents: [{ type: 'self' }] },
    };
    const retainedLegacyToolset: BetaManagedAgentsAgentToolset20260401Params = {
      type: 'agent_toolset_20260401',
    };
    const retainedCustomTool: BetaManagedAgentsCustomToolParams = {
      type: 'custom',
      name: 'lookup',
      description: 'Retained unsupported compatibility shape.',
      input_schema: { type: 'object' },
    };
    const createWithRetainedTools: AgentCreateParams = {
      name: 'retained tool compatibility agent',
      model: 'anthropic/claude-opus-4-8',
      tools: [retainedLegacyToolset, retainedCustomTool],
    };
    const retainedUnsupportedEvents = [
      { type: 'user.tool_result', tool_use_id: 'toolu_123', content: [{ type: 'text', text: 'ok' }] },
      {
        type: 'user.custom_tool_result',
        custom_tool_use_id: 'ctu_123',
        content: [{ type: 'text', text: 'ok' }],
      },
      {
        type: 'user.define_outcome',
        description: 'complete the task',
        rubric: { type: 'text', content: 'The task is complete.' },
      },
      { type: 'system.message', content: [{ type: 'text', text: 'internal context' }] },
    ] satisfies Array<BetaManagedAgentsEventParams>;

    expect(retainedMultiagent.multiagent).toMatchObject({ type: 'coordinator' });
    expect(createWithRetainedTools.tools?.map((tool) => tool.type)).toEqual([
      'agent_toolset_20260401',
      'custom',
    ]);
    expect(retainedUnsupportedEvents.map((event) => event.type)).toEqual([
      'user.tool_result',
      'user.custom_tool_result',
      'user.define_outcome',
      'system.message',
    ]);
  });
});
