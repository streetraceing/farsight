# Farsight documentation

Farsight gives you a fast, local overview of a codebase: project type, direct dependencies, source-code size, and Git activity.

## Guides

| Guide                                        | Use it when you need to...                   |
| -------------------------------------------- | -------------------------------------------- |
| [Getting started](./getting-started.md)      | Install Farsight and run your first report   |
| [CLI reference](./cli-reference.md)          | Find an option, default value, or input rule |
| [Report guide](./report-guide.md)            | Understand console output and JSON fields    |
| [Development and releases](./development.md) | Work on Farsight itself or publish a release |

## Fastest path

```bash
npx @streetraceing/farsight --cwd /path/to/project
```

If you use Farsight frequently, install it globally instead:

```bash
npm install --global @streetraceing/farsight
farsight --cwd /path/to/project
```

## Principles

- **Local-first:** project files and Git history are read from your machine.
- **Useful by default:** a regular run produces complete readable tables for the last 90 days.
- **Keyboard-friendly:** `--interactive` provides a persistent project summary, stable tabs, rich color, section navigation, scrolling, and refresh controls.
- **Automation-ready:** `--json` exposes the complete report through a versioned schema.
- **Network-optional:** `--no-network` skips the npm registry dependency check.

Return to the [project README](../README.md).
