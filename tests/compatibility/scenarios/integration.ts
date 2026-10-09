import { execFile } from 'node:child_process';
import fs from 'node:fs';
import { promisify } from 'node:util';

import type { ProofEvidence, ProofScenarioContext } from '../proof-types';

const execute = promisify(execFile);
export const previewPackage = 'github.com/tetral-ai/tetral/integration';
export const previewRoot = 'TestPostgreSQLPublicStreamingIdentity';
export const previewTest = `${previewRoot}/session-options-primary-thread-and-private-content`;
export const previewAssertions = [
  'actual-sdk-session-query-options-thread-formal-only',
  'exact-sdk-preview-wrappers-and-per-event-prefix',
  'formal-original-identities-content-end-order',
  'durable-private-reasoning-and-metadata-no-preview-leak',
  'Gateway-allocation-Runtime-submission-Bridge-receipt-SQL-SDK-identities-match',
] as const;

/** Reconcile executed Go JSONL, never test source or a successful process exit alone. */
export function assertObservedPreviewProof(jsonl: string): void {
  const runs = new Set<string>();
  const passes = new Set<string>();
  const assertions = new Set<string>();
  let packagePassed = false;
  for (const line of jsonl.split('\n').filter((line) => line.trim())) {
    const item: unknown = JSON.parse(line);
    if (!item || typeof item !== 'object') throw new Error('Invalid Engine Go JSONL event');
    const event = item as Record<string, unknown>;
    if (event['Package'] !== previewPackage) throw new Error('Unexpected Engine proof package');
    if (event['Action'] === 'fail' || event['Action'] === 'skip') {
      throw new Error('Engine preview proof failed or skipped');
    }
    const test = event['Test'];
    if (typeof test === 'string') {
      if (event['Action'] === 'run') runs.add(test);
      if (event['Action'] === 'pass') passes.add(test);
      if (test === previewTest && event['Action'] === 'output' && typeof event['Output'] === 'string') {
        const match = /public_streaming_sdk_assertion=([^\s]+) passed=true(?:\s|$)/.exec(event['Output']);
        if (match) assertions.add(match[1]!);
      }
    } else if (event['Action'] === 'pass') {
      packagePassed = true;
    }
  }
  if (!packagePassed || ![previewRoot, previewTest].every((test) => runs.has(test) && passes.has(test))) {
    throw new Error('Engine preview root, required subtest and package must execute and pass');
  }
  for (const assertion of previewAssertions) {
    if (!assertions.has(assertion))
      throw new Error(`Missing observed Engine preview assertion: ${assertion}`);
  }
}

async function cleanRevision(root: string): Promise<string> {
  const { stdout: status } = await execute('git', ['status', '--porcelain', '--untracked-files=normal'], {
    cwd: root,
  });
  if (status.trim()) throw new Error('Integration compatibility proof requires clean source checkouts');
  const { stdout } = await execute('git', ['rev-parse', 'HEAD'], { cwd: root });
  return stdout.trim();
}

export const oidcRoot = 'TestOIDCKeycloakSDK';
export const oidcAssertions = [
  'human_session_memory_cached_token_one401_one_exchange_one_effect',
  'service_session_memory_cached_token_one401_one_exchange_one_effect',
  'human_typed_created_by_redacted_by_stable_identity',
  'service_typed_created_by_redacted_by_stable_identity',
] as const;

