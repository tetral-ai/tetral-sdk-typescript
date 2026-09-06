# Cloud Agent SDK for TypeScript

This package is an Anthropic-compatible TypeScript SDK fork for the Tetral Engine public API. It keeps the familiar `new Anthropic(...)` client entrypoint and also exports `Tetral` as an alias for projects that prefer Tetral naming.

This project is forked from Anthropic's official SDK. It is not affiliated with or endorsed by Anthropic.

## Install

```sh
npm install @tetral-ai/sdk@alpha
```

Alpha releases use the `alpha` npm dist-tag and do not update `latest`.

## Quickstart

```ts
import Anthropic from '@tetral-ai/sdk';

const client = new Anthropic({
  apiKey: process.env['TETRAL_API_KEY'],
  baseURL: process.env['TETRAL_BASE_URL'] ?? 'https://api.tetral.example',
});

const agent = await client.beta.agents.create({
  name: 'tetral-agent',
  model: 'anthropic/claude-opus-4-8',
  approval_mode: 'ask_for_approval',
  tools: [{ type: 'tetral_agent_toolset', family: 'claude' }],
});

const session = await client.beta.sessions.create({
  environment_id: 'env_123',
  agent: { type: 'agent', id: agent.id, version: agent.version },
  vault_ids: [],
});

await client.beta.sessions.events.send(session.id, {
  events: [{ type: 'user.message', content: [{ type: 'text', text: 'Hello Tetral.' }] }],
});
```

The SDK `apiKey` is a Tetral-issued API key. Anthropic provider API keys do not authenticate Tetral public APIs; store provider credentials in Vault and select them from Sessions through `providers`.

## Managed Agents Example

```ts
import Anthropic from '@tetral-ai/sdk';

const client = new Anthropic({
  apiKey: process.env['TETRAL_API_KEY'],
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

const session = await client.beta.sessions.create({
  environment_id: environment.id,
  agent: { type: 'agent', id: agent.id, version: agent.version },
  vault_ids: [vault.id],
  providers: {
    anthropic: { credential_id: credential.id },
  },
});

await client.beta.sessions.events.send(session.id, {
  events: [{ type: 'user.message', content: [{ type: 'text', text: 'Summarize the workspace.' }] }],
});
```

More runnable examples live in `examples/`.

## Git commit identity

Set `git_identity` on each GitHub repository when creating a Session:

```ts
const session = await client.beta.sessions.create({
  agent: agent.id,
  environment_id: environment.id,
  vault_ids: [],
  resources: [
    {
      type: 'github_repository',
      url: 'https://github.com/example/project',
      authorization_token: process.env['GITHUB_TOKEN']!,
      git_identity: { name: 'Example Automation', email: 'bot@example.com' },
    },
  ],
});
```

Engine stores this identity with the repository and configures its local Git
settings when materializing the Sandbox, including on rebuild. Different
repositories can declare different default authors and committers. Explicit Git
command options or environment variables can still override these defaults.

Omit `git_identity` to use name `Tetral Agent` and email
`session+<session_id>@agents.tetral.ai`. When present, both `name` and `email` are
required: `null`, empty strings, and malformed identities produce an Engine 400.
Engine enforces UTF-8 byte limits of 256 for name and 254 for email, and rejects
characters Git would discard; the SDK sends values unchanged.

The identity is fixed at Session creation, with no update or version API. Reads
return the declared identity unredacted, or omit the field if none was declared.
`authorization_token` separately grants repository access, is never returned, and
can be rotated without changing identity. This feature applies to Session
creation; Deployments remain unsupported. A runnable example is available in
[examples/git-identity.ts](examples/git-identity.ts).

## Compatibility

See [COMPATIBILITY.md](./COMPATIBILITY.md) for the upstream baseline, Tetral extensions, type-level divergences, retained unsupported surfaces, authentication behavior, and upstream sync policy.

Generated API reference is in [api.md](./api.md).

## Requirements

Node.js 18 or later.
TypeScript >= 4.9 is supported.

The following runtimes are supported:

- Node.js 20 LTS or later ([non-EOL](https://endoflife.date/nodejs)) versions.
- Deno v1.28.0 or higher.
- Bun 1.0 or later.
- Cloudflare Workers.
- Vercel Edge Runtime.
- Jest 28 or greater with the `"node"` environment (`"jsdom"` is not supported at this time).
- Nitro v2.6 or greater.
- Web browsers: disabled by default to avoid exposing your secret API credentials (see [API key best practices](https://support.anthropic.com/en/articles/9767949-api-key-best-practices-keeping-your-keys-safe-and-secure)). Enable browser support by explicitly setting `dangerouslyAllowBrowser` to `true`.

Note that React Native is not supported at this time.

If you are interested in other runtime environments, open or upvote an issue.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md).

## License

This project is licensed under the MIT License. See [LICENSE](./LICENSE).
