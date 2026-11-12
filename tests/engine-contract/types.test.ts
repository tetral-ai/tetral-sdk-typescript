/**
 * The SDK's types against its copy of Engine's OpenAPI file.
 *
 * Every event and error the copy names is typed. What the fork writes by hand
 * states what Engine does, so it says what the copy says: a hand-written type,
 * member or property allows exactly the values its schema allows. A type
 * generated from the upstream spec keeps its upstream shape; where the copy
 * names it too, as it does every event, it holds every value its schema
 * allows and may hold more. `Pair.relation` states each relation.
 *
 * Layer 1: it reads the SDK's sources and the copy, and runs the TypeScript
 * compiler inside the test process.
 */
import fs from 'node:fs';
import path from 'node:path';

import {
  STREAMS_WITHOUT_A_METHOD,
  allOperations,
  engineAPI,
  schema,
  streamEvents,
  type JSONSchema,
} from './spec';
import {
  SDKTypes,
  at,
  copyBeyondSDK,
  literals,
  mapProperties,
  memberByType,
  namesNotOffered,
  nullAsAbsent,
  omit,
  pick,
  schemaModel,
  sdkBeyondCopy,
  typeTags,
  unequal,
  type Model,
} from './type-model';

const FILES = {
  agents: 'src/resources/beta/agents/agents.ts',
  changes: 'src/resources/beta/drives/changes.ts',
  computers: 'src/resources/beta/sessions/computers.ts',
  credentials: 'src/resources/beta/vaults/credentials.ts',
  drives: 'src/resources/beta/drives/drives.ts',
  environments: 'src/resources/beta/environments/environments.ts',
  events: 'src/resources/beta/sessions/events.ts',
  files: 'src/resources/beta/drives/files.ts',
  memories: 'src/resources/beta/memory-stores/memories.ts',
  memoryVersions: 'src/resources/beta/memory-stores/memory-versions.ts',
  resources: 'src/resources/beta/sessions/resources.ts',
  sessionDrives: 'src/resources/beta/sessions/drives.ts',
  sessions: 'src/resources/beta/sessions/sessions.ts',
  shared: 'src/resources/shared.ts',
  skills: 'src/resources/beta/drives/skills.ts',
  threads: 'src/resources/beta/sessions/threads/threads.ts',
  usage: 'src/resources/beta/drives/usage.ts',
  versions: 'src/resources/beta/drives/versions.ts',
} as const;
type File = keyof typeof FILES;

/** Every source file under `src/resources`, from the repository root. */
function resourceFiles(): string[] {
  const root = path.resolve(__dirname, '../..');
  return (fs.readdirSync(path.join(root, 'src/resources'), { recursive: true }) as string[])
    .filter((file) => file.endsWith('.ts'))
    .map((file) => path.join('src/resources', file))
    .sort();
}

const sdkTypes = new SDKTypes(resourceFiles());
const sdk = (file: File, name: string): Model => sdkTypes.model(FILES[file], name);
/** The schemas a row has compared against, by name. */
const comparedSchemas = new Set<string>();
const copy = (name: string): Model => {
  comparedSchemas.add(name);
  return schemaModel(engineAPI, schema(name), `#/components/schemas/${name}`);
};

/** The names of the copy's schemas that an operation reaches: a parameter, a body, an answer or an event. */
function usedSchemas(): Set<string> {
  const reached = new Set<string>();
  const prefix = '#/components/schemas/';
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (!node || typeof node !== 'object') return;
    for (const [key, value] of Object.entries(node)) {
      if (key !== '$ref' || typeof value !== 'string' || !value.startsWith(prefix)) walk(value);
      else if (!reached.has(value.slice(prefix.length))) {
        reached.add(value.slice(prefix.length));
        walk(schema(value.slice(prefix.length)));
      }
    }
  };
  walk(engineAPI.paths);
  return reached;
}

function operation(name: string) {
  const found = allOperations().find((candidate) => candidate.name === name);
  if (!found) throw new Error(`the copy has no operation ${name}`);
  return found.operation;
}

