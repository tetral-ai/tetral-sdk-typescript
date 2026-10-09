import { assertObservedOIDCProof, oidcRoot, previewPackage } from './scenarios/integration';

// Independent contract oracle: both native flows and actual typed attribution.
const requiredAssertions = {
  human: [
    'human_session_memory_cached_token_one401_one_exchange_one_effect',
    'human_typed_created_by_redacted_by_stable_identity',
  ],
  service: [
    'service_session_memory_cached_token_one401_one_exchange_one_effect',
    'service_typed_created_by_redacted_by_stable_identity',
  ],
};
function report(): Record<string, unknown>[] {
  return [
    { Action: 'start' },
    { Action: 'run', Test: oidcRoot },
    ...Object.entries(requiredAssertions).flatMap(([actor, names]) => [
      { Action: 'run', Test: `${oidcRoot}/${actor}` },
      ...names.map((name) => ({
        Action: 'output',
        Test: `${oidcRoot}/${actor}`,
        Output: `fixture.go:1: oidc_sdk_assertion=${name} passed=true\n`,
      })),
      { Action: 'pass', Test: `${oidcRoot}/${actor}` },
    ]),
    { Action: 'pass', Test: oidcRoot },
    { Action: 'pass' },
  ].map((event) => ({ Package: previewPackage, ...event }));
}
function validate(events: Record<string, unknown>[]): void {
  assertObservedOIDCProof(events.map((event) => JSON.stringify(event)).join('\n'));
}

test('reconciles both executed identity flows and typed actor observations', () => {
  expect(() => validate(report())).not.toThrow();
});
test.each(Object.values(requiredAssertions).flat())('missing actual observation fails: %s', (name) => {
  expect(() => validate(report().filter((event) => !String(event['Output']).includes(name)))).toThrow(
    'Missing observed Engine OIDC assertion',
  );
});
test.each(['human', 'service'])('marker from the wrong identity subtest fails: %s', (actor) => {
  expect(() =>
    validate(
      report().map((event) =>
        event['Action'] === 'output' && event['Test'] === `${oidcRoot}/${actor}` ?
          { ...event, Test: `${oidcRoot}/unrelated` }
        : event,
      ),
    ),
  ).toThrow('Missing observed');
});
test('emitted marker names alone cannot establish an executed native fixture', () => {
  expect(() => validate(report().filter((event) => event['Action'] === 'output'))).toThrow(
    'must execute and pass',
  );
});
test.each(['run', 'pass'])('missing required service execution outcome fails: %s', (action) => {
  expect(() =>
    validate(
      report().filter((event) => event['Test'] !== `${oidcRoot}/service` || event['Action'] !== action),
    ),
  ).toThrow('must execute and pass');
});
test.each(['skip', 'fail'])('a %s fails despite later successful-looking outcomes', (action) => {
  expect(() => validate([...report(), { Package: previewPackage, Action: action, Test: oidcRoot }])).toThrow(
    'failed or skipped',
  );
});
test('a marker without passed=true and a report without a package pass fail', () => {
  expect(() =>
    validate(
      report().map((event) =>
        event['Action'] === 'output' ?
          { ...event, Output: String(event['Output']).replace('passed=true', 'passed=false') }
        : event,
      ),
    ),
  ).toThrow('Missing observed');
  expect(() => validate(report().filter((event) => event['Test'] || event['Action'] !== 'pass'))).toThrow(
    'must execute and pass',
  );
});
test('a wrong package or malformed report fails closed', () => {
  expect(() => validate(report().map((event) => ({ ...event, Package: 'unrelated' })))).toThrow(
    'Unexpected Engine proof package',
  );
  expect(() => assertObservedOIDCProof('not JSON')).toThrow();
});
