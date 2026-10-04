# Tetral SDK Compatibility

[![Anthropic TypeScript SDK compatibility](https://img.shields.io/badge/Anthropic_TypeScript_SDK-compatible-191919)](https://github.com/anthropics/anthropic-sdk-typescript)

Tetral is an Anthropic-compatible TypeScript SDK for the Tetral Engine API.

## 1. Compatibility Statement

The Tetral SDK is a fork of the [Anthropic TypeScript SDK](https://github.com/anthropics/anthropic-sdk-typescript). The public client class remains `Anthropic`; `Tetral` is exported as an alias. Anthropic-compatible wire headers such as `anthropic-version` and `anthropic-beta` remain unchanged.

Pinned upstream baseline:

| Item                        | Value                                                              |
| --------------------------- | ------------------------------------------------------------------ |
| Upstream package version    | `0.110.0`                                                          |
| Last synced upstream commit | `4f2eb807` (fork point `0ffdbfa41186434824e98c90473b5c4ba5501045`) |

## 2. Type-Level Divergences

Session `github_repository` creation and resource responses add the Tetral-only
optional `git_identity: TetralGitIdentity`. Credential and token-rotation shapes
remain aligned with upstream. Deployment request types reuse the Session resource
type, but Deployments remain unsupported; this extension enables Session creation only.

Closed alignment: `BetaManagedAgentsModel` follows the upstream known-literal
union widened by `(string & {})`. Known IDs autocomplete, arbitrary strings
type-check, and the engine remains the runtime model gatekeeper.

Memory `BetaManagedAgentsActor` adds the Tetral Engine response variant
`BetaManagedAgentsServiceActor`: `{type: 'service_actor', service_id: string}`.
Both `created_by` and nullable `redacted_by` use the shared union; API, Session
and User variants retain their fields and discriminators.

## 3. Tetral Extensions And Behavioral Deltas

Tetral-specific extensions and behavior differences are:

Session repository `git_identity` declares repository-local Git authorship, not
GitHub authentication. It is create-time-only, has no version, and is returned
unredacted when declared. Omission preserves the Engine fallback; the SDK does
not fill defaults or sanitize values. See [Git commit identity](README.md#git-commit-identity).

| Surface                        | Tetral behavior                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Managed Agent model catalog    | Known IDs are `openai/gpt-5.5`, `openai/gpt-5.6-sol`, `anthropic/claude-opus-4-8`, `anthropic/claude-fable-5`, `deepseek/deepseek-v4-pro`, `moonshotai/kimi-k3`, and `zai/glm-5.2`. `moonshotai/kimi-k2.7-code` is retired; the 5.6 generation uses the precise `openai/gpt-5.6-sol` variant ID.                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Models resource                | `client.models` and `client.beta.models` support list and retrieve. Page envelopes and `limit` / `before_id` / `after_id` match upstream; catalog contents use Tetral provider/model IDs rather than Anthropic `claude-*` IDs.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Model effort                   | No public effort selector is exposed. The engine applies its pinned platform default for each model.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `approval_mode`                | Supported on Agents and as a Session-local `agent.approval_mode` update. Values are `full_access`, `ask_for_approval`, and `approve_for_me`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `tetral_agent_toolset.family`  | Required on Tetral toolset declarations. Supported families are `claude` and `gpt`. Every Agent must declare exactly one `tetral_agent_toolset`: omitting it, declaring two (same or mixed family), or clearing `tools` so none remains (empty array or `null` — this supersedes the generated docstring's "send empty array or null to clear" for this entry) is a 400. A Session-local `agent.tools` update must keep the entry with the Session's pinned family — the family cannot change for a live Session; change it by updating the Agent (new version) and starting a new Session. Only the declared family's builtin tools are installed in the sandbox. `configs` / `default_config` on this declaration are rejected. |
| MCP declarations               | Supported as credential-free curated-catalog declarations. Admission accepts the curated catalog and rejects non-catalog URLs.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Agent skill references         | Supported for workspace `custom` skill references (created via `/v1/skills`). Read-only guidance, not model-facing tools.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Session creation               | Requires explicit `vault_ids`, using `[]` when no Vault is bound.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Session `providers`            | Supported as `{ [provider_id]: { credential_id } }` on create/update. The provider key must match the agent's canonical `provider/model` provider; credentials must come from a Session-bound Vault.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `usage.server_tool_use`        | Supported response usage sub-block with `web_search_requests` and `web_fetch_requests`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Session image input            | Multimodal stage 1 accepts only Files API references (`source.type = "file"`) for `image/jpeg`, `image/png`, `image/gif`, and `image/webp`, up to 10 MB each. An events request may contain at most 32 file-backed image and document references combined, narrower than Anthropic's documented image allowance. Base64 and URL sources are rejected with an upload-first 400. Accepted `file_id` values are stored and echoed verbatim; media remains eligible to ride provider requests until a turn commits settled output.                                                                                                                                                                                                    |
| Session document input         | Multimodal stage 1 accepts only Files API references for `application/pdf` and `text/plain`. PDFs in one events request are limited to 32 MB and 600 pages in aggregate; `text/plain` has no separate admission byte cap. Inline base64, text, and URL sources are rejected with an upload-first 400. Document `file_id`, `context`, and `title` are stored and echoed verbatim.                                                                                                                                                                                                                                                                                                                                                  |
| Session resources              | Supported subset: file add/list/retrieve/delete, memory-store attachment, and GitHub repository params with a required write-only `authorization_token`. GitHub resource tokens rotate through `client.beta.sessions.resources.update(...)` and are never echoed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| GitHub resource URL uniqueness | Session create rejects duplicate `github_repository` URLs by comparison key: trim an optional case-sensitive `.git` suffix first, then case-fold owner/repo. Stored and echoed URLs remain verbatim. This is an undocumented upstream corner recorded as Tetral behavior.                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Cloud Environments             | Supported for cloud environments with `unrestricted`, `blocked`, or `cidr_allow_list` networking.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Provider credentials in Vault  | Supported through `provider_api_key` and OpenAI `provider_oauth`. OpenAI OAuth create requires `access_mode: "oauth"` plus access token, refresh token, expiry, and account ID.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| MCP OAuth validation refresh   | On `mcp_oauth_validate`, the refresh leg keeps `http_response.body` and `http_response.content_type` in the response shape but always returns both as empty strings. `status_code` and `body_truncated` remain available; MCP probe diagnostics are unchanged.                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

### Engine authentication and Memory attribution

Explicit `config.authentication.type: 'oidc_federation'` uses the existing SDK
JSON JWT-bearer provider, token cache and reactive 401 retry against the Engine's
`/v1/oauth/token`. The Engine must already trust the HTTPS issuer/audience and
have provisioned the exact identity and eligible workspace grant. This support
is explicit configuration, not automatic OIDC selection by default credential
discovery. Provider API keys remain Vault credentials, not Engine authentication.
See the [OIDC configuration example](README.md#engine-oidc-federation).

Organization, federation rule, workspace and optional service-account fields are
selectors, not identity proof or provisioning instructions. An omitted workspace
selects the sole eligible grant; multiple eligible grants are ambiguous. `default`
selects the configured Engine default workspace and still requires a grant.
There is no upstream organization-default fallback. A service-account selector
must match its service binding and cannot be supplied for a human identity.
These Engine rules do not replace hosted Anthropic's workspace-selection rules.

Memory attribution identifies the actor that performed the operation:

| Credential or execution                 | Actor           | Identity field                          |
| --------------------------------------- | --------------- | --------------------------------------- |
| Direct service identity token           | `service_actor` | `service_id`: stable Engine identity ID |
| Direct human identity token             | `user_actor`    | `user_id`: stable Engine identity ID    |
| Independent or identity-derived API key | `api_actor`     | `api_key_id`: actual key ID             |
| Runtime Session operation               | `session_actor` | `session_id`: Session ID                |

The service ID is neither the upstream JWT subject nor the service-account
selector. SDK HTTP fixture tests check received typed variants and preserve the
older union arms. Integration rows CONN-20 and MEM-24 require the native
`TestOIDCKeycloakSDK` composition with real HTTPS Keycloak, Auth, PostgreSQL and
actual SDK responses. They require both identity flows, cache/revocation/retry
observations and typed `created_by`/`redacted_by` identity checks. A fabricated
object, raw JSON cast, source scan or skipped composition does not prove those
rows. Source support and actual integration evidence do not imply an npm release.

### Session streaming

Session `events.stream` supports optional `event_deltas: ['agent.message',
'agent.thinking']` through the existing upstream API. Only the public primary
thread is eligible. `agent.message` previews use `event_start` followed by
best-effort `event_delta` text fragments; `agent.thinking` is a start-only
notification with no thinking body or signature. Omitting `event_deltas` keeps
Session delivery formal-only. Every Thread stream, including the primary
Thread endpoint, remains formal-only and has no delta request parameter.
Session and Thread event lists contain only formal events.

Open the stream before sending input to observe previews for the new request.
Previews are not replayed on reconnect, and opening during a request does not
subscribe to that request's previews. Keep accumulated text provisional: the
complete `agent.message` with the same ID replaces it, including when previews
stop or lose their tail. The helper tracks one message at a time; keep a
snapshot per event ID when messages interleave. See
[Session streaming](README.md#session-streaming) and the
[runnable example](examples/session-streaming.ts).

Complete committed text is list-readable as soon as it commits. On SSE it is
published in stored order immediately before the matching
`span.model_request_end`, for both ordinary and opted-in viewers. This includes
complete text committed before an error or interrupt End. Incomplete or
uncommitted content has no fabricated final event; End closes remaining
previews. Request End does not mean every tool or the whole agent turn has
finished.

## 4. Retained Unsupported Or Deferred Surface

These surfaces remain in the SDK for Anthropic compatibility or generated surface stability, but Tetral does not present them as working behavior. Generated request paths are kept unless a type-level divergence is listed above; unsupported requests are rejected by Tetral backend admission with SDK-compatible errors.

| Surface                                                                  | Tetral status                                                                                                                                                                      |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public multiagent topology                                               | Non-null topology is rejected. Responses use `null`.                                                                                                                               |
| Runtime custom tools, Agent `custom` tools, and `agent_toolset_20260401` | Retained unsupported/deferred.                                                                                                                                                     |
| Upstream `anthropic` skill-catalog references                            | Retained unsupported. Backend admission rejects it with an SDK-compatible error.                                                                                                   |
| Session create `agent_with_overrides`                                    | Retained unsupported. Use the plain agent reference forms; override variants are rejected by admission.                                                                            |
| Agent and deployment webhook event types                                 | Deferred with the Webhooks resource.                                                                                                                                               |
| Session list reverse pagination                                          | Retained unsupported. `sessions.list` uses `BidirectionalPageCursor`; forward iteration works unchanged, and `prev_page` stays `null` until the engine implements reverse cursors. |
| Generated Messages API resource and Message Batches                      | Retained unsupported/deferred. Use Session Events `user.message` instead.                                                                                                          |
| Host allowlists, `limited`, `scope`, and self-host Environment work APIs | Retained unsupported/deferred.                                                                                                                                                     |
| Vault `environment_variable` credentials                                 | Retained unsupported. The SDK transmits generated requests; backend admission rejects them.                                                                                        |
| Deployments and Deployment Runs                                          | Retained unsupported/deferred.                                                                                                                                                     |
| User Profiles                                                            | Retained unsupported/deferred.                                                                                                                                                     |
| Webhooks                                                                 | Deferred.                                                                                                                                                                          |
| SDK ToolRunner and SessionToolRunner flows                               | Retained unsupported/deferred for Tetral Cloud-hosted runtime.                                                                                                                     |
| `user.tool_result`                                                       | Retained unsupported/deferred.                                                                                                                                                     |
| `user.custom_tool_result`                                                | Retained unsupported/deferred.                                                                                                                                                     |
| `user.define_outcome`                                                    | Retained unsupported/deferred.                                                                                                                                                     |
| `system.message`                                                         | Retained unsupported/deferred.                                                                                                                                                     |

## 5. Authentication And Upstream Sync

Tetral public API calls use `TETRAL_API_KEY`, the `apiKey` client option, `X-Api-Key`, and Tetral `baseURL`. Anthropic provider API keys do not authenticate Tetral public APIs.

API key management is a Tetral auth-service extension:

```text
POST   /v1/api_keys
GET    /v1/api_keys
DELETE /v1/api_keys/{api_key_id}
```

Create returns the raw API key once. List and retrieve-style responses expose only public-safe metadata. Delete revokes the key.

Provider credentials belong in Vault and are selected by Sessions through `providers`; the SDK does not mint, recover, derive, or persist raw public API keys.

Upstream sync runs as small rolling merges — on each upstream release or biweekly, whichever comes first (adopted 2026-07-04; the cadence starts after live integration):

1. Merge the upstream SDK changes.
2. Run full CI.
3. Classify every new surface as retained unsupported by default until Tetral explicitly supports it.
4. Run the integration suite when a Tetral engine is available.
