import { compatCases } from './compat-registry';
import { compatibilityProofHandlers, proofSuiteManifest } from './proof-registration';

describe('compatibility executable proof registration', () => {
  test('binds and invokes every contract row through its exact scenario and assertion', async () => {
    expect(Object.keys(compatibilityProofHandlers)).toHaveLength(285);
    for (const compatibilityCase of compatCases) {
      expect(proofSuiteManifest[compatibilityCase.locator.scenario]).toMatchObject({
        suite: compatibilityCase.locator.suite,
      });
      const handler = compatibilityProofHandlers[compatibilityCase.locator.handler];
      expect(handler).toEqual(expect.any(Function));
      if (!handler) throw new Error(`Missing handler ${compatibilityCase.locator.handler}`);
      let requestedScenario: string | undefined;
      await handler({
        evidence: async (scenario) => {
          requestedScenario = scenario;
          return { [compatibilityCase.id]: true };
        },
      });
      expect(requestedScenario).toBe(compatibilityCase.locator.scenario);
      await expect(handler({ evidence: async () => ({}) })).rejects.toThrow(
        `did not produce assertion ${compatibilityCase.id}`,
      );
    }
  });

  test('does not register extra handlers outside the authoritative registry', () => {
    expect(new Set(Object.keys(compatibilityProofHandlers))).toEqual(
      new Set(compatCases.map((compatibilityCase) => compatibilityCase.locator.handler)),
    );
  });
});
