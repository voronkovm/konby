# Repository Guidelines

## Project Structure & Module Organization

Konby is a Node.js CLI package. Executable entry points live in `bin/`, with the main package binary at `bin/konby` and focused command shims such as `bin/task_add` and `bin/board_show`. Shared command logic and helpers live in `lib/`, one module per command or domain area, for example `lib/task_add.js`, `lib/yaml.js`, and `lib/worktree.js`. Preset board templates live under `presets/<preset-name>/`; the default `swe` preset includes `dispatch.yaml`, `task.schema.yaml`, and `agents/*.yaml`. Tests are grouped by scope in `test/unit/`, `test/integration/`, and `test/e2e/`.

## Build, Test, and Development Commands

- `npm test`: runs unit and integration tests with Node's built-in test runner and `c8` coverage.
- `npm run test:e2e`: runs end-to-end tests in `test/e2e/**/*.test.js`.
- `node bin/konby --help`: smoke-test the CLI entry point locally.
- `node bin/konby board new /tmp/example-board --preset swe`: create a sample board for manual testing.

There is no separate build step; published files are plain JavaScript plus presets.

## Coding Style & Naming Conventions

Use CommonJS (`require`, `module.exports`) and keep modules small and command-focused. Follow the existing style: two-space indentation, semicolons, single quotes, and descriptive camelCase function names. File names use lowercase snake_case matching the command or domain, such as `task_move.js` and `tmux_sessions.js`. Prefer pure helpers that accept injected dependencies, clocks, or paths when testing would otherwise require global state.

## Testing Guidelines

Tests use `node:test` and `node:assert/strict`. Name test files `*.test.js` and place them in the matching scope directory. Add unit tests for pure parsing, validation, and formatting behavior; add integration or e2e tests for filesystem workflows and CLI command behavior. Coverage is collected for `lib/**/*.js` and `bin/*` through `c8`.

## Commit & Pull Request Guidelines

The current Git history does not establish a detailed commit convention; use short, imperative summaries such as `add task merge e2e coverage`. Pull requests should describe the user-facing change, list the commands run (`npm test`, `npm run test:e2e`), and include sample CLI output or screenshots only when behavior is difficult to review from code alone.

## Security & Configuration Tips

Do not commit local generated boards, transcripts, logs, or credentials. When testing sandbox usage, prefer temporary board paths under `/tmp` and avoid writing into a user's real workspace unless the test explicitly requires it.
