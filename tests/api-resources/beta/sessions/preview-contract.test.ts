import Anthropic from '@tetral-ai/sdk';
import { accumulateManagedAgentsEvent, type AccumulatedEvent } from '@tetral-ai/sdk/lib/sessions/accumulate';
import type { BetaManagedAgentsStreamSessionEvents } from '@tetral-ai/sdk/resources/beta/sessions/events';

const final = (id: string, text: string): BetaManagedAgentsStreamSessionEvents => ({
  id,
  type: 'agent.message',
  content: [{ type: 'text', text }],
  processed_at: '2026-10-04T00:00:00Z',
});
const preview: BetaManagedAgentsStreamSessionEvents[] = [
  { type: 'event_start', event: { id: 'message-a', type: 'agent.message' } },
  {
    type: 'event_delta',
    event_id: 'message-a',
    delta: { type: 'content_delta', index: 0, content: { type: 'text', text: 'α' } },
  },
  { type: 'event_start', event: { id: 'thinking', type: 'agent.thinking' } },
  { type: 'event_start', event: { id: 'message-b', type: 'agent.message' } },
  {
    type: 'event_delta',
    event_id: 'message-b',
    delta: { type: 'content_delta', index: 0, content: { type: 'text', text: '😀' } },
  },
  {
    type: 'event_delta',
    event_id: 'message-a',
    delta: { type: 'content_delta', index: 0, content: { type: 'text', text: 'β' } },
  },
  final('message-a', 'αβγ'),
  final('message-b', '😀 complete'),
];

// This fixture proves SDK construction/parsing/helper behavior. Actual production
// eligibility and formal-only delivery are proved by the integration registry.
function fixtureClient(events: BetaManagedAgentsStreamSessionEvents[], observed: URL[]): Anthropic {
  return new Anthropic({
    apiKey: 'fixture-key',
    baseURL: 'http://sdk.fixture',
    maxRetries: 0,
    fetch: async (input) => {
      observed.push(new URL(String(input)));
      return new Response(
        events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(''),
        { headers: { 'Content-Type': 'text/event-stream' } },
      );
    },
  });
}

test('Session opt-in repeats typed query keys and reconciles interleaved parsed previews by ID', async () => {
  const observed: URL[] = [];
  const client = fixtureClient(preview, observed);
  const stream = await client.beta.sessions.events.stream('session', {
    event_deltas: ['agent.message', 'agent.thinking'],
  });
  const snapshots = new Map<string, AccumulatedEvent>();
  let provisionalTextsChecked = false;
  for await (const event of stream) {
    if (event.type === 'event_start' && event.event.type === 'agent.message') {
      snapshots.set(event.event.id, accumulateManagedAgentsEvent(undefined, event)!);
    } else if (event.type === 'event_delta') {
      snapshots.set(event.event_id, accumulateManagedAgentsEvent(snapshots.get(event.event_id), event)!);
    } else if (event.type === 'agent.message') {
      if (event.id === 'message-a') {
        expect(snapshots.get('message-a')?.content).toEqual([{ type: 'text', text: 'αβ' }]);
        expect(snapshots.get('message-b')?.content).toEqual([{ type: 'text', text: '😀' }]);
        provisionalTextsChecked = true;
      }
      snapshots.set(event.id, accumulateManagedAgentsEvent(snapshots.get(event.id), event));
    }
  }
  expect(observed[0]!.pathname).toBe('/v1/sessions/session/events/stream');
  expect(observed[0]!.searchParams.getAll('event_deltas[]')).toEqual(['agent.message', 'agent.thinking']);
  expect(observed[0]!.searchParams.get('beta')).toBe('true');
  expect(provisionalTextsChecked).toBe(true);
  expect([...snapshots.values()]).toEqual(preview.slice(-2));
  expect(snapshots.has('thinking')).toBe(false);
});

test('default Session and typed Thread streams send no delta query and parse complete formal messages', async () => {
  const events = [final('message-a', 'complete')];
  const observed: URL[] = [];
  const client = fixtureClient(events, observed);
  const sessionEvents = [];
  for await (const event of await client.beta.sessions.events.stream('session')) sessionEvents.push(event);
  const threadEvents = [];
  for await (const event of await client.beta.sessions.threads.events.stream('thread', {
    session_id: 'session',
  }))
    threadEvents.push(event);
  expect(sessionEvents).toEqual(events);
  expect(threadEvents).toEqual(events);
  expect(observed.map((url) => url.pathname)).toEqual([
    '/v1/sessions/session/events/stream',
    '/v1/sessions/session/threads/thread/stream',
  ]);
  for (const url of observed) {
    expect([...url.searchParams.keys()]).toEqual(['beta']);
    expect(url.searchParams.get('beta')).toBe('true');
  }
});
