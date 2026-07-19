# Farsight

Farsight is a TypeScript command-line tool that gives a quick overview of a project:

- freshness of direct npm dependencies (`current`, `wanted`, and `latest`);
- physical and non-empty source lines;
- heuristic project-type detection;
- local Git activity and contributor statistics.

Requires Node.js 18 or later.

## Install and use

Once the package has been published, run it without a global install:

```bash
npx @streetraceing/farsight --cwd /path/to/project
```

Common options:

```bash
npx @streetraceing/farsight --cwd /path/to/project --json
npx @streetraceing/farsight --cwd /path/to/project --since=30 --top=5
npx @streetraceing/farsight --cwd /path/to/project --no-network
```

Run `npx @streetraceing/farsight --help` to see every option.

## Development

Install dependencies and run the TypeScript source directly:

```bash
npm install
npm run dev -- --cwd /path/to/project
```

Validate the project, run tests, and build the production CLI:

```bash
npm run check
```

Useful individual commands:

```bash
npm run typecheck
npm test
npm run build
npm start -- --cwd /path/to/project
```

TypeScript is compiled into `dist/`. The `bin` entry in `package.json` points to `dist/bin/farsight.js`, so package users only need Node.js, not TypeScript.

## Test the npm package locally

To test the exact package contents, create a tarball and run it in another project:

```bash
npm pack
npx --yes --package=/absolute/path/to/streetraceing-farsight-<version>.tgz farsight --no-network
```

Inspect the files that would be published without creating the tarball:

```bash
npm run pack:check
```

Only the compiled CLI, README, license, and package metadata are included. Tests and `node_modules` are excluded.

## MVP limitations

- LOC means physical and non-empty lines, not AST-based SLOC.
- Dependency analysis runs the locally installed `npm outdated`, so it uses the current `.npmrc`, registry, and authentication settings.
- Git metrics come from local history for the selected period. Commit and churn counts are not an objective measure of productivity.
