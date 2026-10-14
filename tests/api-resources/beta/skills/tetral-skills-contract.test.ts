import Anthropic, { toFile } from '@tetral-ai/sdk';
import type { AgentCreateParams } from '@tetral-ai/sdk/resources/beta/agents';
import type { BetaSkill } from '@tetral-ai/sdk/resources/beta/skills/skills';
import type { BetaSkillVersion } from '@tetral-ai/sdk/resources/beta/skills/versions';
import { jsonResponse } from '../tetral-contract-helpers';

const SKILL_RESPONSE: BetaSkill = {
  id: 'skill_123',
  created_at: '2026-01-01T00:00:00Z',
  display_name: 'Greeting',
  latest_version_id: 'skver_123',
  source: { type: 'custom' },
  type: 'skill',
  updated_at: '2026-01-01T00:00:00Z',
};

const VERSION_RESPONSE: BetaSkillVersion = {
  id: 'skver_123',
  created_at: '2026-01-01T00:00:00Z',
  description: 'Say hello clearly.',
  name: 'Greeting',
  skill_id: 'skill_123',
  type: 'skill_version',
};

async function multipartBody(init: RequestInit | undefined): Promise<string> {
  if (init?.body == null) {
    throw new Error('Expected multipart body');
  }
  return new Response(init.body as any).text();
}

describe('Tetral Skills SDK contract', () => {
  test('skills.create returns parent metadata with latest_version_id after initial package upload', async () => {
    const captured: { url: string; body: string }[] = [];
    const client = new Anthropic({
      apiKey: 'test-tetral-key',
      baseURL: 'https://api.tetral.example',
      fetch: async (url: any, init?: RequestInit) => {
        if (String(url).includes('/v1/skills') && init?.body != null) {
          captured.push({ url: String(url), body: await multipartBody(init) });
        }
        return jsonResponse(SKILL_RESPONSE);
      },
    });

    const skill = await client.beta.skills.create({
      display_name: 'Greeting',
      files: [await toFile(Buffer.from('# Greeting\n'), 'greeting/SKILL.md')],
    });

    expect(skill.latest_version_id).toBe('skver_123');
    expect(captured).toHaveLength(1);
    expect(captured[0]!.url).toBe('https://api.tetral.example/v1/skills?beta=true');
    expect(captured[0]!.body).toContain(
      'Content-Disposition: form-data; name="files[]"; filename="greeting/SKILL.md"',
    );
    expect(captured[0]!.body).toContain('# Greeting');
    expect(captured[0]!.body).toContain('name="display_name"');
  });

  test('skills.versions.create uploads an immutable package version with directory-qualified filenames', async () => {
    const captured: { url: string; body: string }[] = [];
    const client = new Anthropic({
      apiKey: 'test-tetral-key',
      baseURL: 'https://api.tetral.example',
      fetch: async (url: any, init?: RequestInit) => {
        if (String(url).includes('/v1/skills/skill_123/versions') && init?.body != null) {
          captured.push({ url: String(url), body: await multipartBody(init) });
        }
        return jsonResponse(VERSION_RESPONSE);
      },
    });

    const version = await client.beta.skills.versions.create('skill_123', {
      files: [await toFile(Buffer.from('# Greeting\n'), 'greeting/SKILL.md')],
    });

    expect(version).toMatchObject({
      id: 'skver_123',
      skill_id: 'skill_123',
      type: 'skill_version',
    });
    expect(captured).toHaveLength(1);
    expect(captured[0]!.url).toBe('https://api.tetral.example/v1/skills/skill_123/versions?beta=true');
    expect(captured[0]!.body).toContain(
      'Content-Disposition: form-data; name="files[]"; filename="greeting/SKILL.md"',
    );
  });

  test('skills.versions.create parses backend 413 invalid_request_error for oversized packages', async () => {
    const client = new Anthropic({
      apiKey: 'test-tetral-key',
      baseURL: 'https://api.tetral.example',
      fetch: async () =>
        jsonResponse(
          {
            type: 'error',
            error: { type: 'invalid_request_error', message: 'skill package too large' },
          },
          413,
        ),
    });

    await expect(
      client.beta.skills.versions.create('skill_123', {
        files: [await toFile(Buffer.from('too large'), 'greeting/SKILL.md')],
      }),
    ).rejects.toMatchObject({
      status: 413,
      type: 'invalid_request_error',
    });
  });

  test('type smoke keeps Skills as Agent configuration instead of a tool callback surface', () => {
    // Workspace `custom` skill references are the only skill shape presented
    // as working Tetral configuration. The upstream `anthropic` catalog
    // variant stays assignable purely as a retained-unsupported compatibility
    // shape that Tetral backend admission rejects.
    const agentWithSkills: AgentCreateParams = {
      name: 'skill agent',
      model: 'anthropic/claude-opus-4-8',
      skills: [{ type: 'custom', skill_id: 'skill_123', version: 'skver_123' }],
      tools: [{ type: 'tetral_agent_toolset', family: 'claude' }],
    };
    const retainedUnsupportedCatalogReference: NonNullable<AgentCreateParams['skills']>[number] = {
      type: 'anthropic',
      skill_id: 'xlsx',
    };
    expect(retainedUnsupportedCatalogReference.type).toBe('anthropic');
    const parentProjection: Pick<BetaSkill, 'id' | 'latest_version_id' | 'type'> = {
      id: 'skill_123',
      latest_version_id: 'skver_123',
      type: 'skill',
    };
    const immutableVersionProjection: Pick<BetaSkillVersion, 'id' | 'skill_id'> = {
      id: 'skver_123',
      skill_id: 'skill_123',
    };

    expect(agentWithSkills.skills).toHaveLength(1);
    expect(agentWithSkills.tools?.[0]?.type).toBe('tetral_agent_toolset');
    expect(parentProjection.latest_version_id).toBe(immutableVersionProjection.id);
  });
});

const skillCannotBeModelFacingTool: AgentCreateParams = {
  name: 'invalid skill tool',
  model: 'anthropic/claude-opus-4-8',
  tools: [
    // @ts-expect-error Skills are Agent skill refs, not entries in the tools array.
    { type: 'skill', skill_id: 'skill_123' },
  ],
};
void skillCannotBeModelFacingTool;
