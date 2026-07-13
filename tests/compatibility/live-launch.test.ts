import { assertLiveEngineReachable, readLiveCompatibilityEnvironment } from './live-launch';

describe('live Engine compatibility launch gate', () => {
  test('fails explicitly when required environment is absent', () => {
    expect(() => readLiveCompatibilityEnvironment({})).toThrow(
      'Live compatibility launch gate requires TETRAL_BASE_URL, TETRAL_API_KEY',
    );
  });

  test('normalizes the base URL and preserves the API key', () => {
    expect(
      readLiveCompatibilityEnvironment({
        TETRAL_BASE_URL: 'http://127.0.0.1:8080/',
        TETRAL_API_KEY: 'test-key',
      }),
    ).toEqual({ baseURL: 'http://127.0.0.1:8080', apiKey: 'test-key' });
  });

  test('fails before Jest launch when Engine health is not reachable', async () => {
    const fetchImplementation = jest.fn(async () => {
      throw new Error('connection refused');
    });
    await expect(
      assertLiveEngineReachable(
        { baseURL: 'http://127.0.0.1:8080', apiKey: 'test-key' },
        fetchImplementation,
      ),
    ).rejects.toThrow('could not reach http://127.0.0.1:8080/health');
  });
});
