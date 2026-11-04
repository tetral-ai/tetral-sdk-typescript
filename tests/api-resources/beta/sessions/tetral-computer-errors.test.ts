import Anthropic from '@tetral-ai/sdk';
import type {
  BetaManagedAgentsComputerCleanupError,
  BetaManagedAgentsSessionErrorEvent,
} from '@tetral-ai/sdk/resources/beta/sessions';
import { jsonResponse } from '../tetral-contract-helpers';

const cleanup: BetaManagedAgentsComputerCleanupError = {
  type: 'computer_cleanup_error',
  computer_id: 'comp_example',
  message: 'Operator cleanup required.',
  retry_status: { type: 'terminal' },
  cleanup_failures: [{ path: '/owned/repository', message: 'Permission denied' }],
};
const events: BetaManagedAgentsSessionErrorEvent[] = [
  { id: 'evt_cleanup', processed_at: '2026-01-01T00:00:00Z', type: 'session.error', error: cleanup },
  {
    id: 'evt_prepare',
    processed_at: '2026-01-01T00:00:00Z',
    type: 'session.error',
    error: {
      type: 'computer_preparation_error',
      computer_id: 'comp_example',
      code: 'repository_preparation_failed',
      message: 'Requested branch does not exist.',
      retry_status: { type: 'retrying' },
    },
  },
];
// @ts-expect-error Cleanup has ended and cannot be advertised as automatically retrying.
const retrying: BetaManagedAgentsComputerCleanupError['retry_status'] = { type: 'retrying' };
void retrying;

test('computer error events narrow to their typed diagnostics', async () => {
  const client = new Anthropic({
    apiKey: 'test-key',
    baseURL: 'https://api.tetral.example',
    fetch: async () =>
      jsonResponse({ data: events, has_more: false, first_id: events[0]!.id, last_id: events[1]!.id }),
  });
  const page = await client.beta.sessions.events.list('sesn_example');
  const observed: string[] = [];
  for (const event of page.data) {
    if (event.type !== 'session.error') continue;
    if (event.error.type === 'computer_cleanup_error') {
      expect(event.error.retry_status.type).toBe('terminal');
      observed.push(...event.error.cleanup_failures.map(({ path, message }) => `${path}: ${message}`));
    } else if (event.error.type === 'computer_preparation_error') {
      observed.push(event.error.code);
    }
  }
  expect(observed).toEqual(['/owned/repository: Permission denied', 'repository_preparation_failed']);
});
