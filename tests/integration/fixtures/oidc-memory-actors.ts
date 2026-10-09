// Test-only bridge for Engine's native OIDC composition. Import source directly:
// a clean checkout needs no dist, and the awaited responses retain SDK types.
import type Anthropic from '../../../src/index';
import type {
  BetaManagedAgentsActor,
  MemoryVersionRetrieveParams,
  MemoryVersionRedactParams,
} from '../../../src/resources/beta/memory-stores/memory-versions';

function actorIdentity(actor: BetaManagedAgentsActor): string {
  switch (actor.type) {
    case 'service_actor':
      return actor.service_id;
    case 'user_actor':
      return actor.user_id;
    case 'api_actor':
      return actor.api_key_id;
    case 'session_actor':
      return actor.session_id;
  }
}

function assertActor(actual: BetaManagedAgentsActor | null, expected: BetaManagedAgentsActor | null): void {
  if (actual === null && expected === null) return;
  if (
    actual === null ||
    expected === null ||
    actual.type !== expected.type ||
    actorIdentity(actual) !== actorIdentity(expected)
  ) {
    // Keep identities and credentials out of the child process's diagnostic output.
    throw new Error('Received Memory attribution does not match the fixture identity');
  }
}

export async function retrieveAttributedMemoryVersion(
  client: Anthropic,
  versionId: string,
  params: MemoryVersionRetrieveParams,
  expectedCreatedBy: BetaManagedAgentsActor,
  expectedRedactedBy: BetaManagedAgentsActor | null = null,
) {
  const version = await client.beta.memoryStores.memoryVersions.retrieve(versionId, params);
  assertActor(version.created_by, expectedCreatedBy);
  assertActor(version.redacted_by, expectedRedactedBy);
  return version;
}

export async function redactAttributedMemoryVersion(
  client: Anthropic,
  versionId: string,
  params: MemoryVersionRedactParams,
  expectedCreatedBy: BetaManagedAgentsActor,
  expectedRedactedBy: BetaManagedAgentsActor,
) {
  const version = await client.beta.memoryStores.memoryVersions.redact(versionId, params);
  assertActor(version.created_by, expectedCreatedBy);
  assertActor(version.redacted_by, expectedRedactedBy);
  return version;
}
