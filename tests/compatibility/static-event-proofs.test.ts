import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { goFunction } from './scenarios/go-source';
import { staticScenarioRunners } from './scenarios/static';

const use = 'T-COMPAT-EVOUT-25';
const result = 'T-COMPAT-EVOUT-26';
const eventsPath = 'services/bridge/bridge_api_events.go';
const settlementPath = 'services/bridge/bridge_api_tool_settlement.go';
const sharedPath = 'internal/runtimecontrol/events.go';
// Independent source fixtures model the ownership and data flow required by these proofs.
const sources: Record<string, string> = {
  'services/agent-runtime/packages/core/src/runtime/session-event-writer.ts': '',
  'internal/httpapi/router.go': '',
  [eventsPath]: `package bridge
import "github.com/tetral-ai/tetral/internal/runtimecontrol"
func (s *PostgreSQLBridgeAPIStore) WriteEvent(request Request) {
 toolProjection, err = normalizeRuntimeToolDeclaration(toolDeclaration)
 eventType = toolProjection.EventType
 payloadJSON, err = runtimeToolEventPayloadJSON(toolProjection)
 threadScope, err := runtimecontrol.LockThreadMutationTx(ctx, tx, request.GetScope())
 durableEventType := eventType
 eventPayloadJSON := payloadJSON
 visibility, sessionVisible := threadScope.PublicProjection(durableEventType)
 tx.Exec(ctx, \`INSERT INTO session_events\`, durableEventType, eventPayloadJSON, visibility, sessionVisible)
 runtimecontrol.AppendSessionEventStreamChangeTx(ctx, tx, request.GetScope(), eventID, visibility, sessionVisible, now)
}
func normalizeRuntimeToolDeclaration(declaration Declaration) {
 switch declaration.Kind {
 case bridgev1.RuntimeToolEventKind_RUNTIME_TOOL_EVENT_KIND_MCP:
 eventType = "agent.mcp_tool_use"
 }
}
func runtimeToolEventPayloadJSON(projection Projection) {
 payload := map[string]any{
 "input":                projection.CanonicalExecutionInput,
 "name":                 projection.ToolName,
 }
 payload["mcp_server_name"] = projection.MCPServerName
}
`,
  [settlementPath]: `package bridge
import "github.com/tetral-ai/tetral/internal/runtimecontrol"
func (s *PostgreSQLBridgeAPIStore) SettleToolResult(request Request) {
 threadScope, err := runtimecontrol.LockThreadMutationTx(ctx, tx, request.GetScope())
 if toolEventType == "agent.mcp_tool_use" {
\t\t\tresultEventType = "agent.mcp_tool_result"
 }
 payloadJSON, err := durableToolResultPayloadJSON(resultEventType, toolUseEventID, settlement)
 visibility, sessionVisible := threadScope.PublicProjection(resultEventType)
 tx.Exec(ctx, \`INSERT INTO session_events\`, resultEventType, payloadJSON, visibility, sessionVisible)
 runtimecontrol.AppendSessionEventStreamChangeTx(ctx, tx, request.GetScope(), eventID, visibility, sessionVisible, now)
}
func durableToolResultPayloadJSON(eventType string) {
 payload["mcp_tool_use_id"] = toolUseEventID
 payload["content"] = []map[string]string{{"type": "text", "text": text}}
 payload["content"] = []map[string]string{{"type": "text", "text": message}}
}
`,
  [sharedPath]: `package runtimecontrol
func (s ThreadMutationScope) PublicProjection(eventType string) (string, bool) {
 if s.Visibility != "public" || s.Role == "approval_reviewer" {
\t\treturn "internal", false
\t}
\tif s.Role == "main" {
\t\treturn "public", true
\t}
}
func LockThreadMutationTx(ctx Context) {
 return LockThreadMutationRowTx(ctx, tx, scope)
}
func LockThreadMutationRowTx(ctx Context) {
 row := tx.QueryRow(ctx, \`SELECT visibility, role, status, task_name\`)
 row.Scan(&result.Visibility, &result.Role, &result.Status, &result.TaskName)
}
func AppendSessionEventStreamChangeTx(ctx Context) {
 return AppendSessionEventStreamChangeForRevisionTx(ctx, tx, scope, eventID, 1, visibility, sessionVisible, now)
}
func AppendSessionEventStreamChangeForRevisionTx(ctx Context) {
 tx.QueryRow(ctx, \`INSERT INTO session_event_stream_changes\`,
 scope.GetWorkspaceId(), scope.GetSessionId(), eventID, scope.GetSessionThreadId(), revision, visibility, sessionVisible, now)
 tx.Exec(ctx, \`UPDATE session_events SET latest_stream_position = $4\`)
}
`,
};

let engineRoot: string;
beforeEach(() => {
  engineRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk-event-proofs-'));
  for (const [file, source] of Object.entries(sources)) {
    fs.mkdirSync(path.dirname(path.join(engineRoot, file)), { recursive: true });
    fs.writeFileSync(path.join(engineRoot, file), source);
  }
});
afterEach(() => fs.rmSync(engineRoot, { recursive: true, force: true }));
const evidence = () =>
  staticScenarioRunners['static-evout']!({ kind: 'static', engineRoot, sdkRoot: process.cwd() });

test('shared projection and durable stream ownership prove both MCP events', async () => {
  expect(await evidence()).toMatchObject({ [use]: true, [result]: true });
});

