import { compatCases } from './compat-registry';

describe('SDK compatibility registry', () => {
  test('keeps unique, classified IDs and binds only executable integration cases', () => {
    expect(new Set(compatCases.map((entry) => entry.id)).size).toBe(compatCases.length);
    for (const entry of compatCases) {
      expect(entry.id).toMatch(/^T-COMPAT-[A-Z]+-[1-9][0-9]*$/);
      expect(entry.surface.trim()).not.toBe('');
      expect(entry.expectation.trim()).not.toBe('');
      expect(['supported', 'rejected', 'not-produced']).toContain(entry.status);
      if (entry.status === 'rejected') {
        expect(entry.proof).toBe('rejection');
      } else if (entry.status === 'not-produced') {
        expect(entry.proof).toBe('not-produced');
      } else {
        expect(['documented', 'typecheck', 'integration']).toContain(entry.proof);
      }
      if (entry.proof === 'integration') {
        expect(entry.locator).toEqual({
          suite: 'integration',
          scenario: expect.any(String),
          assertion: entry.id,
          handler: `${entry.locator?.scenario}#${entry.id}`,
        });
      } else {
        expect(entry.locator).toBeUndefined();
      }
      if (entry.proof === 'typecheck') expect(entry.test).toBeTruthy();
    }
  });
});
