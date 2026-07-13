import registry from './compat-cases.json';

export type CompatibilityStatus = 'supported' | 'rejected' | 'not-produced';
export type CompatibilityProof = 'live' | 'static' | 'rejection' | 'not-produced';
export type CompatibilitySuite = 'live' | 'static';

export interface CompatibilityProofLocator {
  suite: CompatibilitySuite;
  scenario: string;
  assertion: string;
  handler: string;
}

export interface CompatibilityCase {
  id: `T-COMPAT-${string}-${number}`;
  name: string;
  surface: string;
  status: CompatibilityStatus;
  proof: CompatibilityProof;
  expectation: string;
  locator: CompatibilityProofLocator;
}

// The JSON registry is shared with Engine's Go-only static traceability gate.
export const compatCases = registry as CompatibilityCase[];
