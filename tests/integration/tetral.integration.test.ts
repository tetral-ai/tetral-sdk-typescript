import Anthropic, { toFile } from '@tetral-ai/sdk';
import type { APIError } from '@tetral-ai/sdk/core/error';
import type { BetaManagedAgentsAgent } from '@tetral-ai/sdk/resources/beta/agents';
import type {
  BetaEnvironment,
  BetaEnvironmentDeleteResponse,
} from '@tetral-ai/sdk/resources/beta/environments';
import type { FileMetadata } from '@tetral-ai/sdk/resources/beta/files';
import type {
  BetaManagedAgentsMemory,
  BetaManagedAgentsMemoryListItem,
  BetaManagedAgentsMemoryStore,
  BetaManagedAgentsMemoryVersion,
} from '@tetral-ai/sdk/resources/beta/memory-stores';
import type {
  BetaManagedAgentsDeleteSessionResource,
  BetaManagedAgentsFileResource,
  BetaManagedAgentsSessionResource,
} from '@tetral-ai/sdk/resources/beta/sessions/resources';
import type {
  BetaManagedAgentsDeletedSession,
  BetaManagedAgentsSession,
  BetaManagedAgentsSendSessionEvents,
} from '@tetral-ai/sdk/resources/beta/sessions';
import type { BetaManagedAgentsSessionEvent } from '@tetral-ai/sdk/resources/beta/sessions/events';
import type { BetaManagedAgentsSessionThread } from '@tetral-ai/sdk/resources/beta/sessions/threads';
import type { SkillCreateResponse } from '@tetral-ai/sdk/resources/beta/skills';
import type { VersionCreateResponse } from '@tetral-ai/sdk/resources/beta/skills/versions';
import type {
  BetaManagedAgentsCredential,
  BetaManagedAgentsVault,
} from '@tetral-ai/sdk/resources/beta/vaults';

const hasIntegrationEnv = Boolean(process.env['TETRAL_BASE_URL'] && process.env['TETRAL_API_KEY']);
const describeIntegration = hasIntegrationEnv ? describe : describe.skip;

function integrationClient(): Anthropic {
  return new Anthropic({
    apiKey: process.env['TETRAL_API_KEY'],
    baseURL: process.env['TETRAL_BASE_URL'],
    maxRetries: 0,
  });
}

function expectField<T>(value: T, field: string): asserts value is Exclude<T, undefined> {
  if (value === undefined) {
    throw new Error(`Expected required field \`${field}\` to be defined`);
  }
}

async function waitFor<T>(what: string, poll: () => Promise<T | null>, timeoutMs = 90_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const result = await poll();
    if (result !== null) return result;
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
}

async function waitForSessionStatus(
  client: Anthropic,
  sessionID: string,
  statuses: Array<BetaManagedAgentsSession['status']>,
): Promise<BetaManagedAgentsSession> {
  return waitFor(`session ${sessionID} status in [${statuses.join(', ')}]`, async () => {
    const session = await client.beta.sessions.retrieve(sessionID);
    return statuses.includes(session.status) ? session : null;
  });
}

async function firstPageItem<T>(items: AsyncIterable<T>): Promise<T> {
  for await (const item of items) {
    return item;
  }
  throw new Error('Expected at least one item');
}

function assertVault(vault: BetaManagedAgentsVault): void {
  expectField(vault.id, 'id');
  expectField(vault.archived_at, 'archived_at');
  expectField(vault.created_at, 'created_at');
  expectField(vault.display_name, 'display_name');
  expectField(vault.metadata, 'metadata');
  expect(vault.type).toBe('vault');
  expectField(vault.updated_at, 'updated_at');
}

function assertCredential(credential: BetaManagedAgentsCredential): void {
  expectField(credential.id, 'id');
  expectField(credential.archived_at, 'archived_at');
  expectField(credential.auth, 'auth');
  expectField(credential.created_at, 'created_at');
  expectField(credential.metadata, 'metadata');
  expect(credential.type).toBe('vault_credential');
  expectField(credential.updated_at, 'updated_at');
  expectField(credential.vault_id, 'vault_id');
}

