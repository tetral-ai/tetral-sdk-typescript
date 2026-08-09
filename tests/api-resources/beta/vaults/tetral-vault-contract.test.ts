import Anthropic from '@tetral-ai/sdk';
import type {
  BetaManagedAgentsCredential,
  BetaManagedAgentsMCPOAuthCreateParams,
  BetaManagedAgentsMCPOAuthUpdateParams,
  BetaManagedAgentsProviderAPIKeyAuthResponse,
  BetaManagedAgentsProviderAPIKeyCreateParams,
  BetaManagedAgentsProviderAPIKeyUpdateParams,
  BetaManagedAgentsProviderOAuthAuthResponse,
  BetaManagedAgentsProviderOAuthCreateParams,
  BetaManagedAgentsProviderOAuthUpdateParams,
  BetaManagedAgentsStaticBearerCreateParams,
  BetaManagedAgentsStaticBearerUpdateParams,
  CredentialCreateParams,
  CredentialUpdateParams,
} from '@tetral-ai/sdk/resources/beta/vaults';
import type { SessionCreateParams } from '@tetral-ai/sdk/resources/beta/sessions';
import { jsonResponse, parseJSONBody } from '../tetral-contract-helpers';

const PROVIDER_API_KEY_CREDENTIAL_RESPONSE: BetaManagedAgentsCredential = {
  id: 'vcrd_provider_api_key',
  archived_at: null,
  auth: {
    type: 'provider_api_key',
    provider_id: 'anthropic',
    access_mode: 'model_inference',
  },
  created_at: '2026-01-01T00:00:00Z',
  display_name: 'anthropic provider key',
  metadata: {},
  type: 'vault_credential',
  updated_at: '2026-01-01T00:00:00Z',
  vault_id: 'vlt_123',
};

const PROVIDER_OAUTH_CREDENTIAL_RESPONSE: BetaManagedAgentsCredential = {
  id: 'vcrd_provider_oauth',
  archived_at: null,
  auth: {
    type: 'provider_oauth',
    provider_id: 'openai',
    access_mode: 'oauth',
    account_id: 'acct_123',
    expires_at: '2026-01-01T01:00:00Z',
    has_refresh_token: true,
  },
  created_at: '2026-01-01T00:00:00Z',
  display_name: 'openai oauth',
  metadata: {},
  type: 'vault_credential',
  updated_at: '2026-01-01T00:00:00Z',
  vault_id: 'vlt_123',
};

