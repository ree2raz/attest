# Testing Guide — attest v0.1

This guide walks you through four layers of testing, from "does it build?" to "does it work on a real AI-produced change?". Run them in order and share what broke or felt wrong.

---

## Prerequisites

- Node.js ≥ 20
- pnpm ≥ 9 — install with `npm i -g pnpm` if missing

---

## Layer 1 — Build + automated tests (5 min)

This confirms nothing is broken in the codebase.

```bash
cd /path/to/code-review-tool   # wherever you cloned it

pnpm install
pnpm build
pnpm test
```

**Expected**: all three commands exit 0. `pnpm test` should print:

```
Tests  10 passed   (schema)
Tests  24 passed   (core)
Tests  25 passed   (detectors-ts)
Tests   6 passed   (cli)
```

If anything fails, copy the error output and share it.

---

## Layer 2 — Run the CLI against the built-in example (5 min)

The repo ships a ready-made scenario: an agent added a `/login` endpoint **without** adding authentication middleware.

```bash
# From the repo root
node packages/cli/dist/index.js verify \
  --manifest packages/cli/test/fixtures/golden-path/manifest.json \
  --diff     packages/cli/test/fixtures/golden-path/input.diff \
  --repo-root packages/cli/test/fixtures/golden-path
```

**Expected output** (exit code 1):

```
🤖 Agent: claude-code (claude-opus-4-7) · 5 tool calls · 1 files touched
📝 Task: Add login endpoint

📋 Declared changes (2):
  ✅ c1  endpoint POST /login in src/routes/auth.ts
  ❌ c2  no auth in chain at src/routes/auth.ts:POST /login

⚠️ Undeclared modifications (1):
  • src/routes/auth.ts — symbol `unlistedHelper` modified but not in any claim

🔍 Reviewer focus:
  1. c2 failed — authentication not detected
  2. undeclared change to `unlistedHelper`
```

**Try JSON output too:**

```bash
node packages/cli/dist/index.js verify \
  --manifest packages/cli/test/fixtures/golden-path/manifest.json \
  --diff     packages/cli/test/fixtures/golden-path/input.diff \
  --repo-root packages/cli/test/fixtures/golden-path \
  --format json | jq .
```

**Things to check:**
- Does the formatting look clear? Is anything confusing?
- Does the "Reviewer focus" section help you know what to look at?
- Run `echo $?` after the command — it should print `1` (issues found)

---

## Layer 3 — Write your own scenario (20 min)

This is the real test. Pick a small real or invented change and craft a manifest + diff for it.

### Scenario A — Agent got it right (expect exit 0)

Create a file `my-repo/src/utils.ts`:

```typescript
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
```

Create `my-manifest.json`:

```json
{
  "schema_version": "0.1",
  "session": {
    "agent": "claude-code",
    "model": "claude-opus-4-7",
    "session_id": "test-session-001",
    "started_at": "2026-05-26T10:00:00Z",
    "completed_at": "2026-05-26T10:01:00Z",
    "prompt_hash": "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "tool_calls_count": 2,
    "files_touched": ["src/utils.ts"]
  },
  "task": {
    "summary": "Add clamp utility function",
    "source": "user_prompt"
  },
  "claims": [
    {
      "id": "c1",
      "type": "add_symbol",
      "target": { "kind": "function", "path": "src/utils.ts", "symbol": "clamp" },
      "description": "Added clamp() utility",
      "verification_contract": { "check": "symbol_exists" }
    }
  ]
}
```

Create `my-changes.diff` (a minimal unified diff):

```diff
diff --git a/src/utils.ts b/src/utils.ts
new file mode 100644
index 0000000..abc1234
--- /dev/null
+++ b/src/utils.ts
@@ -0,0 +1,3 @@
+export function clamp(value: number, min: number, max: number): number {
+  return Math.min(Math.max(value, min), max);
+}
```

Run:

```bash
node /path/to/code-review-tool/packages/cli/dist/index.js verify \
  --manifest my-manifest.json \
  --diff     my-changes.diff \
  --repo-root my-repo
echo "Exit: $?"
```

**Expected**: `✅ c1` verified, exit 0.

---

### Scenario B — Agent claimed authentication it didn't add (expect exit 1)

Create `my-repo/src/routes/api.ts`:

