// File generated from our OpenAPI spec by Stainless. See CONTRIBUTING.md for details.

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

/** A Tetral Engine write cannot proceed because durable state has changed. */
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
  | OverloadedError;

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
  | 'billing_error';

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

/** A Tetral Engine route is recognized but is not implemented by this deployment. */
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

/** A Tetral Engine request exceeded the route's admitted body or item limit. */
export interface RequestTooLargeError {
  message: string;

  type: 'request_too_large';
}
