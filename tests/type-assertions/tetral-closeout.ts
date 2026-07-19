import Anthropic from '@tetral-ai/sdk';
import type { AgentCreateParams, BetaManagedAgentsModel } from '@tetral-ai/sdk/resources/beta/agents';
import type { SessionCreateParams } from '@tetral-ai/sdk/resources/beta/sessions';
import type { CredentialCreateParams } from '@tetral-ai/sdk/resources/beta/vaults';

type ResourceUpdateParams = import('@tetral-ai/sdk/resources/beta/sessions/resources').ResourceUpdateParams;
const resourceUpdateParamsProof: ResourceUpdateParams = {
  session_id: 'sesn_123',
  authorization_token: 'test-github-token',
};
void resourceUpdateParamsProof;

type SessionResourceParam = NonNullable<SessionCreateParams['resources']>[number];

const githubResource: SessionResourceParam = {
  type: 'github_repository',
  url: 'https://github.com/tetral-ai/example',
  authorization_token: 'test-github-token',
};
void githubResource;

const githubResourceWithToken = {
  type: 'github_repository',
  url: 'https://github.com/tetral-ai/example',
  authorization_token: 'test-github-token',
} satisfies SessionResourceParam;
void githubResourceWithToken;

const client = new Anthropic({ apiKey: 'test-tetral-key' });
client.beta.sessions.resources.update;

const approvedModels: Array<BetaManagedAgentsModel> = [
  'openai/gpt-5.5',
  'openai/gpt-5.6-sol',
  'anthropic/claude-opus-4-8',
  'anthropic/claude-fable-5',
  'deepseek/deepseek-v4-pro',
  'moonshotai/kimi-k3',
  'zai/glm-5.2',
];
void approvedModels;

const approvedAgent: AgentCreateParams = {
  name: 'approved model',
  model: 'zai/glm-5.2',
};
void approvedAgent;

const providerlessModelAcceptedBySDKType: BetaManagedAgentsModel = 'claude-opus-4-8';
void providerlessModelAcceptedBySDKType;

const unknownModelAcceptedBySDKType: BetaManagedAgentsModel = 'anthropic/claude-sonnet-4-5';
void unknownModelAcceptedBySDKType;

const supportedCredentialAuth: Array<CredentialCreateParams['auth']> = [
  {
    type: 'mcp_oauth',
    mcp_server_url: 'https://mcp.example/sse',
    access_token: 'mcp-access-token',
  },
  {
    type: 'static_bearer',
    mcp_server_url: 'https://mcp.example/sse',
    token: 'static-bearer-token',
  },
  {
    type: 'provider_api_key',
    provider_id: 'anthropic',
    access_mode: 'model_inference',
    token: 'provider-api-key',
  },
  {
    type: 'provider_oauth',
    provider_id: 'openai',
    access_mode: 'model_inference',
    access_token: 'provider-access-token',
  },
  {
    type: 'environment_variable',
    networking: { type: 'unrestricted' },
    secret_name: 'MODEL_PROVIDER_API_KEY',
    secret_value: 'provider-secret-value',
  },
];
void supportedCredentialAuth;

const unsupportedCredentialAuth: CredentialCreateParams['auth'] = {
  // @ts-expect-error Credential auth union is closed to the planned supported and retained variants.
  type: 'shell_command',
};
void unsupportedCredentialAuth;

const retainedAgentWithOverridesCreate: SessionCreateParams = {
  environment_id: 'env_123',
  vault_ids: [],
  // @ts-expect-error agent_with_overrides is retained-unsupported; session create accepts only the plain agent forms.
  agent: { type: 'agent_with_overrides', id: 'agent_123' },
};
void retainedAgentWithOverridesCreate;
