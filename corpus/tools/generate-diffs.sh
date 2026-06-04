#!/usr/bin/env bash
# (Re)generate change.diff for every case as git diff(base -> base+overlay).
# Diffs use repo-relative a/<path> b/<path> prefixes and correct hunk headers.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"

for lang in ts py go; do
  base="$root/$lang/base"
  [ -d "$base" ] || continue
  for casedir in "$root/$lang/cases"/*/; do
    [ -d "$casedir" ] || continue
    overlay="${casedir}overlay"
    tmp="$(mktemp -d)"
    cp -a "$base/." "$tmp/"
    git -C "$tmp" init -q
    git -C "$tmp" add -A
    git -C "$tmp" -c user.email=corpus@attest.dev -c user.name=corpus commit -qm base
    if [ -d "$overlay" ]; then
      cp -a "$overlay/." "$tmp/"
    fi
    git -C "$tmp" add -A
    # Force conventional a/ b/ prefixes regardless of the user's global git config
    # (e.g. diff.mnemonicPrefix), so the diff parser sees a stable format.
    git -C "$tmp" \
      -c user.email=corpus@attest.dev -c user.name=corpus \
      -c diff.mnemonicPrefix=false -c diff.noprefix=false \
      diff --cached --no-color --src-prefix=a/ --dst-prefix=b/ >"${casedir}change.diff"
    rm -rf "$tmp"
    echo "generated ${casedir}change.diff"
  done
done
