# Report guide

[Documentation home](./README.md) | [Getting started](./getting-started.md) | [CLI reference](./cli-reference.md)

Farsight prints a complete human-readable report by default. Add `--interactive` to explore the same report one section at a time, or `--json` to receive structured data.

## Overview and project

The report starts with a compact overview of project type, package metadata, source size, dependency state, and Git totals. The Project section then shows the detected package manager, traits, project root, visibility, generation time, and primary source languages.

Farsight uses `package.json`, lockfiles, selected dependency names, configuration files, and source extensions to estimate the project type. The result is intentionally heuristic and is most useful for quickly orienting yourself in an unfamiliar repository.

## Dependencies

The Dependencies section counts direct runtime, development, peer, and optional dependencies. With network checks enabled, Farsight runs `npm outdated --json --long --depth=0` and displays every package returned by npm.

| Field    | Meaning                                                                                   |
| -------- | ----------------------------------------------------------------------------------------- |
| Declared | Version range from `package.json`                                                         |
| Current  | Installed version                                                                         |
| Wanted   | Newest version allowed by the declared range                                              |
| Latest   | Newest version published to the configured registry                                       |
| Status   | Whether an update is compatible with the declared range or needs a broader version change |

Use `--no-network` to skip this check. Farsight still reports the declared direct-dependency count.

## Code

The Code section reports physical lines and non-empty lines for supported source extensions. Its extension table includes the complete source breakdown, sorted by non-empty line count, with file totals and percentage shares.

To avoid counting generated output, Farsight ignores directories such as `node_modules`, `dist`, `build`, `coverage`, `.next`, `.nuxt`, and framework caches. Binary files and source files larger than 2 MiB are skipped.

## Git activity

Git statistics come from local, non-merge commits inside the selected `--since` window.

| Metric                | Meaning                                                       |
| --------------------- | ------------------------------------------------------------- |
| Non-merge commits     | Commits excluding merge commits                               |
| Active days           | Calendar days with at least one included commit               |
| Additions/deletions   | Changed lines from Git `numstat` data                         |
| Net change            | Additions minus deletions                                     |
| Top contributor share | Share of included commits made by the most active contributor |

The daily, weekly, and monthly tables include every active period in the selected window. They are displayed newest first and contain commits, additions, deletions, and net line change.

Weekly rows use an ISO week label such as `2026-W30` and include the calendar start and end dates. The start is Monday and the end is Sunday. Monthly rows include the first and last calendar day of the month.

The contributor table includes name, email, commits, active days, first and last included commit dates, line changes, and commit share. `--top` controls the maximum contributor rows.

Binary-file changes do not have line counts in Git and are not included in additions or deletions.

## Interactive mode

Run:

```bash
farsight --interactive
```

The interface separates the report into Overview, Project, Dependencies, Code, Git, Contributors, Daily, Weekly, and Monthly views. Switch views with the arrow keys, Tab, or number shortcuts. Scroll with the arrow or paging keys, press `r` to refresh the analysis, and press `q` or Escape to exit.

Interactive mode requires an attached terminal and cannot be combined with `--json`.

## JSON output

Use JSON for automation, CI, or historical storage:

```bash
npx @streetraceing/farsight --since=365 --json > farsight-report.json
```

The top-level `schemaVersion` identifies the JSON shape. Every Git period includes its display key and calendar boundaries:

```json
{
  "git": {
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

Farsight reads project files and Git history locally. It does not upload source code, Git history, or reports.

The only optional network operation is the installed `npm outdated` command. Pass `--no-network` to disable it. Downloading or updating Farsight through `npx` or `npm update --global` may still use the npm registry.
