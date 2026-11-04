import { APIResource } from '../../../core/resource';
import { APIPromise } from '../../../core/api-promise';
import { buildHeaders } from '../../../internal/headers';
import { RequestOptions } from '../../../internal/request-options';
import { path } from '../../../internal/utils/path';

/**
 * The drives a Session binds. Every change needs an idle Session; the Session's
 * machines apply it before their next command.
 */
export class SessionDrives extends APIResource {
  /**
   * Bind a drive to the Session.
   *
   * @example
   * ```ts
   * const binding = await client.beta.sessions.drives.create(
   *   'sesn_011CZkZAtmR3yMPDzynEDxu7',
   *   { drive_id: 'drive_team_ai', access: 'read_write' },
   * );
   * ```
   */
  create(
    sessionID: string,
    body: BetaSessionDriveParams,
    options?: RequestOptions,
  ): APIPromise<BetaSessionDrive> {
    return this._client.post(path`/v1/sessions/${sessionID}/drives?beta=true`, {
      body,
      ...options,
      headers: buildHeaders([{ 'anthropic-beta': 'managed-agents-2026-04-01' }, options?.headers]),
    });
  }

  /**
   * Change a binding's access.
   *
   * @example
   * ```ts
   * const binding = await client.beta.sessions.drives.update(
   *   'sesn_011CZkZAtmR3yMPDzynEDxu7',
   *   'drive_team_ai',
   *   { access: 'read_only' },
   * );
   * ```
   */
  update(
    sessionID: string,
    driveID: string,
    body: SessionDriveUpdateParams,
    options?: RequestOptions,
  ): APIPromise<BetaSessionDrive> {
    return this._client.post(path`/v1/sessions/${sessionID}/drives/${driveID}?beta=true`, {
      body,
      ...options,
      headers: buildHeaders([{ 'anthropic-beta': 'managed-agents-2026-04-01' }, options?.headers]),
    });
  }

  /**
   * Remove a binding. The Session's last drive can be removed.
   *
   * @example
   * ```ts
   * await client.beta.sessions.drives.delete(
   *   'sesn_011CZkZAtmR3yMPDzynEDxu7',
   *   'drive_team_ai',
   * );
   * ```
   */
  delete(sessionID: string, driveID: string, options?: RequestOptions): APIPromise<void> {
    return this._client.delete(path`/v1/sessions/${sessionID}/drives/${driveID}?beta=true`, {
      ...options,
      headers: buildHeaders([{ 'anthropic-beta': 'managed-agents-2026-04-01' }, options?.headers]),
    });
  }
}

export type BetaSessionDriveAccess = 'read_only' | 'read_write';

/**
 * A drive the Session binds, as listed in the Session's `drives`.
 */
export interface BetaSessionDrive {
  drive_id: string;

  access: BetaSessionDriveAccess;
}

export interface BetaSessionDriveParams {
  drive_id: string;

  access: BetaSessionDriveAccess;
}

export interface SessionDriveUpdateParams {
  access: BetaSessionDriveAccess;
}

export declare namespace SessionDrives {
  export {
    type BetaSessionDrive as BetaSessionDrive,
    type BetaSessionDriveAccess as BetaSessionDriveAccess,
    type BetaSessionDriveParams as BetaSessionDriveParams,
    type SessionDriveUpdateParams as SessionDriveUpdateParams,
  };
}
