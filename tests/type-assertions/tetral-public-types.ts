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

const credentialAuthVariants: Array<CredentialCreateParams['auth']> = [
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
    access_mode: 'oauth',
    access_token: 'provider-access-token',
    refresh_token: 'provider-refresh-token',
    expires_at: '2099-01-01T00:00:00Z',
    account_id: 'provider-account',
  },
  {
    type: 'environment_variable',
    networking: { type: 'unrestricted' },
    secret_name: 'MODEL_PROVIDER_API_KEY',
    secret_value: 'provider-secret-value',
  },
];
void credentialAuthVariants;

const unsupportedCredentialAuth: CredentialCreateParams['auth'] = {
  // @ts-expect-error Credential auth union is closed to the supported and retained variants.
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

const skillCannotBeModelFacingTool: AgentCreateParams = {
  name: 'invalid skill tool',
  model: 'anthropic/claude-opus-4-8',
  tools: [
    // @ts-expect-error Skills are Agent skill refs, not entries in the tools array.
    { type: 'skill', skill_id: 'skill_123' },
  ],
};
void skillCannotBeModelFacingTool;

type ComputerEntry = import('@tetral-ai/sdk/resources/beta/sessions/computers').BetaCloudComputerParams;
type UserComputerEntry = import('@tetral-ai/sdk/resources/beta/sessions/computers').BetaUserComputerParams;
type SessionDriveBinding = NonNullable<SessionCreateParams['drives']>[number];
type SessionObject = import('@tetral-ai/sdk/resources/beta/sessions').BetaManagedAgentsSession;

const cloudComputer: ComputerEntry = {
  environment_id: 'env_linux_py',
  repositories: [{ url: 'https://github.com/acme/backend', authorization_token: 'test-github-token' }],
};
const userComputer: UserComputerEntry = {
  instance_id: 'inst_mac',
  working_directory: '/Users/me/code/shop',
  networking: { type: 'blocked' },
  drive_exclude: [{ drive_id: 'drive_team_ai', paths: ['datasets/'] }],
};
const driveBindings: Array<SessionDriveBinding> = [
  { drive_id: 'drive_xw', access: 'read_write' },
  { drive_id: 'drive_team_ai', access: 'read_write' },
  { drive_id: 'drive_company', access: 'read_only' },
];
const sessionWithComputers: SessionCreateParams = {
  agent: 'agent_123',
  vault_ids: [],
  computers: [cloudComputer, userComputer],
  drives: driveBindings,
};
const sessionWithEnvironment: SessionCreateParams = {
  agent: 'agent_123',
  vault_ids: [],
  environment_id: 'env_linux_py',
  resources: [githubResource],
};
const sessionComputers: Pick<SessionObject, 'computers' | 'environment_id'> = {
  environment_id: '',
  computers: [
    {
      id: 'comp_cloud',
      kind: 'cloud',
      environment_id: 'env_linux_py',
      instance_id: null,
      current_instance_id: null,
      working_directory: '/workspace',
      cwd: null,
      networking: { type: 'unrestricted' },
      repositories: [
        {
          id: 'sesrsc_backend',
          url: 'https://github.com/acme/backend',
          checkout: null,
          mount_path: null,
          path: '/workspace/backend',
        },
      ],
      drive_exclude: [],
      association_state: 'attached',
      execution_state: 'waiting',
      connection_id: null,
      binding_id: null,
      error: null,
    },
    {
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
    },
  ],
};
void [sessionWithComputers, sessionWithEnvironment, sessionComputers];

// @ts-expect-error A user computer requires its working directory.
const userComputerWithoutDirectory: UserComputerEntry = { instance_id: 'inst_mac' };
const userComputerWithRepositories: UserComputerEntry = {
  instance_id: 'inst_mac',
  working_directory: '/Users/me/code/shop',
  // @ts-expect-error Repositories belong to cloud computers only.
  repositories: [{ url: 'https://github.com/acme/backend', authorization_token: 'test-github-token' }],
};
const userComputerWithLimitedNetwork: UserComputerEntry = {
  instance_id: 'inst_mac',
  working_directory: '/Users/me/code/shop',
  // @ts-expect-error A user computer's networking is blocked or unrestricted.
  networking: { type: 'limited' },
};
const cloudComputerWithNetworking: ComputerEntry = {
  environment_id: 'env_linux_py',
  // @ts-expect-error A cloud computer takes its Environment's networking.
  networking: { type: 'blocked' },
};
const computerWithBothIdentities: SessionCreateParams = {
  agent: 'agent_123',
  vault_ids: [],
  // @ts-expect-error A computer names either an Environment or an instance.
  computers: [{ environment_id: 'env_linux_py', instance_id: 'inst_mac', working_directory: '/workspace' }],
};
const computerWithNeitherIdentity: SessionCreateParams = {
  agent: 'agent_123',
  vault_ids: [],
  // @ts-expect-error A computer names an Environment or an instance.
  computers: [{ working_directory: '/workspace' }],
};
const repositoryWithoutToken: ComputerEntry = {
  environment_id: 'env_linux_py',
  // @ts-expect-error A computer's repository requires its authorization token.
  repositories: [{ url: 'https://github.com/acme/backend' }],
};
const excludeWithoutPaths: ComputerEntry = {
  environment_id: 'env_linux_py',
  // @ts-expect-error A drive exclusion lists its paths.
  drive_exclude: [{ drive_id: 'drive_team_ai' }],
};
// @ts-expect-error A binding's access is read_only or read_write.
const bindingWithWriteAccess: SessionDriveBinding = { drive_id: 'drive_team_ai', access: 'write' };
// @ts-expect-error resources go only with the top-level environment_id.
const resourcesBesideComputers: SessionCreateParams = {
  agent: 'agent_123',
  vault_ids: [],
  computers: [cloudComputer],
  resources: [githubResource],
};
// @ts-expect-error computers never go with the top-level environment_id.
const computersBesideEnvironment: SessionCreateParams = {
  agent: 'agent_123',
  vault_ids: [],
  environment_id: 'env_linux_py',
  computers: [cloudComputer],
};
// @ts-expect-error resources require the top-level environment_id.
const resourcesWithoutEnvironment: SessionCreateParams = {
  agent: 'agent_123',
  vault_ids: [],
  resources: [githubResource],
};
void [
  userComputerWithoutDirectory,
  userComputerWithRepositories,
  userComputerWithLimitedNetwork,
  cloudComputerWithNetworking,
  computerWithBothIdentities,
  computerWithNeitherIdentity,
  repositoryWithoutToken,
  excludeWithoutPaths,
  bindingWithWriteAccess,
  resourcesBesideComputers,
  computersBesideEnvironment,
  resourcesWithoutEnvironment,
];

declare const planFile: import('@tetral-ai/sdk/uploads').Uploadable;
const uploadOfNewFile: import('@tetral-ai/sdk/resources/beta/drives').DriveFileUploadParams = {
  path: 'notes/plan.md',
  file: planFile,
  must_not_exist: true,
};
void uploadOfNewFile;
const uploadWithBothPreconditions: import('@tetral-ai/sdk/resources/beta/drives').DriveFileUploadParams = {
  path: 'notes/plan.md',
  file: planFile,
  expected_content_sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  // @ts-expect-error An upload takes at most one precondition.
  must_not_exist: true,
};
void uploadWithBothPreconditions;
