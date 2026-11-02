import { APIResource } from '../../../core/resource';
import * as EnvironmentsAPI from '../environments/environments';
import * as SessionsAPI from './sessions';
import { APIPromise } from '../../../core/api-promise';
import { buildHeaders } from '../../../internal/headers';
import { RequestOptions } from '../../../internal/request-options';
import { path } from '../../../internal/utils/path';

export class Computers extends APIResource {
  /**
   * Add Session Computer. The Session must be idle. Replaying the same
   * `idempotencyKey` returns the same computer and adds no second one.
   *
   * @example
   * ```ts
   * const computer = await client.beta.sessions.computers.create(
   *   'sesn_011CZkZAtmR3yMPDzynEDxu7',
   *   { environment_id: 'env_linux_py' },
   *   { idempotencyKey: 'add-linux-computer-1' },
   * );
   * ```
   */
  create(
    sessionID: string,
    entry: BetaCloudComputerParams | BetaUserComputerParams,
    options: ComputerCreateOptions,
  ): APIPromise<BetaComputer> {
    return this._client.post(path`/v1/sessions/${sessionID}/computers?beta=true`, {
      body: entry,
      ...options,
      headers: buildHeaders([
        { 'anthropic-beta': 'managed-agents-2026-04-01', 'Idempotency-Key': options.idempotencyKey },
        options.headers,
      ]),
    });
  }

  /**
   * Get Session Computer, including a removed computer while its closure is
   * outstanding or `unknown`.
   *
   * @example
   * ```ts
   * const computer = await client.beta.sessions.computers.retrieve(
   *   'sesn_011CZkZAtmR3yMPDzynEDxu7',
   *   'comp_example',
   * );
   * ```
   */
  retrieve(sessionID: string, computerID: string, options?: RequestOptions): APIPromise<BetaComputer> {
    return this._client.get(path`/v1/sessions/${sessionID}/computers/${computerID}?beta=true`, {
      ...options,
      headers: buildHeaders([{ 'anthropic-beta': 'managed-agents-2026-04-01' }, options?.headers]),
    });
  }

  /**
   * Remove Session Computer. The Session must be idle. Resolves to the computer
   * while its closure is outstanding (`202`) and to `null` once it is closed or
   * when nothing ever ran on it (`204`).
   *
   * @example
   * ```ts
   * const computer = await client.beta.sessions.computers.delete(
   *   'sesn_011CZkZAtmR3yMPDzynEDxu7',
   *   'comp_example',
   * );
   * ```
   */
  delete(sessionID: string, computerID: string, options?: RequestOptions): APIPromise<BetaComputer | null> {
    return this._client.delete(path`/v1/sessions/${sessionID}/computers/${computerID}?beta=true`, {
      ...options,
      headers: buildHeaders([{ 'anthropic-beta': 'managed-agents-2026-04-01' }, options?.headers]),
    });
  }
}

export interface ComputerCreateOptions extends RequestOptions {
  /**
   * Sent as the `Idempotency-Key` header; required by Engine.
   */
  idempotencyKey: string;
}

/**
 * A cloud computer. Engine gets its machine from a Controller through the
 * Environment, and takes the Environment's networking when the computer is
 * added.
 */
export interface BetaCloudComputerParams {
  environment_id: string;

  /**
   * Absolute path where commands start. Defaults to `/workspace`; the CLI
   * creates it when it is missing.
   */
  working_directory?: string;

  repositories?: Array<BetaComputerRepositoryParams>;

  drive_exclude?: Array<BetaDriveExclude>;

  instance_id?: never;

  networking?: never;
}

/**
 * A user computer: a registered machine of kind `user` in the Session's
 * workspace. It need not be online.
 */
export interface BetaUserComputerParams {
  instance_id: string;

  /**
   * Absolute path where commands start. The app makes sure the directory exists
   * before it adds the computer.
   */
  working_directory: string;

