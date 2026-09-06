const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const repository = 'tetral-ai/tetral-sdk-typescript';
const packageName = '@tetral-ai/sdk';
const registry = 'https://registry.npmjs.org';

// External npm/GitHub operations are supplied at this boundary so recovery can
// be exercised without publishing test versions or creating remote tags.
async function completeRelease(release, io) {
  const tagCommit = await io.tagCommit();
  if (tagCommit && tagCommit !== release.sha) throw new Error('Git tag points to a different commit');

  if (!(await io.packageExists())) await io.publish();
  await io.verifyPackage();

  if (!tagCommit) await io.createTag();
  const existing = await io.getRelease();
  if (existing) {
    assert.equal(existing.tag_name, release.tag);
    assert.equal(existing.draft, false, 'Existing release is still a draft');
    assert.equal(existing.prerelease, release.prerelease, 'Existing release has a different release channel');
  } else {
    await io.createRelease();
  }
  assert.equal(await io.tagCommit(), release.sha, 'Final tag commit mismatch');
  assert.ok(await io.getRelease(), 'GitHub Release was not created');
}

function verifyProvenance(metadata, attestations, sha) {
  const integrity = metadata.dist.integrity;
  assert.ok(integrity.startsWith('sha512-'), 'Expected npm SHA-512 integrity');
  const digest = Buffer.from(integrity.slice(7), 'base64').toString('hex');
  const provenance = attestations.attestations.find(
    (a) => a.predicateType === 'https://slsa.dev/provenance/v1',
  );
  assert.ok(provenance, 'Published package has no source provenance; refusing to guess its source commit');
  const statement = JSON.parse(Buffer.from(provenance.bundle.dsseEnvelope.payload, 'base64').toString());
  assert.ok(
    statement.subject.some((s) => s.digest.sha512 === digest),
    'Provenance package digest mismatch',
  );
  const build = statement.predicate.buildDefinition;
  assert.equal(build.externalParameters.workflow.repository, `https://github.com/${repository}`);
  assert.equal(build.externalParameters.workflow.path, '.github/workflows/publish.yml');
  assert.ok(
    build.resolvedDependencies.some(
      (d) => d.uri.startsWith(`git+https://github.com/${repository}@`) && d.digest.gitCommit === sha,
    ),
    'This npm version was published from a different commit; rerun the original release run',
  );
}