test.each<[string, string, string, string, string[]]>([
  [
    'missing declaration',
    eventsPath,
    'func normalizeRuntimeToolDeclaration(',
    'func removedDeclaration(',
    [use],
  ],
  ['missing payload', eventsPath, 'func runtimeToolEventPayloadJSON(', 'func removedPayload(', [use]],
  [
    'wrong use type',
    eventsPath,
    'eventType = "agent.mcp_tool_use"',
    'eventType = "agent.server_tool_use"',
    [use],
  ],
  ['missing server identity', eventsPath, 'payload["mcp_server_name"]', 'payload["server_name"]', [use]],
  [
    'disconnected durable type',
    eventsPath,
    'durableEventType := eventType',
    'durableEventType := ignoredType',
    [use],
  ],
  [
    'disconnected durable payload',
    eventsPath,
    'eventPayloadJSON := payloadJSON',
    'eventPayloadJSON := ignoredPayload',
    [use],
  ],
  ['wrong use insert', eventsPath, 'INSERT INTO session_events', 'INSERT INTO discarded_events', [use]],
  [
    'wrong use projection',
    eventsPath,
    'threadScope.PublicProjection(durableEventType)',
    'threadScope.PublicProjection(eventType)',
    [use],
  ],
  [
    'wrong use append',
    eventsPath,
    'runtimecontrol.AppendSessionEventStreamChangeTx(ctx',
    'runtimecontrol.DiscardStreamChangeTx(ctx',
    [use],
  ],
  [
    'wrong settlement type',
    settlementPath,
    'resultEventType = "agent.mcp_tool_result"',
    'resultEventType = "agent.tool_result"',
    [result],
  ],
  [
    'wrong settlement insert',
    settlementPath,
    'INSERT INTO session_events',
    'INSERT INTO discarded_events',
    [result],
  ],
  [
    'wrong result correlation',
    settlementPath,
    'payload["mcp_tool_use_id"]',
    'payload["tool_use_id"]',
    [result],
  ],
  [
    'wrong result content',
    settlementPath,
    '"type": "text", "text": text',
    '"type": "image", "text": text',
    [result],
  ],
  [
    'missing result payload',
    settlementPath,
    'func durableToolResultPayloadJSON(',
    'func removedResultPayload(',
    [result],
  ],
  [
    'wrong result projection',
    settlementPath,
    'threadScope.PublicProjection(resultEventType)',
    'threadScope.PublicProjection(toolEventType)',
    [result],
  ],
  [
    'wrong result append',
    settlementPath,
    'runtimecontrol.AppendSessionEventStreamChangeTx(ctx',
    'runtimecontrol.DiscardStreamChangeTx(ctx',
    [result],
  ],
  [
    'missing public projection',
    sharedPath,
    'func (s ThreadMutationScope) PublicProjection(',
    'func (s ThreadMutationScope) RemovedProjection(',
    [use, result],
  ],
  [
    'nonpublic main projection',
    sharedPath,
    'return "public", true',
    'return "internal", false',
    [use, result],
  ],
  ['missing shared lock', sharedPath, 'func LockThreadMutationRowTx(', 'func RemovedLock(', [use, result]],
  ['wrong projection row', sharedPath, '&result.Visibility', '&result.IgnoredVisibility', [use, result]],
  [
    'missing shared append',
    sharedPath,
    'func AppendSessionEventStreamChangeTx(',
    'func RemovedAppend(',
    [use, result],
  ],
  [
    'missing revision helper',
    sharedPath,
    'func AppendSessionEventStreamChangeForRevisionTx(',
    'func RemovedRevision(',
    [use, result],
  ],
  [
    'wrong shared stream insert',
    sharedPath,
    'INSERT INTO session_event_stream_changes',
    'INSERT INTO discarded_changes',
    [use, result],
  ],
  [
    'wrong shared stream projection',
    sharedPath,
    'revision, visibility, sessionVisible, now)',
    'revision, "internal", false, now)',
    [use, result],
  ],
  [
    'wrong shared position update',
    sharedPath,
    'latest_stream_position = $4',
    'ignored_position = $4',
    [use, result],
  ],
])('%s fails the affected proof', async (_name, file, before, after, failed) => {
  expect(sources[file]).toContain(before);
  fs.writeFileSync(path.join(engineRoot, file), sources[file]!.replace(before, after));
  const actual = await evidence();
  expect([use, result].filter((id) => !actual[id])).toEqual(failed);
});

test('a commented call cannot replace a removed executable call', async () => {
  const call =
    'runtimecontrol.AppendSessionEventStreamChangeTx(ctx, tx, request.GetScope(), eventID, visibility, sessionVisible, now)';
  fs.writeFileSync(path.join(engineRoot, eventsPath), sources[eventsPath]!.replace(call, `// ${call}`));
  expect(await evidence()).toMatchObject({ [use]: false, [result]: true });
});

test('function extraction ignores comment, string, rune, raw SQL and nested brace decoys', () => {
  const source = `// func target() { misleading }
/* func target() { misleading } */
func target() {
 text := "escaped \\\" } {"
 rune := '}'
 sql := \`SELECT '}' /* { */\`
 if ready { nested := map[string]string{"key": "}"} }
}
func other() { unrelated() }
`;
  const body = goFunction(source, 'func target(');
  expect(body).toContain('nested := map[string]string');
  expect(body).toContain("SELECT '}'");
  expect(body).not.toContain('misleading');
  expect(body).not.toContain('unrelated');
});

test.each([
  '',
  'func other() {}',
  'func target() {',
  'func target()\nfunc other() {}',
  'func target() {}\nfunc target() {}',
  'func target() { /* unterminated',
  'func target() { text := "unterminated }',
])('missing, ambiguous or malformed function fails closed: %s', (source) => {
  expect(goFunction(source, 'func target(')).toBe('');
});
