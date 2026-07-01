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

## Requirements

Node.js 18+

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md).

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
