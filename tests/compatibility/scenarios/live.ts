import Anthropic, { toFile } from '@tetral-ai/sdk';
import type { APIError } from '@tetral-ai/sdk/core/error';
import type { BetaManagedAgentsSessionEvent } from '@tetral-ai/sdk/resources/beta/sessions/events';

import type { LiveProofScenarioContext, ProofEvidence, ProofScenarioContext } from '../proof-types';

let sequence = 0;

function liveContext(context: ProofScenarioContext): LiveProofScenarioContext {
  if (context.kind !== 'live') throw new Error('Live compatibility scenario requires an SDK client');
  return context;
}

function unique(prefix: string): string {
  sequence++;
  return `${prefix}-${Date.now()}-${sequence}`;
}

async function firstItem<T>(items: AsyncIterable<T>): Promise<T> {
  for await (const item of items) return item;
  throw new Error('Expected at least one SDK page item');
}

async function includesItem<T extends { id: string }>(items: AsyncIterable<T>, id: string): Promise<boolean> {
  for await (const item of items) if (item.id === id) return true;
  return false;
}

async function rejectsAs(
  operation: Promise<unknown>,
  status: number,
  type: string,
  messageIncludes?: string,
): Promise<boolean> {
  try {
    await operation;
    return false;
  } catch (error) {
    const apiError = error as APIError;
    return (
      apiError.status === status &&
      apiError.type === type &&
      (messageIncludes === undefined || apiError.message.includes(messageIncludes))
    );
  }
}

async function createEnvironment(client: Anthropic) {
  return client.beta.environments.create({
    name: unique('compat-env'),
    config: { type: 'cloud', networking: { type: 'blocked' } },
  });
}

async function createAgent(client: Anthropic) {
  return client.beta.agents.create({
    name: unique('compat-agent'),
    model: 'anthropic/claude-opus-4-8',
    approval_mode: 'ask_for_approval',
    tools: [{ type: 'tetral_agent_toolset', family: 'claude' }],
  });
}

async function createSession(client: Anthropic) {
  const environment = await createEnvironment(client);
  const agent = await createAgent(client);
  const session = await client.beta.sessions.create({
    environment_id: environment.id,
    agent: { type: 'agent', id: agent.id, version: agent.version },
    vault_ids: [],
  });
  return { environment, agent, session };
}

async function collectEventTypes(client: Anthropic, sessionID: string): Promise<Set<string>> {
  const types = new Set<string>();
  for await (const event of client.beta.sessions.events.list(sessionID, { limit: 100 }))
    types.add(event.type);
  return types;
}

