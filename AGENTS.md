# AGENTS.md

Guidelines for AI coding agents working in this repository.

## Project overview

Farsight is a Node.js 18+ CLI (sources in `src/`, entry point `bin/farsight.ts`)
that analyzes a project directory and reports on project type
(`project-type.ts`), dependency freshness (`dependencies.ts`), source-line
metrics (`loc.ts`), and Git activity (`git.ts`). The report is rendered by
`render.ts` (static output) and `interactive.ts` (terminal UI). Validate your
work before finishing:

```bash
npm run check
```

## Commit messages

After finishing any set of changes, always end your response with a short
suggested commit message in Conventional Commits style:

```
<type>: <short summary>
```

- Types: `feat`, `fix`, `refactor`, `perf`, `docs`, `test`, `build`, `ci`,
  `style`, `chore`.
- The summary is lowercase, imperative, without a trailing period, and stays
  under about 72 characters.
- Suggest the message in chat. Do not run `git commit` unless the user asked
  for it.
- If the change set genuinely mixes concerns, prefer one line per logical
  change over a single vague message, and say so.

## Version policy

Never change the version yourself:

- Do not edit the `version` field in `package.json`.
- Do not run `npm version ...`, `npm run npm:patch|minor|major`, or
  `npm run npm:publish`.
- Do not include version changes in suggested commit messages.

Instead, after finishing changes, state in chat whether the change set
warrants a release, which bump you recommend, and why. Decide smartly, not
mechanically: many changes need no release at all.

| Change                                                                                                                   | Bump    |
| ------------------------------------------------------------------------------------------------------------------------ | ------- |
| Docs, comments, formatting, internal renames, metadata such as `description`, test-only changes                          | none    |
| Bug fixes or incorrect output that do not change the CLI surface or the JSON contract                                    | `patch` |
| New user-facing behavior: flags, report sections or views, JSON fields, newly detected project types, improved detection | `minor` |
| Breaking changes: removed or renamed flags, changed defaults, a new `schemaVersion`, dropped Node.js versions            | `major` |

If a change set falls into several rows, use the largest applicable bump. When
in doubt, say the bump is uncertain, explain both options, and let the
maintainer decide.
