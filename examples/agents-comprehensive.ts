#!/usr/bin/env -S npm run tsn -T

import Anthropic from '@anthropic-ai/sdk';
import type { TetralSessionProviderSelectors } from '@anthropic-ai/sdk/resources/beta/sessions';
import fs from 'fs';
import path from 'path';

const client = new Anthropic({
  apiKey: process.env['TETRAL_API_KEY'] ?? 'redacted-key-...',
  baseURL: process.env['TETRAL_BASE_URL'] ?? 'https://api.tetral.example',
});

const PROMPT =
  'Hi! List every tool and skill you have access to, grouped by where they ' +
  'came from (built-in toolset and skills).';

async function main() {
  const modelProviderAPIKey = process.env['MODEL_PROVIDER_API_KEY'];
  if (!modelProviderAPIKey) {
    throw new Error('MODEL_PROVIDER_API_KEY is required for the provider credential example');
  }

  // Create an environment
  const environment = await client.beta.environments.create({
    name: 'comprehensive-example-environment',
    config: {
      type: 'cloud',
      networking: {
        type: 'cidr_allow_list',
        network_allow_list: '10.0.0.0/24,192.168.1.10/32',
      },
    },
  });
  console.log('Created environment:', environment.id);

  // Create a vault and store the model provider credential in it. This is not
  // the Tetral public SDK apiKey; Sessions select it through `providers`.
  const vault = await client.beta.vaults.create({
    display_name: 'comprehensive-example-vault',
  });
  console.log('Created vault:', vault.id);

  const providerCredential = await client.beta.vaults.credentials.create(vault.id, {
    display_name: 'anthropic-model-provider',
    auth: {
      type: 'provider_api_key',
      provider_id: 'anthropic',
      access_mode: 'model_inference',
      token: modelProviderAPIKey,
    },
  });
  const providers: TetralSessionProviderSelectors = {
    anthropic: { credential_id: providerCredential.id },
  };
  console.log('Created provider credential:', providerCredential.id);

  // Upload a custom skill
  const skillContent = fs.readFileSync(path.join(__dirname, 'greeting-SKILL.md'));
  const skill = await client.beta.skills.create({
    display_title: `comprehensive-greeting-${Date.now()}`,
    files: [new File([skillContent], 'greeting/SKILL.md', { type: 'text/markdown' })],
  });
  console.log('Created skill:', skill.id);

  // Create v1 of the agent with the Tetral built-in toolset.
  const agentV1 = await client.beta.agents.create({
    name: 'comprehensive-example-agent',
    model: 'anthropic/claude-opus-4-8',
    approval_mode: 'ask_for_approval',
    system: 'You are a helpful assistant.',
    tools: [{ type: 'tetral_agent_toolset', family: 'claude' }],
  });
  console.log('Created agent v1:', agentV1.id);

  // Patch the agent to v2 by adding skill references. Skills are Agent
  // configuration; Session preparation projects them read-only under
  // /skills/<directory> rather than exposing them as model-facing tools.
  const agent = await client.beta.agents.update(agentV1.id, {
    version: agentV1.version,
    skills: [
      { type: 'custom', skill_id: skill.id },
      { type: 'anthropic', skill_id: 'xlsx' },
    ],
  });
  console.log('Patched agent to v2:', agent.id);

  const versions = await client.beta.agents.versions.list(agent.id);
  console.log('Agent versions:', versions.data);

  // Create a session pinned to v2; the vault supplies the provider credential.
  const session = await client.beta.sessions.create({
    environment_id: environment.id,
    agent: { type: 'agent', id: agent.id, version: agent.version },
    vault_ids: [vault.id],
    providers,
  });
  console.log('Created session:', session.id);

  // Send a prompt and stream events
  console.log('Streaming events:');
  await client.beta.sessions.events.send(session.id, {
    events: [{ type: 'user.message', content: [{ type: 'text', text: PROMPT }] }],
  });

  const stream = await client.beta.sessions.events.stream(session.id);
  for await (const event of stream) {
    console.log(JSON.stringify(event, null, 2));
    if (event.type === 'session.status_idle' && event.stop_reason?.type === 'end_turn') {
      break;
    }
  }
}

main();
