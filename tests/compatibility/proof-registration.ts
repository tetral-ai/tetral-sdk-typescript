import manifest from './proof-suites.json';

import { compatCases, type CompatibilitySuite } from './compat-registry';
import { liveScenarioRunners } from './scenarios/live';
import { staticScenarioRunners } from './scenarios/static';
import type {
  CompatibilityProofExecution,
  CompatibilityProofHandler,
  ProofScenarioRunner,
} from './proof-types';

export interface ProofSuiteManifestEntry {
  suite: CompatibilitySuite;
  source: string;
  export: string;
}

export const proofSuiteManifest = manifest as Record<string, ProofSuiteManifestEntry>;

export const proofScenarioRunners: Record<string, ProofScenarioRunner> = {
  ...liveScenarioRunners,
  ...staticScenarioRunners,
};

export const compatibilityProofHandlers: Record<string, CompatibilityProofHandler> = {};
for (const compatibilityCase of compatCases) {
  const { assertion, handler, scenario, suite } = compatibilityCase.locator;
  const manifestEntry = proofSuiteManifest[scenario];
  if (!manifestEntry || manifestEntry.suite !== suite) {
    throw new Error(`${compatibilityCase.id} references unregistered ${suite} scenario ${scenario}`);
  }
  if (!proofScenarioRunners[scenario]) {
    throw new Error(`${compatibilityCase.id} scenario ${scenario} has no executable runner`);
  }
  if (compatibilityProofHandlers[handler]) {
    throw new Error(`Duplicate compatibility proof handler ${handler}`);
  }
  compatibilityProofHandlers[handler] = async (execution: CompatibilityProofExecution): Promise<void> => {
    const evidence = await execution.evidence(scenario);
    if (!Object.prototype.hasOwnProperty.call(evidence, assertion)) {
      throw new Error(`${compatibilityCase.id} scenario ${scenario} did not produce assertion ${assertion}`);
    }
    if (evidence[assertion] !== true) {
      throw new Error(`${compatibilityCase.name} failed executable ${suite} assertion ${assertion}`);
    }
  };
}
