# Tetral Integration Suite

The suite in `tetral.integration.test.ts` is compiled in CI and self-skips unless both `TETRAL_BASE_URL` and `TETRAL_API_KEY` are set. A live engine run is intentionally outside normal CI.

## Route Family Mapping

| Route family                             | Test file                    | Asserted response types                                                                                                        | Assertion functions                                                                                                                                                                                            |
| ---------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vaults                                   | `tetral.integration.test.ts` | `BetaManagedAgentsVault`                                                                                                       | `assertVault` checks `id`, `archived_at`, `created_at`, `display_name`, `metadata`, `type`, `updated_at`                                                                                                       |
| Vault credentials                        | `tetral.integration.test.ts` | `BetaManagedAgentsCredential`                                                                                                  | `assertCredential` checks `id`, `archived_at`, `auth`, `created_at`, `metadata`, `type`, `updated_at`, `vault_id`                                                                                              |
| Agents and versions.list                 | `tetral.integration.test.ts` | `BetaManagedAgentsAgent`                                                                                                       | `assertAgent` checks `id`, `archived_at`, `created_at`, `description`, `mcp_servers`, `approval_mode`, `metadata`, `model`, `multiagent`, `name`, `skills`, `system`, `tools`, `type`, `updated_at`, `version` |
| Sessions lifecycle                       | `tetral.integration.test.ts` | `BetaManagedAgentsSession`                                                                                                     | `assertSession` checks `id`, `agent`, `archived_at`, `created_at`, `environment_id`, `metadata`, `outcome_evaluations`, `resources`, `stats`, `status`, `title`, `type`, `updated_at`, `usage`, `vault_ids`    |
| Session events                           | `tetral.integration.test.ts` | `BetaManagedAgentsSendSessionEvents`, `BetaManagedAgentsSessionEvent`                                                          | `assertSendSessionEvents`, `assertSessionEvent`                                                                                                                                                                |
| Session threads and thread events        | `tetral.integration.test.ts` | `BetaManagedAgentsSessionThread`, `BetaManagedAgentsSessionEvent`                                                              | `assertThread`, `assertSessionEvent`                                                                                                                                                                           |
| Session resources                        | `tetral.integration.test.ts` | `BetaManagedAgentsFileResource`, `BetaManagedAgentsSessionResource`, `BetaManagedAgentsDeleteSessionResource`                  | `assertFileResource`, `assertSessionResource`, `assertDeletedSessionResource`                                                                                                                                  |
| Files                                    | `tetral.integration.test.ts` | `FileMetadata`                                                                                                                 | `assertFile` checks `id`, `created_at`, `filename`, `mime_type`, `size_bytes`, `type`                                                                                                                          |
| Skills and versions                      | `tetral.integration.test.ts` | `SkillCreateResponse`, `VersionCreateResponse`                                                                                 | `assertSkill`, `assertSkillVersion`                                                                                                                                                                            |
| Memory stores, memories, memory versions | `tetral.integration.test.ts` | `BetaManagedAgentsMemoryStore`, `BetaManagedAgentsMemory`, `BetaManagedAgentsMemoryListItem`, `BetaManagedAgentsMemoryVersion` | `assertMemoryStore`, `assertMemory`, `assertMemoryListItem`, `assertMemoryVersion`                                                                                                                             |
| Environments                             | `tetral.integration.test.ts` | `BetaEnvironment`                                                                                                              | `assertEnvironment`                                                                                                                                                                                            |

## Must-Reject Mapping

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
