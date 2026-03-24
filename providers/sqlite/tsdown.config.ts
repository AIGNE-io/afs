import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["./src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  unbundle: true,
  skipNodeModulesBundle: true,
  exports: {
    all: true,
  },
});
