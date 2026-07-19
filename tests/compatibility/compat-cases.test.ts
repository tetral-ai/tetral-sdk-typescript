import { compatCases, type CompatibilityProof } from './compat-registry';

describe('SDK compatibility proof registry', () => {
  test.each(compatCases)('$name', (compatibilityCase) => {
    const allowedProofs = new Set<CompatibilityProof>(['live', 'static', 'rejection', 'not-produced']);
    expect(compatibilityCase.id).toMatch(/^T-COMPAT-[A-Z]+-[1-9][0-9]*$/);
    expect(compatibilityCase.name).toBe(`${compatibilityCase.id} ${compatibilityCase.surface}`);
    expect(compatibilityCase.expectation.trim()).not.toBe('');
    expect(compatibilityCase.locator.assertion).toBe(compatibilityCase.id);
    expect(compatibilityCase.locator.handler).toBe(
      `${compatibilityCase.locator.scenario}#${compatibilityCase.id}`,
    );
    expect(compatibilityCase.locator.suite).toBe(
      compatibilityCase.proof === 'live' || compatibilityCase.proof === 'rejection' ? 'live' : 'static',
    );
    expect(allowedProofs).toContain(compatibilityCase.proof);
    if (compatibilityCase.status === 'rejected') {
      expect(compatibilityCase.proof).toBe('rejection');
    } else if (compatibilityCase.status === 'not-produced') {
      expect(compatibilityCase.proof).toBe('not-produced');
    } else {
      expect(['live', 'static']).toContain(compatibilityCase.proof);
    }
  });

  test('contains exactly 285 unique IDs and names', () => {
    expect(compatCases).toHaveLength(285);
    expect(new Set(compatCases.map((compatibilityCase) => compatibilityCase.id)).size).toBe(285);
    expect(new Set(compatCases.map((compatibilityCase) => compatibilityCase.name)).size).toBe(285);
  });

  test('numbers every proof family continuously from one', () => {
    const families = new Map<string, number[]>();
    for (const compatibilityCase of compatCases) {
      const match = /^T-COMPAT-([A-Z]+)-([1-9][0-9]*)$/.exec(compatibilityCase.id);
      expect(match).not.toBeNull();
      const [, family, sequence] = match!;
      const numbers = families.get(family!) ?? [];
      numbers.push(Number(sequence));
      families.set(family!, numbers);
    }

    for (const numbers of families.values()) {
      numbers.sort((left, right) => left - right);
      expect(numbers).toEqual(Array.from({ length: numbers.length }, (_, index) => index + 1));
    }
  });

  test('keeps both required and typed Memory null rejections', () => {
    for (const id of ['T-COMPAT-MEM-19', 'T-COMPAT-MEM-20']) {
      expect(compatCases.find((compatibilityCase) => compatibilityCase.id === id)).toMatchObject({
        status: 'rejected',
        proof: 'rejection',
      });
    }
  });
});
