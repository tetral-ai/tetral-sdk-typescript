import { compatCases } from '../tests/compatibility/compat-registry';
import { executeCompatibilityProofs } from '../tests/compatibility/proof-execution';

async function main(): Promise<void> {
  const engineRoot = process.env['TETRAL_ENGINE_ROOT'];
  const engineRevision = process.env['TETRAL_ENGINE_REVISION'];
  if (!engineRoot || !engineRevision || !/^[a-f0-9]{40}$/.test(engineRevision)) {
    throw new Error('Integration compatibility requires TETRAL_ENGINE_ROOT and full TETRAL_ENGINE_REVISION');
  }
  const cases = compatCases.filter((compatibilityCase) => compatibilityCase.locator.suite === 'integration');
  const report = await executeCompatibilityProofs('integration', cases, {
    kind: 'integration',
    engineRoot,
    engineRevision,
    sdkRoot: process.cwd(),
  });
  console.log(
    `Executed ${report.executed} integration compatibility handlers: ${report.passed} passed, ${report.failed} failed`,
  );
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
