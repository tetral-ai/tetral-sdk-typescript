/**
 * Shared fixtures for the Tetral contract test suites: canned JSON answers,
 * strict/lenient JSON body parsing for captured `fetch` calls, and
 * case-insensitive header lookup across the `HeadersInit` shapes.
 */

export function jsonResponse(body: object, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'request-id': 'req_123' },
  });
}

/** An error answer as Engine sends it: the envelope repeats the `request-id` header. */
export function errorResponse(status: number, type: string, message: string): Response {
  return jsonResponse({ type: 'error', error: { type, message }, request_id: 'req_123' }, status);
}

export function parseJSONBody(init: RequestInit | undefined): unknown {
  if (typeof init?.body !== 'string') {
    throw new Error(`Expected JSON string body, got ${typeof init?.body}`);
  }
  return JSON.parse(init.body);
}

export function parseMaybeJSONBody(init: RequestInit | undefined): unknown {
  if (init?.body == null) return undefined;
  return parseJSONBody(init);
}

export function getHeader(init: RequestInit | undefined, name: string): string | null {
  if (!init?.headers) return null;
  if (init.headers instanceof Headers) return init.headers.get(name);
  if (Array.isArray(init.headers)) {
    const entry = init.headers.find(([k]) => k?.toLowerCase() === name.toLowerCase());
    return entry?.[1] ?? null;
  }
  return (init.headers as Record<string, string>)[name] ?? null;
}

/** A Session answer with every field Engine sends. */
export const SESSION_ANSWER = {
  id: 'sesn_123',
  type: 'session',
  agent: {
    id: 'agent_123',
    description: null,
    mcp_servers: [],
    approval_mode: 'ask_for_approval',
    model: { id: 'openai/gpt-5.5' },
    multiagent: null,
    name: 'Tetral Agent',
    skills: [],
    system: null,
    tools: [
      {
        type: 'tetral_agent_toolset',
        family: 'gpt',
        configs: [],
        default_config: { enabled: true, permission_policy: { type: 'always_ask' } },
      },
    ],
    type: 'agent',
    version: 1,
  },
  archived_at: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  environment_id: 'env_123',
  metadata: {},
  outcome_evaluations: [],
  resources: [],
  stats: { active_seconds: 0, duration_seconds: 0 },
  status: 'idle',
  title: null,
  usage: {
    cache_creation: { ephemeral_1h_input_tokens: null, ephemeral_5m_input_tokens: null },
    cache_read_input_tokens: 0,
    input_tokens: 12,
    output_tokens: 7,
    server_tool_use: {
      web_fetch_requests: 1,
      web_search_requests: 2,
    },
  },
  vault_ids: [],
  deployment_id: null,
  budget: null,
  computers: [],
  drives: [],
  providers: {},
};