async function waitForThread(client: Anthropic, sessionID: string) {
  const deadline = Date.now() + 90_000;
  for (;;) {
    for await (const thread of client.beta.sessions.threads.list(sessionID, { limit: 1 })) return thread;
    if (Date.now() > deadline) throw new Error(`Timed out waiting for a thread in ${sessionID}`);
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
}

async function waitForArchivableThread(client: Anthropic, sessionID: string, threadID: string) {
  const deadline = Date.now() + 90_000;
  for (;;) {
    const thread = await client.beta.sessions.threads.retrieve(threadID, { session_id: sessionID });
    if (thread.status === 'idle' || thread.status === 'terminated') return thread;
    if (Date.now() > deadline)
      throw new Error(`Timed out waiting for thread ${threadID} to become archivable`);
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
}

async function waitForToolUse(client: Anthropic, sessionID: string) {
  const deadline = Date.now() + 90_000;
  for (;;) {
    for await (const event of client.beta.sessions.events.list(sessionID, { limit: 100 })) {
      if (event.type === 'agent.tool_use' && event.evaluated_permission === 'ask') return event;
    }
    if (Date.now() > deadline) throw new Error(`Timed out waiting for an approval tool use in ${sessionID}`);
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
}

async function runLiveSessions(context: ProofScenarioContext): Promise<ProofEvidence> {
  const { client } = liveContext(context);
  const environment = await createEnvironment(client);
  const agent = await createAgent(client);
  const memoryStore = await client.beta.memoryStores.create({ name: unique('compat-session-memory') });
  const created = await client.beta.sessions.create({
    environment_id: environment.id,
    agent: { type: 'agent', id: agent.id, version: agent.version },
    vault_ids: [],
    resources: [
      {
        type: 'memory_store',
        memory_store_id: memoryStore.id,
        access: null,
        instructions: null,
      },
    ],
  });
  const retrieved = await client.beta.sessions.retrieve(created.id);
  const updated = await client.beta.sessions.update(created.id, {
    title: unique('compat-title'),
    metadata: { proof: 'session-update' },
  });
  const listed = await includesItem(client.beta.sessions.list({ limit: 100 }), created.id);
  const immutableVaultIDs = await rejectsAs(
    client.beta.sessions.update(created.id, { vault_ids: ['vlt_not_allowed'] }),
    400,
    'invalid_request_error',
    'immutable',
  );
  const clearedTitle = await client.beta.sessions.update(created.id, { title: null });
  const clearedMetadata = await client.beta.sessions.update(created.id, { metadata: null });
  const archived = await client.beta.sessions.archive(created.id);
  const deleted = await client.beta.sessions.delete(created.id);
  const memoryResource = created.resources.find((resource) => resource.type === 'memory_store');
  return {
    'T-COMPAT-SESS-1': created.type === 'session' && created.environment_id === environment.id,
    'T-COMPAT-SESS-2': retrieved.id === created.id && retrieved.usage !== undefined,
    'T-COMPAT-SESS-3': updated.metadata['proof'] === 'session-update' && updated.title !== null,
    'T-COMPAT-SESS-4': listed,
    'T-COMPAT-SESS-5': deleted.id === created.id && deleted.type === 'session_deleted',
    'T-COMPAT-SESS-6': archived.id === created.id && archived.archived_at !== null,
    'T-COMPAT-SESS-7': immutableVaultIDs,
    'T-COMPAT-SESS-11': retrieved.stats.active_seconds !== null && retrieved.stats.duration_seconds !== null,
    'T-COMPAT-SESS-12': clearedTitle.title === null,
    'T-COMPAT-SESS-13': Object.keys(clearedMetadata.metadata).length === 0,
    'T-COMPAT-SESS-14':
      memoryResource?.type === 'memory_store' &&
      memoryResource.access === 'read_only' &&
      memoryResource.instructions === null,
  };
}

async function runLiveThreads(context: ProofScenarioContext): Promise<ProofEvidence> {
  const { client } = liveContext(context);
  const { session } = await createSession(client);
  await client.beta.sessions.events.send(session.id, {
    events: [{ type: 'user.message', content: [{ type: 'text', text: 'Reply with OK.' }] }],
  });
  const thread = await waitForThread(client, session.id);
  const retrieved = await waitForArchivableThread(client, session.id, thread.id);
  const listed = await includesItem(client.beta.sessions.threads.list(session.id, { limit: 100 }), thread.id);
  const archived = await client.beta.sessions.threads.archive(thread.id, { session_id: session.id });
  return {
    'T-COMPAT-THREAD-1': retrieved.id === thread.id && retrieved.session_id === session.id,
    'T-COMPAT-THREAD-2': listed,
    'T-COMPAT-THREAD-3': archived.archived_at !== null,
    'T-COMPAT-THREAD-4':
      retrieved.type === 'session_thread' && retrieved.agent !== undefined && retrieved.stats !== undefined,
    'T-COMPAT-THREAD-5': ['idle', 'running', 'rescheduling', 'terminated'].includes(retrieved.status),
    'T-COMPAT-THREAD-6':
      retrieved.usage !== null &&
      typeof retrieved.usage.input_tokens === 'number' &&
      typeof retrieved.usage.output_tokens === 'number',
  };
}

async function runLiveEventsInput(context: ProofScenarioContext): Promise<ProofEvidence> {
  const { client } = liveContext(context);
  const { session } = await createSession(client);
  const sentMessage = await client.beta.sessions.events.send(session.id, {
    events: [{ type: 'user.message', content: [{ type: 'text', text: 'Say OK.' }] }],
  });
  const sentInterrupt = await client.beta.sessions.events.send(session.id, {
    events: [{ type: 'user.interrupt' }],
  });
  await client.beta.sessions.events.send(session.id, {
    events: [
      {
        type: 'user.message',
        content: [{ type: 'text', text: 'Use the Bash tool to run `printf compatibility`.' }],
      },
    ],
  });
  const pendingToolUse = await waitForToolUse(client, session.id);
  const confirmed = await client.beta.sessions.events.send(session.id, {
    events: [
      {
        type: 'user.tool_confirmation',
        result: 'deny',
        tool_use_id: pendingToolUse.id,
      },
    ],
  });
  const customToolRejected = await rejectsAs(
    client.beta.sessions.events.send(session.id, {
      events: [{ type: 'user.custom_tool_result', custom_tool_use_id: 'ctu_compat' }],
    }),
    400,
    'invalid_request_error',
  );
  const toolResultRejected = await rejectsAs(
    client.beta.sessions.events.send(session.id, {
      events: [{ type: 'user.tool_result', tool_use_id: 'toolu_compat' }],
    }),
    400,
    'invalid_request_error',
  );
  const outcomeRejected = await rejectsAs(
    client.beta.sessions.events.send(session.id, {
      events: [
        {
          type: 'user.define_outcome',
          description: 'compatibility',
          rubric: { type: 'text', content: 'complete' },
        },
      ],
    }),
    400,
    'invalid_request_error',
  );
  const systemRejected = await rejectsAs(
    client.beta.sessions.events.send(session.id, {
      events: [{ type: 'system.message', content: [{ type: 'text', text: 'system' }] }],
    }),
    400,
    'invalid_request_error',
  );
  const imageRejected = await rejectsAs(
    client.beta.sessions.events.send(session.id, {
      events: [
        {
          type: 'user.message',
          content: [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AA==' } }],
        },
      ],
    }),
    400,
    'invalid_request_error',
  );
  const documentRejected = await rejectsAs(
    client.beta.sessions.events.send(session.id, {
      events: [
        {
          type: 'user.message',
          content: [{ type: 'document', source: { type: 'text', media_type: 'text/plain', data: 'doc' } }],
        },
      ],
    } as never),
    400,
    'invalid_request_error',
  );
  return {
    'T-COMPAT-EVIN-1': Array.isArray(sentMessage.data),
    'T-COMPAT-EVIN-2': Array.isArray(sentMessage.data),
    'T-COMPAT-EVIN-3': Array.isArray(sentInterrupt.data),
    'T-COMPAT-EVIN-4': Array.isArray(confirmed.data),
    'T-COMPAT-EVIN-5': Array.isArray(sentMessage.data),
    'T-COMPAT-EVIN-6': customToolRejected,
    'T-COMPAT-EVIN-7': toolResultRejected,
    'T-COMPAT-EVIN-8': outcomeRejected,
    'T-COMPAT-EVIN-9': systemRejected,
    'T-COMPAT-EVIN-10': toolResultRejected && customToolRejected,
    'T-COMPAT-EVIN-11': imageRejected,
    'T-COMPAT-EVIN-12': documentRejected,
  };
}

const supportedOutputEvents: ReadonlyArray<readonly [string, string]> = [
  ['T-COMPAT-EVOUT-1', 'user.message'],
  ['T-COMPAT-EVOUT-2', 'user.interrupt'],
  ['T-COMPAT-EVOUT-3', 'user.tool_confirmation'],
  ['T-COMPAT-EVOUT-4', 'agent.message'],
  ['T-COMPAT-EVOUT-5', 'agent.tool_use'],
  ['T-COMPAT-EVOUT-6', 'agent.tool_result'],
  ['T-COMPAT-EVOUT-7', 'agent.thread_context_compacted'],
  ['T-COMPAT-EVOUT-8', 'agent.thread_message_sent'],
  ['T-COMPAT-EVOUT-9', 'agent.thread_message_received'],
  ['T-COMPAT-EVOUT-10', 'session.status_running'],
  ['T-COMPAT-EVOUT-11', 'session.status_rescheduled'],
  ['T-COMPAT-EVOUT-12', 'session.status_idle'],
  ['T-COMPAT-EVOUT-13', 'session.status_terminated'],
  ['T-COMPAT-EVOUT-14', 'session.error'],
  ['T-COMPAT-EVOUT-15', 'session.thread_created'],
  ['T-COMPAT-EVOUT-16', 'session.thread_status_running'],
  ['T-COMPAT-EVOUT-17', 'session.thread_status_idle'],
  ['T-COMPAT-EVOUT-18', 'session.thread_status_rescheduled'],
  ['T-COMPAT-EVOUT-19', 'session.thread_status_terminated'],
  ['T-COMPAT-EVOUT-20', 'session.updated'],
  ['T-COMPAT-EVOUT-21', 'session.deleted'],
  ['T-COMPAT-EVOUT-22', 'span.model_request_start'],
  ['T-COMPAT-EVOUT-23', 'span.model_request_end'],
  ['T-COMPAT-EVOUT-34', 'agent.thinking'],
] as const;

async function runLiveEventsOutput(context: ProofScenarioContext): Promise<ProofEvidence> {
  const { client } = liveContext(context);
  const { session } = await createSession(client);
  await client.beta.sessions.update(session.id, { title: unique('event-update') });
  await client.beta.sessions.events.send(session.id, {
    events: [
      {
        type: 'user.message',
        content: [{ type: 'text', text: 'Use the Bash tool to run `printf compatibility`, then reply.' }],
      },
    ],
  });
  const toolUse = await waitForToolUse(client, session.id);
  await client.beta.sessions.events.send(session.id, {
    events: [{ type: 'user.tool_confirmation', result: 'allow', tool_use_id: toolUse.id }],
  });
  await client.beta.sessions.events.send(session.id, { events: [{ type: 'user.interrupt' }] });
  await new Promise((resolve) => setTimeout(resolve, 5_000));
  const types = await collectEventTypes(client, session.id);
  const evidence: Record<string, boolean> = {};
  for (const [id, eventType] of supportedOutputEvents) evidence[id] = types.has(eventType);
  const errorVariants = new Set<string>();
  for await (const event of client.beta.sessions.events.list(session.id, { limit: 100 })) {
    const candidate = event as BetaManagedAgentsSessionEvent & { error?: { type?: string } };
    if (candidate.type === 'session.error' && candidate.error?.type) errorVariants.add(candidate.error.type);
  }
  evidence['T-COMPAT-EVOUT-37'] = [
    'model_overloaded_error',
    'model_rate_limited_error',
    'model_request_failed_error',
  ].every((type) => errorVariants.has(type));
  return evidence;
}

async function runLiveAgents(context: ProofScenarioContext): Promise<ProofEvidence> {
  const { client } = liveContext(context);
  const agent = await createAgent(client);
  const retrieved = await client.beta.agents.retrieve(agent.id);
  const updated = await client.beta.agents.update(agent.id, {
    version: agent.version,
    approval_mode: 'approve_for_me',
  });
  const listed = await includesItem(client.beta.agents.list({ limit: 100 }), agent.id);
  const versionListed = await includesItem(
    client.beta.agents.versions.list(agent.id, { limit: 100 }),
    agent.id,
  );
  const fastRejected = await rejectsAs(
    client.beta.agents.create({
      name: unique('fast'),
      model: { id: 'anthropic/claude-opus-4-8', speed: 'fast' },
    } as never),
    400,
    'invalid_request_error',
  );
  const multiagentRejected = await rejectsAs(
    client.beta.agents.create({
      name: unique('multiagent'),
      model: 'anthropic/claude-opus-4-8',
      multiagent: { type: 'coordinator', agents: [{ type: 'self' }] },
    }),
    400,
    'invalid_request_error',
  );
  const mcpURLRejected = await rejectsAs(
    client.beta.agents.create({
      name: unique('mcp-url'),
      model: 'anthropic/claude-opus-4-8',
      mcp_servers: [{ type: 'url', name: 'other', url: 'https://example.com/mcp' }],
    } as never),
    400,
    'invalid_request_error',
  );
  const legacyToolRejected = await rejectsAs(
    client.beta.agents.create({
      name: unique('legacy-tool'),
      model: 'anthropic/claude-opus-4-8',
      tools: [{ type: 'agent_toolset_20260401' }],
    }),
    400,
    'invalid_request_error',
  );
  const customToolRejected = await rejectsAs(
    client.beta.agents.create({
      name: unique('custom-tool'),
      model: 'anthropic/claude-opus-4-8',
      tools: [{ type: 'custom', name: 'lookup', description: 'lookup', input_schema: { type: 'object' } }],
    }),
    400,
    'invalid_request_error',
  );
  const configsRejected = await rejectsAs(
    client.beta.agents.create({
      name: unique('configs'),
      model: 'anthropic/claude-opus-4-8',
      tools: [{ type: 'tetral_agent_toolset', family: 'claude', configs: [] }],
    } as never),
    400,
    'invalid_request_error',
  );
  const anthropicSkillRejected = await rejectsAs(
    client.beta.agents.create({
      name: unique('anthropic-skill'),
      model: 'anthropic/claude-opus-4-8',
      skills: [{ type: 'anthropic', skill_id: 'skill_compat' }],
    } as never),
    400,
    'invalid_request_error',
  );
  const metadataCleared = await client.beta.agents.update(agent.id, {
    version: updated.version,
    metadata: null,
  });
  const unreferencedMCP = await client.beta.agents.create({
    name: unique('unreferenced-mcp'),
    model: 'anthropic/claude-opus-4-8',
    mcp_servers: [{ type: 'url', name: 'github', url: 'https://api.githubcopilot.com/mcp/' }] as never,
  });
  const skill = await client.beta.skills.create({
    files: [await toFile(Buffer.from('# Agent Compatibility Skill\n'), 'agent/SKILL.md')],
  });
  if (skill.latest_version === null) throw new Error(`Skill ${skill.id} did not expose latest_version`);
  const nullSkillVersion = await client.beta.agents.create({
    name: unique('null-skill-version'),
    model: 'anthropic/claude-opus-4-8',
    skills: [{ type: 'custom', skill_id: skill.id, version: null }],
  });
  const archived = await client.beta.agents.archive(agent.id);
  return {
    'T-COMPAT-AGENT-1': agent.type === 'agent',
    'T-COMPAT-AGENT-2': retrieved.id === agent.id,
    'T-COMPAT-AGENT-3': updated.approval_mode === 'approve_for_me',
    'T-COMPAT-AGENT-4': listed,
    'T-COMPAT-AGENT-5': archived.archived_at !== null,
    'T-COMPAT-AGENT-6': versionListed,
    'T-COMPAT-AGENT-7': fastRejected,
    'T-COMPAT-AGENT-8': multiagentRejected,
    'T-COMPAT-AGENT-9': mcpURLRejected,
    'T-COMPAT-AGENT-10': legacyToolRejected,
    'T-COMPAT-AGENT-11': customToolRejected,
    'T-COMPAT-AGENT-12': configsRejected,
    'T-COMPAT-AGENT-13': anthropicSkillRejected,
    'T-COMPAT-AGENT-14':
      nullSkillVersion.skills[0]?.type === 'custom' &&
      nullSkillVersion.skills[0].version === skill.latest_version,
    'T-COMPAT-AGENT-15': Object.keys(metadataCleared.metadata).length === 0,
    'T-COMPAT-AGENT-16': unreferencedMCP.mcp_servers.length === 1,
  };
}

async function runLiveEnvironments(context: ProofScenarioContext): Promise<ProofEvidence> {
  const { client } = liveContext(context);
  const environment = await createEnvironment(client);
  const retrieved = await client.beta.environments.retrieve(environment.id);
  const updated = await client.beta.environments.update(environment.id, {
    description: 'compatibility environment',
  });
  const listed = await includesItem(client.beta.environments.list({ limit: 100 }), environment.id);
  const createScopeRejected = await rejectsAs(
    client.beta.environments.create({
      name: unique('scope-create'),
      config: { type: 'cloud', networking: { type: 'blocked' } },
      scope: 'workspace',
    } as never),
    400,
    'invalid_request_error',
  );
  const updateScopeRejected = await rejectsAs(
    client.beta.environments.update(environment.id, { scope: 'workspace' } as never),
    400,
    'invalid_request_error',
  );
  const selfHostedRejected = await rejectsAs(
    client.beta.environments.create({
      name: unique('self-hosted'),
      config: { type: 'self_hosted' },
    } as never),
    400,
    'invalid_request_error',
  );
  const limitedRejected = await rejectsAs(
    client.beta.environments.create({
      name: unique('limited'),
      config: { type: 'cloud', networking: { type: 'limited', allowed_hosts: ['example.com'] } },
    } as never),
    400,
    'invalid_request_error',
  );
  const workPaths: ReadonlyArray<readonly [string, 'get' | 'post', string]> = [
    ['T-COMPAT-ENV-14', 'get', `/v1/environments/${environment.id}/work/work_compat?beta=true`],
    ['T-COMPAT-ENV-15', 'post', `/v1/environments/${environment.id}/work/work_compat?beta=true`],
    ['T-COMPAT-ENV-16', 'get', `/v1/environments/${environment.id}/work?beta=true`],
    ['T-COMPAT-ENV-17', 'post', `/v1/environments/${environment.id}/work/work_compat/ack?beta=true`],
    ['T-COMPAT-ENV-18', 'post', `/v1/environments/${environment.id}/work/work_compat/heartbeat?beta=true`],
    ['T-COMPAT-ENV-19', 'post', `/v1/environments/${environment.id}/work/poll?beta=true`],
    ['T-COMPAT-ENV-20', 'get', `/v1/environments/${environment.id}/work/stats?beta=true`],
    ['T-COMPAT-ENV-21', 'post', `/v1/environments/${environment.id}/work/work_compat/stop?beta=true`],
    ['T-COMPAT-ENV-22', 'post', `/v1/environments/${environment.id}/work/poll?beta=true`],
    ['T-COMPAT-ENV-23', 'post', `/v1/environments/${environment.id}/work/poll?beta=true`],
  ] as const;
  const evidence: Record<string, boolean> = {};
  for (const [id, method, route] of workPaths) {
    const operation = method === 'get' ? client.get(route) : client.post(route, { body: {} });
    evidence[id] = await rejectsAs(operation, 400, 'invalid_request_error', 'unsupported SDK surface');
  }
  const nullUpdate = await client.beta.environments.update(environment.id, {
    config: null,
    name: null,
    description: null,
  } as never);
  const archived = await client.beta.environments.archive(environment.id);
  const deleted = await client.beta.environments.delete(environment.id);
  return {
    ...evidence,
    'T-COMPAT-ENV-1': environment.type === 'environment',
    'T-COMPAT-ENV-2': retrieved.id === environment.id,
    'T-COMPAT-ENV-3': updated.description === 'compatibility environment',
    'T-COMPAT-ENV-4': listed,
    'T-COMPAT-ENV-5': deleted.type === 'environment_deleted',
    'T-COMPAT-ENV-6': archived.archived_at !== null,
    'T-COMPAT-ENV-7': createScopeRejected,
    'T-COMPAT-ENV-8': updateScopeRejected,
    'T-COMPAT-ENV-10': selfHostedRejected,
    'T-COMPAT-ENV-12': limitedRejected,
    'T-COMPAT-ENV-33':
      nullUpdate.config.type === 'cloud' && nullUpdate.name === '' && nullUpdate.description === '',
  };
}

async function runLiveFiles(context: ProofScenarioContext): Promise<ProofEvidence> {
  const { client } = liveContext(context);
  const bytes = Buffer.from('compatibility file\n');
  const uploaded = await client.beta.files.upload({
    file: await toFile(bytes, 'compatibility.txt'),
  });
  const retrieved = await client.beta.files.retrieveMetadata(uploaded.id);
  const listed = await includesItem(client.beta.files.list({ limit: 100 }), uploaded.id);
  const downloaded = await client.beta.files.download(uploaded.id);
  const downloadedBytes = Buffer.from(await downloaded.arrayBuffer());
  const deleted = await client.beta.files.delete(uploaded.id);
  return {
    'T-COMPAT-FILE-1': listed,
    'T-COMPAT-FILE-2': retrieved.id === uploaded.id && retrieved.type === 'file',
    'T-COMPAT-FILE-3': uploaded.filename === 'compatibility.txt' && uploaded.size_bytes === bytes.length,
    'T-COMPAT-FILE-4': deleted.id === uploaded.id && deleted.type === 'file_deleted',
    'T-COMPAT-FILE-5': downloadedBytes.equals(bytes),
    'T-COMPAT-FILE-6': uploaded.downloadable === true && downloaded.ok,
  };
}

async function runLiveMemory(context: ProofScenarioContext): Promise<ProofEvidence> {
  const { client } = liveContext(context);
  const store = await client.beta.memoryStores.create({
    name: unique('compat-memory-store'),
    metadata: { proof: 'memory' },
  });
  const retrievedStore = await client.beta.memoryStores.retrieve(store.id);
  const updatedStore = await client.beta.memoryStores.update(store.id, { description: 'updated' });
  const listedStore = await includesItem(client.beta.memoryStores.list({ limit: 100 }), store.id);
  const memory = await client.beta.memoryStores.memories.create(store.id, {
    path: '/compatibility.md',
    content: 'initial',
    view: 'full',
  });
  const retrievedMemory = await client.beta.memoryStores.memories.retrieve(memory.id, {
    memory_store_id: store.id,
    view: 'full',
  });
  const updatedMemory = await client.beta.memoryStores.memories.update(memory.id, {
    memory_store_id: store.id,
    content: 'updated',
    view: 'full',
  });
  let listedMemory = false;
  for await (const item of client.beta.memoryStores.memories.list(store.id, { limit: 100 })) {
    if (item.type === 'memory' && item.id === memory.id) listedMemory = true;
  }
  const version = await firstItem(
    client.beta.memoryStores.memoryVersions.list(store.id, { memory_id: memory.id, limit: 1 }),
  );
  const retrievedVersion = await client.beta.memoryStores.memoryVersions.retrieve(version.id, {
    memory_store_id: store.id,
  });
  const redactedVersion = await client.beta.memoryStores.memoryVersions.redact(version.id, {
    memory_store_id: store.id,
  });
  const nullCreateRejected = await rejectsAs(
    client.beta.memoryStores.memories.create(store.id, {
      path: '/null-create.md',
      content: null,
    }),
    400,
    'invalid_request_error',
  );
  const emptyMemory = await client.beta.memoryStores.memories.create(store.id, {
    path: '/empty.md',
    content: '',
    view: 'full',
  });
  const nullContentRejected = await rejectsAs(
    client.beta.memoryStores.memories.update(memory.id, {
      memory_store_id: store.id,
      content: null,
    }),
    400,
    'invalid_request_error',
  );
  const nullPathRejected = await rejectsAs(
    client.beta.memoryStores.memories.update(memory.id, {
      memory_store_id: store.id,
      path: null,
    }),
    400,
    'invalid_request_error',
  );
  const unchanged = await client.beta.memoryStores.memories.update(memory.id, {
    memory_store_id: store.id,
    view: 'full',
  });
  const preconditioned = await client.beta.memoryStores.memories.update(memory.id, {
    memory_store_id: store.id,
    content: 'preconditioned',
    precondition: { type: 'content_sha256', content_sha256: unchanged.content_sha256 },
    view: 'full',
  });
  const clearedStoreName = await client.beta.memoryStores.update(store.id, { name: null });
  const clearedStoreMetadata = await client.beta.memoryStores.update(store.id, { metadata: null });
  const deletedMemory = await client.beta.memoryStores.memories.delete(memory.id, {
    memory_store_id: store.id,
  });
  const archivedStore = await client.beta.memoryStores.archive(store.id);
  const deletedStore = await client.beta.memoryStores.delete(store.id);
  return {
    'T-COMPAT-MEM-1': store.type === 'memory_store',
    'T-COMPAT-MEM-2': retrievedStore.id === store.id,
    'T-COMPAT-MEM-3': updatedStore.description === 'updated',
    'T-COMPAT-MEM-4': listedStore,
    'T-COMPAT-MEM-5': deletedStore.id === store.id && deletedStore.type === 'memory_store_deleted',
    'T-COMPAT-MEM-6': archivedStore.archived_at !== null,
    'T-COMPAT-MEM-7': memory.type === 'memory' && memory.content === 'initial',
    'T-COMPAT-MEM-8': retrievedMemory.id === memory.id && retrievedMemory.content === 'initial',
    'T-COMPAT-MEM-9': updatedMemory.content === 'updated',
    'T-COMPAT-MEM-10': listedMemory,
    'T-COMPAT-MEM-11': deletedMemory.type === 'memory_deleted',
    'T-COMPAT-MEM-12': retrievedVersion.id === version.id,
    'T-COMPAT-MEM-13': version.memory_id === memory.id,
    'T-COMPAT-MEM-14': redactedVersion.redacted_at !== null,
    'T-COMPAT-MEM-19':
      nullCreateRejected && emptyMemory.content === '' && emptyMemory.content_size_bytes === 0,
    'T-COMPAT-MEM-20':
      nullContentRejected &&
      nullPathRejected &&
      unchanged.content === 'updated' &&
      unchanged.path === '/compatibility.md',
    'T-COMPAT-MEM-21': preconditioned.content === 'preconditioned',
    'T-COMPAT-MEM-22': clearedStoreName.name === null,
    'T-COMPAT-MEM-23': Object.keys(clearedStoreMetadata.metadata).length === 0,
  };
}

async function runLiveVaults(context: ProofScenarioContext): Promise<ProofEvidence> {
  const { client } = liveContext(context);
  const vault = await client.beta.vaults.create({
    display_name: unique('compat-vault'),
    metadata: { proof: 'vault' },
  });
  const retrievedVault = await client.beta.vaults.retrieve(vault.id);
  const updatedVault = await client.beta.vaults.update(vault.id, { display_name: 'updated vault' });
  const listedVault = await includesItem(client.beta.vaults.list({ limit: 100 }), vault.id);
  const credential = await client.beta.vaults.credentials.create(vault.id, {
    display_name: 'compat mcp oauth',
    metadata: { proof: 'credential' },
    auth: {
      type: 'mcp_oauth',
      mcp_server_url: 'https://mcp.example/sse',
      access_token: 'compat-access-token',
    },
  });
  const retrievedCredential = await client.beta.vaults.credentials.retrieve(credential.id, {
    vault_id: vault.id,
  });
  const updatedCredential = await client.beta.vaults.credentials.update(credential.id, {
    vault_id: vault.id,
    display_name: 'updated credential',
  });
  const listedCredential = await includesItem(
    client.beta.vaults.credentials.list(vault.id, { limit: 100 }),
    credential.id,
  );
  const validation = await client.beta.vaults.credentials.mcpOAuthValidate(credential.id, {
    vault_id: vault.id,
  });
  const createEnvironmentVariableRejected = await rejectsAs(
    client.beta.vaults.credentials.create(vault.id, {
      display_name: 'environment variable',
      auth: {
        type: 'environment_variable',
        networking: { type: 'unrestricted' },
        secret_name: 'COMPAT_SECRET',
        secret_value: 'secret',
      },
    }),
    400,
    'invalid_request_error',
  );
  const updateEnvironmentVariableRejected = await rejectsAs(
    client.beta.vaults.credentials.update(credential.id, {
      vault_id: vault.id,
      auth: {
        type: 'environment_variable',
        networking: { type: 'unrestricted' },
        secret_value: 'secret',
      },
    }),
    400,
    'invalid_request_error',
  );
  const vaultMetadataCleared = await client.beta.vaults.update(vault.id, { metadata: null });
  const credentialMetadataCleared = await client.beta.vaults.credentials.update(credential.id, {
    vault_id: vault.id,
    metadata: null,
  });
  const archivedCredential = await client.beta.vaults.credentials.archive(credential.id, {
    vault_id: vault.id,
  });
  const deletedCredential = await client.beta.vaults.credentials.delete(credential.id, {
    vault_id: vault.id,
  });
  const archivedVault = await client.beta.vaults.archive(vault.id);
  const deletedVault = await client.beta.vaults.delete(vault.id);
  const httpResponse = validation.mcp_probe?.http_response ?? validation.refresh?.http_response;
  return {
    'T-COMPAT-VAULT-1': vault.type === 'vault',
    'T-COMPAT-VAULT-2': retrievedVault.id === vault.id,
    'T-COMPAT-VAULT-3': updatedVault.display_name === 'updated vault',
    'T-COMPAT-VAULT-4': listedVault,
    'T-COMPAT-VAULT-5': deletedVault.type === 'vault_deleted',
    'T-COMPAT-VAULT-6': archivedVault.archived_at !== null,
    'T-COMPAT-VAULT-7': credential.type === 'vault_credential',
    'T-COMPAT-VAULT-8': retrievedCredential.id === credential.id,
    'T-COMPAT-VAULT-9': updatedCredential.display_name === 'updated credential',
    'T-COMPAT-VAULT-10': listedCredential,
    'T-COMPAT-VAULT-11': deletedCredential.type === 'vault_credential_deleted',
    'T-COMPAT-VAULT-12': archivedCredential.archived_at !== null,
    'T-COMPAT-VAULT-13': validation.credential_id === credential.id,
    'T-COMPAT-VAULT-14': createEnvironmentVariableRejected,
    'T-COMPAT-VAULT-15': updateEnvironmentVariableRejected,
    'T-COMPAT-VAULT-17': createEnvironmentVariableRejected,
    'T-COMPAT-VAULT-18': createEnvironmentVariableRejected,
    'T-COMPAT-VAULT-19': ['valid', 'invalid', 'unknown'].includes(validation.status),
    'T-COMPAT-VAULT-20': validation.mcp_probe?.method === 'initialize',
    'T-COMPAT-VAULT-21':
      validation.refresh === null ||
      ['succeeded', 'failed', 'connect_error', 'no_refresh_token'].includes(validation.refresh.status),
    'T-COMPAT-VAULT-22':
      httpResponse === null ||
      (typeof httpResponse?.status_code === 'number' && typeof httpResponse.body_truncated === 'boolean'),
    'T-COMPAT-VAULT-23':
      Object.keys(vaultMetadataCleared.metadata).length === 0 &&
      Object.keys(credentialMetadataCleared.metadata).length === 0,
  };
}

async function runLiveSkills(context: ProofScenarioContext): Promise<ProofEvidence> {
  const { client } = liveContext(context);
  const skill = await client.beta.skills.create({
    display_title: unique('compat-skill'),
    files: [
      await toFile(
        Buffer.from('# Compatibility Skill\n\nUse this skill for compatibility proof.\n'),
        'compatibility/SKILL.md',
      ),
    ],
  });
  const retrieved = await client.beta.skills.retrieve(skill.id);
  const listed = await includesItem(client.beta.skills.list({ limit: 100 }), skill.id);
  const version = await client.beta.skills.versions.create(skill.id, {
    files: [
      await toFile(
        Buffer.from('# Compatibility Skill\n\nSecond compatibility version.\n'),
        'compatibility/SKILL.md',
      ),
    ],
  });
  const retrievedVersion = await client.beta.skills.versions.retrieve(version.version, {
    skill_id: skill.id,
  });
  const listedVersion = await includesItem(
    client.beta.skills.versions.list(skill.id, { limit: 100 }),
    version.id,
  );
  const anthropicRejected = await rejectsAs(
    firstItem(client.beta.skills.list({ source: 'anthropic', limit: 1 })),
    400,
    'invalid_request_error',
  );
  const deletedVersion = await client.beta.skills.versions.delete(version.version, { skill_id: skill.id });
  const deleted = await client.beta.skills.delete(skill.id);
  return {
    'T-COMPAT-SKILL-1': skill.type === 'skill',
    'T-COMPAT-SKILL-2': retrieved.id === skill.id,
    'T-COMPAT-SKILL-3': listed,
    'T-COMPAT-SKILL-4': deleted.type === 'skill_deleted',
    'T-COMPAT-SKILL-5': version.skill_id === skill.id,
    'T-COMPAT-SKILL-6': retrievedVersion.id === version.id,
    'T-COMPAT-SKILL-7': listedVersion,
    'T-COMPAT-SKILL-8': deletedVersion.type === 'skill_version_deleted',
    'T-COMPAT-SKILL-9': anthropicRejected,
  };
}

async function runLiveDeferred(context: ProofScenarioContext): Promise<ProofEvidence> {
  const { client } = liveContext(context);
  const rejected = (operation: Promise<unknown>) =>
    rejectsAs(operation, 400, 'invalid_request_error', 'unsupported SDK surface');
  const message = {
    max_tokens: 1,
    model: 'anthropic/claude-opus-4-8',
    messages: [{ role: 'user' as const, content: 'hello' }],
  };
  const batch = { requests: [{ custom_id: 'compat', params: message }] };
  const deployment = {
    agent: 'agent_compat',
    environment_id: 'env_compat',
    initial_events: [{ type: 'user.message' as const, content: [{ type: 'text' as const, text: 'start' }] }],
    name: 'compatibility deployment',
    vault_ids: [],
  };
  const userProfile = { external_id: 'compat', relationship: 'external' as const };

  return {
    'T-COMPAT-DEFER-1': await rejected(client.beta.models.retrieve('model_compat')),
    'T-COMPAT-DEFER-2': await rejected(firstItem(client.beta.models.list())),
    'T-COMPAT-DEFER-3': await rejected(client.beta.messages.create(message)),
    'T-COMPAT-DEFER-4': await rejected(client.beta.messages.parse(message)),
    'T-COMPAT-DEFER-5': await rejected(client.beta.messages.stream(message).finalMessage()),
    'T-COMPAT-DEFER-6': await rejected(client.beta.messages.countTokens(message)),
    'T-COMPAT-DEFER-7': await rejected(
      client.beta.messages.toolRunner({ ...message, tools: [] }).runUntilDone(),
    ),
    'T-COMPAT-DEFER-8': await rejected(client.beta.messages.batches.create(batch)),
    'T-COMPAT-DEFER-9': await rejected(client.beta.messages.batches.retrieve('batch_compat')),
    'T-COMPAT-DEFER-10': await rejected(firstItem(client.beta.messages.batches.list())),
    'T-COMPAT-DEFER-11': await rejected(client.beta.messages.batches.delete('batch_compat')),
    'T-COMPAT-DEFER-12': await rejected(client.beta.messages.batches.cancel('batch_compat')),
    'T-COMPAT-DEFER-13': await rejected(client.beta.messages.batches.results('batch_compat')),
    'T-COMPAT-DEFER-14': await rejected(client.beta.deployments.create(deployment)),
    'T-COMPAT-DEFER-15': await rejected(client.beta.deployments.retrieve('deploy_compat')),
    'T-COMPAT-DEFER-16': await rejected(client.beta.deployments.update('deploy_compat', {})),
    'T-COMPAT-DEFER-17': await rejected(firstItem(client.beta.deployments.list())),
    'T-COMPAT-DEFER-18': await rejected(client.beta.deployments.archive('deploy_compat')),
    'T-COMPAT-DEFER-19': await rejected(client.beta.deployments.pause('deploy_compat')),
    'T-COMPAT-DEFER-20': await rejected(client.beta.deployments.run('deploy_compat')),
    'T-COMPAT-DEFER-21': await rejected(client.beta.deployments.unpause('deploy_compat')),
    'T-COMPAT-DEFER-22': await rejected(client.beta.deploymentRuns.retrieve('run_compat')),
    'T-COMPAT-DEFER-23': await rejected(firstItem(client.beta.deploymentRuns.list())),
    'T-COMPAT-DEFER-24': await rejected(client.beta.userProfiles.create(userProfile)),
    'T-COMPAT-DEFER-25': await rejected(client.beta.userProfiles.retrieve('profile_compat')),
    'T-COMPAT-DEFER-26': await rejected(client.beta.userProfiles.update('profile_compat', {})),
    'T-COMPAT-DEFER-27': await rejected(firstItem(client.beta.userProfiles.list())),
    'T-COMPAT-DEFER-28': await rejected(client.beta.userProfiles.createEnrollmentURL('profile_compat')),
  };
}

async function runLiveConnection(context: ProofScenarioContext): Promise<ProofEvidence> {
  const { apiKey, baseURL, client } = liveContext(context);
  let missingError: APIError | undefined;
  try {
    await client.beta.environments.retrieve('env_missing_compat');
  } catch (error) {
    missingError = error as APIError;
  }
  const file = await client.beta.files.upload({
    file: await toFile(Buffer.from('connection'), 'connection.txt'),
  });
  const filePage = await client.beta.files.list({ limit: 1, after_id: file.id });
  const environment = await createEnvironment(client);
  const page = await client.beta.environments.list({ limit: 1 });
  const betaRequest = await client.beta.environments.retrieve(
    environment.id,
    {},
    {
      headers: { 'anthropic-beta': 'managed-agents-2026-04-01' },
    },
  );
  const versionRequest = await client.beta.environments.retrieve(
    environment.id,
    {},
    {
      headers: { 'anthropic-version': '2023-06-01' },
    },
  );
  const withResponse = await client.beta.environments.retrieve(environment.id).withResponse();
  const apiKeys = await client.get('/v1/api_keys');
  const { agent } = await createSession(client);
  await client.beta.sessions.create({
    environment_id: environment.id,
    agent: { type: 'agent', id: agent.id, version: agent.version },
    vault_ids: [],
  });
  const rawSessionPage = await client.get<{ prev_page?: string | null }>('/v1/sessions?beta=true', {
    query: { limit: 1 },
  });
  const bearerClient = new Anthropic({ authToken: 'compat-bearer', baseURL, maxRetries: 0 });
  const bearerRejected = await rejectsAs(
    bearerClient.beta.environments.retrieve(environment.id),
    401,
    'authentication_error',
    'x-api-key',
  );
  return {
    'T-COMPAT-CONN-1':
      missingError?.status === 404 &&
      missingError.type === 'not_found_error' &&
      typeof missingError.requestID === 'string',
    'T-COMPAT-CONN-4': Array.isArray(filePage.data),
    'T-COMPAT-CONN-5': Array.isArray(page.data) && Object.prototype.hasOwnProperty.call(page, 'next_page'),
    'T-COMPAT-CONN-6': betaRequest.id === environment.id && apiKey.length > 0,
    'T-COMPAT-CONN-7': betaRequest.id === environment.id,
    'T-COMPAT-CONN-8': apiKeys !== null,
    'T-COMPAT-CONN-9': Object.prototype.hasOwnProperty.call(rawSessionPage, 'prev_page'),
    'T-COMPAT-CONN-16': typeof withResponse.request_id === 'string',
    'T-COMPAT-CONN-17': betaRequest.id === environment.id,
    'T-COMPAT-CONN-18': versionRequest.id === environment.id,
    'T-COMPAT-CONN-19': bearerRejected,
  };
}

async function runLiveGaps(context: ProofScenarioContext): Promise<ProofEvidence> {
  const { client } = liveContext(context);
  const environment = await client.beta.environments.create({
    name: unique('gap-environment'),
    config: { type: 'cloud', networking: { type: 'blocked' }, packages: { npm: [] } },
  });
  const agent = await createAgent(client);
  const memoryStore = await client.beta.memoryStores.create({ name: unique('gap-memory') });
  await client.beta.memoryStores.memories.create(memoryStore.id, {
    path: '/nested/compatibility.md',
    content: 'gap',
  });
  const depthZero = await firstItem(client.beta.memoryStores.memories.list(memoryStore.id, { depth: 0 }));
  const vault = await client.beta.vaults.create({ display_name: unique('gap-vault') });
  const providerOAuth = await client.beta.vaults.credentials.create(vault.id, {
    auth: {
      type: 'provider_oauth',
      provider_id: 'openai',
      access_mode: 'model_inference',
      access_token: 'gap-access-token',
      refresh_token: 'gap-refresh-token',
    },
  });
  const session = await client.beta.sessions.create({
    environment_id: environment.id,
    agent: { type: 'agent', id: agent.id, version: agent.version },
    vault_ids: [],
    resources: [
      {
        type: 'github_repository',
        url: 'https://github.com/tetral-ai/compatibility',
        mount_path: '/workspace/repository',
        checkout: { type: 'branch', name: 'main' },
      },
    ],
  });
  const github = session.resources.find((resource) => resource.type === 'github_repository');
  const toolset = agent.tools.find((tool) => tool.type === 'tetral_agent_toolset');
  const mcpAgent = await client.beta.agents.create({
    name: unique('gap-mcp-agent'),
    model: 'anthropic/claude-opus-4-8',
    mcp_servers: [{ type: 'url', name: 'github', url: 'https://api.githubcopilot.com/mcp/' }] as never,
    tools: [{ type: 'mcp_toolset', mcp_server_name: 'github' }] as never,
  });
  const mcpToolset = mcpAgent.tools.find((tool) => tool.type === 'mcp_toolset');
  const skill = await client.beta.skills.create({
    files: [await toFile(Buffer.from('# Gap Skill\n'), 'gap/SKILL.md')],
  });
  if (skill.latest_version === null) throw new Error(`Skill ${skill.id} did not expose latest_version`);
  const downloadedSkill = await client.beta.skills.versions.download(skill.latest_version, {
    skill_id: skill.id,
  });
  await client.beta.sessions.events.send(session.id, {
    events: [
      {
        type: 'user.message',
        content: [{ type: 'text', text: 'Use the Bash tool to run `printf compatibility`.' }],
      },
    ],
  });
  await waitForToolUse(client, session.id);
  let usesEventIDs = false;
  for await (const event of client.beta.sessions.events.list(session.id, { limit: 100 })) {
    if (event.type === 'session.status_idle' && event.stop_reason.type === 'requires_action') {
      usesEventIDs =
        event.stop_reason.event_ids.length > 0 &&
        !Object.prototype.hasOwnProperty.call(event.stop_reason, 'blocking_event_ids');
    }
  }
  return {
    'T-COMPAT-GAP-1':
      github?.type === 'github_repository' &&
      github.checkout?.type === 'branch' &&
      github.checkout.name === 'main',
    'T-COMPAT-GAP-2': usesEventIDs,
    'T-COMPAT-GAP-3': depthZero.type === 'memory',
    'T-COMPAT-GAP-4': ['apt', 'cargo', 'gem', 'go', 'npm', 'pip'].every((manager) =>
      Object.prototype.hasOwnProperty.call(environment.config.packages, manager),
    ),
    'T-COMPAT-GAP-5':
      toolset?.type === 'tetral_agent_toolset' &&
      toolset.default_config !== undefined &&
      Array.isArray(toolset.configs),
    'T-COMPAT-GAP-6':
      mcpToolset?.type === 'mcp_toolset' &&
      mcpToolset.default_config !== undefined &&
      Array.isArray(mcpToolset.configs),
    'T-COMPAT-GAP-7':
      providerOAuth.auth.type === 'provider_oauth' && providerOAuth.auth.has_refresh_token === true,
    'T-COMPAT-GAP-8': downloadedSkill.ok && (await downloadedSkill.arrayBuffer()).byteLength > 0,
  };
}

export const liveScenarioRunners = {
  'live-sess': runLiveSessions,
  'live-thread': runLiveThreads,
  'live-evin': runLiveEventsInput,
  'live-evout': runLiveEventsOutput,
  'live-agent': runLiveAgents,
  'live-env': runLiveEnvironments,
  'live-file': runLiveFiles,
  'live-mem': runLiveMemory,
  'live-vault': runLiveVaults,
  'live-skill': runLiveSkills,
  'live-defer': runLiveDeferred,
  'live-conn': runLiveConnection,
  'live-gap': runLiveGaps,
};
