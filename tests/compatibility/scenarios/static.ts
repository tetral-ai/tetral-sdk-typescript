import fs from 'node:fs';
import path from 'node:path';

import ts from 'typescript';

import { goFunction } from './go-source';

import type { ProofEvidence, ProofScenarioContext, StaticProofScenarioContext } from '../proof-types';

function staticContext(context: ProofScenarioContext): StaticProofScenarioContext {
  if (context.kind !== 'static') throw new Error('Static compatibility scenario requires source roots');
  return context;
}

function read(root: string, relativePath: string): string {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function typeAliasStringMembers(source: string, aliasName: string): Set<string> {
  const file = ts.createSourceFile('compatibility.ts', source, ts.ScriptTarget.Latest, true);
  const members = new Set<string>();
  for (const statement of file.statements) {
    if (!ts.isTypeAliasDeclaration(statement) || statement.name.text !== aliasName) continue;
    const types = ts.isUnionTypeNode(statement.type) ? statement.type.types : [statement.type];
    for (const type of types) {
      if (ts.isLiteralTypeNode(type) && ts.isStringLiteral(type.literal)) members.add(type.literal.text);
      if (ts.isTypeReferenceNode(type)) members.add(type.typeName.getText(file));
    }
  }
  return members;
}

async function runStaticSessions(context: ProofScenarioContext): Promise<ProofEvidence> {
  const { engineRoot } = staticContext(context);
  const service = read(engineRoot, 'internal/session/service.go');
  const compatibilityTest = read(engineRoot, 'internal/session/sdk_compatibility_test.go');
  const httpIntegrationTest = read(
    engineRoot,
    'internal/httpapi/session_real_dependencies_integration_test.go',
  );
  const assemble = service.slice(
    service.indexOf('func (s *Service) assemble('),
    service.indexOf('func sessionAgentResponse('),
  );
  const agentProjection = service.slice(
    service.indexOf('func sessionAgentResponse('),
    service.indexOf('func (s *Service) assembleThreads('),
  );
  return {
    'T-COMPAT-SESS-8': assemble.includes('OutcomeEvaluations: agent.RawArray{}'),
    'T-COMPAT-SESS-9': agentProjection.includes('Multiagent:   nil'),
    'T-COMPAT-SESS-10': !assemble.includes('DeploymentID:'),
    'T-COMPAT-SESS-16':
      service.includes('agent must declare exactly one tetral_agent_toolset entry; update the agent') &&
      compatibilityTest.includes(
        'agent must declare exactly one tetral_agent_toolset entry; update the agent',
      ) &&
      httpIntegrationTest.includes('TestSessionHTTPCompatibilityPinsToolFamilyAndRejectsPreLawAgent') &&
      httpIntegrationTest.includes('UPDATE agent_versions SET config_json') &&
      httpIntegrationTest.includes(
        'agent must declare exactly one tetral_agent_toolset entry; update the agent',
      ),
  };
}

async function runStaticThreads(context: ProofScenarioContext): Promise<ProofEvidence> {
  const { engineRoot } = staticContext(context);
  const api = read(engineRoot, 'internal/session/api.go');
  const response = api.slice(
    api.indexOf('type ThreadResponse struct'),
    api.indexOf('type ThreadAgentResponse struct'),
  );
  const nullableStats = /Stats\s+\*(?:ThreadStats|struct\s*\{)/.test(response);
  return {
    'T-COMPAT-THREAD-7': nullableStats && response.includes('active_seconds'),
    'T-COMPAT-THREAD-8': nullableStats && response.includes('duration_seconds'),
    'T-COMPAT-THREAD-9': nullableStats && response.includes('startup_seconds'),
  };
}

async function runStaticEventsInput(context: ProofScenarioContext): Promise<ProofEvidence> {
  const { sdkRoot } = staticContext(context);
  const source = read(sdkRoot, 'src/resources/beta/sessions/events.ts');
  const file = ts.createSourceFile('events.ts', source, ts.ScriptTarget.Latest, true);
  const methods = new Set<string>();
  for (const statement of file.statements) {
    if (!ts.isClassDeclaration(statement) || statement.name?.text !== 'Events') continue;
    for (const member of statement.members) {
      if (ts.isMethodDeclaration(member) && member.name && ts.isIdentifier(member.name))
        methods.add(member.name.text);
    }
  }
  return { 'T-COMPAT-EVIN-13': methods.has('send') && !methods.has('create') };
}

const notProducedEventTypes: ReadonlyArray<readonly [string, string]> = [
  ['T-COMPAT-EVOUT-24', 'agent.custom_tool_use'],
  ['T-COMPAT-EVOUT-27', 'span.outcome_evaluation_start'],
  ['T-COMPAT-EVOUT-28', 'span.outcome_evaluation_end'],
  ['T-COMPAT-EVOUT-29', 'span.outcome_evaluation_ongoing'],
  ['T-COMPAT-EVOUT-30', 'user.custom_tool_result'],
  ['T-COMPAT-EVOUT-31', 'user.define_outcome'],
  ['T-COMPAT-EVOUT-32', 'user.tool_result'],
  ['T-COMPAT-EVOUT-33', 'system.message'],
  ['T-COMPAT-EVOUT-35', 'event_start'],
  ['T-COMPAT-EVOUT-36', 'event_delta'],
] as const;

const notProducedWebhookIDs = [
  'T-COMPAT-EVOUT-40',
  'T-COMPAT-EVOUT-41',
  'T-COMPAT-EVOUT-42',
  'T-COMPAT-EVOUT-43',
  'T-COMPAT-EVOUT-44',
  'T-COMPAT-EVOUT-45',
  'T-COMPAT-EVOUT-46',
  'T-COMPAT-EVOUT-47',
  'T-COMPAT-EVOUT-48',
  'T-COMPAT-EVOUT-49',
  'T-COMPAT-EVOUT-50',
  'T-COMPAT-EVOUT-51',
  'T-COMPAT-EVOUT-52',
  'T-COMPAT-EVOUT-53',
  'T-COMPAT-EVOUT-54',
  'T-COMPAT-EVOUT-55',
  'T-COMPAT-EVOUT-56',
  'T-COMPAT-EVOUT-57',
  'T-COMPAT-EVOUT-58',
  'T-COMPAT-EVOUT-59',
  'T-COMPAT-EVOUT-60',
  'T-COMPAT-EVOUT-61',
  'T-COMPAT-EVOUT-62',
  'T-COMPAT-EVOUT-63',
  'T-COMPAT-EVOUT-64',
  'T-COMPAT-EVOUT-65',
  'T-COMPAT-EVOUT-66',
  'T-COMPAT-EVOUT-67',
  'T-COMPAT-EVOUT-68',
  'T-COMPAT-EVOUT-69',
  'T-COMPAT-EVOUT-70',
  'T-COMPAT-EVOUT-71',
  'T-COMPAT-EVOUT-72',
  'T-COMPAT-EVOUT-73',
  'T-COMPAT-EVOUT-74',
  'T-COMPAT-EVOUT-75',
  'T-COMPAT-EVOUT-76',
  'T-COMPAT-EVOUT-77',
  'T-COMPAT-EVOUT-78',
] as const;

async function runStaticEventsOutput(context: ProofScenarioContext): Promise<ProofEvidence> {
  const { engineRoot } = staticContext(context);
  const writer = read(engineRoot, 'services/agent-runtime/packages/core/src/runtime/session-event-writer.ts');
  const bridgeEvents = read(engineRoot, 'services/bridge/bridge_api_events.go');
  const bridgeSettlement = read(engineRoot, 'services/bridge/bridge_api_tool_settlement.go');
  const router = read(engineRoot, 'internal/httpapi/router.go');
  const evidence: Record<string, boolean> = {};
  for (const [id, eventType] of notProducedEventTypes) evidence[id] = !writer.includes(`"${eventType}"`);
  const sharedEvents = read(engineRoot, 'internal/runtimecontrol/events.go');
  const durableWrite = goFunction(bridgeEvents, 'func (s *PostgreSQLBridgeAPIStore) WriteEvent(');
  const publicProjection = goFunction(sharedEvents, 'func (s ThreadMutationScope) PublicProjection(');
  const toolDeclaration = goFunction(bridgeEvents, 'func normalizeRuntimeToolDeclaration(');
  const toolPayload = goFunction(bridgeEvents, 'func runtimeToolEventPayloadJSON(');
  const durableSettlement = goFunction(
    bridgeSettlement,
    'func (s *PostgreSQLBridgeAPIStore) SettleToolResult(',
  );
  const resultPayload = goFunction(bridgeSettlement, 'func durableToolResultPayloadJSON(');
  const lock = goFunction(sharedEvents, 'func LockThreadMutationTx(');
  const lockRow = goFunction(sharedEvents, 'func LockThreadMutationRowTx(');
  const append = goFunction(sharedEvents, 'func AppendSessionEventStreamChangeTx(');
  const appendRevision = goFunction(sharedEvents, 'func AppendSessionEventStreamChangeForRevisionTx(');
  const sharedOwnership =
    bridgeEvents.includes('"github.com/tetral-ai/tetral/internal/runtimecontrol"') &&
    bridgeSettlement.includes('"github.com/tetral-ai/tetral/internal/runtimecontrol"') &&
    lock.includes('return LockThreadMutationRowTx(ctx, tx, scope)') &&
    lockRow.includes('SELECT visibility, role, status, task_name') &&
    lockRow.includes('&result.Visibility, &result.Role, &result.Status, &result.TaskName') &&
    append.includes(
      'return AppendSessionEventStreamChangeForRevisionTx(ctx, tx, scope, eventID, 1, visibility, sessionVisible, now)',
    ) &&
    appendRevision.includes('INSERT INTO session_event_stream_changes') &&
    appendRevision
      .replace(/\s+/g, ' ')
      .includes(
        'scope.GetWorkspaceId(), scope.GetSessionId(), eventID, scope.GetSessionThreadId(), revision, visibility, sessionVisible, now',
      ) &&
    appendRevision.includes('UPDATE session_events') &&
    appendRevision.includes('latest_stream_position = $4');
  const mainThreadPublicProjection =
    `if s.Visibility != "public" || s.Role == "approval_reviewer" {\n` +
    `\t\treturn "internal", false\n` +
    `\t}\n` +
    `\tif s.Role == "main" {\n` +
    `\t\treturn "public", true\n` +
    `\t}`;
  // MCP events are derived from typed declarations and settlements, rather than
  // accepted as generic WriteEvent event types. Keep both durable/public paths.
  evidence['T-COMPAT-EVOUT-25'] =
    sharedOwnership &&
    toolDeclaration.includes('case bridgev1.RuntimeToolEventKind_RUNTIME_TOOL_EVENT_KIND_MCP:') &&
    toolDeclaration.includes('eventType = "agent.mcp_tool_use"') &&
    toolPayload.includes('"input":                projection.CanonicalExecutionInput') &&
    toolPayload.includes('"name":                 projection.ToolName') &&
    toolPayload.includes('payload["mcp_server_name"] = projection.MCPServerName') &&
    toolDeclaration.replace(/\s+/g, ' ').includes('EventType: eventType,') &&
    toolDeclaration.includes(
      'return preparedRuntimeToolDeclaration{projection: projection, contextParts: parts}, nil',
    ) &&
    durableWrite.includes('prepared, prepareErr := normalizeRuntimeToolDeclaration(toolDeclaration)') &&
    durableWrite.includes('err = prepareErr') &&
    durableWrite.includes('toolProjection = prepared.projection') &&
    durableWrite.includes('eventType = toolProjection.EventType') &&
    durableWrite.includes('payloadJSON, err = runtimeToolEventPayloadJSON(toolProjection)') &&
    durableWrite.includes(
      'threadScope, err := runtimecontrol.LockThreadMutationTx(ctx, tx, request.GetScope())',
    ) &&
    durableWrite.includes('durableEventType := eventType') &&
    durableWrite.includes('eventPayloadJSON := payloadJSON') &&
    durableWrite.includes('INSERT INTO session_events') &&
    durableWrite
      .replace(/\s+/g, ' ')
      .includes('durableEventType, eventPayloadJSON, visibility, sessionVisible') &&
    durableWrite.includes('visibility, sessionVisible := threadScope.PublicProjection(durableEventType)') &&
    publicProjection.includes(mainThreadPublicProjection) &&
    durableWrite.includes(
      'runtimecontrol.AppendSessionEventStreamChangeTx(ctx, tx, request.GetScope(), eventID, visibility, sessionVisible, now)',
    );
  evidence['T-COMPAT-EVOUT-26'] =
    sharedOwnership &&
    durableSettlement.includes(
      'if toolEventType == "agent.mcp_tool_use" {\n\t\t\tresultEventType = "agent.mcp_tool_result"',
    ) &&
    durableSettlement.includes(
      'payloadJSON, err := durableToolResultPayloadJSON(resultEventType, toolUseEventID, settlement)',
    ) &&
    durableSettlement.includes(
      'threadScope, err := runtimecontrol.LockThreadMutationTx(ctx, tx, request.GetScope())',
    ) &&
    durableSettlement.includes('INSERT INTO session_events') &&
    durableSettlement.includes('resultEventType, payloadJSON, visibility, sessionVisible') &&
    durableSettlement.includes(
      'visibility, sessionVisible := threadScope.PublicProjection(resultEventType)',
    ) &&
    publicProjection.includes(mainThreadPublicProjection) &&
    durableSettlement.includes(
      'runtimecontrol.AppendSessionEventStreamChangeTx(ctx, tx, request.GetScope(), eventID, visibility, sessionVisible, now)',
    ) &&
    resultPayload.includes('payload["mcp_tool_use_id"] = toolUseEventID') &&
    resultPayload.includes('payload["content"] = []map[string]string{{"type": "text", "text": text}}') &&
    resultPayload.includes('payload["content"] = []map[string]string{{"type": "text", "text": message}}');
  evidence['T-COMPAT-EVOUT-38'] =
    !writer.includes('"billing_error"') && !writer.includes('"credential_host_unreachable_error"');
  evidence['T-COMPAT-EVOUT-39'] =
    !writer.includes('ImageBlock') && !writer.includes('DocumentBlock') && !writer.includes('SearchResult');
  const webhookRouteAbsent = !router.includes('/v1/webhooks');
  for (const id of notProducedWebhookIDs) evidence[id] = webhookRouteAbsent;
  return evidence;
}

async function runStaticEnvironments(context: ProofScenarioContext): Promise<ProofEvidence> {
  const { engineRoot } = staticContext(context);
  const model = read(engineRoot, 'internal/environment/environment.go');
  const selfHostedAbsent = !model.includes('self_hosted');
  const limitedAbsent = !model.includes('type BetaLimitedNetwork') && !model.includes('allowed_hosts');
  return {
    'T-COMPAT-ENV-9': !model.includes('json:"scope"'),
    'T-COMPAT-ENV-11': selfHostedAbsent,
    'T-COMPAT-ENV-13': limitedAbsent,
    'T-COMPAT-ENV-24': selfHostedAbsent,
    'T-COMPAT-ENV-25': selfHostedAbsent,
    'T-COMPAT-ENV-26': selfHostedAbsent,
    'T-COMPAT-ENV-27': selfHostedAbsent,
    'T-COMPAT-ENV-28': selfHostedAbsent,
    'T-COMPAT-ENV-29': selfHostedAbsent,
    'T-COMPAT-ENV-30': selfHostedAbsent,
    'T-COMPAT-ENV-31': selfHostedAbsent,
    'T-COMPAT-ENV-32': selfHostedAbsent,
  };
}

async function runStaticMemory(context: ProofScenarioContext): Promise<ProofEvidence> {
  const { engineRoot } = staticContext(context);
  const errors = read(engineRoot, 'internal/httpapi/errors.go');
  return {
    'T-COMPAT-MEM-15': !errors.includes('memory_path_conflict_error'),
    'T-COMPAT-MEM-16': !errors.includes('memory_precondition_failed_error'),
    'T-COMPAT-MEM-17':
      errors.includes(
        'return classified(http.StatusConflict, "invalid_request_error", memoryPrecondition.Message)',
      ) &&
      errors.includes(
        'return classified(http.StatusConflict, "invalid_request_error", memoryConflict.Message)',
      ),
    'T-COMPAT-MEM-18': !errors.includes('BetaManagedAgentsError'),
  };
}

async function runStaticVaults(context: ProofScenarioContext): Promise<ProofEvidence> {
  const { engineRoot } = staticContext(context);
  const model = read(engineRoot, 'internal/vault/vault.go');
  return { 'T-COMPAT-VAULT-16': !model.includes('environment_variable') };
}

async function runStaticDeferred(context: ProofScenarioContext): Promise<ProofEvidence> {
  const { engineRoot, sdkRoot } = staticContext(context);
  const webhooks = read(sdkRoot, 'src/resources/beta/webhooks.ts');
  const router = read(engineRoot, 'internal/httpapi/router.go');
  return {
    'T-COMPAT-DEFER-29': webhooks.includes('unwrap(') && !router.includes('/v1/webhooks'),
  };
}

async function runStaticConnection(context: ProofScenarioContext): Promise<ProofEvidence> {
  const { engineRoot, sdkRoot } = staticContext(context);
  const shared = read(sdkRoot, 'src/resources/shared.ts');
  const errorObjects = typeAliasStringMembers(shared, 'ErrorObject');
  const errorTypes = typeAliasStringMembers(shared, 'ErrorType');
  const resources = read(sdkRoot, 'src/resources.ts') + read(sdkRoot, 'src/resources/index.ts');
  const engineErrors = read(engineRoot, 'internal/httpapi/errors.go');
  return {
    'T-COMPAT-CONN-2': [
      'InvalidRequestError',
      'AuthenticationError',
      'PermissionError',
      'NotFoundError',
      'APIErrorObject',
    ].every((member) => errorObjects.has(member)),
    'T-COMPAT-CONN-3': [
      'invalid_request_error',
      'authentication_error',
      'permission_error',
      'not_found_error',
      'api_error',
    ].every((member) => errorTypes.has(member)),
    'T-COMPAT-CONN-10': !resources.includes('TokenPage<'),
    'T-COMPAT-CONN-11': !engineErrors.includes('"rate_limit_error"'),
    'T-COMPAT-CONN-12': !engineErrors.includes('"timeout_error"'),
    'T-COMPAT-CONN-13': !engineErrors.includes('"overloaded_error"'),
    'T-COMPAT-CONN-14': !engineErrors.includes('"billing_error"'),
    'T-COMPAT-CONN-15':
      ['conflict_error', 'request_too_large', 'not_implemented'].every((member) => errorTypes.has(member)) &&
      ['ConflictError', 'RequestTooLargeError', 'NotImplementedError'].every((member) =>
        errorObjects.has(member),
      ),
  };
}

export const staticScenarioRunners = {
  'static-sess': runStaticSessions,
  'static-thread': runStaticThreads,
  'static-evin': runStaticEventsInput,
  'static-evout': runStaticEventsOutput,
  'static-env': runStaticEnvironments,
  'static-mem': runStaticMemory,
  'static-vault': runStaticVaults,
  'static-defer': runStaticDeferred,
  'static-conn': runStaticConnection,
};
