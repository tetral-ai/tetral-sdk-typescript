import { APIResource } from '../../../core/resource';
import * as ChangesAPI from './changes';
import {
  BetaDriveChange,
  BetaDriveChangeList,
  BetaDriveChangeNotice,
  DriveChangeListParams,
  DriveChanges,
} from './changes';
import * as FilesAPI from './files';
import {
  BetaDriveDeleteResult,
  BetaDriveFile,
  BetaDriveFilesPageCursor,
  BetaDriveUploadResult,
  DriveFileDeleteParams,
  DriveFileDownloadParams,
  DriveFileListParams,
  DriveFileUploadParams,
  DriveFiles,
} from './files';
import * as SkillsAPI from './skills';
import {
  BetaDriveSkill,
  BetaDriveSkillsPageCursor,
  DriveSkillListParams,
  DriveSkillUploadParams,
  DriveSkills,
} from './skills';
import * as UsageAPI from './usage';
import { BetaDriveUsage, DriveUsage } from './usage';
import { APIPromise } from '../../../core/api-promise';
import { PageCursor, type PageCursorParams, PagePromise } from '../../../core/pagination';
import { buildHeaders } from '../../../internal/headers';
import { RequestOptions } from '../../../internal/request-options';
import { path } from '../../../internal/utils/path';

/**
 * Workspace drives: files that every machine of a Session binding the drive
 * mounts, with versions, Memory and Skills folders, and a change list.
 */
export class Drives extends APIResource {
  usage: UsageAPI.DriveUsage = new UsageAPI.DriveUsage(this._client);
  files: FilesAPI.DriveFiles = new FilesAPI.DriveFiles(this._client);
  skills: SkillsAPI.DriveSkills = new SkillsAPI.DriveSkills(this._client);
  changes: ChangesAPI.DriveChanges = new ChangesAPI.DriveChanges(this._client);

  /**
   * Create Drive
   *
   * @example
   * ```ts
   * const drive = await client.beta.drives.create({ metadata: { team: 'ai' } });
   * ```
   */
  create(body: DriveCreateParams | null | undefined = {}, options?: RequestOptions): APIPromise<BetaDrive> {
    return this._client.post('/v1/drives?beta=true', {
      body,
      ...options,
      headers: buildHeaders([{ 'anthropic-beta': 'managed-agents-2026-04-01' }, options?.headers]),
    });
  }

  /**
   * Get Drive
   *
   * @example
   * ```ts
   * const drive = await client.beta.drives.retrieve('drive_team_ai');
   * ```
   */
  retrieve(driveID: string, options?: RequestOptions): APIPromise<BetaDrive> {
    return this._client.get(path`/v1/drives/${driveID}?beta=true`, {
      ...options,
      headers: buildHeaders([{ 'anthropic-beta': 'managed-agents-2026-04-01' }, options?.headers]),
    });
  }

  /**
   * List Drives, oldest first.
   *
   * @example
   * ```ts
   * for await (const drive of client.beta.drives.list()) {
   *   // ...
   * }
   * ```
   */
  list(
    query: DriveListParams | null | undefined = {},
    options?: RequestOptions,
  ): PagePromise<BetaDrivesPageCursor, BetaDrive> {
    return this._client.getAPIList('/v1/drives?beta=true', PageCursor<BetaDrive>, {
      query,
      ...options,
      headers: buildHeaders([{ 'anthropic-beta': 'managed-agents-2026-04-01' }, options?.headers]),
    });
  }

  /**
   * Update Drive. Each given field replaces the stored one, `memory` and `limits` as whole objects;
   * `metadata` merges keys and deletes a key given as `null`.
   *
   * @example
   * ```ts
   * const drive = await client.beta.drives.update('drive_team_ai', {
   *   limits: { max_bytes: 1_000_000_000, max_files: null },
   * });
   * ```
   */
  update(driveID: string, body: DriveUpdateParams, options?: RequestOptions): APIPromise<BetaDrive> {
    return this._client.post(path`/v1/drives/${driveID}?beta=true`, {
      body,
      ...options,
      headers: buildHeaders([{ 'anthropic-beta': 'managed-agents-2026-04-01' }, options?.headers]),
    });
  }

  /**
   * Delete Drive. A drive that a Session binds cannot be deleted.
   *
   * @example
   * ```ts
   * await client.beta.drives.delete('drive_team_ai');
   * ```
   */
  delete(driveID: string, options?: RequestOptions): APIPromise<void> {
    return this._client.delete(path`/v1/drives/${driveID}?beta=true`, {
      ...options,
      headers: buildHeaders([{ 'anthropic-beta': 'managed-agents-2026-04-01' }, options?.headers]),
    });
  }