function assertAgent(agent: BetaManagedAgentsAgent): void {
  expectField(agent.id, 'id');
  expectField(agent.archived_at, 'archived_at');
  expectField(agent.created_at, 'created_at');
  expectField(agent.description, 'description');
  expectField(agent.mcp_servers, 'mcp_servers');
  expectField(agent.approval_mode, 'approval_mode');
  expectField(agent.metadata, 'metadata');
  expectField(agent.model, 'model');
  expectField(agent.multiagent, 'multiagent');
  expectField(agent.name, 'name');
  expectField(agent.skills, 'skills');
  expectField(agent.system, 'system');
  expectField(agent.tools, 'tools');
  expect(agent.type).toBe('agent');
  expectField(agent.updated_at, 'updated_at');
  expectField(agent.version, 'version');
}

function assertEnvironment(environment: BetaEnvironment): void {
  expectField(environment.id, 'id');
  expectField(environment.archived_at, 'archived_at');
  expectField(environment.config, 'config');
  expectField(environment.created_at, 'created_at');
  expectField(environment.description, 'description');
  expectField(environment.metadata, 'metadata');
  expectField(environment.name, 'name');
  expect(environment.type).toBe('environment');
  expectField(environment.updated_at, 'updated_at');
}

function assertSession(session: BetaManagedAgentsSession): void {
  expectField(session.id, 'id');
  expectField(session.agent, 'agent');
  expectField(session.archived_at, 'archived_at');
  expectField(session.created_at, 'created_at');
  expectField(session.environment_id, 'environment_id');
  expectField(session.metadata, 'metadata');
  expectField(session.outcome_evaluations, 'outcome_evaluations');
  expectField(session.resources, 'resources');
  expectField(session.stats, 'stats');
  expectField(session.status, 'status');
  expectField(session.title, 'title');
  expect(session.type).toBe('session');
  expectField(session.updated_at, 'updated_at');
  expectField(session.usage, 'usage');
  expectField(session.vault_ids, 'vault_ids');
}

function assertSendSessionEvents(events: BetaManagedAgentsSendSessionEvents): void {
  expect(events).toBeDefined();
  if (events.data) expect(Array.isArray(events.data)).toBe(true);
}

function assertSessionEvent(event: BetaManagedAgentsSessionEvent): void {
  expectField(event.type, 'type');
}

function assertThread(thread: BetaManagedAgentsSessionThread): void {
  expectField(thread.id, 'id');
  expectField(thread.agent, 'agent');
  expectField(thread.archived_at, 'archived_at');
  expectField(thread.created_at, 'created_at');
  expectField(thread.parent_thread_id, 'parent_thread_id');
  expectField(thread.session_id, 'session_id');
  expectField(thread.stats, 'stats');
  expectField(thread.status, 'status');
  expect(thread.type).toBe('session_thread');
  expectField(thread.updated_at, 'updated_at');
  expectField(thread.usage, 'usage');
}

function assertFile(file: FileMetadata): void {
  expectField(file.id, 'id');
  expectField(file.created_at, 'created_at');
  expectField(file.filename, 'filename');
  expectField(file.mime_type, 'mime_type');
  expectField(file.size_bytes, 'size_bytes');
  expect(file.type).toBe('file');
}

function assertFileResource(resource: BetaManagedAgentsFileResource): void {
  expectField(resource.id, 'id');
  expectField(resource.created_at, 'created_at');
  expectField(resource.file_id, 'file_id');
  expectField(resource.mount_path, 'mount_path');
  expect(resource.type).toBe('file');
  expectField(resource.updated_at, 'updated_at');
}

function assertSessionResource(resource: BetaManagedAgentsSessionResource): void {
  if (resource.type === 'file') {
    assertFileResource(resource);
    return;
  }

  if (resource.type === 'github_repository') {
    expectField(resource.id, 'id');
    expectField(resource.created_at, 'created_at');
    expectField(resource.mount_path, 'mount_path');
    expectField(resource.url, 'url');
    expectField(resource.updated_at, 'updated_at');
    return;
  }

  expect(resource.type).toBe('memory_store');
  expectField(resource.memory_store_id, 'memory_store_id');
}

