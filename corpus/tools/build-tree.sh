#!/usr/bin/env bash
# Materialize a case's working tree: base overlaid with the case overlay.
# Usage: build-tree.sh <base-dir> <overlay-dir> <out-dir>
set -euo pipefail

base="$1"
overlay="$2"
out="$3"

rm -rf "$out"
mkdir -p "$out"
cp -a "$base/." "$out/"
if [ -d "$overlay" ]; then
  cp -a "$overlay/." "$out/"
fi
