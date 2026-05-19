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

## Commands

```bash
konby install [--shell zsh|bash] [--board <name>] [--dir <path>] [--preset <name>]
konby board new <path> [--preset <name>] [--workspace <path>] [--force]
konby board show [--board <path>]
konby task add --title "..." [--board <path>]
konby session new --agent <agent> --task <task-file> [--board <path>]
konby dispatch [--board <path>]
konby dispatchd [--log-file <path>] [--board <path>]

dispatch [--board <path>]
dispatchd [--log-file <path>] [--board <path>]
board_show [path] [--board <path>]
task_add [--tasks <tasks_dir_rel>] ... [--board <path>]
session_new --agent <agent> --task <task-file> [--board <path>]
```

## Presets

- presets live under `presets/<preset-name>/`
- default preset is `swe`
- each preset must contain:
  - `dispatch.yml`
  - `task.schema.yml`
  - `agents/*.yml`

## What `konby board new <path>` does

- creates board in `<path>` (relative path is resolved from current directory)
- creates:
  - `tasks/`
  - `agents/`
  - `transcripts/`
  - `dispatch.yml`
  - `task.schema.yml`
  - `agents/*.yml` from selected preset