function assertDeletedSessionResource(resource: BetaManagedAgentsDeleteSessionResource): void {
  expectField(resource.id, 'id');
  expect(resource.type).toBe('session_resource_deleted');
}

function assertDeletedSession(deleted: BetaManagedAgentsDeletedSession): void {
  expectField(deleted.id, 'id');
  expect(deleted.type).toBe('session_deleted');
}

function assertDeletedEnvironment(deleted: BetaEnvironmentDeleteResponse): void {
  expectField(deleted.id, 'id');
  expect(deleted.type).toBe('environment_deleted');
}

function assertSkill(skill: SkillCreateResponse): void {
  expectField(skill.id, 'id');
  expectField(skill.created_at, 'created_at');
  expectField(skill.display_title, 'display_title');
  expectField(skill.latest_version, 'latest_version');
  expectField(skill.source, 'source');
  expectField(skill.type, 'type');
  expectField(skill.updated_at, 'updated_at');
}

function assertSkillVersion(version: VersionCreateResponse): void {
  expectField(version.id, 'id');
  expectField(version.created_at, 'created_at');
  expectField(version.description, 'description');
  expectField(version.directory, 'directory');
  expectField(version.name, 'name');
  expectField(version.skill_id, 'skill_id');
  expectField(version.type, 'type');
  expectField(version.version, 'version');
}

function assertMemoryStore(store: BetaManagedAgentsMemoryStore): void {
  expectField(store.id, 'id');
  expectField(store.created_at, 'created_at');
  expectField(store.name, 'name');
  expect(store.type).toBe('memory_store');
  expectField(store.updated_at, 'updated_at');
  expectField(store.archived_at, 'archived_at');
  expectField(store.description, 'description');
  expectField(store.metadata, 'metadata');
}

function assertMemory(memory: BetaManagedAgentsMemory): void {
  expectField(memory.id, 'id');
  expectField(memory.content_sha256, 'content_sha256');
  expectField(memory.content_size_bytes, 'content_size_bytes');
  expectField(memory.created_at, 'created_at');
  expectField(memory.memory_store_id, 'memory_store_id');
  expectField(memory.memory_version_id, 'memory_version_id');
  expectField(memory.path, 'path');
  expect(memory.type).toBe('memory');
  expectField(memory.updated_at, 'updated_at');
}

function assertMemoryListItem(item: BetaManagedAgentsMemoryListItem): void {
  if (item.type === 'memory') {
    assertMemory(item);
    return;
  }

  expect(item.type).toBe('memory_prefix');
  expectField(item.path, 'path');
}

function assertMemoryVersion(version: BetaManagedAgentsMemoryVersion): void {
  expectField(version.id, 'id');
  expectField(version.created_at, 'created_at');
  expectField(version.memory_id, 'memory_id');
  expectField(version.memory_store_id, 'memory_store_id');
  expectField(version.operation, 'operation');
  expect(version.type).toBe('memory_version');
  expectField(version.created_by, 'created_by');
  expectField(version.path, 'path');
  expectField(version.redacted_at, 'redacted_at');
  expectField(version.redacted_by, 'redacted_by');
}

async function expectInvalidRequest(promise: Promise<unknown>): Promise<void> {
  await expect(promise).rejects.toMatchObject({
    status: 400,
    type: 'invalid_request_error',
  } satisfies Partial<APIError>);
}

async function createEnvironmentAndAgent(client: Anthropic): Promise<{
  environment: BetaEnvironment;
  agent: BetaManagedAgentsAgent;
}> {
  const environment = await client.beta.environments.create({
    name: `integration-env-${Date.now()}`,
    config: { type: 'cloud', networking: { type: 'blocked' } },
  });
  assertEnvironment(environment);

  const agent = await client.beta.agents.create({
    name: `integration-agent-${Date.now()}`,
    model: 'anthropic/claude-opus-4-8',
    approval_mode: 'ask_for_approval',
    tools: [{ type: 'tetral_agent_toolset', family: 'claude' }],
  });
  assertAgent(agent);

  return { environment, agent };
}

