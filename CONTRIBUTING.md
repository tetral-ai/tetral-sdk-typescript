## Contributing to documentation

The documentation for this SDK lives at [platform.claude.com/docs/en/api/sdks/typescript](https://platform.claude.com/docs/en/api/sdks/typescript). To suggest changes, open an issue.

## Setting up the environment

This repository uses [`pnpm`](https://pnpm.io/).
Other package managers may work but are not officially supported for development.

To set up the repository, run:

```sh
$ pnpm install
$ pnpm build
```

This will install all the required dependencies and build output files to `dist/`.

## Modifying/Adding code

Most of the SDK is generated code. Modifications to code will be persisted between generations, but may
result in merge conflicts between manual patches and changes from the generator. The generator will never
modify the contents of the `src/lib/` and `examples/` directories.

## Adding and running examples

All files in the `examples/` directory are not modified by the generator and can be freely edited or added to.

```ts
// add an example to examples/<your-example>.ts

#!/usr/bin/env node
…
```

```sh
$ chmod +x examples/<your-example>.ts
# the example imports the package by name, which resolves to the built output, so build first
$ pnpm build
# run the example against your api (Node.js 22.18 or later runs TypeScript files directly)
$ node examples/<your-example>.ts
```

## Using the repository from source

If you’d like to use the repository from source, you can either install from git or link to a cloned repository:

To install via git:

```sh
$ npm install git+ssh://git@github.com:anthropics/anthropic-sdk-typescript.git
```

Alternatively, to link a local copy of the repo:

```sh
# Clone
$ git clone https://www.github.com/anthropics/anthropic-sdk-typescript
$ cd anthropic-sdk-typescript

# With yarn
$ yarn link
$ cd ../my-package
$ yarn link @anthropic-ai/sdk

# With pnpm
$ pnpm link --global
$ cd ../my-package
$ pnpm link --global @anthropic-ai/sdk
```

## Running tests

Most tests require you to [set up a mock server](https://github.com/dgellow/steady) against the OpenAPI spec to run the tests.

```sh
$ ./scripts/mock
```

```sh
$ pnpm run test
```

## Linting and formatting

This repository uses [prettier](https://www.npmjs.com/package/prettier) and
[eslint](https://www.npmjs.com/package/eslint) to format the code in the repository.

To lint:

```sh
$ pnpm lint
```

To format and fix all lint issues automatically:

```sh
$ pnpm fix
```

## Engine's OpenAPI file

`api/engine-v1.openapi.json` is the SDK's copy of Tetral Engine's OpenAPI file, byte for byte.
`api/engine-v1.source.json` names the Engine commit the copy was taken from and the Git blob ID of the file.
The SDK is checked against the copy and against nothing else of Engine: the Tetral contract tests check
every request they send and every answer they are given, `tests/engine-contract/` checks the hand-written
types, and the generated list in `COMPATIBILITY.md` is derived from it.

The copy is updated on the SDK's own schedule. A change to Engine's file changes nothing here until then.
To update it:

1. Take the file from the Engine repository at the commit you sync to, with a command that writes its
   bytes unchanged. In an Engine checkout:
   `git show <commit>:api/engine-v1.openapi.json > <SDK checkout>/api/engine-v1.openapi.json`.
2. Write that commit and the blob ID Engine has for the file at it to `api/engine-v1.source.json`. Take
   the blob ID from the Engine checkout, `git rev-parse <commit>:api/engine-v1.openapi.json`, and not
   from the copy: the test then fails if step 1 changed a byte.
3. Run `node scripts/compatibility-list.cjs` to rewrite the generated list in `COMPATIBILITY.md`.
4. Run the tests and fix what they show. A hand-written type follows the copy; a fixture of a contract
   test answers what the copy declares.
5. Read the hand-written sections of `COMPATIBILITY.md` and the unreleased entry of `CHANGELOG.md`
   against what changed in the copy. No test reads their prose.

The test in `tests/engine-contract/copy.test.ts` compares the copy's bytes with the recorded blob ID. It
reads nothing of Engine, so it cannot tell whether the recorded commit holds that blob; the command of
step 2 is that check.

At a release, the person releasing takes the copy from the Engine version the release is meant for. The
release names that version by the Engine commit its copy was taken from, which `api/engine-v1.source.json`
records and the generated list in `COMPATIBILITY.md` repeats, or by Engine's release tag once Engine tags
its releases.

## Publishing and releases

The Tetral fork releases `@tetral-ai/sdk` through the **Publish SDK** GitHub
Actions workflow. A release includes the npm package, an annotated Git tag
`v<version>`, and a GitHub Release, all tied to the same source commit.

1. Update `package.json`, `src/version.ts`, `.release-please-manifest.json`, and
   the version entry in `CHANGELOG.md` together in a PR. The same PR brings the
   copy of [Engine's OpenAPI file](#engines-openapi-file) to the Engine version
   the release is meant for.
2. Merge after required checks pass, then wait for CI on the resulting `main`
   commit to pass.
3. Run [Publish SDK](https://github.com/tetral-ai/tetral-sdk-typescript/actions/workflows/publish.yml)
   on `main` and approve the `npm-release` environment.
4. The workflow publishes the package, installs it from npm, verifies its signed
   provenance, CommonJS/ESM imports and public types, then creates the tag and
   GitHub Release. Its final summary identifies the version and source commit.

Prereleases such as `0.110.0-alpha.2` use the npm `alpha` dist-tag and GitHub
prereleases. Stable versions use npm `latest` and a normal GitHub Release.
A Git tag identifies an immutable source commit; an npm dist-tag is a movable
installation channel.

If a step fails, use **Re-run failed jobs** on the original workflow run. This
keeps the original source commit even if `main` has advanced. An already
published npm version is verified and reused; an existing matching Git tag or
Release is kept. A version or tag belonging to a different source commit stops
the workflow instead of being overwritten. Do not increment the version merely
to recover from a failure after npm publishing.

Authentication uses npm Trusted Publishing for organization `tetral-ai`,
repository `tetral-sdk-typescript`, workflow `publish.yml`, and environment
`npm-release`, with `npm publish` allowed. No long-lived npm token is needed.
The workflow token can read CI results and create Git tags and Releases.
The Git tag is attributed to `github-actions[bot]`; development commits retain
the contributor's Git identity.

`bin/publish-npm` is the low-level package upload step, not the complete release
entrypoint. Use the workflow for normal releases. Recovery tests run with
`node --test scripts/release.test.cjs` and are included in CI.
