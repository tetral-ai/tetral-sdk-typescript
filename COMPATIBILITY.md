# Tetral SDK Compatibility

[![Anthropic TypeScript SDK compatibility](https://img.shields.io/badge/Anthropic_TypeScript_SDK-compatible-191919)](https://github.com/anthropics/anthropic-sdk-typescript)

Tetral is an Anthropic-compatible TypeScript SDK for the Tetral Engine API.

## 1. Compatibility Statement

The Tetral SDK is a fork of the [Anthropic TypeScript SDK](https://github.com/anthropics/anthropic-sdk-typescript). The public client class remains `Anthropic`; `Tetral` is exported as an alias. Anthropic-compatible wire headers such as `anthropic-version` and `anthropic-beta` remain unchanged.

Pinned upstream baseline:

| Item                        | Value                                      |
| --------------------------- | ------------------------------------------ |
| Upstream package version    | `0.133.0`                                  |
| Last synced upstream commit | `2979ed5cef4b2f059b95af23e08728c01e588f86` |

## 2. Type-Level Divergences

Session `github_repository` creation and resource responses add the Tetral-only
optional `git_identity: TetralGitIdentity`. Credential and token-rotation shapes
remain aligned with upstream. Deployment request types reuse the Session resource
type, but Deployments remain unsupported; this extension enables Session creation only.

Closed alignment: `BetaManagedAgentsModel` follows the upstream known-literal
union widened by `(string & {})`. Known IDs autocomplete, arbitrary strings
type-check, and the engine remains the runtime model gatekeeper.

Session create uses plain Agent references; the generated `agent_with_overrides`
variant is intentionally excluded from `SessionCreateParams.agent`.
`BetaEnvironment.config` is narrowed to Cloud configuration; self-hosted
configuration remains unsupported.

## 3. Tetral Extensions And Behavioral Deltas

Tetral-specific extensions and behavior differences are:

A computer repository response always contains `git_identity`, with `null` when
no identity was declared. An invalid Drive Skill can likewise have a null
`description`; inspect `error` before using it.

Session repository `git_identity` declares repository-local Git authorship, not
GitHub authentication. It is create-time-only, has no version, and is returned
unredacted when declared. Omission preserves the Engine fallback; the SDK does
not fill defaults or sanitize values. See [Git commit identity](README.md#git-commit-identity).

| Surface                           | Tetral behavior                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Managed Agent model catalog       | Known IDs are `openai/gpt-5.5`, `openai/gpt-5.6-sol`, `anthropic/claude-opus-4-8`, `anthropic/claude-fable-5`, `deepseek/deepseek-v4-pro`, `moonshotai/kimi-k3`, and `zai/glm-5.2`. `moonshotai/kimi-k2.7-code` is retired; the 5.6 generation uses the precise `openai/gpt-5.6-sol` variant ID.                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Models resource                   | `client.models` and `client.beta.models` support list and retrieve. Page envelopes and `limit` / `before_id` / `after_id` match upstream; catalog contents use Tetral provider/model IDs rather than Anthropic `claude-*` IDs.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Model effort                      | The upstream effort selector is retained but rejected by Engine admission. The engine applies its pinned platform default for each model.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `approval_mode`                   | Supported on Agents and as a Session-local `agent.approval_mode` update. Values are `full_access`, `ask_for_approval`, and `approve_for_me`. Omitted on Agent create, it resolves to `ask_for_approval`; omitted on an Agent or Session update, the current value is kept. A Session-local update applies from the next turn.                                                                                                                                                                                                                                                                                                                                                                                                     |
| `tetral_agent_toolset.family`     | Required on Tetral toolset declarations. Supported families are `claude` and `gpt`. Every Agent must declare exactly one `tetral_agent_toolset`: omitting it, declaring two (same or mixed family), or clearing `tools` so none remains (empty array or `null` — this supersedes the generated docstring's "send empty array or null to clear" for this entry) is a 400. A Session-local `agent.tools` update must keep the entry with the Session's pinned family — the family cannot change for a live Session; change it by updating the Agent (new version) and starting a new Session. Only the declared family's builtin tools are installed in the sandbox. `configs` / `default_config` on this declaration are rejected. |
| MCP declarations                  | Supported as credential-free curated-catalog declarations. Admission accepts the curated catalog and rejects non-catalog URLs.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Agent skill references            | Supported for workspace `custom` skill references (created via `/v1/skills`). Read-only guidance, not model-facing tools.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Session creation                  | Requires explicit `vault_ids`, using `[]` when no Vault is bound.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Session `providers`               | Supported as `{ [provider_id]: { credential_id } }` on create and returned on the Session; an update that names `providers` is refused. The provider key must match the agent's canonical `provider/model` provider; credentials must come from a Session-bound Vault.                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Session image input               | Accepts only Files API references (`source.type = "file"`) for `image/jpeg`, `image/png`, `image/gif`, and `image/webp`, up to 10 MB each. An events request may contain at most 32 file-backed image and document references combined, narrower than Anthropic's documented image allowance. Base64 and URL sources are rejected with an upload-first 400. Accepted `file_id` values are stored and echoed verbatim; media remains eligible to ride provider requests until a turn commits settled output.                                                                                                                                                                                                                       |
| Session document input            | Accepts only Files API references for `application/pdf` and `text/plain`. PDFs in one events request are limited to 32 MB and 600 pages in aggregate; `text/plain` has no separate admission byte cap. Inline base64, text, and URL sources are rejected with an upload-first 400. The document `file_id` is stored and echoed verbatim; `context` and `title` are refused.                                                                                                                                                                                                                                                                                                                                                       |
| Session resources                 | Supported subset: file add/list/retrieve/delete, memory-store attachment, and GitHub repository params with a required write-only `authorization_token`. GitHub resource tokens rotate through `client.beta.sessions.resources.update(...)` and are never echoed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| GitHub resource URL uniqueness    | Session creation and computer addition reject a computer whose `repositories` repeat a repository by comparison key (trim an optional case-sensitive `.git` suffix first, then case-fold owner/repo) with `400`. The check is per computer: two computers of one Session may hold the same repository. Stored and echoed URLs remain verbatim.                                                                                                                                                                                                                                                                                                                                                                                    |
| Session `environment_id`          | Behavioural divergence: on the Session object it is the `environment_id` of the first attached cloud computer, and `""` when the Session has none, for example once it is archived. Upstream, it names the Session's own Environment.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Session `computers`               | Creation takes `computers`, a list of cloud computers (`environment_id`, optional `working_directory` defaulting to `/workspace`, `repositories`, `drive_exclude`) and user computers (`instance_id` of a registered machine, `working_directory`, `networking` `blocked` or `unrestricted`, `drive_exclude`), with at least one cloud computer. The top-level `environment_id` remains as a one-computer list and is the only form that takes `resources`; `computers` beside `environment_id` or `resources` returns 400. Every Session object carries `computers`, its attached computers in the order they were added.                                                                                                        |
| Session `drives`                  | Creation takes `drives`, each `{drive_id, access}` with `access` `read_only` or `read_write`; a drive listed twice returns 400. The Session object carries `drives`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Session computer routes           | `client.beta.sessions.computers` `create` (requires `idempotencyKey`, sent as `Idempotency-Key`), `retrieve` and `delete` on `/v1/sessions/{session_id}/computers`. Adding and removing need an idle Session. `delete` resolves to the computer while its closure is outstanding (`202`) and to `null` once it is closed (`204`).                                                                                                                                                                                                                                                                                                                                                                                                 |
| Session drive binding routes      | `client.beta.sessions.drives` `create`, `update` (its `access`) and `delete` on `/v1/sessions/{session_id}/drives`; each needs an idle Session.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Drives resource                   | `client.beta.drives`: drives with `usage`, `files` (upload with at most one of `expected_content_sha256` and `must_not_exist`, list, download, delete) and their `versions` (list, retrieve, content, redact), `skills` (zip upload, list, retrieve, delete), `changes` (list by paired `after`/`after_index` cursor, `session_id` and `limit`, and an SSE stream of `{drive_id, seq}`) and `restore`. Lists take `limit` and `page` and return `{data, next_page}`, except `changes.list`, which returns `{data, has_more}`.                                                                                                                                                                                                     |
| `session.computer_replaced`       | Engine addition to the Session event union: the current machine of an attached cloud computer was deregistered. It carries only `type`, `id`, `processed_at` and `computer_id`, and is a notice, never a `session.error`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Computer and drive Session errors | Engine additions to the `session.error` union: `computer_preparation_error` (`computer_id`, `code`), `computer_sandbox_error` (`computer_id`) and `drive_mount_error` (`drive_id`, `computer_id`), each with `retry_status` `retrying`; `computer_cleanup_error` (`computer_id`, `cleanup_failures: Array<{path, message}>`) with terminal retry status and operator cleanup required; `drive_changes_lost_error` (`drive_id`, `computer_id`, `paths`, `paths_total`) with `retry_status` `terminal`.                                                                                                                                                                                                                             |
| Cloud Environments                | Supported for cloud environments with `unrestricted`, `blocked`, or `cidr_allow_list` networking.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Provider credentials in Vault     | Supported through `provider_api_key` and OpenAI `provider_oauth`. OpenAI OAuth create requires `access_mode: "oauth"` plus access token, refresh token, expiry, and account ID.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Memory list ordering              | `memories.list` accepts `order_by` (`path`, `created_at`, or `updated_at`; default `path`) and `order` (`asc` or `desc`; default `asc`). Other values return 400.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| MCP OAuth validation              | Follows the upstream null rules: `mcp_probe` is `null` when the probe succeeds; `refresh` is `null` when no token exchange was attempted, and its status is `no_refresh_token` only when the probe was rejected with 401 and no refresh token is stored. Differences: Engine refreshes before probing when the stored access token has expired or has no valid expiry time, then probes with the new token, and never refreshes after a 401; upstream refreshes after a 401 and does not re-probe. A `failed` refresh reports `http_response.status_code` and `body_truncated`, but `body` and `content_type` are always empty strings; upstream returns the scrubbed body and the real content type.                             |

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

On supported routes, `workspace_id` sends `anthropic-workspace-id`. A single
value matching the token workspace is supported; a different, empty, or repeated
header returns 403 `permission_error`. This does not grant access to another
workspace or enable an otherwise unsupported route.

Memory attribution identifies the actor that performed the operation:

| Credential or execution                 | Actor                   | Identity field                                  |
| --------------------------------------- | ----------------------- | ----------------------------------------------- |
| Direct service identity token           | `service_account_actor` | `service_account_id`: stable Engine identity ID |
| Direct human identity token             | `user_actor`            | `user_id`: stable Engine identity ID            |
| Independent or identity-derived API key | `api_actor`             | `api_key_id`: actual key ID                     |
| Runtime Session operation               | `session_actor`         | `session_id`: Session ID                        |

The `service_account_id` is the stable Engine identity ID, not an Anthropic
`svac_` ID, upstream JWT subject or service-account selector.

### Session streaming

Session `events.stream` supports optional `event_deltas: ['agent.message',
'agent.thinking']` through the existing upstream API. Only the public primary
thread is eligible. `agent.message` previews use `event_start` followed by
best-effort `event_delta` text fragments; `agent.thinking` is a start-only
notification with no thinking body or signature. Omitting `event_deltas` keeps
Session delivery formal-only. Every Thread stream, including the primary
Thread endpoint, remains formal-only. The upstream Thread `event_deltas`
parameter remains in the SDK type, but supplying it returns 400
`invalid_request_error`.
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

### Files

Files upload size failures return HTTP 413 `request_too_large`. If bytes are
stored but metadata commit fails, backend cleanup removes the orphaned object
on a best-effort basis. Downloads return durable file content.

Beta Files lists use `limit` and `page` with `{data, next_page}`. Signed page
cursors bind the workspace and `scope_id`; files are ordered oldest first and
pagination survives deletion of the cursor's last file. `after_id` and
`before_id` are rejected. Uploads without a filename use `unnamed`, with a fixed
extension for known MIME types; path-qualified filenames keep only the basename.

### Skills

Beta Skills use the upstream GA data shape: `id`, `type`, `created_at`,
`updated_at`, `display_name`, `latest_version_id`, and `source: {type: 'custom'}`.
The single-line display name is limited to 255 characters and defaults to the
SKILL.md frontmatter `name`. All versions of a skill must keep that name.
Versions expose `id`, `type`, `skill_id`, `name`, `description`, and `created_at`;
`version`, `directory`, and list `has_more` are not returned. Version IDs
use `skver_`; GET accepts `latest`, while download and delete require a concrete ID.
The Skill mount directory is the uploaded package root, not the version `name`.
Public metadata does not expose storage locations or grant filesystem access.

Session creation resolves Agent `latest` references in its transaction and
saves concrete Skill versions. Session/Thread responses, Sandbox loading and
Bridge runtime configuration use those saved references. Uploading or deleting
a version never changes an existing Session's content. Agent configuration
keeps `latest` for future Sessions. Deleting a Skill also deletes all its
versions from the public API, while existing Sessions retain access to their
saved content. Historical Agent reads are unchanged; Agent writes and new
Sessions referencing deleted Skills or versions return 400. Deleting the last
version alone returns 400; deleting the latest of multiple versions falls back
to the previous active version for future Sessions.

### Memory

Memory APIs are synchronous CRUD and versioning operations. Attach stores by
explicit `memory_store_id` in Session resources; there is no implicit default
store. Memory HTTP 409 responses use `invalid_request_error`. Memory store
`description` is a string, empty when unset.

## 4. Retained Unsupported Or Deferred Surface

These surfaces remain in the SDK for Anthropic compatibility or generated surface stability, but Tetral does not present them as working behavior. Generated request paths are kept unless a type-level divergence is listed above; Engine refuses an unsupported request with an SDK-compatible error. A type being available does not enable its behavior.

### Helpers and surfaces outside the comparison

The generated list below states what the two API descriptions say. These SDK helpers and surfaces are not operations of their own, so the comparison cannot list them:

| Surface                                                                                | Scope                                                                                                           |
| -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `WorkPoller.[Symbol.asyncIterator]`, `EnvironmentWorker.run`                           | Environment work requests return 400.                                                                           |
| `SessionToolRunner.[Symbol.asyncIterator]`                                             | `user.tool_result` is refused; the hosted runtime owns tool execution.                                          |
| `BetaToolRunner` (`addTools`, `removeTools`, `deferToolCall`, `compactBeforeNextTurn`) | Messages calls return 400; tool-runner orchestration is unsupported.                                            |
| `SessionMemoryStores` (`download`, `finish`, `flushWrites`, `syncIfDue`)               | Underlying Memory CRUD routes exist; helper execution is retained unsupported/unverified.                       |
| `setupSkills`                                                                          | Existing Session/Skill APIs; local Skill setup remains unsupported and unverified for the hosted Engine.        |
| Webhooks, with Agent and deployment webhook event types                                | Deferred.                                                                                                       |
| Session list reverse pagination                                                        | `sessions.list` uses `BidirectionalPageCursor`; forward iteration works unchanged and `prev_page` stays `null`. |

`setupSkills` resolves `latest` through GET and downloads by the returned version ID; Engine's own mount uses the uploaded package root as described in §3. GA `client.organization` is retained from upstream and does not expose Engine API-key or identity administration.

Repository authentication, checkout, clone, forbidden and not-found errors are produced by computer preparation reports as Session-level `session.error` events with `repository_url`, `message` and `retry_status: {type: "retrying"}`. Idle events emit `stop_details: null`; Thread-created events and Thread objects emit `workflow_run_id: null`. No workflow execution or refusal details are implied. GitHub repository tokens are write-only and rotatable. A Memory store update with `name: null` returns 400 `invalid_request_error`.

### Generated list

<!-- generated by scripts/compatibility-list.cjs: start -->

This list is generated in the SDK repository by `scripts/compatibility-list.cjs`. It compares the
upstream spec that the SDK's types are generated from with Engine's OpenAPI file at Engine commit
`6a2205b42855a74b6278ea2d366a1a182912307e`. A place is written as a path into the request body or
the answer: `[]` is an item of a list, `<name>` the object whose `type` is `name`. Where the fork
writes a type by hand (§2), that type may no longer offer what a line names.

#### Operations Engine refuses as unsupported

Engine answers 400 `invalid_request_error`.

- `/v1/deployment_runs`: GET
- `/v1/deployment_runs/{deployment_run_id}`: GET
- `/v1/deployments`: GET, POST
- `/v1/deployments/{deployment_id}`: GET, POST
- `/v1/deployments/{deployment_id}/archive`: POST
- `/v1/deployments/{deployment_id}/pause`: POST
- `/v1/deployments/{deployment_id}/run`: POST
- `/v1/deployments/{deployment_id}/unpause`: POST
- `/v1/environments/{environment_id}/work`: GET
- `/v1/environments/{environment_id}/work/poll`: GET
- `/v1/environments/{environment_id}/work/stats`: GET
- `/v1/environments/{environment_id}/work/{work_id}`: GET, POST
- `/v1/environments/{environment_id}/work/{work_id}/ack`: POST
- `/v1/environments/{environment_id}/work/{work_id}/heartbeat`: POST
- `/v1/environments/{environment_id}/work/{work_id}/stop`: POST
- `/v1/messages`: POST
- `/v1/messages/batches`: GET, POST
- `/v1/messages/batches/{message_batch_id}`: DELETE, GET
- `/v1/messages/batches/{message_batch_id}/cancel`: POST
- `/v1/messages/batches/{message_batch_id}/results`: GET
- `/v1/messages/count_tokens`: POST
- `/v1/user_profiles`: GET, POST
- `/v1/user_profiles/{user_profile_id}`: GET, POST
- `/v1/user_profiles/{user_profile_id}/enrollment_url`: POST

#### Operations Engine does not have

Engine answers 404, or 405 where it has the path with other methods only.

- `/v1/complete`: POST
- `/v1/dreams`: GET, POST
- `/v1/dreams/{dream_id}`: GET
- `/v1/dreams/{dream_id}/archive`: POST
- `/v1/dreams/{dream_id}/cancel`: POST
- `/v1/organizations/analytics/apps/chat/projects`: GET
- `/v1/organizations/analytics/artifacts`: GET
- `/v1/organizations/analytics/connectors`: GET
- `/v1/organizations/analytics/cost_report`: GET
- `/v1/organizations/analytics/plugins`: GET
- `/v1/organizations/analytics/skills`: GET
- `/v1/organizations/analytics/summaries`: GET
- `/v1/organizations/analytics/usage_report`: GET
- `/v1/organizations/analytics/user_cost_report`: GET
- `/v1/organizations/analytics/user_usage_report`: GET
- `/v1/organizations/analytics/users`: GET
- `/v1/organizations/api_keys`: GET
- `/v1/organizations/api_keys/{api_key_id}`: GET, POST
- `/v1/organizations/compliance_settings`: GET, POST
- `/v1/organizations/cost_report`: GET
- `/v1/organizations/external_keys`: GET, POST
- `/v1/organizations/external_keys/{external_key_id}`: DELETE, GET, POST
- `/v1/organizations/external_keys/{external_key_id}/validate`: POST
- `/v1/organizations/federation_issuers`: GET, POST
- `/v1/organizations/federation_issuers/{federation_issuer_id}`: GET, POST
- `/v1/organizations/federation_issuers/{federation_issuer_id}/archive`: POST
- `/v1/organizations/federation_rules`: GET, POST
- `/v1/organizations/federation_rules/{federation_rule_id}`: GET, POST
- `/v1/organizations/federation_rules/{federation_rule_id}/archive`: POST
- `/v1/organizations/federation_rules/{federation_rule_id}/workspaces`: GET, POST
- `/v1/organizations/federation_rules/{federation_rule_id}/workspaces/{workspace_id}`: DELETE
- `/v1/organizations/invites`: GET, POST
- `/v1/organizations/invites/{invite_id}`: DELETE, GET
- `/v1/organizations/me`: GET
- `/v1/organizations/plugin_marketplaces`: GET
- `/v1/organizations/plugin_marketplaces/validate_archive`: POST
- `/v1/organizations/plugin_marketplaces/validate_repository`: POST
- `/v1/organizations/plugin_marketplaces/{marketplace_id}`: GET, POST
- `/v1/organizations/plugins`: GET, POST
- `/v1/organizations/plugins/{plugin_id}`: DELETE, GET, POST
- `/v1/organizations/plugins/{plugin_id}/installation_settings`: GET
- `/v1/organizations/plugins/{plugin_id}/installation_settings/{target}`: DELETE, POST
- `/v1/organizations/plugins/{plugin_id}/shares`: GET
- `/v1/organizations/plugins/{plugin_id}/versions`: GET, POST
- `/v1/organizations/plugins/{plugin_id}/versions/{version}`: GET
- `/v1/organizations/plugins/{plugin_id}/versions/{version}/content`: GET
- `/v1/organizations/rate_limits`: GET
- `/v1/organizations/rbac_groups`: GET, POST
- `/v1/organizations/rbac_groups/{rbac_group_id}`: DELETE, GET, POST
- `/v1/organizations/rbac_groups/{rbac_group_id}/members`: GET, POST
- `/v1/organizations/rbac_groups/{rbac_group_id}/members/{user_id}`: DELETE
- `/v1/organizations/rbac_roles`: GET
- `/v1/organizations/rbac_roles/{rbac_role_id}`: GET
- `/v1/organizations/rbac_roles/{rbac_role_id}/permissions`: GET
- `/v1/organizations/service_accounts`: GET, POST
- `/v1/organizations/service_accounts/{service_account_id}`: GET, POST
- `/v1/organizations/service_accounts/{service_account_id}/archive`: POST
- `/v1/organizations/service_accounts/{service_account_id}/workspaces`: GET, POST
- `/v1/organizations/service_accounts/{service_account_id}/workspaces/{workspace_id}`: DELETE
- `/v1/organizations/spend_limit_increase_requests`: GET
- `/v1/organizations/spend_limit_increase_requests/{spend_limit_increase_request_id}`: GET
- `/v1/organizations/spend_limit_increase_requests/{spend_limit_increase_request_id}/approve`: POST
- `/v1/organizations/spend_limit_increase_requests/{spend_limit_increase_request_id}/deny`: POST
- `/v1/organizations/spend_limits`: GET, POST
- `/v1/organizations/spend_limits/effective`: GET
- `/v1/organizations/spend_limits/{spend_limit_id}`: DELETE, GET
- `/v1/organizations/tunnels`: GET
- `/v1/organizations/tunnels/{tunnel_id}`: GET
- `/v1/organizations/tunnels/{tunnel_id}/archive`: POST
- `/v1/organizations/tunnels/{tunnel_id}/certificates`: GET, POST
- `/v1/organizations/tunnels/{tunnel_id}/certificates/{certificate_id}`: GET
- `/v1/organizations/tunnels/{tunnel_id}/certificates/{certificate_id}/archive`: POST
- `/v1/organizations/tunnels/{tunnel_id}/reveal_token`: POST
- `/v1/organizations/tunnels/{tunnel_id}/rotate_token`: POST
- `/v1/organizations/usage_report/claude_code`: GET
- `/v1/organizations/usage_report/messages`: GET
- `/v1/organizations/users`: GET
- `/v1/organizations/users/{user_id}`: DELETE, GET, POST
- `/v1/organizations/workspaces`: GET, POST
- `/v1/organizations/workspaces/{workspace_id}`: GET, POST
- `/v1/organizations/workspaces/{workspace_id}/archive`: POST
- `/v1/organizations/workspaces/{workspace_id}/members`: GET, POST
- `/v1/organizations/workspaces/{workspace_id}/members/{user_id}`: DELETE, GET, POST
- `/v1/organizations/workspaces/{workspace_id}/rate_limits`: GET
- `/v1/organizations/workspaces/{workspace_id}/service_accounts`: GET, POST
- `/v1/organizations/workspaces/{workspace_id}/service_accounts/{service_account_id}`: DELETE, GET, POST
- `/v1/tunnels`: GET, POST
- `/v1/tunnels/{tunnel_id}`: GET
- `/v1/tunnels/{tunnel_id}/archive`: POST
- `/v1/tunnels/{tunnel_id}/certificates`: GET, POST
- `/v1/tunnels/{tunnel_id}/certificates/{certificate_id}`: GET
- `/v1/tunnels/{tunnel_id}/certificates/{certificate_id}/archive`: POST
- `/v1/tunnels/{tunnel_id}/reveal_token`: POST
- `/v1/tunnels/{tunnel_id}/rotate_token`: POST

#### Operations Engine serves only with `beta=true`

The SDK also has these without the `beta=true` query; Engine requires it.

- `/v1/files`: GET, POST
- `/v1/files/{file_id}`: DELETE, GET
- `/v1/files/{file_id}/content`: GET
- `/v1/skills`: GET, POST
- `/v1/skills/{skill_id}`: DELETE, GET
- `/v1/skills/{skill_id}/versions`: GET, POST
- `/v1/skills/{skill_id}/versions/{version}`: DELETE, GET

#### Request parameters, fields and values Engine refuses

- `body.agent` member `agent_with_overrides`: `POST /v1/sessions`
- `body.agent.tools[]` members `agent_toolset_20260401`, `custom`: `POST /v1/sessions/{session_id}`
- `body.agent.tools[]<mcp_toolset>.configs[].permission_policy` member `auto`: `POST /v1/sessions/{session_id}`
- `body.agent.tools[]<mcp_toolset>.configs[].permission_policy` value `null`: `POST /v1/sessions/{session_id}`
- `body.agent.tools[]<mcp_toolset>.default_config` value `null`: `POST /v1/sessions/{session_id}`
- `body.agent.tools[]<mcp_toolset>.default_config.permission_policy` member `auto`: `POST /v1/sessions/{session_id}`
- `body.agent.tools[]<mcp_toolset>.default_config.permission_policy` value `null`: `POST /v1/sessions/{session_id}`
- `body.auth` member `environment_variable`: `POST /v1/vaults/{vault_id}/credentials`, `POST /v1/vaults/{vault_id}/credentials/{credential_id}`
- `body.auth<mcp_oauth>.access_token` value `null`: `POST /v1/vaults/{vault_id}/credentials/{credential_id}`
- `body.auth<mcp_oauth>.refresh.refresh_token` value `null`: `POST /v1/vaults/{vault_id}/credentials/{credential_id}`
- `body.auth<mcp_oauth>.refresh.token_endpoint_auth<client_secret_basic>.client_secret` value `null`: `POST /v1/vaults/{vault_id}/credentials/{credential_id}`
- `body.auth<mcp_oauth>.refresh.token_endpoint_auth<client_secret_post>.client_secret` value `null`: `POST /v1/vaults/{vault_id}/credentials/{credential_id}`
- `body.auth<static_bearer>.token` value `null`: `POST /v1/vaults/{vault_id}/credentials/{credential_id}`
- `body.budget`: `POST /v1/sessions`, `POST /v1/sessions/{session_id}`
- `body.config` member `self_hosted`: `POST /v1/environments`, `POST /v1/environments/{environment_id}`
- `body.config` value `null`: `POST /v1/environments`
- `body.config<cloud>.networking` member `limited`: `POST /v1/environments`, `POST /v1/environments/{environment_id}`
- `body.config<cloud>.networking` value `null`: `POST /v1/environments`, `POST /v1/environments/{environment_id}`
- `body.config<cloud>.packages` value `null`: `POST /v1/environments`, `POST /v1/environments/{environment_id}`
- `body.config<cloud>.packages<packages>.apt` value `null`: `POST /v1/environments`, `POST /v1/environments/{environment_id}`
- `body.config<cloud>.packages<packages>.cargo` value `null`: `POST /v1/environments`, `POST /v1/environments/{environment_id}`
- `body.config<cloud>.packages<packages>.gem` value `null`: `POST /v1/environments`, `POST /v1/environments/{environment_id}`
- `body.config<cloud>.packages<packages>.go` value `null`: `POST /v1/environments`, `POST /v1/environments/{environment_id}`
- `body.config<cloud>.packages<packages>.npm` value `null`: `POST /v1/environments`, `POST /v1/environments/{environment_id}`
- `body.config<cloud>.packages<packages>.pip` value `null`: `POST /v1/environments`, `POST /v1/environments/{environment_id}`
- `body.content` value `null`: `POST /v1/memory_stores/{memory_store_id}/memories`, `POST /v1/memory_stores/{memory_store_id}/memories/{memory_id}`
- `body.display_name` value `null`: `POST /v1/skills`, `POST /v1/vaults/{vault_id}`, `POST /v1/vaults/{vault_id}/credentials`
- `body.events[]` members `system.message`, `user.custom_tool_result`, `user.define_outcome`, `user.tool_result`: `POST /v1/sessions/{session_id}/events`
- `body.events[]<user.interrupt>.session_thread_id` value `null`: `POST /v1/sessions/{session_id}/events`
- `body.events[]<user.message>.content[]` member `redacted`: `POST /v1/sessions/{session_id}/events`
- `body.events[]<user.message>.content[]<document>.context`: `POST /v1/sessions/{session_id}/events`
- `body.events[]<user.message>.content[]<document>.source` members `base64`, `text`, `url`: `POST /v1/sessions/{session_id}/events`
- `body.events[]<user.message>.content[]<document>.title`: `POST /v1/sessions/{session_id}/events`
- `body.events[]<user.message>.content[]<image>.source` members `base64`, `url`: `POST /v1/sessions/{session_id}/events`
- `body.expires_in_seconds`: `POST /v1/files`
- `body.initial_events`: `POST /v1/sessions`
- `body.model.effort`: `POST /v1/agents`, `POST /v1/agents/{agent_id}`
- `body.model.id` values `claude-fable-5`, `claude-fable-5-1`, `claude-haiku-4-5`, `claude-haiku-4-5-20251001`, `claude-haiku-5-5`, `claude-opus-4-5`, `claude-opus-4-5-20251101`, `claude-opus-4-6`, `claude-opus-4-7`, `claude-opus-4-8`, `claude-opus-5`, `claude-opus-5-5`, `claude-sonnet-4-5`, `claude-sonnet-4-5-20250929`, `claude-sonnet-4-6`, `claude-sonnet-5`, `claude-sonnet-5-5`: `POST /v1/agents`, `POST /v1/agents/{agent_id}`
- `body.model.inference_geo`: `POST /v1/agents`, `POST /v1/agents/{agent_id}`
- `body.model.speed` values `fast`, `null`: `POST /v1/agents`, `POST /v1/agents/{agent_id}`
- `body.multiagent` other than `null`: `POST /v1/agents`, `POST /v1/agents/{agent_id}`
- `body.name` value `null`: `POST /v1/memory_stores/{memory_store_id}`
- `body.path` value `null`: `POST /v1/memory_stores/{memory_store_id}/memories/{memory_id}`
- `body.resources[]<github_repository>.checkout` value `null`: `POST /v1/sessions`
- `body.scope`: `POST /v1/environments`, `POST /v1/environments/{environment_id}`
- `body.skills[]` member `anthropic`: `POST /v1/agents`, `POST /v1/agents/{agent_id}`
- `body.tools` value `null`: `POST /v1/agents/{agent_id}`
- `body.tools[]` members `agent_toolset_20260401`, `custom`: `POST /v1/agents`, `POST /v1/agents/{agent_id}`
- `body.tools[]<mcp_toolset>.configs[].permission_policy` member `auto`: `POST /v1/agents`, `POST /v1/agents/{agent_id}`
- `body.tools[]<mcp_toolset>.configs[].permission_policy` value `null`: `POST /v1/agents`, `POST /v1/agents/{agent_id}`
- `body.tools[]<mcp_toolset>.default_config` value `null`: `POST /v1/agents`, `POST /v1/agents/{agent_id}`
- `body.tools[]<mcp_toolset>.default_config.permission_policy` member `auto`: `POST /v1/agents`, `POST /v1/agents/{agent_id}`
- `body.tools[]<mcp_toolset>.default_config.permission_policy` value `null`: `POST /v1/agents`, `POST /v1/agents/{agent_id}`
- `body.vault_ids`: `POST /v1/sessions/{session_id}`
- `query event_deltas[]`: `GET /v1/sessions/{session_id}/threads/{thread_id}/stream`
- `query ids[]`: `GET /v1/files`
- `query lifecycle[]`: `GET /v1/models`
- `query service_account_id`: `GET /v1/memory_stores/{memory_store_id}/memory_versions`
- `query statuses[]`: `GET /v1/sessions/{session_id}/threads`

#### Request fields Engine requires

The upstream types leave these optional; Engine refuses a request without them.

- `body.auth<mcp_oauth>.refresh.token_endpoint_auth<client_secret_basic>.client_secret`: `POST /v1/vaults/{vault_id}/credentials/{credential_id}`
- `body.auth<mcp_oauth>.refresh.token_endpoint_auth<client_secret_post>.client_secret`: `POST /v1/vaults/{vault_id}/credentials/{credential_id}`
- `body.precondition<content_sha256>.content_sha256`: `POST /v1/memory_stores/{memory_store_id}/memories/{memory_id}`
- `body.resources[]<github_repository>.authorization_token`: `POST /v1/sessions`
- `body.tools`: `POST /v1/agents`
- `body.vault_ids`: `POST /v1/sessions`
- `body.version`: `POST /v1/agents/{agent_id}`

#### Answer and event members, fields and values Engine never sends

- `answer` members `system.message`, `user.custom_tool_result`, `user.define_outcome`, `user.tool_result`: `GET /v1/sessions/{session_id}/events`, `GET /v1/sessions/{session_id}/events/stream`, `GET /v1/sessions/{session_id}/threads/{thread_id}/events`, `GET /v1/sessions/{session_id}/threads/{thread_id}/stream`, `POST /v1/sessions/{session_id}/events`
- `answer` members `agent.custom_tool_use`, `session.usage`, `span.outcome_evaluation_end`, `span.outcome_evaluation_ongoing`, `span.outcome_evaluation_start`, `workflow_run.created`, `workflow_run.error`, `workflow_run.phase_ended`, `workflow_run.phase_started`, `workflow_run.status_ended`, `workflow_run.status_idle`, `workflow_run.status_running`: `GET /v1/sessions/{session_id}/events`, `GET /v1/sessions/{session_id}/events/stream`, `GET /v1/sessions/{session_id}/threads/{thread_id}/events`, `GET /v1/sessions/{session_id}/threads/{thread_id}/stream`
- `answer` members `event_delta`, `event_start`: `GET /v1/sessions/{session_id}/threads/{thread_id}/stream`
- `answer.prev_page`: `GET /v1/sessions`
- `answer<agent.mcp_tool_result>.content[]` members `document`, `image`, `search_result`: `GET /v1/sessions/{session_id}/events`, `GET /v1/sessions/{session_id}/events/stream`, `GET /v1/sessions/{session_id}/threads/{thread_id}/events`, `GET /v1/sessions/{session_id}/threads/{thread_id}/stream`
- `answer<agent.mcp_tool_use>.evaluation`: `GET /v1/sessions/{session_id}/events`, `GET /v1/sessions/{session_id}/events/stream`, `GET /v1/sessions/{session_id}/threads/{thread_id}/events`, `GET /v1/sessions/{session_id}/threads/{thread_id}/stream`
- `answer<agent.mcp_tool_use>.session_thread_id`: `GET /v1/sessions/{session_id}/events`, `GET /v1/sessions/{session_id}/events/stream`, `GET /v1/sessions/{session_id}/threads/{thread_id}/events`, `GET /v1/sessions/{session_id}/threads/{thread_id}/stream`
- `answer<agent.message>.content[]` member `redacted`: `GET /v1/sessions/{session_id}/events`, `GET /v1/sessions/{session_id}/events/stream`, `GET /v1/sessions/{session_id}/threads/{thread_id}/events`, `GET /v1/sessions/{session_id}/threads/{thread_id}/stream`
- `answer<agent.thread_message_received>.content[]` members `document`, `image`, `redacted`: `GET /v1/sessions/{session_id}/events`, `GET /v1/sessions/{session_id}/events/stream`, `GET /v1/sessions/{session_id}/threads/{thread_id}/events`, `GET /v1/sessions/{session_id}/threads/{thread_id}/stream`
- `answer<agent.thread_message_sent>.content[]` members `document`, `image`, `redacted`: `GET /v1/sessions/{session_id}/events`, `GET /v1/sessions/{session_id}/events/stream`, `GET /v1/sessions/{session_id}/threads/{thread_id}/events`, `GET /v1/sessions/{session_id}/threads/{thread_id}/stream`
- `answer<agent.tool_result>.content[]` members `document`, `image`, `search_result`: `GET /v1/sessions/{session_id}/events`, `GET /v1/sessions/{session_id}/events/stream`, `GET /v1/sessions/{session_id}/threads/{thread_id}/events`, `GET /v1/sessions/{session_id}/threads/{thread_id}/stream`
- `answer<agent.tool_use>.evaluation`: `GET /v1/sessions/{session_id}/events`, `GET /v1/sessions/{session_id}/events/stream`, `GET /v1/sessions/{session_id}/threads/{thread_id}/events`, `GET /v1/sessions/{session_id}/threads/{thread_id}/stream`
- `answer<agent.tool_use>.session_thread_id`: `GET /v1/sessions/{session_id}/events`, `GET /v1/sessions/{session_id}/events/stream`, `GET /v1/sessions/{session_id}/threads/{thread_id}/events`, `GET /v1/sessions/{session_id}/threads/{thread_id}/stream`
- `answer<agent>.model.effort`: `GET /v1/agents`, `GET /v1/agents/{agent_id}`, `GET /v1/agents/{agent_id}/versions`, `POST /v1/agents`, `POST /v1/agents/{agent_id}`, `POST /v1/agents/{agent_id}/archive`
- `answer<agent>.model.id` values `claude-fable-5`, `claude-fable-5-1`, `claude-haiku-4-5`, `claude-haiku-4-5-20251001`, `claude-haiku-5-5`, `claude-opus-4-5`, `claude-opus-4-5-20251101`, `claude-opus-4-6`, `claude-opus-4-7`, `claude-opus-4-8`, `claude-opus-5`, `claude-opus-5-5`, `claude-sonnet-4-5`, `claude-sonnet-4-5-20250929`, `claude-sonnet-4-6`, `claude-sonnet-5`, `claude-sonnet-5-5`: `GET /v1/agents`, `GET /v1/agents/{agent_id}`, `GET /v1/agents/{agent_id}/versions`, `POST /v1/agents`, `POST /v1/agents/{agent_id}`, `POST /v1/agents/{agent_id}/archive`
- `answer<agent>.model.inference_geo`: `GET /v1/agents`, `GET /v1/agents/{agent_id}`, `GET /v1/agents/{agent_id}/versions`, `POST /v1/agents`, `POST /v1/agents/{agent_id}`, `POST /v1/agents/{agent_id}/archive`
- `answer<agent>.model.speed`: `GET /v1/agents`, `GET /v1/agents/{agent_id}`, `GET /v1/agents/{agent_id}/versions`, `POST /v1/agents`, `POST /v1/agents/{agent_id}`, `POST /v1/agents/{agent_id}/archive`
- `answer<agent>.multiagent` other than `null`: `GET /v1/agents`, `GET /v1/agents/{agent_id}`, `GET /v1/agents/{agent_id}/versions`, `POST /v1/agents`, `POST /v1/agents/{agent_id}`, `POST /v1/agents/{agent_id}/archive`
- `answer<agent>.skills[]` member `anthropic`: `GET /v1/agents`, `GET /v1/agents/{agent_id}`, `GET /v1/agents/{agent_id}/versions`, `POST /v1/agents`, `POST /v1/agents/{agent_id}`, `POST /v1/agents/{agent_id}/archive`
- `answer<agent>.tools[]` members `agent_toolset_20260401`, `custom`: `GET /v1/agents`, `GET /v1/agents/{agent_id}`, `GET /v1/agents/{agent_id}/versions`, `POST /v1/agents`, `POST /v1/agents/{agent_id}`, `POST /v1/agents/{agent_id}/archive`
- `answer<agent>.tools[]<mcp_toolset>.configs[].permission_policy` member `auto`: `GET /v1/agents`, `GET /v1/agents/{agent_id}`, `GET /v1/agents/{agent_id}/versions`, `POST /v1/agents`, `POST /v1/agents/{agent_id}`, `POST /v1/agents/{agent_id}/archive`
- `answer<agent>.tools[]<mcp_toolset>.default_config.permission_policy` member `auto`: `GET /v1/agents`, `GET /v1/agents/{agent_id}`, `GET /v1/agents/{agent_id}/versions`, `POST /v1/agents`, `POST /v1/agents/{agent_id}`, `POST /v1/agents/{agent_id}/archive`
- `answer<environment>.config` member `self_hosted`: `GET /v1/environments`, `GET /v1/environments/{environment_id}`, `POST /v1/environments`, `POST /v1/environments/{environment_id}`, `POST /v1/environments/{environment_id}/archive`
- `answer<environment>.config<cloud>.networking` member `limited`: `GET /v1/environments`, `GET /v1/environments/{environment_id}`, `POST /v1/environments`, `POST /v1/environments/{environment_id}`, `POST /v1/environments/{environment_id}/archive`
- `answer<environment>.scope`: `GET /v1/environments`, `GET /v1/environments/{environment_id}`, `POST /v1/environments`, `POST /v1/environments/{environment_id}`, `POST /v1/environments/{environment_id}/archive`
- `answer<file>.expires_at`: `GET /v1/files`, `GET /v1/files/{file_id}`, `POST /v1/files`
- `answer<model>.allowed_fallback_models` other than `null`: `GET /v1/models`, `GET /v1/models/{model_id}`
- `answer<model>.capabilities` other than `null`: `GET /v1/models`, `GET /v1/models/{model_id}`
- `answer<model>.deprecated_at` other than `null`: `GET /v1/models`, `GET /v1/models/{model_id}`
- `answer<model>.lifecycle` values `deprecated`, `retired`: `GET /v1/models`, `GET /v1/models/{model_id}`
- `answer<model>.line` values `haiku`, `mythos`, `sonnet`: `GET /v1/models`, `GET /v1/models/{model_id}`
- `answer<model>.retires_at` other than `null`: `GET /v1/models`, `GET /v1/models/{model_id}`
- `answer<session.error>.error` members `billing_error`, `credential_host_unreachable_error`: `GET /v1/sessions/{session_id}/events`, `GET /v1/sessions/{session_id}/events/stream`, `GET /v1/sessions/{session_id}/threads/{thread_id}/events`, `GET /v1/sessions/{session_id}/threads/{thread_id}/stream`
- `answer<session.status_idle>.stop_details` other than `null`: `GET /v1/sessions/{session_id}/events`, `GET /v1/sessions/{session_id}/events/stream`, `GET /v1/sessions/{session_id}/threads/{thread_id}/events`, `GET /v1/sessions/{session_id}/threads/{thread_id}/stream`
- `answer<session.status_idle>.stop_reason` members `budget_reached`, `refusal`: `GET /v1/sessions/{session_id}/events`, `GET /v1/sessions/{session_id}/events/stream`, `GET /v1/sessions/{session_id}/threads/{thread_id}/events`, `GET /v1/sessions/{session_id}/threads/{thread_id}/stream`
- `answer<session.thread_created>.workflow_run_id` other than `null`: `GET /v1/sessions/{session_id}/events`, `GET /v1/sessions/{session_id}/events/stream`, `GET /v1/sessions/{session_id}/threads/{thread_id}/events`, `GET /v1/sessions/{session_id}/threads/{thread_id}/stream`
- `answer<session.thread_status_idle>.stop_details` other than `null`: `GET /v1/sessions/{session_id}/events`, `GET /v1/sessions/{session_id}/events/stream`, `GET /v1/sessions/{session_id}/threads/{thread_id}/events`, `GET /v1/sessions/{session_id}/threads/{thread_id}/stream`
- `answer<session.thread_status_idle>.stop_reason` members `budget_reached`, `refusal`: `GET /v1/sessions/{session_id}/events`, `GET /v1/sessions/{session_id}/events/stream`, `GET /v1/sessions/{session_id}/threads/{thread_id}/events`, `GET /v1/sessions/{session_id}/threads/{thread_id}/stream`
- `answer<session.updated>.agent`: `GET /v1/sessions/{session_id}/events`, `GET /v1/sessions/{session_id}/events/stream`, `GET /v1/sessions/{session_id}/threads/{thread_id}/events`, `GET /v1/sessions/{session_id}/threads/{thread_id}/stream`
- `answer<session.updated>.budget`: `GET /v1/sessions/{session_id}/events`, `GET /v1/sessions/{session_id}/events/stream`, `GET /v1/sessions/{session_id}/threads/{thread_id}/events`, `GET /v1/sessions/{session_id}/threads/{thread_id}/stream`
- `answer<session.updated>.metadata`: `GET /v1/sessions/{session_id}/events`, `GET /v1/sessions/{session_id}/events/stream`, `GET /v1/sessions/{session_id}/threads/{thread_id}/events`, `GET /v1/sessions/{session_id}/threads/{thread_id}/stream`
- `answer<session.updated>.title`: `GET /v1/sessions/{session_id}/events`, `GET /v1/sessions/{session_id}/events/stream`, `GET /v1/sessions/{session_id}/threads/{thread_id}/events`, `GET /v1/sessions/{session_id}/threads/{thread_id}/stream`
- `answer<session>.agent<agent>.model.effort`: `GET /v1/sessions`, `GET /v1/sessions/{session_id}`, `POST /v1/sessions`, `POST /v1/sessions/{session_id}`, `POST /v1/sessions/{session_id}/archive`
- `answer<session>.agent<agent>.model.id` values `claude-fable-5`, `claude-fable-5-1`, `claude-haiku-4-5`, `claude-haiku-4-5-20251001`, `claude-haiku-5-5`, `claude-opus-4-5`, `claude-opus-4-5-20251101`, `claude-opus-4-6`, `claude-opus-4-7`, `claude-opus-4-8`, `claude-opus-5`, `claude-opus-5-5`, `claude-sonnet-4-5`, `claude-sonnet-4-5-20250929`, `claude-sonnet-4-6`, `claude-sonnet-5`, `claude-sonnet-5-5`: `GET /v1/sessions`, `GET /v1/sessions/{session_id}`, `POST /v1/sessions`, `POST /v1/sessions/{session_id}`, `POST /v1/sessions/{session_id}/archive`
- `answer<session>.agent<agent>.model.inference_geo`: `GET /v1/sessions`, `GET /v1/sessions/{session_id}`, `POST /v1/sessions`, `POST /v1/sessions/{session_id}`, `POST /v1/sessions/{session_id}/archive`
- `answer<session>.agent<agent>.model.speed`: `GET /v1/sessions`, `GET /v1/sessions/{session_id}`, `POST /v1/sessions`, `POST /v1/sessions/{session_id}`, `POST /v1/sessions/{session_id}/archive`
- `answer<session>.agent<agent>.multiagent` other than `null`: `GET /v1/sessions`, `GET /v1/sessions/{session_id}`, `POST /v1/sessions`, `POST /v1/sessions/{session_id}`, `POST /v1/sessions/{session_id}/archive`
- `answer<session>.agent<agent>.skills[]` member `anthropic`: `GET /v1/sessions`, `GET /v1/sessions/{session_id}`, `POST /v1/sessions`, `POST /v1/sessions/{session_id}`, `POST /v1/sessions/{session_id}/archive`
- `answer<session>.agent<agent>.tools[]` members `agent_toolset_20260401`, `custom`: `GET /v1/sessions`, `GET /v1/sessions/{session_id}`, `POST /v1/sessions`, `POST /v1/sessions/{session_id}`, `POST /v1/sessions/{session_id}/archive`
- `answer<session>.agent<agent>.tools[]<mcp_toolset>.configs[].permission_policy` member `auto`: `GET /v1/sessions`, `GET /v1/sessions/{session_id}`, `POST /v1/sessions`, `POST /v1/sessions/{session_id}`, `POST /v1/sessions/{session_id}/archive`
- `answer<session>.agent<agent>.tools[]<mcp_toolset>.default_config.permission_policy` member `auto`: `GET /v1/sessions`, `GET /v1/sessions/{session_id}`, `POST /v1/sessions`, `POST /v1/sessions/{session_id}`, `POST /v1/sessions/{session_id}/archive`
- `answer<session>.budget` other than `null`: `GET /v1/sessions`, `GET /v1/sessions/{session_id}`, `POST /v1/sessions`, `POST /v1/sessions/{session_id}`, `POST /v1/sessions/{session_id}/archive`
- `answer<session>.deployment_id` other than `null`: `GET /v1/sessions`, `GET /v1/sessions/{session_id}`, `POST /v1/sessions`, `POST /v1/sessions/{session_id}`, `POST /v1/sessions/{session_id}/archive`
- `answer<session>.usage.active_seconds`: `GET /v1/sessions`, `GET /v1/sessions/{session_id}`, `POST /v1/sessions`, `POST /v1/sessions/{session_id}`, `POST /v1/sessions/{session_id}/archive`
- `answer<session>.usage.list_cost`: `GET /v1/sessions`, `GET /v1/sessions/{session_id}`, `POST /v1/sessions`, `POST /v1/sessions/{session_id}`, `POST /v1/sessions/{session_id}/archive`
- `answer<session_thread>.agent` members `advisor`, `inline`: `GET /v1/sessions/{session_id}/threads`, `GET /v1/sessions/{session_id}/threads/{thread_id}`, `POST /v1/sessions/{session_id}/threads/{thread_id}/archive`
- `answer<session_thread>.agent<agent>.model.effort`: `GET /v1/sessions/{session_id}/threads`, `GET /v1/sessions/{session_id}/threads/{thread_id}`, `POST /v1/sessions/{session_id}/threads/{thread_id}/archive`
- `answer<session_thread>.agent<agent>.model.id` values `claude-fable-5`, `claude-fable-5-1`, `claude-haiku-4-5`, `claude-haiku-4-5-20251001`, `claude-haiku-5-5`, `claude-opus-4-5`, `claude-opus-4-5-20251101`, `claude-opus-4-6`, `claude-opus-4-7`, `claude-opus-4-8`, `claude-opus-5`, `claude-opus-5-5`, `claude-sonnet-4-5`, `claude-sonnet-4-5-20250929`, `claude-sonnet-4-6`, `claude-sonnet-5`, `claude-sonnet-5-5`: `GET /v1/sessions/{session_id}/threads`, `GET /v1/sessions/{session_id}/threads/{thread_id}`, `POST /v1/sessions/{session_id}/threads/{thread_id}/archive`
- `answer<session_thread>.agent<agent>.model.inference_geo`: `GET /v1/sessions/{session_id}/threads`, `GET /v1/sessions/{session_id}/threads/{thread_id}`, `POST /v1/sessions/{session_id}/threads/{thread_id}/archive`
- `answer<session_thread>.agent<agent>.model.speed`: `GET /v1/sessions/{session_id}/threads`, `GET /v1/sessions/{session_id}/threads/{thread_id}`, `POST /v1/sessions/{session_id}/threads/{thread_id}/archive`
- `answer<session_thread>.agent<agent>.skills[]` member `anthropic`: `GET /v1/sessions/{session_id}/threads`, `GET /v1/sessions/{session_id}/threads/{thread_id}`, `POST /v1/sessions/{session_id}/threads/{thread_id}/archive`
- `answer<session_thread>.agent<agent>.tools[]` members `agent_toolset_20260401`, `custom`: `GET /v1/sessions/{session_id}/threads`, `GET /v1/sessions/{session_id}/threads/{thread_id}`, `POST /v1/sessions/{session_id}/threads/{thread_id}/archive`
- `answer<session_thread>.agent<agent>.tools[]<mcp_toolset>.configs[].permission_policy` member `auto`: `GET /v1/sessions/{session_id}/threads`, `GET /v1/sessions/{session_id}/threads/{thread_id}`, `POST /v1/sessions/{session_id}/threads/{thread_id}/archive`
- `answer<session_thread>.agent<agent>.tools[]<mcp_toolset>.default_config.permission_policy` member `auto`: `GET /v1/sessions/{session_id}/threads`, `GET /v1/sessions/{session_id}/threads/{thread_id}`, `POST /v1/sessions/{session_id}/threads/{thread_id}/archive`
- `answer<session_thread>.stats` other than `null`: `GET /v1/sessions/{session_id}/threads`, `GET /v1/sessions/{session_id}/threads/{thread_id}`, `POST /v1/sessions/{session_id}/threads/{thread_id}/archive`
- `answer<session_thread>.usage.active_seconds`: `GET /v1/sessions/{session_id}/threads`, `GET /v1/sessions/{session_id}/threads/{thread_id}`, `POST /v1/sessions/{session_id}/threads/{thread_id}/archive`
- `answer<session_thread>.usage.list_cost`: `GET /v1/sessions/{session_id}/threads`, `GET /v1/sessions/{session_id}/threads/{thread_id}`, `POST /v1/sessions/{session_id}/threads/{thread_id}/archive`
- `answer<session_thread>.usage.server_tool_use`: `GET /v1/sessions/{session_id}/threads`, `GET /v1/sessions/{session_id}/threads/{thread_id}`, `POST /v1/sessions/{session_id}/threads/{thread_id}/archive`
- `answer<session_thread>.workflow_run_id` other than `null`: `GET /v1/sessions/{session_id}/threads`, `GET /v1/sessions/{session_id}/threads/{thread_id}`, `POST /v1/sessions/{session_id}/threads/{thread_id}/archive`
- `answer<skill>.source` members `anthropic`, `anthropic_example`, `plugin`: `GET /v1/skills`, `GET /v1/skills/{skill_id}`, `POST /v1/skills`
- `answer<span.model_request_end>.model_usage.speed` other than `null`: `GET /v1/sessions/{session_id}/events`, `GET /v1/sessions/{session_id}/events/stream`, `GET /v1/sessions/{session_id}/threads/{thread_id}/events`, `GET /v1/sessions/{session_id}/threads/{thread_id}/stream`
- `answer<user.interrupt>.session_thread_id`: `GET /v1/sessions/{session_id}/events`, `GET /v1/sessions/{session_id}/events/stream`, `GET /v1/sessions/{session_id}/threads/{thread_id}/events`, `GET /v1/sessions/{session_id}/threads/{thread_id}/stream`, `POST /v1/sessions/{session_id}/events`
- `answer<user.message>.content[]` member `redacted`: `GET /v1/sessions/{session_id}/events`, `GET /v1/sessions/{session_id}/events/stream`, `GET /v1/sessions/{session_id}/threads/{thread_id}/events`, `GET /v1/sessions/{session_id}/threads/{thread_id}/stream`, `POST /v1/sessions/{session_id}/events`
- `answer<user.message>.content[]<document>.context`: `GET /v1/sessions/{session_id}/events`, `GET /v1/sessions/{session_id}/events/stream`, `GET /v1/sessions/{session_id}/threads/{thread_id}/events`, `GET /v1/sessions/{session_id}/threads/{thread_id}/stream`, `POST /v1/sessions/{session_id}/events`
- `answer<user.message>.content[]<document>.source` members `base64`, `text`, `url`: `GET /v1/sessions/{session_id}/events`, `GET /v1/sessions/{session_id}/events/stream`, `GET /v1/sessions/{session_id}/threads/{thread_id}/events`, `GET /v1/sessions/{session_id}/threads/{thread_id}/stream`, `POST /v1/sessions/{session_id}/events`
- `answer<user.message>.content[]<document>.title`: `GET /v1/sessions/{session_id}/events`, `GET /v1/sessions/{session_id}/events/stream`, `GET /v1/sessions/{session_id}/threads/{thread_id}/events`, `GET /v1/sessions/{session_id}/threads/{thread_id}/stream`, `POST /v1/sessions/{session_id}/events`
- `answer<user.message>.content[]<image>.source` members `base64`, `url`: `GET /v1/sessions/{session_id}/events`, `GET /v1/sessions/{session_id}/events/stream`, `GET /v1/sessions/{session_id}/threads/{thread_id}/events`, `GET /v1/sessions/{session_id}/threads/{thread_id}/stream`, `POST /v1/sessions/{session_id}/events`
- `answer<user.tool_confirmation>.session_thread_id`: `GET /v1/sessions/{session_id}/events`, `GET /v1/sessions/{session_id}/events/stream`, `GET /v1/sessions/{session_id}/threads/{thread_id}/events`, `GET /v1/sessions/{session_id}/threads/{thread_id}/stream`, `POST /v1/sessions/{session_id}/events`
- `answer<vault_credential>.auth` member `environment_variable`: `GET /v1/vaults/{vault_id}/credentials`, `GET /v1/vaults/{vault_id}/credentials/{credential_id}`, `POST /v1/vaults/{vault_id}/credentials`, `POST /v1/vaults/{vault_id}/credentials/{credential_id}`, `POST /v1/vaults/{vault_id}/credentials/{credential_id}/archive`

<!-- generated by scripts/compatibility-list.cjs: end -->

## 5. Authentication And Upstream Sync

Tetral public API calls use `TETRAL_API_KEY`, the `apiKey` client option, `X-Api-Key`, and Tetral `baseURL`. Anthropic provider API keys do not authenticate Tetral public APIs.

Every client class, including `BaseAnthropic` and its subclasses, skips upstream default credential discovery. Without an explicit `profile` or `config` option, no client reads `ANTHROPIC_PROFILE`, config-directory profiles or `ANTHROPIC_*` federation variables, and no profile `base_url` is adopted.

API key management is a Tetral auth-service extension:

```text
POST   /v1/api_keys
GET    /v1/api_keys
DELETE /v1/api_keys/{api_key_id}
```

Create returns the raw API key once. List and retrieve-style responses expose only public-safe metadata. Delete revokes the key.

Provider credentials belong in Vault and are selected by Sessions through `providers`; the SDK does not mint, recover, derive, or persist raw public API keys.

Upstream sync runs as small rolling merges — on each upstream release or biweekly, whichever comes first:

1. Merge the upstream SDK changes.
2. Run full CI.
3. Classify every new surface as retained unsupported by default until Tetral explicitly supports it.
4. Update the SDK's copy of Engine's OpenAPI file and regenerate the list in §4, as [CONTRIBUTING.md](CONTRIBUTING.md) describes.
