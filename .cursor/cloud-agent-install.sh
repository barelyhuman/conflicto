#!/usr/bin/env bash
set -euo pipefail

export PATH="${HOME}/.local/bin:${PATH}"
eval "$(mise activate bash)"

mise trust
mise install
mise run setup