/** The schema of each event an operation of the copy answers with, by event name. */
function copyEvents(name: string): Record<string, Model> {
  const content = operation(name).responses['200']!.content!;
  const stream = content['text/event-stream']?.['x-events'];
  if (stream) {
    return Object.fromEntries(
      Object.entries(stream).map(([event, data]) => [
        event,
        schemaModel(engineAPI, data, `${name} ${event}`),
      ]),
    );
  }
  const items = at(schemaModel(engineAPI, content['application/json']!.schema!, name), 'data', '[]');
  return Object.fromEntries(typeTags(items).map((event) => [event, memberByType(items, event)!]));
}

const sessionStream = 'GET /v1/sessions/{session_id}/events/stream';
const sessionEvents = () => sdk('events', 'BetaManagedAgentsSessionEvent');
/** The members of a union of events, by the event name each carries as its `type`. */
const byType = (union: () => Model) => (): Record<string, Model> => {
  const events = union();
  return Object.fromEntries(typeTags(events).map((tag) => [tag, memberByType(events, tag)!]));
};
/** Each operation that answers with events, and the SDK's type of each event by name. */
const EVENT_ANSWERS: Array<[operation: string, typed: () => Record<string, Model>]> = [
  ['GET /v1/sessions/{session_id}/events', byType(sessionEvents)],
  [sessionStream, byType(() => sdk('events', 'BetaManagedAgentsStreamSessionEvents'))],
  ['GET /v1/sessions/{session_id}/threads/{thread_id}/events', byType(sessionEvents)],
  [
    'GET /v1/sessions/{session_id}/threads/{thread_id}/stream',
    byType(() => sdk('threads', 'BetaManagedAgentsStreamSessionThreadEvents')),
  ],
  // The stream has one event, and its type carries no name.
  [
    'GET /v1/drives/{drive_id}/changes/stream',
    () => ({ 'drive.changed': sdk('changes', 'BetaDriveChangeNotice') }),
  ],
];

describe('every name the copy answers with is typed by the SDK', () => {
  test('every stream of the copy is one the SDK reads or one it has no method for', () => {
    const known = [...EVENT_ANSWERS.map(([name]) => name), ...STREAMS_WITHOUT_A_METHOD];
    expect(Object.keys(streamEvents()).filter((name) => !known.includes(name))).toEqual([]);
  });

  test.each(EVENT_ANSWERS)('events of %s', (name, typed) => {
    const sent = Object.keys(copyEvents(name));
    expect(sent.length).toBeGreaterThan(0);
    expect(sent.filter((event) => !(event in typed()))).toEqual([]);
  });

  test('what the fork wrote by hand is still in the copy', () => {
    const sent = EVENT_ANSWERS.flatMap(([name]) => Object.keys(copyEvents(name)));
    expect(HAND_WRITTEN_EVENTS.filter((event) => !sent.includes(event))).toEqual([]);
    const errorTypes = literals(at(copy('ErrorDetail'), 'type')).map(String);
    expect(HAND_WRITTEN_ERROR_TYPES().filter((type) => !errorTypes.includes(type))).toEqual([]);
  });

  test('a list of events holds no preview, as the copy sends one on the session stream only', () => {
    const previews = (events: string[]) => events.filter((event) => event.startsWith('event_'));
    expect(previews(Object.keys(copyEvents(sessionStream))).sort()).toEqual(['event_delta', 'event_start']);
    expect(previews(Object.keys(copyEvents('GET /v1/sessions/{session_id}/events')))).toEqual([]);
    expect(previews(typeTags(sessionEvents()))).toEqual([]);
  });

  test('error types of an error answer', () => {
    const sent = literals(at(copy('ErrorDetail'), 'type'));
    expect(sent.length).toBeGreaterThan(0);
    expect(sent.filter((type) => !literals(sdk('shared', 'ErrorType')).includes(type))).toEqual([]);
    expect(sent.filter((type) => !typeTags(sdk('shared', 'ErrorObject')).includes(String(type)))).toEqual([]);
  });

  test('model ids', () => {
    expect(literals(sdk('agents', 'BetaManagedAgentsModel')).sort()).toEqual(
      literals(copy('EngineAgentModelID')).sort(),
    );
  });

  test('previewed event types of the session stream query', () => {
    const parameter = operation(sessionStream).parameters!.find((one) => one.name === 'event_deltas[]')!;
    expect(literals(sdk('sessions', 'BetaManagedAgentsDeltaType')).sort()).toEqual(
      literals(at(schemaModel(engineAPI, parameter.schema as JSONSchema), '[]')).sort(),
    );
  });
});

