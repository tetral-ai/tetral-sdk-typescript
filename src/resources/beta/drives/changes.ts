import { APIResource } from '../../../core/resource';
import * as DrivesAPI from './drives';
import { APIPromise } from '../../../core/api-promise';
import { Stream } from '../../../core/streaming';
import { buildHeaders } from '../../../internal/headers';
import { RequestOptions } from '../../../internal/request-options';
import { path } from '../../../internal/utils/path';

/**
 * A drive's change list, the source of truth for what changed. A reader lists
 * at start and after every reconnect; the stream only signals that more records
 * exist.
 */
export class DriveChanges extends APIResource {
  /**
   * List change records in sequence order after `after`.
   *
   * @example
   * ```ts
   * const page = await client.beta.drives.changes.list('drive_team_ai', { after: 41 });
   * ```
   */
  list(
    driveID: string,
    query: DriveChangeListParams | null | undefined = {},
    options?: RequestOptions,
  ): APIPromise<BetaDriveChangeList> {
    return this._client.get(path`/v1/drives/${driveID}/changes?beta=true`, {
      query,
      ...options,
      headers: buildHeaders([{ 'anthropic-beta': 'managed-agents-2026-04-01' }, options?.headers]),
    });
  }

  /**
   * Stream notices carrying the drive's latest sequence number.
   *
   * @example
   * ```ts
   * const stream = await client.beta.drives.changes.stream('drive_team_ai');
   * for await (const notice of stream) {
   *   // list changes after the last seq read
   * }
   * ```
   */
  stream(driveID: string, options?: RequestOptions): APIPromise<Stream<BetaDriveChangeNotice>> {
    return this._client.get(path`/v1/drives/${driveID}/changes/stream?beta=true`, {
      ...options,
      headers: buildHeaders([{ 'anthropic-beta': 'managed-agents-2026-04-01' }, options?.headers]),
      stream: true,
    }) as APIPromise<Stream<BetaDriveChangeNotice>>;
  }
}

export interface BetaDriveChange {
  seq: number;

  path: string;

  operation: 'created' | 'modified' | 'deleted';

  version_id: string;

  writer: DrivesAPI.BetaDriveWriter;

  /**
   * A timestamp in RFC 3339 format
   */
  created_at: string;
}

export interface BetaDriveChangeList {
  data: Array<BetaDriveChange>;

  has_more: boolean;
}

export interface BetaDriveChangeNotice {
  drive_id: string;

  /**
   * The drive's latest sequence number.
   */
  seq: number;
}

export interface DriveChangeListParams {
  /**
   * List records after this sequence number; without it, from the drive's oldest
   * kept record.
   */
  after?: number;

  /**
   * Only records that this Session's computers made.
   */
  session_id?: string;

  /**
   * 1 to 1,000; defaults to 20.
   */
  limit?: number;
}

export declare namespace DriveChanges {
  export {
    type BetaDriveChange as BetaDriveChange,
    type BetaDriveChangeList as BetaDriveChangeList,
    type BetaDriveChangeNotice as BetaDriveChangeNotice,
    type DriveChangeListParams as DriveChangeListParams,
  };
}
