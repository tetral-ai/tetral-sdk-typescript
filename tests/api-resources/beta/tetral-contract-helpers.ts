/**
 * Shared fixtures for the Tetral contract test suites: a canned JSON
 * `Response`, strict/lenient JSON body parsing for captured `fetch` calls,
 * and case-insensitive header lookup across the `HeadersInit` shapes.
 */

export function jsonResponse(body: object, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'request-id': 'req_123' },
  });
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
