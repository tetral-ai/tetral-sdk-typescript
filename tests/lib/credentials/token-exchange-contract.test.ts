// Layer 1: a handler inside the test answers every request, and each request and
// answer is checked against the SDK's copy of Engine's OpenAPI file. The identity
// token is a temporary file of the test's own.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  SESSION_ANSWER,
  errorResponse,
  getHeader,
  jsonResponse,
  parseJSONBody,
} from '../../api-resources/beta/tetral-contract-helpers';
import { contractClient } from '../../engine-contract/contract-fetch';

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tetral-sdk-token-exchange-'));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

test('an OIDC federation client exchanges its JWT as the copy declares and sends the token it is given', async () => {
  const tokenPath = path.join(dir, 'id-token');
  fs.writeFileSync(tokenPath, 'the-jwt');
  const exchanges: unknown[] = [];
  const authorizations: Array<string | null> = [];
  const client = contractClient({
    apiKey: null,
    // The SDK sends a credential to an https token endpoint only.
    baseURL: 'https://sdk.fixture',
    maxRetries: 0,
    config: {
      organization_id: 'org_123',
      workspace_id: 'wrkspc_123',
      authentication: {
        type: 'oidc_federation',
        federation_rule_id: 'fdrl_123',
        identity_token: { source: 'file', path: tokenPath },
      },
    },
    fetch: async (url, init) => {
      if (new URL(url).pathname === '/v1/oauth/token') {
        exchanges.push(parseJSONBody(init));
        return jsonResponse({ access_token: 'exchanged-token', token_type: 'Bearer', expires_in: 3600 });
      }
      authorizations.push(getHeader(init, 'authorization'));
      return jsonResponse(SESSION_ANSWER);
    },
  });

  await client.beta.sessions.retrieve('sesn_123');

  expect(exchanges).toEqual([
    {
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: 'the-jwt',
      federation_rule_id: 'fdrl_123',
      organization_id: 'org_123',
      workspace_id: 'wrkspc_123',
    },
  ]);
  expect(authorizations).toEqual(['Bearer exchanged-token']);
});

test('a write refused with 401 under a cached bearer is sent again once, with a new token and the same body', async () => {
  let tokens = 0;
  const sent: Array<{
    method: string | undefined;
    path: string;
    body: unknown;
    authorization: string | null;
  }> = [];
  const client = contractClient({
    apiKey: null,
    baseURL: 'https://sdk.fixture',
    maxRetries: 1,
    credentials: async () => {
      tokens++;
      return { token: `tok-${tokens}`, expiresAt: Math.floor(Date.now() / 1000) + 3600 };
    },
    fetch: async (url, init) => {
      const { pathname, search } = new URL(url);
      sent.push({
        method: init?.method,
        path: pathname + search,
        body: init?.body,
        authorization: getHeader(init, 'authorization'),
      });
      if (sent.length === 1) {
        return errorResponse(401, 'authentication_error', 'expired');
      }
      return jsonResponse(SESSION_ANSWER);
    },
  });

  await client.beta.sessions.update('sesn_123', { title: 'renamed' });

  const first = { method: 'POST', path: '/v1/sessions/sesn_123?beta=true', body: '{"title":"renamed"}' };
  expect(sent).toEqual([
    { ...first, authorization: 'Bearer tok-1' },
    { ...first, authorization: 'Bearer tok-2' },
  ]);
  expect(tokens).toBe(2);
});
