const assert = require('node:assert/strict');
const { test } = require('node:test');
const { completeRelease, verifyProvenance } = require('./release.cjs');

const release = { sha: 'a'.repeat(40), tag: 'v1.0.0-alpha.1', prerelease: true };

function registryAndGitHub() {
  const state = { package: false, tag: null, release: null, publishes: 0, tags: 0, verifications: 0 };
  const io = {
    tagCommit: async () => state.tag,
    packageExists: async () => state.package,
    publish: async () => {
      state.package = true;
      state.publishes++;
    },
    verifyPackage: async () => {
      assert.ok(state.package);
      state.verifications++;
    },
    createTag: async () => {
      state.tag = release.sha;
      state.tags++;
    },
    getRelease: async () => state.release,
    createRelease: async () => {
      state.release = { tag_name: release.tag, draft: false, prerelease: true };
    },
  };
  return { state, io };
}

test('a retry completes a failed GitHub release without republishing npm or recreating its tag', async () => {
  const { state, io } = registryAndGitHub();
  const createRelease = io.createRelease;
  io.createRelease = async () => {
    throw new Error('GitHub unavailable');
  };
  await assert.rejects(completeRelease(release, io), /GitHub unavailable/);
  assert.equal(state.package, true);
  assert.equal(state.tag, release.sha);
  assert.equal(state.release, null);
  io.createRelease = createRelease;
  await completeRelease(release, io);
  await completeRelease(release, io);
  assert.equal(state.publishes, 1);
  assert.equal(state.tags, 1);
  assert.equal(state.verifications, 3);
  assert.equal(state.release.tag_name, release.tag);
});

test('an npm publish failure creates neither a tag nor a GitHub release', async () => {
  const { state, io } = registryAndGitHub();
  io.publish = async () => {
    throw new Error('npm unavailable');
  };
  await assert.rejects(completeRelease(release, io), /npm unavailable/);
  assert.equal(state.tag, null);
  assert.equal(state.release, null);
});

test('an existing tag for another commit stops before publishing npm', async () => {
  const { state, io } = registryAndGitHub();
  state.tag = 'b'.repeat(40);
  await assert.rejects(completeRelease(release, io), /tag points to a different commit/);
  assert.equal(state.publishes, 0);
  assert.equal(state.release, null);
});

test('a package that fails provenance or installation verification does not get release markers', async () => {
  const { state, io } = registryAndGitHub();
  state.package = true;
  io.verifyPackage = async () => {
    throw new Error('Published package verification failed');
  };
  await assert.rejects(completeRelease(release, io), /verification failed/);
  assert.equal(state.publishes, 0);
  assert.equal(state.tag, null);
  assert.equal(state.release, null);
});

test('npm provenance binds the package digest and publishing repository to the exact source commit', () => {
  const metadata = { dist: { integrity: `sha512-${Buffer.from('digest').toString('base64')}` } };
  const statement = {
    subject: [{ digest: { sha512: Buffer.from('digest').toString('hex') } }],
    predicate: {
      buildDefinition: {
        externalParameters: {
          workflow: {
            repository: 'https://github.com/tetral-ai/tetral-sdk-typescript',
            path: '.github/workflows/publish.yml',
          },
        },
        resolvedDependencies: [
          {
            uri: 'git+https://github.com/tetral-ai/tetral-sdk-typescript@refs/heads/main',
            digest: { gitCommit: release.sha },
          },
        ],
      },
    },
  };
  const attestations = () => ({
    attestations: [
      {
        predicateType: 'https://slsa.dev/provenance/v1',
        bundle: { dsseEnvelope: { payload: Buffer.from(JSON.stringify(statement)).toString('base64') } },
      },
    ],
  });
  verifyProvenance(metadata, attestations(), release.sha);
  assert.throws(() => verifyProvenance(metadata, attestations(), 'b'.repeat(40)), /different commit/);
  statement.subject[0].digest.sha512 = '00';
  assert.throws(() => verifyProvenance(metadata, attestations(), release.sha), /digest mismatch/);
});
