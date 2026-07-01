# Tetral Engine SDK for TypeScript

This fork keeps the Anthropic-compatible TypeScript SDK entrypoint while targeting Tetral public APIs.
The public client class remains `Anthropic`; configure Tetral with a Tetral-issued public API key and Tetral `baseURL`.

## Documentation

Generated API reference is in [api.md](./api.md). Some upstream-generated route families are retained for SDK compatibility but are deferred or unsupported by Tetral until the Tetral backend admits them.

Retained unsupported/deferred Tetral surfaces include Deployments, Deployment Runs, the generated beta Messages resource and Message Batches, the beta Models resource, User Profiles, Webhooks, self-host Environment work APIs, runtime custom-tool result events, and hosted ToolRunner flows. Ordinary generated resource methods keep their normal HTTP request paths; Tetral backend admission returns SDK-compatible errors for unsupported behavior. SDK-local helpers use explicit failure state, such as `posted: false`, when a synthesized helper result is rejected instead of manufacturing success.

## Installation

Use this fork's package name once it is assigned. Until package metadata is renamed, this worktree keeps the upstream package name:

```sh
npm install @anthropic-ai/sdk
```

## Getting Started With Tetral

```js
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({
  apiKey: process.env['TETRAL_API_KEY'] ?? 'redacted-key-...',
  baseURL: process.env['TETRAL_BASE_URL'] ?? 'https://api.tetral.example',
});

for await (const agent of client.beta.agents.list()) {
  console.log(agent.id);
  break;
}
```

Do not pass Anthropic provider API keys as the Tetral SDK `apiKey`. Provider credentials belong in Vault and are selected by Tetral Sessions through `providers`; the SDK public `apiKey` is only the Tetral-issued `redacted-key-...` key. The SDK consumes public keys but does not mint, recover, or persist them.

## Tetral Managed Agents Example

The `examples/agents*.ts` files are the Tetral Managed Agents examples. Other examples are retained upstream Anthropic compatibility examples and may still use upstream Anthropic environment variable names.

```ts
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({
  apiKey: process.env['TETRAL_API_KEY'] ?? 'redacted-key-...',
  baseURL: process.env['TETRAL_BASE_URL'] ?? 'https://api.tetral.example',
});

const environment = await client.beta.environments.create({
  name: 'tetral-cloud',
  config: {
    type: 'cloud',
    networking: {
      type: 'cidr_allow_list',
      network_allow_list: '10.0.0.0/24,192.168.1.10/32',
    },
  },
});

const vault = await client.beta.vaults.create({ display_name: 'provider-credentials' });
const credential = await client.beta.vaults.credentials.create(vault.id, {
  display_name: 'anthropic-provider',
  auth: {
    type: 'provider_api_key',
    provider_id: 'anthropic',
    access_mode: 'model_inference',
    token: process.env['MODEL_PROVIDER_API_KEY'] ?? 'provider-secret',
  },
});

const agent = await client.beta.agents.create({
  name: 'tetral-agent',
  model: 'anthropic/claude-opus-4-8',
  approval_mode: 'ask_for_approval',
  tools: [{ type: 'tetral_agent_toolset', family: 'claude' }],
});

const file = await client.beta.files.upload({
  file: new File(['city,revenue\nSF,42\n'], 'data.csv', { type: 'text/csv' }),
});

const session = await client.beta.sessions.create({
  environment_id: environment.id,
  agent: { type: 'agent', id: agent.id, version: agent.version },
  vault_ids: [vault.id],
  providers: { anthropic: { credential_id: credential.id } },
});

await client.beta.sessions.resources.add(session.id, {
  type: 'file',
  file_id: file.id,
  mount_path: '/uploads/data.csv',
});

await client.beta.sessions.events.send(session.id, {
  events: [{ type: 'user.message', content: [{ type: 'text', text: 'Summarize /uploads/data.csv.' }] }],
});
```

## Requirements

Node.js 18+

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md).

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