interface Pair {
  name: string;
  sdk: () => Model;
  copy: () => Model;
  /**
   * `equal` unless stated:
   * - `request`: a request type that states a narrower shape than its schema,
   *   as two shapes where the schema is one object with a rule in prose. Every
   *   value it allows is one the schema allows, and it offers every property
   *   the schema takes but those named in `omits`.
   * - `holds`: an answer type generated from upstream that the copy also
   *   names. It holds every value the schema allows; what only upstream has
   *   stays.
   */
  relation?: 'request' | 'holds';
  /** Properties of the schema that a `request` type leaves out on purpose. */
  omits?: string[];
}

/** The same pair as a request type that narrows its schema. */
const request = (pair: Pair, omits: string[] = []): Pair => ({ ...pair, relation: 'request', omits });

function differences(pair: Pair): string[] {
  const [ours, theirs] = [pair.sdk(), pair.copy()];
  switch (pair.relation) {
    case 'request': {
      const omitted = (pair.omits ?? []).map((name) => `${pair.name}.${name}`);
      const missing = namesNotOffered(ours, theirs, pair.name);
      return [
        ...sdkBeyondCopy(ours, theirs, pair.name),
        ...missing
          .filter((name) => !omitted.includes(name))
          .map((name) => `${name}: the copy takes it, the SDK type does not offer it`),
        ...omitted
          .filter((name) => !missing.includes(name))
          .map((name) => `${name}: listed as left out, yet offered`),
      ];
    }
    case 'holds':
      return copyBeyondSDK(ours, theirs, pair.name);
    default:
      return unequal(ours, theirs, pair.name);
  }
}

/** A whole hand-written type and its schema. */
const whole = (file: File, type: string, schemaName: string): Pair => ({
  name: type,
  sdk: () => sdk(file, type),
  copy: () => copy(schemaName),
});

/** The properties the fork added to, or rewrote in, a type generated from upstream. */
const properties = (file: File, type: string, schemaName: string, names: string[]): Pair => ({
  name: `${type} { ${names.join(', ')} }`,
  sdk: () => pick(sdk(file, type), names),
  copy: () => pick(copy(schemaName), names),
});

/** A hand-written member of a union generated from upstream, found by its `type`. */
const member = (name: string, tag: string, sdkUnion: () => Model, copyUnion: () => Model): Pair => {
  const found = (union: Model, side: string) => {
    const one = memberByType(union, tag);
    if (!one) throw new Error(`${name}: ${side} has no member ${tag}`);
    return one;
  };
  return {
    name: `${name} member ${tag}`,
    sdk: () => found(sdkUnion(), 'the SDK type'),
    copy: () => found(copyUnion(), 'the copy'),
  };
};

/** A hand-written member of a union that a property of a type generated from upstream holds. */
const inUnion = (file: File, type: string, schemaName: string, steps: string[], tag: string): Pair =>
  member(
    `${type}.${steps.join('.')}`,
    tag,
    () => at(sdk(file, type), ...steps),
    () => at(copy(schemaName), ...steps),
  );

/** What the fork wrote into a type that states an agent: its approval mode and the Tetral toolset. */
const agentPairs = (file: File, type: string, schemaName: string): Pair[] => [
  properties(file, type, schemaName, ['approval_mode']),
  inUnion(file, type, schemaName, ['tools', '[]'], 'tetral_agent_toolset'),
];

/** What a params type states beside its query or body: the two options the SDK sends as headers. */
const SENT_AS_HEADERS = ['betas', 'workspace_id'];