describe('Tetral Vault credential SDK contract', () => {
  test('create serializes provider_api_key secrets and parses redacted provider metadata', async () => {
    const captured: { url: string; body: unknown }[] = [];
    const client = new Anthropic({
      apiKey: 'test-tetral-key',
      baseURL: 'https://api.tetral.example',
      fetch: async (url: any, init?: RequestInit) => {
        captured.push({ url: String(url), body: parseJSONBody(init) });
        return jsonResponse(PROVIDER_API_KEY_CREDENTIAL_RESPONSE);
      },
    });

    const credential = await client.beta.vaults.credentials.create('vlt_123', {
      display_name: 'anthropic provider key',
      auth: {
        type: 'provider_api_key',
        provider_id: 'anthropic',
        access_mode: 'model_inference',
        token: 'sk-provider-secret',
      },
    });

    expect(captured).toHaveLength(1);
    expect(captured[0]!.url).toBe('https://api.tetral.example/v1/vaults/vlt_123/credentials?beta=true');
    expect(captured[0]!.body).toMatchObject({
      display_name: 'anthropic provider key',
      auth: {
        type: 'provider_api_key',
        provider_id: 'anthropic',
        access_mode: 'model_inference',
        token: 'sk-provider-secret',
      },
    });
    expect(credential.auth).toEqual({
      type: 'provider_api_key',
      provider_id: 'anthropic',
      access_mode: 'model_inference',
    });
    expect('token' in credential.auth).toBe(false);
  });

  test('update serializes provider_oauth rotation fields and parses redacted provider metadata', async () => {
    const captured: { url: string; body: unknown }[] = [];
    const client = new Anthropic({
      apiKey: 'test-tetral-key',
      baseURL: 'https://api.tetral.example',
      fetch: async (url: any, init?: RequestInit) => {
        captured.push({ url: String(url), body: parseJSONBody(init) });
        return jsonResponse(PROVIDER_OAUTH_CREDENTIAL_RESPONSE);
      },
    });

    const credential = await client.beta.vaults.credentials.update('vcrd_provider_oauth', {
      vault_id: 'vlt_123',
      auth: {
        type: 'provider_oauth',
        access_token: 'access-secret',
        refresh_token: 'refresh-secret',
        expires_at: '2026-01-01T01:00:00Z',
      },
    });

    expect(captured).toHaveLength(1);
    expect(captured[0]!.url).toBe(
      'https://api.tetral.example/v1/vaults/vlt_123/credentials/vcrd_provider_oauth?beta=true',
    );
    expect(captured[0]!.body).toEqual({
      auth: {
        type: 'provider_oauth',
        access_token: 'access-secret',
        refresh_token: 'refresh-secret',
        expires_at: '2026-01-01T01:00:00Z',
      },
    });
    expect(credential.auth).toMatchObject({
      type: 'provider_oauth',
      provider_id: 'openai',
      access_mode: 'oauth',
      has_refresh_token: true,
      account_id: 'acct_123',
    });
    expect('access_token' in credential.auth).toBe(false);
    expect('refresh_token' in credential.auth).toBe(false);
  });

  test('environment_variable credential create reaches the mock server and parses backend 400', async () => {
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
              message: 'environment_variable credentials are not supported by Tetral',
            },
          },
          400,
        );
      },
    });

    await expect(
      client.beta.vaults.credentials.create('vlt_123', {
        display_name: 'retained unsupported env credential',
        auth: {
          type: 'environment_variable',
          networking: { type: 'unrestricted' },
          secret_name: 'MODEL_PROVIDER_API_KEY',
          secret_value: 'provider-secret-value',
        },
      }),
    ).rejects.toMatchObject({
      status: 400,
      type: 'invalid_request_error',
    });

    expect(captured).toEqual([
      {
        url: 'https://api.tetral.example/v1/vaults/vlt_123/credentials?beta=true',
        body: {
          display_name: 'retained unsupported env credential',
          auth: {
            type: 'environment_variable',
            networking: { type: 'unrestricted' },
            secret_name: 'MODEL_PROVIDER_API_KEY',
            secret_value: 'provider-secret-value',
          },
        },
      },
    ]);
  });

  test('type smoke covers supported auth variants, redacted responses, and session provider selection', () => {
    const mcpOAuthCreate: BetaManagedAgentsMCPOAuthCreateParams = {
      type: 'mcp_oauth',
      mcp_server_url: 'https://mcp.example/sse',
      access_token: 'mcp-access',
    };
    const staticBearerCreate: BetaManagedAgentsStaticBearerCreateParams = {
      type: 'static_bearer',
      mcp_server_url: 'https://mcp.example/sse',
      token: 'mcp-token',
    };
    const providerAPIKeyCreate: BetaManagedAgentsProviderAPIKeyCreateParams = {
      type: 'provider_api_key',
      provider_id: 'anthropic',
      access_mode: 'model_inference',
      token: 'provider-key',
    };
    const providerOAuthCreate: BetaManagedAgentsProviderOAuthCreateParams = {
      type: 'provider_oauth',
      provider_id: 'openai',
      access_mode: 'oauth',
      access_token: 'provider-access',
      refresh_token: 'provider-refresh',
      expires_at: '2026-01-01T01:00:00Z',
      account_id: 'acct_123',
    };
    const createParams: Array<CredentialCreateParams['auth']> = [
      mcpOAuthCreate,
      staticBearerCreate,
      providerAPIKeyCreate,
      providerOAuthCreate,
    ];

    const mcpOAuthUpdate: BetaManagedAgentsMCPOAuthUpdateParams = {
      type: 'mcp_oauth',
      access_token: 'rotated-mcp-access',
      refresh: { refresh_token: 'rotated-mcp-refresh' },
    };
    const staticBearerUpdate: BetaManagedAgentsStaticBearerUpdateParams = {
      type: 'static_bearer',
      token: 'rotated-mcp-token',
    };
    const providerAPIKeyUpdate: BetaManagedAgentsProviderAPIKeyUpdateParams = {
      type: 'provider_api_key',
      token: 'rotated-provider-key',
    };
    const providerOAuthUpdate: BetaManagedAgentsProviderOAuthUpdateParams = {
      type: 'provider_oauth',
      access_token: 'rotated-provider-access',
      refresh_token: 'rotated-provider-refresh',
      expires_at: '2026-01-01T02:00:00Z',
    };
    const updateParams: Array<NonNullable<CredentialUpdateParams['auth']>> = [
      mcpOAuthUpdate,
      staticBearerUpdate,
      providerAPIKeyUpdate,
      providerOAuthUpdate,
    ];

    const providerAPIKeyResponse: BetaManagedAgentsProviderAPIKeyAuthResponse = {
      type: 'provider_api_key',
      provider_id: 'anthropic',
      access_mode: 'model_inference',
    };
    const providerOAuthResponse: BetaManagedAgentsProviderOAuthAuthResponse = {
      type: 'provider_oauth',
      provider_id: 'openai',
      access_mode: 'oauth',
      expires_at: '2026-01-01T01:00:00Z',
      account_id: 'acct_123',
      has_refresh_token: true,
    };
    const sessionWithProviderCredential: SessionCreateParams = {
      agent: 'agent_123',
      environment_id: 'env_123',
      vault_ids: ['vlt_123'],
      providers: { anthropic: { credential_id: 'vcrd_provider_api_key' } },
    };

    expect(createParams).toHaveLength(4);
    expect(updateParams).toHaveLength(4);
    expect(providerAPIKeyResponse.provider_id).toBe('anthropic');
    expect(providerOAuthResponse.has_refresh_token).toBe(true);
    expect(sessionWithProviderCredential.providers?.['anthropic']?.credential_id).toBe(
      'vcrd_provider_api_key',
    );
  });
});

const providerAPIKeyResponseHasNoToken: BetaManagedAgentsProviderAPIKeyAuthResponse = {
  type: 'provider_api_key',
  provider_id: 'anthropic',
  access_mode: 'model_inference',
};
// @ts-expect-error Provider API-key response redacts the write-only token.
providerAPIKeyResponseHasNoToken.token;

const providerOAuthResponseHasNoSecrets: BetaManagedAgentsProviderOAuthAuthResponse = {
  type: 'provider_oauth',
  provider_id: 'openai',
  access_mode: 'oauth',
  expires_at: '2026-01-01T01:00:00Z',
  account_id: 'acct_123',
  has_refresh_token: true,
};
// @ts-expect-error Provider OAuth response redacts the write-only access token.
providerOAuthResponseHasNoSecrets.access_token;
// @ts-expect-error Provider OAuth response redacts the write-only refresh token.
providerOAuthResponseHasNoSecrets.refresh_token;
