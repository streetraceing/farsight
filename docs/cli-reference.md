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

| Option                | Description                                  | Default                   | Rules                                        |
| --------------------- | -------------------------------------------- | ------------------------- | -------------------------------------------- |
| `--cwd <path>`        | Directory to analyze                         | Current working directory | The path is resolved before analysis         |
| `--since <days>`      | Git history window                           | `90`                      | Integer from `1` to `3650`                   |
| `--top <count>`       | Maximum contributors in the report           | `10`                      | Integer from `1` to `100`                    |
| `-i`, `--interactive` | Open the keyboard-driven terminal interface  | Off                       | Requires a TTY; cannot be combined with JSON |
| `--json`              | Print the complete report as JSON            | Off                       | Cannot be combined with interactive mode     |
| `--no-network`        | Do not run the npm registry dependency check | Off                       | All local analysis still runs                |
| `-v`, `--version`     | Print the installed package version          | -                         | Does not analyze a project                   |
| `-h`, `--help`        | Print usage help                             | -                         | Does not analyze a project                   |

## Interactive controls

Run the interface with:

```bash
farsight --interactive
```

| Key                 | Action                         |
| ------------------- | ------------------------------ |
| Left / Right / Tab  | Switch report sections         |
| Up / Down           | Scroll one line                |
| Page Up / Page Down | Scroll one page                |
| Home / End          | Jump to the beginning or end   |
| `1`-`9`             | Open a report section directly |
| `r`                 | Re-run the complete analysis   |
| `q` / Escape        | Close the interface            |

The interface uses an alternate terminal screen and restores the original terminal state when it exits.

## Examples

Analyze the current directory:

```bash
farsight
```

Open an interactive report without an npm registry request:

```bash
farsight --interactive --no-network
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
