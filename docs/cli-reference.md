# CLI reference

[Documentation home](./README.md) | [Getting started](./getting-started.md) | [Report guide](./report-guide.md)

## Invocation

Use either command form:

```bash
npx @streetraceing/farsight [options]
```

```bash
farsight [options]
```

The second form requires a global installation:

```bash
npm install --global @streetraceing/farsight
```

## Options

| Option            | Description                                  | Default                   | Rules                                |
| ----------------- | -------------------------------------------- | ------------------------- | ------------------------------------ |
| `--cwd <path>`    | Directory to analyze                         | Current working directory | The path is resolved before analysis |
| `--since <days>`  | Git history window                           | `90`                      | Integer from `1` to `3650`           |
| `--top <count>`   | Maximum contributors in the console report   | `10`                      | Integer from `1` to `100`            |
| `--json`          | Print the complete report as JSON            | Off                       | Can be used with every other option  |
| `--no-network`    | Do not run the npm registry dependency check | Off                       | All local analysis still runs        |
| `-v`, `--version` | Print the installed package version          | -                         | Does not analyze a project           |
| `-h`, `--help`    | Print usage help                             | -                         | Does not analyze a project           |

## Examples

Analyze the current directory:

```bash
farsight
```

Analyze a different project with 180 days of Git history:

```bash
npx @streetraceing/farsight --cwd ../api --since=180
```

Produce JSON without making an `npm outdated` request:

```bash
farsight --json --no-network
```

Show the command help:

```bash
npx @streetraceing/farsight --help
```

## Exit behavior

Farsight exits with code `0` after a successful analysis. Invalid options, unreadable project files, malformed `package.json`, or unrecoverable system errors result in a non-zero exit code and an error message on standard error.

Network and Git availability are handled as report data where possible. For example, an offline registry check or a directory without Git history produces a report with a warning instead of failing the entire analysis.
