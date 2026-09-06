import Anthropic from '@tetral-ai/sdk';

async function main() {
  const token = process.env['GITHUB_TOKEN'];
  const agentID = process.env['TETRAL_AGENT_ID'];
  const environmentID = process.env['TETRAL_ENVIRONMENT_ID'];
  const repositoryURL = process.env['GITHUB_REPOSITORY_URL'];
  if (!token || !agentID || !environmentID || !repositoryURL) {
    throw new Error('Set GITHUB_TOKEN, GITHUB_REPOSITORY_URL, TETRAL_AGENT_ID, and TETRAL_ENVIRONMENT_ID');
  }
  const client = new Anthropic({
    apiKey: process.env['TETRAL_API_KEY'],
    baseURL: process.env['TETRAL_BASE_URL'],
  });
  const session = await client.beta.sessions.create({
    agent: agentID,
    environment_id: environmentID,
    vault_ids: [],
    resources: [
      {
        type: 'github_repository',
        url: repositoryURL,
        authorization_token: token,
        // Omit this field to use the Engine's session-scoped default identity.
        git_identity: { name: 'Example Automation', email: 'bot@example.com' },
      },
    ],
  });
  for (const resource of session.resources) {
    if (resource.type === 'github_repository') console.log(resource.url, resource.git_identity);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
