#!/usr/bin/env bash
# scripts/demo.sh — reproduce the gotcha moment.
#
# Stage: an AI agent claimed it added both `login()` and `logout()` to
# `src/auth.ts`. The diff shows it only added `login()`. The agent's manifest
# is structurally valid but factually wrong. attest catches it; the human
# doesn't have to eyeball the diff.
#
# Usage:
#   ./scripts/demo.sh                # run the gotcha (lying case)
#   ./scripts/demo.sh honest         # run the positive case for contrast
#   ./scripts/demo.sh both           # both, in order
#
# Output is plain text on stdout so you can pipe it to asciinema, ffmpeg, or
# just copy it into a blog post. The expected exit code is 0 for the honest
# case and 1 for the lying case.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEMO_DIR="${DEMO_DIR:-$(mktemp -d)}"
BASE="$REPO_ROOT/corpus/ts/base"
CASE_DIR="$REPO_ROOT/corpus/ts/cases"
LOCAL_CLI="$REPO_ROOT/packages/cli/dist/index.js"
# Default: use the locally built CLI. Pass CLI="npx --yes @attest/cli@1.0.0"
# (or any other invocation) to override — useful when recording the demo
# against the published tarball from a clean machine.
if [ -z "${CLI:-}" ] && [ -x "$LOCAL_CLI" ]; then
  CLI="node $LOCAL_CLI"
fi

color() {
  if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
    printf '\033[%sm%s\033[0m' "$1" "$2"
  else
    printf '%s' "$2"
  fi
}

stage() {
  printf '\n%s\n' "$(color '1;34' "── $* ──")"
}

materialise() {
  stage "Materialise the fixture repo in $DEMO_DIR"
  # Each case gets a fresh directory so the runs are independent.
  DEMO_DIR="$(mktemp -d)"
  cp -a "$BASE/." "$DEMO_DIR/"
  (
    cd "$DEMO_DIR"
    git init -q
    git -c user.email=demo@attest.dev -c user.name=demo add -A
    git -c user.email=demo@attest.dev -c user.name=demo commit -qm base 2>/dev/null || true
  )
}

run_case() {
  local case_name="$1"
  local label="$2"
  local diff="$3"
  local manifest="$4"
  local expect_exit="$5"
  local expect_label="$6"

  stage "Manifest — what the agent claims ($case_name)"
  cat "$manifest"

  stage "Diff — what the agent actually changed"
  cat "$diff"

  stage "Run: $CLI verify --manifest ... --diff ... --repo-root $DEMO_DIR"
  local out exit
  set +e
  out=$($CLI verify \
      --manifest "$manifest" \
      --diff "$diff" \
      --repo-root "$DEMO_DIR" \
      --format human 2>&1)
  exit=$?
  set -e
  printf '%s\n' "$out"
  printf '\nexit code: %s (expected %s — %s)\n' "$exit" "$expect_exit" "$expect_label"
  if [ "$exit" = "$expect_exit" ]; then
    color '1;32' "✓ matches expectation\n"
  else
    color '1;31' "✗ unexpected exit code\n"
    return 1
  fi
}

honest() {
  stage "The honest case — agent says it added login() and a test. The diff matches. expect: pass"
  materialise
  run_case "honest" "honest" \
    "$CASE_DIR/honest/change.diff" \
    "$CASE_DIR/honest/manifest.json" \
    "0" "pass"
}

lying() {
  stage "The lying case — agent says it added login() AND logout(). The diff only adds login(). expect: fail"
  materialise
  run_case "lying" "lying" \
    "$CASE_DIR/lying/change.diff" \
    "$CASE_DIR/lying/manifest.json" \
    "1" "fail (claim c3 — symbol 'logout' was not added)"
}

partial() {
  stage "The partial case — agent edited three files but only declared two. expect: fail (undeclared)"
  materialise
  run_case "partial" "partial" \
    "$CASE_DIR/partial/change.diff" \
    "$CASE_DIR/partial/manifest.json" \
    "1" "fail (undeclared change)"
}

case "${1:-lying}" in
  honest)  honest ;;
  lying)   lying ;;
  partial) partial ;;
  both)    honest; lying ;;
  all)     honest; lying; partial ;;
  *)
    echo "usage: $0 [honest|lying|partial|both|all]" >&2
    exit 64
    ;;
esac