describeIntegration('Tetral live integration suite', () => {
  jest.setTimeout(120_000);

  test('vaults and all supported credential auth variants', async () => {
    const client = integrationClient();
    const vault = await client.beta.vaults.create({ display_name: `integration-vault-${Date.now()}` });
    assertVault(vault);
    assertVault(await client.beta.vaults.retrieve(vault.id));

    const credentials = [
      await client.beta.vaults.credentials.create(vault.id, {
        display_name: 'mcp oauth',
        auth: {
          type: 'mcp_oauth',
          mcp_server_url: 'https://mcp.example/sse',
          access_token: 'mcp-access-token',
        },
      }),
      await client.beta.vaults.credentials.create(vault.id, {
        display_name: 'static bearer',
        auth: {
          type: 'static_bearer',
          mcp_server_url: 'https://mcp.example/sse',
          token: 'static-bearer-token',
        },
      }),
      await client.beta.vaults.credentials.create(vault.id, {
        display_name: 'provider api key',
        auth: {
          type: 'provider_api_key',
          provider_id: 'anthropic',
          access_mode: 'model_inference',
          token: 'provider-api-key',
        },
      }),
      await client.beta.vaults.credentials.create(vault.id, {
        display_name: 'provider oauth',
        auth: {
          type: 'provider_oauth',
          provider_id: 'openai',
          access_mode: 'model_inference',
          access_token: 'provider-access-token',
        },
      }),
    ];

    credentials.forEach(assertCredential);
    assertCredential(
      await client.beta.vaults.credentials.retrieve(credentials[0]!.id, { vault_id: vault.id }),
    );
    assertCredential(await firstPageItem(client.beta.vaults.credentials.list(vault.id)));
  });

  test('agents and versions.list', async () => {
    const client = integrationClient();
    const { agent } = await createEnvironmentAndAgent(client);
    assertAgent(await client.beta.agents.retrieve(agent.id));
    assertAgent(
      await client.beta.agents.update(agent.id, { version: agent.version, approval_mode: 'approve_for_me' }),
    );
    assertAgent(await firstPageItem(client.beta.agents.list({ limit: 1 })));
    assertAgent(await firstPageItem(client.beta.agents.versions.list(agent.id, { limit: 1 })));
  });

  test('sessions lifecycle, events, threads, files, and session resources', async () => {
    const client = integrationClient();
    const { environment, agent } = await createEnvironmentAndAgent(client);
    const session = await client.beta.sessions.create({
      environment_id: environment.id,
      agent: { type: 'agent', id: agent.id, version: agent.version },
      vault_ids: [],
    });
    assertSession(session);
    assertSession(await client.beta.sessions.retrieve(session.id));
    assertSession(await client.beta.sessions.update(session.id, { title: 'integration session' }));
    assertSession(await firstPageItem(client.beta.sessions.list({ limit: 1 })));

    const sent = await client.beta.sessions.events.send(session.id, {
      events: [{ type: 'user.message', content: [{ type: 'text', text: 'hello' }] }],
    });
    assertSendSessionEvents(sent);
    assertSessionEvent(await firstPageItem(client.beta.sessions.events.list(session.id, { limit: 1 })));
    const eventStream = await client.beta.sessions.events.stream(session.id);
    for await (const event of eventStream) {
      assertSessionEvent(event);
      break;
    }

    const thread = await waitFor('first public session thread', async () => {
      for await (const item of client.beta.sessions.threads.list(session.id, { limit: 1 })) {
        return item;
      }
      return null;
    });
    assertThread(thread);
    assertThread(await client.beta.sessions.threads.retrieve(thread.id, { session_id: session.id }));
    assertSessionEvent(
      await firstPageItem(
        client.beta.sessions.threads.events.list(thread.id, { session_id: session.id, limit: 1 }),
      ),
    );
    const threadStream = await client.beta.sessions.threads.events.stream(thread.id, {
      session_id: session.id,
    });
    for await (const event of threadStream) {
      assertSessionEvent(event);
      break;
    }

    const file = await client.beta.files.upload({
      file: await toFile(Buffer.from('city,revenue\nSF,42\n'), 'integration.csv'),
    });
    assertFile(file);
    assertFile(await client.beta.files.retrieveMetadata(file.id));
    assertFile(await firstPageItem(client.beta.files.list({ limit: 1 })));
    const resource = await client.beta.sessions.resources.add(session.id, {
      type: 'file',
      file_id: file.id,
      mount_path: '/uploads/integration.csv',
    });
    assertFileResource(resource);
    assertSessionResource(
      await client.beta.sessions.resources.retrieve(resource.id, { session_id: session.id }),
    );
    assertSessionResource(await firstPageItem(client.beta.sessions.resources.list(session.id, { limit: 1 })));
    assertDeletedSessionResource(
      await client.beta.sessions.resources.delete(resource.id, { session_id: session.id }),
    );
    // Archive conflicts with running/rescheduling states (409); wait for the
    // turn to settle before archiving.
    await waitForSessionStatus(client, session.id, ['idle', 'terminated']);
    assertSession(await client.beta.sessions.archive(session.id));
    assertDeletedSession(await client.beta.sessions.delete(session.id));
  });

  test('skills including versions', async () => {
    const client = integrationClient();
    const skillFile = await toFile(
      Buffer.from('# Integration Skill\n\nUse this skill only for integration checks.\n'),
      'integration/SKILL.md',
    );
    const skill = await client.beta.skills.create({
      display_title: `integration-skill-${Date.now()}`,
      files: [skillFile],
    });
    assertSkill(skill);
    assertSkill(await client.beta.skills.retrieve(skill.id));
    assertSkill(await firstPageItem(client.beta.skills.list({ limit: 1 })));

    const versionFile = await toFile(
      Buffer.from('# Integration Skill\n\nSecond version for integration checks.\n'),
      'integration/SKILL.md',
    );
    const version = await client.beta.skills.versions.create(skill.id, {
      files: [versionFile],
    });
    assertSkillVersion(version);
    assertSkillVersion(await client.beta.skills.versions.retrieve(version.version, { skill_id: skill.id }));
    assertSkillVersion(await firstPageItem(client.beta.skills.versions.list(skill.id, { limit: 1 })));
  });

  test('memory stores, memories, and memory versions', async () => {
    const client = integrationClient();
    const store = await client.beta.memoryStores.create({
      name: `integration-memory-${Date.now()}`,
      description: 'Integration memory store',
      metadata: { purpose: 'integration' },
    });
    assertMemoryStore(store);
    assertMemoryStore(await client.beta.memoryStores.retrieve(store.id));
    assertMemoryStore(
      await client.beta.memoryStores.update(store.id, { description: 'Updated integration store' }),
    );
    assertMemoryStore(await firstPageItem(client.beta.memoryStores.list({ limit: 1 })));

    const memory = await client.beta.memoryStores.memories.create(store.id, {
      path: '/notes/integration.md',
      content: 'hello memory',
      view: 'full',
    });
    assertMemory(memory);
    assertMemory(await client.beta.memoryStores.memories.retrieve(memory.id, { memory_store_id: store.id }));
    assertMemory(
      await client.beta.memoryStores.memories.update(memory.id, {
        memory_store_id: store.id,
        content: 'updated memory',
        view: 'full',
      }),
    );
    assertMemoryListItem(await firstPageItem(client.beta.memoryStores.memories.list(store.id, { limit: 1 })));

    const version = await firstPageItem(
      client.beta.memoryStores.memoryVersions.list(store.id, {
        memory_id: memory.id,
        limit: 1,
      }),
    );
    assertMemoryVersion(version);
    assertMemoryVersion(
      await client.beta.memoryStores.memoryVersions.retrieve(version.id, { memory_store_id: store.id }),
    );
    assertMemoryVersion(
      await client.beta.memoryStores.memoryVersions.redact(version.id, { memory_store_id: store.id }),
    );
  });

  test('environments lifecycle', async () => {
    const client = integrationClient();
    const environment = await client.beta.environments.create({
      name: `integration-env-${Date.now()}`,
      config: { type: 'cloud', networking: { type: 'unrestricted' } },
    });
    assertEnvironment(environment);
    assertEnvironment(await client.beta.environments.retrieve(environment.id));
    assertEnvironment(
      await client.beta.environments.update(environment.id, {
        config: { type: 'cloud', networking: { type: 'blocked' } },
      }),
    );
    assertEnvironment(await firstPageItem(client.beta.environments.list({ limit: 1 })));
    assertEnvironment(await client.beta.environments.archive(environment.id));
    assertDeletedEnvironment(await client.beta.environments.delete(environment.id));
  });

  test('must-reject retained unsupported request shapes', async () => {
    const client = integrationClient();
    const { environment, agent } = await createEnvironmentAndAgent(client);

    // Reject cases target real parent resources: a missing session or vault
    // returns 404 not_found_error per the session plan's status mapping, which
    // would mask the documented 400 invalid_request_error.
    const session = await client.beta.sessions.create({
      environment_id: environment.id,
      agent: { type: 'agent', id: agent.id, version: agent.version },
      vault_ids: [],
    });
    assertSession(session);
    const vault = await client.beta.vaults.create({ display_name: `reject-case-vault-${Date.now()}` });
    assertVault(vault);

    for (const event of [
      { type: 'user.custom_tool_result' as const, custom_tool_use_id: 'ctu_123' },
      { type: 'user.tool_result' as const, tool_use_id: 'toolu_123' },
      {
        type: 'user.define_outcome' as const,
        description: 'produce the requested output',
        rubric: { type: 'text' as const, content: 'complete' },
      },
      { type: 'system.message' as const, content: [{ type: 'text' as const, text: 'internal context' }] },
    ]) {
      await expectInvalidRequest(
        client.beta.sessions.events.send(session.id, {
          events: [event],
        }),
      );
    }

    await expectInvalidRequest(
      client.beta.vaults.credentials.create(vault.id, {
        display_name: 'unsupported env var credential',
        auth: {
          type: 'environment_variable',
          networking: { type: 'unrestricted' },
          secret_name: 'MODEL_PROVIDER_API_KEY',
          secret_value: 'provider-secret-value',
        },
      }),
    );

    await expectInvalidRequest(
      client.beta.sessions.update(session.id, {
        vault_ids: [vault.id],
      }),
    );

    // Provider selector mismatch: a live openai credential in a session-bound
    // vault, selected for an anthropic-model agent, isolates the mismatch as
    // the only rejection cause.
    const wrongProviderCredential = await client.beta.vaults.credentials.create(vault.id, {
      display_name: 'wrong provider credential',
      auth: {
        type: 'provider_api_key',
        provider_id: 'openai',
        access_mode: 'model_inference',
        token: 'provider-api-key',
      },
    });
    await expectInvalidRequest(
      client.beta.sessions.create({
        environment_id: environment.id,
        agent: { type: 'agent', id: agent.id, version: agent.version },
        vault_ids: [vault.id],
        providers: { openai: { credential_id: wrongProviderCredential.id } },
      }),
    );

    await expectInvalidRequest(
      client.beta.agents.create({
        name: 'legacy toolset reject case',
        model: 'anthropic/claude-opus-4-8',
        tools: [{ type: 'agent_toolset_20260401' }],
      }),
    );

    await expectInvalidRequest(
      client.beta.agents.create({
        name: 'custom tool reject case',
        model: 'anthropic/claude-opus-4-8',
        tools: [
          {
            type: 'custom',
            name: 'lookup',
            description: 'unsupported custom tool',
            input_schema: { type: 'object' },
          },
        ],
      }),
    );

    await expectInvalidRequest(
      client.beta.agents.create({
        name: 'multiagent reject case',
        model: 'anthropic/claude-opus-4-8',
        multiagent: { type: 'coordinator', agents: [{ type: 'self' }] },
      }),
    );
  });
});
