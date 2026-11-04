import { APIResource } from '../../../core/resource';
import * as DrivesAPI from './drives';
import { APIPromise } from '../../../core/api-promise';
import { PageCursor, type PageCursorParams, PagePromise } from '../../../core/pagination';
import { buildHeaders } from '../../../internal/headers';
import { RequestOptions } from '../../../internal/request-options';
import { path } from '../../../internal/utils/path';

/**
 * Kept versions of drive files. A file keeps at most 10 old versions, each for
 * 30 days after it stopped being current.
 */
export class DriveFileVersions extends APIResource {
  /**
   * List a path's kept versions, deletions included, oldest first.
   *
   * @example
   * ```ts
   * for await (const version of client.beta.drives.files.versions.list('drive_team_ai', { path: 'notes/plan.md' })) {
   *   // ...
   * }
   * ```
   */
  list(
    driveID: string,
    query: DriveFileVersionListParams,
    options?: RequestOptions,
  ): PagePromise<BetaDriveVersionsPageCursor, BetaDriveVersion> {
    return this._client.getAPIList(
      path`/v1/drives/${driveID}/files/versions?beta=true`,
      PageCursor<BetaDriveVersion>,
      {
        query,
        ...options,
        headers: buildHeaders([{ 'anthropic-beta': 'managed-agents-2026-04-01' }, options?.headers]),
      },
    );
  }

  /**
   * Get one version record.
   *
   * @example
   * ```ts
   * const version = await client.beta.drives.files.versions.retrieve('drive_team_ai', 'dver_example');
   * ```
   */
  retrieve(driveID: string, versionID: string, options?: RequestOptions): APIPromise<BetaDriveVersion> {
    return this._client.get(path`/v1/drives/${driveID}/versions/${versionID}?beta=true`, {
      ...options,
      headers: buildHeaders([{ 'anthropic-beta': 'managed-agents-2026-04-01' }, options?.headers]),
    });
  }

  /**
   * Download one version's content. A deletion or a redacted version has none.
   *
   * @example
   * ```ts
   * const response = await client.beta.drives.files.versions.content('drive_team_ai', 'dver_example');
   * ```
   */
  content(driveID: string, versionID: string, options?: RequestOptions): APIPromise<Response> {
    return this._client.get(path`/v1/drives/${driveID}/versions/${versionID}/content?beta=true`, {
      ...options,
      headers: buildHeaders([
        { Accept: 'application/binary', 'anthropic-beta': 'managed-agents-2026-04-01' },
        options?.headers,
      ]),
      __binaryResponse: true,
    });
  }

  /**
   * Erase one past version's content; its record stays, marked redacted. A
   * file's current version cannot be redacted.
   *
   * @example
   * ```ts
   * const version = await client.beta.drives.files.versions.redact('drive_team_ai', 'dver_example');
   * ```
   */
  redact(driveID: string, versionID: string, options?: RequestOptions): APIPromise<BetaDriveVersion> {
    return this._client.post(path`/v1/drives/${driveID}/versions/${versionID}/redact?beta=true`, {
      ...options,
      headers: buildHeaders([{ 'anthropic-beta': 'managed-agents-2026-04-01' }, options?.headers]),
    });
  }
}

export type BetaDriveVersionsPageCursor = PageCursor<BetaDriveVersion>;

export interface BetaDriveVersion {
  version_id: string;

  path: string;

  operation: 'created' | 'modified' | 'deleted';

  /**
   * `0` for a deletion.
   */
  size_bytes: number;

  /**
   * `null` for a deletion.
   */
  content_sha256: string | null;

  executable: boolean;

  writer: DrivesAPI.BetaDriveWriter;

  /**
   * A timestamp in RFC 3339 format
   */
  created_at: string;

  redacted: boolean;

  /**
   * Who redacted the version, or `null`.
   */
  redacted_by: DrivesAPI.BetaDriveWriter | null;
}

export interface DriveFileVersionListParams extends PageCursorParams {
  path: string;
}

export declare namespace DriveFileVersions {
  export {
    type BetaDriveVersion as BetaDriveVersion,
    type BetaDriveVersionsPageCursor as BetaDriveVersionsPageCursor,
    type DriveFileVersionListParams as DriveFileVersionListParams,
  };
}
