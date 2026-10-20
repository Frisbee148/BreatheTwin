#!/usr/bin/env bash
# Convenience root wrapper to launch BreathTwin package
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR/ABAY_LNMIIT/NSUT" && ./run.sh "$@"
