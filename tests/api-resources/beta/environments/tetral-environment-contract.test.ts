import Anthropic from '@anthropic-ai/sdk';
import type {
  BetaEnvironment,
  BetaEnvironmentNetworking,
  BetaLimitedNetworkParams,
  BetaSelfHostedConfigParams,
  EnvironmentCreateParams,
  EnvironmentUpdateParams,
} from '@anthropic-ai/sdk/resources/beta/environments';

const ENVIRONMENT_RESPONSE: BetaEnvironment = {
  id: 'env_123',
  archived_at: null,
  config: {
    type: 'cloud',
    networking: {
      type: 'cidr_allow_list',
      network_allow_list: '10.0.0.0/24,192.168.1.10/32',
    },
    packages: {
      apt: [],
      cargo: [],
      gem: [],
      go: [],
      npm: [],
      pip: [],
      type: 'packages',
    },
  },
  created_at: '2026-01-01T00:00:00Z',
  description: 'Tetral Cloud Environment',
  metadata: {},
  name: 'tetral-cloud',
  type: 'environment',
  updated_at: '2026-01-01T00:00:00Z',
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

describe('Tetral Environment SDK contract', () => {
  test('create serializes cidr_allow_list networking without hostname translation', async () => {
    const captured: { url: string; body: unknown }[] = [];
    const client = new Anthropic({
      apiKey: 'redacted-key-test',
      baseURL: 'https://api.tetral.example',
      fetch: async (url: any, init?: RequestInit) => {
        captured.push({ url: String(url), body: parseJSONBody(init) });
        return jsonResponse(ENVIRONMENT_RESPONSE);
      },
    });

    await client.beta.environments.create({
      name: 'cidr environment',
      config: {
        type: 'cloud',
        networking: {
          type: 'cidr_allow_list',
          network_allow_list: '10.0.0.0/24,192.168.1.10/32',
        },
      },
    });

    expect(captured).toHaveLength(1);
    expect(captured[0]!.url).toBe('https://api.tetral.example/v1/environments?beta=true');
    expect(captured[0]!.body).toMatchObject({
      name: 'cidr environment',
      config: {
        type: 'cloud',
        networking: {
          type: 'cidr_allow_list',
          network_allow_list: '10.0.0.0/24,192.168.1.10/32',
        },
      },
    });
  });

  test('update serializes blocked networking', async () => {
    const captured: { url: string; body: unknown }[] = [];
    const client = new Anthropic({
      apiKey: 'redacted-key-test',
      baseURL: 'https://api.tetral.example',
      fetch: async (url: any, init?: RequestInit) => {
        captured.push({ url: String(url), body: parseJSONBody(init) });
        return jsonResponse({
          ...ENVIRONMENT_RESPONSE,
          config: {
            ...ENVIRONMENT_RESPONSE.config,
            networking: { type: 'blocked' },
          },
        });
      },
    });

    await client.beta.environments.update('env_123', {
      config: {
        type: 'cloud',
        networking: { type: 'blocked' },
      },
    });

    expect(captured).toHaveLength(1);
    expect(captured[0]!.url).toBe('https://api.tetral.example/v1/environments/env_123?beta=true');
    expect(captured[0]!.body).toEqual({
      config: {
        type: 'cloud',
        networking: { type: 'blocked' },
      },
    });
  });

  test.each([
    ['self_hosted config', { name: 'self-host compat', config: { type: 'self_hosted' } }],
    [
      'host allowlist networking',
      {
        name: 'limited compat',
        config: {
          type: 'cloud',
          networking: {
            type: 'limited',
            allowed_hosts: ['api.example.com'],
            allow_mcp_servers: true,
            allow_package_managers: true,
          },
        },
      },
    ],
    ['account scope', { name: 'scoped compat', scope: 'organization' }],
  ] satisfies Array<[string, EnvironmentCreateParams]>)(
    'sends retained unsupported Environment create shape %s through normal HTTP and parses backend 400',
    async (_name, params) => {
      const captured: unknown[] = [];
      const client = new Anthropic({
        apiKey: 'redacted-key-test',
        baseURL: 'https://api.tetral.example',
        fetch: async (_url: any, init?: RequestInit) => {
          captured.push(parseJSONBody(init));
          return jsonResponse(
            {
              type: 'error',
              error: { type: 'invalid_request_error', message: 'unsupported environment shape' },
            },
            400,
          );
        },
      });

      await expect(client.beta.environments.create(params)).rejects.toMatchObject({
        status: 400,
        type: 'invalid_request_error',
      });
      expect(captured).toEqual([params]);
    },
  );

  test('retained work API sends normal request and parses backend 400', async () => {
    const captured: string[] = [];
    const client = new Anthropic({
      apiKey: 'redacted-key-test',
      baseURL: 'https://api.tetral.example',
      fetch: async (url: any) => {
        captured.push(String(url));
        return jsonResponse(
          {
            type: 'error',
            error: { type: 'invalid_request_error', message: 'environment work is unsupported' },
          },
          400,
        );
      },
    });

    await expect(client.beta.environments.work.poll('env_123')).rejects.toMatchObject({
      status: 400,
      type: 'invalid_request_error',
    });
    expect(captured).toEqual(['https://api.tetral.example/v1/environments/env_123/work/poll?beta=true']);
    expect(client.beta.environments.work).toBeDefined();
  });

  test('type smoke covers Tetral networking and retained unsupported compatibility shapes', () => {
    const unrestricted: BetaEnvironmentNetworking = { type: 'unrestricted' };
    const blocked: BetaEnvironmentNetworking = { type: 'blocked' };
    const cidr: BetaEnvironmentNetworking = {
      type: 'cidr_allow_list',
      network_allow_list: '10.0.0.0/24,192.168.1.10/32',
    };
    const createWithSupportedNetworking: EnvironmentCreateParams = {
      name: 'supported cloud',
      config: { type: 'cloud', networking: cidr },
    };
    const updateWithSupportedNetworking: EnvironmentUpdateParams = {
      config: { type: 'cloud', networking: blocked },
    };
    const retainedSelfHostedConfig: BetaSelfHostedConfigParams = { type: 'self_hosted' };
    const retainedLimitedNetworking: BetaLimitedNetworkParams = {
      type: 'limited',
      allowed_hosts: ['api.example.com'],
    };
    const retainedUnsupportedCreate: EnvironmentCreateParams = {
      name: 'retained compat',
      config: { type: 'cloud', networking: retainedLimitedNetworking },
      scope: 'organization',
    };

    expect(unrestricted.type).toBe('unrestricted');
    expect(createWithSupportedNetworking.config?.type).toBe('cloud');
    expect(updateWithSupportedNetworking.config).toMatchObject({ networking: { type: 'blocked' } });
    expect(retainedSelfHostedConfig.type).toBe('self_hosted');
    expect(retainedUnsupportedCreate.scope).toBe('organization');
  });
});

const limitedIsNotSupportedNetworking: BetaEnvironmentNetworking = {
  // @ts-expect-error `limited` is retained separately, not part of the Tetral-supported networking alias.
  type: 'limited',
  allowed_hosts: ['api.example.com'],
  allow_mcp_servers: true,
  allow_package_managers: true,
};
void limitedIsNotSupportedNetworking;

const responseConfigIsCloudOnly: BetaEnvironment = {
  ...ENVIRONMENT_RESPONSE,
  // @ts-expect-error Tetral Environment responses are cloud-only in this stage.
  config: { type: 'self_hosted' },
};
void responseConfigIsCloudOnly;
