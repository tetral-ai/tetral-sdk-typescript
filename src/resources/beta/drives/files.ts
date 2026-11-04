import { APIResource } from '../../../core/resource';
import * as VersionsAPI from './versions';
import {
  BetaDriveVersion,
  BetaDriveVersionsPageCursor,
  DriveFileVersionListParams,
  DriveFileVersions,
} from './versions';
import { APIPromise } from '../../../core/api-promise';
import { PageCursor, type PageCursorParams, PagePromise } from '../../../core/pagination';
import { type Uploadable } from '../../../core/uploads';
import { buildHeaders } from '../../../internal/headers';
import { RequestOptions } from '../../../internal/request-options';
import { multipartFormRequestOptions } from '../../../internal/uploads';
import { path } from '../../../internal/utils/path';

export class DriveFiles extends APIResource {
  versions: VersionsAPI.DriveFileVersions = new VersionsAPI.DriveFileVersions(this._client);

  /**
   * Upload a whole file as a new version. Without a precondition the upload
   * replaces the current version; with one, a mismatch is a conflict unless the
   * stored content already equals the upload.
   *
   * @example
   * ```ts
   * const result = await client.beta.drives.files.upload('drive_team_ai', {
   *   path: 'notes/plan.md',
   *   file: fs.createReadStream('plan.md'),
   *   must_not_exist: true,
   * });
   * ```
   */
  upload(
    driveID: string,
    body: DriveFileUploadParams,
    options?: RequestOptions,
  ): APIPromise<BetaDriveUploadResult> {
    return this._client.post(
      path`/v1/drives/${driveID}/files?beta=true`,
      multipartFormRequestOptions(
        {
          body,
          ...options,
          headers: buildHeaders([{ 'anthropic-beta': 'managed-agents-2026-04-01' }, options?.headers]),
        },
        this._client,
      ),
    );
  }

  /**
   * List the drive's current files in path order.
   *
   * @example
   * ```ts
   * for await (const file of client.beta.drives.files.list('drive_team_ai', { path_prefix: 'notes' })) {
   *   // ...
   * }
   * ```
   */
  list(
    driveID: string,
    query: DriveFileListParams | null | undefined = {},
    options?: RequestOptions,
  ): PagePromise<BetaDriveFilesPageCursor, BetaDriveFile> {
    return this._client.getAPIList(path`/v1/drives/${driveID}/files?beta=true`, PageCursor<BetaDriveFile>, {
      query,
      ...options,
      headers: buildHeaders([{ 'anthropic-beta': 'managed-agents-2026-04-01' }, options?.headers]),
    });
  }

  /**
   * Download a file's current content.
   *
   * @example
   * ```ts
   * const response = await client.beta.drives.files.download('drive_team_ai', { path: 'notes/plan.md' });
   * const content = await response.text();
   * ```
   */
  download(driveID: string, query: DriveFileDownloadParams, options?: RequestOptions): APIPromise<Response> {
    return this._client.get(path`/v1/drives/${driveID}/files/content?beta=true`, {
      query,
      ...options,
      headers: buildHeaders([
        { Accept: 'application/binary', 'anthropic-beta': 'managed-agents-2026-04-01' },
        options?.headers,
      ]),
      __binaryResponse: true,
    });
  }

  /**
   * Delete a file, as a new version, when its current content matches
   * `expected_content_sha256`.
   *
   * @example
   * ```ts
   * const result = await client.beta.drives.files.delete('drive_team_ai', {
   *   path: 'notes/plan.md',
   *   expected_content_sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
   * });
   * ```
   */
  delete(
    driveID: string,
    query: DriveFileDeleteParams,
    options?: RequestOptions,
  ): APIPromise<BetaDriveDeleteResult> {
    return this._client.delete(path`/v1/drives/${driveID}/files?beta=true`, {
      query,
      ...options,
      headers: buildHeaders([{ 'anthropic-beta': 'managed-agents-2026-04-01' }, options?.headers]),
    });
  }
}

export type BetaDriveFilesPageCursor = PageCursor<BetaDriveFile>;

export interface BetaDriveFile {
  path: string;

  size_bytes: number;

  content_sha256: string;

  version_id: string;

  executable: boolean;
}

export interface BetaDriveUploadResult {
  version_id: string;

  content_sha256: string;
}

export interface BetaDriveDeleteResult {
  /**
   * The deletion's version.
   */
  version_id: string;
}

export interface DriveFileUploadFields {
  /**
   * Path relative to the drive root.
   */
  path: string;

  file: Uploadable;
}

/**
 * An upload takes at most one precondition: the hash its change was based on,
 * or that the path has no current file.
 */
export type DriveFileUploadParams =
  | (DriveFileUploadFields & { expected_content_sha256?: string; must_not_exist?: never })
  | (DriveFileUploadFields & { must_not_exist: true; expected_content_sha256?: never });

export interface DriveFileListParams extends PageCursorParams {
  /**
   * Only paths that start with this prefix.
   */
  path_prefix?: string;
}

export interface DriveFileDownloadParams {
  path: string;
}

export interface DriveFileDeleteParams {
  path: string;

  /**
   * The hash of the current content the deletion is based on.
   */
  expected_content_sha256: string;
}

DriveFiles.DriveFileVersions = DriveFileVersions;

export declare namespace DriveFiles {
  export {
    type BetaDriveDeleteResult as BetaDriveDeleteResult,
    type BetaDriveFile as BetaDriveFile,
    type BetaDriveFilesPageCursor as BetaDriveFilesPageCursor,
    type BetaDriveUploadResult as BetaDriveUploadResult,
    type DriveFileDeleteParams as DriveFileDeleteParams,
    type DriveFileDownloadParams as DriveFileDownloadParams,
    type DriveFileListParams as DriveFileListParams,
    type DriveFileUploadParams as DriveFileUploadParams,
  };

  export {
    DriveFileVersions as DriveFileVersions,
    type BetaDriveVersion as BetaDriveVersion,
    type BetaDriveVersionsPageCursor as BetaDriveVersionsPageCursor,
    type DriveFileVersionListParams as DriveFileVersionListParams,
  };
}
