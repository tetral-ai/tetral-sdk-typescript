/**
 * A `fetch` for tests that answer with hand-written JSON: it passes each
 * request to the test's handler and checks the request sent and the answer
 * given against the SDK's copy of Engine's OpenAPI file.
 *
 * Layer 1: nothing leaves the test process. A violation does not change what
 * the handler returns; it fails the test when the test ends, so a test that
 * expects a rejection cannot hide it.
 */
import Anthropic, { type ClientOptions } from '@tetral-ai/sdk';

import { checkAnswer, checkEvents, checkRequest } from './checker';

const violations: string[] = [];

/** Throws when an exchange since the last call departed from the copy. */
export function failOnViolations(): void {
  const found = violations.splice(0);
  if (found.length > 0) {
    throw new Error(`exchanges outside the Engine OpenAPI copy:\n${[...new Set(found)].join('\n')}`);
  }
}

// Registered once per test file that imports this module.
afterEach(failOnViolations);

export type ContractHandler = (url: string, init: RequestInit | undefined) => Response | Promise<Response>;

export interface ContractFetchOptions {
  /**
   * The one departure every request of this client makes on purpose, as the
   * violation it gives without the operation's name (`body/config: ...`), for
   * a test of how the SDK carries Engine's refusal. The same fault at another
   * place, and any other violation of such a request, still fails the test. So
   * does a request without the departure: the copy then takes what the test
   * says Engine refuses.
   */
  requestOutsideContract?: string;
}

export function contractFetch(handler: ContractHandler, options: ContractFetchOptions = {}): typeof fetch {
  return (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = String(input);
    // The multipart helper probes `fetch` with a `data:` URL; that is no request to Engine.
    if (!/^https?:/.test(url)) return handler(url, init);
    const method = init?.method ?? 'GET';
    const checked = checkRequest({ method, url, headers: new Headers(init?.headers), body: init?.body });
    const label = `${method.toUpperCase()} ${new URL(url).pathname}`;
    const departure = options.requestOutsideContract;
    // A violation reads `<method> <path> request <place>: <fault>`, or `<method> <path>: <fault>`.
    const isDeparture = (one: string) => one.replace(/^\S+ \S+( request |: )/, '') === departure;
    violations.push(...checked.violations.filter((one) => !isDeparture(one)));
    if (departure !== undefined && !checked.violations.some(isDeparture)) {
      violations.push(
        `${label} request: marked as outside the copy by ${JSON.stringify(departure)}, which it is not`,
      );
    }
    const response = await handler(url, init);
    const { status, headers } = response;
    const contentType = (headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase();
    // A stream is checked frame by frame as the SDK reads it; any other body is read whole here.
    const text = contentType === 'text/event-stream' ? undefined : await response.clone().text();
    violations.push(...checkAnswer(checked.operation, label, { status, headers, text }));
    const matched = checked.operation;
    if (contentType !== 'text/event-stream' || !matched || !response.body) return response;
    // A stream may stay open: each frame is checked as the SDK reads it.
    let pending = '';
    const decoder = new TextDecoder();
    const frames = new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        pending += decoder.decode(chunk, { stream: true });
        const end = Math.max(pending.lastIndexOf('\n\n'), pending.lastIndexOf('\r\n\r\n'));
        if (end !== -1) {
          violations.push(...checkEvents(matched, status, pending.slice(0, end)));
          pending = pending.slice(end);
        }
        controller.enqueue(chunk);
      },
      flush() {
        violations.push(...checkEvents(matched, status, pending));
      },
    });
    return new Response(response.body.pipeThrough(frames), { status, headers });
  }) as typeof fetch;
}

/** A client whose every exchange is checked against the copy. */
export function contractClient(
  options: ClientOptions & { fetch: ContractHandler },
  check: ContractFetchOptions = {},
): Anthropic {
  return new Anthropic({ ...options, fetch: contractFetch(options.fetch, check) });
}
