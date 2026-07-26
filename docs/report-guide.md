# Report guide

[Documentation home](./README.md) | [Getting started](./getting-started.md) | [CLI reference](./cli-reference.md)

Farsight prints a human-readable report by default. Add `--json` to receive the same information as structured data.

## Project

The Project section identifies the most likely project type and package manager. Farsight uses `package.json`, lockfiles, selected dependency names, configuration files, and source extensions to make this estimate.

The result is intentionally heuristic. It is most useful as a quick orientation tool, especially for an unfamiliar repository.

## Dependencies

The Dependencies section counts direct runtime, development, peer, and optional dependencies. With network checks enabled, Farsight runs `npm outdated --json --long --depth=0` and displays packages that need attention.

| Field   | Meaning                                                                                   |
| ------- | ----------------------------------------------------------------------------------------- |
| Current | Installed version                                                                         |
| Wanted  | Newest version allowed by the declared range                                              |
| Latest  | Newest version published to the configured registry                                       |
| Status  | Whether an update is compatible with the declared range or needs a broader version change |

Use `--no-network` to skip this check. Farsight still reports the declared direct-dependency count.

## Code

The Code section reports physical lines and non-empty lines for supported source extensions. It also groups the results by file extension.

To avoid counting generated output, Farsight ignores directories such as `node_modules`, `dist`, `build`, `coverage`, `.next`, `.nuxt`, and framework caches. Binary files and source files larger than 2 MiB are skipped.

## Git activity

Git statistics come from local, non-merge commits inside the selected `--since` window.

| Metric                | Meaning                                                       |
| --------------------- | ------------------------------------------------------------- |
| Non-merge commits     | Commits excluding merge commits                               |
| Active days           | Calendar days with at least one included commit               |
| Changes               | Added and deleted lines from Git `numstat` data               |
| Top contributor share | Share of included commits made by the most active contributor |

The timeline tables show active periods only:

- **Daily activity:** up to the latest 14 active days;
- **Weekly activity:** up to the latest 12 active weeks, using ISO week labels such as `2026-W30`;
- **Monthly activity:** up to the latest 12 active months.

Each row contains commits, added lines, deleted lines, and net line change. Binary-file changes do not have line counts in Git and are not included in additions or deletions.

## JSON output

Use JSON for automation, CI, or historical storage:

```bash
npx @streetraceing/farsight --since=365 --json > farsight-report.json
```

The top-level `schemaVersion` identifies the JSON shape. Git history is available in complete arrays for the requested window:

```json
{
  "git": {
    "daily": [
      {
        "period": "2026-07-20",
        "commits": 3,
        "additions": 128,
        "deletions": 22
      }
    ],
    "weekly": [
      {
        "period": "2026-W30",
        "commits": 12,
        "additions": 640,
        "deletions": 105
      }
    ],
    "monthly": [
      {
        "period": "2026-07",
        "commits": 28,
        "additions": 1480,
        "deletions": 312
      }
    ]
  }
}
```

Unlike the console output, these arrays include every active day, week, or month in the selected period.

## Privacy and network access

Farsight reads project files and Git history locally. It does not upload source code, Git history, or reports.

The only optional network operation is the installed `npm outdated` command. Pass `--no-network` to disable it. Downloading or updating Farsight through `npx` or `npm update --global` may still use the npm registry.
