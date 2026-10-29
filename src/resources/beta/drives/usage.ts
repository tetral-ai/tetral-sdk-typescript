import { APIResource } from '../../../core/resource';
import { APIPromise } from '../../../core/api-promise';
import { buildHeaders } from '../../../internal/headers';
import { RequestOptions } from '../../../internal/request-options';

export class DriveUsage extends APIResource {
  /**
   * Get the workspace's drive usage and limits.
   *
   * @example
   * ```ts
   * const usage = await client.beta.drives.usage.retrieve();
   * ```
   */
  retrieve(options?: RequestOptions): APIPromise<BetaDriveUsage> {
    return this._client.get('/v1/drives/usage?beta=true', {
      ...options,
      headers: buildHeaders([{ 'anthropic-beta': 'managed-agents-2026-04-01' }, options?.headers]),
    });
  }
}

/**
 * Current files over all the workspace's drives, and the workspace limits.
 */
export interface BetaDriveUsage {
  bytes: number;

  files: number;

  max_bytes: number;

  max_files: number;
}

export declare namespace DriveUsage {
  export { type BetaDriveUsage as BetaDriveUsage };
}
