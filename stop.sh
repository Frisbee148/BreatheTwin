#!/usr/bin/env bash
# Convenience root wrapper to stop BreathTwin package
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR/ABAY_LNMIIT/NSUT" && ./stop.sh "$@"