async function main() {
  const root = path.resolve(__dirname, '..');
  const run = (command, args, cwd = root) =>
    execFileSync(command, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const gh = (endpoint, body) => {
    try {
      const result = execFileSync(
        'gh',
        ['api', `repos/${repository}/${endpoint}`, ...(body ? ['--method', 'POST', '--input', '-'] : [])],
        { cwd: root, input: body ? JSON.stringify(body) : undefined, encoding: 'utf8' },
      );
      return JSON.parse(result);
    } catch (error) {
      if (!body && String(error.stderr).includes('(HTTP 404)')) return null;
      throw error;
    }
  };
  const readJSON = async (url, allowMissing = false) => {
    const response = await fetch(url);
    if (allowMissing && response.status === 404) return null;
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
    return response.json();
  };
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.equal(pkg.name, packageName);
  assert.match(pkg.version, /^\d+\.\d+\.\d+(?:-[a-zA-Z][a-zA-Z0-9.-]*)?$/);
  const sha = run('git', ['rev-parse', 'HEAD']);
  if (process.env.GITHUB_SHA) assert.equal(sha, process.env.GITHUB_SHA);
  if (process.env.GITHUB_REPOSITORY) assert.equal(process.env.GITHUB_REPOSITORY, repository);
  run('git', ['fetch', 'origin', 'main']);
  run('git', ['merge-base', '--is-ancestor', sha, 'origin/main']);
  assert.equal(
    run('git', ['status', '--porcelain', '--untracked-files=no']),
    '',
    'Tracked files must be clean',
  );
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(root, '.release-please-manifest.json')))['.'],
    pkg.version,
  );
  assert.ok(fs.readFileSync(path.join(root, 'src/version.ts'), 'utf8').includes(`'${pkg.version}'`));
  const ci = gh(
    `actions/workflows/ci.yml/runs?head_sha=${sha}&branch=main&event=push&status=success&per_page=1`,
  );
  assert.ok(
    ci.workflow_runs.some((r) => r.head_sha === sha && r.conclusion === 'success'),
    'Wait for main CI to pass',
  );
  const section = fs
    .readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8')
    .split(/^## /m)
    .find((s) => s.startsWith(`${pkg.version} (`));
  assert.ok(section, 'Add this version to CHANGELOG.md before publishing');
  const release = { sha, tag: `v${pkg.version}`, prerelease: pkg.version.includes('-') };
  const packageURL = `${registry}/${encodeURIComponent(packageName)}/${pkg.version}`;
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'tetral-release-'));
  try {
    await completeRelease(release, {
      tagCommit: async () => {
        const ref = gh(`git/ref/tags/${release.tag}`);
        if (!ref) return null;
        if (ref.object.type === 'commit') return ref.object.sha;
        const tag = gh(`git/tags/${ref.object.sha}`);
        assert.equal(tag.object.type, 'commit');
        return tag.object.sha;
      },
      packageExists: () => readJSON(packageURL, true),
      publish: async () => {
        console.log(`Publishing ${packageName}@${pkg.version} from ${sha}`);
        execFileSync('./bin/publish-npm', [], { cwd: root, stdio: 'inherit' });
      },
      verifyPackage: async () => {
        let metadata;
        for (let attempt = 0; attempt < 6; attempt++) {
          metadata = await readJSON(packageURL, true);
          if (metadata) break;
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
        assert.ok(metadata, 'Published version is not visible yet; rerun this workflow');
        assert.equal(metadata.name, packageName);
        assert.equal(metadata.version, pkg.version);
        const attestations = await readJSON(
          `${registry}/-/npm/v1/attestations/${encodeURIComponent(packageName)}@${pkg.version}`,
        );
        verifyProvenance(metadata, attestations, sha);
        fs.writeFileSync(path.join(temp, 'package.json'), '{"name":"sdk-release-check","private":true}');
        run(
          'npm',
          [
            'install',
            '--registry',
            registry,
            '--ignore-scripts',
            '--no-audit',
            '--no-fund',
            '--save-exact',
            `${packageName}@${pkg.version}`,
          ],
          temp,
        );
        // Verify signatures/attestations as well as interpreting their source fields above.
        console.log(run('npm', ['audit', 'signatures', '--registry', registry], temp));
        run(
          'node',
          [
            '-e',
            `const a = require('node:assert/strict'); a.equal(require('${packageName}/version').VERSION, '${pkg.version}'); a.equal(typeof require('${packageName}'), 'function');`,
          ],
          temp,
        );
        run(
          'node',
          [
            '--input-type=module',
            '-e',
            `import SDK from '${packageName}'; if (typeof SDK !== 'function') throw new Error('ESM export missing');`,
          ],
          temp,
        );
        fs.writeFileSync(
          path.join(temp, 'check.ts'),
          `import SDK from '${packageName}'; new SDK({apiKey: 'release-check'});\n`,
        );
        run(
          path.join(root, 'node_modules/.bin/tsc'),
          [
            '--noEmit',
            '--strict',
            '--skipLibCheck',
            '--target',
            'ES2022',
            '--module',
            'NodeNext',
            '--moduleResolution',
            'NodeNext',
            'check.ts',
          ],
          temp,
        );
        console.log(`Verified npm package, provenance, CJS/ESM imports and public types for ${release.tag}`);
      },
      createTag: async () => {
        const tag = gh('git/tags', {
          tag: release.tag,
          message: `Release ${packageName}@${pkg.version}\nSource: ${sha}`,
          object: sha,
          type: 'commit',
          tagger: {
            name: 'github-actions[bot]',
            email: '41898282+github-actions[bot]@users.noreply.github.com',
          },
        });
        gh('git/refs', { ref: `refs/tags/${release.tag}`, sha: tag.sha });
      },
      getRelease: async () => gh(`releases/tags/${release.tag}`),
      createRelease: async () =>
        gh('releases', {
          tag_name: release.tag,
          name: release.tag,
          body: `## ${section.trim()}\n\nSource commit: ${sha}\n\nnpm: https://www.npmjs.com/package/${packageName}/v/${
            pkg.version
          }\n\nInstall: \`npm install ${packageName}@${pkg.version}\``,
          draft: false,
          prerelease: release.prerelease,
          make_latest: release.prerelease ? 'false' : 'true',
        }),
    });
    const summary = `Released ${packageName}@${pkg.version}\nSource: ${sha}\nhttps://github.com/${repository}/releases/tag/${release.tag}\n`;
    console.log(summary);
    if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}

module.exports = { completeRelease, verifyProvenance };
if (require.main === module)
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