/** The query an operation of the copy takes, as one object; a parameter `name[]` is the list `name`. */
function copyQuery(name: string): Model {
  const plain = (parameter: string) => parameter.replace(/\[\]$/, '');
  // The SDK writes `beta=true` into the path itself.
  const query = (operation(name).parameters ?? []).filter(
    (parameter) => parameter.in === 'query' && parameter.name !== 'beta',
  );
  return schemaModel(
    engineAPI,
    {
      type: 'object',
      additionalProperties: operation(name)['x-closed-query'] ? false : {},
      properties: Object.fromEntries(
        query.map((parameter) => [plain(parameter.name), parameter.schema ?? {}]),
      ),
      required: query.filter((parameter) => parameter.required).map((parameter) => plain(parameter.name)),
    },
    `${name} query`,
  );
}

/** A hand-written type of query parameters and the query its operation takes; a `null` is not sent. */
const query = (file: File, type: string, operationName: string): Pair =>
  request({
    name: `${type} as the query of ${operationName}`,
    sdk: () => nullAsAbsent(omit(sdk(file, type), SENT_AS_HEADERS)),
    copy: () => copyQuery(operationName),
  });

/** The same objects with the named properties read as anything, where only their names are compared. */
const namesOnly = (model: Model, names: string[]): Model =>
  mapProperties(model, (name, property) =>
    names.includes(name) ? { ...property, model: { kind: 'unknown' } } : property,
  );

/**
 * A hand-written type of a multipart upload and its schema. A file part is
 * bytes on both sides and is compared by name; a fixed `true` is sent as text.
 */
const upload = (file: File, type: string, schemaName: string): Pair => {
  const parts = Object.entries(schema(schemaName)['properties'] as Record<string, JSONSchema>)
    .filter(([, part]) => part['contentMediaType'] !== undefined)
    .map(([name]) => name);
  const asText = (model: Model): Model =>
    mapProperties(model, (_name, property) =>
      property.model.kind === 'literal' ?
        { ...property, model: { kind: 'literal', value: String(property.model.value) } }
      : property,
    );
  return request({
    name: `${type} as the form of ${schemaName}`,
    sdk: () => asText(sdkTypes.model(FILES[file], type, parts)),
    copy: () => namesOnly(copy(schemaName), parts),
  });
};

/** The members of `ErrorObject` the fork wrote; the others are generated from upstream. */
const HAND_WRITTEN_ERROR_TYPES = () => [
  'conflict_error',
  'request_too_large',
  'not_implemented',
  ...literals(at(sdk('shared', 'TetralEngineError'), 'type')).map(String),
];
/** One row for each error type the copy answers with: its member of `ErrorObject` against `ErrorDetail`. */
const errorPairs = (): Pair[] =>
  literals(at(copy('ErrorDetail'), 'type')).map((type): Pair => {
    const tag = String(type);
    return {
      ...member(
        'ErrorObject',
        tag,
        () => sdk('shared', 'ErrorObject'),
        () => copy('ErrorDetail'),
      ),
      ...(HAND_WRITTEN_ERROR_TYPES().includes(tag) ? {} : { relation: 'holds' }),
    };
  });

const sessionError = (union: Model) => at(memberByType(union, 'session.error')!, 'error');
const copySessionErrors = () => sessionError(at(copy('BetaManagedAgentsListSessionEvents'), 'data', '[]'));
const errorMember = (tag: string): Pair =>
  member('session.error', tag, () => sessionError(sessionEvents()), copySessionErrors);
const HAND_WRITTEN_ERRORS = [
  'computer_preparation_error',
  'computer_cleanup_error',
  'computer_sandbox_error',
  'drive_mount_error',
  'drive_changes_lost_error',
];
/** The events the fork wrote by hand; every other event is generated from upstream. */
const HAND_WRITTEN_EVENTS = ['session.computer_replaced', 'drive.changed'];
/**
 * One row for each event the copy names on each operation. A hand-written
 * event equals its schema; an event generated from upstream holds every value
 * its schema allows, and may hold more.
 */
