import Anthropic from '@tetral-ai/sdk';
import type { AgentCreateParams, BetaManagedAgentsModel } from '@tetral-ai/sdk/resources/beta/agents';
import type { SessionCreateParams } from '@tetral-ai/sdk/resources/beta/sessions';
import type { CredentialCreateParams } from '@tetral-ai/sdk/resources/beta/vaults';

type RemovedResourceUpdateParams =
  // @ts-expect-error ResourceUpdateParams is intentionally not exported by the Tetral fork.
  import('@tetral-ai/sdk/resources/beta/sessions/resources').ResourceUpdateParams;
const removedResourceUpdateParamsProof: RemovedResourceUpdateParams | null = null;
void removedResourceUpdateParamsProof;

type SessionResourceParam = NonNullable<SessionCreateParams['resources']>[number];

const githubResource: SessionResourceParam = {
  type: 'github_repository',
  url: 'https://github.com/tetral-ai/example',
};
void githubResource;

const githubResourceWithToken = {
  type: 'github_repository',
  url: 'https://github.com/tetral-ai/example',
  // @ts-expect-error Tetral GitHub session resources use Vault credentials, not inline tokens.
  authorization_token: 'test-github-token',
} satisfies SessionResourceParam;
void githubResourceWithToken;

const client = new Anthropic({ apiKey: 'test-tetral-key' });
// @ts-expect-error resources.update was removed from the Tetral fork.
client.beta.sessions.resources.update;

const approvedModels: Array<BetaManagedAgentsModel> = [
  'openai/gpt-5.5',
  'anthropic/claude-opus-4-8',
  'deepseek/deepseek-v4-pro',
  'moonshotai/kimi-k2.7-code',
  'zai/glm-5.2',
];
void approvedModels;

const approvedAgent: AgentCreateParams = {
  name: 'approved model',
  model: 'zai/glm-5.2',
};
void approvedAgent;

// @ts-expect-error Providerless model IDs are not accepted.
const providerlessModel: BetaManagedAgentsModel = 'claude-opus-4-8';
void providerlessModel;

// @ts-expect-error Models outside the approved five-ID union are not accepted.
const unapprovedModel: BetaManagedAgentsModel = 'anthropic/claude-sonnet-4-5';
void unapprovedModel;

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
