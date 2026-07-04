# Tetral SDK Compatibility

## 1. Compatibility Statement

The Tetral SDK is an Anthropic-compatible fork of `anthropic-sdk-typescript`. The public client class remains `Anthropic`; `Tetral` is exported as an alias. Anthropic-compatible wire headers such as `anthropic-version` and `anthropic-beta` remain unchanged.

Pinned upstream baseline:

| Item                     | Value                                      |
| ------------------------ | ------------------------------------------ |
| Upstream package version | `0.106.0`                                  |
| Fork baseline commit     | `0ffdbfa41186434824e98c90473b5c4ba5501045` |

## 2. Type-Level Divergences

| Surface                                     | Tetral divergence                                                                                                                                                                                           |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Session `github_repository` resource params | Inline `authorization_token` is removed. GitHub access is resolved through Vault credentials bound to the Session.                                                                                          |
| Session Resources rotation                  | `client.beta.sessions.resources.update(...)`, `ResourceUpdateParams`, and the resource-rotation response type are removed.                                                                                  |
| Managed Agent model IDs                     | `BetaManagedAgentsModel` is a closed union of `openai/gpt-5.5`, `anthropic/claude-opus-4-8`, `deepseek/deepseek-v4-pro`, `moonshotai/kimi-k2.7-code`, and `zai/glm-5.2`. Providerless IDs are not accepted. |

## 3. Tetral Extensions And Supported Surface

Supported or Tetral-extended surfaces include:

| Surface                                  | Tetral behavior                                                                                                                                                                                      |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Agents lifecycle and `versions.list`     | Supported. Agent create/update/list/retrieve/archive use Tetral Managed Agents with canonical `provider/model` IDs.                                                                                  |
| `approval_mode`                          | Supported on Agents and as a Session-local `agent.approval_mode` update. Values are `full_access`, `ask_for_approval`, and `approve_for_me`.                                                         |
| `tetral_agent_toolset.family`            | Required on Tetral toolset declarations. Supported families are `claude` and `gpt`.                                                                                                                  |
| MCP declarations                         | Supported as credential-free curated-catalog declarations. Admission accepts the curated catalog and rejects non-catalog URLs.                                                                       |
| Agent skill references                   | Supported for workspace `custom` skill references (created via `/v1/skills`). Read-only guidance, not model-facing tools.                                                                            |
| Sessions lifecycle                       | Supported. Session create requires explicit `vault_ids`, using `[]` when no Vault is bound.                                                                                                          |
| Session `providers`                      | Supported as `{ [provider_id]: { credential_id } }` on create/update. The provider key must match the agent's canonical `provider/model` provider; credentials must come from a Session-bound Vault. |
| `usage.server_tool_use`                  | Supported response usage sub-block with `web_search_requests` and `web_fetch_requests`.                                                                                                              |
| Session resources                        | Supported subset: file add/list/retrieve/delete, memory-store attachment, and credential-free GitHub repository params.                                                                              |
| Threads and thread events                | Supported for public Session threads and thread events.                                                                                                                                              |
| Events                                   | Supported for `user.message`, `user.interrupt`, `user.tool_confirmation` with its live-pending-approval precondition, list, and stream.                                                              |
| Files API                                | Supported for upload/list/retrieve/delete/download where implemented. Uploads use streamed multipart inputs.                                                                                         |
| Skills API                               | Supported for parent Skills and Skill Versions. Uploads use SDK upload primitives.                                                                                                                   |
| Cloud Environments                       | Supported for cloud environments with `unrestricted`, `blocked`, or `cidr_allow_list` networking.                                                                                                    |
| Vaults and Credentials                   | Supported. Credential responses redact secrets.                                                                                                                                                      |
| Provider credentials in Vault            | Supported through `provider_api_key` and `provider_oauth`.                                                                                                                                           |
| Memory Stores, Memories, Memory Versions | Supported through the store-scoped resource tree.                                                                                                                                                    |

## 4. Retained Unsupported Or Deferred Surface

These surfaces remain in the SDK for Anthropic compatibility or generated surface stability, but Tetral does not present them as working behavior. Generated request paths are kept unless a type-level divergence is listed above; unsupported requests are rejected by Tetral backend admission with SDK-compatible errors.

| Surface                                                                  | Tetral status                                                                                                                                                                      |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public multiagent topology                                               | Non-null topology is rejected. Responses use `null`.                                                                                                                               |
| Runtime custom tools, Agent `custom` tools, and `agent_toolset_20260401` | Retained unsupported/deferred.                                                                                                                                                     |
| Upstream `anthropic` skill-catalog references                            | Retained unsupported. Backend admission rejects it with an SDK-compatible error.                                                                                                   |
| Session list reverse pagination                                          | Retained unsupported. `sessions.list` uses `BidirectionalPageCursor`; forward iteration works unchanged, and `prev_page` stays `null` until the engine implements reverse cursors. |
| Generated Messages API resource and Message Batches                      | Retained unsupported/deferred. Use Session Events `user.message` instead.                                                                                                          |
| Host allowlists, `limited`, `scope`, and self-host Environment work APIs | Retained unsupported/deferred.                                                                                                                                                     |
| Vault `environment_variable` credentials                                 | Retained unsupported. The SDK transmits generated requests; backend admission rejects them.                                                                                        |
| Deployments and Deployment Runs                                          | Retained unsupported/deferred.                                                                                                                                                     |
| Models resource                                                          | Retained unsupported/deferred. Use the Agent `model` field instead.                                                                                                                |
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

Upstream sync policy is on demand:

1. Merge the upstream SDK changes.
2. Run full CI.
3. Classify every new surface as retained unsupported by default until a Tetral plan explicitly supports it.
4. Run the integration suite when a Tetral engine is available.
