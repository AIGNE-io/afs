import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["./src/index.ts", "./src/utils/*", "./src/provider/index.ts", "./src/loader/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  unbundle: true,
  skipNodeModulesBundle: true,
  exports: {
    all: true,
  },
  external: ["bun:test", "@aigne/afs-trust"],
});
