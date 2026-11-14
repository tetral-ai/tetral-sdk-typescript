export interface APIErrorObject {
  message: string;

  type: 'api_error';
}

export interface AuthenticationError {
  message: string;

  type: 'authentication_error';
}

export interface BillingError {
  message: string;

  type: 'billing_error';
}

export interface ConflictError {
  message: string;

  type: 'conflict_error';
}

export type ErrorObject =
  | InvalidRequestError
  | AuthenticationError
  | BillingError
  | ConflictError
  | PermissionError
  | NotFoundError
  | RequestTooLargeError
  | RateLimitError
  | GatewayTimeoutError
  | APIErrorObject
  | NotImplementedError
  | OverloadedError
  | TetralEngineError;

export interface ErrorResponse {
  error: ErrorObject;

  request_id: string | null;

  type: 'error';
}

export type ErrorType =
  | 'invalid_request_error'
  | 'authentication_error'
  | 'permission_error'
  | 'not_found_error'
  | 'conflict_error'
  | 'request_too_large'
  | 'not_implemented'
  | 'rate_limit_error'
  | 'timeout_error'
  | 'overloaded_error'
  | 'api_error'
  | 'billing_error'
  | TetralEngineError['type'];

export interface GatewayTimeoutError {
  message: string;

  type: 'timeout_error';
}

export interface InvalidRequestError {
  message: string;

  type: 'invalid_request_error';
}

export interface NotFoundError {
  message: string;

  type: 'not_found_error';
}

export interface NotImplementedError {
  message: string;

  type: 'not_implemented';
}

export interface OverloadedError {
  message: string;

  type: 'overloaded_error';
}

export interface PermissionError {
  message: string;

  type: 'permission_error';
}

export interface RateLimitError {
  message: string;

  type: 'rate_limit_error';
}

export interface RequestTooLargeError {
  message: string;

  type: 'request_too_large';
}

/**
 * An error whose type only Tetral Engine answers with.
 */
export interface TetralEngineError {
  message: string;

  type:
    | 'idempotency_conflict_error'
    | 'credential_limit_error'
    | 'instance_offline_error'
    | 'instance_unavailable_error'
    | 'instance_not_attachable_error'
    | 'computer_already_attached_error'
    | 'request_already_claimed_error'
    | 'request_not_pending_error'
    | 'request_not_claimed_error'
    | 'drive_cursor_expired_error';
}
