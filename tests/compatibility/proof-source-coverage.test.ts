import fs from 'node:fs';
import path from 'node:path';

import ts from 'typescript';

import { compatCases, type CompatibilitySuite } from './compat-registry';

function executableIDsIn(sourcePath: string): Map<string, number> {
  const source = fs.readFileSync(sourcePath, 'utf8');
  const file = ts.createSourceFile(sourcePath, source, ts.ScriptTarget.Latest, true);
  const ids = new Map<string, number>();
  function visit(node: ts.Node): void {
    if (ts.isStringLiteral(node) && /^T-COMPAT-[A-Z]+-[1-9][0-9]*$/.test(node.text)) {
      ids.set(node.text, (ids.get(node.text) ?? 0) + 1);
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  return ids;
}

describe('compatibility proof source coverage', () => {
  test.each<CompatibilitySuite>(['live', 'static'])(
    '%s suite declares every assigned assertion ID',
    (suite) => {
      const sourceIDs = executableIDsIn(path.join(__dirname, 'scenarios', `${suite}.ts`));
      const assignedIDs = new Set(
        compatCases
          .filter((compatibilityCase) => compatibilityCase.locator.suite === suite)
          .map((compatibilityCase) => compatibilityCase.id),
      );
      expect(new Set(sourceIDs.keys())).toEqual(assignedIDs);
      expect([...sourceIDs.entries()].filter(([, count]) => count !== 1)).toEqual([]);
    },
  );
});
