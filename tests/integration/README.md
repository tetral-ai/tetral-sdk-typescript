# Tetral Integration Suite

The suite in `tetral.integration.test.ts` is compiled in CI and runs only when
`TETRAL_COMPAT_LIVE=1`. The live compatibility launcher requires `TETRAL_BASE_URL`
and `TETRAL_API_KEY` and checks Engine reachability before starting it. A live
Engine run is outside normal SDK CI.

## Observed Session preview proofs

The EVOUT-35/36 compatibility rows use a separate integration command:

```sh
TETRAL_ENGINE_ROOT=/path/to/tetral \
TETRAL_ENGINE_REVISION=<full-clean-Engine-commit> \
yarn test:compatibility:integration
```

Run from a clean SDK checkout after frozen Yarn installation; no SDK build is
required. The Engine checkout must be clean and match the full requested revision.
The caller must supply an active dependency environment: an administrative
PostgreSQL test URL with private database/role creation, a reachable isolated MinIO
store, the native NATS fixture configuration, both frozen-installed Engine Bun
workspaces, and Go and Bun on PATH. Use the selected Engine revision's test
infrastructure contracts for the required environment variables and fixture
configuration. This command does not provision dependencies and fails when they
are missing. A completed Engine test-runner profile tears down its owned
dependencies; it does not leave an environment for this standalone command.

The command runs the actual Engine
`TestPostgreSQLPublicStreamingIdentity/session-options-primary-thread-and-private-content`
composition with `go test -json -count=1 -race`, setting
`TETRAL_ENGINE_SDK_ROOT` to this SDK checkout. It checks executed root/subtest and
package passes, rejects skips/failures, and reconciles observed named assertions
for Session repeated query keys, default Session and primary Thread formal-only
delivery, typed preview wrappers and contiguous prefixes, original final
identity/content/End order, and private thinking/tool content. The composition
uses real PostgreSQL, NATS, HTTP, Runtime, Gateway and Bridge with a controlled
provider stream and the actual SDK parser. Source revisions are checked before
and after execution, and the child Go JSONL is retained on stdout. Go workspace
and flag overrides are disabled for this execution.

SDK CI contract tests use fixture responses to verify request construction,
parsing, helper reconciliation and type boundaries. They do not establish Engine
production eligibility or broker behavior. `test:compatibility:static` remains
infrastructure-free and checks the other source contracts; it no longer treats
Runtime writer absence as proof that previews are unsupported. The generic live
resource suite above does not supply the streaming topology. Engine's owning
streaming compositions separately cover recovery/error/interrupt Ends, child
visibility, loss and backpressure against the identified SDK revision.

## Route Family Mapping

| Route family                             | Test file                    | Asserted response types                                                                                                        | Assertion functions                                                                                                                                                                                                                                     |
| ---------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vaults                                   | `tetral.integration.test.ts` | `BetaManagedAgentsVault`                                                                                                       | `assertVault` checks `id`, `archived_at`, `created_at`, `display_name`, `metadata`, `type`, `updated_at`                                                                                                                                                |
| Vault credentials                        | `tetral.integration.test.ts` | `BetaManagedAgentsCredential`                                                                                                  | `assertCredential` checks `id`, `archived_at`, `auth`, `created_at`, `metadata`, `type`, `updated_at`, `vault_id`                                                                                                                                       |
| Agents and versions.list                 | `tetral.integration.test.ts` | `BetaManagedAgentsAgent`                                                                                                       | `assertAgent` checks `id`, `archived_at`, `created_at`, `description`, `mcp_servers`, `approval_mode`, `metadata`, `model`, `multiagent`, `name`, `skills`, `system`, `tools`, `type`, `updated_at`, `version`                                          |
| Sessions lifecycle                       | `tetral.integration.test.ts` | `BetaManagedAgentsSession`, `BetaManagedAgentsDeletedSession`                                                                  | `assertSession` checks `id`, `agent`, `archived_at`, `created_at`, `environment_id`, `metadata`, `outcome_evaluations`, `resources`, `stats`, `status`, `title`, `type`, `updated_at`, `usage`, `vault_ids`; `assertDeletedSession` checks `id`, `type` |
| Session events                           | `tetral.integration.test.ts` | `BetaManagedAgentsSendSessionEvents`, `BetaManagedAgentsSessionEvent`                                                          | `assertSendSessionEvents`, `assertSessionEvent`                                                                                                                                                                                                         |
| Session threads and thread events        | `tetral.integration.test.ts` | `BetaManagedAgentsSessionThread`, `BetaManagedAgentsSessionEvent`                                                              | `assertThread`, `assertSessionEvent`                                                                                                                                                                                                                    |
| Session resources                        | `tetral.integration.test.ts` | `BetaManagedAgentsFileResource`, `BetaManagedAgentsSessionResource`, `BetaManagedAgentsDeleteSessionResource`                  | `assertFileResource`, `assertSessionResource`, `assertDeletedSessionResource`                                                                                                                                                                           |
| Files                                    | `tetral.integration.test.ts` | `FileMetadata`                                                                                                                 | `assertFile` checks `id`, `created_at`, `filename`, `mime_type`, `size_bytes`, `type`                                                                                                                                                                   |
| Skills and versions                      | `tetral.integration.test.ts` | `SkillCreateResponse`, `VersionCreateResponse`                                                                                 | `assertSkill`, `assertSkillVersion`                                                                                                                                                                                                                     |
| Memory stores, memories, memory versions | `tetral.integration.test.ts` | `BetaManagedAgentsMemoryStore`, `BetaManagedAgentsMemory`, `BetaManagedAgentsMemoryListItem`, `BetaManagedAgentsMemoryVersion` | `assertMemoryStore`, `assertMemory`, `assertMemoryListItem`, `assertMemoryVersion`                                                                                                                                                                      |
| Environments                             | `tetral.integration.test.ts` | `BetaEnvironment`, `BetaEnvironmentDeleteResponse`                                                                             | `assertEnvironment`, `assertDeletedEnvironment` checks `id`, `type`                                                                                                                                                                                     |

## Must-Reject Mapping

Every reject case targets a real parent resource created in the test (a live session and vault), so the asserted `400 invalid_request_error` cannot be masked by the `404 not_found_error` that missing resources return.

| Reject case                                                         | Expected HTTP status | Expected `error.type`   |
| ------------------------------------------------------------------- | -------------------- | ----------------------- |
| `user.custom_tool_result`                                           | 400                  | `invalid_request_error` |
| `user.tool_result`                                                  | 400                  | `invalid_request_error` |
| `user.define_outcome`                                               | 400                  | `invalid_request_error` |
| `system.message`                                                    | 400                  | `invalid_request_error` |
| `environment_variable` credential create                            | 400                  | `invalid_request_error` |
| `vault_ids` on session update                                       | 400                  | `invalid_request_error` |
| Provider selector naming a provider that mismatches the agent model | 400                  | `invalid_request_error` |
| `agent_toolset_20260401` toolset                                    | 400                  | `invalid_request_error` |
| Agent `custom` tool shape                                           | 400                  | `invalid_request_error` |
| Non-null `multiagent`                                               | 400                  | `invalid_request_error` |

## Seam-Risk Checklist

- Status enums
- `error.type` values
- Pagination cursors
- Timestamp formats
- `usage.server_tool_use`
- Field-name spelling
