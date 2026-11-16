import { watchDriveChanges } from '../examples/drive-changes';
import { contractClient } from './engine-contract/contract-fetch';

test('watch example drains on an open-stream notice and before reopening ended or failed streams', async () => {
  const requests: string[] = [];
  let lists = 0;
  let streams = 0;
  let firstStream: ReadableStreamDefaultController<Uint8Array> | undefined;
  let firstStreamClosed = false;
  let noticeHandled!: () => void;
  const handledNotice = new Promise<void>((resolve) => {
    noticeHandled = resolve;
  });
  const abort = new AbortController();
  const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const client = contractClient({
    apiKey: 'fixture',
    baseURL: 'https://example.test',
    fetch: async (url) => {
      const parsed = new URL(String(url));
      if (parsed.pathname.endsWith('/stream')) {
        requests.push('stream');
        streams++;
        return new Response(
          streams === 1 ?
            new ReadableStream<Uint8Array>({
              start(controller) {
                firstStream = controller;
                controller.enqueue(
                  new TextEncoder().encode('event: drive.changed\ndata: {"drive_id":"drive_1","seq":1}\n\n'),
                );
              },
              cancel() {
                firstStreamClosed = true;
              },
            })
          : new ReadableStream({
              start(controller) {
                controller.error(new Error('disconnected'));
              },
            }),
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
  const watching = watchDriveChanges(
    client,
    'drive_1',
    async (change) => {
      seen.push(change.index);
      if (change.index === 2) noticeHandled();
    },
    abort.signal,
    1,
  );
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      handledNotice,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error('notice was not handled while the stream remained open')),
          1000,
        );
      }),
    ]);
    expect(firstStreamClosed).toBe(false);
    expect(streams).toBe(1);
    expect(requests).toEqual(['list:start', 'list:0', 'stream', 'list:1']);
    firstStream!.close();
    firstStreamClosed = true;
    await watching;
  } finally {
    clearTimeout(timeout);
    if (!firstStreamClosed) {
      firstStream?.close();
      firstStreamClosed = true;
    }
    abort.abort();
    await watching;
    warning.mockRestore();
  }
  expect(requests).toEqual(['list:start', 'list:0', 'stream', 'list:1', 'list:2', 'stream', 'list:3']);
  expect(seen).toEqual([0, 1, 2, 3, 4]);
});