const eventPairs = (): Pair[] =>
  EVENT_ANSWERS.flatMap(([name, typed]) =>
    Object.keys(copyEvents(name)).map(
      (tag): Pair => ({
        name: `events of ${name} member ${tag}`,
        sdk: () => {
          const event = typed()[tag];
          if (!event) throw new Error(`the SDK types no event ${tag}`);
          return event;
        },
        copy: () => copyEvents(name)[tag]!,
        ...(HAND_WRITTEN_EVENTS.includes(tag) ? {} : { relation: 'holds' }),
      }),
    ),
  );

/** The names of the copy's schemas that an answer of any operation reaches. */
function answerSchemas(): string[] {
  const reached = new Set<string>();
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (!node || typeof node !== 'object') return;
    for (const [key, value] of Object.entries(node)) {
      const prefix = '#/components/schemas/';
      if (key !== '$ref' || typeof value !== 'string' || !value.startsWith(prefix)) walk(value);
      else if (!reached.has(value.slice(prefix.length))) {
        reached.add(value.slice(prefix.length));
        walk(schema(value.slice(prefix.length)));
      }
    }
  };
  for (const { operation } of allOperations()) walk(operation.responses['200']?.content);
  return [...reached].sort();
}

/**
 * One row for each schema of an answer that an SDK type has the name of. Such
 * a type is generated from upstream, wholly or but for what the fork added: it
 * holds every value its schema allows and declares every property the schema
 * declares, so a developer reads what Engine sends without a cast.
 */
const answerPairs = (): Pair[] =>
  answerSchemas().flatMap((name) =>
    sdkTypes.declaring(name).map(
      (file): Pair => ({
        name: `${name} (${file})`,
        sdk: () => sdkTypes.model(file, name),
        copy: () => copy(name),
        relation: 'holds',
      }),
    ),
  );

/**
 * Differences a row is known to have, each with the reason it is none in
 * practice. A listed difference that is gone fails its row.
 */
const EXCEPTIONS: Record<string, string[]> = {
  // Engine writes the field only with `beta=true`, and the beta models resource
  // always sends it: tests/api-resources/beta/models-contract.test.ts.
  'BetaModelInfo (src/resources/beta/models.ts)': [
    'BetaModelInfo (src/resources/beta/models.ts).allowed_fallback_models: may be absent in the copy, required in the SDK type',
  ],
};

