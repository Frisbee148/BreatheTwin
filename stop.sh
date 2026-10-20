#!/usr/bin/env bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -d "$SCRIPT_DIR/ABAY_LNMIIT/NSUT" ]; then
  exec "$SCRIPT_DIR/ABAY_LNMIIT/NSUT/stop.sh" "$@"
else
  echo "Error: ABAY_LNMIIT/NSUT directory not found." >&2
  exit 1
fi
