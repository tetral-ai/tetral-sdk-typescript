import type Anthropic from '@tetral-ai/sdk';
import type { BetaDriveChange, DriveChangeListParams } from '@tetral-ai/sdk/resources/beta/drives/changes';

/**
 * A bounded watch example. Persist the cursor only after handling a record.
 * A notice is a hint: drain the authoritative list before opening a stream,
 * on each notice, and after the stream ends or throws before reconnecting.
 * A 410 from list means retained history is gone; rebuild from files.list.
 */
export async function watchDriveChanges(
  client: Anthropic,
  driveID: string,
  handle: (change: BetaDriveChange) => Promise<void>,
  signal: AbortSignal,
  reconnects = 2,
): Promise<void> {
  let cursor: DriveChangeListParams = {};
  const drain = async () => {
    while (!signal.aborted) {
      const page = await client.beta.drives.changes.list(driveID, { ...cursor, limit: 100 }, { signal });
      for (const change of page.data) {
        await handle(change);
        cursor = { after: change.seq, after_index: change.index };
      }
      if (!page.has_more) return;
    }
  };
  for (let attempt = 0; attempt <= reconnects && !signal.aborted; attempt++) {
    await drain();
    let stream;
    try {
      stream = await client.beta.drives.changes.stream(driveID, { signal });
    } catch (error) {
      if (signal.aborted) return;
      console.warn('Drive change stream could not open', error);
      continue;
    }
    const iterator = stream[Symbol.asyncIterator]();
    try {
      while (!signal.aborted) {
        let next;
        try {
          next = await iterator.next();
        } catch (error) {
          if (signal.aborted) return;
          console.warn('Drive change stream ended with an error', error);
          break;
        }
        if (next.done) break;
        await drain();
      }
    } finally {
      stream.controller.abort();
    }
  }
  if (!signal.aborted) await drain();
}
