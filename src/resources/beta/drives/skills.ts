import { APIResource } from '../../../core/resource';
import { APIPromise } from '../../../core/api-promise';
import { PageCursor, type PageCursorParams, PagePromise } from '../../../core/pagination';
import { type Uploadable } from '../../../core/uploads';
import { buildHeaders } from '../../../internal/headers';
import { RequestOptions } from '../../../internal/request-options';
import { multipartFormRequestOptions } from '../../../internal/uploads';
import { path } from '../../../internal/utils/path';

/**
 * Skills: folders holding a `SKILL.md` inside a drive's Skills folder.
 */
export class DriveSkills extends APIResource {
  /**
   * Publish a Skill from a zip archive in one commit, replacing the whole
   * folder that its `SKILL.md` names.
   *
   * @example
   * ```ts
   * const skill = await client.beta.drives.skills.upload('drive_team_ai', {
   *   archive: fs.createReadStream('review.zip'),
   * });
   * ```
   */
  upload(
    driveID: string,
    body: DriveSkillUploadParams,
    options?: RequestOptions,
  ): APIPromise<BetaDriveSkill> {
    return this._client.post(
      path`/v1/drives/${driveID}/skills?beta=true`,
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
   * List the drive's Skills, each with the reason its `SKILL.md` is invalid, if
   * it is.
   *
   * @example
   * ```ts
   * for await (const skill of client.beta.drives.skills.list('drive_team_ai')) {
   *   // ...
   * }
   * ```
   */
  list(
    driveID: string,
    query: DriveSkillListParams | null | undefined = {},
    options?: RequestOptions,
  ): PagePromise<BetaDriveSkillsPageCursor, BetaDriveSkill> {
    return this._client.getAPIList(path`/v1/drives/${driveID}/skills?beta=true`, PageCursor<BetaDriveSkill>, {
      query,
      ...options,
      headers: buildHeaders([{ 'anthropic-beta': 'managed-agents-2026-04-01' }, options?.headers]),
    });
  }

  /**
   * Get one Skill.
   *
   * @example
   * ```ts
   * const skill = await client.beta.drives.skills.retrieve('drive_team_ai', 'review');
   * ```
   */
  retrieve(driveID: string, name: string, options?: RequestOptions): APIPromise<BetaDriveSkill> {
    return this._client.get(path`/v1/drives/${driveID}/skills/${name}?beta=true`, {
      ...options,
      headers: buildHeaders([{ 'anthropic-beta': 'managed-agents-2026-04-01' }, options?.headers]),
    });
  }

  /**
   * Delete a Skill's folder in one commit.
   *
   * @example
   * ```ts
   * await client.beta.drives.skills.delete('drive_team_ai', 'review');
   * ```
   */
  delete(driveID: string, name: string, options?: RequestOptions): APIPromise<void> {
    return this._client.delete(path`/v1/drives/${driveID}/skills/${name}?beta=true`, {
      ...options,
      headers: buildHeaders([{ 'anthropic-beta': 'managed-agents-2026-04-01' }, options?.headers]),
    });
  }
}

export type BetaDriveSkillsPageCursor = PageCursor<BetaDriveSkill>;

export interface BetaDriveSkill {
  /**
   * The Skill's folder name.
   */
  name: string;

  /**
   * From `SKILL.md`; null when `SKILL.md` is invalid (see `error`).
   */
  description: string | null;

  /**
   * `null`, or the reason `SKILL.md` is invalid.
   */
  error: string | null;
}

export interface DriveSkillUploadParams {
  /**
   * A zip archive holding the Skill's folder with its `SKILL.md`.
   */
  archive: Uploadable;
}

export interface DriveSkillListParams extends PageCursorParams {}

export declare namespace DriveSkills {
  export {
    type BetaDriveSkill as BetaDriveSkill,
    type BetaDriveSkillsPageCursor as BetaDriveSkillsPageCursor,
    type DriveSkillListParams as DriveSkillListParams,
    type DriveSkillUploadParams as DriveSkillUploadParams,
  };
}
