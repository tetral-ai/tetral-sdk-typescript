# Releasing

`@tetral-ai/sdk` is published from the repository root by `bin/publish-npm`.
Prerelease versions publish under their prerelease identifier (`alpha`, `beta`,
or `rc`); stable versions publish under `latest`.

For a package's first-ever publication, npm also initializes `latest` to the
only available version even when that version is published with `--tag alpha`.
This bootstrap alias remains until the first stable release moves `latest`;
prerelease publishing must not move it after that.

## First publication

The npm package must exist before npm can attach a trusted publisher. An owner
of the `tetral-ai` npm organization performs the one-time bootstrap from a
clean, reviewed `main` checkout:

```sh
npm login --registry=https://registry.npmjs.org
./bin/publish-npm
```

The owner must use two-factor authentication. Do not create or store a publish
token for this bootstrap.

## Trusted publishing

After the first publication, configure the package's npm trusted publisher:

- Provider: GitHub Actions
- Organization: `tetral-ai`
- Repository: `tetral-sdk-typescript`
- Workflow: `publish.yml`
- Environment: `npm-release`
- Allowed action: `npm publish`

Configure the GitHub `npm-release` environment to require maintainer approval
and to allow deployments only from `main`. Future releases are then started by
manually dispatching the **Publish SDK** workflow from `main`; npm authenticates
the GitHub-hosted runner with OIDC and publishes provenance automatically.

After trusted publishing succeeds, configure npm publishing access to require
two-factor authentication and disallow traditional publish tokens.
