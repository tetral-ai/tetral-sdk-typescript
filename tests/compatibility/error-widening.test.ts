import type {
  ConflictError,
  ErrorObject,
  ErrorType,
  NotImplementedError,
  RequestTooLargeError,
} from '@tetral-ai/sdk/resources/shared';

function acceptsErrorType(_value: ErrorType): void {}
function acceptsErrorObject(_value: ErrorObject): void {}

describe('Tetral Engine shared error widening', () => {
  test('includes every Engine-only envelope type and body', () => {
    const conflict: ConflictError = { type: 'conflict_error', message: 'conflict' };
    const requestTooLarge: RequestTooLargeError = {
      type: 'request_too_large',
      message: 'request too large',
    };
    const notImplemented: NotImplementedError = {
      type: 'not_implemented',
      message: 'not implemented',
    };

    acceptsErrorType(conflict.type);
    acceptsErrorType(requestTooLarge.type);
    acceptsErrorType(notImplemented.type);
    acceptsErrorObject(conflict);
    acceptsErrorObject(requestTooLarge);
    acceptsErrorObject(notImplemented);

    expect([conflict.type, requestTooLarge.type, notImplemented.type]).toEqual([
      'conflict_error',
      'request_too_large',
      'not_implemented',
    ]);
  });
});
