import { compatCases } from './compat-registry';
import { executeCompatibilityProofs } from './proof-execution';
import { compatibilityProofHandlers, proofSuiteManifest } from './proof-registration';

describe('compatibility executable proof registration', () => {
  const executableCases = compatCases.filter((entry) => entry.locator);

  test('registers exactly the executable cases', () => {
    expect(new Set(Object.keys(compatibilityProofHandlers))).toEqual(
      new Set(executableCases.map((entry) => entry.locator!.handler)),
    );
    for (const entry of executableCases) {
      expect(proofSuiteManifest[entry.locator!.scenario]?.suite).toBe('integration');
    }
  });

  test('requires the selected scenario to produce the exact assertion with true evidence', async () => {
    const entry = executableCases[0]!;
    const handler = compatibilityProofHandlers[entry.locator!.handler]!;
    let requestedScenario: string | undefined;
    await handler({
      evidence: async (scenario) => {
        requestedScenario = scenario;
        return { [entry.id]: true };
      },
    });
    expect(requestedScenario).toBe(entry.locator!.scenario);
    await expect(handler({ evidence: async () => ({ unrelated: true }) })).rejects.toThrow(
      `did not produce assertion ${entry.id}`,
    );
    await expect(handler({ evidence: async () => ({ [entry.id]: false }) })).rejects.toThrow(
      'failed executable integration assertion',
    );
  });

  test('refuses an empty selection or a documentation row as executable proof', async () => {
    const context = { kind: 'integration' as const, engineRoot: '', engineRevision: '', sdkRoot: '' };
    await expect(executeCompatibilityProofs('integration', [], context)).rejects.toThrow(
      'No executable compatibility cases selected',
    );
    await expect(
      executeCompatibilityProofs('integration', [compatCases.find((entry) => !entry.locator)!], context),
    ).rejects.toThrow('1 failed');
  });
});
