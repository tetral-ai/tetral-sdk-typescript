import { compatibilityProofHandlers, proofScenarioRunners } from './proof-registration';
import type { CompatibilityCase, CompatibilitySuite } from './compat-registry';
import type { CompatibilityProofExecution, ProofEvidence, ProofScenarioContext } from './proof-types';

class CachedProofExecution implements CompatibilityProofExecution {
  private readonly cache = new Map<string, Promise<ProofEvidence>>();

  constructor(
    private readonly suite: CompatibilitySuite,
    private readonly context: ProofScenarioContext,
  ) {}

  evidence(scenario: string): Promise<ProofEvidence> {
    const existing = this.cache.get(scenario);
    if (existing) return existing;
    const runner = proofScenarioRunners[scenario];
    if (!runner) throw new Error(`No executable compatibility scenario runner for ${scenario}`);
    const pending = runner(this.context);
    this.cache.set(scenario, pending);
    return pending;
  }

  assertSuite(compatibilityCase: CompatibilityCase): void {
    if (compatibilityCase.locator.suite !== this.suite) {
      throw new Error(
        `${compatibilityCase.id} belongs to ${compatibilityCase.locator.suite}, not ${this.suite}`,
      );
    }
  }
}

export async function executeCompatibilityProofs(
  suite: CompatibilitySuite,
  cases: readonly CompatibilityCase[],
  context: ProofScenarioContext,
): Promise<{ executed: number; passed: number; failed: number }> {
  const execution = new CachedProofExecution(suite, context);
  const failures: string[] = [];
  let passed = 0;
  for (const compatibilityCase of cases) {
    try {
      execution.assertSuite(compatibilityCase);
      const handler = compatibilityProofHandlers[compatibilityCase.locator.handler];
      if (!handler) throw new Error(`No compatibility proof handler for ${compatibilityCase.id}`);
      await handler(execution);
      passed++;
    } catch (error) {
      failures.push(`${compatibilityCase.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const report = { executed: cases.length, passed, failed: failures.length };
  if (failures.length > 0) {
    throw new Error(
      `Compatibility ${suite} proofs executed ${report.executed}: ${report.passed} passed, ${
        report.failed
      } failed\n${failures.join('\n')}`,
    );
  }
  return report;
}
