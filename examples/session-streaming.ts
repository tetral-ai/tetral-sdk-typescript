#!/usr/bin/env -S npm run tsn -T

import Anthropic from '@tetral-ai/sdk';

const client = new Anthropic({
  apiKey: process.env['TETRAL_API_KEY'],
  baseURL: process.env['TETRAL_BASE_URL'] ?? 'https://api.tetral.example',
});

async function main(): Promise<void> {
  const sessionID = process.argv[2];
  if (!sessionID) throw new Error('Usage: yarn tsn examples/session-streaming.ts <session_id> [prompt]');
  // Subscribe before starting a new request: previews are never replayed.
  const stream = await client.beta.sessions.events.stream(sessionID, {
    event_deltas: ['agent.message', 'agent.thinking'],
  });
  try {
    await client.beta.sessions.events.send(sessionID, {
      events: [
        { type: 'user.message', content: [{ type: 'text', text: process.argv[3] ?? 'Hello Tetral.' }] },
      ],
    });
    for await (const event of stream) {
      if (event.type === 'event_delta') {
        // Log fragments without retaining preview state across request lifetimes.
        console.log('Provisional fragment:', event.event_id, event.delta.content);
      } else if (event.type === 'agent.message') {
        console.log('Complete committed text:', event.id, event.content);
      } else {
        // Thinking previews are notifications with no body. Request End closes
        // unmatched previews; it does not mean every tool or the turn is done.
        console.log(JSON.stringify(event));
      }
      if (event.type === 'session.status_idle' || event.type === 'session.status_terminated') break;
    }
  } finally {
    stream.controller.abort();
  }
}

void main();
