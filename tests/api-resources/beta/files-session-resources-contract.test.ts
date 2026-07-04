import Anthropic, { toFile } from '@tetral-ai/sdk';
import type { ResourceAddParams } from '@tetral-ai/sdk/resources/beta/sessions/resources';
import { SDK_HELPER_SYMBOL } from '../../../src/internal/stainless-helper-header';

const FILE_METADATA_RESPONSE = {
  id: 'file_123',
  created_at: '2026-01-01T00:00:00Z',
  filename: 'data.csv',
  mime_type: 'text/csv',
  size_bytes: 11,
  type: 'file',
  downloadable: true,
};

const SESSION_FILE_RESOURCE_RESPONSE = {
  id: 'sesrsc_123',
  created_at: '2026-01-01T00:00:00Z',
  file_id: 'file_123',
  mount_path: '/uploads/data.csv',
  type: 'file',
  updated_at: '2026-01-01T00:00:00Z',
};

function jsonResponse(body: object, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'request-id': 'req_123' },
  });
}

function getHeader(init: RequestInit | undefined, name: string): string | null {
  if (!init?.headers) return null;
  if (init.headers instanceof Headers) return init.headers.get(name);
  if (Array.isArray(init.headers)) {
    const entry = init.headers.find(([k]) => k?.toLowerCase() === name.toLowerCase());
    return entry?.[1] ?? null;
  }
  return (init.headers as Record<string, string>)[name] ?? null;
}

function parseJSONBody(init: RequestInit | undefined): unknown {
  if (typeof init?.body !== 'string') {
    throw new Error(`Expected JSON string body, got ${typeof init?.body}`);
  }
  return JSON.parse(init.body);
}

describe('Tetral Files and Session Resources SDK contract', () => {
  test('files.upload sends multipart Uploadable input and helper telemetry headers', async () => {
    const captured: { url: string; helper: string | null; body: string }[] = [];
    const client = new Anthropic({
      apiKey: 'test-tetral-key',
      baseURL: 'https://api.tetral.example',
      fetch: async (url: any, init?: RequestInit) => {
        if (String(url).includes('/v1/files') && init?.body != null) {
          captured.push({
            url: String(url),
            helper: getHeader(init, 'x-stainless-helper'),
            body: await new Response(init.body as any).text(),
          });
        }
        return jsonResponse(FILE_METADATA_RESPONSE);
      },
    });

    const file = (await toFile(Buffer.from('a,b\n1,2\n'), 'data.csv', {
      type: 'text/csv',
    })) as File & { [SDK_HELPER_SYMBOL]: string };
    file[SDK_HELPER_SYMBOL] = 'mcpResourceToFile';

    await client.beta.files.upload({ file });

    expect(captured).toHaveLength(1);
    expect(captured[0]!.url).toBe('https://api.tetral.example/v1/files?beta=true');
    expect(captured[0]!.helper).toBe('mcpResourceToFile');
    expect(captured[0]!.body).toContain('Content-Disposition: form-data; name="file"; filename="data.csv"');
    expect(captured[0]!.body).toContain('a,b');
  });

  test('files.upload parses backend 413 invalid_request_error for upload size failures', async () => {
    const client = new Anthropic({
      apiKey: 'test-tetral-key',
      baseURL: 'https://api.tetral.example',
      fetch: async () =>
        jsonResponse(
          {
            type: 'error',
            error: { type: 'invalid_request_error', message: 'upload too large' },
          },
          413,
        ),
    });

    await expect(
      client.beta.files.upload({
        file: await toFile(Buffer.from('too large'), 'large.txt'),
      }),
    ).rejects.toMatchObject({
      status: 413,
      type: 'invalid_request_error',
    });
  });

  test('sessions.resources.add references an existing file_id and never uploads bytes', async () => {
    const captured: { url: string; body: unknown; contentType: string | null }[] = [];
    const client = new Anthropic({
      apiKey: 'test-tetral-key',
      baseURL: 'https://api.tetral.example',
      fetch: async (url: any, init?: RequestInit) => {
        captured.push({
          url: String(url),
          body: parseJSONBody(init),
          contentType: getHeader(init, 'content-type'),
        });
        return jsonResponse(SESSION_FILE_RESOURCE_RESPONSE);
      },
    });

    await client.beta.sessions.resources.add('sesn_123', {
      type: 'file',
      file_id: 'file_123',
      mount_path: '/uploads/data.csv',
    });

    expect(captured).toHaveLength(1);
    expect(captured[0]!.url).toBe('https://api.tetral.example/v1/sessions/sesn_123/resources?beta=true');
    expect(captured[0]!.contentType).toContain('application/json');
    expect(captured[0]!.body).toEqual({
      type: 'file',
      file_id: 'file_123',
      mount_path: '/uploads/data.csv',
    });
  });
});

const resourceAddCannotUploadBytes: ResourceAddParams = {
  type: 'file',
  file_id: 'file_123',
  // @ts-expect-error Session Resources add binds an existing file_id; it does not upload bytes.
  file: 'inline bytes',
};
void resourceAddCannotUploadBytes;
