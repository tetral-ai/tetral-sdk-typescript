import Anthropic from '../src/index';

import { compatCases } from '../tests/compatibility/compat-registry';
import {
  assertLiveEngineReachable,
  readLiveCompatibilityEnvironment,
} from '../tests/compatibility/live-launch';
import { executeCompatibilityProofs } from '../tests/compatibility/proof-execution';

async function main(): Promise<void> {
  const liveEnvironment = readLiveCompatibilityEnvironment();
  await assertLiveEngineReachable(liveEnvironment);
  const client = new Anthropic({
    apiKey: liveEnvironment.apiKey,
    baseURL: liveEnvironment.baseURL,
    maxRetries: 0,
  });
  const liveCases = compatCases.filter((compatibilityCase) => compatibilityCase.locator.suite === 'live');
  const report = await executeCompatibilityProofs('live', liveCases, {
    kind: 'live',
    client,
    apiKey: liveEnvironment.apiKey,
    baseURL: liveEnvironment.baseURL,
  });
  console.log(
    `Executed ${report.executed} live/rejection compatibility handlers: ${report.passed} passed, ${report.failed} failed`,
  );
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
