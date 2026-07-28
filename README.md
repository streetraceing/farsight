# Farsight

[![npm version](https://img.shields.io/npm/v/@streetraceing/farsight?logo=npm&label=npm)](https://www.npmjs.com/package/@streetraceing/farsight)
[![Node.js 18+](https://img.shields.io/badge/node-%3E%3D18-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

**Fast project intelligence from your terminal.**

Farsight analyzes a local project and produces a clear report about its structure, dependencies, source code, and Git activity. Use it before a handoff, a technical review, a dependency update, or whenever you need a quick picture of an unfamiliar codebase.

## Contents

- [Quick start](#quick-start)
- [Documentation](#documentation)
- [What Farsight analyzes](#what-farsight-analyzes)
- [Command reference](#command-reference)
- [Examples](#examples)
- [Understanding the report](#understanding-the-report)
- [JSON output](#json-output)
- [Privacy and network access](#privacy-and-network-access)
- [Development](#development)
- [Limitations](#limitations)
- [License](#license)

## Quick start

Farsight requires Node.js 18 or later.

### Run with npx

Analyze the current directory without a global installation:

```bash
npx @streetraceing/farsight
```

Analyze another project:

```bash
npx @streetraceing/farsight --cwd /path/to/project
```

### Install globally

Install Farsight once to make the `farsight` command available in every terminal:

```bash
npm install --global @streetraceing/farsight
farsight --cwd /path/to/project
```

Update a global installation with:

```bash
npm update --global @streetraceing/farsight
```

## Documentation

The complete documentation is available in [`docs/`](./docs/README.md):

| Guide                                             | Description                                                        |
| ------------------------------------------------- | ------------------------------------------------------------------ |
| [Getting started](./docs/getting-started.md)      | Install Farsight with `npx` or globally, then run a first analysis |
| [CLI reference](./docs/cli-reference.md)          | Every option, default, and validation rule                         |
| [Report guide](./docs/report-guide.md)            | How to interpret project, dependency, code, Git, and JSON data     |
| [Development and releases](./docs/development.md) | Local development, validation, package testing, and npm publishing |

## What Farsight analyzes

| Area         | What you get                                                                                        |
| ------------ | --------------------------------------------------------------------------------------------------- |
| Project      | Ecosystem, framework, application kind, confidence, detector evidence, toolchain, and languages     |
| Dependencies | Direct dependency count and available updates from `npm outdated`                                   |
| Code         | Source-file count, physical and non-empty lines, plus a language breakdown                          |
| Git          | Branch, remote, contributors, line changes, and complete daily, weekly, and monthly activity tables |

Farsight recognizes multi-language projects and native toolchains. Detection includes Tauri, Rust/Cargo, .NET and C#, Python, Go, Java/Kotlin, Flutter, PHP, Ruby, Swift, Godot, C/C++, and a broad set of Node.js frameworks such as Next.js, Vite, React, Vue, Angular, Astro, NestJS, and Electron.

## Command reference

```text
npx @streetraceing/farsight [options]
# or, after a global installation:
farsight [options]
```

| Option                | Description                                 | Default           |
| --------------------- | ------------------------------------------- | ----------------- |
| `--cwd <path>`        | Analyze a project in another directory      | Current directory |
| `--since <days>`      | Git activity window                         | `90`              |
| `--top <count>`       | Maximum number of contributors to display   | `10`              |
| `-i`, `--interactive` | Open the keyboard-driven terminal interface | `false`           |
| `--json`              | Print a machine-readable JSON report        | `false`           |
| `--no-network`        | Skip the npm registry dependency check      | `false`           |
| `-v`, `--version`     | Print the installed Farsight version        | —                 |
| `-h`, `--help`        | Print the command help                      | —                 |

## Examples

### Review the project in the current directory

```bash
npx @streetraceing/farsight
```

After a global installation, the same command is:

```bash
farsight
```

### Analyze a project from another folder

```bash
npx @streetraceing/farsight --cwd ../my-app
```

### Inspect a full year of Git activity

```bash
npx @streetraceing/farsight --since=365 --top=20
```

### Explore the report interactively

```bash
npx @streetraceing/farsight --interactive
```

The interactive header keeps the project type, ecosystem, code size, dependency state, branch, commits, and contributor count visible while you scroll. Use Left/Right or Tab to switch sections, Up/Down and paging keys to scroll, `1`-`9` or `0` to jump directly, `r` to refresh, and `q` or Escape to exit.

### Work without an npm registry check

```bash
npx @streetraceing/farsight --no-network
```

### Save the complete report for tooling or CI

```bash
npx @streetraceing/farsight --json > farsight-report.json
```

## Understanding the report

### Project

Farsight combines package manifests, workspace files, framework configuration, dependency names, project files, and source extensions to estimate the project type. The report includes the ecosystem, framework, application kind, confidence level, detected files, and concrete evidence behind the classification. It recognizes mixed projects such as Tauri as Rust plus JavaScript instead of reducing them to a single package ecosystem. Detection remains heuristic and is not a replacement for project documentation.

### Dependencies

Farsight reports direct runtime, development, peer, and optional dependencies. When network checks are enabled, it runs `npm outdated --depth=0` and compares the installed, wanted, and latest versions.

### Code

Code metrics include physical and non-empty lines across supported source extensions. Generated and dependency directories such as `node_modules`, `dist`, `build`, coverage output, and framework caches are excluded. Files larger than 2 MiB and binary files are skipped.

### Git activity

Git statistics are calculated from local, non-merge commits in the selected `--since` window. The report includes:

- total commits, active days, contributors, additions, and deletions;
- the top contributors by commit count;
- every active day, ISO week, and month in the selected window, each with commits and line changes.

Weekly rows include the ISO week label plus its Monday start date and Sunday end date. Monthly rows also include their calendar boundaries. The newest period is shown first.

## JSON output

Use `--json` when consuming Farsight from scripts, CI, dashboards, or another tool:

```bash
npx @streetraceing/farsight --since=365 --json
```

The report has a versioned schema and includes full time-series data:

```json
{
  "schemaVersion": 1,
  "project": {
    "primary": "Tauri desktop application",
    "ecosystem": "Rust + JavaScript",
    "framework": "Tauri",
    "kind": "desktop application",
    "packageManager": "pnpm + Cargo",
    "confidence": "high",
    "detectedFiles": ["src-tauri/tauri.conf.json", "src-tauri/Cargo.toml"],
    "signals": [
      {
        "label": "Framework",
        "detail": "Tauri desktop shell detected",
        "source": "src-tauri/tauri.conf.json"
      }
    ]
  },
  "git": {
    "commits": 42,
    "additions": 2140,
    "deletions": 608,
    "daily": [
      {
        "period": "2026-07-20",
        "startDate": "2026-07-20",
        "endDate": "2026-07-20",
        "commits": 3,
        "additions": 128,
        "deletions": 22
      }
    ],
    "weekly": [
      {
        "period": "2026-W30",
        "startDate": "2026-07-20",
        "endDate": "2026-07-26",
        "commits": 12,
        "additions": 640,
        "deletions": 105
      }
    ],
    "monthly": [
      {
        "period": "2026-07",
        "startDate": "2026-07-01",
        "endDate": "2026-07-31",
        "commits": 28,
        "additions": 1480,
        "deletions": 312
      }
    ]
  }
}
```

## Privacy and network access

Farsight reads source files and Git history from the directory you select. It does not send project content, Git history, or report data to an external service.

The only optional network operation is the installed `npm outdated` command used for dependency freshness. Pass `--no-network` to skip it. The npm client may still need network access when it first downloads or updates Farsight.

## Development

Install the project dependencies and run the TypeScript source directly:

```bash
npm install
npm run dev -- --cwd /path/to/project
```

Run the complete validation suite:

```bash
npm run check
```

Useful maintenance commands:

```bash
npm run typecheck
npm test
npm run build
npm run pack:check
```

To test the exact package archive locally:

```bash
npm pack
npx --yes --package=/absolute/path/to/streetraceing-farsight-<version>.tgz farsight --no-network
```

### Publishing

After validating the package and authenticating with npm, create a version and publish the public scoped package:

```bash
npm run npm:patch
npm run npm:publish
```

The publish hook runs type checks, tests, the production build, and a package-content check before release.

## Limitations

- Project-type detection is heuristic and may not identify every technology or architecture.
- Line counts measure physical and non-empty lines, not AST-based SLOC.
- Dependency freshness depends on your local npm configuration, registry access, and authorization.
- Git line statistics come from `git log --numstat`; binary-file changes do not have line counts.
- Commit and churn metrics describe repository activity, not individual productivity.

## License

[MIT](./LICENSE) © Farsight contributors.
