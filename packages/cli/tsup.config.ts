import { defineConfig } from "tsup";

// WU11: bundle the @attest/* workspace deps into the CLI output so the
// published tarball is self-contained (no `workspace:*` resolution at install
// time). web-tree-sitter stays external — it ships prebuilt wasm bindings
// shipped as CJS, and bundling it causes "Dynamic require of 'fs' is not
// supported" at runtime in the ESM output. The published package depends on
// it as a real npm dep (declared in package.json#dependencies). clipanion is
// also external so the runtime can share it with other packages.
export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: true,
  outDir: "dist",
  banner: {
    js: "#!/usr/bin/env node",
  },
  clean: true,
  noExternal: [/^@attest\//],
  external: ["web-tree-sitter"],
  splitting: false,
  target: "node20",
  minify: false,
  sourcemap: true,
});
