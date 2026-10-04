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

async function runPreviewIntegration(context: ProofScenarioContext): Promise<ProofEvidence> {
  if (context.kind !== 'integration') throw new Error('Preview proof requires prepared Engine dependencies');
  const engineRoot = fs.realpathSync(context.engineRoot);
  const sdkRoot = fs.realpathSync(context.sdkRoot);
  const engineRevision = await cleanRevision(engineRoot);
  const sdkRevision = await cleanRevision(sdkRoot);
  if (engineRevision !== context.engineRevision)
    throw new Error('Engine source does not match requested revision');
  const binding = { engineRevision, sdkRevision };
  console.log(JSON.stringify({ compatibility_integration_source: binding }));
  let stdout: string;
  try {
    const result = await execute(
      'go',
      [
        'test',
        '-json',
        '-count=1',
        '-race',
        './integration',
        '-run',
        `^${previewRoot}$/^session-options-primary-thread-and-private-content$`,
        '-timeout',
        '10m',
      ],
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
    throw new Error('Actual Engine preview composition did not complete successfully');
  }
  if (
    (await cleanRevision(engineRoot)) !== engineRevision ||
    (await cleanRevision(sdkRoot)) !== sdkRevision
  ) {
    throw new Error('Source binding changed during Engine preview proof');
  }
  assertObservedPreviewProof(stdout);
  console.log(
    JSON.stringify({
      compatibility_integration_pass: binding,
      test: previewTest,
      assertions: previewAssertions,
    }),
  );
  return {
    'T-COMPAT-EVOUT-35': true,
    'T-COMPAT-EVOUT-36': true,
  };
}

export const integrationScenarioRunners = {
  // The registry separates actual production observations from source contracts.
  'integration-preview': runPreviewIntegration,
};