  /**
   * Restore Drive files to their content at `as_of`, in one commit. Files
   * created after `as_of` stay.
   *
   * @example
   * ```ts
   * const result = await client.beta.drives.restore('drive_team_ai', {
   *   path_prefix: 'memory',
   *   as_of: '2026-10-01T00:00:00Z',
   * });
   * ```
   */
  restore(
    driveID: string,
    body: DriveRestoreParams,
    options?: RequestOptions,
  ): APIPromise<BetaDriveRestoreResult> {
    return this._client.post(path`/v1/drives/${driveID}/restore?beta=true`, {
      body,
      ...options,
      headers: buildHeaders([{ 'anthropic-beta': 'managed-agents-2026-04-01' }, options?.headers]),
    });
  }
}

export type BetaDrivesPageCursor = PageCursor<BetaDrive>;

export interface BetaDrive {
  id: string;

  /**
   * The Skills folder, with a trailing `/`.
   */
  skills_path: string;

  memory: BetaDriveMemory;

  limits: BetaDriveLimits;

  /**
   * Size and number of the drive's current files.
   */
  usage: { bytes: number; files: number };

  /**
   * Bytes of every distinct content the drive's current and old versions name,
   * recorded by Engine's daily cleanup; `null` until its first run.
   */
  stored_bytes: number | null;

  metadata: { [key: string]: string };

  /**
   * A timestamp in RFC 3339 format
   */
  created_at: string;
}

export interface BetaDriveMemory {
  /**
   * The Memory folder, with a trailing `/`.
   */
  path: string;

  instructions: string | null;
}

/**
 * Per-drive caps below the workspace limits; `null` sets no cap.
 */
export interface BetaDriveLimits {
  max_bytes: number | null;

  max_files: number | null;
}

/**
 * Who wrote a version or change: an API key, a direct human or service token,
 * or one of a Session's computers.
 */
export type BetaDriveWriter =
  | { type: 'api_actor'; api_key_id: string }
  | { type: 'user_actor'; user_id: string }
  | { type: 'service_account_actor'; service_account_id: string }
  | { type: 'session_actor'; session_id: string; computer_id: string };

export interface BetaDriveRestoreResult {
  /**
   * The restore commit's sequence number; `null` when nothing was restored.
   */
  seq: number | null;

  /**
   * The number of files restored.
   */
  restored: number;

  /**
   * Files left as they are because their content at `as_of` was redacted.
   */
  redacted_paths: Array<string>;

  /**
   * Files left as they are because their version at `as_of` is no longer kept.
   */
  removed_paths: Array<string>;
}

export interface DriveCreateParams {
  /**
   * Defaults to `skills/`.
   */
  skills_path?: string;

  /**
   * Defaults to `{path: 'memory/', instructions: null}`.
   */
  memory?: { path?: string; instructions?: string | null };

  /** Omitted members default to null (no cap). */
  limits?: Partial<BetaDriveLimits>;

  metadata?: { [key: string]: string };
}

export interface DriveUpdateParams {
  skills_path?: string;

  memory?: { path?: string; instructions?: string | null };

  /** Replaces all limits on update; omitted members become null (no cap). */
  limits?: Partial<BetaDriveLimits>;

  metadata?: { [key: string]: string | null };
}

export interface DriveListParams extends PageCursorParams {}

export interface DriveRestoreParams {
  /**
   * Restore only paths that start with this prefix.
   */
  path_prefix?: string;

  /**
   * A timestamp in RFC 3339 format
   */
  as_of: string;
}

Drives.DriveUsage = DriveUsage;
Drives.DriveFiles = DriveFiles;
Drives.DriveSkills = DriveSkills;
Drives.DriveChanges = DriveChanges;

export declare namespace Drives {
  export {
    type BetaDrive as BetaDrive,
    type BetaDriveLimits as BetaDriveLimits,
    type BetaDriveMemory as BetaDriveMemory,
    type BetaDriveRestoreResult as BetaDriveRestoreResult,
    type BetaDriveWriter as BetaDriveWriter,
    type BetaDrivesPageCursor as BetaDrivesPageCursor,
    type DriveCreateParams as DriveCreateParams,
    type DriveListParams as DriveListParams,
    type DriveRestoreParams as DriveRestoreParams,
    type DriveUpdateParams as DriveUpdateParams,
  };

  export { DriveUsage as DriveUsage, type BetaDriveUsage as BetaDriveUsage };

  export {
    DriveFiles as DriveFiles,
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
    DriveSkills as DriveSkills,
    type BetaDriveSkill as BetaDriveSkill,
    type BetaDriveSkillsPageCursor as BetaDriveSkillsPageCursor,
    type DriveSkillListParams as DriveSkillListParams,
    type DriveSkillUploadParams as DriveSkillUploadParams,
  };

  export {
    DriveChanges as DriveChanges,
    type BetaDriveChange as BetaDriveChange,
    type BetaDriveChangeList as BetaDriveChangeList,
    type BetaDriveChangeNotice as BetaDriveChangeNotice,
    type DriveChangeListParams as DriveChangeListParams,
  };
}
