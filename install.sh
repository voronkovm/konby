#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
BIN_DIR="$PROJECT_DIR/bin"
ZSHRC="$HOME/.zshrc"
LINE="export PATH=\"$BIN_DIR:\$PATH\""

if [[ ! -d "$BIN_DIR" ]]; then
  echo "Error: bin directory not found: $BIN_DIR" >&2
  exit 1
fi

if [[ ! -f "$ZSHRC" ]]; then
  touch "$ZSHRC"
fi

if grep -Fq "$LINE" "$ZSHRC"; then
  echo "PATH already configured in $ZSHRC"
else
  echo "$LINE" >> "$ZSHRC"
  echo "Added to $ZSHRC: $LINE"
fi

export PATH="$BIN_DIR:$PATH"
echo "PATH updated for current shell process."
echo "If command is not found in your current terminal, run: source ~/.zshrc"
