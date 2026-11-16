/**
 * The SDK's stream reader passes on every event the copy names. The reader
 * yields the events whose names it knows and drops any other, so an event of
 * the copy it does not know would never reach a developer. Layer 1: the reader
 * is given a response built here.
 */
import { Stream } from '@tetral-ai/sdk/core/streaming';

import { STREAMS_WITHOUT_A_METHOD, streamEvents } from './spec';

const EVENTS = [
  ...new Set(
    Object.entries(streamEvents())
      .filter(([operation]) => !STREAMS_WITHOUT_A_METHOD.includes(operation))
      .flatMap(([, events]) => events),
  ),
];

test.each(EVENTS)('the stream reader yields the event %s', async (event) => {
  const response = new Response(`event: ${event}\ndata: ${JSON.stringify({ type: event })}\n\n`);
  const read = [];
  for await (const one of Stream.fromSSEResponse(response, new AbortController())) read.push(one);
  expect(read).toEqual([{ type: event }]);
});
