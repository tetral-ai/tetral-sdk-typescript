import fs from 'node:fs';
import path from 'node:path';

import { compatCases } from '../tests/compatibility/compat-registry';
import { executeCompatibilityProofs } from '../tests/compatibility/proof-execution';

function findEngineRoot(sdkRoot: string): string {
  const configured = process.env['TETRAL_ENGINE_ROOT'];
  const candidates =
    configured ?
      [configured]
    : [path.resolve(sdkRoot, '../tetral/engine'), path.resolve(sdkRoot, '../engine')];
  const engineRoot = candidates.find((candidate) => fs.existsSync(path.join(candidate, 'go.mod')));
  if (!engineRoot) {
    throw new Error('Static compatibility proofs require TETRAL_ENGINE_ROOT pointing to the Engine checkout');
  }
  return engineRoot;
}

async function main(): Promise<void> {
  const sdkRoot = process.cwd();
  const engineRoot = findEngineRoot(sdkRoot);
  const staticCases = compatCases.filter((compatibilityCase) => compatibilityCase.locator.suite === 'static');
  const report = await executeCompatibilityProofs('static', staticCases, {
    kind: 'static',
    engineRoot,
    sdkRoot,
  });
  console.log(
    `Executed ${report.executed} static/not-produced compatibility handlers: ${report.passed} passed, ${report.failed} failed`,
  );
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