  /**
   * `blocked` (the default) gives commands no network; `unrestricted` gives them
   * direct network access.
   */
  networking?: { type: 'blocked' } | { type: 'unrestricted' };

  drive_exclude?: Array<BetaDriveExclude>;

  environment_id?: never;

  repositories?: never;
}

/**
 * A Git repository cloned onto a cloud computer. The token stays in Engine; the
 * machine pushes and pulls through Engine's git proxy.
 */
export interface BetaComputerRepositoryParams {
  url: string;

  authorization_token: string;

  checkout?: SessionsAPI.BetaManagedAgentsBranchCheckout | SessionsAPI.BetaManagedAgentsCommitCheckout | null;

  /**
   * Absolute clone path. Defaults to `<working_directory>/<repository name>`.
   */
  mount_path?: string | null;

  git_identity?: SessionsAPI.TetralGitIdentity;
}

/**
 * Paths of a bound drive that do not exist on this computer. Each path may end
 * with `/` and covers everything below it.
 */
export interface BetaDriveExclude {
  drive_id: string;

  paths: Array<string>;
}

/**
 * A computer of a Session.
 */
export interface BetaComputer {
  id: string;

  kind: 'cloud' | 'user';

  /**
   * Set on a cloud computer; `null` on a user computer.
   */
  environment_id: string | null;

  /**
   * Set on a user computer; `null` on a cloud computer.
   */
  instance_id: string | null;

  /**
   * The instance behind the computer now. On a cloud computer, `null` until a
   * machine first reports ready.
   */
  current_instance_id: string | null;

  working_directory: string;

  /**
   * The canonical working directory the machine confirmed at its latest
   * successful preparation; `null` before.
   */
  cwd: string | null;

  /**
   * On a user computer, as requested; on a cloud computer, the Environment's
   * networking when the computer was added.
   */
  networking:
    | { type: 'blocked' }
    | { type: 'unrestricted' }
    | EnvironmentsAPI.BetaEnvironmentNetworking
    | EnvironmentsAPI.BetaLimitedNetwork;

  repositories: Array<BetaComputerRepository>;

  drive_exclude: Array<BetaDriveExclude>;

  association_state: 'attached' | 'detached';

  /**
   * - `waiting` - No preparation issued on the current connection.
   * - `preparing` - Preparation issued, not yet reported.
   * - `ready` - Prepared; calls dispatch.
   * - `failed` - The latest preparation failed; see `error`.
   * - `closing` - Removed; the machine has not yet reported its close.
   * - `closed` - Removed and closed on the machine.
   * - `unknown` - Removed; the close outcome was lost with the connection.
   */
  execution_state: 'waiting' | 'preparing' | 'ready' | 'failed' | 'closing' | 'closed' | 'unknown';

  connection_id: string | null;

  binding_id: string | null;

  /**
   * The latest failed preparation, or `null`.
   */
  error: { code: string; message: string } | null;
}

/**
 * A repository of a cloud computer. The token is never returned.
 */
export interface BetaComputerRepository {
  /**
   * The repository's resource ID, used to rotate its token.
   */
  id: string;

  url: string;

  checkout: SessionsAPI.BetaManagedAgentsBranchCheckout | SessionsAPI.BetaManagedAgentsCommitCheckout | null;

  mount_path: string | null;

  /** Declared Git authorship, or null to use the Engine default. */
  git_identity: SessionsAPI.TetralGitIdentity | null;

  /**
   * The resolved clone path.
   */
  path: string;
}

export declare namespace Computers {
  export {
    type BetaCloudComputerParams as BetaCloudComputerParams,
    type BetaComputer as BetaComputer,
    type BetaComputerRepository as BetaComputerRepository,
    type BetaComputerRepositoryParams as BetaComputerRepositoryParams,
    type BetaDriveExclude as BetaDriveExclude,
    type BetaUserComputerParams as BetaUserComputerParams,
    type ComputerCreateOptions as ComputerCreateOptions,
  };
}
