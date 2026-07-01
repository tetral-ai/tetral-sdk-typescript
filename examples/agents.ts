#!/usr/bin/env -S npm run tsn -T

import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({
  apiKey: process.env['TETRAL_API_KEY'] ?? 'redacted-key-...',
  baseURL: process.env['TETRAL_BASE_URL'] ?? 'https://api.tetral.example',
});

async function main() {
  // Create an environment
  const environment = await client.beta.environments.create({
    name: 'simple-example-environment',
    config: { type: 'cloud', networking: { type: 'unrestricted' } },
  });
  console.log('Created environment:', environment.id);

  // Create an agent
  const agent = await client.beta.agents.create({
    name: 'simple-example-agent',
    model: 'anthropic/claude-opus-4-8',
    approval_mode: 'ask_for_approval',
    tools: [{ type: 'tetral_agent_toolset', family: 'claude' }],
  });
  console.log('Created agent:', agent.id);

  // Create a session
  const session = await client.beta.sessions.create({
    environment_id: environment.id,
    agent: { type: 'agent', id: agent.id },
    vault_ids: [],
  });
  console.log('Created session:', session.id);

  // Send a user message
  await client.beta.sessions.events.send(session.id, {
    events: [
      {
        type: 'user.message',
        content: [{ type: 'text', text: 'Hello Claude!' }],
      },
    ],
  });

  // Stream events until the session goes idle
  console.log('Streaming events:');
  const stream = await client.beta.sessions.events.stream(session.id);
  for await (const event of stream) {
    console.log(JSON.stringify(event, null, 2));
    if (event.type === 'session.status_idle') {
      break;
    }
  }
}

main();
