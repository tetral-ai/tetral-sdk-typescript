#!/usr/bin/env -S npm run tsn -T

import Anthropic from '@anthropic-ai/sdk';
import type { TetralSessionProviderSelectors } from '@anthropic-ai/sdk/resources/beta/sessions';
import fs from 'fs';
import path from 'path';

const client = new Anthropic();

const MCP_SERVER_NAME = 'github';
const MCP_SERVER_URL = 'https://api.githubcopilot.com/mcp/';

const PROMPT =
  'Hi! List every tool and skill you have access to, grouped by where they ' +
  'came from (built-in toolset, MCP server, skills).';

async function main() {
  const githubToken = process.env['GITHUB_TOKEN'];
  if (!githubToken) {
    throw new Error('GITHUB_TOKEN is required (use a fine-grained PAT with public-repo read only)');
  }
  const anthropicProviderAPIKey = process.env['ANTHROPIC_PROVIDER_API_KEY'];

  // Create an environment
  const environment = await client.beta.environments.create({
    name: 'comprehensive-example-environment',
  });
  console.log('Created environment:', environment.id);

  // Create a vault and store the MCP server credential in it
  const vault = await client.beta.vaults.create({
    display_name: 'comprehensive-example-vault',
  });
  console.log('Created vault:', vault.id);

  const credential = await client.beta.vaults.credentials.create(vault.id, {
    display_name: 'github-mcp',
    auth: {
      type: 'static_bearer',
      mcp_server_url: MCP_SERVER_URL,
      token: githubToken,
    },
  });
  console.log('Created credential:', credential.id);

  let providers: TetralSessionProviderSelectors | undefined;
  if (anthropicProviderAPIKey) {
    const providerCredential = await client.beta.vaults.credentials.create(vault.id, {
      display_name: 'anthropic-model-provider',
      auth: {
        type: 'provider_api_key',
        provider_id: 'anthropic',
        access_mode: 'model_inference',
        token: anthropicProviderAPIKey,
      },
    });
    providers = { anthropic: { credential_id: providerCredential.id } };
    console.log('Created provider credential:', providerCredential.id);
  }

  // Upload a custom skill
  const skillContent = fs.readFileSync(path.join(__dirname, 'greeting-SKILL.md'));
  const skill = await client.beta.skills.create({
    display_title: `comprehensive-greeting-${Date.now()}`,
    files: [new File([skillContent], 'greeting/SKILL.md', { type: 'text/markdown' })],
  });
  console.log('Created skill:', skill.id);

  // Create v1 of the agent with the Tetral built-in toolset and an MCP server
  const agentV1 = await client.beta.agents.create({
    name: 'comprehensive-example-agent',
    model: 'anthropic/claude-sonnet-4-6',
    approval_mode: 'ask_for_approval',
    system: 'You are a helpful assistant.',
    mcp_servers: [{ type: 'url', name: MCP_SERVER_NAME, url: MCP_SERVER_URL }],
    tools: [
      { type: 'tetral_agent_toolset', family: 'claude' },
      { type: 'mcp_toolset', mcp_server_name: MCP_SERVER_NAME },
    ],
  });
  console.log('Created agent v1:', agentV1.id);

  // Patch the agent to v2 by adding skills; each update bumps the version
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

  // Create a session pinned to v2; the vault supplies the MCP credential
  const session = await client.beta.sessions.create({
    environment_id: environment.id,
    agent: { type: 'agent', id: agent.id, version: agent.version },
    vault_ids: [vault.id],
    ...(providers ? { providers } : {}),
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
