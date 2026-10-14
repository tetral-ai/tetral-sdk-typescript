export type ProofEvidence = Readonly<Record<string, boolean>>;

export interface IntegrationProofScenarioContext {
  kind: 'integration';
  engineRoot: string;
  engineRevision: string;
  sdkRoot: string;
}

export type ProofScenarioContext = IntegrationProofScenarioContext;
export type ProofScenarioRunner = (context: ProofScenarioContext) => Promise<ProofEvidence>;

export interface CompatibilityProofExecution {
  evidence(scenario: string): Promise<ProofEvidence>;
}

export type CompatibilityProofHandler = (execution: CompatibilityProofExecution) => Promise<void>;
