const requiredLiveEnvironment = ['TETRAL_BASE_URL', 'TETRAL_API_KEY'] as const;

export interface LiveCompatibilityEnvironment {
  apiKey: string;
  baseURL: string;
}

export function readLiveCompatibilityEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
): LiveCompatibilityEnvironment {
  const missing = requiredLiveEnvironment.filter((name) => !environment[name]?.trim());
  if (missing.length > 0) {
    throw new Error(
      `Live compatibility launch gate requires ${missing.join(
        ', ',
      )}; ordinary unit tests do not launch a live Engine`,
    );
  }

  return {
    apiKey: environment['TETRAL_API_KEY']!,
    baseURL: environment['TETRAL_BASE_URL']!.replace(/\/$/, ''),
  };
}

export async function assertLiveEngineReachable(
  liveEnvironment: LiveCompatibilityEnvironment,
  fetchImplementation: typeof fetch = fetch,
): Promise<void> {
  const healthURL = `${liveEnvironment.baseURL}/health`;
  let response: Response;
  try {
    response = await fetchImplementation(healthURL, { signal: AbortSignal.timeout(5_000) });
  } catch {
    throw new Error(`Live compatibility launch gate could not reach ${healthURL}`);
  }
  if (!response.ok) {
    throw new Error(`Live compatibility launch gate received HTTP ${response.status} from ${healthURL}`);
  }
}
