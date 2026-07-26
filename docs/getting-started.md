# Getting started

[Documentation home](./README.md) | [CLI reference](./cli-reference.md) | [Report guide](./report-guide.md)

Farsight requires Node.js 18 or later and analyzes a project directory on your local machine.

## Choose an installation method

### Run once with npx

Use `npx` when you want the latest published version without installing a global command:

```bash
npx @streetraceing/farsight --cwd /path/to/project
```

Omit `--cwd` to analyze the current directory:

```bash
npx @streetraceing/farsight
```

### Install globally

Use a global installation when Farsight is part of your regular workflow:

```bash
npm install --global @streetraceing/farsight
```

Then run the short command from any folder:

```bash
farsight --cwd /path/to/project
```

Update the global command later with:

```bash
npm update --global @streetraceing/farsight
```

## Your first report

Run Farsight in a repository that contains a `package.json` file and Git history:

```bash
npx @streetraceing/farsight --cwd /path/to/project
```

The report will show the project classification, dependency freshness, code metrics, Git activity, contributors, and recent daily, weekly, and monthly trends.

## Useful first commands

Analyze the previous year of Git activity:

```bash
npx @streetraceing/farsight --since=365
```

Show up to 20 contributors:

```bash
npx @streetraceing/farsight --top=20
```

Skip the npm registry check when offline or when you only need local data:

```bash
npx @streetraceing/farsight --no-network
```

Save structured data for a script or CI job:

```bash
npx @streetraceing/farsight --json > farsight-report.json
```

Next: see the [CLI reference](./cli-reference.md) for every option, or the [report guide](./report-guide.md) to understand the results.
