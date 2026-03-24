import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["./src/index.ts", "./src/cli.ts", "./src/core/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  unbundle: true,
  skipNodeModulesBundle: true,
  noExternal: ["yargs-parser", "urlpattern-polyfill"],
  exports: {
    all: true,
  },
});
