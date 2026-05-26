import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      include: ["src/authentication/**"],
      thresholds: {
        lines: 85,
      },
    },
  },
});
