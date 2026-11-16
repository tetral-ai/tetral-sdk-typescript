// Layer 1: a handler inside the test answers every request, and each request and
// answer is checked against the SDK's copy of Engine's OpenAPI file.
import type Anthropic from '@tetral-ai/sdk';
import { jsonResponse } from './tetral-contract-helpers';
import { contractClient } from '../../engine-contract/contract-fetch';

// Engine writes `allowed_fallback_models` only when the request carries `beta=true`.
const MODEL = {
  id: 'openai/gpt-5.5',
  type: 'model',
  display_name: 'GPT-5.5',
  created_at: '2026-10-01T00:00:00Z',
  max_tokens: 128_000,
  max_input_tokens: 1_000_000,
  capabilities: null,
  lifecycle: 'active',
  deprecated_at: null,
  retires_at: null,
  line: null,
  allowed_fallback_models: null,
};

test.each([
  {
    call: 'list',
    answer: { data: [MODEL], has_more: false, first_id: MODEL.id, last_id: MODEL.id },
    read: async (client: Anthropic) => (await client.beta.models.list()).data[0],
  },
  {
    call: 'retrieve',
    answer: MODEL,
    read: (client: Anthropic) => client.beta.models.retrieve(MODEL.id),
  },
])('beta models $call asks with beta=true and reads allowed_fallback_models', async ({ answer, read }) => {
  const observed: URL[] = [];
  const client = contractClient({
    apiKey: 'fixture-key',
    baseURL: 'http://sdk.fixture',
    maxRetries: 0,
    fetch: async (input) => {
      observed.push(new URL(String(input)));
      return jsonResponse(answer);
    },
  });
  const model = await read(client);
  expect(observed.map((url) => url.searchParams.get('beta'))).toEqual(['true']);
  expect(model).toMatchObject({ id: MODEL.id, allowed_fallback_models: null });
});

// Engine's edge refuses an escaped slash, so a model ID's `/` is written as a path separator.
test.each([
  ['client.models.retrieve', (client: Anthropic) => client.models.retrieve(MODEL.id), ''],
  ['client.beta.models.retrieve', (client: Anthropic) => client.beta.models.retrieve(MODEL.id), '?beta=true'],
] as const)('%s writes the slash of a model ID as a path separator', async (_call, retrieve, search) => {
  const observed: URL[] = [];
  const client = contractClient({
    apiKey: 'fixture-key',
    baseURL: 'http://sdk.fixture',
    maxRetries: 0,
    fetch: async (input) => {
      observed.push(new URL(String(input)));
      return jsonResponse(MODEL);
    },
  });
  await retrieve(client);
  expect(observed.map((url) => url.pathname + url.search)).toEqual([`/v1/models/openai/gpt-5.5${search}`]);
});