/** Require both actual identity flows and typed received attribution, not raw JSON alone. */
export function assertObservedOIDCProof(jsonl: string): void {
  const runs = new Set<string>();
  const passes = new Set<string>();
  const assertions = new Set<string>();
  let packagePassed = false;
  for (const line of jsonl.split('\n').filter((line) => line.trim())) {
    const item: unknown = JSON.parse(line);
    if (!item || typeof item !== 'object') throw new Error('Invalid Engine Go JSONL event');
    const event = item as Record<string, unknown>;
    if (event['Package'] !== previewPackage) throw new Error('Unexpected Engine proof package');
    if (event['Action'] === 'fail' || event['Action'] === 'skip') {
      throw new Error('Engine OIDC proof failed or skipped');
    }
    const test = event['Test'];
    if (typeof test === 'string') {
      if (event['Action'] === 'run') runs.add(test);
      if (event['Action'] === 'pass') passes.add(test);
      if (event['Action'] === 'output' && typeof event['Output'] === 'string') {
        const match = /oidc_sdk_assertion=([^\s]+) passed=true(?:\s|$)/.exec(event['Output']);
        if (match && test === `${oidcRoot}/${match[1]!.split('_')[0]}`) assertions.add(match[1]!);
      }
    } else if (event['Action'] === 'pass') {
      packagePassed = true;
    }
  }
  const tests = [oidcRoot, `${oidcRoot}/human`, `${oidcRoot}/service`];
  if (!packagePassed || !tests.every((test) => runs.has(test) && passes.has(test))) {
    throw new Error('Engine OIDC root, both identity subtests and package must execute and pass');
  }
  for (const assertion of oidcAssertions) {
    if (!assertions.has(assertion)) throw new Error(`Missing observed Engine OIDC assertion: ${assertion}`);
  }
}

async function runEngineIntegration(
  context: ProofScenarioContext,
  scenario: 'integration-preview' | 'integration-oidc',
  rootTest: string,
  testFilter: string,
  assertions: readonly string[],
  assertObserved: (jsonl: string) => void,
): Promise<void> {
  if (context.kind !== 'integration')
    throw new Error('Integration proof requires prepared Engine dependencies');
  const engineRoot = fs.realpathSync(context.engineRoot);
  const sdkRoot = fs.realpathSync(context.sdkRoot);
  const engineRevision = await cleanRevision(engineRoot);
  const sdkRevision = await cleanRevision(sdkRoot);
  if (engineRevision !== context.engineRevision)
    throw new Error('Engine source does not match requested revision');
  const binding = { engineRevision, sdkRevision };
  console.log(JSON.stringify({ compatibility_integration_source: binding, scenario, test: rootTest }));
  let stdout: string;
  try {
    const result = await execute(
      'go',
      ['test', '-json', '-count=1', '-race', './integration', '-run', testFilter, '-timeout', '10m'],
      {
        cwd: engineRoot,
        env: { ...process.env, GOFLAGS: '', GOWORK: 'off', TETRAL_ENGINE_SDK_ROOT: sdkRoot },
        timeout: 11 * 60 * 1000,
        maxBuffer: 16 * 1024 * 1024,
      },
    );
    stdout = result.stdout;
    process.stdout.write(stdout);
    process.stderr.write(result.stderr);
  } catch (error) {
    // Retain the original child report for diagnosis even on nonzero exit.
    const child = error as { stdout?: string; stderr?: string };
    if (child.stdout) process.stdout.write(child.stdout);
    if (child.stderr) process.stderr.write(child.stderr);
    throw new Error('Actual Engine composition did not complete successfully');
  }
  if (
    (await cleanRevision(engineRoot)) !== engineRevision ||
    (await cleanRevision(sdkRoot)) !== sdkRevision
  ) {
    throw new Error('Source binding changed during Engine proof');
  }
  assertObserved(stdout);
  console.log(
    JSON.stringify({
      compatibility_integration_pass: binding,
      scenario,
      test: rootTest,
      assertions,
    }),
  );
}

async function runPreviewIntegration(context: ProofScenarioContext): Promise<ProofEvidence> {
  await runEngineIntegration(
    context,
    'integration-preview',
    previewTest,
    `^${previewRoot}$/^session-options-primary-thread-and-private-content$`,
    previewAssertions,
    assertObservedPreviewProof,
  );
  return { 'T-COMPAT-EVOUT-35': true, 'T-COMPAT-EVOUT-36': true };
}

async function runOIDCIntegration(context: ProofScenarioContext): Promise<ProofEvidence> {
  await runEngineIntegration(
    context,
    'integration-oidc',
    oidcRoot,
    `^${oidcRoot}$`,
    oidcAssertions,
    assertObservedOIDCProof,
  );
  return { 'T-COMPAT-CONN-20': true, 'T-COMPAT-MEM-24': true };
}

export const integrationScenarioRunners = {
  // The registry separates actual production observations from source contracts.
  'integration-preview': runPreviewIntegration,
  'integration-oidc': runOIDCIntegration,
};
