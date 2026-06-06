// Structural conformance check for the corpus: every manifest.json validates against
// the v1.0 manifest schema and every expected-verdict.json against the verdict schema.
// Run: node corpus/tools/validate.mjs   (build @attest/schema first)
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const schemaEntry = join(root, "..", "packages", "schema", "dist", "index.js");

if (!existsSync(schemaEntry)) {
  console.error(`@attest/schema not built — expected ${schemaEntry}. Run its build first.`);
  process.exit(2);
}

const { createManifestValidator, createVerdictValidator } = await import(schemaEntry);
const manifestV = createManifestValidator();
const verdictV = createVerdictValidator();

let failures = 0;
let checked = 0;

function check(label, validator, file) {
  const json = JSON.parse(readFileSync(file, "utf-8"));
  const res = validator.validate(json);
  checked++;
  if (!res.ok) {
    failures++;
    console.error(`✗ ${label}: ${file}`);
    for (const e of res.errors) console.error(`    ${e.path} ${e.code} — ${e.message}`);
  }
}

for (const lang of ["ts", "py", "go"]) {
  const casesDir = join(root, lang, "cases");
  if (!existsSync(casesDir)) continue;
  for (const c of readdirSync(casesDir)) {
    const dir = join(casesDir, c);
    const manifest = join(dir, "manifest.json");
    const verdict = join(dir, "expected-verdict.json");
    if (existsSync(manifest)) check(`manifest ${lang}/${c}`, manifestV, manifest);
    if (existsSync(verdict)) check(`verdict  ${lang}/${c}`, verdictV, verdict);
  }
}

if (failures > 0) {
  console.error(`\n${failures} of ${checked} corpus artifacts failed schema validation.`);
  process.exit(1);
}
console.log(`✓ all ${checked} corpus manifests + verdicts conform to @attest/schema.`);