const PAIRS: Pair[] = [
  // Events, and the members of `session.error`.
  ...eventPairs(),
  ...answerPairs(),
  ...errorPairs(),
  ...HAND_WRITTEN_ERRORS.map(errorMember),
  // The other members are generated from upstream: each holds what the copy sends.
  ...typeTags(copySessionErrors())
    .filter((tag) => !HAND_WRITTEN_ERRORS.includes(tag))
    .map((tag): Pair => ({ ...errorMember(tag), relation: 'holds' })),

  // Agents.
  whole('agents', 'AgentApprovalMode', 'SessionApprovalMode'),
  whole('agents', 'BetaManagedAgentsTetralAgentToolset', 'EngineAgentTetralToolset'),
  whole('agents', 'BetaManagedAgentsTetralAgentToolsetParams', 'EngineAgentTetralToolsetParams'),
  ...agentPairs('agents', 'BetaManagedAgentsAgent', 'BetaManagedAgentsAgent'),
  ...agentPairs('agents', 'AgentCreateParams', 'BetaManagedAgentsCreateAgentParams'),
  ...agentPairs('agents', 'AgentUpdateParams', 'BetaManagedAgentsUpdateAgentParams'),
  ...agentPairs('agents', 'BetaManagedAgentsSessionThreadAgent', 'BetaManagedAgentsSessionThreadAgent'),
  ...agentPairs('sessions', 'BetaManagedAgentsSessionAgent', 'BetaManagedAgentsSessionAgent'),
  ...agentPairs('sessions', 'BetaManagedAgentsSessionAgentUpdate', 'BetaManagedAgentsSessionAgentUpdate'),

  // Environments.
  ...['blocked', 'cidr_allow_list'].flatMap((tag) => [
    inUnion('environments', 'BetaCloudConfig', 'BetaCloudConfig', ['networking'], tag),
    inUnion('environments', 'BetaCloudConfigParams', 'BetaCloudConfigParams', ['networking'], tag),
  ]),

  // Vault credentials.
  ...['provider_api_key', 'provider_oauth'].flatMap((tag) => [
    inUnion('credentials', 'BetaManagedAgentsCredential', 'BetaManagedAgentsCredential', ['auth'], tag),
    inUnion(
      'credentials',
      'CredentialCreateParams',
      'BetaManagedAgentsCreateCredentialRequestBody',
      ['auth'],
      tag,
    ),
    // An update names its `type`; Engine takes the others only when they repeat what is stored.
    request(
      inUnion(
        'credentials',
        'CredentialUpdateParams',
        'BetaManagedAgentsUpdateCredentialRequestBody',
        ['auth'],
        tag,
      ),
      tag === 'provider_oauth' ?
        ['provider_id', 'access_mode', 'account_id']
      : ['provider_id', 'access_mode'],
    ),
  ]),

  // Drives.
  query('drives', 'DriveListParams', 'GET /v1/drives'),
  query('changes', 'DriveChangeListParams', 'GET /v1/drives/{drive_id}/changes'),
  query('files', 'DriveFileListParams', 'GET /v1/drives/{drive_id}/files'),
  query('files', 'DriveFileDownloadParams', 'GET /v1/drives/{drive_id}/files/content'),
  query('files', 'DriveFileDeleteParams', 'DELETE /v1/drives/{drive_id}/files'),
  query('skills', 'DriveSkillListParams', 'GET /v1/drives/{drive_id}/skills'),
  query('versions', 'DriveFileVersionListParams', 'GET /v1/drives/{drive_id}/files/versions'),
  upload('files', 'DriveFileUploadParams', 'DriveFileUploadRequest'),
  upload('skills', 'DriveSkillUploadParams', 'DriveSkillUploadRequest'),
  whole('drives', 'BetaDrive', 'DriveObject'),
  whole('drives', 'BetaDriveMemory', 'DriveMemory'),
  whole('drives', 'BetaDriveLimits', 'DriveLimits'),
  whole('drives', 'BetaDriveWriter', 'DriveWriter'),
  whole('drives', 'BetaDriveRestoreResult', 'DriveRestoreResult'),
  whole('drives', 'DriveCreateParams', 'DriveCreateRequest'),
  whole('drives', 'DriveUpdateParams', 'DriveUpdateRequest'),
  whole('drives', 'DriveRestoreParams', 'DriveRestoreRequest'),
  whole('changes', 'BetaDriveChange', 'DriveChangeRecord'),
  whole('changes', 'BetaDriveChangeList', 'DriveChangeList'),
  whole('files', 'BetaDriveFile', 'DriveFileEntry'),
  whole('files', 'BetaDriveUploadResult', 'DriveFileWriteResult'),
  whole('files', 'BetaDriveDeleteResult', 'DriveFileDeleteResult'),
  whole('skills', 'BetaDriveSkill', 'DriveSkill'),
  whole('usage', 'BetaDriveUsage', 'DriveWorkspaceUsage'),
  whole('versions', 'BetaDriveVersion', 'DriveVersion'),

  // Sessions, their computers and drives.
  whole('sessions', 'TetralGitIdentity', 'SessionGitIdentity'),
  whole('sessions', 'TetralSessionProviderSelector', 'SessionProviderSelector'),
  // Two shapes: an environment with its resources, or computers.
  request({
    name: 'SessionCreateParams',
    // `resources` holds upstream's request types, which are not held to the copy.
    sdk: () => namesOnly(omit(sdk('sessions', 'SessionCreateParams'), SENT_AS_HEADERS), ['resources']),
    copy: () => namesOnly(copy('BetaManagedAgentsCreateSessionParams'), ['resources']),
  }),
  properties('sessions', 'BetaManagedAgentsSession', 'BetaManagedAgentsSession', [
    'computers',
    'drives',
    'providers',
  ]),
  properties(
    'resources',
    'BetaManagedAgentsGitHubRepositoryResource',
    'BetaManagedAgentsGitHubRepositoryResource',
    ['git_identity'],
  ),
  properties('resources', 'BetaManagedAgentsMemoryStoreResource', 'BetaManagedAgentsMemoryStoreResource', [
    'id',
    'created_at',
    'updated_at',
  ]),
  properties(
    'sessions',
    'BetaManagedAgentsGitHubRepositoryResourceParams',
    'BetaManagedAgentsGitHubRepositoryResourceParams',
    ['git_identity'],
  ),
  // Two shapes: a cloud computer of an environment, or a machine of the user.
  request({
    name: 'BetaCloudComputerParams | BetaUserComputerParams',
    sdk: () => ({
      kind: 'union',
      members: [sdk('computers', 'BetaCloudComputerParams'), sdk('computers', 'BetaUserComputerParams')],
    }),
    copy: () => copy('SessionComputerEntry'),
  }),
  whole('computers', 'BetaComputer', 'SessionComputer'),
  whole('computers', 'BetaComputerRepository', 'SessionComputerRepository'),
  // Two shapes of `checkout`: a branch by name, or a commit by sha.
  request(whole('computers', 'BetaComputerRepositoryParams', 'SessionComputerRepositoryRequest')),
  whole('computers', 'BetaDriveExclude', 'SessionComputerDriveExcludeObject'),
  // The same type is sent, where the schema also takes an entry that names nothing.
  request({
    ...whole('computers', 'BetaDriveExclude', 'SessionComputerDriveExclude'),
    name: 'BetaDriveExclude, sent',
  }),
  {
    name: 'BetaSessionDriveAccess',
    sdk: () => sdk('sessionDrives', 'BetaSessionDriveAccess'),
    copy: () => at(copy('SessionDriveBinding'), 'access'),
  },
  whole('sessionDrives', 'BetaSessionDrive', 'SessionDriveBinding'),
  whole('sessionDrives', 'BetaSessionDriveParams', 'SessionDriveBindingCreateRequest'),
  whole('sessionDrives', 'SessionDriveUpdateParams', 'SessionDriveAccessUpdateRequest'),

  // Memories and their versions.
  {
    name: 'MemoryListParams { order_by, order }',
    sdk: () => pick(sdk('memories', 'MemoryListParams'), ['order_by', 'order']),
    copy: () => pick(copyQuery('GET /v1/memory_stores/{memory_store_id}/memories'), ['order_by', 'order']),
  },
  properties('memoryVersions', 'BetaManagedAgentsMemoryVersion', 'BetaManagedAgentsMemoryVersion', [
    'created_by',
    'path',
    'redacted_at',
    'redacted_by',
  ]),
];

describe('a type says what the copy says', () => {
  // `%s` prints the whole name; `$name` would cut it short.
  test.each(PAIRS.map((pair) => [pair.name, pair] as const))('%s', (_name, pair) => {
    const excepted = EXCEPTIONS[pair.name] ?? [];
    const all = differences(pair);
    const found = [
      ...all.filter((line) => !excepted.includes(line)),
      ...excepted
        .filter((line) => !all.includes(line))
        .map((line) => `listed as an exception, yet not found: ${line}`),
    ];
    // An error of its own, so a failure prints every difference in full.
    if (found.length > 0) throw new Error(found.join('\n'));
  });
});

// A row names its schema. When a retaken copy answers an operation with another
// schema and keeps the old one, the row would still compare against the old one.
test('every schema a row compares against is one an operation of the copy uses', () => {
  for (const pair of PAIRS) {
    try {
      pair.copy();
    } catch {
      // A schema the copy lacks fails the row itself.
    }
  }
  const used = usedSchemas();
  expect(comparedSchemas.size).toBeGreaterThan(0);
  expect([...comparedSchemas].filter((name) => !used.has(name)).sort()).toEqual([]);
});
