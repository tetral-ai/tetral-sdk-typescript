import {
  assertObservedPreviewProof,
  previewPackage,
  previewRoot,
  previewTest,
} from './scenarios/integration';

// Independent expected observations from the owning Engine composition. Removing
// a required observation from the validator must not shrink this fixture's oracle.
const expectedAssertions = [
  'actual-sdk-session-query-options-thread-formal-only',
  'exact-sdk-preview-wrappers-and-per-event-prefix',
  'formal-original-identities-content-end-order',
  'durable-private-reasoning-and-metadata-no-preview-leak',
  'Gateway-allocation-Runtime-submission-Bridge-receipt-SQL-SDK-identities-match',
] as const;

function report(): Record<string, unknown>[] {
  return [
    { Action: 'start' },
    { Action: 'run', Test: previewRoot },
    { Action: 'run', Test: previewTest },
    ...expectedAssertions.map((name) => ({
      Action: 'output',
      Test: previewTest,
      Output: `    fixture.go:1: public_streaming_sdk_assertion=${name} passed=true\n`,
    })),
    { Action: 'pass', Test: previewTest },
    { Action: 'pass', Test: previewRoot },
    { Action: 'pass' },
  ].map((event) => ({ Package: previewPackage, ...event }));
}
function jsonl(events: Record<string, unknown>[]): string {
  return events.map((event) => JSON.stringify(event)).join('\n');
}

test('requires observed named assertions and executed root/subtest/package outcomes', () => {
  expect(() => assertObservedPreviewProof(jsonl(report()))).not.toThrow();
});
test.each(expectedAssertions)('missing owning assertion fails: %s', (assertion) => {
  expect(() =>
    assertObservedPreviewProof(
      jsonl(report().filter((event) => !String(event['Output']).includes(assertion))),
    ),
  ).toThrow('Missing observed Engine preview assertion');
});
test.each(['run', 'pass'])('unexecuted or unfinished required subtest fails: %s', (action) => {
  expect(() =>
    assertObservedPreviewProof(
      jsonl(report().filter((event) => event['Test'] !== previewTest || event['Action'] !== action)),
    ),
  ).toThrow('must execute and pass');
});
test.each(['skip', 'fail'])('terminal %s fails despite later package pass', (action) => {
  expect(() =>
    assertObservedPreviewProof(
      jsonl([...report(), { Package: previewPackage, Action: action, Test: previewTest }]),
    ),
  ).toThrow('failed or skipped');
});
test('successful process without package pass fails', () => {
  expect(() =>
    assertObservedPreviewProof(
      jsonl(report().filter((event) => event['Test'] || event['Action'] !== 'pass')),
    ),
  ).toThrow('must execute and pass');
});
test('assertions from another test cannot establish preview support', () => {
  expect(() =>
    assertObservedPreviewProof(
      jsonl(
        report().map((event) =>
          event['Action'] === 'output' ? { ...event, Test: `${previewRoot}/unrelated` } : event,
        ),
      ),
    ),
  ).toThrow('Missing observed');
});
test('wrong package and malformed reports fail closed', () => {
  expect(() =>
    assertObservedPreviewProof(jsonl(report().map((event) => ({ ...event, Package: 'unrelated' })))),
  ).toThrow('Unexpected Engine proof package');
  expect(() => assertObservedPreviewProof('not JSON')).toThrow();
});
