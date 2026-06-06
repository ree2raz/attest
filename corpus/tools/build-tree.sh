#!/usr/bin/env bash
# Materialize a case's verifier-ready base tree, committed to git so the runner's
# worktree (`git worktree add --detach HEAD`) starts at the pre-change state.
# Usage: build-tree.sh <base-dir> <out-dir>
set -euo pipefail

base="$1"
out="$2"

rm -rf "$out"
mkdir -p "$out"
cp -a "$base/." "$out/"
git -C "$out" init -q
git -C "$out" -c user.email=corpus@attest.dev -c user.name=corpus add -A
git -C "$out" -c user.email=corpus@attest.dev -c user.name=corpus commit -qm base
