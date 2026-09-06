import Anthropic from '@tetral-ai/sdk';
import type { TetralGitIdentity as BetaGitIdentity } from '@tetral-ai/sdk/resources/beta';
import type {
  BetaManagedAgentsGitHubRepositoryResourceParams,
  SessionCreateParams,
  SessionUpdateParams,
  TetralGitIdentity,
} from '@tetral-ai/sdk/resources/beta/sessions';
import type { ResourceUpdateParams } from '@tetral-ai/sdk/resources/beta/sessions/resources';
import { jsonResponse, parseJSONBody } from '../tetral-contract-helpers';

// All documented public import paths must expose the same identity contract.
const identity: TetralGitIdentity & BetaGitIdentity & Anthropic.Beta.TetralGitIdentity = {
  name: "山田 O'Brien",
  email: 'bot+sdk@example.com',
};
const repository: BetaManagedAgentsGitHubRepositoryResourceParams = {
  type: 'github_repository',
  url: 'https://github.com/example/project',
  authorization_token: 'test-repository-token',
};

describe('Session Git identity HTTP contract', () => {
  test.each([true, false])('preserves declared identity or absence (declared=%s)', async (declared) => {
    const resource = {
      id: 'sesrsc_repo',
      type: 'github_repository' as const,
      url: repository.url,
      mount_path: '/workspace/project',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      ...(declared ? { git_identity: identity } : {}),
    };
    const captured: { url: string; body: unknown }[] = [];
    const responses = [{ id: 'sesn_git', resources: [resource] }, resource];
    const client = new Anthropic({
      apiKey: 'test-tetral-key',
      baseURL: 'https://api.tetral.example',
      fetch: async (url, init) => {
        captured.push({ url: String(url), body: init?.body ? parseJSONBody(init) : undefined });
        return jsonResponse(responses.shift()!);
      },
    });
    const params: SessionCreateParams = {
      agent: 'agent_123',
      environment_id: 'env_123',
      vault_ids: [],
      resources: [{ ...repository, ...(declared ? { git_identity: identity } : {}) }],
    };
    const session = await client.beta.sessions.create(params);
    expect(captured[0]).toEqual({
      url: 'https://api.tetral.example/v1/sessions?beta=true',
      body: params,
    });
    const retrieved = await client.beta.sessions.resources.retrieve(resource.id, { session_id: session.id });
    for (const result of [session.resources[0]!, retrieved]) {
      expect(result.type).toBe('github_repository');
      if (result.type !== 'github_repository') throw new Error('Expected GitHub repository');
      expect(result.git_identity).toEqual(declared ? identity : undefined);
      expect(Object.prototype.hasOwnProperty.call(result, 'git_identity')).toBe(declared);
      expect(result).not.toHaveProperty('authorization_token');
    }
  });
});

// These checks are compiled by typecheck; runtime Engine validation owns string contents.
// @ts-expect-error name is required.
const noName: TetralGitIdentity = { email: 'bot@example.com' };
// @ts-expect-error email is required.
const noEmail: TetralGitIdentity = { name: 'Bot' };
const nullIdentity: BetaManagedAgentsGitHubRepositoryResourceParams = {
  ...repository,
  // @ts-expect-error omit the optional field instead of sending null.
  git_identity: null,
};
const resourceUpdate: ResourceUpdateParams = {
  session_id: 'sesn_git',
  authorization_token: 'rotated-test-token',
  // @ts-expect-error identity is immutable after Session creation.
  git_identity: identity,
};
const sessionUpdate: SessionUpdateParams = {
  // @ts-expect-error identity belongs to create-time repository resources.
  git_identity: identity,
};
const versionedIdentity: TetralGitIdentity = {
  ...identity,
  // @ts-expect-error Git identity has no version API.
  version: 1,
};
void [noName, noEmail, nullIdentity, resourceUpdate, sessionUpdate, versionedIdentity];
