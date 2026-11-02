import Anthropic from '@tetral-ai/sdk';
import { watchDriveChanges } from '../examples/drive-changes';

test('watch example drains paired pages before reopening ended or failed streams', async () => {
  const requests: string[] = [];
  let lists = 0;
  let streams = 0;
  const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const client = new Anthropic({
    apiKey: 'fixture',
    baseURL: 'https://example.test',
    fetch: async (url) => {
      const parsed = new URL(String(url));
      if (parsed.pathname.endsWith('/stream')) {
        requests.push('stream');
        streams++;
        return new Response(
          streams === 1 ? '' : (
            new ReadableStream({
              start(controller) {
                controller.error(new Error('disconnected'));
              },
            })
          ),
          { headers: { 'Content-Type': 'text/event-stream' } },
        );
      }
      requests.push(`list:${parsed.searchParams.get('after_index') ?? 'start'}`);
      const index = lists++;
      return Response.json({
        data: [
          {
            seq: 1,
            index,
            path: `file-${index}`,
            operation: 'created',
            version_id: `v${index}`,
            writer: { type: 'api_actor', api_key_id: 'fixture' },
            created_at: '2026-01-01T00:00:00Z',
          },
        ],
        has_more: index === 0,
      });
    },
  });
  const seen: number[] = [];
  try {
    await watchDriveChanges(
      client,
      'drive_1',
      async (change) => {
        seen.push(change.index);
      },
      new AbortController().signal,
      1,
    );
  } finally {
    warning.mockRestore();
  }
  expect(requests).toEqual(['list:start', 'list:0', 'stream', 'list:1', 'stream', 'list:2']);
  expect(seen).toEqual([0, 1, 2, 3]);
});
