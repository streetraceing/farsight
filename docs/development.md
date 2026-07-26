# Development and releases

[Documentation home](./README.md) | [Getting started](./getting-started.md) | [CLI reference](./cli-reference.md)

This guide is for contributors and maintainers of Farsight.

## Requirements

- Node.js 18 or later
- npm
- Git, for Git-analysis development and tests

## Install dependencies

```bash
npm install
```

## Run from source

Use the development command to execute TypeScript without producing a release build first:

```bash
npm run dev -- --cwd /path/to/project
```

To use a local report without contacting the npm registry:

```bash
npm run dev -- --cwd /path/to/project --no-network
```

## Validate changes

Run the complete validation suite before opening a pull request or publishing:

```bash
npm run check
```

This command performs type checking, runs the test suite, and builds the production package.

Useful individual commands:

```bash
npm run typecheck
npm test
npm run build
npm run pack:check
```

Format the repository with Prettier:

```bash
npm run prettier:write
```

## Test the package archive

Build an npm tarball and execute its `farsight` binary in another project:

```bash
npm pack
npx --yes --package=/absolute/path/to/streetraceing-farsight-<version>.tgz farsight --no-network
```

`npm run pack:check` is a faster way to inspect the files that will be included without creating the tarball.

## Release a new version

Make sure the working tree is ready, then run the appropriate semantic-version command:

```bash
npm run npm:patch
npm run npm:minor
npm run npm:major
```

Publish the scoped package:

```bash
npm run npm:publish
```

Publishing requires npm authentication and either interactive two-factor authentication or a granular access token that is allowed to publish. The `prepublishOnly` hook runs validation and verifies package contents before npm uploads the release.

## Contribution expectations

- Keep user-facing output and documentation in English.
- Add or update tests when changing analysis behavior.
- Run `npm run check` before submitting a change.
- Keep the README and the relevant page in `docs/` synchronized when changing CLI behavior.