```typescript
import express from "express";

const router = express.Router();

router.get("/profile", (req, res) => {
  res.json({ name: "Alice" });
});

export default router;
```

Create `my-manifest.json` with a claim that this route is authenticated:

```json
{
  "schema_version": "0.1",
  "session": {
    "agent": "claude-code",
    "model": "claude-opus-4-7",
    "session_id": "test-session-002",
    "started_at": "2026-05-26T10:00:00Z",
    "completed_at": "2026-05-26T10:02:00Z",
    "prompt_hash": "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    "tool_calls_count": 3,
    "files_touched": ["src/routes/api.ts"]
  },
  "task": {
    "summary": "Add protected profile endpoint",
    "source": "user_prompt"
  },
  "claims": [
    {
      "id": "c1",
      "type": "add_symbol",
      "target": { "kind": "endpoint", "path": "src/routes/api.ts", "symbol": "GET /profile" },
      "description": "Added GET /profile endpoint",
      "verification_contract": { "check": "symbol_exists" }
    },
    {
      "id": "c2",
      "type": "modify_behavior",
      "target": { "kind": "endpoint", "path": "src/routes/api.ts", "symbol": "GET /profile" },
      "description": "Profile endpoint requires authentication",
      "verification_contract": { "check": "behavior_present", "params": { "property": "authentication" } }
    }
  ]
}
```

Create the diff (adjust line count `+1,N` to match actual lines in the file):

```diff
diff --git a/src/routes/api.ts b/src/routes/api.ts
new file mode 100644
index 0000000..def5678
--- /dev/null
+++ b/src/routes/api.ts
@@ -0,0 +1,8 @@
+import express from "express";
+
+const router = express.Router();
+
+router.get("/profile", (req, res) => {
+  res.json({ name: "Alice" });
+});
+
```

**Expected**: `✅ c1`, `❌ c2`, Reviewer focus shows "c2 failed — authentication not detected", exit 1.

---

### Scenario C — Agent touched a file it didn't declare (expect exit 1)

Same as Scenario A, but also create `my-repo/src/helpers.ts` with any content:

```typescript
export const VERSION = "1.0.0";
```

And add `src/helpers.ts` to the diff but **not** to `files_touched` or `claims` in the manifest.

Add to your diff:

```diff
diff --git a/src/helpers.ts b/src/helpers.ts
new file mode 100644
index 0000000..fff9999
--- /dev/null
+++ b/src/helpers.ts
@@ -0,0 +1,1 @@
+export const VERSION = "1.0.0";
```

**Expected**: `✅ c1` verified, but `⚠️ Undeclared modifications` shows `src/helpers.ts`, exit 1.

---

## Layer 4 — Error handling (5 min)

**Missing manifest file** (expect exit 66 + clear error message):

```bash
node packages/cli/dist/index.js verify \
  --manifest does-not-exist.json \
  --diff     packages/cli/test/fixtures/golden-path/input.diff
echo "Exit: $?"
```

**Corrupt JSON manifest** — create `bad.json` containing `{ not valid json`:

```bash
echo '{ not valid json' > /tmp/bad.json
node packages/cli/dist/index.js verify \
  --manifest /tmp/bad.json \
  --diff     packages/cli/test/fixtures/golden-path/input.diff
echo "Exit: $?"
```

Expected: exit 65, error message about invalid JSON.

**Schema violation** — create `bad-manifest.json` missing required fields:

```bash
echo '{ "schema_version": "0.1" }' > /tmp/bad-manifest.json
node packages/cli/dist/index.js verify \
  --manifest /tmp/bad-manifest.json \
  --diff     packages/cli/test/fixtures/golden-path/input.diff
echo "Exit: $?"
```

Expected: exit 2, error message listing the missing fields.

---

## What to share as feedback

After running the above, please note:

1. **Any command that produced an unexpected result** — paste the command and full output
2. **Output that was confusing or hard to read** — quote the specific lines
3. **A scenario you tried that the tool got wrong** — describe what the code did vs. what the manifest claimed
4. **Any crash / stack trace** — paste the full error
5. **What was missing** — e.g., "I wanted to verify X but couldn't express it in the manifest"

The manifest format reference is in `docs/SCHEMA_V0.1.md` if you want to try more complex scenarios (multiple files, `signature_matches`, `test_covers`, etc.).
