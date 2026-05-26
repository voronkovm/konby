コンベヤ [konbeya], or konby for short, meaning "conveyer".

## Install

For users who do not have any local `konby` files yet:

```bash
npm i -g konby
konby install --board my-board --preset swe
```

Alternative (without global install, after npm publish):

```bash
npx -y konby install --board my-board --preset swe
```

For Codex sandbox runs, allow `konby` in `~/.codex/rules/default.rules`:

```rules
prefix_rule(pattern = ["konby"], decision = "allow")
```

## Commands

```bash
konby install [--shell zsh|bash] [--board <name>] [--dir <path>] [--preset <name>]
konby board new <path> [--preset <name>] [--workspace <path>] [--force]
konby board show [--board <path>]
konby task add --title "..." [--board <path>]
konby task move <task-file> [--column <column>] [--status <status>] [--assignee <assignee>] [--comment "<comment>"] [--attachment <path>] [--author <slug>]
konby task comment <task-file> "<comment>"
konby task pr <task-file>
konby task merge <task-file>
konby session new --agent <agent-file> --task <task-file> [--board <path>] [--transcript <path>]
konby dispatch [--board <path>]
konby dispatchd [--log-file <path>] [--board <path>]

dispatch [--board <path>]
dispatchd [--log-file <path>] [--board <path>]
board_show [path] [--board <path>]
task_add [--tasks <tasks_dir_rel>] ... [--board <path>]
task_move <task-file> [--column <column>] [--status <status>] [--assignee <assignee>] [--comment "<comment>"] [--attachment <path>] [--author <slug>]
task_comment <task-file> "<comment>"
session_new --agent <agent-file> --task <task-file> [--board <path>] [--transcript <path>]
```

## Presets

- presets live under `presets/<preset-name>/`
- default preset is `swe`
- each preset must contain:
  - `dispatch.yaml`
  - `task.schema.yaml`
  - `agents/*.yaml`

## What `konby board new <path>` does

- creates board in `<path>` (relative path is resolved from current directory)
- creates:
  - `tasks/`
  - `agents/`
  - `transcripts/`
  - `dispatch.yaml`
  - `task.schema.yaml`
  - `agents/*.yaml` from selected preset
