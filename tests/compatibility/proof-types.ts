import type Anthropic from '@tetral-ai/sdk';

export type ProofEvidence = Readonly<Record<string, boolean>>;

export interface LiveProofScenarioContext {
  kind: 'live';
  client: Anthropic;
  apiKey: string;
  baseURL: string;
}

export interface StaticProofScenarioContext {
  kind: 'static';
  engineRoot: string;
  sdkRoot: string;
}

export interface IntegrationProofScenarioContext {
  kind: 'integration';
  engineRoot: string;
  engineRevision: string;
  sdkRoot: string;
}

export type ProofScenarioContext =
  | LiveProofScenarioContext
  | StaticProofScenarioContext
  | IntegrationProofScenarioContext;
export type ProofScenarioRunner = (context: ProofScenarioContext) => Promise<ProofEvidence>;

export interface CompatibilityProofExecution {
  evidence(scenario: string): Promise<ProofEvidence>;
}

export type CompatibilityProofHandler = (execution: CompatibilityProofExecution) => Promise<void>;
